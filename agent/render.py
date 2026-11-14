"""The one place where values become words.

The model writes sentences with slots (`{c1.value}`, `{c1.period}`) and never a value of
its own. This module fills the slots from what was read from store in this run, and
writes the fixed lines. A slot it cannot fill is a problem, never a guess.
"""

import calendar
import datetime as dt
import re
from decimal import Decimal
from typing import Any

from schemas import FIXED_KINDS, Answer, CitationRequest, Draft, DraftStatement, Ref, Statement

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
    "not_found": "Store no longer has that. Attach it again from the list or the map.",
    "greeting": "Hello. Ask me about what store holds, its sources or how Studio works.",
}
UNKNOWN_OPENING = "Store does not say"

SLOT = re.compile(r"\{([A-Za-z]\w*)\.([a-z]+)\}")
SLOT_FIELDS = ("value", "period", "status", "source", "quote", "locator")

# How "Store does not say" goes on, by attribute. The whole sentence is code's.
UNKNOWN_WORDS = {
    "owner": "who owns it",
    "operator": "who operates it",
    "name": "what it is called",
    "diameter": "what its diameter is",
    "status": "what its status is",
}


def feature_name(feature: dict[str, Any]) -> str:
    """A feature as Studio names it: its label, or its kind and short code."""
    if feature.get("label"):
        return str(feature["label"])
    kind = "pipeline" if feature.get("kind") == "line" else feature.get("kind", "feature")
    return f"{kind} {str(feature['id'])[:8]}"


NAMED_UNKNOWN_WORDS = {
    "owner": "who owns {}",
    "operator": "who operates {}",
    "name": "what {} is called",
}


def unknown_line(attribute: str | None, subject: str | None = None) -> str:
    """ "Store does not say who owns it." With `subject`, it names what it is about."""
    if not attribute:
        return f"{UNKNOWN_OPENING}."
    if subject:
        words = NAMED_UNKNOWN_WORDS.get(
            attribute, f"what the {attribute.replace('_', ' ')} of {{}} is"
        )
        return f"{UNKNOWN_OPENING} {words.format(subject)}."
    rest = UNKNOWN_WORDS.get(attribute, f"what its {attribute.replace('_', ' ')} is")
    return f"{UNKNOWN_OPENING} {rest}."


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
    if not (earliest and latest):
        return None
    if earliest[:10] == latest[:10]:
        day = dt.date.fromisoformat(earliest[:10])
        return f"{day.day} {calendar.month_name[day.month]} {day.year}"
    lo, hi = _date_words(earliest, closing=False), _date_words(latest, closing=True)
    return lo if lo == hi else f"between {lo} and {hi}"


_EDTF_POINT = re.compile(r"^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?([~?%]?)$")
_QUALIFIER = {"": "", "~": "about ", "?": "perhaps ", "%": "perhaps about "}


def _edtf_point(text: str) -> str | None:
    """`1938`, `1938-03`, `1938-03-14`, with `~` or `?`, as words. None for anything
    else (a season, unspecified digits, a set), which is never put into words."""
    match = _EDTF_POINT.match(text)
    if not match:
        return None
    year, month, day, qualifier = match.groups()
    words = year
    if month:
        if not 1 <= int(month) <= 12:
            return None
        words = f"{calendar.month_name[int(month)]} {year}"
        if day:
            try:
                dt.date(int(year), int(month), int(day))
            except ValueError:
                return None
            words = f"{int(day)} {words}"
    return _QUALIFIER[qualifier] + words


def edtf_words(text: str | None) -> str | None:
    """A claim's period as the source wrote it (EDTF), when store has no bounds for it.
    None when it is a form this does not put into words."""
    if not text:
        return None
    if "/" in text:
        start, end = text.split("/", 1)
        if start in ("", "..") and _edtf_point(end):
            return f"by {_edtf_point(end)}"
        if end in ("", "..") and _edtf_point(start):
            return f"from {_edtf_point(start)}"
        if _edtf_point(start) and _edtf_point(end):
            return f"from {_edtf_point(start)} to {_edtf_point(end)}"
        return None
    point = _edtf_point(text)
    return f"in {point}" if point else None


def period_words(claim: dict[str, Any]) -> str:
    """When a claim holds, as the source gives it. A map only proves "by" its date.

    Worked from the claim's bounds; where store has none, from the period as the source
    wrote it. "With no date in store" only when store has neither. A date this cannot
    word truly is Unfillable, never left out.
    """
    se, sl = claim.get("start_earliest"), claim.get("start_latest")
    ee, el = claim.get("end_earliest"), claim.get("end_latest")
    if not any((se, sl, ee, el)):
        if not claim.get("valid_edtf"):
            return "with no date in store"
        words = edtf_words(claim["valid_edtf"])
        if words is None:
            raise Unfillable(f"the period {claim['valid_edtf']!r} cannot be put into words")
        return words
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
    elif ee and not (sl and ee[:4] <= sl[:4]):
        # A map's "by 1937" also says it was there in 1937; that adds nothing to say.
        end = f"until at least {_date_words(ee, closing=False)}"
    words = " ".join(part for part in (start, end) if part)
    return words or "with no date in store"


# Values ------------------------------------------------------------------------------------


