"""The Agent's graph: take the question in, let the model read store and draft an answer,
fill the draft's slots, check it against what was read, and only then attach it.

    ingress -> read -> answer -> END
                        answer -> cite_start -> cite_wait (loops) -> cite_report -> END
    ingress -> propose -> END                          (a Propose button, no model)
    ingress -> propose_pipeline -> END                 (a Propose pipeline button, no model)

`answer` runs the model loop (`create_agent`, tools read store), renders the draft and
checks it (grounding.py). A draft that fails goes back once with what failed; a second
failure ends with the fixed "could not answer" line. When the checked answer asks for a
search and the guard lets it through, cite searches the journals (cite_flow.py): code
starts it, follows it and writes every sentence of what it found. The graph holds no
serving code and no checkpointer; the server supplies both.
"""

import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, HumanMessage, RemoveMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.message import REMOVE_ALL_MESSAGES

import cite_flow
import cite_input
import context
import pipeline_flow
import prompts
import store_writer
from cite_client import CiteBusy, CiteClient, CiteService
from cite_result import CiteResult
from grounding import problems_of, reads_from
from render import FIXED_LINES, Unfillable, as_text, failure, feature_name, render
from schemas import Answer, CitationRequest, Draft, DraftRef, Question, Ref, Statement
from settings import MAX_QUESTION_CHARS, load
from store_client import StoreClient, StoreError
from tools import CONTEXT_FOR, Handles, _with_merged, make_tools

STORE_FAILURES = {"unreachable": "store_unreachable", "refused": "store_refused"}


class AgentState(MessagesState):
    # The checked answer to the question whose message id is `answers`, as Studio renders
    # it (schemas.Answer). None while a question is being worked on.
    answer: dict[str, Any] | None
    answers: str | None
    # How many messages the thread held when the last turn ended.
    seen: int
    # The tools the model called for the last question, in order. For step lines and evals.
    tools: list[str]
    # What the grounding check found in each draft that was sent back. For traces and evals.
    blocked: list[list[str]]
    # What the Agent does for the question, in plain words, as it goes: set by `read`
    # (what it read, and what it is doing next) and by `answer` (all of it, done).
    # Studio shows them while it works; it reads the graph's values, which it always
    # receives.
    steps: list[dict[str, Any]]
    # What cite found in this thread (plan D4), kept until "Clear chat": `runs` (each
    # search, in order), `findings` (by handle, F1...), `pending` (a search waiting for
    # towns). Never cleared by a new question.
    cite: dict[str, Any]
    # The search the current question started, while it runs. Cleared by each question.
    cite_job: dict[str, Any] | None


def ingress(state: AgentState) -> dict:
    """Take in one question. Only a person's message may come from outside.

    The service has no sign-in, so anything can be posted to it. A system, tool or
    assistant message from outside is removed before a model could read it, and the
    previous turn's answer is cleared so it can never be shown against a new question.
    """
    new = state["messages"][state.get("seen") or 0 :]
    forged = [m for m in new if not isinstance(m, HumanMessage)]
    # A search still marked running when a new question comes in was stopped.
    cite = state.get("cite") or {}
    runs = list(cite.get("runs") or [])
    stopped = {}
    if runs and runs[-1].get("outcome") == "running":
        runs[-1] = {**runs[-1], "outcome": "stopped before it finished"}
        stopped = {"cite": {**cite, "runs": runs}}
    return {
        **stopped,
        "messages": [RemoveMessage(id=m.id) for m in forged],
        "answer": None,
        "answers": None,
        "tools": [],
        "blocked": [],
        "steps": [],
        "cite_job": None,
    }


def _canonical(feature_id: str | None) -> str | None:
    try:
        return str(uuid.UUID(str(feature_id))) if feature_id else feature_id
    except ValueError:
        return feature_id


def _question(message: HumanMessage) -> Question:
    """The question Studio sent. Raises ValueError if it is not one."""
    raw = message.additional_kwargs.get("question")
    question = Question.model_validate(raw) if raw else Question(words=str(message.content))
    for item in question.about:
        item.id = _canonical(item.id)
        if item.on and item.on.sectionId:
            item.on.sectionId = _canonical(item.on.sectionId)
    return question


def _prompt(question: Question, steering: dict[str, Any] | None = None) -> str:
    lines = [question.words, ""]
    if question.about:
        lines.append("Attached:")
        for item in question.about:
            where = f" on {item.on.model_dump(exclude_none=True)}" if item.on else ""
            if item.kind in ("claim", "citation") and item.on and item.on.sectionId:
                lines.append(
                    f"- a {item.kind}, id {item.id}, on the section {item.on.sectionId}"
                    + (f" ({item.on.attribute})" if item.on.attribute else "")
                    + ". It is in that section's result."
                )
            else:
                lines.append(f"- a {item.kind}, id {item.id}{where}")
    elif steering:
        lines.append(
            f"Nothing is attached. The latest search in this chat was about "
            f"{steering['name']} (id {steering['id']}): a message steering the search "
            "(other years, towns, not that value, another attribute) is about it."
        )
    else:
        lines.append("Nothing is attached.")
    return "\n".join(lines)


