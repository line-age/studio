"""Searching with cite: the offer an answer makes, then starting, following and reporting
a search. Code writes every sentence of it; no model."""

import time
import uuid
from typing import Any

from src.agent.config import CITE_STEPS
from src.agent.deps import Deps
from src.agent.question import people_words
from src.agent.reply import STORE_FAILURES, finish, replace_reply
from src.agent.state import AgentState
from src.answer.render import FIXED_LINES
from src.answer.schemas import Answer, Ref, SearchOffer, Statement
from src.clients.cite_client import CiteBusy
from src.clients.store_client import StoreError
from src.flows import change_flow, cite_flow, cite_input
from src.flows.cite_result import CiteResult
from src.tools.views import with_merged
from src.worked_out import context


def _replace_request(state: AgentState, line: str) -> list[Statement]:
    """The answer so far, its "Searching..." line replaced by `line`."""
    statements = Answer.model_validate(state["answer"]).statements
    return [
        Statement(kind="citation_request", text=line, refs=st.refs)
        if st.kind == "citation_request" and st.request is not None
        else st
        for st in statements
    ]


def _cite_input(deps: Deps, ask: cite_input.CiteAsk) -> dict[str, Any] | str:
    """cite's input for one search, read from store; or the line saying why there is
    none (no printing shows it, store cannot be read, nothing to search by)."""
    store = deps.store
    try:
        feature = store.feature(ask.section_id)
        merged, _ = with_merged(store, feature)
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
        return cite_flow.CITE_LINES["no_edition"]
    except StoreError as error:
        return FIXED_LINES[STORE_FAILURES.get(error.kind, "store_unreachable")]
    if not section["places"] and not section["name"]:
        return cite_flow.CITE_LINES["nothing_to_search_by"]
    return section


def ask_of(job: dict[str, Any]) -> cite_input.CiteAsk:
    return cite_input.CiteAsk(
        section_id=job["section_id"],
        attributes=job["attributes"],
        places=job["places"],
        years=tuple(job["years"]) if job.get("years") else None,
        ruled_out=[tuple(r) for r in job.get("ruled_out") or []],
        from_line=bool(job.get("from_line")),
    )


def with_search(deps: Deps, state, draft, rendered, read, message, tools, seen, blocked, steps):
    """The checked answer asks for a search: the guard decides (plan D8), and the
    request's statement becomes code's line for what happens next."""
    store = deps.store
    cite_state = dict(state.get("cite") or {})
    pairs = [
        (d, r)
        for d, r in zip(draft.statements, rendered.statements, strict=True)
        if r.kind == "citation_request"
    ]

    def gaps(section_id: str) -> list[str]:
        # What the section is missing, read from store; on a failed read, the
        # model's own attribute stands (an empty answer would say nothing is).
        try:
            feature = store.feature(section_id)
            merged, _ = with_merged(store, feature)
            pipeline_id = change_flow.confirmed_pipeline(feature)
            pipeline = store.feature(pipeline_id) if pipeline_id else None
        except StoreError:
            return [d.attribute for d, _ in pairs if d.attribute] or list(cite_input.TO_CITE)
        return context.search_gaps(feature, merged, pipeline)

    verdict = cite_flow.check_request(
        [d for d, _ in pairs],
        [r for _, r in pairs],
        read,
        people_words(state["messages"]),
        cite_state.get("findings") or {},
        cite_state.get("runs") or [],
        gaps=gaps,
        pending=cite_state.get("pending"),
    )
    refs = [ref for _, r in pairs for ref in r.refs if ref.type == "feature"][:1]
    subject = refs[0].label if refs and refs[0].label else "the section"
    job = None
    if isinstance(verdict, cite_flow.Refused):
        line = Statement(kind="citation_request", text=verdict.line, refs=refs)
    elif isinstance(verdict, cite_flow.AskForPlaces):
        line = Statement(
            kind="search_offer",
            text=cite_flow.offer_line(verdict.attributes),
            refs=refs,
            search=SearchOffer(
                id=str(uuid.uuid4()),
                section_id=verdict.section_id,
                attributes=verdict.attributes,
                ready=False,
            ),
        )
        cite_state["pending"] = {
            "section_id": verdict.section_id,
            "attributes": verdict.attributes,
        }
    else:
        # Guard passed: offered as a card, never started from words (plan 2b). Only
        # the person's Search starts it: a search costs money and minutes.
        hints = [h for _, r in pairs if r.request for h in r.request.hints]
        section = _cite_input(deps, verdict)
        if isinstance(section, str):
            line = Statement(kind="citation_request", text=section, refs=refs)
        else:
            offer_id = str(uuid.uuid4())
            window = section.get("search_window")
            line = Statement(
                kind="search_offer",
                text=cite_flow.offer_line(verdict.attributes),
                refs=refs,
                search=SearchOffer(
                    id=offer_id,
                    section_id=verdict.section_id,
                    attributes=verdict.attributes,
                    years=[window["from"], window["to"]] if window else [],
                    places=section["places"],
                    from_line=verdict.from_line,
                ),
            )
            cite_state["pending"] = None
            cite_state["offers"] = {
                **(cite_state.get("offers") or {}),
                offer_id: {
                    "section_id": verdict.section_id,
                    "attributes": verdict.attributes,
                    "places": verdict.places,
                    "years": list(verdict.years) if verdict.years else None,
                    "ruled_out": [list(r) for r in verdict.ruled_out],
                    "subject": subject,
                    "from_line": verdict.from_line,
                    "hints": [h.model_dump() for h in hints],
                },
            }
    first = rendered.statements.index(pairs[0][1])
    # Nothing is searched yet (it waits for Search), so what the answer says is not
    # known stays: the person reads it above the search card.
    kept = [st for st in rendered.statements if st.kind != "citation_request"]
    answer_ = Answer(statements=[*kept[:first], line, *kept[first:]])
    out = finish(answer_, message, tools, seen, blocked, steps=steps)
    return {**out, "cite": cite_state, "cite_job": job}


