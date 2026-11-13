"""A store that answers from one invented world, for tests and evals.

It is an httpx transport, so the real `StoreClient` runs against it unchanged. It answers
the four reads the Agent uses, in the shapes store returns, refuses what store refuses,
and can be told to fail. Not modelled: a section cut into pieces by a proposed `overlaps`
link (no world has one yet).
"""

import copy
import datetime as dt
import json
import uuid
from functools import cache
from pathlib import Path
from typing import Any

import httpx

from evals.make_world import BUILDERS, render, scope
from store_client import StoreClient

WORLDS = Path(__file__).parent / "worlds"
TOKEN = "lgt_invented_token_for_tests"


@cache
def _world_text(name: str) -> str:
    path = WORLDS / f"{name}.json"
    # Only the small world is kept in git, to be read and reviewed. The others are made
    # on demand: the same seed gives the same world.
    return path.read_text() if path.exists() else render(name)


def load_world(name: str) -> dict[str, Any]:
    """A fresh copy of a world `make_world.py` makes. Any other name is a KeyError."""
    if name not in BUILDERS:
        raise KeyError(f"no such world: {name!r}. Worlds are made by evals/make_world.py")
    return json.loads(_world_text(name))


def _bounds(geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    points = [point for line in geometry["coordinates"] for point in line]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


class _Refused(Exception):
    pass


def _unprocessable(detail: str) -> httpx.Response:
    return httpx.Response(422, json={"detail": detail})


class FakeStore(httpx.BaseTransport):
    def __init__(self, world: dict[str, Any], *, fail: str | None = None):
        self.world = world
        # None, "unreachable", "refused" or "error".
        self.fail = fail
        self.requests: list[str] = []

    def client(self) -> StoreClient:
        return StoreClient("http://store.invalid", TOKEN, transport=self)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        assert request.method == "GET", "the Agent only reads"
        self.requests.append(str(request.url.raw_path, "ascii"))
        if self.fail == "unreachable":
            raise httpx.ConnectError("no store", request=request)
        if self.fail == "error":
            return httpx.Response(500, json={"detail": "boom"})
        if self.fail == "refused" or request.headers.get("authorization") != f"Bearer {TOKEN}":
            return httpx.Response(401, json={"detail": "unknown token"})
        path, q = request.url.path, request.url.params
        try:
            if path == "/sections":
                return httpx.Response(200, json=self._sections(q, self._limit(q)))
            if path == "/missing":
                return httpx.Response(200, json=self._missing(q, self._limit(q)))
            if path == "/links":
                return httpx.Response(200, json=self._links(q, self._limit(q)))
            if path.startswith("/features/"):
                return self._feature(path.removeprefix("/features/"))
        except _Refused as refused:
            return _unprocessable(str(refused))
        return httpx.Response(404, json={"detail": "Not Found"})

    def _limit(self, q: httpx.QueryParams) -> int:
        try:
            limit = int(q.get("limit", 1000))
        except ValueError:
            raise _Refused("limit must be an integer") from None
        if not 1 <= limit <= 10_000:
            raise _Refused("limit must be 1 to 10000")
        return limit

    def _feature(self, feature_id: str) -> httpx.Response:
        try:
            uuid.UUID(feature_id)
        except ValueError:
            return _unprocessable("feature id must be a UUID")
        feature = self.world["features"].get(feature_id)
        if feature is None:
            return httpx.Response(404, json={"detail": "no such feature"})
        return httpx.Response(200, json=copy.deepcopy(feature))

    def _sections(self, q: httpx.QueryParams, limit: int) -> dict[str, Any]:
        rows = self.world["sections"]
        if "network" in q:
            rows = [r for r in rows if r["properties"]["network"] == q["network"]]
        if "at" in q:
            try:
                at = dt.date.fromisoformat(q["at"]).isoformat()
            except ValueError:
                raise _Refused("at must be a date") from None
            rows = [
                r
                for r in rows
                if (r["properties"]["time_start"] or at) <= at
                and (r["properties"]["time_end"] or at) >= at
            ]
        if "bbox" in q:
            try:
                minx, miny, maxx, maxy = (float(n) for n in q["bbox"].split(","))
            except ValueError:
                raise _Refused("bbox must be minx,miny,maxx,maxy") from None
            kept = []
            for r in rows:
                x0, y0, x1, y1 = _bounds(r["geometry"])
                if x0 <= maxx and x1 >= minx and y0 <= maxy and y1 >= miny:
                    kept.append(r)
            rows = kept
        rows = sorted(rows, key=lambda r: r["id"])[:limit]
        return {"type": "FeatureCollection", "features": copy.deepcopy(rows)}

    def _missing(self, q: httpx.QueryParams, limit: int) -> list[dict[str, Any]]:
        # Like store: the key is not checked, and a section counts the accepted claims in
        # its scope (itself, a trace merged into it, the section it was split from).
        attribute, features, out = q["attribute"], self.world["features"], {}
        for row in self.world["sections"]:
            p = row["properties"]
            if "network" in q and p["network"] != q["network"]:
                continue
            held = any(
                c["attribute_key"] == attribute and c["status"] == "accepted"
                for fid in scope(self.world["links"], p["section_id"])
                for c in features[fid]["claims"]
            )
            if not held:
                out[p["section_id"]] = {
                    "section_id": p["section_id"],
                    "label": p["label"],
                    "network": p["network"],
                }
        return [out[k] for k in sorted(out)][:limit]

    def _links(self, q: httpx.QueryParams, limit: int) -> list[dict[str, Any]]:
        rows = self.world["links"]
        if "status" in q and q["status"] not in ("proposed", "confirmed", "rejected"):
            raise _Refused("status must be proposed, confirmed or rejected")
        for key in ("status", "relation"):
            if key in q:
                rows = [r for r in rows if r[key] == q[key]]
        return copy.deepcopy(sorted(rows, key=lambda r: r["created_at"])[:limit])