def _to_read(question: Question, steering: str | None = None) -> list[str]:
    """The features to read for what is attached: a section or pipeline itself, a claim's
    or citation's section. Each once, in the order attached. With nothing attached, the
    section the latest search was about (plan D9)."""
    if not question.about and steering:
        return [steering]
    ids: list[str] = []
    for item in question.about:
        fid = item.id if item.kind in ("section", "pipeline") else None
        if item.kind in ("claim", "citation") and item.on and item.on.sectionId:
            fid = item.on.sectionId
        if fid and fid not in ids:
            ids.append(fid)
    return ids


class _Prefetched:
    """Store, with the attached features already fetched: the slow part runs in
    parallel, while the tool still reads them one by one, so claim handles (C1, C2...)
    come out in the order attached and the reads stay inside the run's trace."""

    def __init__(self, store: StoreClient, ids: list[str]) -> None:
        self._store = store
        self._got: dict[str, Any] = {}
        self._fetch(ids)
        # The pipelines those sections are in: the model would read them next, for any
        # attribute a section does not hold. Read now, in the same parallel step.
        self.pipelines = list(
            dict.fromkeys(
                link["to_feature_id"]
                for got in self._got.values()
                if isinstance(got, dict) and got.get("kind") == "section"
                for link in got.get("links") or []
                if link["relation"] == "part_of"
                and link["status"] == "confirmed"
                and link["from_feature_id"] == got["id"]
                and link["to_feature_id"] not in ids
            )
        )
        self._fetch(self.pipelines)
        # Not attached: one store cannot read now is left to the model, not a failure.
        self.pipelines = [p for p in self.pipelines if isinstance(self._got.get(p), dict)]

    def _fetch(self, ids: list[str]) -> None:
        if ids:
            with ThreadPoolExecutor(max_workers=min(8, len(ids))) as pool:
                for fid, got in zip(ids, pool.map(self._try, ids), strict=True):
                    self._got[fid] = got

    @property
    def origin(self) -> StoreClient:
        """The store underneath, which outlives a question (context.py caches by it)."""
        return self._store

    def _try(self, fid: str) -> Any:
        try:
            return self._store.feature(fid)
        except StoreError as error:
            return error

    def feature(self, feature_id: str) -> dict[str, Any]:
        got = self._got.get(feature_id)  # kept: read_context reads it again
        if got is None:
            return self._store.feature(feature_id)
        if isinstance(got, StoreError):
            raise got
        return got

    def __getattr__(self, name: str) -> Any:
        return getattr(self._store, name)


def _read_attached(
    question: Question,
    read_feature: Any,
    read_context: Any,
    config: Any,
    pipelines: list[str] | None = None,
    steering: str | None = None,
) -> list[Any]:
    """Read everything attached before the model starts, as if the model had asked: one
    model turn fewer. Then the pipelines those sections are in, and the first sections'
    context. Raises StoreError."""
    first = _to_read(question, steering)
    ids = first + [p for p in pipelines or [] if p not in first]
    if not ids:
        return []
    sections = list(
        dict.fromkeys(
            i.id if i.kind == "section" else i.on.sectionId
            for i in question.about
            if (i.kind == "section" and i.id)
            or (i.kind in ("claim", "citation") and i.on and i.on.sectionId)
        )
    )
    calls = [
        {
            "name": "read_feature",
            "args": {"feature_id": fid},
            "id": f"read_{n}",
            "type": "tool_call",
        }
        for n, fid in enumerate(ids)
    ] + [
        {
            "name": "read_context",
            "args": {"section_id": fid},
            "id": f"context_{n}",
            "type": "tool_call",
        }
        for n, fid in enumerate(sections[:CONTEXT_FOR])
    ]
    tools = {"read_feature": read_feature, "read_context": read_context}
    results = [tools[call["name"]].invoke(call, config) for call in calls]
    return [AIMessage(content="", tool_calls=calls), *results]


def _all_gone(question: Question, artifacts: list[dict[str, Any]]) -> bool:
    """Every attached section or pipeline is one store no longer has. A claim or citation
    has no read of its own: it is found on its section."""
    attached = [i.id for i in question.about if i.id and i.kind in ("section", "pipeline")]
    gone = {a["not_found"] for a in artifacts if "not_found" in a}
    return bool(attached) and set(attached) <= gone


def _point_unknowns_at_the_attached_thing(draft: Draft, question: Question, read) -> None:
    """An unknown is about the one thing attached. When the model left out which, code
    names it: the attached section or pipeline, if it was read. The check still decides
    whether store really holds nothing there."""
    attached = [i.id for i in question.about if i.kind in ("section", "pipeline") and i.id]
    if len(attached) != 1 or attached[0] not in read.features:
        return
    for statement in draft.statements:
        if statement.kind == "unknown" and not any(r.type == "feature" for r in statement.refs):
            taken = {r.key for r in statement.refs}
            key = next(k for k in ("attached", "attached_1", "attached_2") if k not in taken)
            statement.refs.append(DraftRef(key=key, type="feature", id=attached[0]))


