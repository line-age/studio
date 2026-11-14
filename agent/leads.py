"""Leads: where to look next, found by code by fixed rules over a section's context.

A lead is not a claim. It is never written to store. Its kind says so ("Lead, not in
store" in Studio and in plain text); each names its rule, rests on and rests on things store holds
(a claim, a link, a printing), never on the model's own knowledge, a basemap label, a
name that looks alike, a line's shape or a guessed build date. More independent backing
ranks a lead higher: the number of distinct sources behind the same value. No scores.

The rules (origin R7):
1. neighbour_source: a neighbour's claim is cited to a source and page; look there.
2. neighbour_owner: a neighbour's owner or operator is worth checking here. Not diameter.
3. pipeline_claims: its pipeline's own owner or operator.
4. edition_window: the years between an earlier printing it is not traced on and the
   first it is traced on, as when to search. Never a build date.
5. proposed_link: what confirming a proposed same_as would carry over. Store counts a
   trace's claims as the section's only through same_as (or a split); a proposed
   overlaps carries no claims, and its end is the editions' to say (context.py).
6. rejected_value: a value ruled out for it, so it is not proposed again. A value ruled
   out is never offered by another rule.
7. conflict: accepted claims that disagree for years known to overlap; to resolve, not
   to pick.

A claim that cannot be put into words gives no lead; it never fails the rest.
"""

import re
from collections.abc import Callable
from typing import Any

from context import Editions, first_shown
from render import Unfillable, feature_name, one_full_stop, period_words, source_of, value_words
from schemas import Lead

ASKED_FOR = ("owner", "operator", "name", "diameter")
# A neighbour's or pipeline's value worth checking here. Never diameter: pipe size
# changes from one section to the next.
CARRIED = ("owner", "operator")
RULE_ORDER = (
    "neighbour_source",
    "neighbour_owner",
    "pipeline_claims",
    "proposed_link",
    "edition_window",
    "rejected_value",
    "conflict",
)
_YEAR = re.compile(r"\d{4}")


def _accepted(features: list[dict[str, Any]], attribute: str) -> list[dict[str, Any]]:
    return [
        c
        for f in features
        for c in f.get("claims") or []
        if c["attribute_key"] == attribute and c["status"] == "accepted"
    ]


def _cited_page(claim: dict[str, Any]) -> tuple[str, str] | None:
    """A text that states the claim, with where in it: (title, locator)."""
    for citation in claim.get("citations") or []:
        if (
            citation.get("role") == "states"
            and citation.get("source_title")
            and citation.get("locator")
        ):
            return str(citation["source_title"]), str(citation["locator"])
    return None


def _source_key(claim: dict[str, Any]) -> str:
    """What makes two claims' backing the same: the same source and page."""
    for citation in claim.get("citations") or []:
        source = citation.get("source_id") or citation.get("source_title")
        if source:
            return f"{source}|{citation.get('locator') or ''}"
    return f"claim|{claim['id']}"


def _years(claim: dict[str, Any]) -> tuple[int | None, int | None]:
    """The first and last year a claim may hold, from its bounds or its EDTF; None where
    the record does not say."""

    def year(text: Any) -> int | None:
        found = _YEAR.search(str(text or ""))
        return int(found.group()) if found else None

    start = year(claim.get("start_earliest")) or year(claim.get("start_latest"))
    end = year(claim.get("end_latest")) or year(claim.get("end_earliest"))
    edtf = str(claim.get("valid_edtf") or "")
    if "/" in edtf:
        first, _, last = edtf.partition("/")
        start = start or year(first)
        end = end or year(last)
    elif edtf:
        start = start or year(edtf)
        end = end or year(edtf)
    return start, end


