"""The Agent's tools. Each returns words for the model and, as its artifact, exactly what
store returned: the artifact is what the grounding ledger is built from."""

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from langchain_core.tools import BaseTool, tool

import context
import leads
import network
import pack
import together
from render import feature_name, is_traced_as_gone
from store_client import StoreClient, StoreError

# What the model is shown of a claim. The ids are what it cites; everything else is what
# it may say, in its own words, only through slots.
_CLAIM_FIELDS = (
    "id",
    "attribute_key",
    "value_text",
    "value_num",
    "value_unit",
    "valid_edtf",
    "start_earliest",
    "start_latest",
    "end_earliest",
    "end_latest",
    "status",
    "asserted_by_kind",
    "asserted_by_name",
)


class Handles:
    """Short names for the claims a question read (C1, C2, ...). A model copies `C7`
    reliably; it does not always copy a 36-character id. Code turns them back into ids."""

    def __init__(self) -> None:
        self.ids: dict[str, str] = {}
        self._of: dict[str, str] = {}
        self._worked = 0
        self._leads = 0
        # Reads run in parallel threads; two claims must never get the same handle.
        self._lock = threading.Lock()

    def of(self, claim_id: str) -> str:
        with self._lock:
            if claim_id not in self._of:
                handle = f"C{len(self._of) + 1}"
                self._of[claim_id], self.ids[handle] = handle, claim_id
            return self._of[claim_id]

    def worked(self) -> str:
        """The next handle for something code worked out: W1, W2, ..."""
        with self._lock:
            self._worked += 1
            return f"W{self._worked}"

    def lead(self) -> str:
        """The next handle for a lead code found: L1, L2, ..."""
        with self._lock:
            self._leads += 1
            return f"L{self._leads}"

    def resolve(self, ref_id: str) -> str:
        return self.ids.get(ref_id.strip().upper(), ref_id)


def _claim_view(claim: dict[str, Any], handles: Handles) -> dict[str, Any]:
    view = {k: claim[k] for k in _CLAIM_FIELDS if claim.get(k) is not None}
    view["id"] = handles.of(claim["id"])
    if claim.get("value_geom"):
        view["value"] = "a traced line (not shown, never a value to state)"
    view["citations"] = [
        {k: c[k] for k in ("role", "source_title", "source_kind", "locator", "quote") if c.get(k)}
        for c in claim.get("citations") or []
    ]
    view["reviews"] = [r["verdict"] for r in claim.get("reviews") or []]
    return view


def _feature_view(
    feature: dict[str, Any], merged: list[dict[str, Any]], handles: Handles
) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": feature["kind"],
        "label": feature.get("label"),
        "dates": feature.get("dates"),
        "claims": [_claim_view(c, handles) for c in feature["claims"]],
        "held_through_a_merged_trace": [
            {"trace_id": m["id"], "claims": [_claim_view(c, handles) for c in m["claims"]]}
            for m in merged
        ],
        "links": [
            {k: link[k] for k in ("id", "relation", "status", "from_feature_id", "to_feature_id")}
            for link in feature["links"]
        ],
    }


def _merged_into(feature: dict[str, Any]) -> list[str]:
    """Features whose claims store counts as this section's own: a trace merged into it
    (confirmed same_as to it) or the section it was split from (confirmed split_into)."""
    return [
        link["from_feature_id"]
        for link in feature["links"]
        if link["to_feature_id"] == feature["id"]
        and link["relation"] in ("same_as", "split_into")
        and link["status"] == "confirmed"
    ]


# Full context for this many sections per question; the rest get their claims (owner,
# 2026-11-14).
CONTEXT_FOR = 3


