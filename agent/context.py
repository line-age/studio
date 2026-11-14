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

import geometry
from render import feature_name, is_traced_as_gone
from schemas import WorkedOut
from store_client import MAX_LIMIT, StoreError

# The list of printings is the network's, not a question's: kept a while, not per run.
EDITIONS_TTL_SECONDS = 600
_editions: "weakref.WeakKeyDictionary[Any, dict[str | None, tuple[float, Editions]]]" = (
    weakref.WeakKeyDictionary()
)
# One lock per store and network, held while fetching, so questions arriving together
# share one listing and a slow network never holds up another. Kept as long as the store.
_editions_locks: "weakref.WeakKeyDictionary[Any, dict[str | None, threading.Lock]]" = (
    weakref.WeakKeyDictionary()
)
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
        lock = _editions_locks.setdefault(key, {}).setdefault(network, threading.Lock())
    with lock:
        kept = _editions.get(key, {}).get(network)
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
        with _editions_lock:
            _editions.setdefault(key, {})[network] = (time.monotonic(), editions)
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
    merged: list[dict[str, Any]] | None = None,
) -> list[WorkedOut]:
    """When the maps first show the section (or a trace merged into it), and what store
    holds about its end."""
    name = feature_name(feature)
    facts: list[WorkedOut] = []

    shown = [s for f in (feature, *(merged or [])) if (s := first_shown(f))]
    first = min(shown, key=lambda pair: pair[0]) if shown else None
    if first:
        year, claim = first
        # An earlier printing that store's tracing does not show it on. Not "the one
        # before": printings that only removed lines are not known here.
        before = [y for y in editions.years if y < year] if editions.complete else []
        text = f"Worked out from the maps in store: {name} is first traced on the {year} printing"
        text += f", and is not traced on the earlier {before[-1]} printing." if before else "."
        facts.append(
            WorkedOut(handle=handle(), what="first_edition", text=text, rests_on=[claim["id"]])
        )

    ended = part_ended = unread = False
    for link in removal_links(feature):
        gone = others.get(link["from_feature_id"])
        if gone is None:
            # Could not be read: it may be a line traced as gone, so nothing is said of
            # the end rather than something false.
            unread = True
            continue
        if not is_traced_as_gone(gone):
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

    if unread and not ended:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="not_traced_later",
                text=(
                    f"Whether store holds an end for {name} could not be read in full just "
                    "now, so when it ended is not known here."
                ),
                rests_on=[feature["id"]],
            )
        )
    elif not ended:
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


def read_many(
    store: Any, ids: list[str], known: dict[str, dict[str, Any]] | None = None
) -> dict[str, dict[str, Any]]:
    """Several features at once, using any already `known`. One that cannot be read is
    left out; the caller says less rather than something false."""
    known = known or {}
    todo = [i for i in dict.fromkeys(ids) if i not in known]

    def one(fid: str) -> dict[str, Any] | None:
        try:
            return store.feature(fid)
        except StoreError:
            return None

    got: dict[str, dict[str, Any] | None] = {}
    if todo:
        with ThreadPoolExecutor(max_workers=min(8, len(todo))) as pool:
            got = dict(zip(todo, pool.map(one, todo), strict=True))
    return {
        fid: f for fid in dict.fromkeys(ids) if (f := known.get(fid) or got.get(fid)) is not None
    }


def read_ends(
    store: Any, feature: dict[str, Any], known: dict[str, dict[str, Any]] | None = None
) -> dict[str, dict[str, Any]]:
    """The features at the far end of every link the section is on."""
    ids = [
        link["to_feature_id"]
        if link["from_feature_id"] == feature["id"]
        else link["from_feature_id"]
        for link in feature.get("links") or []
    ]
    return read_many(store, [i for i in ids if i != feature["id"]], known)


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
        a, b = (me, them) if mine else (them, me)
        return f"{a} runs along part of {b}", "overlap"
    if relation == "parallel_to":
        return f"{them} is drawn as a second pipe beside {me}", "parallel"
    return f"store holds a {relation.replace('_', ' ')} link between {me} and {them}", "link"


