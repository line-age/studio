"""Which US states a traced line runs through: the same outlines and the same walk as
Studio's State filter (frontend/src/data/us-states.ts), so the two never disagree.

`data/us-states.json` is exported from Studio (`pnpm states:export`; `pnpm check` fails
when it is stale), and `data/states-cases.json` is checked on both sides. A line is placed
by its points; where two points in a row are in different states, or off the map, by
points between them at most STEP degrees apart too. This is where a line lies, worked out
from the trace: not a claim, and it needs no citation.
"""

import functools
import itertools
import json
import math
from dataclasses import dataclass

from src.agent.config import ROOT
from src.worked_out import geometry

DATA = ROOT / "data" / "us-states.json"
# The furthest apart two tested points along a line are, in degrees (as Studio).
STEP = 0.05

Ring = list[list[float]]


@dataclass(frozen=True)
class State:
    name: str
    bounds: tuple[float, float, float, float]  # west, south, east, north
    polygons: tuple[tuple[Ring, ...], ...]  # each: its outer ring, then its holes


@functools.cache
def all_states() -> tuple[State, ...]:
    out = []
    for s in json.loads(DATA.read_text())["states"]:
        outer = [p for polygon in s["polygons"] for p in polygon[0]]
        bounds = (
            min(p[0] for p in outer),
            min(p[1] for p in outer),
            max(p[0] for p in outer),
            max(p[1] for p in outer),
        )
        out.append(State(s["name"], bounds, tuple(tuple(p) for p in s["polygons"])))
    return tuple(out)


def _in_ring(lon: float, lat: float, ring: Ring) -> bool:
    """Even-odd ray casting, as Studio does it."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _contains(state: State, lon: float, lat: float) -> bool:
    w, s, e, n = state.bounds
    if lon < w or lon > e or lat < s or lat > n:
        return False
    return any(
        _in_ring(lon, lat, polygon[0]) and not any(_in_ring(lon, lat, h) for h in polygon[1:])
        for polygon in state.polygons
    )


def _state_at(lon: float, lat: float, hint: State | None) -> State | None:
    if hint and _contains(hint, lon, lat):
        return hint
    return next((s for s in all_states() if s is not hint and _contains(s, lon, lat)), None)


def states_of(lines: list[list[geometry.Point]]) -> list[str]:
    """The states a line runs through, in alphabetical order."""
    found: set[str] = set()
    last: State | None = None

    def at(lon: float, lat: float) -> State | None:
        nonlocal last
        state = _state_at(lon, lat, last)
        if state:
            found.add(state.name)
            last = state
        return state

    for line in lines:
        here = at(*line[0]) if line else None
        for (lon, lat), nxt in itertools.pairwise(line):
            there = at(*nxt)
            # Both ends in one state: the stretch between is taken to be too.
            if here is None or there is None or here is not there:
                steps = math.ceil(max(abs(nxt[0] - lon), abs(nxt[1] - lat)) / STEP)
                for k in range(1, steps):
                    at(lon + (nxt[0] - lon) * k / steps, lat + (nxt[1] - lat) * k / steps)
            here = there
    return sorted(found)
