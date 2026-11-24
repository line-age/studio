"""Sections taken together: several attached, or a pipeline's own."""

import json
from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.tools import tool

from src.clients.store_client import StoreError
from src.tools.question import QuestionContext
from src.tools.views import not_found, with_merged
from src.worked_out import context, together


@tool(response_format="content_and_artifact")
def sections_together(
    section_ids: list[str], runtime: ToolRuntime[QuestionContext]
) -> tuple[str, dict[str, Any]]:
    """Two or more sections taken together, worked out by code: for name, owner,
    operator and diameter whether they are the same, differ or are not known; which
    map first shows each and which is shown earlier; how long each is drawn and which
    is longer; which are in a pipeline and whether it is the same one; for two,
    whether they are drawn touching or how far apart; the states they lie in. More
    than two are summarised with counts and the exceptions by name. Use it to
    compare, for "in common", "differ", "older", "longer", "same pipeline", "which of
    these", and for what is known about many sections. Each sentence says what it is
    `about` and is labelled `says`: same (they share it), differs (they do not, or only
    some have it), nothing_known, or all_of_them (a total or a list). Say what answers
    the question in your own words, with these values as given."""
    store, handles = runtime.context.store, runtime.context.handles
    ids = list(dict.fromkeys(section_ids))
    if len(ids) < 2:
        return "Give two or more sections.", {}
    read = context.read_many(store, ids)
    gone = [i for i in ids if i not in read]
    if gone:
        return not_found(gone[0])
    if any(f.get("kind") != "section" for f in read.values()):
        return "Only sections are taken together.", {}
    merged_of = {i: with_merged(store, read[i])[0] for i in ids}
    sections = [together.Section(read[i], merged_of[i]) for i in ids]
    line_ids = [p for s in sections for st in ("confirmed", "proposed") for p in s.pipelines(st)]
    lines = context.read_many(store, line_ids)
    facts = together.together_facts(sections, lines, handles.worked)
    view = {
        "sections": [s.name for s in sections],
        "worked_out": [
            {"handle": w.handle, "about": t, "says": together.says(w.text), "text": w.text}
            for t, w in facts
        ],
    }
    artifact = {
        "together": ids,
        "context_features": [
            *read.values(),
            *(m for ms in merged_of.values() for m in ms),
            *lines.values(),
        ],
        "worked_out": [w.model_dump() for _, w in facts],
    }
    return json.dumps(view, ensure_ascii=False), artifact


@tool(response_format="content_and_artifact")
def pipeline_sections(
    pipeline_id: str, runtime: ToolRuntime[QuestionContext]
) -> tuple[str, dict[str, Any]]:
    """A pipeline's sections, worked out by code: how many it has and which, and,
    taking them together, what they share and where they differ (owner, operator,
    diameter, first map, the states they lie in), how long they are drawn in all,
    and which of them lack a fact. Use it for any question about a pipeline as a
    whole: which sections are in it, how long it is, where it runs, when it first
    appears on a map, what its sections have in common, which of them have no
    diameter, what is missing. Each sentence says what it is `about` and is labelled
    `says` (same, differs, nothing_known, all_of_them). Say what answers the question
    in your own words, with these values as given."""
    store, handles = runtime.context.store, runtime.context.handles
    try:
        line = store.feature(pipeline_id)
    except StoreError as error:
        if error.kind in ("not_found", "bad_request"):
            return not_found(pipeline_id)
        raise
    if line.get("kind") != "line":
        return "Only a pipeline has sections.", {}

    def ends(status: str) -> list[str]:
        return [
            link["from_feature_id"]
            for link in line.get("links") or []
            if link["relation"] == "part_of"
            and link["status"] == status
            and link["to_feature_id"] == line["id"]
        ]

    read = context.read_many(store, [*ends("confirmed"), *ends("proposed")])
    member_ids = [i for i in ends("confirmed") if i in read]
    merged_of = {i: with_merged(store, read[i])[0] for i in member_ids}
    members = [together.Section(read[i], merged_of[i]) for i in member_ids]
    waiting = [read[i] for i in ends("proposed") if i in read]
    facts = [("sections", together.members_fact(line, members, waiting, handles.worked))]
    total = together.total_length(members)
    if total:
        # Two sections: their length in all, which comparing the two does not give.
        facts.append(
            (
                "length",
                together.WorkedOut(
                    handle=handles.worked(),
                    what="together",
                    text=total[0],
                    rests_on=member_ids,
                ),
            )
        )
    if len(members) > 1:
        facts += [
            ("longer" if t == "length" and total else t, w)
            for t, w in together.together_facts(members, {line["id"]: line}, handles.worked)
            if t != "pipeline"  # they are all in this one: said by the count
        ]
    elif members:
        facts += [(w.what, w) for w in context.place_facts(read[member_ids[0]], handles.worked)]
    view = {
        "pipeline": context.pipeline_words(line),
        "worked_out": [
            {
                "handle": w.handle,
                "about": t,
                # One section: nothing to share or differ in.
                "says": together.says(w.text) if len(members) > 1 else "all_of_them",
                "text": w.text,
            }
            | ({"values": w.values} if w.values else {})
            for t, w in facts
        ],
    }
    artifact = {
        "sections_of": line["id"],
        "members": member_ids,
        "context_features": [
            line,
            *read.values(),
            *(m for ms in merged_of.values() for m in ms),
        ],
        "worked_out": [w.model_dump() for _, w in facts],
    }
    return json.dumps(view, ensure_ascii=False), artifact
