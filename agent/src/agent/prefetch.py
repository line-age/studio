"""Store, with the attached features already fetched."""

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from src.clients.store_client import StoreClient, StoreError


class Prefetched:
    """Store, with the attached features already fetched: the slow part runs in
    parallel, while the tool still reads them one by one, so claim handles (C1, C2...)
    come out in the order attached and the reads stay inside the run's trace."""

    def __init__(self, store: StoreClient, ids: list[str]) -> None:
        self._store = store
        self._got: dict[str, Any] = {}
        self._fetch(ids)
        # The pipelines those sections are in: the model would read them next, for any
        # attribute a section does not hold. Read now, in the same parallel step.
        self.pipelines = list(
            dict.fromkeys(
                link["to_feature_id"]
                for got in self._got.values()
                if isinstance(got, dict) and got.get("kind") == "section"
                for link in got.get("links") or []
                if link["relation"] == "part_of"
                and link["status"] == "confirmed"
                and link["from_feature_id"] == got["id"]
                and link["to_feature_id"] not in ids
            )
        )
        self._fetch(self.pipelines)
        # Not attached: one store cannot read now is left to the model, not a failure.
        self.pipelines = [p for p in self.pipelines if isinstance(self._got.get(p), dict)]

    def _fetch(self, ids: list[str]) -> None:
        if ids:
            with ThreadPoolExecutor(max_workers=min(8, len(ids))) as pool:
                for fid, got in zip(ids, pool.map(self._try, ids), strict=True):
                    self._got[fid] = got

    @property
    def origin(self) -> StoreClient:
        """The store underneath, which outlives a question (context.py caches by it)."""
        return self._store

    def _try(self, fid: str) -> Any:
        try:
            return self._store.feature(fid)
        except StoreError as error:
            return error

    def feature(self, feature_id: str) -> dict[str, Any]:
        got = self._got.get(feature_id)  # kept: read_context reads it again
        if got is None:
            return self._store.feature(feature_id)
        if isinstance(got, StoreError):
            raise got
        return got

    def __getattr__(self, name: str) -> Any:
        return getattr(self._store, name)
