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
import places
import states
from render import feature_name, is_traced_as_gone, shown_on_a_map_only, value_words
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
        text = f"{name} is first shown on the {year} map"
        text += f", and is not shown on the earlier {before[-1]} map." if before else "."
        values = {"year": str(year)} | ({"before": str(before[-1])} if before else {})
        facts.append(
            WorkedOut(
                handle=handle(),
                what="first_edition",
                text=text,
                rests_on=[claim["id"]],
                values=values,
            )
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
        later = f"The {year} map" if year else "A later map"
        whole = link["relation"] == "same_as"
        shows = f"no longer shows {name if whole else f'part of {name}'}"
        if link["status"] == "confirmed":
            ended = ended or whole
            part_ended = part_ended or link["relation"] == "overlaps"
            text = f"{later} {shows}, and that is confirmed."
            if whole:
                text += " It is the first map not to show it."
        else:
            text = (
                f"It is proposed, and not yet decided, that {later[0].lower()}{later[1:]} "
                f"{shows}. Until someone decides, when it ended stays Unknown."
            )
        facts.append(WorkedOut(handle=handle(), what="removal", text=text, rests_on=[link["id"]]))

    if unread and not ended:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="not_traced_later",
                text=(
                    f"Whether an end is recorded for {name} could not be read in full just "
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
                    f"No source says when the rest of {name} ended. No later map is "
                    "confirmed to have dropped the rest of it, which is no proof that it lasted."
                    if part_ended
                    else f"No source says when {name} ended. No later map is confirmed to "
                    "have dropped it, which is no proof that it lasted."
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
    return f"there is a {relation.replace('_', ' ')} link between {me} and {them}", "link"


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
            # A name stays as store gives it ("section 1a2b3c4d"), even to open a sentence:
            # Studio finds names in the text to make them links.
            text = f"{clause}, by a confirmed link."
            if what == "pipeline":
                text += " What is known about the pipeline is the pipeline's, not the section's."
            elif what in ("same_pipe", "split") and not mine:
                text += f" Its facts count as {name}'s."
        else:
            text = f"It is proposed, and not yet decided, that {clause}."
            if what == "pipeline" and not in_one:
                text += " Until someone decides, it is in no pipeline."
        facts.append(WorkedOut(handle=handle(), what=what, text=text, rests_on=[link["id"]]))
    return facts


GAP_ATTRIBUTES = ("name", "owner", "operator", "diameter")


def gap_facts(
    feature: dict[str, Any], merged: list[dict[str, Any]], handle: Callable[[], str]
) -> list[WorkedOut]:
    """What is not known yet, each said once: when the section was built (a map year is
    never one), and which of its name, owner, operator and diameter no source gives."""
    name = feature_name(feature)
    claims = [c for f in (feature, *merged) for c in f.get("claims") or []]
    facts: list[WorkedOut] = []
    dated = any(
        c["attribute_key"] == "status" and c["status"] == "accepted" and not shown_on_a_map_only(c)
        for c in claims
    )
    if not dated:
        shown = [s for f in (feature, *merged) if (s := first_shown(f))]
        text = f"No source gives a build date for {name}."
        rests_on = [feature["id"]]
        if shown:
            year, claim = min(shown, key=lambda pair: pair[0])
            text += f" The {year} map is the first to show it, and a map year is not a build date."
            rests_on.append(claim["id"])
        facts.append(WorkedOut(handle=handle(), what="built", text=text, rests_on=rests_on))

    def has(attribute: str, status: str) -> bool:
        return any(c["attribute_key"] == attribute and c["status"] == status for c in claims)

    lacking = [a for a in GAP_ATTRIBUTES if not has(a, "accepted")]
    proposed = [a for a in lacking if has(a, "candidate")]
    if lacking:
        text = f"Not known yet for {name}: " + _and([f"the {a}" for a in lacking]) + "."
        if proposed:
            text += f" A value is proposed, and not decided yet, for {_and([f'the {a}' for a in proposed])}."
    else:
        text = f"A source gives the {_and(list(GAP_ATTRIBUTES))} of {name}."
    if not dated:
        text += " A build date is not known either." if lacking else " A build date is not known."
    facts.append(WorkedOut(handle=handle(), what="missing", text=text, rests_on=[feature["id"]]))
    return facts


def no_pipeline_fact(feature: dict[str, Any], handle: Callable[[], str]) -> list[WorkedOut]:
    """That a section is in no pipeline, when no link, confirmed or proposed, puts it in
    one. A proposed link is link_facts' to say: it already says "in no pipeline" there."""
    placed = any(
        link["relation"] == "part_of"
        and link["status"] != "rejected"
        and link["from_feature_id"] == feature["id"]
        for link in feature.get("links") or []
    )
    if placed or feature.get("kind") == "line":
        return []
    return [
        WorkedOut(
            handle=handle(),
            what="pipeline",
            text=f"{feature_name(feature)} is not in a pipeline.",
            rests_on=[feature["id"]],
        )
    ]


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
        return Neighbours([], "no accepted line is drawn for it")
    try:
        listing = store.sections(
            network=feature.get("network"), bbox=geometry.bbox_around(mine), limit=MAX_LIMIT
        )
    except StoreError:
        return Neighbours([], "the data could not be searched just now")
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
    return Neighbours(found, "the list of sections around it was cut off" if listing.cut else None)


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
                _MEETS[meets].format(me=me, other=feature_name(other))
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
                text=f"No other section is drawn touching {me}.",
                rests_on=[feature["id"]],
            )
        )
    return facts


