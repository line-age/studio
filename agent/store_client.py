"""Store over HTTP, read only. The one place the Agent talks to store.

Four things happen here and nowhere else, so neither the model nor a trace can get
around them:

- Only GET requests leave. The Agent's token could propose; this client cannot.
- What comes back is cut down to the fields listed below. People's names, and the fields
  known to carry them, are not on the list.
- Attribute keys are checked: store's `/missing` does not check them and answers a
  misspelt key with every section.
- A list as long as its limit is flagged as possibly cut off: store has no paging.
"""

import datetime as dt
import re
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

# store's attribute registry. `/missing` accepts anything, so the check is ours.
ATTRIBUTE_KEYS = frozenset(
    {
        "name",
        "owner",
        "operator",
        "status",
        "route",
        "location",
        "diameter",
        "voltage",
        "gauge",
        "lanes",
        "station_kind",
        "serves",
        "flow_direction",
        "commodity",
    }
)
LINK_STATUSES = frozenset({"proposed", "confirmed", "rejected"})
MAX_LIMIT = 10_000

# What the Agent may see of each thing store returns. Anything not listed is dropped:
# `asserted_by_name` and `reviewer_name` name people, and `external_keys` hold the names
# of trace files, which can carry a tracer's name.
_FEATURE = ("id", "kind", "network", "label", "created_at", "dates")
_CLAIM = (
    "id",
    "attribute_key",
    "value_text",
    "value_num",
    "value_unit",
    "value_geom",
    "value_feature_id",
    "valid_edtf",
    "start_earliest",
    "start_latest",
    "end_earliest",
    "end_latest",
    "status",
    "request_id",
    "created_at",
    "asserted_by",
    "asserted_by_kind",
)
_CITATION = (
    "id",
    "claim_id",
    "role",
    "confidence",
    "locator",
    "quote",
    "url",
    "archive_url",
    "source_id",
    "source_kind",
    "source_title",
    "published_edtf",
    "as_of_edtf",
    "identifier",
)
# A review's `note` is a person's free text and can name people, so it is not kept: the
# verdict says a value was accepted, corrected or rejected, not why.
_REVIEW = ("id", "claim_id", "link_id", "verdict", "replaced_by_claim_id", "created_at")
_LINK = (
    "id",
    "from_feature_id",
    "to_feature_id",
    "relation",
    "status",
    "score",
    "asserted_by",
    "citation_id",
    "created_at",
)
_SECTION = (
    "row_id",
    "section_id",
    "label",
    "network",
    "existed_from",
    "existed_to",
    "time_start",
    "time_end",
    "end_status",
    "date_conflict",
    "line_id",
    "diameter",
    "has_candidates",
)
_MISSING = ("section_id", "label", "network")

# An importer writes "traced in <file name>" as a map citation's locator, and the file
# name can carry the tracer's name. The fact that it was traced is kept; the file is not.
_TRACE_LOCATOR = re.compile(r"^traced in\b.*", re.IGNORECASE | re.DOTALL)


class StoreError(Exception):
    """Why a read failed: unreachable, refused, not_found, bad_request or error."""

    def __init__(self, kind: str, detail: str = ""):
        super().__init__(f"{kind}: {detail}" if detail else kind)
        self.kind = kind
        self.detail = detail


@dataclass(frozen=True)
class Listing:
    rows: list[dict[str, Any]]
    # True when store returned as many rows as the limit: there may be more.
    cut: bool
    limit: int


