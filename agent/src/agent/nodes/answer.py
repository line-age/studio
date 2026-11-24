"""Answering a question: read what is attached, let the model draft, render, check, retry
once. A change asked in words is code's card, with no model."""

import re
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

from src.agent.config import HISTORY_ANSWER_CHARS, HISTORY_TURNS, MAX_QUESTION_CHARS
from src.agent.deps import Deps
from src.agent.nodes.change import change_offer
from src.agent.nodes.cite import with_search
from src.agent.prefetch import Prefetched
from src.agent.question import carried as carried_from
from src.agent.question import last_message, question_of, to_read
from src.agent.reply import STORE_FAILURES, Steps, finish
from src.agent.state import AgentState
from src.answer.grounding import problems_of, reads_from
from src.answer.render import FIXED_LINES, Unfillable, failure, feature_name, render, say_once
from src.answer.schemas import Answer, Draft, DraftRef, Question, Ref, Statement
from src.clients.store_client import StoreError
from src.flows import change_flow, cite_flow
from src.middleware.limits import loop_middleware
from src.prompts.retry import RETRY
from src.prompts.system import SYSTEM
from src.tools.make import CONTEXT_FOR, Handles, make_tools

_PROPOSE_WORDS = re.compile(
    r"\b(propose|proposing|save|add)\b.*\b(it|this|that|them|finding)\b", re.IGNORECASE
)


def _prompt(
    question: Question, steering: dict[str, Any] | None = None, carried: bool = False
) -> str:
    lines = [question.words, ""]
    if question.about:
        lines.append(
            "Nothing is attached to this message. The person's last question was about "
            "these, read again for you now. If this message goes on about them (a "
            'follow-up, "try again", "and its diameter?"), answer about them. If it '
            "asks for something else, answer it as if nothing were attached:"
            if carried
            else "Attached:"
        )
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


def _history(messages: list[Any], current: HumanMessage) -> str:
    """The last few turns as words, so the model knows what "it" or "try again" means.
    Never a source: a value still enters only through a slot filled from this run."""
    lines: list[str] = []
    for m in messages:
        if m.id == current.id:
            continue
        if isinstance(m, HumanMessage):
            try:
                question = question_of(m)
            except ValueError:
                continue
            attached = f" (attached: {len(question.about)})" if question.about else ""
            lines.append(f"Person{attached}: {question.words[:300]}")
        elif isinstance(m, AIMessage) and isinstance(m.content, str) and m.content:
            lines.append(f"You: {m.content[:HISTORY_ANSWER_CHARS]}")
    lines = lines[-2 * HISTORY_TURNS :]
    if not lines:
        return ""
    return (
        "\n\nEarlier in this chat, oldest first. It tells you what the person means "
        '("it", "try again", "and the other one"). It is never a source: say only what '
        "was read for this message.\n" + "\n".join(lines)
    )


def _read_attached(
    question: Question,
    read_feature: Any,
    read_context: Any,
    config: Any,
    pipelines: list[str] | None = None,
    steering: str | None = None,
    sections_together: Any = None,
    pipeline_sections: Any = None,
) -> list[Any]:
    """Read everything attached before the model starts, as if the model had asked: one
    model turn fewer. Then the pipelines those sections are in, and the first sections'
    context. Raises StoreError."""
    first = to_read(question, steering)
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
    if sections_together is not None and len(sections) > 1:
        # Several sections: what they share and where they differ, worked out once.
        calls.append(
            {
                "name": "sections_together",
                "args": {"section_ids": sections},
                "id": "together_0",
                "type": "tool_call",
            }
        )
    if pipeline_sections is not None:
        # An attached pipeline: its sections, counted and taken together, worked out once.
        calls += [
            {
                "name": "pipeline_sections",
                "args": {"pipeline_id": i.id},
                "id": f"members_{n}",
                "type": "tool_call",
            }
            for n, i in enumerate(question.about)
            if i.kind == "pipeline" and i.id
        ]
    tools = {
        "read_feature": read_feature,
        "read_context": read_context,
        "sections_together": sections_together,
        "pipeline_sections": pipeline_sections,
    }
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


def _new_loop(deps: Deps, handles: Handles, reader: Any, network: str | None = None):
    # Made for each question, so each question starts with tools that have read nothing.
    tools = make_tools(reader, handles, network)
    return tools, create_agent(
        deps.model,
        tools=tools,
        system_prompt=SYSTEM,
        response_format=ProviderStrategy(Draft),
        middleware=loop_middleware(),
        name="studio-agent-loop",
    )


