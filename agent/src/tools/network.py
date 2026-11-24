"""Looking across the whole network: sections or pipelines that match a rule."""

import json
from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from src.tools.question import QuestionContext
from src.worked_out import context, network


@tool(response_format="content_and_artifact")
def find_sections(
    runtime: ToolRuntime[QuestionContext],
    lacking: str | None = None,
    first_shown: int | None = None,
    state: str | None = None,
    in_pipeline: bool | None = None,
    proposal_waiting: bool | None = None,
    diameter: str | None = None,
    end: str | None = None,
    longer_than_km: float | None = None,
    shorter_than_km: float | None = None,
) -> tuple[str, dict[str, Any]]:
    """Sections across the whole network that match a rule, counted by code, with
    the first ten named. Nothing needs to be attached. Rules, any of them together:
    `lacking`: a fact no source gives yet, one of name, owner, operator, diameter
    ("how many sections have no owner"); `first_shown`: the year of the map that
    first shows them ("which sections first appear in 1931"); `state`: a US state by
    its full name ("which sections are in Oklahoma"); `in_pipeline`: true for those
    in a pipeline, false for those in none; `proposal_waiting`: true for those with
    a value proposed and not decided yet ("which have a proposal waiting", "what
    should I work on next"); `diameter`: a diameter in inches, as "31 in" ("which
    sections are 31 inch"); `end`: "proposed" for those with an end proposed and not
    decided, "no_longer_shown" for those a later map is confirmed to have dropped;
    `longer_than_km` and `shorter_than_km`: by length as drawn ("sections longer than
    100 km"; give miles as km). With no rule it says how many sections there are. The
    result is one sentence: say it in your own words, with its counts and names as
    given."""
    store, handles, network_key = (
        runtime.context.store,
        runtime.context.handles,
        runtime.context.network,
    )
    if lacking is not None and lacking not in network.LACKABLE:
        return f"lacking is one of {', '.join(network.LACKABLE)}.", {}
    spelled = network.state_named(state) if state else None
    if state and not spelled:
        return f"There is no US state called {state}. Give its full name.", {}
    inches = network.diameter_named(diameter) if diameter else None
    if diameter and not inches:
        return 'Give the diameter in inches, as "31 in".', {}
    if end is not None and end not in network.END_STATUS:
        return "end is proposed or no_longer_shown.", {}
    listing = store.sections(network=network_key)
    sections = network.sections_of(listing.rows)
    cut = listing.cut
    lacking_ids = None
    if lacking:
        missing = store.missing(lacking, network=network_key)
        lacking_ids = {row["section_id"] for row in missing.rows}
        cut = cut or missing.cut
    found, words = network.find(
        sections,
        lacking_ids,
        lacking,
        first_shown,
        spelled,
        in_pipeline,
        proposal_waiting,
        inches,
        end,
        longer_than_km,
        shorter_than_km,
    )
    fact = network.network_fact(sections, found, words, cut, handles.worked)
    named = {s.id: s for s in found}
    view = {"worked_out": [{"handle": fact.handle, "text": fact.text}]}
    artifact = {
        "network": len(sections),
        "context_features": [named[i].stub() for i in fact.rests_on],
        "worked_out": [fact.model_dump()],
    }
    return json.dumps(view, ensure_ascii=False), artifact


@tool(response_format="content_and_artifact")
def find_pipelines(
    runtime: ToolRuntime[QuestionContext],
    lacking: str | None = None,
    proposed_only: bool | None = None,
) -> tuple[str, dict[str, Any]]:
    """Pipelines across the whole network that match a rule, counted by code, with
    the first ten named. Nothing needs to be attached. Rules, either or both:
    `lacking`: a fact no source gives for the pipeline itself, one of name, owner,
    operator ("which pipelines have no owner"); `proposed_only`: true for pipelines
    that are only proposed, with no section decided yet, false for those with at
    least one section decided. With no rule it says how many pipelines there are.
    Use it for questions about pipelines; find_sections is for sections. The result
    is one sentence: say it in your own words, with its counts and names as given."""
    store, handles, network_key = (
        runtime.context.store,
        runtime.context.handles,
        runtime.context.network,
    )
    if lacking is not None and lacking not in network.PIPELINE_LACKABLE:
        return f"lacking is one of {', '.join(network.PIPELINE_LACKABLE)}.", {}
    links = store.links(relation="part_of")
    counts: dict[str, list[int]] = {}
    for link in links.rows:
        if link["status"] != "rejected":
            tally = counts.setdefault(link["to_feature_id"], [0, 0])
            tally[0 if link["status"] == "confirmed" else 1] += 1
    read = context.read_many(store, list(counts))
    pipelines = sorted(
        (
            network.Pipeline(f, *counts[i])
            for i, f in read.items()
            if f.get("kind") == "line" and (network_key is None or f.get("network") == network_key)
        ),
        key=lambda p: p.name,
    )
    cut = links.cut or len(read) < len(counts)
    fact = network.pipelines_fact(pipelines, lacking, proposed_only, cut, handles.worked)
    by_id = {p.id: p.feature for p in pipelines}
    view = {"worked_out": [{"handle": fact.handle, "text": fact.text}]}
    artifact = {
        "network_pipelines": len(pipelines),
        "context_features": [by_id[i] for i in fact.rests_on],
        "worked_out": [fact.model_dump()],
    }
    return json.dumps(view, ensure_ascii=False), artifact
