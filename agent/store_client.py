"""Store over HTTP, read only. The one place the Agent talks to store.

Three things happen here and nowhere else, so neither the model nor a trace can get
around them: people's names are removed, attribute keys are checked (store's `/missing`
does not check them and answers with every section), and a list as long as its limit is
flagged as possibly cut off (store has no paging).
"""

from dataclasses import dataclass
from typing import Any

import httpx

# store's attribute registry (research note: the store API). `/missing` accepts anything.
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
MAX_LIMIT = 10_000


class StoreError(Exception):
    """Why a read failed, as one of: unreachable, refused, not_found, bad_request, error."""

    def __init__(self, kind: str, detail: str = ""):
        super().__init__(f"{kind}: {detail}" if detail else kind)
        self.kind = kind


@dataclass(frozen=True)
class Listing:
    rows: list[dict[str, Any]]
    # True when store returned as many rows as the limit: there may be more.
    cut: bool
    limit: int


def _strip_names(feature: dict[str, Any]) -> dict[str, Any]:
    """Remove people's names. A tool keeps its name; a person is only "person"."""
    for claim in feature.get("claims") or []:
        if claim.get("asserted_by_kind") != "pipeline":
            claim.pop("asserted_by_name", None)
        for review in claim.get("reviews") or []:
            review.pop("reviewer_name", None)
    for link in feature.get("links") or []:
        # A link does not say whether its asserter is a tool or a person.
        link.pop("asserted_by_name", None)
    return feature


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
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            transport=transport,
            timeout=timeout,
        )

    def close(self) -> None:
        self._http.close()

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        params = {k: v for k, v in (params or {}).items() if v is not None}
        try:
            response = self._http.get(path, params=params)
        except httpx.HTTPError as exc:
            raise StoreError("unreachable", type(exc).__name__) from exc
        if response.status_code in (401, 403):
            raise StoreError("refused", str(response.status_code))
        if response.status_code == 404:
            raise StoreError("not_found", path)
        if response.status_code == 422:
            raise StoreError("bad_request", path)
        if response.status_code >= 400:
            raise StoreError("error", str(response.status_code))
        return response.json()

    def _listing(self, rows: list[dict[str, Any]], limit: int) -> Listing:
        return Listing(rows=rows, cut=len(rows) >= limit, limit=limit)

    def feature(self, feature_id: str) -> dict[str, Any]:
        """Everything store holds about one feature, without people's names."""
        return _strip_names(self._get(f"/features/{feature_id}"))

    def sections(
        self,
        *,
        network: str | None = None,
        bbox: tuple[float, float, float, float] | None = None,
        at: str | None = None,
        limit: int = MAX_LIMIT,
    ) -> Listing:
        """Drawn sections as GeoJSON features (rows of the map, one or more per section)."""
        collection = self._get(
            "/sections",
            {
                "network": network,
                "bbox": ",".join(str(n) for n in bbox) if bbox else None,
                "at": at,
                "limit": limit,
            },
        )
        return self._listing(collection["features"], limit)

    def missing(
        self, attribute: str, *, network: str | None = None, limit: int = MAX_LIMIT
    ) -> Listing:
        """Drawn sections with no accepted claim for `attribute`."""
        if attribute not in ATTRIBUTE_KEYS:
            raise StoreError("bad_request", f"unknown attribute key {attribute!r}")
        rows = self._get("/missing", {"attribute": attribute, "network": network, "limit": limit})
        return self._listing(rows, limit)

    def links(
        self, *, status: str | None = None, relation: str | None = None, limit: int = MAX_LIMIT
    ) -> Listing:
        rows = self._get("/links", {"status": status, "relation": relation, "limit": limit})
        return self._listing(rows, limit)