def answer(deps: Deps, state: AgentState, config: RunnableConfig) -> dict:
    store, cite = deps.store, deps.cite
    seen = len(state["messages"])
    cite_state = state.get("cite") or {}
    steering = cite_flow.latest_section(cite_state) if cite is not None else None
    message = last_message(state)
    # What `read` fetched for this question, if this process ran it: taken at once,
    # so an early return leaves nothing behind.
    taken = deps.prefetched.pop(message.id, None) if message is not None and message.id else None
    if message is None:
        return finish(failure("check_failed"), message, [], seen)
    try:
        question = question_of(message)
    except ValueError as error:
        blocked = [[f"the question is not one Studio sends: {str(error)[:300]}"]]
        return finish(failure("check_failed"), message, [], seen, blocked)
    if len(question.words) > MAX_QUESTION_CHARS:
        blocked = [[f"the question is longer than {MAX_QUESTION_CHARS} characters"]]
        return finish(failure("check_failed"), message, [], seen, blocked)
    request = change_flow.read_request(question.words)
    if request is not None:
        # A change asked for in words: code's card, made by Studio on Approve (D1, D4).
        return change_offer(deps, question, request, message, taken, seen)
    if change_flow.asks_to_decide(question.words):
        # Deciding what a tool proposed is a person's, in the inbox (R12).
        line = Statement(kind="refusal", text=change_flow.LINES["person_decides"])
        return finish(Answer(statements=[line]), message, [], seen)
    if change_flow.sounds_like_a_change(question.words):
        # A change code could not read: a fixed line, never a wrong card (R9).
        line = Statement(kind="refusal", text=change_flow.LINES["cannot_read"])
        return finish(Answer(statements=[line]), message, [], seen)
    if cite_state.get("findings") and _PROPOSE_WORDS.search(question.words):
        # A go-ahead is a button, never words (plan D6).
        line = Statement(kind="refusal", text=cite_flow.CITE_LINES["propose_words"])
        return finish(Answer(statements=[line]), message, [], seen)
    if question.about:
        steering = None
    # A follow-up: nothing attached and no search to steer, so the things of the
    # last question are read again and the question is asked of them (B32).
    carried = [] if question.about or steering else carried_from(state["messages"], message)
    if carried:
        question = question.model_copy(update={"about": carried})

    tools: list[str] = []
    artifacts: list[dict[str, Any]] = []
    blocked: list[list[str]] = []
    handles = Handles()
    steps = Steps()
    steps.start("Reading the data")
    reader = (
        taken
        if taken is not None and not steering and not carried
        else Prefetched(store, to_read(question, steering))
    )
    made, loop = _new_loop(deps, handles, reader, question.network)
    read_feature, read_context, _, sections_together, pipeline_sections, *_ = made
    try:
        first_reads = _read_attached(
            question,
            read_feature,
            read_context,
            config,
            reader.pipelines,
            steering,
            sections_together,
            pipeline_sections,
        )
    except StoreError as error:
        return finish(
            failure(STORE_FAILURES.get(error.kind, "store_unreachable")),
            message,
            [],
            seen,
            steps=steps,
        )
    tools += [c["name"] for m in first_reads[:1] for c in m.tool_calls]
    artifacts += [m.artifact for m in first_reads if isinstance(m, ToolMessage) and m.artifact]
    steps.items.clear()  # "Reading the data" becomes what was read
    steps.reads(artifacts, {i.id for i in question.about if i.id})
    # Nothing attached is left in store: the answer is fixed, no model needed.
    if _all_gone(question, artifacts):
        answer_ = Answer(statements=[Statement(kind="failure", text=FIXED_LINES["not_found"])])
        return finish(answer_, message, tools, seen, steps=steps)
    names = {
        a["features"][0]["id"]: feature_name(a["features"][0])
        for a in artifacts
        if a.get("features")
    }
    shown = {"id": steering, "name": names.get(steering, "a section")} if steering else None
    prompt = (
        _prompt(question, shown, carried=bool(carried))
        + (cite_flow.so_far(cite_state, names) if cite is not None else "")
        + _history(state["messages"], message)
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
                _, loop = _new_loop(deps, handles, reader, question.network)
                result = loop.invoke({"messages": messages}, config)
        except StoreError as error:
            return finish(
                failure(STORE_FAILURES.get(error.kind, "store_unreachable")),
                message,
                tools,
                seen,
                steps=steps,
            )
        except Exception as error:  # noqa: BLE001 - the model or its output failed: say so
            blocked.append([f"the run failed: {type(error).__name__}: {str(error)[:300]}"])
            return finish(failure("model_failed"), message, tools, seen, blocked, steps=steps)
        run = result["messages"][len(messages) :]
        tools += [c["name"] for m in run if isinstance(m, AIMessage) for c in m.tool_calls]
        artifacts += [m.artifact for m in run if isinstance(m, ToolMessage) and m.artifact]

        if _all_gone(question, artifacts):
            answer_ = Answer(statements=[Statement(kind="failure", text=FIXED_LINES["not_found"])])
            return finish(answer_, message, tools, seen, steps=steps)

        steps.start("Checking the answer")
        draft = result.get("structured_response")
        read = reads_from(artifacts)
        read.findings = cite_state.get("findings") or {}
        read.asked_about = to_read(question, steering)
        read.words = question.words
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
            if carried and any(st.refs for st in rendered.statements):
                # The answer rests on what was carried: say which things.
                rendered.carried = [
                    Ref(type="feature", id=fid, label=feature_name(read.features[fid]))
                    for fid in dict.fromkeys(to_read(question))
                    if fid in read.features
                ]
            if cite is not None and any(
                st.kind == "citation_request" for st in rendered.statements
            ):
                return with_search(
                    deps, state, draft, rendered, read, message, tools, seen, blocked, steps
                )
            return finish(say_once(rendered), message, tools, seen, blocked, steps=steps)
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
                HumanMessage(RETRY.format(problems="\n".join(f"- {p}" for p in problems))),
            ]
    return finish(failure("check_failed"), message, tools, seen, blocked, steps=steps)