def _same_years(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Do two claims hold for years known to overlap? Unknown ends are left open; with
    no year at all on either, it is not known, so not said."""
    (a0, a1), (b0, b1) = _years(a), _years(b)
    if not any((a0, a1)) or not any((b0, b1)):
        return False
    lo_a, hi_a = a0 or a1, a1 or 9999
    lo_b, hi_b = b0 or b1, b1 or 9999
    return lo_a <= hi_b and lo_b <= hi_a


def find_leads(
    feature: dict[str, Any],
    merged: list[dict[str, Any]],
    neighbours: list[dict[str, Any]],
    pipelines: list[dict[str, Any]],
    twins: list[tuple[dict[str, Any], dict[str, Any]]],
    editions: Editions,
    handle: Callable[[], str],
) -> list[Lead]:
    """Every lead the rules find for a section, best backed first.

    `merged` are traces store counts as the section's own; `twins` are (proposed
    same_as link, the other trace) pairs, whichever end the section is.
    """
    me = feature_name(feature)
    own = [feature, *merged]
    holds = {a for a in ASKED_FOR if _accepted(own, a)}
    ruled_out = {
        (c["attribute_key"], value_words(c))
        for f in own
        for c in f.get("claims") or []
        if c["status"] == "rejected" and c["attribute_key"] in ASKED_FOR and _has_words(c)
    }
    found: list[dict[str, Any]] = []

    claims_by_id = {
        c["id"]: c
        for f in (*own, *neighbours, *pipelines, *(t for _, t in twins))
        for c in f.get("claims") or []
    }

    def lead(rule: str, text: str, attribute: str | None, rests_on: list[str], **more):
        cited = next((claims_by_id[i] for i in rests_on if i in claims_by_id), None)
        found.append(
            {
                "rule": rule,
                "text": one_full_stop(text),
                "attribute": attribute,
                "rests_on": [feature["id"], *rests_on],
                "source": source_of(cited) if cited else None,
                **more,
            }
        )

    def offered(claim: dict[str, Any]) -> tuple[str, str] | None:
        """The (attribute, value) a claim would offer here, unless it was ruled out."""
        value = (claim["attribute_key"], value_words(claim))
        return None if value in ruled_out else value

    def each(claims: list[dict[str, Any]]):
        for claim in claims:
            try:
                yield claim, offered(claim), period_words(claim)
            except Unfillable:
                continue  # no words for it: no lead, and the rest go on

    # 1 and 2: what the sections drawn touching it hold.
    for other in neighbours:
        them = feature_name(other)
        for attribute in ASKED_FOR:
            if attribute in holds:
                continue
            for claim, value, period in each(_accepted([other], attribute)):
                page = _cited_page(claim)
                if page:
                    lead(
                        "neighbour_source",
                        f"{page[0]}, {page[1]} names the {attribute} of {them}, drawn "
                        f"touching {me}. The same page may name {me}'s {attribute} too.",
                        attribute,
                        [claim["id"]],
                        page=page,
                    )
                if attribute in CARRIED and value:
                    lead(
                        "neighbour_owner",
                        f"{them}, drawn touching {me}, has the {attribute} {value[1]}, "
                        f"{period}. Worth checking whether that holds for {me}.",
                        attribute,
                        [claim["id"]],
                        value=value,
                        sources={_source_key(claim)},
                    )

    # 3: its pipeline's own owner or operator.
    for line in pipelines:
        name = feature_name(line)
        for attribute in CARRIED:
            if attribute in holds:
                continue
            for claim, value, period in each(_accepted([line], attribute)):
                if value:
                    lead(
                        "pipeline_claims",
                        f"The pipeline {me} is part of, {name}, has the {attribute} "
                        f"{value[1]}, {period}. Worth checking whether that holds for {me} "
                        "itself.",
                        attribute,
                        [claim["id"]],
                        value=value,
                        sources={_source_key(claim)},
                    )

    # 5: what confirming a proposed same_as would carry over.
    for link, other in twins:
        them = feature_name(other)
        for attribute in ASKED_FOR:
            if attribute in holds:
                continue
            for claim, value, _period in each(_accepted([other], attribute)):
                if value:
                    lead(
                        "proposed_link",
                        f"It is proposed, not decided, that {them} is another trace of the "
                        f"same pipe as {me}. If someone confirms it, {me} takes its "
                        f"{attribute}, {value[1]}.",
                        attribute,
                        [link["id"], claim["id"]],
                        value=value,
                        sources={_source_key(claim)},
                    )

    # 4: when to search, from the earliest printing the section or a trace merged into
    # it is traced on.
    shown = [s for f in own if (s := first_shown(f))]
    if shown and editions.complete:
        year, claim = min(shown, key=lambda pair: pair[0])
        earlier = [y for y in editions.years if y < year]
        if earlier:
            lead(
                "edition_window",
                f"{me} is first traced on the {year} printing and is not "
                f"traced on the earlier {earlier[-1]} one, so sources from {earlier[-1]} to "
                f"{year} are where to look for when it first appears. A window to search, "
                "never a build date.",
                None,
                [claim["id"]],
            )

    # 6: values ruled out, so no one proposes them again.
    for f in own:
        for claim in f.get("claims") or []:
            if claim["status"] != "rejected" or claim["attribute_key"] not in ASKED_FOR:
                continue
            if not _has_words(claim):
                continue
            lead(
                "rejected_value",
                f"{value_words(claim)} was ruled out as the "
                f"{claim['attribute_key']} of {me}. Do not propose it again.",
                claim["attribute_key"],
                [claim["id"]],
            )

    # 7: accepted claims, its own or a merged trace's, that disagree for the same years.
    for attribute in ASKED_FOR:
        claims = [c for c in _accepted(own, attribute) if _has_words(c)]
        for n, a in enumerate(claims):
            for b in claims[n + 1 :]:
                if value_words(a) != value_words(b) and _same_years(a, b):
                    lead(
                        "conflict",
                        f"{me} has two accepted {attribute} "
                        f"values for the same years, {value_words(a)} and {value_words(b)}. "
                        "To resolve, not to pick.",
                        attribute,
                        [a["id"], b["id"]],
                    )

    # One lead per thing said: two neighbours citing the same page are one place to look.
    unique: dict[tuple[Any, ...], dict[str, Any]] = {}
    for item in found:
        key = (item["rule"], item.get("page") or item.get("value") or item["text"])
        if key in unique and "value" in item:
            unique[key]["sources"] |= item["sources"]
            unique[key]["rests_on"] += item["rests_on"][1:]
        unique.setdefault(key, item)

    # Backing: distinct sources behind the same value, across rules. A link is not one.
    backing: dict[tuple[str, str], set[str]] = {}
    for item in unique.values():
        if item.get("value"):
            backing.setdefault(item["value"], set()).update(item["sources"])

    def rank(item: dict[str, Any]) -> tuple[int, int]:
        count = len(backing.get(item.get("value"), ())) if item.get("value") else 1
        return -count, RULE_ORDER.index(item["rule"])

    return [
        Lead(
            handle=handle(),
            rule=item["rule"],
            text=item["text"],
            attribute=item["attribute"],
            source=item.get("source"),
            rests_on=list(dict.fromkeys(item["rests_on"])),
            backing=-rank(item)[0],
        )
        for item in sorted(unique.values(), key=rank)
    ]


def _has_words(claim: dict[str, Any]) -> bool:
    try:
        value_words(claim)
        return True
    except Unfillable:
        return False
