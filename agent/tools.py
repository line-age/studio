"""The Agent's tools. Each returns words for the model and, as its artifact, exactly what
store returned: the artifact is what the grounding ledger is built from."""

import json
import threading
from typing import Any

from langchain_core.tools import BaseTool, tool

import context
from render import feature_name
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


class Handles:
    """Short names for the claims a question read (C1, C2, ...). A model copies `C7`
    reliably; it does not always copy a 36-character id. Code turns them back into ids."""

    def __init__(self) -> None:
        self.ids: dict[str, str] = {}
        self._of: dict[str, str] = {}
        self._worked = 0
        # Reads run in parallel threads; two claims must never get the same handle.
        self._lock = threading.Lock()

    def of(self, claim_id: str) -> str:
        with self._lock:
            if claim_id not in self._of:
                handle = f"C{len(self._of) + 1}"
                self._of[claim_id], self.ids[handle] = handle, claim_id
            return self._of[claim_id]

    def worked(self) -> str:
        """The next handle for something code worked out: W1, W2, ..."""
        with self._lock:
            self._worked += 1
            return f"W{self._worked}"

    def resolve(self, ref_id: str) -> str:
        return self.ids.get(ref_id.strip().upper(), ref_id)


def _claim_view(claim: dict[str, Any], handles: Handles) -> dict[str, Any]:
    view = {k: claim[k] for k in _CLAIM_FIELDS if claim.get(k) is not None}
    view["id"] = handles.of(claim["id"])
    if claim.get("value_geom"):
        view["value"] = "a traced line (not shown, never a value to state)"
    view["citations"] = [
        {k: c[k] for k in ("role", "source_title", "source_kind", "locator", "quote") if c.get(k)}
        for c in claim.get("citations") or []
    ]
    view["reviews"] = [r["verdict"] for r in claim.get("reviews") or []]
    return view


def _feature_view(
    feature: dict[str, Any], merged: list[dict[str, Any]], handles: Handles
) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": feature["kind"],
        "label": feature.get("label"),
        "dates": feature.get("dates"),
        "claims": [_claim_view(c, handles) for c in feature["claims"]],
        "held_through_a_merged_trace": [
            {"trace_id": m["id"], "claims": [_claim_view(c, handles) for c in m["claims"]]}
            for m in merged
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


def make_tools(store: StoreClient, handles: Handles | None = None) -> list[BaseTool]:
    """Tools for one question. A feature read twice in the same question is not fetched
    again: the model is told it already has it. Claims are shown by handle (`handles`)."""
    seen: set[str] = set()
    context_seen: set[str] = set()
    handles = handles if handles is not None else Handles()

    @tool(response_format="content_and_artifact")
    def read_feature(feature_id: str) -> tuple[str, dict[str, Any]]:
        """Read everything store holds about one feature (a section or a pipeline) by its id:
        every claim with its status and citations, and every link. Claims of a trace merged
        into a section are listed under held_through_a_merged_trace and count as the
        section's own. A section's pipeline is the `to` end of a confirmed part_of link;
        read it by its id to see the pipeline's own claims."""
        if feature_id in seen:
            note = f"You already read {feature_id} for this question. Use that result."
            return note, {}
        try:
            feature = store.feature(feature_id)
        except StoreError as error:
            if error.kind in ("not_found", "bad_request"):
                return (
                    f"Store has no feature with the id {feature_id}.",
                    {"not_found": feature_id},
                )
            raise
        # Traces merged into it, and traces merged into those, as store counts them.
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
        seen.add(feature_id)
        view = _feature_view(feature, merged, handles)
        if missing:
            view["could_not_read"] = (
                f"{len(missing)} trace(s) merged into this section could not be read, so "
                "what store holds for it may be more than shown here."
            )
        return json.dumps(view, ensure_ascii=False), {"features": [feature, *merged]}

    @tool(response_format="content_and_artifact")
    def read_context(section_id: str) -> tuple[str, dict[str, Any]]:
        """What code works out about one section from store, beyond its own claims: which
        map printing first shows it, and what store holds about its end. Each item has a
        handle (W1, W2...) and a sentence code wrote. To use one, add a statement of kind
        worked_out with that handle in refs and leave its text empty."""
        if section_id in context_seen:
            return f"You already read the context of {section_id}. Use that result.", {}
        try:
            feature = store.feature(section_id)
        except StoreError as error:
            if error.kind in ("not_found", "bad_request"):
                return (
                    f"Store has no feature with the id {section_id}.",
                    {"not_found": section_id},
                )
            raise
        if feature.get("kind") != "section":
            return "Context is worked out for a section only.", {}
        context_seen.add(section_id)
        ends = context.read_ends(store, feature)
        worked = context.edition_facts(feature, ends, context.edition_years(store), handles.worked)
        view = {
            "section": feature_name(feature),
            "worked_out": [{"handle": w.handle, "text": w.text} for w in worked],
        }
        artifact = {
            "context_of": feature["id"],
            "context_features": [feature, *ends.values()],
            "worked_out": [w.model_dump() for w in worked],
        }
        return json.dumps(view, ensure_ascii=False), artifact

    return [read_feature, read_context]
