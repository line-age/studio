"""The person's buttons: Propose, Search, what came of a card, and Start fresh. No model."""

from langchain_core.messages import AIMessage, RemoveMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES

from src.agent.deps import Deps
from src.agent.nodes.cite import ask_of
from src.agent.question import last_message, question_of
from src.agent.reply import CARD_GONE, STORE_FAILURES, finish
from src.agent.state import AgentState
from src.answer.render import FIXED_LINES, feature_name
from src.answer.schemas import Answer, CitationRequest, Ref, Statement
from src.clients import store_writer
from src.clients.store_client import StoreError
from src.flows import change_flow, cite_flow
from src.tools.views import with_merged


def _cards_in(state: AgentState) -> set[str]:
    """The ids of every card in this thread: change and search offers, and the handles
    of what cite found."""
    ids = set(((state.get("cite") or {}).get("findings") or {}).keys())
    for m in state["messages"]:
        if not isinstance(m, AIMessage):
            continue
        answer = (m.additional_kwargs or {}).get("answer") or {}
        for st in answer.get("statements") or []:
            for field in ("change", "search"):
                if st.get(field):
                    ids.add(st[field]["id"])
    return ids


def propose(deps: Deps, state: AgentState) -> dict:
    """The person pressed Propose on a finding: write it to store as a candidate claim.
    No model; code finds the finding, reads the section again and sends the bundle."""
    store, writer = deps.store, deps.writer
    message = last_message(state)
    seen = len(state["messages"])
    question = question_of(message)
    handle = (question.action.finding or "").strip().upper()
    record = ((state.get("cite") or {}).get("findings") or {}).get(handle)

    def say(kind: str, text: str, refs: list[Ref] | None = None) -> dict:
        answer_ = Answer(statements=[Statement(kind=kind, text=text, refs=refs or [])])
        return finish(answer_, message, [], seen)

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
        merged, _ = with_merged(store, feature)
    except StoreError as error:
        return say("failure", FIXED_LINES[STORE_FAILURES.get(error.kind, "store_unreachable")])
    # Where it goes: its section, or the pipeline that section is confirmed part of.
    # An owner belongs to the pipeline; a diameter or a build date to the section.
    target = (question.action.target or "").strip() or feature["id"]
    if target != feature["id"]:
        in_it = any(
            link["relation"] == "part_of"
            and link["status"] == "confirmed"
            and link["from_feature_id"] == feature["id"]
            and link["to_feature_id"] == target
            for link in feature.get("links") or []
        )
        if not in_it or record["store_key"] != "owner":
            return say("refusal", cite_flow.CITE_LINES["not_its_pipeline"])
        try:
            feature, merged = store.feature(target), []
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
        written = writer.propose(store_writer.bundle(record, feature["id"]))
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


def outcome(state: AgentState) -> dict:
    """The person's press on a card, reported by Studio once it is done: recorded in
    the thread so every reader sees the card's state. No model, nothing written; a
    change was already made by Studio, as the person."""
    message = last_message(state)
    seen = len(state["messages"])
    action = question_of(message).action
    known = _cards_in(state)
    if action.state is None or (action.offer or "") not in known:
        line = Statement(kind="refusal", text=CARD_GONE)
    else:
        line = Statement(kind="changed", text=change_flow.OUTCOME_LINES[action.state])
    return finish(Answer(statements=[line]), message, [], seen)


def search(deps: Deps, state: AgentState) -> dict:
    """The person pressed Search on a search offer: start the search it offered, as
    the thread keeps it (Studio sends only its id). No model."""
    message = last_message(state)
    seen = len(state["messages"])
    offer_id = question_of(message).action.offer or ""
    cite_state = dict(state.get("cite") or {})
    offers = dict(cite_state.get("offers") or {})
    job = offers.get(offer_id)

    def say(text: str) -> dict:
        return finish(Answer(statements=[Statement(kind="refusal", text=text)]), message, [], seen)

    if job is None:
        return say(CARD_GONE)
    if job.get("ran"):
        return say(cite_flow.CITE_LINES["already_searched"])
    if deps.cite is None:
        return say(cite_flow.CITE_LINES["failed"])
    ask = ask_of(job)
    ref = Ref(type="feature", id=job["section_id"], label=job["subject"])
    line = Statement(
        kind="citation_request",
        text=cite_flow.looking_line(ask, job["subject"]),
        refs=[ref],
        request=CitationRequest(
            feature_id=job["section_id"],
            attribute_keys=job["attributes"],
            hints=job.get("hints") or [],
        ),
    )
    out = finish(Answer(statements=[line]), message, [], seen)
    out["steps"] = [{"text": "Starting the search", "done": False}]
    # Marked run only once cite has started it (cite_start): a search that could
    # not start can be pressed again.
    job = {k: v for k, v in job.items() if k != "hints"}
    return {**out, "cite_job": {**job, "offer": offer_id}}


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
