"""Towns along a traced line, for cite to search the journals by: worked out from the line
and the US Census Bureau's places (public domain), never from a model's memory and never
from the basemap's labels.

A town found this way is a search term, not a claim. They are today's incorporated places;
most towns a 1930s journal names are among them, under the same name. The person sees
which towns were used and can name others.

`data/us-places.tsv` is the 2020 Gazetteer's national places file cut to active
incorporated places (FUNCSTAT A), with the legal suffix dropped ("Tulsa", not "Tulsa
city"). To rebuild it, download `2020_Gaz_place_national.zip` from the Census Bureau's
gazetteer pages and keep those columns and rows. The Census file is Latin-1: read it as
such, or "Cañon City" comes out as "CaÃ±on City".
"""

import csv
import functools
from dataclasses import dataclass

from src.agent.config import ROOT
from src.worked_out import geometry

DATA = ROOT / "data" / "us-places.tsv"
# A town at an end of the line, if one is this near it.
END_M = 15_000.0
# A town the line passes, if it is this near it.
ALONG_M = 5_000.0
# At most this many towns for one search: enough to match on, few enough to read.
MAX_TOWNS = 4


@dataclass(frozen=True)
class Place:
    name: str
    state: str
    lat: float
    lon: float
    sq_mi: float

    @property
    def point(self) -> geometry.Point:
        return (self.lon, self.lat)


@functools.cache
def all_places() -> tuple[Place, ...]:
    with DATA.open(encoding="utf-8") as f:
        rows = csv.DictReader((line for line in f if not line.startswith("#")), delimiter="\t")
        return tuple(
            Place(r["name"], r["state"], float(r["lat"]), float(r["lon"]), float(r["sq_mi"]))
            for r in rows
        )


def _ends(lines: list[list[geometry.Point]]) -> tuple[geometry.Point, geometry.Point]:
    """The line's two ends: of all its pieces' ends, the two farthest apart."""
    ends = geometry.ends_of(lines)
    return max(
        ((a, b) for i, a in enumerate(ends) for b in ends[i + 1 :]),
        key=lambda pair: geometry.metres(*pair),
        default=(ends[0], ends[0]),
    )


def towns_along(
    lines: list[list[geometry.Point]], places: tuple[Place, ...] | None = None
) -> list[str]:
    """The towns at the line's ends and the largest it passes, in order from one end to
    the other: at most MAX_TOWNS, none when no town is near it. One name once: two
    states can share one."""
    return list(dict.fromkeys(p.name for p in places_along(lines, places)))


def places_along(
    lines: list[list[geometry.Point]], places: tuple[Place, ...] | None = None
) -> list[Place]:
    """towns_along's places themselves, with their states, in the same order."""
    if not lines:
        return []
    places = all_places() if places is None else places
    west, south, east, north = geometry.bbox_around(lines, END_M)
    near = [p for p in places if west <= p.lon <= east and south <= p.lat <= north]
    gap = {p: geometry.to_line(p.point, lines) for p in near}
    start, end = _ends(lines)

    def weight(place: Place, metres: float) -> float:
        # A larger town a little further off is likelier to be in the journals than a
        # hamlet beside the line: size counts, distance takes from it.
        return place.sq_mi / (1 + metres / 1_000)

    chosen: list[Place] = []
    for tip in (start, end):
        by_tip = [p for p in near if geometry.metres(p.point, tip) <= END_M]
        if by_tip:
            best = max(by_tip, key=lambda p: (weight(p, geometry.metres(p.point, tip)), p.name))
            if best not in chosen:
                chosen.append(best)
    passed = sorted(
        (p for p in near if gap[p] <= ALONG_M and p not in chosen),
        key=lambda p: (-weight(p, gap[p]), p.name),
    )
    chosen += passed[: max(0, MAX_TOWNS - len(chosen))]
    chosen.sort(key=lambda p: geometry.metres(p.point, start))
    return chosen