# Nearby: the sections nearest one, however far, compared on what both hold. For "which
# sections near it are like it": drawn touching is too narrow for that.
NEARBY_MAX = 5
# Searched outwards until NEARBY_MAX are found: a few km first, then the whole region.
NEARBY_RADII_M = (5_000.0, 25_000.0, 100_000.0, 400_000.0, 1_500_000.0)
# Beyond this, the nearest section is far enough that a likeness says little.
FAR_M = 100_000.0
# What two sections are compared on: their own accepted claims, and the first printing.
COMPARED = ("owner", "operator", "diameter")


def distance_m(mine: list[list[geometry.Point]], theirs: list[list[geometry.Point]]) -> float:
    """The shortest gap between two traced lines, in metres; 0 where they cross or meet.
    Measured from each line's points to the other line: close enough at map scale."""
    if not mine or not theirs:
        return float("inf")
    return min(
        min(geometry.to_line(p, theirs) for line in mine for p in line),
        min(geometry.to_line(q, mine) for line in theirs for q in line),
    )


class Nearby:
    """The sections nearest one, nearest first: (id, gap in m). `unmeasured` says why the
    search is not complete, when it is not."""

    def __init__(self, found: list[tuple[str, float]], unmeasured: str | None = None) -> None:
        self.found, self.unmeasured = found, unmeasured


def find_nearby(store: Any, feature: dict[str, Any]) -> Nearby:
    mine = route_lines(feature)
    if not mine:
        return Nearby([], "no accepted line is drawn for it")
    skip = _same_pipe(feature) | {feature["id"]}
    theirs: dict[str, list[list[geometry.Point]]] = {}
    cut = False
    for radius in NEARBY_RADII_M:
        try:
            listing = store.sections(
                network=feature.get("network"),
                bbox=geometry.bbox_around(mine, radius),
                limit=MAX_LIMIT,
            )
        except StoreError:
            return Nearby([], "the data could not be searched just now")
        theirs = {}
        for row in listing.rows:
            sid = row["properties"].get("section_id")
            if sid and sid not in skip:
                theirs.setdefault(sid, []).extend(geometry.lines_of(row.get("geometry")))
        cut = listing.cut
        gaps = sorted((distance_m(mine, lines), sid) for sid, lines in theirs.items())
        # Enough within this radius (a box reaches past it at the corners), or no wider
        # search to make.
        if cut or sum(1 for gap, _ in gaps if gap <= radius) >= NEARBY_MAX:
            break
    found = [(sid, gap) for gap, sid in gaps[:NEARBY_MAX]]
    return Nearby(found, "the list of sections around it was cut off" if cut else None)


def _accepted(feature: dict[str, Any], attribute: str) -> list[dict[str, Any]]:
    return [
        c
        for c in feature.get("claims") or []
        if c["attribute_key"] == attribute and c["status"] == "accepted"
    ]


def _distance_words(gap: float) -> str:
    if gap < 1_000:
        return "drawn within 1 km of"
    return f"about {round(gap / 1_000):,} km from"