def _many(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


def read_words(sections: int, pipelines: int, others: int = 0) -> str:
    """ "Read 3 sections and 1 pipeline", never "Read 0 sections"."""
    parts = [
        _many(n, w)
        for n, w in ((sections, "section"), (pipelines, "pipeline"), (others, "feature"))
        if n
    ]
    return "Read " + " and ".join(parts) if parts else "Read nothing attached"


class _Steps:
    """What the Agent does for a question, in plain words, kept in the graph's state and
    on the reply: Studio shows them as a chain of thought. Says what was read, never what
    is true."""

    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def start(self, text: str) -> None:
        """A step under way; it is done when the next one starts."""
        self.finish_all()
        self.items.append({"text": text, "done": False})

    def add_done(self, text: str) -> None:
        self.items.append({"text": text, "done": True})

    def finish_all(self) -> list[dict[str, Any]]:
        for item in self.items:
            item["done"] = True
        return self.items

    def reads(self, artifacts: list[dict[str, Any]], attached: set[str]) -> None:
        """One step per thing read, or one for all of them when there are many."""
        features = [
            a["features"][0] for a in artifacts if a.get("features") and "context_of" not in a
        ]
        contexts = [a for a in artifacts if "context_of" in a]
        if len(features) > 4:
            sections = sum(1 for f in features if f.get("kind") == "section")
            lines = sum(1 for f in features if f.get("kind") == "line")
            self.add_done(read_words(sections, lines, len(features) - sections - lines))
        else:
            for f in features:
                pipeline = f.get("kind") == "line" and f["id"] not in attached
                name = feature_name(f)
                self.add_done(f"Read its pipeline, {name}" if pipeline else f"Read {name}")
        for a in contexts:
            self.add_done(f"Read what surrounds {feature_name(a['features'][0])}")


def _finish(
    answer: Answer,
    question: HumanMessage | None,
    tools: list[str],
    seen: int,
    blocked: list[list[str]] | None = None,
    steps: "_Steps | None" = None,
) -> dict:
    answer.checked = True
    return {
        "blocked": blocked or [],
        # The answer travels on its message too, so a reloaded thread shows every turn.
        "messages": [
            AIMessage(
                # One id from the start, so what streams and what is saved are one message.
                id=f"answer-{question.id}" if question is not None and question.id else None,
                content=as_text(answer),
                additional_kwargs={
                    "answer": answer.model_dump(),
                    "answers": question.id if question is not None else None,
                    "tools": tools,
                    "steps": steps.finish_all() if steps is not None else [],
                },
            )
        ],
        "answer": answer.model_dump(),
        "answers": question.id if question is not None else None,
        "tools": tools,
        "steps": steps.finish_all() if steps is not None else [],
        "seen": seen + 1,
    }


def _passes(error: Exception) -> bool:
    """A model error worth one more try: the connection dropped or timed out, or the
    model was rate-limited, overloaded or failed on its side."""
    import anthropic

    if isinstance(error, anthropic.APITimeoutError):
        return False  # the client already waited and retried; once more would double it
    if isinstance(error, anthropic.APIConnectionError):
        return True
    return isinstance(error, anthropic.APIStatusError) and (
        error.status_code == 429 or error.status_code >= 500
    )


_PROPOSE_WORDS = re.compile(
    r"\b(propose|proposing|save|add)\b.*\b(it|this|that|them|finding)\b", re.IGNORECASE
)
_UNSET: Any = object()
# How long one pass of `cite_wait` waits for news before the graph shows what it has.
CITE_POLL_SECONDS = 2.0
# Step lines kept from a search: the latest ones, as a person follows them.
CITE_STEPS = 40


def _people_words(messages: list[Any]) -> list[str]:
    """What the person wrote in this thread: their questions' words, never a reply's."""
    words = []
    for m in messages:
        if isinstance(m, HumanMessage):
            try:
                words.append(_question(m).words)
            except ValueError:
                continue
    return words


def build_graph(
    store: StoreClient | None = None,
    model: Any = None,
    *,
    cite: CiteService | None = _UNSET,
    writer: Any = _UNSET,
    cite_poll: float = CITE_POLL_SECONDS,
):
    """The graph. Evals and tests pass a store client over a fake store, and may pass a
    scripted model, a fake cite and a proposal client; otherwise all come from the
    settings. Without cite (no CITE_URL) the Agent says what it would ask for and
    searches nothing."""
    settings = load()
    if store is None:
        store = StoreClient(settings.store_url)
    if cite is _UNSET:
        cite = CiteClient(settings.cite_url) if settings.cite_url else None
    if writer is _UNSET:
        writer = (
            store_writer.ProposalClient(settings.store_url, settings.cite_store_token)
            if settings.cite_store_token
            else None
        )
    if model is None:
        # The client retries a dropped connection, 429, 529 and 5xx with backoff.
        # Low effort: the model picks claims and code writes the words, so deep thinking
        # buys nothing here and cost most of the wait (ten sections 18.7 s to 8.1 s).
        model = init_chat_model(
            settings.model,
            max_tokens=4000,
            # An answer takes seconds; a minute means something is wrong. With the
            # client's retries a person waits at most about three minutes.
            timeout=60,
            max_retries=2,
            output_config={"effort": "low"},
        )

    # Reads `read` made for a question, handed to `answer` in the same process.
    prefetched: dict[str, _Prefetched] = {}

    def new_loop(handles: Handles, reader: Any = store):
        # Made for each question, so each question starts with tools that have read nothing.
        tools = make_tools(reader, handles)
        return tools, create_agent(
            model,
            tools=tools,
            system_prompt=prompts.SYSTEM,
            response_format=ProviderStrategy(Draft),
            name="studio-agent-loop",
        )

    def answer(state: AgentState, config: RunnableConfig) -> dict:
        seen = len(state["messages"])
        cite_state = state.get("cite") or {}
        steering = cite_flow.latest_section(cite_state) if cite is not None else None
        message = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None
        )
        # What `read` fetched for this question, if this process ran it: taken at once,
        # so an early return leaves nothing behind.
        taken = prefetched.pop(message.id, None) if message is not None and message.id else None
        if message is None:
            return _finish(failure("check_failed"), message, [], seen)
        try:
            question = _question(message)
        except ValueError as error:
            blocked = [[f"the question is not one Studio sends: {str(error)[:300]}"]]
            return _finish(failure("check_failed"), message, [], seen, blocked)
        if len(question.words) > MAX_QUESTION_CHARS:
            blocked = [[f"the question is longer than {MAX_QUESTION_CHARS} characters"]]
            return _finish(failure("check_failed"), message, [], seen, blocked)
        if pipeline_flow.asks_for_pipeline(question.words):
            # Making a pipeline is a button, never words: code offers it (plan 005).
            return _pipeline_offer(question, message, taken, seen)
        if pipeline_flow.asks_to_decide(question.words):
            # Deciding and changing store is a person's, in Studio (R12): code says where.
            line = Statement(kind="refusal", text=pipeline_flow.LINES["person_decides"])
            return _finish(Answer(statements=[line]), message, [], seen)
        if cite_state.get("findings") and _PROPOSE_WORDS.search(question.words):
            # A go-ahead is a button, never words (plan D6).
            line = Statement(kind="refusal", text=cite_flow.CITE_LINES["propose_words"])
            return _finish(Answer(statements=[line]), message, [], seen)
        if question.about:
            steering = None

        tools: list[str] = []
        artifacts: list[dict[str, Any]] = []
        blocked: list[list[str]] = []
        handles = Handles()
        steps = _Steps()
        steps.start("Reading store")
        reader = (
            taken
            if taken is not None and not steering
            else _Prefetched(store, _to_read(question, steering))
        )
        (read_feature, read_context), loop = new_loop(handles, reader)
        try:
            first_reads = _read_attached(
                question, read_feature, read_context, config, reader.pipelines, steering
            )
        except StoreError as error:
            return _finish(
                failure(STORE_FAILURES.get(error.kind, "store_unreachable")),
                message,
                [],
                seen,
                steps=steps,
            )
        tools += [c["name"] for m in first_reads[:1] for c in m.tool_calls]
        artifacts += [m.artifact for m in first_reads if isinstance(m, ToolMessage) and m.artifact]
        steps.items.clear()  # "Reading store" becomes what was read
        steps.reads(artifacts, {i.id for i in question.about if i.id})
        # Nothing attached is left in store: the answer is fixed, no model needed.
        if _all_gone(question, artifacts):
            answer = Answer(statements=[Statement(kind="failure", text=FIXED_LINES["not_found"])])
            return _finish(answer, message, tools, seen, steps=steps)
        names = {
            a["features"][0]["id"]: feature_name(a["features"][0])
            for a in artifacts
            if a.get("features")
        }
        shown = {"id": steering, "name": names.get(steering, "a section")} if steering else None
        prompt = _prompt(question, shown) + (
            cite_flow.so_far(cite_state, names) if cite is not None else ""
        )
        messages: list[Any] = [HumanMessage(prompt), *first_reads]
        retried = False
        for attempt in range(2):
            steps.start("Writing the answer" if attempt == 0 else "Writing the answer again")
            try:
                try:
                    result = loop.invoke({"messages": messages}, config)
                except Exception as error:
                    if retried or not _passes(error):
                        raise
                    # Once per question. Fresh tools, so nothing from the failed try
                    # counts as already read; the handles stay, so C1 still means C1.
                    retried = True
                    _, loop = new_loop(handles, reader)
                    result = loop.invoke({"messages": messages}, config)
            except StoreError as error:
                return _finish(
                    failure(STORE_FAILURES.get(error.kind, "store_unreachable")),
                    message,
                    tools,
                    seen,
                    steps=steps,
                )
            except Exception as error:  # noqa: BLE001 - the model or its output failed: say so
                blocked.append([f"the run failed: {type(error).__name__}: {str(error)[:300]}"])
                return _finish(failure("model_failed"), message, tools, seen, blocked, steps=steps)
            run = result["messages"][len(messages) :]
            tools += [c["name"] for m in run if isinstance(m, AIMessage) for c in m.tool_calls]
            artifacts += [m.artifact for m in run if isinstance(m, ToolMessage) and m.artifact]

            if _all_gone(question, artifacts):
                answer = Answer(
                    statements=[Statement(kind="failure", text=FIXED_LINES["not_found"])]
                )
                return _finish(answer, message, tools, seen, steps=steps)

            steps.start("Checking the answer")
            draft = result.get("structured_response")
            read = reads_from(artifacts)
            read.findings = cite_state.get("findings") or {}
            if isinstance(draft, Draft):
                for statement in draft.statements:
                    for ref in statement.refs:
                        if ref.type == "claim":
                            ref.id = handles.resolve(ref.id)
                _point_unknowns_at_the_attached_thing(draft, question, read)
            if not isinstance(draft, Draft):
                problems = ["no answer in the required shape"]
            else:
                try:
                    rendered = render(draft, read)
                    problems = problems_of(draft, rendered, read)
                except Unfillable as error:
                    problems = [str(error)]
                except Exception as error:  # noqa: BLE001 - a bug here must not show an answer
                    problems = [f"the answer could not be checked: {type(error).__name__}"]
            if not problems:
                if cite is not None and any(
                    st.kind == "citation_request" for st in rendered.statements
                ):
                    return _with_search(
                        state, draft, rendered, read, message, tools, seen, blocked, steps
                    )
                return _finish(rendered, message, tools, seen, blocked, steps=steps)
            blocked.append(
                [
                    *problems,
                    "draft: "
                    + (draft.model_dump_json() if isinstance(draft, Draft) else repr(draft))[:1500],
                ]
            )
            if attempt == 0:
                messages = [
                    *result["messages"],
                    HumanMessage(
                        prompts.RETRY.format(problems="\n".join(f"- {p}" for p in problems))
                    ),
                ]
        return _finish(failure("check_failed"), message, tools, seen, blocked, steps=steps)

    def _read_sections(ids: list[str], reader: Any = None) -> list[dict[str, Any]] | str:
        """The sections by id, read in parallel; or the line saying why not. Raises
        StoreError when store cannot be read."""
        reader = reader if reader is not None else _Prefetched(store, ids)
        sections = []
        for fid in ids:
            try:
                sections.append(reader.feature(fid))
            except StoreError as error:
                if error.kind == "not_found":
                    return pipeline_flow.LINES["gone"]
                raise
        return pipeline_flow.check(sections) or sections

    def _pipeline_offer(question: Question, message, taken, seen: int) -> dict:
        attached = [i for i in question.about if i.id]
        ids = [i.id for i in attached if i.kind == "section"]
        if len(ids) != len(attached):
            line = pipeline_flow.LINES["not_sections" if attached else "too_few"]
            return _finish(
                Answer(statements=[Statement(kind="refusal", text=line)]), message, [], seen
            )
        steps = _Steps()
        if len(ids) > pipeline_flow.MAX_SECTIONS:
            got: Any = pipeline_flow.LINES["too_many"]
        else:
            try:
                got = _read_sections(ids, taken)
            except StoreError as error:
                return _finish(
                    failure(STORE_FAILURES.get(error.kind, "store_unreachable")), message, [], seen
                )
        if isinstance(got, str):
            return _finish(
                Answer(statements=[Statement(kind="refusal", text=got)]), message, [], seen
            )
        steps.add_done(read_words(len(got), 0))
        return _finish(
            Answer(
                statements=[
                    pipeline_flow.offer(got, named=bool(pipeline_flow.NAMED.search(question.words)))
                ]
            ),
            message,
            [],
            seen,
            steps=steps,
        )

    def _with_search(state, draft, rendered, read, message, tools, seen, blocked, steps):
        """The checked answer asks for a search: the guard decides (plan D8), and the
        request's statement becomes code's line for what happens next."""
        cite_state = dict(state.get("cite") or {})
        pairs = [
            (d, r)
            for d, r in zip(draft.statements, rendered.statements, strict=True)
            if r.kind == "citation_request"
        ]
        verdict = cite_flow.check_request(
            [d for d, _ in pairs],
            [r for _, r in pairs],
            read,
            _people_words(state["messages"]),
            cite_state.get("findings") or {},
            cite_state.get("runs") or [],
        )
        refs = [ref for _, r in pairs for ref in r.refs if ref.type == "feature"][:1]
        subject = refs[0].label if refs and refs[0].label else "the section"
        job = None
        if isinstance(verdict, cite_flow.Refused):
            line = Statement(kind="citation_request", text=verdict.line, refs=refs)
        elif isinstance(verdict, cite_flow.AskForPlaces):
            line = Statement(kind="ask_places", text=cite_flow.CITE_LINES["ask_places"], refs=refs)
            cite_state["pending"] = {
                "section_id": verdict.section_id,
                "attributes": verdict.attributes,
            }
        else:
            hints = [h for _, r in pairs if r.request for h in r.request.hints]
            line = Statement(
                kind="citation_request",
                text=cite_flow.looking_line(verdict, subject),
                refs=refs,
                request=CitationRequest(
                    feature_id=verdict.section_id,
                    attribute_keys=verdict.attributes,
                    hints=hints,
                ),
            )
            cite_state["pending"] = None
            job = {
                "section_id": verdict.section_id,
                "attributes": verdict.attributes,
                "places": verdict.places,
                "years": list(verdict.years) if verdict.years else None,
                "ruled_out": [list(r) for r in verdict.ruled_out],
                "subject": subject,
            }
        first = rendered.statements.index(pairs[0][1])
        kept = [st for st in rendered.statements if st.kind != "citation_request"]
        answer_ = Answer(statements=[*kept[:first], line, *kept[first:]])
        out = _finish(answer_, message, tools, seen, blocked, steps=steps)
        if job:
            out["steps"] = [*out["steps"], {"text": "Starting the search", "done": False}]
        return {**out, "cite": cite_state, "cite_job": job}

    def _reply(state: AgentState, statements: list[Statement], **more) -> dict:
        """The question's answer, with these statements, replacing the reply it already
        has (one message per question, by id)."""
        question = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None
        )
        answer_ = Answer(checked=True, statements=statements)
        steps = [{**item, "done": True} for item in state.get("steps") or []]
        return {
            "messages": [
                AIMessage(
                    id=f"answer-{question.id}" if question is not None and question.id else None,
                    content=as_text(answer_),
                    additional_kwargs={
                        "answer": answer_.model_dump(),
                        "answers": question.id if question is not None else None,
                        "tools": state.get("tools") or [],
                        "steps": steps,
                    },
                )
            ],
            "answer": answer_.model_dump(),
            "answers": question.id if question is not None else None,
            "steps": steps,
            **more,
        }

    def _replace_request(state: AgentState, line: str) -> list[Statement]:
        """The answer so far, its "Searching..." line replaced by `line`."""
        statements = Answer.model_validate(state["answer"]).statements
        return [
            Statement(kind="citation_request", text=line, refs=st.refs)
            if st.kind == "citation_request" and st.request is not None
            else st
            for st in statements
        ]

    def cite_start(state: AgentState) -> dict:
        job = dict(state["cite_job"] or {})
        ask = cite_input.CiteAsk(
            section_id=job["section_id"],
            attributes=job["attributes"],
            places=job["places"],
            years=tuple(job["years"]) if job.get("years") else None,
            ruled_out=[tuple(r) for r in job.get("ruled_out") or []],
        )

        def stop(line: str) -> dict:
            return _reply(state, _replace_request(state, line), cite_job=None)

        try:
            feature = store.feature(ask.section_id)
            merged, _ = _with_merged(store, feature)
            line_id = next(
                (
                    link["to_feature_id"]
                    for link in feature.get("links") or []
                    if link["relation"] == "part_of"
                    and link["status"] == "confirmed"
                    and link["from_feature_id"] == feature["id"]
                ),
                None,
            )
            try:
                pipeline = store.feature(line_id) if line_id else None
            except StoreError:
                pipeline = None  # a name hint only
            try:
                editions = context.edition_years(store, feature.get("network"))
            except StoreError:
                editions = context.Editions([], complete=False)
            section = cite_input.build(ask, feature, merged, pipeline, editions)
        except cite_input.NoEdition:
            return stop(cite_flow.CITE_LINES["no_edition"])
        except StoreError as error:
            return stop(FIXED_LINES[STORE_FAILURES.get(error.kind, "store_unreachable")])
        if not section["places"] and not section["name"]:
            return stop(cite_flow.CITE_LINES["nothing_to_search_by"])
        try:
            run = cite.start(section)
        except CiteBusy:
            return stop(cite_flow.CITE_LINES["busy"])
        window = section.get("search_window")
        cite_state = dict(state.get("cite") or {})
        cite_state["runs"] = [
            *(cite_state.get("runs") or []),
            {
                "section_id": ask.section_id,
                "subject": job["subject"],
                "attributes": ask.attributes,
                "places": ask.places,
                "years": [window["from"], window["to"]] if window else None,
                "ruled_out": [list(r) for r in ask.ruled_out],
                "outcome": "running",
            },
        ]
        # The line says the years cite will really read, now that they are known.
        asked = cite_input.CiteAsk(
            ask.section_id,
            ask.attributes,
            ask.places,
            (window["from"], window["to"]) if window else None,
            ask.ruled_out,
        )
        statements = [
            st.model_copy(update={"text": cite_flow.looking_line(asked, job["subject"])})
            if st.kind == "citation_request" and st.request is not None
            else st
            for st in Answer.model_validate(state["answer"]).statements
        ]
        out = _reply(state, statements, cite_job={**job, "run": run.id}, cite=cite_state)
        out["steps"] = [
            *out["steps"],
            {"text": "Searching the journals", "done": False, "by": "cite"},
        ]
        return out

    def cite_wait(state: AgentState) -> dict:
        """One pass: wait a little for news from the search, then show it. The graph
        loops here until the search ends; each pass tells cite someone is still there."""
        run = cite.get(state["cite_job"]["run"])
        if run is None:
            return {}
        run.touch()
        deadline = time.monotonic() + cite_poll
        lines = run.take_lines()
        while not lines and not run.done() and time.monotonic() < deadline:
            time.sleep(min(0.25, cite_poll))
            run.touch()
            lines = run.take_lines()
        if not lines:
            return {}
        steps = [{**item, "done": True} for item in state.get("steps") or []]
        # The search's own lines, newest last; the last stays open while it runs.
        cited = [item for item in steps if item.get("by") == "cite"]
        others = [item for item in steps if item.get("by") != "cite"]
        cited += [{"text": line, "done": True, "by": "cite"} for line in lines]
        cited = cited[-CITE_STEPS:]
        cited[-1] = {**cited[-1], "done": run.done()}
        return {"steps": [*others, *cited]}

    def _searching(state: AgentState) -> str:
        run = cite.get(state["cite_job"]["run"])
        return "cite_report" if run is None or run.done() else "cite_wait"

    def cite_report(state: AgentState) -> dict:
        job = state["cite_job"]
        run = cite.get(job["run"])
        cite_state = dict(state.get("cite") or {})
        findings = dict(cite_state.get("findings") or {})
        feature_ref = Ref(type="feature", id=job["section_id"], label=job["subject"])
        outcome = "nothing came back"
        if run is None:
            report = [
                Statement(kind="searched", text=cite_flow.CITE_LINES["lost"], refs=[feature_ref])
            ]
        elif run.result() is None:
            report = [
                Statement(kind="searched", text=cite_flow.CITE_LINES["failed"], refs=[feature_ref])
            ]
        else:
            try:
                result = CiteResult.model_validate(run.result())
            except ValueError:
                result = None
            if result is None:
                report = [
                    Statement(
                        kind="searched", text=cite_flow.CITE_LINES["failed"], refs=[feature_ref]
                    )
                ]
            else:
                records = cite_flow.findings_of(result, job["section_id"], len(findings) + 1)
                try:
                    feature = store.feature(job["section_id"])
                    cite_flow.mark_held(records, [feature, *_with_merged(store, feature)[0]])
                except StoreError:
                    pass  # unread, a finding stays "not in store"; Propose checks again
                for record in records:
                    findings[record["finding"]["handle"]] = record
                report = cite_flow.report(
                    result, records, job["attributes"], job["section_id"], job["subject"]
                )
                handles = [r["finding"]["handle"] for r in records]
                outcome = f"found {', '.join(handles)}" if handles else "nothing found"
                if result.status != "ok":
                    outcome = "cite could not search it"
        runs = list(cite_state.get("runs") or [])
        if runs:
            runs[-1] = {**runs[-1], "outcome": outcome}
        cite_state |= {"runs": runs, "findings": findings}
        statements = Answer.model_validate(state["answer"]).statements
        return _reply(state, [*statements, *report], cite=cite_state, cite_job=None)

    def propose(state: AgentState) -> dict:
        """The person pressed Propose on a finding: write it to store as a candidate claim.
        No model; code finds the finding, reads the section again and sends the bundle."""
        message = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None
        )
        seen = len(state["messages"])
        question = _question(message)
        handle = (question.action.finding or "").strip().upper()
        record = ((state.get("cite") or {}).get("findings") or {}).get(handle)

        def say(kind: str, text: str, refs: list[Ref] | None = None) -> dict:
            answer_ = Answer(statements=[Statement(kind=kind, text=text, refs=refs or [])])
            return _finish(answer_, message, [], seen)

        if record is None:
            return say("refusal", cite_flow.CITE_LINES["not_found_finding"])
        f = record["finding"]
        if not f.get("proposable", True):
            return say(
                "refusal", cite_flow.CITE_LINES["not_proposable"].format(why=f["not_proposable"])
            )
        if writer is None:
            return say("failure", cite_flow.CITE_LINES["store_write_failed"])
        try:
            feature = store.feature(f["section_id"])
            merged, _ = _with_merged(store, feature)
        except StoreError as error:
            return say("failure", FIXED_LINES[STORE_FAILURES.get(error.kind, "store_unreachable")])
        subject = feature_name(feature)
        what = {"built": "build date"}.get(f["attribute"], f["attribute"])
        held = cite_flow.held_in_store(record, [feature, *merged])
        if held is not None:
            text = cite_flow.CITE_LINES["already_in_store"].format(
                value=f["value"], what=what, subject=subject, status=held["status"]
            )
            return say("refusal", text, [Ref(type="feature", id=feature["id"], label=subject)])
        try:
            written = writer.propose(store_writer.bundle(record))
        except StoreError:
            return say("failure", cite_flow.CITE_LINES["store_write_failed"])
        claim_id = written["ids"].get("claim")
        refs = [Ref(type="feature", id=feature["id"], label=subject)]
        if claim_id:
            refs.insert(
                0,
                Ref(
                    type="claim",
                    id=claim_id,
                    feature_id=feature["id"],
                    attribute=record["store_key"],
                    status="candidate",
                    asserter="pipeline",
                    label=subject,
                    source=cite_flow.reference_of(record),
                ),
            )
        text = cite_flow.CITE_LINES["proposed"].format(
            value=f["value"] if f["attribute"] != "built" else f["date_words"],
            what=what,
            subject=subject,
            reference=cite_flow.reference_of(record),
        )
        return say("proposed", text, refs)

    def propose_pipeline(state: AgentState) -> dict:
        """The person pressed Propose pipeline: write a new line and a proposed part_of
        link per section. No model; code reads the sections again and sends the bundle."""
        message = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None
        )
        seen = len(state["messages"])
        question = _question(message)

        def say(kind: str, text: str) -> dict:
            return _finish(Answer(statements=[Statement(kind=kind, text=text)]), message, [], seen)

        ids = pipeline_flow.canonical(question.action.section_ids or [])
        if ids is None or len(ids) < 2:
            return say("refusal", pipeline_flow.LINES["too_few"])
        if len(ids) > pipeline_flow.MAX_SECTIONS:
            return say("refusal", pipeline_flow.LINES["too_many"])
        if writer is None:
            return say("failure", pipeline_flow.LINES["write_failed"])
        try:
            got = _read_sections(ids)
        except StoreError as error:
            return say("failure", FIXED_LINES[STORE_FAILURES.get(error.kind, "store_unreachable")])
        if isinstance(got, str):
            return say("refusal", got)
        try:
            written = writer.propose(store_writer.pipeline_bundle(ids, got[0]["network"]))
        except StoreError:
            return say("failure", pipeline_flow.LINES["write_failed"])
        return _finish(Answer(statements=[pipeline_flow.outcome(got, written)]), message, [], seen)

    def fresh_start(state: AgentState) -> dict:
        """The person pressed Start fresh: every message goes, what cite found stays (its
        findings by handle, earlier searches, a request waiting for towns), so Propose and
        steering still work. No model, nothing written to store."""
        return {
            "messages": [RemoveMessage(id=REMOVE_ALL_MESSAGES)],
            "answer": None,
            "answers": None,
            "tools": [],
            "blocked": [],
            "steps": [],
            "seen": 0,
            "cite_job": None,
        }

    def _route_in(state: AgentState) -> str:
        message = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None
        )
        try:
            question = _question(message) if message is not None else None
        except ValueError:
            return "read"
        if question is None or question.action is None:
            return "read"
        return question.action.kind  # propose, propose_pipeline or fresh_start

    builder = StateGraph(AgentState)

    def read(state: AgentState) -> dict:
        """Say what is being read before the model starts: the attached features and
        their pipelines, read in parallel (fast), then what comes next. Studio shows
        these while the answer is worked on; `answer` reads again for itself, so
        nothing here is relied on."""
        message = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None
        )
        try:
            question = _question(message) if message is not None else None
        except ValueError:
            question = None
        if (
            question is None
            or not question.about
            or len(question.words) > MAX_QUESTION_CHARS  # `answer` turns it away
        ):
            return {"steps": [{"text": "Writing the answer", "done": False}]}
        ids = _to_read(question)
        reader = _Prefetched(store, ids)
        if message is not None and message.id:
            if len(prefetched) > 32:  # runs that died between the nodes; never grows
                prefetched.clear()
            prefetched[message.id] = reader  # `answer` takes these reads over
        steps: list[dict[str, Any]] = []
        for fid in [*ids, *reader.pipelines]:
            try:
                feature = reader.feature(fid)
            except StoreError:
                continue
            words = (
                f"Read its pipeline, {feature_name(feature)}"
                if fid in reader.pipelines
                else f"Read {feature_name(feature)}"
            )
            steps.append({"text": words, "done": True})
        if len(steps) > 4:
            kinds = [i.kind for i in question.about]
            steps = [
                {
                    "text": read_words(
                        kinds.count("section"),
                        kinds.count("pipeline") + len(reader.pipelines),
                    ),
                    "done": True,
                }
            ]
        has_section = any(i.kind == "section" for i in question.about)
        steps.append(
            {
                "text": "Reading what surrounds it, then writing the answer"
                if has_section
                else "Writing the answer",
                "done": False,
            }
        )
        return {"steps": steps}

    builder.add_node("ingress", ingress)
    builder.add_node("read", read)
    builder.add_node("answer", answer)
    builder.add_node("propose", propose)
    builder.add_node("cite_start", cite_start)
    builder.add_node("cite_wait", cite_wait)
    builder.add_node("cite_report", cite_report)
    builder.add_edge(START, "ingress")
    builder.add_conditional_edges(
        "ingress", _route_in, ["read", "propose", "propose_pipeline", "fresh_start"]
    )
    builder.add_edge("read", "answer")
    builder.add_conditional_edges(
        "answer", lambda s: "cite_start" if s.get("cite_job") else END, ["cite_start", END]
    )
    builder.add_conditional_edges(
        "cite_start", lambda s: "cite_wait" if s.get("cite_job") else END, ["cite_wait", END]
    )
    builder.add_conditional_edges("cite_wait", _searching, ["cite_wait", "cite_report"])
    builder.add_edge("cite_report", END)
    builder.add_edge("propose", END)
    builder.add_node("propose_pipeline", propose_pipeline)
    builder.add_edge("propose_pipeline", END)
    builder.add_node("fresh_start", fresh_start)
    builder.add_edge("fresh_start", END)
    # A search is followed one pass at a time, so its run takes many steps.
    return builder.compile(name="studio-agent").with_config(recursion_limit=1000)