def link_facts(
    feature: dict[str, Any], others: dict[str, dict[str, Any]], handle: Callable[[], str]
) -> list[WorkedOut]:
    """What the links store holds say about the section: its pipeline, other traces of
    the same pipe, the section it was cut from, a pipe beside it. A line traced as gone
    is the editions' (edition_facts). A proposed link is said as proposed, never as so."""
    name = feature_name(feature)
    facts: list[WorkedOut] = []
    in_one = any(
        link["relation"] == "part_of"
        and link["status"] == "confirmed"
        and link["from_feature_id"] == feature["id"]
        for link in feature.get("links") or []
    )
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
            if what == "pipeline" and not in_one:
                text += " Until someone decides, it is in no pipeline."
        facts.append(WorkedOut(handle=handle(), what=what, text=text, rests_on=[link["id"]]))
    return facts


# Neighbours read in full per section, nearest first: enough to see around it.
NEIGHBOURS_MAX = 8


def route_lines(feature: dict[str, Any]) -> list[list[tuple[float, float]]]:
    """The section's traced line: its accepted route claims."""
    return [
        line
        for claim in feature.get("claims") or []
        if claim["attribute_key"] == "route" and claim["status"] == "accepted"
        for line in geometry.lines_of(claim.get("value_geom"))
    ]


def _same_pipe(feature: dict[str, Any]) -> set[str]:
    """Features its links say are the same pipe or part of it, not rejected: said by the
    links, never as neighbours. A rejected link says they are different pipes."""
    return {
        end
        for link in feature.get("links") or []
        if link["relation"] in ("same_as", "split_into", "overlaps")
        and link["status"] != "rejected"
        for end in (link["from_feature_id"], link["to_feature_id"])
    }


class Neighbours:
    """Sections drawn touching one, nearest first: (id, how they meet, gap in m). When
    the search could not be made in full, `unmeasured` says why, and nothing is said of
    what it does not touch."""

    def __init__(
        self, found: list[tuple[str, geometry.Meets, float]], unmeasured: str | None = None
    ) -> None:
        self.found, self.unmeasured = found, unmeasured


def find_neighbours(store: Any, feature: dict[str, Any]) -> Neighbours:
    mine = route_lines(feature)
    if not mine:
        return Neighbours([], "store holds no accepted traced line for it")
    try:
        listing = store.sections(
            network=feature.get("network"), bbox=geometry.bbox_around(mine), limit=MAX_LIMIT
        )
    except StoreError:
        return Neighbours([], "store could not be searched just now")
    skip = _same_pipe(feature) | {feature["id"]}
    theirs: dict[str, list[list[tuple[float, float]]]] = {}
    for row in listing.rows:
        sid = row["properties"].get("section_id")
        if sid and sid not in skip:
            theirs.setdefault(sid, []).extend(geometry.lines_of(row.get("geometry")))
    found = sorted(
        (
            (sid, *meets)
            for sid, lines in theirs.items()
            if (meets := geometry.touching(mine, lines))
        ),
        key=lambda f: f[2],
    )[:NEIGHBOURS_MAX]
    return Neighbours(found, "store's listing around it was cut off" if listing.cut else None)


_MEETS = {
    "end_to_end": "{other} is drawn touching {me}: their ends meet.",
    "end_to_middle": "{me} is drawn touching {other}: its end meets the middle of {other}.",
    "middle_to_end": "{other} is drawn touching {me}: its end meets the middle of {me}.",
}


def neighbour_facts(
    feature: dict[str, Any],
    found: list[tuple[dict[str, Any], geometry.Meets]],
    unmeasured: str | None,
    handle: Callable[[], str],
) -> list[WorkedOut]:
    """What the section is drawn touching, in code's words. Never "connected": lines
    meeting on a map do not prove the pipes joined. "None" only when it was measured."""
    me = feature_name(feature)
    facts = [
        WorkedOut(
            handle=handle(),
            what="drawn_touching",
            text=(
                "Worked out from the traced lines: "
                + _MEETS[meets].format(me=me, other=feature_name(other))
                + " Lines drawn touching do not prove the pipes joined."
            ),
            rests_on=[feature["id"], other["id"]],
        )
        for other, meets in found
    ]
    if unmeasured:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="drawn_touching",
                text=(
                    f"Which sections are drawn touching {me} is not known in full here: "
                    f"{unmeasured}."
                ),
                rests_on=[feature["id"]],
            )
        )
    elif not found:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="drawn_touching",
                text=f"Worked out from the traced lines: no section in store is drawn touching {me}.",
                rests_on=[feature["id"]],
            )
        )
    return facts