def _number(value: float) -> str:
    """As store holds it: never rounded, never in scientific notation."""
    text = format(Decimal(repr(value)).normalize(), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def value_words(claim: dict[str, Any]) -> str:
    if claim.get("value_num") is not None:
        number = _number(claim["value_num"])
        return f"{number} {claim['value_unit']}" if claim.get("value_unit") else number
    if claim.get("value_text"):
        return str(claim["value_text"])
    raise Unfillable(f"the {claim.get('attribute_key')} claim has no value that is words")


STATUS_WORDS = {
    ("accepted", None): "accepted",
    ("candidate", "pipeline"): "proposed by a tool and not decided yet",
    ("candidate", "person"): "proposed by a person and not decided yet",
    ("candidate", None): "proposed and not decided yet",
    ("rejected", None): "rejected",
}


def status_words(claim: dict[str, Any]) -> str:
    status, kind = claim["status"], claim.get("asserted_by_kind")
    return STATUS_WORDS.get((status, kind)) or STATUS_WORDS[(status, None)]


def _citation(claim: dict[str, Any]) -> dict[str, Any] | None:
    """The citation that says it: a text that states it, or a map that shows it."""
    citations = claim.get("citations") or []
    ranked = sorted(citations, key=lambda c: c.get("role") not in ("states", "map_shows"))
    return ranked[0] if ranked else None


def _slot(claim: dict[str, Any], field: str) -> str:
    if field == "value":
        return value_words(claim)
    if field == "period":
        return period_words(claim)
    if field == "status":
        return status_words(claim)
    citation = _citation(claim)
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
        # Features whose claims store counts as another's (a merged trace): section -> them.
        self.scope: dict[str, list[str]] = {}

    def merge(self, section_id: str, merged: list[str]) -> None:
        self.scope.setdefault(section_id, [])
        self.scope[section_id] += [m for m in merged if m not in self.scope[section_id]]

    def accepted(self, feature_id: str, attribute: str) -> list[str]:
        """Accepted claims for an attribute on a feature, counting merged traces."""
        return [
            cid
            for cid, claim in self.claims.items()
            if claim["feature_id"] in (feature_id, *self.scope.get(feature_id, []))
            and claim["attribute_key"] == attribute
            and claim["status"] == "accepted"
        ]

    def feature(self, feature: dict[str, Any]) -> None:
        self.features[feature["id"]] = feature
        for claim in feature.get("claims") or []:
            self.claims[claim["id"]] = {**claim, "feature_id": feature["id"]}
        for link in feature.get("links") or []:
            self.links[link["id"]] = link


def render_statement(draft: DraftStatement, read: Read, name_things: bool = False) -> Statement:
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
        if ref.type == "feature" and field == "name":
            feature = read.features.get(ref.id)
            if feature is None:
                raise Unfillable(f"feature {ref.id} was not read from store in this run")
            return feature_name(feature)
        if ref.type != "claim" or field not in SLOT_FIELDS:
            raise Unfillable(f"the slot {match.group(0)} is not a field of a claim")
        claim = read.claims.get(ref.id)
        if claim is None:
            raise Unfillable(f"claim {ref.id} was not read from store in this run")
        return _slot(claim, field)

    if draft.kind == "citation_request":
        refs = [_ref(ref.type, ref.id, read) for ref in draft.refs]
        features = [r.id for r in refs if r.type == "feature"]
        if len(features) != 1 or not draft.attribute:
            raise Unfillable("a citation request names one feature you read and one attribute")
        subject = feature_name(read.features[features[0]])
        words = draft.attribute.replace("_", " ")
        return Statement(
            kind="citation_request",
            text=(
                f"I cannot look for new sources yet. This is what I would ask for: "
                f"a source for the {words} of {subject}."
            ),
            refs=refs,
            attribute=draft.attribute,
            request=CitationRequest(feature_id=features[0], attribute_keys=[draft.attribute]),
        )

    if draft.kind == "unknown":
        # The model says which attribute; the sentence is code's, so nothing rides on it.
        refs = [_ref(ref.type, ref.id, read) for ref in draft.refs]
        about = next((r.id for r in refs if r.type == "feature"), None)
        subject = feature_name(read.features[about]) if name_things and about else None
        text = unknown_line(draft.attribute, subject)
        return Statement(kind="unknown", text=text, refs=refs, attribute=draft.attribute)

    text = SLOT.sub(fill, draft.text).strip()
    # A value that ends a sentence with its own full stop ("Co.") takes no second one.
    text = re.sub(r"(?<=[A-Za-z]\.)\.(?=\s|$)", "", text)
    refs = [_ref(ref.type, ref.id, read) for ref in draft.refs]
    return Statement(kind=draft.kind, text=text, refs=refs, attribute=draft.attribute)


def render(draft: Draft, read: Read) -> Answer:
    """The draft with every slot filled. Not yet checked: grounding decides that."""
    # About several things, each "Store does not say" names which one.
    about = {r.id for s in draft.statements for r in s.refs if r.type == "feature"}
    about |= {
        read.claims[r.id]["feature_id"]
        for s in draft.statements
        for r in s.refs
        if r.type == "claim" and r.id in read.claims
    }
    return Answer(
        statements=[render_statement(s, read, name_things=len(about) > 1) for s in draft.statements]
    )
