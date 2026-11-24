"""What the model is shown of a feature and its claims, and the traces store counts as a
section's own."""

from typing import Any

from src.clients.store_client import StoreClient, StoreError
from src.tools.handles import Handles

# What the model is shown of a claim. The ids are what it cites; everything else is what
# it may say, in its own words, only through slots.
_CLAIM_FIELDS = (
    "id",
    "attribute_key",
    "value_text",
    "value_num",
    "value_unit",
    "valid_edtf",
    "start_earliest",
    "start_latest",
    "end_earliest",
    "end_latest",
    "status",
    "asserted_by_kind",
    "asserted_by_name",
)


def claim_view(claim: dict[str, Any], handles: Handles, citations: bool = True) -> dict[str, Any]:
    view = {k: claim[k] for k in _CLAIM_FIELDS if claim.get(k) is not None}
    view["id"] = handles.of(claim["id"])
    if claim.get("value_geom"):
        view["value"] = "a traced line (not shown, never a value to state)"
    if citations:
        view["citations"] = [
            {
                k: c[k]
                for k in ("role", "source_title", "source_kind", "locator", "quote")
                if c.get(k)
            }
            for c in claim.get("citations") or []
        ]
    view["reviews"] = [r["verdict"] for r in claim.get("reviews") or []]
    return view


def own_claims(feature: dict[str, Any], handles: Handles) -> list[dict[str, Any]]:
    """A feature's claims as the model sees them, leaving out its traced route."""
    return [
        claim_view(c, handles) for c in feature.get("claims") or [] if c["attribute_key"] != "route"
    ]


def feature_view(
    feature: dict[str, Any],
    merged: list[dict[str, Any]],
    handles: Handles,
    citations: bool = True,
) -> dict[str, Any]:
    """A feature as the model sees it; without `citations`, its claims' sources are left
    out (code still shows them with the answer)."""
    view = {
        "id": feature["id"],
        "kind": feature["kind"],
        "label": feature.get("label"),
        "dates": feature.get("dates"),
        "claims": [claim_view(c, handles, citations) for c in feature["claims"]],
        "held_through_a_merged_trace": [
            {
                "trace_id": m["id"],
                "claims": [claim_view(c, handles, citations) for c in m["claims"]],
            }
            for m in merged
        ],
        "links": [
            {k: link[k] for k in ("id", "relation", "status", "from_feature_id", "to_feature_id")}
            for link in feature["links"]
        ],
    }
    if not citations:
        view["citations_left_out"] = (
            "Many things were read for this question, so this one's claims are shown "
            "without their citations. Pick claims by handle as usual; code shows each "
            "claim's source with the answer."
        )
    return view


def _merged_into(feature: dict[str, Any]) -> list[str]:
    """Features whose claims store counts as this section's own: a trace merged into it
    (confirmed same_as to it) or the section it was split from (confirmed split_into)."""
    return [
        link["from_feature_id"]
        for link in feature["links"]
        if link["to_feature_id"] == feature["id"]
        and link["relation"] in ("same_as", "split_into")
        and link["status"] == "confirmed"
    ]


def with_merged(
    store: StoreClient, feature: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[str]]:
    """Traces merged into a section, and traces merged into those, as store counts them;
    and the ids of any that could not be read."""
    merged: list[dict[str, Any]] = []
    missing: list[str] = []
    visited = {feature["id"]}
    queue = _merged_into(feature)
    while queue:
        fid = queue.pop(0)
        if fid in visited:
            continue
        visited.add(fid)
        try:
            found = store.feature(fid)
        except StoreError as error:
            if error.kind not in ("not_found", "bad_request"):
                raise
            missing.append(fid)
            continue
        merged.append(found)
        queue += _merged_into(found)
    return merged, missing


def not_found(feature_id: str) -> tuple[str, dict[str, Any]]:
    """What a tool says of an id store does not have."""
    return f"Store has no feature with the id {feature_id}.", {"not_found": feature_id}
