"""Reading one feature from store."""

import json
from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from src.agent.config import FULL_VIEWS
from src.clients.store_client import StoreError
from src.tools.question import QuestionContext
from src.tools.views import feature_view, not_found, with_merged


@tool(response_format="content_and_artifact")
def read_feature(
    feature_id: str, runtime: ToolRuntime[QuestionContext]
) -> tuple[str, dict[str, Any]]:
    """Read everything store holds about one feature (a section or a pipeline) by its id:
    every claim with its status and citations, and every link. Claims of a trace merged
    into a section are listed under held_through_a_merged_trace and count as the
    section's own. A section's pipeline is the `to` end of a confirmed part_of link;
    read it by its id to see the pipeline's own claims."""
    question = runtime.context
    if feature_id in question.features_read:
        note = f"You already read {feature_id} for this question. Use that result."
        return note, {}
    store = question.store
    try:
        feature = store.feature(feature_id)
    except StoreError as error:
        if error.kind in ("not_found", "bad_request"):
            return not_found(feature_id)
        raise
    merged, missing = with_merged(store, feature)
    whole = len(question.features_read) < FULL_VIEWS
    question.features_read.add(feature_id)
    view = feature_view(feature, merged, question.handles, citations=whole)
    if missing:
        view["could_not_read"] = (
            f"{len(missing)} trace(s) merged into this section could not be read, so "
            "what store holds for it may be more than shown here."
        )
    return json.dumps(view, ensure_ascii=False), {"features": [feature, *merged]}
