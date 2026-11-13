"""The one place where values become words.

The model writes sentences with slots (`{c1.value}`, `{c1.period}`) and never a value of
its own. This module fills the slots from what was read from store in this run, and
writes the fixed lines. A slot it cannot fill is a problem, never a guess.
"""

import calendar
import datetime as dt
import re
from typing import Any

from schemas import FIXED_KINDS, Answer, Draft, DraftStatement, Ref, Statement

# Agreed by the owner. Evals match them exactly; changing one is a deliberate edit
# with an eval run before and after.
FIXED_LINES = {
    "unrelated": "I can only help with what is in store, its sources and how Studio works.",
    "background": (
        "I cannot answer that here. I only say what store, its sources or Studio's help hold."
    ),
    "unknown": "Store does not say.",
    "check_failed": (
        "I could not give an answer I can back with store. Try asking about one thing at a time."
    ),
    "store_unreachable": "Store cannot be reached, so I cannot answer. Your question is kept.",
    "store_refused": "Store refused the Agent's token. Your question is kept.",
    "model_failed": "The Agent could not finish. Your question is kept; try again.",
    "stopped": "Stopped. Nothing was answered.",
    "what_is_meant": (
        "What do you mean? Attach the section, claim or source you are asking about."
    ),
    "greeting": "Hello. Ask me about what store holds, its sources or how Studio works.",
}
UNKNOWN_OPENING = "Store does not say"

SLOT = re.compile(r"\{([A-Za-z]\w*)\.([a-z]+)\}")
SLOT_FIELDS = ("value", "period", "source", "quote", "locator")


class Unfillable(Exception):
    """A slot that names nothing read in this run, or a field the claim does not have."""


def failure(line: str = "check_failed") -> Answer:
    """A checked answer holding one fixed line. Nothing in it comes from a model."""
    return Answer(checked=True, statements=[Statement(kind="failure", text=FIXED_LINES[line])])


def as_text(answer: Answer) -> str:
    return "\n\n".join(statement.text for statement in answer.statements)


# Dates -------------------------------------------------------------------------------------


def _date_words(iso: str, *, closing: bool) -> str:
    """A bound as plain words, no finer than the source was.

    A bound on the last day of a year (or the first, for an opening bound) is that year;
    on the last or first day of a month it is that month.
    """
    day = dt.date.fromisoformat(iso[:10])
    last = calendar.monthrange(day.year, day.month)[1]
    if (closing and (day.month, day.day) == (12, 31)) or (
        not closing and (day.month, day.day) == (1, 1)
    ):
        return str(day.year)
    if (closing and day.day == last) or (not closing and day.day == 1):
        return f"{calendar.month_name[day.month]} {day.year}"
    return f"{day.day} {calendar.month_name[day.month]} {day.year}"


def _window(earliest: str | None, latest: str | None) -> str | None:
    """One end of a period, from its two bounds. None when store gives neither."""
    if earliest and latest:
        lo, hi = _date_words(earliest, closing=False), _date_words(latest, closing=True)
        return lo if lo == hi else f"between {lo} and {hi}"
    return None


def period_words(claim: dict[str, Any]) -> str:
    """When a claim holds, as the source gives it. A map only proves "by" its date."""
    se, sl = claim.get("start_earliest"), claim.get("start_latest")
    ee, el = claim.get("end_earliest"), claim.get("end_latest")
    start = _window(se, sl)
    if start:
        start = f"from {start}"
    elif sl:
        start = f"by {_date_words(sl, closing=True)}"
    elif se:
        start = f"not before {_date_words(se, closing=False)}"
    end = _window(ee, el)
    if end:
        end = f"to {end}"
    elif el:
        end = f"until {_date_words(el, closing=True)} at the latest"
    elif ee:
        end = f"until at least {_date_words(ee, closing=False)}"
    words = " ".join(part for part in (start, end) if part)
    return words or "with no date in store"


# Values ------------------------------------------------------------------------------------


