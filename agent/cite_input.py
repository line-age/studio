"""A section as cite takes it in: built by code from store's reads and the person's
request. Nothing here comes from the model.

- Ids, the line type from the network, a name hint from accepted name, owner or operator
  claims (hints only: cite never claims them).
- The observation: the first printing store shows the section on, cited (`first_shown`).
  Without one there is no map year, so cite is not asked.
- Places: only the person's (plan D3), all marked given. No gazetteer, no scan reading.
- The search window: the person's years; else between the last printing without the
  section and the first with it, when store has both; else cite's own default.
- Ruled out: store's rejected claims for the attributes asked, and values the person
  turned down. Never cite's own rejections.
- States: none yet. Working them out from the traced line needs state boundaries the
  Agent does not hold yet (plan S3).
"""

import re
from dataclasses import dataclass, field
from typing import Any

from context import Editions, first_shown
from render import Unfillable, value_words

# Store's attribute, as the person asks for it, to cite's (plan D1). Built is a status
# claim in store: under construction or operational, with when.
TO_CITE = {"owner": "Ownership", "diameter": "Size", "status": "YearConstructed"}
FROM_CITE = {cite: store for store, cite in TO_CITE.items()}
# The finding's word for each, as Studio shows it.
WORDS = {"owner": "owner", "diameter": "diameter", "status": "built"}
LINE_TYPES = {"gas": "natural gas", "oil": "crude oil", "refined": "refined products"}
_YEAR = re.compile(r"\d{4}")


class NoEdition(Exception):
    """No printing store holds shows the section: there is no map year to search by."""


@dataclass
class CiteAsk:
    """What one search is for, after the guard: one section, its attributes, and what
    the person gave to steer it."""

    section_id: str
    attributes: list[str]  # store keys: owner, diameter, status
    places: list[str] = field(default_factory=list)
    years: tuple[int, int] | None = None
    ruled_out: list[tuple[str, str]] = field(default_factory=list)  # (store key, value)


def _name_hint(features: list[dict[str, Any]]) -> str | None:
    for attribute in ("name", "owner", "operator"):
        for feature in features:
            for claim in feature.get("claims") or []:
                if (
                    claim["attribute_key"] == attribute
                    and claim["status"] == "accepted"
                    and claim.get("value_text")
                ):
                    return str(claim["value_text"])
    return None


def default_window(first_year: int, editions: Editions) -> tuple[int, int] | None:
    """Between the last printing without it and the first with it, when store has both."""
    if not editions.complete:
        return None
    earlier = [y for y in editions.years if y < first_year]
    return (earlier[-1], first_year) if earlier else None


def _rejected(features: list[dict[str, Any]], attributes: list[str]) -> list[tuple[str, str]]:
    out = []
    for feature in features:
        for claim in feature.get("claims") or []:
            key = claim["attribute_key"]
            if claim["status"] != "rejected" or key not in attributes or key == "status":
                continue  # a rejected status is a stage, not a year cite could rule out
            try:
                out.append((key, value_words(claim)))
            except Unfillable:  # a value with no words is not sent
                pass
    return out


def build(
    ask: CiteAsk,
    feature: dict[str, Any],
    merged: list[dict[str, Any]],
    pipeline: dict[str, Any] | None,
    editions: Editions,
) -> dict[str, Any]:
    """cite's input for one search. Raises NoEdition."""
    own = [feature, *merged]
    shown = [s for f in own if (s := first_shown(f))]
    if not shown:
        raise NoEdition(feature["id"])
    year, claim = min(shown, key=lambda pair: pair[0])
    source = next(
        (c.get("source_title") for c in claim.get("citations") or [] if c.get("source_title")),
        None,
    )
    window = ask.years or default_window(year, editions)
    ruled = list(dict.fromkeys([*_rejected(own, ask.attributes), *ask.ruled_out]))
    section: dict[str, Any] = {
        "pipe_id": pipeline["id"] if pipeline else feature["id"],
        "section_id": feature["id"],
        "line_type": LINE_TYPES.get(str(feature.get("network") or "")),
        "name": _name_hint([*own, *([pipeline] if pipeline else [])]) or feature.get("label"),
        "states": [],
        "places": list(ask.places),
        "places_given": list(ask.places),
        "observations": [{"year": year, "source": source}],
        "attributes": [TO_CITE[a] for a in ask.attributes],
        "ruled_out": [{"attribute": TO_CITE[a], "value": v} for a, v in ruled],
    }
    if window:
        section["search_window"] = {"from": window[0], "to": window[1]}
    return section


def years_in(text: str) -> set[int]:
    return {int(y) for y in _YEAR.findall(text)}
