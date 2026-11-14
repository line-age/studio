"""Which traced lines are drawn touching, worked out from their geometry.

Drawn touching: a line end within TOUCH_METRES of another line, at its end or along its
middle (measured on store's gas traces, plan B0: a third of ends are snapped exactly,
and above that the share rises smoothly). Two lines that only cross do not touch. A
traced line meeting another on a map does not prove the pipes joined.

Distances are in metres on a flat projection around the lines' latitude: at the scale of
a line end and a 50 m tolerance, that is well under a metre off.
"""

import itertools
import math
from typing import Any, Literal

TOUCH_METRES = 50.0
_M_PER_DEG_LAT = 110_574.0

Point = tuple[float, float]
Meets = Literal["end_to_end", "end_to_middle", "middle_to_end"]


def lines_of(geometry: dict[str, Any] | None) -> list[list[Point]]:
    """The polylines of a LineString or MultiLineString, as (lon, lat) points."""
    if not geometry:
        return []
    coords = geometry.get("coordinates") or []
    if geometry.get("type") == "LineString":
        coords = [coords]
    return [[(float(x), float(y)) for x, y, *_ in line] for line in coords if len(line) >= 2]


def ends_of(lines: list[list[Point]]) -> list[Point]:
    return [p for line in lines for p in (line[0], line[-1])]


def _scale(lat: float) -> float:
    return 111_320.0 * math.cos(math.radians(lat))


def metres(a: Point, b: Point) -> float:
    kx = _scale((a[1] + b[1]) / 2)
    return math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * _M_PER_DEG_LAT)


def to_line(p: Point, lines: list[list[Point]]) -> float:
    """From a point to the nearest point of any of the polylines, in metres."""
    kx = _scale(p[1])
    best = math.inf
    for line in lines:
        for a, b in itertools.pairwise(line):
            ax, ay = (a[0] - p[0]) * kx, (a[1] - p[1]) * _M_PER_DEG_LAT
            bx, by = (b[0] - p[0]) * kx, (b[1] - p[1]) * _M_PER_DEG_LAT
            dx, dy = bx - ax, by - ay
            length = dx * dx + dy * dy
            t = 0.0 if length == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length))
            best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def touching(mine: list[list[Point]], theirs: list[list[Point]]) -> tuple[Meets, float] | None:
    """How two traced lines are drawn touching, and the gap in metres; None if they are
    not (they may still cross)."""
    my_ends, their_ends = ends_of(mine), ends_of(theirs)
    found: list[tuple[float, Meets]] = []
    for p in my_ends:
        gap = to_line(p, theirs)
        if gap <= TOUCH_METRES:
            at_end = any(metres(p, q) <= TOUCH_METRES for q in their_ends)
            found.append((gap, "end_to_end" if at_end else "end_to_middle"))
    for q in their_ends:
        gap = to_line(q, mine)
        if gap <= TOUCH_METRES and not any(metres(q, p) <= TOUCH_METRES for p in my_ends):
            found.append((gap, "middle_to_end"))
    if not found:
        return None
    gap, meets = min(found, key=lambda f: f[0])
    return meets, round(gap, 1)


def bbox_around(lines: list[list[Point]], metres_out: float = TOUCH_METRES) -> tuple[float, ...]:
    """The lines' bounds, widened by `metres_out` on every side, in degrees."""
    xs = [p[0] for line in lines for p in line]
    ys = [p[1] for line in lines for p in line]
    lat = max(abs(min(ys)), abs(max(ys)))
    dx, dy = metres_out / _scale(lat), metres_out / _M_PER_DEG_LAT
    return (min(xs) - dx, min(ys) - dy, max(xs) + dx, max(ys) + dy)