def value_words(claim: dict[str, Any]) -> str:
    if claim.get("value_num") is not None:
        number = f"{claim['value_num']:g}"
        return f"{number} {claim['value_unit']}" if claim.get("value_unit") else number
    if claim.get("value_text"):
        return str(claim["value_text"])
    raise Unfillable(f"the {claim.get('attribute_key')} claim has no value that is words")


def _slot(claim: dict[str, Any], field: str) -> str:
    if field == "value":
        return value_words(claim)
    if field == "period":
        return period_words(claim)
    citation = (claim.get("citations") or [None])[0]
    if citation is None:
        raise Unfillable("the claim has no citation")
    if field == "source":
        text = citation.get("source_title")
    elif field == "locator":
        text = citation.get("locator")
    else:
        text = citation.get("quote")
        text = f"“{text}”" if text else None
    if not text:
        raise Unfillable(f"the claim's citation has no {field}")
    return str(text)


# Statements --------------------------------------------------------------------------------


def _ref(ref_type: str, ref_id: str, read: "Read") -> Ref:
    if ref_type == "claim":
        claim = read.claims.get(ref_id)
        if claim is None:
            raise Unfillable(f"claim {ref_id} was not read from store in this run")
        return Ref(
            type="claim",
            id=ref_id,
            feature_id=claim["feature_id"],
            attribute=claim["attribute_key"],
            status=claim["status"],
            asserter=claim.get("asserted_by_kind"),
        )
    if ref_type == "link":
        link = read.links.get(ref_id)
        if link is None:
            raise Unfillable(f"link {ref_id} was not read from store in this run")
        return Ref(type="link", id=ref_id, status=link["status"])
    if ref_id not in read.features:
        raise Unfillable(f"feature {ref_id} was not read from store in this run")
    return Ref(type="feature", id=ref_id)


class Read:
    """What was read from store in this run: the only thing a slot may be filled from."""

    def __init__(self) -> None:
        self.features: dict[str, dict[str, Any]] = {}
        self.claims: dict[str, dict[str, Any]] = {}
        self.links: dict[str, dict[str, Any]] = {}

    def feature(self, feature: dict[str, Any]) -> None:
        self.features[feature["id"]] = feature
        for claim in feature.get("claims") or []:
            self.claims[claim["id"]] = {**claim, "feature_id": feature["id"]}
        for link in feature.get("links") or []:
            self.links[link["id"]] = link


def render_statement(draft: DraftStatement, read: Read) -> Statement:
    """Fill a draft statement's slots. Raises Unfillable; never invents."""
    if draft.kind in FIXED_KINDS:
        line = "unrelated" if draft.kind == "refusal" else draft.kind
        return Statement(kind=draft.kind, text=FIXED_LINES[line])
    if draft.kind == "clarify":
        return Statement(kind="clarify", text=FIXED_LINES["what_is_meant"])

    keys = {}
    for ref in draft.refs:
        if ref.key in keys:
            raise Unfillable(f"the key {ref.key} is used for two things")
        keys[ref.key] = ref

    def fill(match: re.Match[str]) -> str:
        key, field = match.group(1), match.group(2)
        ref = keys.get(key)
        if ref is None:
            raise Unfillable(f"the slot {match.group(0)} names a key that is not in refs")
        if ref.type != "claim" or field not in SLOT_FIELDS:
            raise Unfillable(f"the slot {match.group(0)} is not a field of a claim")
        claim = read.claims.get(ref.id)
        if claim is None:
            raise Unfillable(f"claim {ref.id} was not read from store in this run")
        return _slot(claim, field)

    text = SLOT.sub(fill, draft.text).strip()
    refs = [_ref(ref.type, ref.id, read) for ref in draft.refs]
    return Statement(kind=draft.kind, text=text, refs=refs, attribute=draft.attribute)


def render(draft: Draft, read: Read) -> Answer:
    """The draft with every slot filled. Not yet checked: grounding decides that."""
    return Answer(statements=[render_statement(s, read) for s in draft.statements])
