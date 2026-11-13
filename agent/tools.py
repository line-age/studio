"""The Agent's tools. Each returns words for the model and, as its artifact, exactly what
store returned: the artifact is what the grounding ledger is built from."""

import json
from typing import Any

from langchain_core.tools import BaseTool, tool

from store_client import StoreClient, StoreError

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


def _claim_view(claim: dict[str, Any]) -> dict[str, Any]:
    view = {k: claim[k] for k in _CLAIM_FIELDS if claim.get(k) is not None}
    if claim.get("value_geom"):
        view["value"] = "a traced line (not shown, never a value to state)"
    view["citations"] = [
        {k: c[k] for k in ("role", "source_title", "source_kind", "locator", "quote") if c.get(k)}
        for c in claim.get("citations") or []
    ]
    view["reviews"] = [r["verdict"] for r in claim.get("reviews") or []]
    return view


def _feature_view(feature: dict[str, Any], merged: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": feature["kind"],
        "label": feature.get("label"),
        "dates": feature.get("dates"),
        "claims": [_claim_view(c) for c in feature["claims"]],
        "held_through_a_merged_trace": [
            {"trace_id": m["id"], "claims": [_claim_view(c) for c in m["claims"]]} for m in merged
        ],
        "links": [
            {k: link[k] for k in ("id", "relation", "status", "from_feature_id", "to_feature_id")}
            for link in feature["links"]
        ],
    }


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


def make_tools(store: StoreClient) -> list[BaseTool]:
    @tool(response_format="content_and_artifact")
    def read_feature(feature_id: str) -> tuple[str, dict[str, Any]]:
        """Read everything store holds about one feature (a section or a pipeline) by its id:
        every claim with its status and citations, and every link. Claims of a trace merged
        into a section are listed under held_through_a_merged_trace and count as the
        section's own. A section's pipeline is the `to` end of a confirmed part_of link;
        read it by its id to see the pipeline's own claims."""
        try:
            feature = store.feature(feature_id)
            merged = [store.feature(fid) for fid in _merged_into(feature)]
        except StoreError as error:
            if error.kind in ("not_found", "bad_request"):
                return (
                    f"Store has no feature with the id {feature_id}.",
                    {"not_found": feature_id},
                )
            raise
        view = _feature_view(feature, merged)
        return json.dumps(view, ensure_ascii=False), {"features": [feature, *merged]}

    return [read_feature]
