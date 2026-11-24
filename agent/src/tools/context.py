"""What surrounds one section: its context, worked out by code, and the sections nearest
it."""

import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from src.agent.config import CONTEXT_FOR
from src.answer.render import feature_name, is_traced_as_gone
from src.clients.store_client import StoreError
from src.tools.handles import Handles
from src.tools.question import QuestionContext
from src.tools.views import not_found, own_claims, with_merged
from src.worked_out import context, leads, pack


@tool(response_format="content_and_artifact")
def read_context(
    section_id: str, runtime: ToolRuntime[QuestionContext]
) -> tuple[str, dict[str, Any]]:
    """What code works out about one section from store, beyond its own claims: which
    map printing first shows it, what store holds about its end, what its links say
    (its pipeline, with the pipeline's own claims, other traces of the same pipe, a
    pipe beside it), the sections drawn touching it with their own claims, and leads:
    where to look next, found by fixed rules. Each item is a sentence code wrote. Say what you
    need of them in your own answer; a lead is a suggestion, never a fact."""
    question = runtime.context
    with question.lock:
        if section_id in question.contexts_read:
            return f"You already read the context of {section_id}. Use that result.", {}
        if len(question.contexts_read) >= CONTEXT_FOR:
            # Full context for a few sections; the rest are answered from their claims
            # (owner, 2026-11-14). Saying so costs no store read.
            return (
                f"Context is worked out for {CONTEXT_FOR} sections per question, and "
                "they are read. Answer the others from their claims."
            ), {}
        question.contexts_read.add(section_id)  # held now, so parallel calls do not both run
    try:
        content, artifact = _context_of(question.store, question.handles, section_id)
    except Exception:
        with question.lock:
            question.contexts_read.discard(section_id)  # a failed try can be tried again
        raise
    if "context_of" not in artifact:
        # Not a section, or no such id: nothing was read, so it uses no slot.
        with question.lock:
            question.contexts_read.discard(section_id)
    return content, artifact


def _context_of(store: Any, handles: Handles, section_id: str) -> tuple[str, dict[str, Any]]:
    try:
        feature = store.feature(section_id)
    except StoreError as error:
        if error.kind in ("not_found", "bad_request"):
            return not_found(section_id)
        raise
    if feature.get("kind") != "section":
        return "Context is worked out for a section only.", {}
    # Counted as read with its merged traces, as read_feature counts it.
    merged, _ = with_merged(store, feature)
    known = {m["id"]: m for m in merged}

    def printings() -> context.Editions:
        try:
            return context.edition_years(store, feature.get("network"))
        except StoreError:
            # A help only: without it nothing is said of an earlier printing.
            return context.Editions([], complete=False)

    # Independent store reads, at once.
    with ThreadPoolExecutor(max_workers=3) as pool:
        ends_job = pool.submit(context.read_ends, store, feature, known)
        editions_job = pool.submit(printings)
        near_job = pool.submit(context.find_neighbours, store, feature)
        ends, editions, near = ends_job.result(), editions_job.result(), near_job.result()
    touching = context.read_many(store, [sid for sid, _, _ in near.found], known=ends)
    found = [(touching[sid], meets) for sid, meets, _ in near.found if sid in touching]
    unmeasured = near.unmeasured or (
        "some of them could not be read just now" if len(found) < len(near.found) else None
    )
    worked = (
        context.edition_facts(feature, ends, editions, handles.worked, merged)
        + context.link_facts(feature, ends, handles.worked)
        + context.no_pipeline_fact(feature, handles.worked)
        + context.neighbour_facts(feature, found, unmeasured, handles.worked)
        + context.place_facts(feature, handles.worked)
        + context.gap_facts(feature, merged, handles.worked)
    )
    view: dict[str, Any] = {
        "section": feature_name(feature),
        "worked_out": [
            {"handle": w.handle, "text": w.text} | ({"values": w.values} if w.values else {})
            for w in worked
        ],
    }
    # Its pipeline's own claims, kept apart: they are the pipeline's, not the section's.
    lines = [
        ends[link["to_feature_id"]]
        for link in feature.get("links") or []
        if link["relation"] == "part_of"
        and link["status"] == "confirmed"
        and link["to_feature_id"] in ends
    ]
    if lines:
        view["its_pipeline"] = [
            {
                "pipeline": context.pipeline_words(line),
                "claims_of_the_pipeline": own_claims(line, handles),
            }
            for line in lines
        ]
    scope = {feature["id"], *known}
    # A proposed same_as, whichever end this section is, to a trace (not a line traced
    # as gone, whose end is the editions' to say).
    twins = [
        (link, ends[other_id])
        for link in feature.get("links") or []
        if link["relation"] == "same_as"
        and link["status"] == "proposed"
        and (
            other_id := link["to_feature_id"]
            if link["from_feature_id"] == feature["id"]
            else link["from_feature_id"]
        )
        in ends
        and not is_traced_as_gone(ends[other_id])
    ]
    found_leads = leads.find_leads(
        feature,
        merged,
        [other for other, _ in found if other["id"] not in scope],
        lines,
        twins,
        editions,
        handles.lead,
    )
    if found_leads:
        view["leads"] = [
            {"handle": lead.handle, "rule": lead.rule, "text": lead.text} for lead in found_leads
        ]
    if found:
        # Each neighbour's own claims, kept under it: they are that section's.
        view["drawn_touching"] = [
            {
                "section": feature_name(other),
                "claims_of_that_section": own_claims(other, handles),
            }
            for other, _ in found
        ]
    artifact = {
        "context_of": feature["id"],
        "features": [feature, *merged],
        "context_features": [*ends.values(), *(other for other, _ in found)],
        "worked_out": [w.model_dump() for w in worked],
        "leads": [lead.model_dump() for lead in found_leads],
        # The same, kept whole: cite's brief (contract/section-pack.schema.json).
        "pack": pack.build_pack(
            feature,
            merged,
            ends,
            lines,
            [(touching[sid], meets, gap) for sid, meets, gap in near.found if sid in touching],
            # cite's brief says what is drawn and held, never what is not known.
            [w for w in worked if w.what not in ("built", "missing")],
            found_leads,
            handles.of,
        ).model_dump(),
    }
    return json.dumps(view, ensure_ascii=False), artifact


