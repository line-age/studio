"""What code works out about one section from store: the section pack.

Editions (B17) now; links (B18), neighbours (B19) and leads (B20) follow. Every sentence
here is code's. The model picks them by handle (W1, L1) and writes none of their words,
so nothing worked out can be passed off as a claim (plan D1).

A map printing only says a line was drawn. "First traced on the 1932 printing" is never
a build date, and a printing that is not traced as removing a line does not prove the
line was still there.
"""

import re
import threading
import time
import weakref
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from render import feature_name, is_traced_as_gone
from schemas import WorkedOut
from store_client import MAX_LIMIT, StoreError

# The list of printings is the network's, not a question's: kept a while, not per run.
EDITIONS_TTL_SECONDS = 600
_editions: "weakref.WeakKeyDictionary[Any, dict[str | None, tuple[float, Editions]]]" = (
    weakref.WeakKeyDictionary()
)
# Held while fetching, so questions arriving together share one listing.
_editions_lock = threading.Lock()

_YEAR = re.compile(r"(\d{4})")


class Editions:
    """The printings of one network that store can tell of, as years: the years its
    sections are first shown. A printing that only removed lines is not among them, and
    when store's listing was cut off, some may be missing too (`complete` is False)."""

    def __init__(self, years: list[int], complete: bool) -> None:
        self.years, self.complete = years, complete


def edition_years(store: Any, network: str | None) -> Editions:
    key = getattr(store, "origin", store)
    with _editions_lock:
        kept = _editions.setdefault(key, {}).get(network)
        if kept and time.monotonic() - kept[0] < EDITIONS_TTL_SECONDS:
            return kept[1]
        listing = store.sections(network=network, limit=MAX_LIMIT)
        years = sorted(
            {
                int(m.group(1))
                for row in listing.rows
                if (m := _YEAR.match(str(row["properties"].get("time_start") or "")))
            }
        )
        editions = Editions(years, complete=not listing.cut)
        _editions[key][network] = (time.monotonic(), editions)
        return editions


def map_year(claim: dict[str, Any], role: str) -> int | None:
    """The year of the printing a claim is cited to in this role, if any."""
    for citation in claim.get("citations") or []:
        if citation.get("role") != role:
            continue
        found = _YEAR.match(str(citation.get("as_of_edtf") or citation.get("published_edtf") or ""))
        if found:
            return int(found.group(1))
    return None


def first_shown(feature: dict[str, Any]) -> tuple[int, dict[str, Any]] | None:
    """The earliest printing an accepted status claim says shows the section, with that
    claim. Only status: a route is traced off some map, and that is not a date."""
    shown = [
        (year, claim)
        for claim in feature.get("claims") or []
        if claim["attribute_key"] == "status"
        and claim["status"] == "accepted"
        and (year := map_year(claim, "map_shows"))
    ]
    return min(shown, key=lambda pair: pair[0]) if shown else None


def removal_links(feature: dict[str, Any]) -> list[dict[str, Any]]:
    """Links that may end the section: a same_as or overlaps from another feature to it,
    not rejected. Whether the other end is a line traced as gone is read, not assumed."""
    return [
        link
        for link in feature.get("links") or []
        if link["relation"] in ("same_as", "overlaps")
        and link.get("to_feature_id") == feature["id"]
        and link["status"] != "rejected"
    ]