def compare(
    feature: dict[str, Any], other: dict[str, Any]
) -> tuple[list[str], list[str], list[str]]:
    """What two sections share and where they differ, on what both hold, in code's words,
    and the claims that rests on."""
    same, differ, rests_on = [], [], []
    for attribute in COMPARED:
        mine, theirs = _accepted(feature, attribute), _accepted(other, attribute)
        if not mine or not theirs:
            continue
        my_values = {value_words(c) for c in mine}
        their_values = {value_words(c) for c in theirs}
        rests_on += [c["id"] for c in (*mine, *theirs)]
        shared = sorted(my_values & their_values)
        if shared:
            same.append(f"same {attribute} ({', '.join(shared)})")
        else:
            differ.append(
                f"different {attribute} ({', '.join(sorted(my_values))} here, "
                f"{', '.join(sorted(their_values))} there)"
            )
    a, b = first_shown(feature), first_shown(other)
    if a and b:
        rests_on += [a[1]["id"], b[1]["id"]]
        if a[0] == b[0]:
            same.append(f"first shown on the same map ({a[0]})")
        else:
            differ.append(f"first shown on different maps ({a[0]} here, {b[0]} there)")
    return same, differ, rests_on


def nearby_facts(
    feature: dict[str, Any],
    found: list[tuple[dict[str, Any], float]],
    unmeasured: str | None,
    handle: Callable[[], str],
) -> list[WorkedOut]:
    """The nearest sections and how each compares, in code's words, nearest first.
    Alike on a map and in its claims is a clue that they may be one pipe, never proof."""
    me = feature_name(feature)
    facts: list[WorkedOut] = []
    if found and found[0][1] > FAR_M:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="nearby",
                text=(
                    f"The nearest section is {_distance_words(found[0][1])} {me}, "
                    "so how alike they are says little."
                ),
                rests_on=[feature["id"], found[0][0]["id"]],
            )
        )
    holds = any(_accepted(feature, a) for a in COMPARED) or first_shown(feature)
    if found and not holds:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="nearby",
                text=(
                    f"{me} has no accepted owner, operator, diameter or first map to "
                    "compare with, so only the distance is known."
                ),
                rests_on=[feature["id"]],
            )
        )
    compared = [(other, gap, *compare(feature, other)) for other, gap in found]
    for other, gap, same, differ, rests_on in compared:
        # "Here" is the section asked about, "there" the other.
        text = f"{feature_name(other)} is {_distance_words(gap)} {me}."
        alike = [*same, *differ]
        if alike:
            text += f" {_and(alike)[0].upper()}{_and(alike)[1:]}."
        elif holds:
            text += " Nothing is known for both that could be compared."
        facts.append(
            WorkedOut(
                handle=handle(),
                what="nearby",
                text=text,
                rests_on=[feature["id"], other["id"], *rests_on],
            )
        )
    if unmeasured:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="nearby",
                text=f"Which sections are nearest {me} is not known in full here: {unmeasured}.",
                rests_on=[feature["id"]],
            )
        )
    elif not found:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="nearby",
                text=f"There is no other section to compare with {me}.",
                rests_on=[feature["id"]],
            )
        )
    return facts


_MILE_M = 1_609.344


def _about(metres: float, unit: float) -> str:
    n = metres / unit
    return f"{n:.0f}" if n >= 10 else f"{n:.1f}"


def place_facts(feature: dict[str, Any], handle: Callable[[], str]) -> list[WorkedOut]:
    """Where the section's traced line lies and how long it is drawn: the states it runs
    through, today's towns along it (places.py) and its length. Worked out from the
    line, never claims: a town of today is not a place the pipe served. They rest on the
    section, not on the map it was traced from: the map names no town."""
    lines = route_lines(feature)
    if not lines:
        return []
    name = feature_name(feature)
    on = [feature["id"]]
    facts: list[WorkedOut] = []
    crossed = states.states_of(lines)
    if crossed:
        where = f"lies in {crossed[0]}" if len(crossed) == 1 else f"runs through {_and(crossed)}"
        facts.append(
            WorkedOut(
                handle=handle(),
                what="place",
                text=f"{name}'s drawn line {where}.",
                rests_on=on,
                values={"states": _and(crossed)},
            )
        )
    towns = places.towns_along(lines)
    if towns:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="place",
                text=f"Along {name}'s drawn line, by today's towns: {_and(towns)}.",
                rests_on=on,
                values={"towns": _and(towns)},
            )
        )
    else:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="place",
                text=(
                    f"No town of today lies within {places.END_M / 1000:.0f} km of the ends "
                    f"of {name}'s drawn line, or within {places.ALONG_M / 1000:.0f} km of it."
                ),
                rests_on=on,
            )
        )
    metres = geometry.length_m(lines)
    km, miles = f"{_about(metres, 1_000)} km", f"{_about(metres, _MILE_M)} miles"
    facts.append(
        WorkedOut(
            handle=handle(),
            what="length",
            text=f"{name} is about {km} ({miles}) long as drawn.",
            rests_on=on,
            values={"km": km, "miles": miles},
        )
    )
    return facts


def _and(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
