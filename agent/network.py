"""Questions across the whole network: which sections match a rule, counted and named.

Worked out by code from store's listing of drawn sections; never a claim. The rule is
said in the sentence, so a count is never read without what was counted. Rules combine
with "and". A listing that was cut off is said to be cut off: a count is never passed
off as the whole when it may not be.
"""

from collections.abc import Callable
from typing import Any

import geometry
import states
from render import feature_name
from schemas import WorkedOut

LACKABLE = ("name", "owner", "operator", "diameter")
# How many matching sections are named in the sentence; the rest are counted.
NAMED = 10


class Found:
    """One drawn section, from the rows store lists for it."""

    def __init__(self, section_id: str, rows: list[dict[str, Any]]) -> None:
        props = [r["properties"] for r in rows]
        self.id = section_id
        self.label = next((p["label"] for p in props if p.get("label")), None)
        years = [int(p["time_start"][:4]) for p in props if p.get("time_start")]
        self.first = min(years) if years else None
        self.line_id = next((p["line_id"] for p in props if p.get("line_id")), None)
        self.waiting = any(p.get("has_candidates") for p in props)
        # "30 in; 31 in": every accepted diameter, as store lists them.
        self.diameters = {
            d.strip() for p in props for d in str(p.get("diameter") or "").split(";") if d.strip()
        }
        self.end = next((p["end_status"] for p in props if p.get("end_status")), None)
        self.lines = [line for r in rows for line in geometry.lines_of(r.get("geometry"))]

    @property
    def name(self) -> str:
        return feature_name({"id": self.id, "kind": "section", "label": self.label})

    @property
    def km(self) -> float:
        return geometry.length_m(self.lines) / 1_000

    def stub(self) -> dict[str, Any]:
        """Enough of the section for an answer to name it and link to it."""
        return {"id": self.id, "kind": "section", "label": self.label, "claims": [], "links": []}


def sections_of(rows: list[dict[str, Any]]) -> list[Found]:
    by_id: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_id.setdefault(row["properties"]["section_id"], []).append(row)
    return sorted((Found(sid, group) for sid, group in by_id.items()), key=lambda f: f.name)


def state_named(words: str) -> str | None:
    """The state a person named, as the boundaries file spells it; None if there is none."""
    wanted = words.strip().lower()
    return next((s.name for s in states.all_states() if s.name.lower() == wanted), None)


def find(
    sections: list[Found],
    lacking_ids: set[str] | None,
    lacking: str | None,
    first_shown: int | None,
    state: str | None,
    in_pipeline: bool | None,
    proposal_waiting: bool | None,
    diameter: str | None = None,
    end: str | None = None,
    longer_than_km: float | None = None,
    shorter_than_km: float | None = None,
) -> tuple[list[Found], list[str]]:
    """The sections every given rule holds for, and the rules in words."""
    found, words = sections, []
    if lacking:
        found = [s for s in found if s.id in (lacking_ids or set())]
        words.append(f"with no known {lacking}")
    if first_shown is not None:
        found = [s for s in found if s.first == first_shown]
        words.append(f"first shown on the {first_shown} map")
    if state:
        found = [s for s in found if state in states.states_of(s.lines)]
        words.append(f"in {state}")
    if in_pipeline is not None:
        found = [s for s in found if bool(s.line_id) == in_pipeline]
        words.append("in a pipeline" if in_pipeline else "in no pipeline")
    if proposal_waiting:
        found = [s for s in found if s.waiting]
        words.append("with a proposal waiting for a decision")
    if diameter:
        found = [s for s in found if diameter in s.diameters]
        words.append(f"with a diameter of {diameter}")
    if end:
        found = [s for s in found if s.end == END_STATUS[end]]
        words.append(END_WORDS[end])
    if longer_than_km is not None:
        found = [s for s in found if s.lines and s.km > longer_than_km]
        words.append(f"longer than {longer_than_km:g} km as drawn")
    if shorter_than_km is not None:
        found = [s for s in found if s.lines and s.km < shorter_than_km]
        words.append(f"shorter than {shorter_than_km:g} km as drawn")
    return found, words


# An end as a person asks for it, as store marks it, and as it is said.
END_STATUS = {"proposed": "proposed", "no_longer_shown": "confirmed"}
END_WORDS = {
    "proposed": "with an end proposed, not decided yet",
    "no_longer_shown": "no longer shown on a later map",
}


def diameter_named(words: str) -> str | None:
    """A diameter as store words it ("31 in"), from "31", "31 in", "31-inch", '31"'."""
    import re

    said = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(?:-?\s*(?:in|inch|inches|\"))?\.?\s*", words)
    return f"{float(said.group(1)):g} in" if said else None


class Pipeline:
    """One pipeline, with how its sections are linked to it."""

    def __init__(self, feature: dict[str, Any], confirmed: int, proposed: int) -> None:
        self.feature, self.id = feature, feature["id"]
        self.confirmed, self.proposed = confirmed, proposed
        name = feature_name(feature)
        self.name = name if name.startswith("pipeline ") else f"the pipeline {name}"

    def lacks(self, attribute: str) -> bool:
        return not any(
            c["attribute_key"] == attribute and c["status"] == "accepted"
            for c in self.feature.get("claims") or []
        )


PIPELINE_LACKABLE = ("name", "owner", "operator")


def pipelines_fact(
    pipelines: list[Pipeline],
    lacking: str | None,
    proposed_only: bool | None,
    cut: bool,
    handle: Callable[[], str],
) -> WorkedOut:
    """Pipelines that match a rule, counted and named; with no rule, how many there are.
    Only pipelines some section is linked to, or proposed for, can be found."""
    total = len(pipelines)
    found, words = pipelines, []
    if lacking:
        found = [p for p in found if p.lacks(lacking)]
        words.append(f"with no known {lacking}")
    if proposed_only is not None:
        found = [p for p in found if (p.confirmed == 0) == proposed_only]
        words.append(
            "only proposed, with no section decided yet"
            if proposed_only
            else "with at least one section decided"
        )
    if not words:
        only = sum(1 for p in pipelines if p.confirmed == 0)
        text = f"The network has {total} pipelines, {only} of them only proposed."
        named: list[Pipeline] = []
    else:
        text = f"Pipelines {' and '.join(words)}: {len(found)} of the {total} in the network."
        named = found[:NAMED]
        names = ", ".join(p.name for p in named)
        if len(found) == 1:
            text += f" It is {names}."
        elif 1 < len(found) <= NAMED:
            text += f" They are: {names}."
        elif found:
            text += f" The first {NAMED} are: {names}."
    if cut:
        text += " The list was cut off, so there may be more."
    return WorkedOut(handle=handle(), what="network", text=text, rests_on=[p.id for p in named])


def network_fact(
    sections: list[Found],
    found: list[Found],
    words: list[str],
    cut: bool,
    handle: Callable[[], str],
) -> WorkedOut:
    total = len(sections)
    if not words:
        text = f"The network has {total} sections."
        named: list[Found] = []
    else:
        text = f"Sections {' and '.join(words)}: {len(found)} of the {total} in the network."
        named = found[:NAMED]
        names = ", ".join(s.name for s in named)
        if len(found) == 1:
            text += f" It is {names}."
        elif 1 < len(found) <= NAMED:
            text += f" They are: {names}."
        elif found:
            text += f" The first {NAMED} are: {names}."
    if cut:
        text += " The list of sections was cut off, so there may be more."
    return WorkedOut(handle=handle(), what="network", text=text, rests_on=[s.id for s in named])
