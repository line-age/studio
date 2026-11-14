"""Leads: where to look next, found by code by fixed rules over a section's context.

A lead is not a claim. It is never written to store and always says so: "Not in store".
Each names its rule and rests on things store holds (a claim, a link, a printing), never
on the model's own knowledge, a basemap label, a name that looks alike, a line's shape or
a guessed build date. More independent backing ranks a lead higher; there are no scores.

The rules (origin R7):
1. neighbour_source: a neighbour's claim is cited to a source and page; look there.
2. neighbour_owner: a neighbour's owner or operator is worth checking here. Not diameter.
3. pipeline_claims: its pipeline's own owner or operator.
4. edition_window: the years between an earlier printing without it and the first with
   it, as when to search. Never a build date.
5. proposed_link: what confirming a proposed same_as would carry over.
6. rejected_value: a value ruled out for it, so it is not proposed again.
7. conflict: accepted claims that disagree for the same years; to resolve, not to pick.
"""

from collections.abc import Callable
from typing import Any

from context import Editions, first_shown
from render import feature_name, period_words, value_words
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


def _accepted(feature: dict[str, Any], attribute: str) -> list[dict[str, Any]]:
    return [
        c
        for c in feature.get("claims") or []
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


def _overlap(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Do two claims' periods overlap? Unknown bounds count as open."""
    a_start = a.get("start_earliest") or a.get("start_latest") or a.get("valid_edtf", "")[:4] or ""
    b_start = b.get("start_earliest") or b.get("start_latest") or b.get("valid_edtf", "")[:4] or ""
    a_end = a.get("end_latest") or a.get("end_earliest") or "9999"
    b_end = b.get("end_latest") or b.get("end_earliest") or "9999"
    return str(a_start)[:4] <= str(b_end)[:4] and str(b_start)[:4] <= str(a_end)[:4]


def find_leads(
    feature: dict[str, Any],
    holds: Callable[[str], bool],
    neighbours: list[dict[str, Any]],
    pipelines: list[dict[str, Any]],
    twins: list[tuple[dict[str, Any], dict[str, Any]]],
    editions: Editions,
    handle: Callable[[], str],
) -> list[Lead]:
    """Every lead the rules find for a section, best backed first.

    `holds(attribute)` says whether store holds an accepted claim for it, counting merged
    traces. `twins` are (proposed same_as link, the other trace) pairs.
    """
    me = feature_name(feature)
    found: list[tuple[str, str, str | None, list[str], tuple[str, str] | None]] = []

    def lead(rule: str, text: str, attribute: str | None, rests_on: list[str], value=None):
        found.append((rule, text, attribute, [feature["id"], *rests_on], value))

    # 1 and 2: what the sections drawn touching it hold.
    for other in neighbours:
        them = feature_name(other)
        for attribute in ASKED_FOR:
            if holds(attribute):
                continue
            for claim in _accepted(other, attribute):
                page = _cited_page(claim)
                if page:
                    lead(
                        "neighbour_source",
                        f"Not in store: {them}, drawn touching {me}, has its {attribute} "
                        f"cited to {page[0]}, {page[1]}. That page may say {me}'s "
                        f"{attribute} too.",
                        attribute,
                        [claim["id"]],
                    )
                if attribute in CARRIED:
                    value = value_words(claim)
                    lead(
                        "neighbour_owner",
                        f"Not in store: {them}, drawn touching {me}, has the {attribute} "
                        f"{value}, {period_words(claim)}. Worth checking whether that holds "
                        f"for {me}.",
                        attribute,
                        [claim["id"]],
                        (attribute, value),
                    )

    # 3: its pipeline's own owner or operator.
    for line in pipelines:
        name = feature_name(line)
        pipeline = name if name.startswith("pipeline ") else f"the pipeline {name}"
        for attribute in CARRIED:
            if holds(attribute):
                continue
            for claim in _accepted(line, attribute):
                value = value_words(claim)
                lead(
                    "pipeline_claims",
                    f"Not in store as {me}'s own: {pipeline}, which it is part of, has the "
                    f"{attribute} {value}, {period_words(claim)}. Worth checking whether "
                    f"that holds for {me}.",
                    attribute,
                    [claim["id"]],
                    (attribute, value),
                )

    # 5: what confirming a proposed same_as would carry over.
    for link, other in twins:
        them = feature_name(other)
        for attribute in ASKED_FOR:
            if holds(attribute):
                continue
            for claim in _accepted(other, attribute):
                value = value_words(claim)
                lead(
                    "proposed_link",
                    f"Not in store yet: it is proposed, not decided, that {them} is another "
                    f"trace of the same pipe as {me}. If someone confirms it, {me} takes "
                    f"its {attribute}, {value}.",
                    attribute,
                    [link["id"], claim["id"]],
                    (attribute, value),
                )

    # 4: when to search.
    first = first_shown(feature)
    if first and editions.complete:
        year, claim = first
        earlier = [y for y in editions.years if y < year]
        if earlier:
            lead(
                "edition_window",
                f"Not in store: {me} is first traced on the {year} printing and not on the "
                f"earlier {earlier[-1]} one, so sources from {earlier[-1]} to {year} are "
                "where to look for when it first appears. A window to search, never a "
                "build date.",
                None,
                [claim["id"]],
            )

    # 6: values ruled out.
    for claim in feature.get("claims") or []:
        if claim["status"] == "rejected" and claim["attribute_key"] in ASKED_FOR:
            lead(
                "rejected_value",
                f"Not in store as a value: {value_words(claim)} was ruled out as the "
                f"{claim['attribute_key']} of {me}. Do not propose it again.",
                claim["attribute_key"],
                [claim["id"]],
            )

    # 7: accepted claims that disagree for the same years.
    for attribute in ASKED_FOR:
        claims = _accepted(feature, attribute)
        for n, a in enumerate(claims):
            for b in claims[n + 1 :]:
                if value_words(a) != value_words(b) and _overlap(a, b):
                    lead(
                        "conflict",
                        f"Not settled in store: {me} has two accepted {attribute} values for "
                        f"the same years, {value_words(a)} and {value_words(b)}. To resolve, "
                        "not to pick.",
                        attribute,
                        [a["id"], b["id"]],
                    )

    # More independent backing first: a value several things point to ranks higher.
    backing: dict[tuple[str, str], set[str]] = {}
    for _, _, _, rests_on, value in found:
        if value:
            backing.setdefault(value, set()).update(rests_on[1:])
    ranked = sorted(
        found,
        key=lambda f: (-len(backing.get(f[4], ())) if f[4] else -1, RULE_ORDER.index(f[0])),
    )
    return [
        Lead(
            handle=handle(),
            rule=rule,
            text=text,
            attribute=attribute,
            rests_on=rests_on,
            backing=max(1, len(backing.get(value, ()))) if value else 1,
        )
        for rule, text, attribute, rests_on, value in ranked
    ]