def _keep(row: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {key: row[key] for key in keys if key in row}


def _citation(row: dict[str, Any]) -> dict[str, Any]:
    out = _keep(row, _CITATION)
    if isinstance(out.get("locator"), str):
        out["locator"] = _TRACE_LOCATOR.sub("traced", out["locator"])
    return out


def _claim(row: dict[str, Any]) -> dict[str, Any]:
    out = _keep(row, _CLAIM)
    # A tool keeps its name. A person is only "person".
    if row.get("asserted_by_kind") == "pipeline" and "asserted_by_name" in row:
        out["asserted_by_name"] = row["asserted_by_name"]
    out["citations"] = [_citation(c) for c in row.get("citations") or []]
    out["reviews"] = [_keep(r, _REVIEW) for r in row.get("reviews") or []]
    return out


def _feature(row: dict[str, Any]) -> dict[str, Any]:
    out = _keep(row, _FEATURE)
    out["claims"] = [_claim(c) for c in row.get("claims") or []]
    out["links"] = [_keep(link, _LINK) for link in row.get("links") or []]
    return out


def _section(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": row.get("id"),
        "geometry": row.get("geometry"),
        "properties": _keep(row.get("properties") or {}, _SECTION),
    }


def check_store_url(url: str) -> str:
    """The token travels in a header, so it goes in the clear only to this machine or to
    a service on the same Compose network (a host name with no dot)."""
    parsed = httpx.URL(url)
    host = parsed.host or ""
    local = host in ("localhost", "127.0.0.1", "::1") or (host and "." not in host)
    if parsed.scheme == "https" or (parsed.scheme == "http" and local):
        return url
    raise StoreError("bad_request", "STORE_URL must be https, or http to this machine")


def _only_get(request: httpx.Request) -> None:
    if request.method != "GET":
        raise RuntimeError(f"the Agent only reads store: refused {request.method}")


class StoreClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 30.0,
    ):
        self._http = httpx.Client(
            base_url=check_store_url(base_url),
            headers={"Authorization": f"Bearer {token}"},
            transport=transport,
            timeout=timeout,
            follow_redirects=False,
            # Never send the token through a proxy picked up from the environment.
            trust_env=False,
            event_hooks={"request": [_only_get]},
        )

    def close(self) -> None:
        self._http.close()

    def _get(self, path: str, params: dict[str, Any] | None, shape: type) -> Any:
        params = {k: v for k, v in (params or {}).items() if v is not None}
        try:
            response = self._http.get(path, params=params)
        except (httpx.HTTPError, httpx.InvalidURL) as exc:
            raise StoreError("unreachable", type(exc).__name__) from exc
        status = response.status_code
        if status in (401, 403):
            raise StoreError("refused", str(status))
        if status == 404:
            raise StoreError("not_found", path)
        if status == 422:
            raise StoreError("bad_request", _detail(response))
        if status != 200:
            raise StoreError("error", str(status))
        try:
            body = response.json()
        except ValueError as exc:
            raise StoreError("error", "store did not answer with JSON") from exc
        if not isinstance(body, shape):
            raise StoreError("error", "store answered in a shape this client does not know")
        return body

    def _limit(self, limit: int) -> int:
        if not 1 <= limit <= MAX_LIMIT:
            raise StoreError("bad_request", f"limit must be 1 to {MAX_LIMIT}")
        return limit

    def feature(self, feature_id: str) -> dict[str, Any]:
        """Everything store holds about one feature, without people's names."""
        try:
            feature_id = str(uuid.UUID(str(feature_id)))
        except ValueError as exc:
            raise StoreError("bad_request", "a feature id is a UUID") from exc
        return _feature(self._get(f"/features/{feature_id}", None, dict))

    def sections(
        self,
        *,
        network: str | None = None,
        bbox: tuple[float, float, float, float] | None = None,
        at: dt.date | None = None,
        limit: int = MAX_LIMIT,
    ) -> Listing:
        """Drawn sections as GeoJSON features (rows of the map, one or more per section)."""
        limit = self._limit(limit)
        params = {
            "network": network,
            "bbox": ",".join(str(float(n)) for n in bbox) if bbox else None,
            "at": at.isoformat() if at else None,
            "limit": limit,
        }
        rows = self._get("/sections", params, dict).get("features")
        if not isinstance(rows, list):
            raise StoreError("error", "store answered in a shape this client does not know")
        return Listing([_section(r) for r in rows], cut=len(rows) >= limit, limit=limit)

    def missing(
        self, attribute: str, *, network: str | None = None, limit: int = MAX_LIMIT
    ) -> Listing:
        """Drawn sections with no accepted claim for `attribute`.

        A section counts what it takes from a trace merged into it or the section it was
        split from. It does not count what its pipeline holds.
        """
        if attribute not in ATTRIBUTE_KEYS:
            raise StoreError("bad_request", f"unknown attribute key {attribute!r}")
        limit = self._limit(limit)
        params = {"attribute": attribute, "network": network, "limit": limit}
        rows = self._get("/missing", params, list)
        return Listing([_keep(r, _MISSING) for r in rows], cut=len(rows) >= limit, limit=limit)

    def links(
        self, *, status: str | None = None, relation: str | None = None, limit: int = MAX_LIMIT
    ) -> Listing:
        if status is not None and status not in LINK_STATUSES:
            raise StoreError("bad_request", f"unknown link status {status!r}")
        limit = self._limit(limit)
        rows = self._get("/links", {"status": status, "relation": relation, "limit": limit}, list)
        return Listing([_keep(r, _LINK) for r in rows], cut=len(rows) >= limit, limit=limit)


def _detail(response: httpx.Response) -> str:
    """Store's own words for a refused request, so the caller can correct itself."""
    try:
        return str(response.json().get("detail", ""))[:500]
    except (ValueError, AttributeError):
        return ""
