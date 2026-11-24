"""A store that answers from one invented world, for tests and evals.

It is an httpx transport, so the real `StoreClient` runs against it unchanged. It answers
the four reads the Agent uses, in the shapes store returns, refuses what store refuses,
and can be told to fail. It also takes the one write the Agent makes, a bundle from the
proposal client with cite's token, and keeps it in the world as a candidate claim, so a
case can check what store holds afterwards. Not modelled: a section cut into pieces by a proposed `overlaps`
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
from src.clients.store_client import StoreClient
from src.clients.store_writer import ProposalClient

WORLDS = Path(__file__).parent / "worlds"
CITE_TOKEN = "lgt_invented_cite_token_for_tests"


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
    def __init__(
        self, world: dict[str, Any], *, fail: str | None = None, fail_path: str | None = None
    ):
        self.world = world
        # None, "unreachable", "refused" or "error".
        self.fail = fail
        # A path that answers 500 while every other one works, such as "/sections".
        self.fail_path = fail_path
        self.requests: list[str] = []
        # Bundles taken, in order.
        self.bundles: list[dict[str, Any]] = []

    def client(self) -> StoreClient:
        return StoreClient("http://store", transport=self)

    def writer(self) -> ProposalClient:
        return ProposalClient("http://store", CITE_TOKEN, transport=self)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path == "/bundles":
            if request.headers.get("authorization") != f"Bearer {CITE_TOKEN}":
                return httpx.Response(401, json={"detail": "unknown token"})
            return self._bundle(json.loads(request.content))
        assert request.method == "GET", "the Agent only reads, and proposes through /bundles"
        self.requests.append(str(request.url.raw_path, "ascii"))
        if self.fail == "unreachable":
            raise httpx.ConnectError("no store", request=request)
        if self.fail == "error" or (self.fail_path and request.url.path.startswith(self.fail_path)):
            return httpx.Response(500, json={"detail": "boom"})
        if self.fail == "refused":
            return httpx.Response(401, json={"detail": "unknown token"})
        # Reads carry no token: the proposal token must never ride on a read.
        assert "authorization" not in request.headers, "a read carried a token"

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

    def _bundle(self, bundle: dict[str, Any]) -> httpx.Response:
        """Store's bundle, enough of it: sources, citations, features, claims and links,
        by ref; a claim from a pipeline token is a candidate and a link proposed; an
        external key already seen reuses its row."""
        self.bundles.append(copy.deepcopy(bundle))
        ids: dict[str, str] = {}
        created: dict[str, bool] = {}

        def row_id(row: dict[str, Any]) -> str:
            key = row.get("external_key") or {}
            return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{key.get('system')}/{key.get('key')}"))

        sources = {s["ref"]: s for s in bundle.get("sources", [])}
        citations = {}
        for s in bundle.get("sources", []):
            ids[s["ref"]] = row_id(s)
        for c in bundle.get("citations", []):
            ids[c["ref"]] = row_id(c)
            citations[c["ref"]] = c
        for f in bundle.get("features", []):
            fid = row_id(f)
            ids[f["ref"]] = fid
            created[f["ref"]] = fid not in self.world["features"]
            self.world["features"].setdefault(
                fid,
                {
                    "id": fid,
                    "kind": f["kind"],
                    "network": f["network"],
                    "label": f.get("label"),
                    "created_at": "2026-01-02T00:00:00+00:00",
                    "external_keys": [f["external_key"]],
                    "claims": [],
                    "links": [],
                },
            )
        for claim in bundle.get("claims", []):
            feature = self.world["features"].get(claim["feature"])
            if feature is None:
                return _unprocessable("no such feature")
            cid = row_id(claim)
            ids[claim.get("ref") or cid] = cid
            known = any(c["id"] == cid for c in feature["claims"])
            created[claim.get("ref") or cid] = not known
            if known:
                continue
            cited = []
            for link in claim["citations"]:
                c = citations[link["citation"]]
                source = sources[c["source"]]
                cited.append(
                    {
                        "id": ids[c["ref"]],
                        "role": link["role"],
                        "locator": c.get("locator"),
                        "quote": c.get("quote"),
                        "url": c.get("url"),
                        "source_kind": source.get("kind"),
                        "source_title": source.get("title"),
                        "published_edtf": source.get("published_edtf"),
                    }
                )
            feature["claims"].append(
                {
                    "id": cid,
                    "attribute_key": claim["attribute"],
                    "value_text": claim.get("value_text"),
                    "value_num": claim.get("value_num"),
                    "value_unit": claim.get("value_unit"),
                    "valid_edtf": claim.get("valid_edtf"),
                    "start_earliest": claim.get("start_earliest"),
                    "start_latest": claim.get("start_latest"),
                    "end_earliest": None,
                    "end_latest": None,
                    "status": "candidate",
                    "asserted_by_kind": "pipeline",
                    "citations": cited,
                    "reviews": [],
                }
            )
        for link in bundle.get("links", []):
            lid = row_id(link)
            ids[link["ref"]] = lid
            ends = [ids.get(link[e], link[e]) for e in ("from", "to")]
            if any(e not in self.world["features"] for e in ends):
                return _unprocessable("no such feature")
            known = any(r["id"] == lid for r in self.world["links"])
            created[link["ref"]] = not known
            if known:
                continue
            row = {
                "id": lid,
                "from_feature_id": ends[0],
                "to_feature_id": ends[1],
                "relation": link["relation"],
                "status": "proposed",  # a pipeline token's link stays proposed
                "score": link.get("score"),
                "asserted_by": None,
                "citation_id": None,
                "created_at": "2026-01-02T00:00:00+00:00",
            }
            self.world["links"].append(row)
            for end in ends:
                self.world["features"][end]["links"].append(copy.deepcopy(row))
        return httpx.Response(200, json={"ids": ids, "created": created})

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
