"""Proposing a pipeline from the chat (plan 005).

The person asks, in words, to make the attached sections one pipeline. Code, not the
model, sees the request and answers with an offer (`pipeline_offer`): Studio shows it as
a Confirmation and nothing is written. Only the person's button, the action
`propose_pipeline`, writes: one new `line` and a proposed `part_of` link per section,
through the proposal client and its `cite@` token, so store keeps every link proposed
whatever is sent. A person decides it in Studio's inbox; the Agent never confirms (R12).
A section already in a pipeline is proposed as well: its proposal shows beside its
membership until a person moves it (R13).
"""

import re
import uuid
from typing import Any

from render import feature_name
from schemas import PipelineOffer, Ref, Statement

# More than this in one pipeline is a selection gone wrong, not a pipeline.
MAX_SECTIONS = 200

# "Make these one pipeline", "group them into a pipeline", "join these sections into a
# single pipeline". A verb that makes, then "pipeline" with an article before it; a
# question about a pipeline ("is it in a pipeline?") has no such verb.
WORDS = re.compile(
    r"\b(make|form|group|join|combine|put|turn|merge|propose)\b[^.?!]*\b(one|a|single|same|new)\s+"
    r"(?:new\s+)?pipeline\b",
    re.IGNORECASE,
)

LINES = {
    "offer": (
        "Propose these {n} sections as one pipeline? Store keeps it as a proposal until "
        "a person decides it in the inbox."
    ),
    "offer_placed": (
        " {k} of them {verb} already in a pipeline; {pronoun} {stay} there until a "
        "person moves {object}."
    ),
    "too_few": "To propose a pipeline, attach two or more sections and ask again.",
    "too_many": f"A pipeline is proposed from at most {MAX_SECTIONS} sections at a time.",
    "not_sections": "Only sections go into a pipeline. Attach the sections and ask again.",
    "mixed_networks": "These sections are on different networks, so they are not one pipeline.",
    "gone": "Store no longer has one of these sections. Attach them again and ask again.",
    "proposed": "Proposed a pipeline of {n} sections. Decide it in the inbox.",
    "already": "A pipeline of these {n} sections is already proposed. Decide it in the inbox.",
    "write_failed": "Store did not take the proposal, so nothing was written.",
}


def asks_for_pipeline(words: str) -> bool:
    return bool(WORDS.search(words))


def canonical(section_ids: list[str]) -> list[str] | None:
    """The ids, each once, as UUIDs, in the order given; None if one is not a UUID."""
    try:
        return list(dict.fromkeys(str(uuid.UUID(str(i))) for i in section_ids))
    except ValueError:
        return None


def confirmed_pipeline(section: dict[str, Any]) -> str | None:
    """The pipeline the section is confirmed in, if any."""
    for link in section.get("links") or []:
        if (
            link.get("relation") == "part_of"
            and link.get("status") == "confirmed"
            and link.get("from_feature_id") == section["id"]
        ):
            return link["to_feature_id"]
    return None


def check(sections: list[dict[str, Any]]) -> str | None:
    """Why these features cannot be proposed as one pipeline, or None."""
    if len(sections) < 2:
        return LINES["too_few"]
    if len(sections) > MAX_SECTIONS:
        return LINES["too_many"]
    if any(s.get("kind") != "section" for s in sections):
        return LINES["not_sections"]
    if len({s.get("network") for s in sections}) > 1:
        return LINES["mixed_networks"]
    return None


def _refs(sections: list[dict[str, Any]]) -> list[Ref]:
    return [Ref(type="feature", id=s["id"], label=feature_name(s)) for s in sections]


def offer(sections: list[dict[str, Any]]) -> Statement:
    placed = [s["id"] for s in sections if confirmed_pipeline(s)]
    text = LINES["offer"].format(n=len(sections))
    if placed:
        one = len(placed) == 1
        text += LINES["offer_placed"].format(
            k=len(placed),
            verb="is" if one else "are",
            pronoun="it" if one else "they",
            stay="stays" if one else "stay",
            object="it" if one else "them",
        )
    return Statement(
        kind="pipeline_offer",
        text=text,
        refs=_refs(sections),
        pipeline=PipelineOffer(section_ids=[s["id"] for s in sections], in_pipeline=placed),
    )


def outcome(sections: list[dict[str, Any]], written: dict[str, Any]) -> Statement:
    created = written.get("created") or {}
    again = bool(created) and not any(created.values())
    line_id = (written.get("ids") or {}).get("line")
    refs = _refs(sections)
    if line_id:
        line = {"id": str(line_id), "kind": "line"}
        refs.insert(0, Ref(type="feature", id=line["id"], label=feature_name(line)))
    key = "already" if again else "proposed"
    return Statement(kind="proposed", text=LINES[key].format(n=len(sections)), refs=refs)