def _with_merged(
    store: StoreClient, feature: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[str]]:
    """Traces merged into a section, and traces merged into those, as store counts them;
    and the ids of any that could not be read."""
    merged: list[dict[str, Any]] = []
    missing: list[str] = []
    visited = {feature["id"]}
    queue = _merged_into(feature)
    while queue:
        fid = queue.pop(0)
        if fid in visited:
            continue
        visited.add(fid)
        try:
            found = store.feature(fid)
        except StoreError as error:
            if error.kind not in ("not_found", "bad_request"):
                raise
            missing.append(fid)
            continue
        merged.append(found)
        queue += _merged_into(found)
    return merged, missing


def make_tools(
    store: StoreClient, handles: Handles | None = None, network_key: str | None = None
) -> list[BaseTool]:
    """Tools for one question. A feature read twice in the same question is not fetched
    again: the model is told it already has it. Claims are shown by handle (`handles`)."""
    seen: set[str] = set()
    context_seen: set[str] = set()
    context_lock = threading.Lock()
    handles = handles if handles is not None else Handles()

    @tool(response_format="content_and_artifact")
    def read_feature(feature_id: str) -> tuple[str, dict[str, Any]]:
        """Read everything store holds about one feature (a section or a pipeline) by its id:
        every claim with its status and citations, and every link. Claims of a trace merged
        into a section are listed under held_through_a_merged_trace and count as the
        section's own. A section's pipeline is the `to` end of a confirmed part_of link;
        read it by its id to see the pipeline's own claims."""
        if feature_id in seen:
            note = f"You already read {feature_id} for this question. Use that result."
            return note, {}
        try:
            feature = store.feature(feature_id)
        except StoreError as error:
            if error.kind in ("not_found", "bad_request"):
                return (
                    f"Store has no feature with the id {feature_id}.",
                    {"not_found": feature_id},
                )
            raise
        merged, missing = _with_merged(store, feature)
        seen.add(feature_id)
        view = _feature_view(feature, merged, handles)
        if missing:
            view["could_not_read"] = (
                f"{len(missing)} trace(s) merged into this section could not be read, so "
                "what store holds for it may be more than shown here."
            )
        return json.dumps(view, ensure_ascii=False), {"features": [feature, *merged]}

    @tool(response_format="content_and_artifact")
    def read_context(section_id: str) -> tuple[str, dict[str, Any]]:
        """What code works out about one section from store, beyond its own claims: which
        map printing first shows it, what store holds about its end, what its links say
        (its pipeline, with the pipeline's own claims, other traces of the same pipe, a
        pipe beside it), the sections drawn touching it with their own claims, and leads:
        where to look next, found by fixed rules. Each item is a sentence code wrote. Say what you
        need of them in your own answer; a lead is a suggestion, never a fact."""
        with context_lock:
            if section_id in context_seen:
                return f"You already read the context of {section_id}. Use that result.", {}
            if len(context_seen) >= CONTEXT_FOR:
                # Full context for a few sections; the rest are answered from their claims
                # (owner, 2026-11-14). Saying so costs no store read.
                return (
                    f"Context is worked out for {CONTEXT_FOR} sections per question, and "
                    "they are read. Answer the others from their claims."
                ), {}
            context_seen.add(section_id)  # held now, so parallel calls do not both run
        try:
            content, artifact = _context_of(section_id)
        except Exception:
            with context_lock:
                context_seen.discard(section_id)  # a failed try can be tried again
            raise
        if "context_of" not in artifact:
            # Not a section, or no such id: nothing was read, so it uses no slot.
            with context_lock:
                context_seen.discard(section_id)
        return content, artifact

    def _context_of(section_id: str) -> tuple[str, dict[str, Any]]:
        try:
            feature = store.feature(section_id)
        except StoreError as error:
            if error.kind in ("not_found", "bad_request"):
                return (
                    f"Store has no feature with the id {section_id}.",
                    {"not_found": section_id},
                )
            raise
        if feature.get("kind") != "section":
            return "Context is worked out for a section only.", {}
        # Counted as read with its merged traces, as read_feature counts it.
        merged, _ = _with_merged(store, feature)
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
                    "claims_of_the_pipeline": [
                        _claim_view(c, handles)
                        for c in line.get("claims") or []
                        if c["attribute_key"] != "route"
                    ],
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
                {"handle": lead.handle, "rule": lead.rule, "text": lead.text}
                for lead in found_leads
            ]
        if found:
            # Each neighbour's own claims, kept under it: they are that section's.
            view["drawn_touching"] = [
                {
                    "section": feature_name(other),
                    "claims_of_that_section": [
                        _claim_view(c, handles)
                        for c in other.get("claims") or []
                        if c["attribute_key"] != "route"
                    ],
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
    def sections_together(section_ids: list[str]) -> tuple[str, dict[str, Any]]:
        """Two or more sections taken together, worked out by code: for name, owner,
        operator and diameter whether they are the same, differ or are not known; which
        map first shows each and which is shown earlier; how long each is drawn and which
        is longer; which are in a pipeline and whether it is the same one; for two,
        whether they are drawn touching or how far apart; the states they lie in. More
        than two are summarised with counts and the exceptions by name. Use it to
        compare, for "in common", "differ", "older", "longer", "same pipeline", "which of
        these", and for what is known about many sections. Each sentence says what it is
        `about` and is labelled `says`: same (they share it), differs (they do not, or only
        some have it), nothing_known, or all_of_them (a total or a list). Say what answers
        the question in your own words, with these values as given."""
        ids = list(dict.fromkeys(section_ids))
        if len(ids) < 2:
            return "Give two or more sections.", {}
        read = context.read_many(store, ids)
        gone = [i for i in ids if i not in read]
        if gone:
            return f"Store has no feature with the id {gone[0]}.", {"not_found": gone[0]}
        if any(f.get("kind") != "section" for f in read.values()):
            return "Only sections are taken together.", {}
        merged_of = {i: _with_merged(store, read[i])[0] for i in ids}
        sections = [together.Section(read[i], merged_of[i]) for i in ids]
        line_ids = [
            p for s in sections for st in ("confirmed", "proposed") for p in s.pipelines(st)
        ]
        lines = context.read_many(store, line_ids)
        facts = together.together_facts(sections, lines, handles.worked)
        view = {
            "sections": [s.name for s in sections],
            "worked_out": [
                {"handle": w.handle, "about": t, "says": together.says(w.text), "text": w.text}
                for t, w in facts
            ],
        }
        artifact = {
            "together": ids,
            "context_features": [
                *read.values(),
                *(m for ms in merged_of.values() for m in ms),
                *lines.values(),
            ],
            "worked_out": [w.model_dump() for _, w in facts],
        }
        return json.dumps(view, ensure_ascii=False), artifact

    @tool(response_format="content_and_artifact")
    def pipeline_sections(pipeline_id: str) -> tuple[str, dict[str, Any]]:
        """A pipeline's sections, worked out by code: how many it has and which, and,
        taking them together, what they share and where they differ (owner, operator,
        diameter, first map, the states they lie in), how long they are drawn in all,
        and which of them lack a fact. Use it for any question about a pipeline as a
        whole: which sections are in it, how long it is, where it runs, when it first
        appears on a map, what its sections have in common, which of them have no
        diameter, what is missing. Each sentence says what it is `about` and is labelled
        `says` (same, differs, nothing_known, all_of_them). Say what answers the question
        in your own words, with these values as given."""
        try:
            line = store.feature(pipeline_id)
        except StoreError as error:
            if error.kind in ("not_found", "bad_request"):
                return (
                    f"Store has no feature with the id {pipeline_id}.",
                    {"not_found": pipeline_id},
                )
            raise
        if line.get("kind") != "line":
            return "Only a pipeline has sections.", {}

        def ends(status: str) -> list[str]:
            return [
                link["from_feature_id"]
                for link in line.get("links") or []
                if link["relation"] == "part_of"
                and link["status"] == status
                and link["to_feature_id"] == line["id"]
            ]

        read = context.read_many(store, [*ends("confirmed"), *ends("proposed")])
        member_ids = [i for i in ends("confirmed") if i in read]
        merged_of = {i: _with_merged(store, read[i])[0] for i in member_ids}
        members = [together.Section(read[i], merged_of[i]) for i in member_ids]
        waiting = [read[i] for i in ends("proposed") if i in read]
        facts = [("sections", together.members_fact(line, members, waiting, handles.worked))]
        total = together.total_length(members)
        if total:
            # Two sections: their length in all, which comparing the two does not give.
            facts.append(
                (
                    "length",
                    together.WorkedOut(
                        handle=handles.worked(),
                        what="together",
                        text=total[0],
                        rests_on=member_ids,
                    ),
                )
            )
        if len(members) > 1:
            facts += [
                ("longer" if t == "length" and total else t, w)
                for t, w in together.together_facts(members, {line["id"]: line}, handles.worked)
                if t != "pipeline"  # they are all in this one: said by the count
            ]
        elif members:
            facts += [(w.what, w) for w in context.place_facts(read[member_ids[0]], handles.worked)]
        view = {
            "pipeline": context.pipeline_words(line),
            "worked_out": [
                {
                    "handle": w.handle,
                    "about": t,
                    # One section: nothing to share or differ in.
                    "says": together.says(w.text) if len(members) > 1 else "all_of_them",
                    "text": w.text,
                }
                | ({"values": w.values} if w.values else {})
                for t, w in facts
            ],
        }
        artifact = {
            "sections_of": line["id"],
            "members": member_ids,
            "context_features": [
                line,
                *read.values(),
                *(m for ms in merged_of.values() for m in ms),
            ],
            "worked_out": [w.model_dump() for _, w in facts],
        }
        return json.dumps(view, ensure_ascii=False), artifact

    @tool(response_format="content_and_artifact")
    def find_sections(
        lacking: str | None = None,
        first_shown: int | None = None,
        state: str | None = None,
        in_pipeline: bool | None = None,
        proposal_waiting: bool | None = None,
        diameter: str | None = None,
        end: str | None = None,
        longer_than_km: float | None = None,
        shorter_than_km: float | None = None,
    ) -> tuple[str, dict[str, Any]]:
        """Sections across the whole network that match a rule, counted by code, with
        the first ten named. Nothing needs to be attached. Rules, any of them together:
        `lacking`: a fact no source gives yet, one of name, owner, operator, diameter
        ("how many sections have no owner"); `first_shown`: the year of the map that
        first shows them ("which sections first appear in 1931"); `state`: a US state by
        its full name ("which sections are in Oklahoma"); `in_pipeline`: true for those
        in a pipeline, false for those in none; `proposal_waiting`: true for those with
        a value proposed and not decided yet ("which have a proposal waiting", "what
        should I work on next"); `diameter`: a diameter in inches, as "31 in" ("which
        sections are 31 inch"); `end`: "proposed" for those with an end proposed and not
        decided, "no_longer_shown" for those a later map is confirmed to have dropped;
        `longer_than_km` and `shorter_than_km`: by length as drawn ("sections longer than
        100 km"; give miles as km). With no rule it says how many sections there are. The
        result is one sentence: say it in your own words, with its counts and names as
        given."""
        if lacking is not None and lacking not in network.LACKABLE:
            return f"lacking is one of {', '.join(network.LACKABLE)}.", {}
        spelled = network.state_named(state) if state else None
        if state and not spelled:
            return f"There is no US state called {state}. Give its full name.", {}
        inches = network.diameter_named(diameter) if diameter else None
        if diameter and not inches:
            return 'Give the diameter in inches, as "31 in".', {}
        if end is not None and end not in network.END_STATUS:
            return "end is proposed or no_longer_shown.", {}
        listing = store.sections(network=network_key)
        sections = network.sections_of(listing.rows)
        cut = listing.cut
        lacking_ids = None
        if lacking:
            missing = store.missing(lacking, network=network_key)
            lacking_ids = {row["section_id"] for row in missing.rows}
            cut = cut or missing.cut
        found, words = network.find(
            sections,
            lacking_ids,
            lacking,
            first_shown,
            spelled,
            in_pipeline,
            proposal_waiting,
            inches,
            end,
            longer_than_km,
            shorter_than_km,
        )
        fact = network.network_fact(sections, found, words, cut, handles.worked)
        named = {s.id: s for s in found}
        view = {"worked_out": [{"handle": fact.handle, "text": fact.text}]}
        artifact = {
            "network": len(sections),
            "context_features": [named[i].stub() for i in fact.rests_on],
            "worked_out": [fact.model_dump()],
        }
        return json.dumps(view, ensure_ascii=False), artifact

    @tool(response_format="content_and_artifact")
    def find_pipelines(
        lacking: str | None = None, proposed_only: bool | None = None
    ) -> tuple[str, dict[str, Any]]:
        """Pipelines across the whole network that match a rule, counted by code, with
        the first ten named. Nothing needs to be attached. Rules, either or both:
        `lacking`: a fact no source gives for the pipeline itself, one of name, owner,
        operator ("which pipelines have no owner"); `proposed_only`: true for pipelines
        that are only proposed, with no section decided yet, false for those with at
        least one section decided. With no rule it says how many pipelines there are.
        Use it for questions about pipelines; find_sections is for sections. The result
        is one sentence: say it in your own words, with its counts and names as given."""
        if lacking is not None and lacking not in network.PIPELINE_LACKABLE:
            return f"lacking is one of {', '.join(network.PIPELINE_LACKABLE)}.", {}
        links = store.links(relation="part_of")
        counts: dict[str, list[int]] = {}
        for link in links.rows:
            if link["status"] != "rejected":
                tally = counts.setdefault(link["to_feature_id"], [0, 0])
                tally[0 if link["status"] == "confirmed" else 1] += 1
        read = context.read_many(store, list(counts))
        pipelines = sorted(
            (
                network.Pipeline(f, *counts[i])
                for i, f in read.items()
                if f.get("kind") == "line"
                and (network_key is None or f.get("network") == network_key)
            ),
            key=lambda p: p.name,
        )
        cut = links.cut or len(read) < len(counts)
        fact = network.pipelines_fact(pipelines, lacking, proposed_only, cut, handles.worked)
        by_id = {p.id: p.feature for p in pipelines}
        view = {"worked_out": [{"handle": fact.handle, "text": fact.text}]}
        artifact = {
            "network_pipelines": len(pipelines),
            "context_features": [by_id[i] for i in fact.rests_on],
            "worked_out": [fact.model_dump()],
        }
        return json.dumps(view, ensure_ascii=False), artifact

    nearby_seen: set[str] = set()

    @tool(response_format="content_and_artifact")
    def find_nearby(section_id: str) -> tuple[str, dict[str, Any]]:
        """The sections in store nearest one section, however far away, nearest first, each with how far it is and what it shares with the section or
        differs in (owner, operator, diameter, the first printing that shows it), and its
        own claims. Use it when asked which other sections are near, nearby, close, in the
        area, or similar or like this one. Say the nearest ones and how far, in your
        own words; add what they share only when asked."""
        if section_id in nearby_seen:
            return f"You already looked near {section_id}. Use that result.", {}
        try:
            feature = store.feature(section_id)
        except StoreError as error:
            if error.kind in ("not_found", "bad_request"):
                return (
                    f"Store has no feature with the id {section_id}.",
                    {"not_found": section_id},
                )
            raise
        if feature.get("kind") != "section":
            return "Nearby sections are found for a section only.", {}
        nearby_seen.add(section_id)
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
                    "claims_of_that_section": [
                        _claim_view(c, handles)
                        for c in other.get("claims") or []
                        if c["attribute_key"] != "route"
                    ],
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

    return [
        read_feature,
        read_context,
        find_nearby,
        sections_together,
        pipeline_sections,
        find_sections,
        find_pipelines,
    ]