def edition_facts(
    feature: dict[str, Any],
    others: dict[str, dict[str, Any]],
    editions: Editions,
    handle: Callable[[], str],
) -> list[WorkedOut]:
    """When the maps first show the section, and what store holds about its end."""
    name = feature_name(feature)
    facts: list[WorkedOut] = []

    first = first_shown(feature)
    if first:
        year, claim = first
        # An earlier printing that store's tracing does not show it on. Not "the one
        # before": printings that only removed lines are not known here.
        before = [y for y in editions.years if y < year] if editions.complete else []
        text = f"Worked out from the maps in store: {name} is first traced on the {year} printing"
        text += f", and not on the earlier {before[-1]} printing." if before else "."
        facts.append(
            WorkedOut(handle=handle(), what="first_edition", text=text, rests_on=[claim["id"]])
        )

    ended = part_ended = False
    for link in removal_links(feature):
        gone = others.get(link["from_feature_id"])
        if gone is None or not is_traced_as_gone(gone):
            continue
        year = next(
            (
                y
                for c in gone.get("claims") or []
                if c["status"] != "rejected" and (y := map_year(c, "map_omits"))
            ),
            None,
        )
        on = f"on the {year} printing" if year else "on a later printing"
        part = "the same pipe as" if link["relation"] == "same_as" else "along part of"
        if link["status"] == "confirmed":
            ended = ended or link["relation"] == "same_as"
            part_ended = part_ended or link["relation"] == "overlaps"
            shows = (
                "that printing is the first in store not to show it"
                if link["relation"] == "same_as"
                else "that printing no longer shows that part"
            )
            text = (
                f"Worked out from a confirmed link: a line traced as gone {on} is {part} "
                f"{name}, so {shows}."
            )
        else:
            text = (
                f"It is proposed, and not yet decided, that a line traced as gone {on} "
                f"is {part} {name}. Until someone decides, when it ended stays Unknown."
            )
        facts.append(WorkedOut(handle=handle(), what="removal", text=text, rests_on=[link["id"]]))

    if not ended:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="not_traced_later",
                text=(
                    f"Store does not say when the rest of {name} ended. No line traced as "
                    "gone is confirmed for the rest of it, which is no proof that it lasted."
                    if part_ended
                    else f"Store does not say when {name} ended. No line traced as gone is "
                    "confirmed for it, which is no proof that it lasted."
                ),
                rests_on=[feature["id"]],
            )
        )
    return facts


def read_ends(store: Any, feature: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The features at the far end of every link the section is on, read at once. One
    that cannot be read is left out: context is a help, never a reason to fail."""
    ids = list(
        dict.fromkeys(
            link["to_feature_id"]
            if link["from_feature_id"] == feature["id"]
            else link["from_feature_id"]
            for link in feature.get("links") or []
        )
    )
    ids = [i for i in ids if i != feature["id"]]

    def one(fid: str) -> dict[str, Any] | None:
        try:
            return store.feature(fid)
        except StoreError:
            return None

    if not ids:
        return {}
    with ThreadPoolExecutor(max_workers=min(8, len(ids))) as pool:
        found = dict(zip(ids, pool.map(one, ids), strict=True))
    return {fid: f for fid, f in found.items() if f is not None}


def pipeline_words(line: dict[str, Any]) -> str:
    """A pipeline by its name: "the pipeline Example trunk line" or "pipeline 1a2b3c4d"."""
    name = feature_name(line)
    return name if name.startswith("pipeline ") else f"the pipeline {name}"


def _link_clause(
    link: dict[str, Any], me: str, other: dict[str, Any], mine: bool
) -> tuple[str, str]:
    """What a link says, as a clause, and what kind of fact that is. `mine` is True when
    the section is the link's `from` end."""
    them = feature_name(other)
    relation = link["relation"]
    if relation == "part_of":
        return f"{me} is part of {pipeline_words(other)}", "pipeline"
    if relation == "same_as":
        a, b = (me, them) if mine else (them, me)
        return f"{a} is another trace of the same pipe as {b}", "same_pipe"
    if relation == "split_into":
        clause = (
            f"{me} was cut into pieces, {them} among them" if mine else f"{me} was cut from {them}"
        )
        return clause, "split"
    if relation == "overlaps":
        return f"{them} runs along part of {me}", "overlap"
    return f"{them} is drawn as a second pipe beside {me}", "parallel"


def link_facts(
    feature: dict[str, Any], others: dict[str, dict[str, Any]], handle: Callable[[], str]
) -> list[WorkedOut]:
    """What the links store holds say about the section: its pipeline, other traces of
    the same pipe, the section it was cut from, a pipe beside it. A line traced as gone
    is the editions' (edition_facts). A proposed link is said as proposed, never as so."""
    name = feature_name(feature)
    facts: list[WorkedOut] = []
    for link in feature.get("links") or []:
        if link["status"] == "rejected":
            continue
        mine = link["from_feature_id"] == feature["id"]
        other = others.get(link["to_feature_id"] if mine else link["from_feature_id"])
        if other is None or is_traced_as_gone(other):
            continue
        clause, what = _link_clause(link, name, other, mine)
        if link["status"] == "confirmed":
            text = f"From a confirmed link in store: {clause}."
            if what == "pipeline":
                text += " What store holds about the pipeline is the pipeline's, not the section's."
            elif what in ("same_pipe", "split") and not mine:
                text += f" Store counts its claims as {name}'s."
        else:
            text = f"It is proposed, and not yet decided, that {clause}."
            if what == "pipeline":
                text += " Until someone decides, it is in no pipeline."
        facts.append(WorkedOut(handle=handle(), what=what, text=text, rests_on=[link["id"]]))
    return facts