@tool(response_format="content_and_artifact")
def find_nearby(
    section_id: str, runtime: ToolRuntime[QuestionContext]
) -> tuple[str, dict[str, Any]]:
    """The sections in store nearest one section, however far away, nearest first, each with how far it is and what it shares with the section or
    differs in (owner, operator, diameter, the first printing that shows it), and its
    own claims. Use it when asked which other sections are near, nearby, close, in the
    area, or similar or like this one. Say the nearest ones and how far, in your
    own words; add what they share only when asked."""
    question = runtime.context
    store, handles = question.store, question.handles
    if section_id in question.nearby_read:
        return f"You already looked near {section_id}. Use that result.", {}
    try:
        feature = store.feature(section_id)
    except StoreError as error:
        if error.kind in ("not_found", "bad_request"):
            return not_found(section_id)
        raise
    if feature.get("kind") != "section":
        return "Nearby sections are found for a section only.", {}
    question.nearby_read.add(section_id)
    near = context.find_nearby(store, feature)
    read = context.read_many(store, [sid for sid, _ in near.found])
    found = [
        (read[sid], gap)
        for sid, gap in near.found
        if sid in read and not is_traced_as_gone(read[sid])
    ]
    unmeasured = near.unmeasured or (
        "some of them could not be read just now" if len(read) < len(near.found) else None
    )
    worked = context.nearby_facts(feature, found, unmeasured, handles.worked)
    view: dict[str, Any] = {
        "section": feature_name(feature),
        "worked_out": [{"handle": w.handle, "text": w.text} for w in worked],
        "nearby": [
            {
                "section": feature_name(other),
                "km_away": round(gap / 1_000, 1),
                "claims_of_that_section": own_claims(other, handles),
            }
            for other, gap in found
        ],
    }
    artifact = {
        "nearby_of": feature["id"],
        "context_features": [feature, *(other for other, _ in found)],
        "worked_out": [w.model_dump() for w in worked],
    }
    return json.dumps(view, ensure_ascii=False), artifact