def cite_start(deps: Deps, state: AgentState) -> dict:
    job = dict(state["cite_job"] or {})
    ask = ask_of(job)

    def stop(line: str) -> dict:
        return replace_reply(state, _replace_request(state, line), cite_job=None)

    section = _cite_input(deps, ask)
    if isinstance(section, str):
        return stop(section)
    try:
        run = deps.cite.start(section)
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
            "from_line": ask.from_line,
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
        ask.from_line,
    )
    statements = [
        st.model_copy(update={"text": cite_flow.looking_line(asked, job["subject"])})
        if st.kind == "citation_request" and st.request is not None
        else st
        for st in Answer.model_validate(state["answer"]).statements
    ]
    if job.get("offer") in (cite_state.get("offers") or {}):
        offers = dict(cite_state["offers"])
        offers[job["offer"]] = {**offers[job["offer"]], "ran": True}
        cite_state["offers"] = offers
    out = replace_reply(state, statements, cite_job={**job, "run": run.id}, cite=cite_state)
    out["steps"] = [
        *out["steps"],
        {"text": "Searching the journals", "done": False, "by": "cite"},
    ]
    return out


def cite_wait(deps: Deps, state: AgentState) -> dict:
    """One pass: wait a little for news from the search, then show it. The graph
    loops here until the search ends; each pass tells cite someone is still there."""
    run = deps.cite.get(state["cite_job"]["run"])
    if run is None:
        return {}
    run.touch()
    deadline = time.monotonic() + deps.cite_poll
    lines = run.take_lines()
    while not lines and not run.done() and time.monotonic() < deadline:
        time.sleep(min(0.25, deps.cite_poll))
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


def searching(deps: Deps, state: AgentState) -> str:
    run = deps.cite.get(state["cite_job"]["run"])
    return "cite_report" if run is None or run.done() else "cite_wait"


def cite_report(deps: Deps, state: AgentState) -> dict:
    store = deps.store
    job = state["cite_job"]
    run = deps.cite.get(job["run"])
    cite_state = dict(state.get("cite") or {})
    findings = dict(cite_state.get("findings") or {})
    feature_ref = Ref(type="feature", id=job["section_id"], label=job["subject"])
    outcome = "nothing came back"
    if run is None:
        report = [Statement(kind="searched", text=cite_flow.CITE_LINES["lost"], refs=[feature_ref])]
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
                Statement(kind="searched", text=cite_flow.CITE_LINES["failed"], refs=[feature_ref])
            ]
        else:
            records = cite_flow.findings_of(result, job["section_id"], len(findings) + 1)
            try:
                feature = store.feature(job["section_id"])
                cite_flow.mark_held(records, [feature, *with_merged(store, feature)[0]])
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
    return replace_reply(state, [*statements, *report], cite=cite_state, cite_job=None)
