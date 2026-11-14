"""The Agent's graph: take the question in, let the model read store and draft an answer,
fill the draft's slots, check it against what was read, and only then attach it.

    ingress -> answer -> END

`answer` runs the model loop (`create_agent`, tools read store), renders the draft and
checks it (grounding.py). A draft that fails goes back once with what failed; a second
failure ends with the fixed "could not answer" line. The graph holds no serving code and
no checkpointer; the server supplies both.
"""

import uuid
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, HumanMessage, RemoveMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph

import prompts
from grounding import problems_of, reads_from
from render import FIXED_LINES, Unfillable, as_text, failure, render
from schemas import Answer, Draft, DraftRef, Question, Statement
from settings import MAX_QUESTION_CHARS, load
from store_client import StoreClient, StoreError
from tools import Handles, make_tools

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


def ingress(state: AgentState) -> dict:
    """Take in one question. Only a person's message may come from outside.

    The service has no sign-in, so anything can be posted to it. A system, tool or
    assistant message from outside is removed before a model could read it, and the
    previous turn's answer is cleared so it can never be shown against a new question.
    """
    new = state["messages"][state.get("seen") or 0 :]
    forged = [m for m in new if not isinstance(m, HumanMessage)]
    return {
        "messages": [RemoveMessage(id=m.id) for m in forged],
        "answer": None,
        "answers": None,
        "tools": [],
        "blocked": [],
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


def _prompt(question: Question) -> str:
    lines = [question.words, ""]
    if question.about:
        lines.append("Attached:")
        for item in question.about:
            where = f" on {item.on.model_dump(exclude_none=True)}" if item.on else ""
            if item.kind in ("claim", "citation") and item.on and item.on.sectionId:
                lines.append(
                    f"- a {item.kind}, id {item.id}, on the section {item.on.sectionId}"
                    + (f" ({item.on.attribute})" if item.on.attribute else "")
                    + ". Read that section to find it."
                )
            else:
                lines.append(f"- a {item.kind}, id {item.id}{where}")
    else:
        lines.append("Nothing is attached.")
    return "\n".join(lines)


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


def _finish(
    answer: Answer,
    question: HumanMessage | None,
    tools: list[str],
    seen: int,
    blocked: list[list[str]] | None = None,
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
                },
            )
        ],
        "answer": answer.model_dump(),
        "answers": question.id if question is not None else None,
        "tools": tools,
        "seen": seen + 1,
    }


def _passes(error: Exception) -> bool:
    """A model error worth one more try: the connection dropped or timed out, or the
    model was rate-limited, overloaded or failed on its side."""
    import anthropic

    if isinstance(error, anthropic.APIConnectionError):
        return True
    return isinstance(error, anthropic.APIStatusError) and (
        error.status_code == 429 or error.status_code >= 500
    )


def build_graph(store: StoreClient | None = None, model: Any = None):
    """The graph. Evals and tests pass a store client over a fake store, and may pass a
    scripted model; otherwise both come from the settings."""
    settings = load()
    if store is None:
        store = StoreClient(settings.store_url, settings.store_token)
    if model is None:
        # The client retries a dropped connection, 429, 529 and 5xx with backoff.
        model = init_chat_model(settings.model, max_tokens=4000, timeout=120, max_retries=3)

    def new_loop(handles: Handles):
        # Made for each question, so each question starts with tools that have read nothing.
        return create_agent(
            model,
            tools=make_tools(store, handles),
            system_prompt=prompts.SYSTEM,
            response_format=ProviderStrategy(Draft),
            name="studio-agent-loop",
        )

    def answer(state: AgentState) -> dict:
        seen = len(state["messages"])
        message = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None
        )
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

        messages: list[Any] = [HumanMessage(_prompt(question))]
        tools: list[str] = []
        artifacts: list[dict[str, Any]] = []
        blocked: list[list[str]] = []
        handles = Handles()
        loop = new_loop(handles)
        retried = False
        for attempt in range(2):
            try:
                try:
                    result = loop.invoke({"messages": messages})
                except Exception as error:
                    if retried or not _passes(error):
                        raise
                    # Once per question. Fresh tools, so nothing from the failed try
                    # counts as already read; the handles stay, so C1 still means C1.
                    retried = True
                    loop = new_loop(handles)
                    result = loop.invoke({"messages": messages})
            except StoreError as error:
                return _finish(
                    failure(STORE_FAILURES.get(error.kind, "store_unreachable")),
                    message,
                    tools,
                    seen,
                )
            except Exception as error:  # noqa: BLE001 - the model or its output failed: say so
                blocked.append([f"the run failed: {type(error).__name__}: {str(error)[:300]}"])
                return _finish(failure("model_failed"), message, tools, seen, blocked)
            run = result["messages"][len(messages) :]
            tools += [c["name"] for m in run if isinstance(m, AIMessage) for c in m.tool_calls]
            artifacts += [m.artifact for m in run if isinstance(m, ToolMessage) and m.artifact]

            # A claim or citation has no read of its own: it is found on its section.
            attached = [i.id for i in question.about if i.id and i.kind in ("section", "pipeline")]
            gone = {a["not_found"] for a in artifacts if "not_found" in a}
            if attached and set(attached) <= gone:
                answer = Answer(
                    statements=[Statement(kind="failure", text=FIXED_LINES["not_found"])]
                )
                return _finish(answer, message, tools, seen)

            draft = result.get("structured_response")
            read = reads_from(artifacts)
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
                return _finish(rendered, message, tools, seen, blocked)
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
        return _finish(failure("check_failed"), message, tools, seen, blocked)

    builder = StateGraph(AgentState)
    builder.add_node("ingress", ingress)
    builder.add_node("answer", answer)
    builder.add_edge(START, "ingress")
    builder.add_edge("ingress", "answer")
    builder.add_edge("answer", END)
    return builder.compile(name="studio-agent")
