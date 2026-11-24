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

from src.answer.schemas import (
    FIXED_KINDS,
    Answer,
    CitationRequest,
    Draft,
    DraftStatement,
    EditOffer,
    Hint,
    Ref,
    Statement,
)
from src.clients import value_rules

# Agreed by the owner. Evals match them exactly; changing one is a deliberate edit
# with an eval run before and after.
FIXED_LINES = {
    "unrelated": "I can only help with the pipeline data here, its sources and how Studio works.",
    "background": (
        "I cannot answer that here. I only say what the data, its sources or Studio's help hold."
    ),
    "unknown": "No source says.",
    "check_failed": (
        "I could not give an answer I can back with the data. Try asking about one thing at a time."
    ),
    "store_unreachable": "The data cannot be reached right now, so I cannot answer. Your question is kept.",
    "store_refused": "I am not allowed to read the data right now. Your question is kept.",
    "model_failed": "The Agent could not finish. Your question is kept; try again.",
    "stopped": "Stopped. Nothing was answered.",
    "what_is_meant": (
        "What do you mean? Attach the section, pipeline, claim or source you are asking about."
    ),
    "not_found": "That is no longer in the data. Attach it again from the list or the map.",
    "greeting": "Hello. Ask me about the sections and pipelines you select, their sources or how Studio works.",
    # What the Agent can do, for "What can you do?" (B10). Everything listed works
    # today; change it when a behaviour lands or leaves. A line starting "- " is a list
    # item in Studio; a blank line starts a new paragraph. No "store": a person does not
    # know the word.
    "capabilities": (
        "I can tell you about the sections and pipelines you select:\n"
        "- What is known, such as the owner, diameter and name, each with its source\n"
        "- What is still unknown or only proposed, and where to look next\n"
        "- Which map editions show a section, and the first one that does\n"
        "- Where it lies: its state, today's towns along it, and its length as drawn\n"
        "- What it is drawn touching, and which sections are nearby\n"
        "- A pipeline as a whole: its sections, how long they are drawn, where they lie, "
        "what they share and which lack a fact\n"
        "- The whole network: how many sections have no owner, are in a state, first "
        "appear on a year's map, or have a proposal waiting\n"
        "- What a word means here, and how to do a thing in Studio\n"
        "- How the sections you select compare: what they share, where they differ, "
        "which is shown earlier, which is longer\n"
        "\n"
        "I can also:\n"
        "- Search the trade journals for an owner, diameter or build date, and offer what "
        "I find for you to accept or reject\n"
        "- Make two or more sections one pipeline, once you confirm\n"
        "\n"
        "To ask about something, select it on the map or in the list and press Ask the "
        "Agent, or type # here to pick it.\n"
        "\n"
        "Not yet: who traced a line, and changing what is recorded."
    ),
    # Why an answer says what it says (B40): one line per kind of worked-out fact.
    "why_towns": (
        "The towns are today's places that lie near the line as it is drawn. No source "
        "names them, so they say where the line is, not which places it supplied."
    ),
    "why_map_year": (
        "A map shows that a line was drawn by the year the map was made. It does not say "
        "when the line was built, so a map year is never given as a build date."
    ),
    "why_touching": (
        "Two lines drawn touching on the map may or may not be pipes that were joined. "
        "No source says they were, so I only say they are drawn touching."
    ),
    "why_drawn_length": (
        "The length is measured along the line as it is drawn on the map. It is not a "
        "length a source gives, so it is said as drawn."
    ),
    "why_unknown": (
        "Unknown means no source cited here gives the value yet. It is never filled with a guess."
    ),
    # What a word means here and how a thing is done in Studio (B42). The meanings are
    # the project's glossary's; the steps are Studio's own menu words.
    "help_section": (
        "A section is a continuous stretch of line built and put in use at one time. It "
        "is what facts are recorded for: each line you can select on the map is a section."
    ),
    "help_pipeline": (
        "A pipeline is a line as a whole, made of one or more sections. Its name, owner "
        "and operator are its own, kept apart from what is known about each section."
    ),
    "help_edition": (
        "An edition is the source map as issued in one year. A section is first seen on "
        "the earliest edition that shows it. That year says the line was there by then, "
        "not when it was built."
    ),
    "help_claim": (
        "A claim is one statement about one thing, such as who owned a section in certain "
        "years. It is accepted, proposed and waiting for a decision, or rejected, and it "
        "carries the source that says so."
    ),
    "help_citation": (
        "A citation points to the exact place in a source, such as a journal issue and "
        "page, that backs a claim."
    ),
    "help_proposal": (
        "A proposal is a value or a link that a search or a person put forward and nobody "
        "has decided on yet. Only a person accepts or rejects it."
    ),
    "help_lead": ("A lead is somewhere to look next, found by a fixed rule. It is never a fact."),
    "help_make_pipeline": (
        "To make a pipeline, select two or more sections on the map or in the list, "
        "right-click and choose Make pipeline. Or select them and ask me to make them one "
        "pipeline: I prepare it and you confirm."
    ),
    "help_edit": (
        "To change what is recorded, right-click a section, or several, and choose Edit; "
        "for a pipeline, choose Edit pipeline. I cannot make changes for you."
    ),
    "help_ask": (
        "To ask about something, select it on the map or in the list and press Ask the "
        "Agent, or type # here to pick it."
    ),
    "help_sources": (
        "To see where a value comes from, click the fact in the right panel. Its sources "
        "open in a pop-up, with the passage each one quotes and a link where there is one."
    ),
    "help_pipeline_facts": (
        "A pipeline's name, owner and operator are under its row in the list: open the "
        "row with its arrow. Each section's own facts are in the right panel."
    ),
    # An edit asked of the wrong thing: where Studio sets it.
    "edit_on_pipeline": (
        "A name, owner or operator is set on the pipeline, not on a section. Select the "
        "pipeline and ask again."
    ),
    "edit_on_section": (
        "A diameter is set on a section, not on a pipeline. Select the section and ask again."
    ),
    # What the Agent cannot do yet, one line per topic (B31). A line leaves when its
    # behaviour is built; the wording waits for the owner's review of B31's cases.
    "not_yet_network": (
        "I cannot count or search across the whole network yet. Attach the sections you "
        "mean, or use the list's filters."
    ),
    "not_yet_recall": "I do not keep earlier questions in mind. Ask again with the thing attached.",
    "not_yet_tracer": (
        "I cannot say who traced a section yet. The list's Traced by filter shows it."
    ),
    "not_yet_help": "I cannot explain Studio or its words yet. Help is in the top bar.",
}
UNKNOWN_OPENING = "No source says"
# A help topic and the line that answers it: why an answer is worded as it is, what a
# word means, how a thing is done.
HELP_LINES = {k.split("_", 1)[1]: k for k in FIXED_LINES if k.startswith(("why_", "help_"))} | {
    "capabilities": "capabilities"
}
WHY_TOPICS = tuple(k.removeprefix("why_") for k in FIXED_LINES if k.startswith("why_"))
NOT_YET_TOPICS = tuple(k.removeprefix("not_yet_") for k in FIXED_LINES if k.startswith("not_yet_"))

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


def short_id(feature_id: Any) -> str:
    """A feature's short name: 8 hex digits hashed from its whole id (FNV-1a, 32 bits,
    then murmur3's finaliser).

    Not a slice of the id: store's ids share their first digits within one import (the
    time) and run in sequence at the end (sections side by side differ by one digit),
    so a slice names many sections the same or nearly so. Studio computes the same hash
    (`src/data/short-id.ts`), so a name in an answer is the name on screen.
    """
    h = 0x811C9DC5
    for byte in str(feature_id).lower().encode():
        h = ((h ^ byte) * 0x01000193) & 0xFFFFFFFF
    # murmur3's finaliser: one changed character changes every digit.
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return f"{h:08x}"


def feature_name(feature: dict[str, Any]) -> str:
    """A feature as Studio names it: its label, or its kind and short code."""
    if feature.get("label"):
        return str(feature["label"])
    kind = "pipeline" if feature.get("kind") == "line" else feature.get("kind", "feature")
    return f"{kind} {short_id(feature['id'])}"


NAMED_UNKNOWN_WORDS = {
    "owner": "who owns {}",
    "operator": "who operates {}",
    "name": "what {} is called",
}


UNDECIDED_ENDING = "is not decided yet."
NOBODY_DECIDED = "Nobody has decided on it yet."


def unknown_line(attribute: str | None, subject: str | None = None, proposed: bool = False) -> str:
    """ "No source says who owns it." With `subject`, it names what it is about. With a
    value `proposed` and waiting, a source does say something: "Who owns it is not
    decided yet." """
    if not attribute:
        return f"{UNKNOWN_OPENING}."
    if subject:
        words = NAMED_UNKNOWN_WORDS.get(
            attribute, f"what the {attribute.replace('_', ' ')} of {{}} is"
        ).format(subject)
    else:
        words = UNKNOWN_WORDS.get(attribute, f"what its {attribute.replace('_', ' ')} is")
    if proposed and attribute not in NAMED_UNKNOWN_WORDS:
        what = attribute.replace("_", " ")
        return f"{f'The {what} of {subject}' if subject else f'Its {what}'} {UNDECIDED_ENDING}"
    if proposed:
        return f"{words[0].upper()}{words[1:]} {UNDECIDED_ENDING}"
    return f"{UNKNOWN_OPENING} {words}."


class Unfillable(Exception):
    """A slot that names nothing read in this run, or a field the claim does not have."""


def failure(line: str = "check_failed") -> Answer:
    """A checked answer holding one fixed line. Nothing in it comes from a model."""
    return Answer(checked=True, statements=[Statement(kind="failure", text=FIXED_LINES[line])])


# How a statement that is not a claim is marked when the answer is read as plain text.
# Studio shows the same kinds as a grey prefix.
KIND_PREFIX = {"worked_out": "Inferred: ", "lead": "Lead, not a fact: "}


def as_text(answer: Answer) -> str:
    """The answer as plain text, each source after its statement: what a copy holds."""
    out = []
    for statement in answer.statements:
        sources = [
            src
            for src in dict.fromkeys(r.source for r in statement.refs if r.source)
            if src not in statement.text  # already said in the sentence
        ]
        tail = f" ({'; '.join(sources)})" if sources else ""
        out.append(KIND_PREFIX.get(statement.kind, "") + statement.text + tail)
    return "\n\n".join(out)


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
    wrote it. "With no date given" only when store has neither. A date this cannot
    word truly is Unfillable, never left out.
    """
    se, sl = claim.get("start_earliest"), claim.get("start_latest")
    ee, el = claim.get("end_earliest"), claim.get("end_latest")
    if not any((se, sl, ee, el)):
        if not claim.get("valid_edtf"):
            return "with no date given"
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
    return words or "with no date given"


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
    ("candidate", "pipeline"): "proposed and not decided yet",
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
    order = {"states": 0, "map_shows": 1}
    ranked = sorted(citations, key=lambda c: order.get(c.get("role"), 2))
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


LINK_WORDS = {
    "same_as": "Same pipe",
    "overlaps": "Overlaps",
    "split_into": "Split into",
    "part_of": "Part of a pipeline",
    "parallel_to": "Parallel pipe",
}
# A line traced as gone at the other end: Studio's proposed end and proposed cut.
LINK_WORDS_GONE = {"same_as": "End, no longer shown", "overlaps": "Cut, no longer shown"}


def is_traced_as_gone(feature: dict[str, Any]) -> bool:
    """Store's removal: a section whose status is decommissioned, cited to a map that omits it."""
    return any(
        claim["attribute_key"] == "status"
        and claim.get("value_text") == "decommissioned"
        and claim["status"] != "rejected"
        for claim in feature.get("claims") or []
    )


def _counted_for(feature_id: str, read: "Read") -> list[str]:
    """The sections whose claims store counts this feature's among: the one a trace was
    merged into, or every section a split section was cut into."""
    return [s for s, merged in read.scope.items() if feature_id in merged]


def _split_from(feature_id: str, read: "Read") -> bool:
    return any(
        link["relation"] == "split_into"
        and link["status"] == "confirmed"
        and link.get("from_feature_id") == feature_id
        for link in read.links.values()
    )


def ref_label(feature_id: str, read: "Read") -> str:
    """What a feature is, in Studio's words: a section, a pipeline, a trace merged into a
    section, a section that was split, or a line traced as gone."""
    feature = read.features[feature_id]
    if is_traced_as_gone(feature):
        return f"line no longer shown {short_id(feature_id)}"
    into = _counted_for(feature_id, read)
    if into and _split_from(feature_id, read):
        names = ", ".join(feature_name(read.features[s]) for s in into)
        return f"section {short_id(feature_id)}, split into {names}"
    if len(into) == 1:
        return f"trace {short_id(feature_id)}, merged into {feature_name(read.features[into[0]])}"
    return feature_name(feature)


def _link_label(link: dict[str, Any], read: "Read") -> str:
    relation = link["relation"]
    ends = (link.get("from_feature_id"), link.get("to_feature_id"))
    gone = any(e in read.features and is_traced_as_gone(read.features[e]) for e in ends)
    if gone and relation in LINK_WORDS_GONE:
        return LINK_WORDS_GONE[relation]
    return LINK_WORDS.get(relation, relation)


def _kind_of(ref_id: str, read: "Read") -> str:
    """What an id that code worked from is: a claim, a link or a feature."""
    if ref_id in read.claims:
        return "claim"
    if ref_id in read.links:
        return "link"
    return "feature"


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
            label=ref_label(claim["feature_id"], read),
            source=source_of(claim),
            role=(_citation(claim) or {}).get("role") or None,
            as_of=(_citation(claim) or {}).get("as_of_edtf") or None,
            quote=(_citation(claim) or {}).get("quote") or None,
            url=(_citation(claim) or {}).get("url")
            or (_citation(claim) or {}).get("archive_url")
            or None,
        )
    if ref_type == "link":
        link = read.links.get(ref_id)
        if link is None:
            raise Unfillable(f"link {ref_id} was not read from store in this run")
        return Ref(type="link", id=ref_id, status=link["status"], label=_link_label(link, read))
    if ref_id not in read.features:
        raise Unfillable(f"feature {ref_id} was not read from store in this run")
    return Ref(type="feature", id=ref_id, label=ref_label(ref_id, read))


class Read:
    """What was read from store in this run: the only thing a slot may be filled from."""

    def __init__(self) -> None:
        self.features: dict[str, dict[str, Any]] = {}
        self.claims: dict[str, dict[str, Any]] = {}
        self.links: dict[str, dict[str, Any]] = {}
        # Features whose claims store counts as another's (a merged trace): section -> them.
        self.scope: dict[str, list[str]] = {}
        # Features read only as what surrounds a section: a claim of theirs always says
        # whose it is, never reads as the section's.
        self.context_only: set[str] = set()
        # What code worked out about a section (context.py), by handle: W1 -> WorkedOut.
        self.worked: dict[str, dict[str, Any]] = {}
        # Leads code found (leads.py), by handle: L1 -> Lead. Never a claim.
        self.leads: dict[str, dict[str, Any]] = {}
        # What cite found earlier in this thread, by handle: F1 -> its record. Not read
        # from store in this run: carried verbatim by code, so it may be shown again.
        self.findings: dict[str, dict[str, Any]] = {}
        # The features the question is about (attached, or carried from the last one).
        # None when nobody said: then everything read in its own right counts.
        self.asked_about: list[str] | None = None
        # The person's own words in this question: the only place an edit's value may
        # come from.
        self.words: str = ""

    def only_subject(self) -> str | None:
        """The one thing the question is about, if there is exactly one: a person who
        attached one section is told "it", not its code. Its pipeline, read with it, is
        a second thing only in name."""
        if self.asked_about is not None:
            own = {holder(fid, self) for fid in self.asked_about if fid in self.features}
        else:
            own = {holder(fid, self) for fid in self.features if fid not in self.context_only}
        return next(iter(own)) if len(own) == 1 else None

    def merge(self, section_id: str, merged: list[str]) -> None:
        self.scope.setdefault(section_id, [])
        self.scope[section_id] += [m for m in merged if m not in self.scope[section_id]]

    def known_from_a_text(self, feature_id: str, attribute: str) -> list[str]:
        """Accepted claims a text states. For when it was built: a map that shows a line
        says nothing of when it was built, so a status cited only to a map does not
        count."""
        return [
            cid
            for cid in self.accepted(feature_id, attribute)
            if attribute != "status"
            or any(c.get("role") == "states" for c in self.claims[cid].get("citations") or [])
        ]

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


def source_of(claim: dict[str, Any]) -> str | None:
    """A claim's source as people read it: its title and where in it."""
    citation = _citation(claim)
    title = citation.get("source_title") if citation else None
    if not title:
        return None
    # A map reading's locator is where it was traced, not a place in the map: left out.
    if citation.get("role") in ("map_shows", "map_omits"):
        return str(title)
    return f"{title}, {citation['locator']}" if citation.get("locator") else str(title)


def shown_on_a_map_only(claim: dict[str, Any]) -> bool:
    """A status store holds only because a map shows the line: it says the line was
    drawn by then, not that it was in operation (Studio words it "Shown by ...")."""
    roles = {c.get("role") for c in claim.get("citations") or []}
    return claim.get("attribute_key") == "status" and roles == {"map_shows"}


def source_line(claims: list[dict[str, Any]]) -> str:
    """What the claims of one sentence rest on, in code's words: each one's source, or
    that store holds none. With several, each source is tied to its value."""
    if len(claims) == 1:
        where = source_of(claims[0])
        return f"The source is {where}." if where else "No source is given for it."
    parts = [
        f"{where} for {value_words(c)}" if (where := source_of(c)) else f"none for {value_words(c)}"
        for c in claims
    ]
    return f"The sources are {', '.join(parts[:-1])} and {parts[-1]}."


def one_full_stop(text: str) -> str:
    """A value that ends a sentence with its own full stop ("Co.") takes no second one."""
    return re.sub(r"(?<=[A-Za-z]\.)\.(?=\s|$)", "", text)


def writes_itself(draft: DraftStatement) -> bool:
    """A fact about one claim with no text: code writes the whole sentence."""
    claims = [r for r in draft.refs if r.type == "claim"]
    return draft.kind == "fact" and not draft.text.strip() and len(claims) == 1


def holder(feature_id: str, read: Read) -> str:
    """Whose claim it is as a reviewer sees it: the one section a merged trace counts for.
    A split section's claim counts for every piece, so it stays the split section's."""
    into = _counted_for(feature_id, read)
    return into[0] if len(into) == 1 else feature_id


def claim_line(claim: dict[str, Any], read: Read, name_things: bool) -> str:
    """One claim in code's words: its value, when it holds, its status and its source."""
    what = claim["attribute_key"].replace("_", " ")
    value, period = value_words(claim), period_words(claim)
    whose = read.features[holder(claim["feature_id"], read)]
    named = (name_things and whose["id"] != read.only_subject()) or whose["id"] in read.context_only
    subject = feature_name(whose) if named else None
    if whose.get("kind") == "line":
        # A pipeline's claim is never read as the section's: it always says whose it is.
        name = feature_name(whose)
        subject = name if name.startswith("pipeline ") else f"the pipeline {name}"
    status = claim["status"]
    if status == "candidate":
        # Who proposed it comes from STATUS_WORDS ("proposed by a tool ..."), one wording.
        by = re.match(r"proposed by (a \w+)", status_words(claim))
        of = f" of {subject}" if subject else ""
        line = (
            f"{by.group(1).capitalize()} proposed {value} as the {what}{of}, {period}."
            if by
            else f"{value} is proposed as the {what}{of}, {period}."
        ) + " Nobody has decided on it yet."
    elif status == "rejected":
        of = f" for {subject}" if subject else ""
        line = f"One value{of}, {value}, was rejected as the {what}. It was given {period}."
    elif status == "accepted" and shown_on_a_map_only(claim):
        line = f"{subject or 'It'} is shown on a map {period}."
    elif status == "accepted":
        line = (
            f"For {subject}, the {what} is {value}, {period}."
            if subject
            else f"The {what} is {value}, {period}."
        )
    else:
        raise Unfillable(f"a claim that is {status} has no sentence of its own")
    # The source is not in the sentence: it travels on the claim's reference, and Studio
    # shows it beside the statement.
    return one_full_stop(line)


def render_statement(draft: DraftStatement, read: Read, name_things: bool = False) -> Statement:
    """Fill a draft statement's slots. Raises Unfillable; never invents."""
    if draft.kind == "not_yet":
        if draft.topic not in NOT_YET_TOPICS:
            raise Unfillable("a not_yet statement needs one of its topics")
        return Statement(kind="not_yet", text=FIXED_LINES[f"not_yet_{draft.topic}"])
    if draft.kind == "help":
        if draft.topic not in HELP_LINES:
            raise Unfillable("a help statement needs one of its topics")
        return Statement(kind="help", text=FIXED_LINES[HELP_LINES[draft.topic]])
    if draft.kind == "refusal":
        line = "background" if draft.topic == "background" else "unrelated"
        return Statement(kind="refusal", text=FIXED_LINES[line])
    if draft.kind in FIXED_KINDS:
        return Statement(kind=draft.kind, text=FIXED_LINES[draft.kind])
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
            request=CitationRequest(
                feature_id=features[0],
                attribute_keys=[draft.attribute],
                # The section's leads for this attribute, and when to search: hints for
                # cite, never claims.
                hints=[
                    Hint(rule=lead["rule"], text=lead["text"], source=lead.get("source"))
                    for lead in read.leads.values()
                    if lead["rests_on"][:1] == [features[0]]
                    and lead.get("attribute") in (draft.attribute, None)
                    and lead["rule"] not in ("conflict",)
                ],
            ),
        )

    if draft.kind == "edit_offer":
        return _edit_offer(draft, read)

    if draft.kind == "answer":
        return _answer(draft, read)

    if draft.kind == "unknown":
        # The model says which attribute; the sentence is code's, so nothing rides on it.
        refs = [_ref(ref.type, ref.id, read) for ref in draft.refs]
        about = next((r.id for r in refs if r.type == "feature"), None)
        # The one attached thing is "it"; anything else (its pipeline) is named.
        named = name_things and about and about != read.only_subject()
        subject = feature_name(read.features[about]) if named else None
        holders = {about, *read.scope.get(about, [])} if about else set()
        proposed = any(
            c["feature_id"] in holders
            and c["attribute_key"] == draft.attribute
            and c["status"] == "candidate"
            for c in read.claims.values()
        )
        text = unknown_line(draft.attribute, subject, proposed)
        return Statement(kind="unknown", text=text, refs=refs, attribute=draft.attribute)

    if draft.kind == "finding":
        from src.flows.cite_flow import finding_statement  # cite_flow builds on this module

        handles = [r.id.strip().upper() for r in draft.refs if r.type == "finding"]
        if len(handles) != 1 or handles[0] not in read.findings:
            raise Unfillable("a finding statement names one F handle from Cite so far")
        names = {fid: feature_name(f) for fid, f in read.features.items()}
        return finding_statement(read.findings[handles[0]], read, names)

    if draft.kind == "worked_out" and draft.text.strip():
        return _written_worked_out(draft, read)

    if draft.kind in ("worked_out", "lead"):
        # Code wrote the sentence when it worked the fact out or found the lead; the
        # model only picked it.
        pool = read.worked if draft.kind == "worked_out" else read.leads
        handles = [r.id.strip().upper() for r in draft.refs if r.type == draft.kind]
        if len(handles) != 1 or handles[0] not in pool:
            letter = "W" if draft.kind == "worked_out" else "L"
            raise Unfillable(
                f"a {draft.kind} statement names one {letter} handle from read_context"
            )
        item = pool[handles[0]]
        refs = [_ref(_kind_of(i, read), i, read) for i in item["rests_on"]]
        return Statement(
            kind=draft.kind,
            text=as_it(item["text"], read),
            refs=refs,
            attribute=item.get("attribute"),
            rule=item.get("rule"),
        )

    if writes_itself(draft):
        refs = [_ref(ref.type, ref.id, read) for ref in draft.refs]
        (claim_id,) = [r.id for r in refs if r.type == "claim"]
        text = claim_line(read.claims[claim_id], read, name_things)
        return Statement(kind="fact", text=text, refs=refs, attribute=draft.attribute)

    text = one_full_stop(SLOT.sub(fill, draft.text).strip())
    refs = [_ref(ref.type, ref.id, read) for ref in draft.refs]
    return Statement(kind=draft.kind, text=text, refs=refs, attribute=draft.attribute)


# A caution that holds for every line it could follow is said once per answer.
SAID_ONCE = (
    "Lines drawn touching do not prove the pipes joined.",
    "A map year is not a build date.",
)


def say_once(answer: Answer) -> Answer:
    """Drop a caution from every statement but the first that carries it: a caveat on
    every line is noise. Run after the check, on an answer already allowed."""
    for caution in SAID_ONCE:
        seen = False
        for statement in answer.statements:
            if statement.text.endswith(f" {caution}"):
                if seen:
                    statement.text = statement.text[: -len(caution) - 1]
                seen = True
    # "Who owns it is not decided yet." already says what a proposal's own line repeats.
    if any(s.text.endswith(UNDECIDED_ENDING) for s in answer.statements):
        for statement in answer.statements:
            statement.text = statement.text.removesuffix(f" {NOBODY_DECIDED}")
    return answer


def _answer(draft: DraftStatement, read: "Read") -> Statement:
    """An answer in the model's own words. Shown as written; prose.py checks it. What it
    rests on is worked out here, not taken from the model: the claims whose value it
    states (their sources show beside it) and the sections and pipelines it names."""
    from src.answer import prose  # prose builds on this module

    text = draft.text.strip()
    if not text:
        raise Unfillable("an answer needs its text")
    refs = [_ref("claim", claim["id"], read) for claim in prose._claims_said(text, read)]
    named = [
        fid
        for fid, feature in read.features.items()
        if feature.get("kind") in ("section", "line")
        and re.search(rf"(?<![\w-]){re.escape(feature_name(feature))}(?![\w-])", text)
    ]
    refs += [_ref("feature", fid, read) for fid in named]
    return Statement(kind="answer", text=text, refs=refs)


# Facts a person may set through Studio's Edit forms, by what the form is for: a
# section's form has its diameter; name, owner and operator are the pipeline's.
EDITABLE = {"section": ("diameter",), "line": ("name", "owner", "operator")}


def _plain(text: str) -> str:
    return " ".join(text.lower().split())


def _edit_offer(draft: DraftStatement, read: "Read") -> Statement:
    """The Edit form, filled in from the person's own words. The value is theirs or the
    statement is not made: never one the model recalled, read or was handed by a finding."""
    refs = [_ref(ref.type, ref.id, read) for ref in draft.refs if ref.type == "feature"]
    features = [read.features[r.id] for r in refs]
    kinds = {f.get("kind") for f in features}
    if not features or len(kinds) != 1 or kinds - set(EDITABLE):
        raise Unfillable("an edit is for attached sections, or for one attached pipeline")
    kind = kinds.pop()
    if kind == "line" and len(features) > 1:
        raise Unfillable("an edit is for one pipeline at a time")
    value = (draft.value or "").strip()
    if not draft.attribute or not value:
        raise Unfillable("an edit names the attribute and the value")
    if draft.attribute not in EDITABLE[kind]:
        other = "section" if kind == "line" else "line"
        if draft.attribute in EDITABLE[other]:
            # Asked of the wrong thing: say where it is set, in a fixed line.
            line = "edit_on_pipeline" if kind == "section" else "edit_on_section"
            return Statement(kind="refusal", text=FIXED_LINES[line])
        what = "pipeline" if kind == "line" else "section"
        raise Unfillable(f"the Edit form of a {what} has no {draft.attribute}")
    if _plain(value) not in _plain(read.words):
        raise Unfillable("an edit's value is copied from the person's own words, exactly")
    rule = value_rules.RULES.get(draft.attribute) or {}
    if rule.get("value_type") == "enum" and value not in rule["enum_values"]:
        raise Unfillable(f"{value} is not a value of {draft.attribute}")
    names = ", ".join(feature_name(f) for f in features)
    text = (
        f"I filled in the Edit form: {draft.attribute.replace('_', ' ')} {value} for "
        f"{names}. Open it, check it, add the source and save. Nothing is changed until "
        "you save."
    )
    offer = EditOffer(
        target="pipeline" if kind == "line" else "sections",
        feature_ids=[f["id"] for f in features],
        attribute=draft.attribute,
        value=value,
    )
    return Statement(kind="edit_offer", text=text, refs=refs, edit=offer)


def as_it(text: str, read: "Read") -> str:
    """A sentence code wrote, said to a person who attached one thing: "it", not its
    code again. With several things read in their own right, the names stay."""
    subject = read.only_subject()
    if subject is None:
        return text
    name = feature_name(read.features[subject])
    # A named pipeline is written "the pipeline Example trunk line": all of it is "it".
    text = re.sub(rf"(?<![\w-])[Tt]he pipeline (?={re.escape(name)}(?![\w-]))", "", text)
    for full, short in ((f"{name}'s", "its"), (name, "it")):
        text = re.sub(rf"(^|(?<=[.:] )){re.escape(full)}(?![\w-])", short.capitalize(), text)
        text = re.sub(rf"(?<![\w-]){re.escape(full)}(?![\w-])", short, text)
    return text


def _written_worked_out(draft: DraftStatement, read: "Read") -> Statement:
    """A sentence the model wrote about what code worked out: every value enters through
    a slot of a W handle ({w1.km}) or a feature's name ({f1.name}), filled here."""
    keys = {ref.key: ref for ref in draft.refs}
    if len(keys) != len(draft.refs):
        raise Unfillable("a key is used for two things")
    worked = {k: ref.id.strip().upper() for k, ref in keys.items() if ref.type == "worked_out"}
    if not worked or any(h not in read.worked for h in worked.values()):
        raise Unfillable("a worked_out statement names W handles from read_context")
    if any(ref.type not in ("worked_out", "feature") for ref in draft.refs):
        raise Unfillable("a worked_out statement holds W handles and features only, no claim")
    used: set[str] = set()

    def fill(match: re.Match[str]) -> str:
        key, field = match.group(1), match.group(2)
        ref = keys.get(key)
        if ref is None:
            raise Unfillable(f"the slot {match.group(0)} names a key that is not in refs")
        if ref.type == "feature":
            if field != "name" or ref.id not in read.features:
                raise Unfillable(f"the slot {match.group(0)} is not a feature that was read")
            return feature_name(read.features[ref.id])
        values = read.worked[worked[key]].get("values") or {}
        if field not in values:
            has = ", ".join(sorted(values)) or "no values: leave its text empty"
            raise Unfillable(f"{worked[key]} has no value {field!r}; it has {has}")
        used.add(key)
        return values[field]

    text = one_full_stop(SLOT.sub(fill, draft.text).strip())
    unused = [worked[k] for k in worked if k not in used]
    if unused:
        raise Unfillable(f"{', '.join(unused)} is in refs but no slot uses it")
    rests = list(dict.fromkeys(i for h in worked.values() for i in read.worked[h]["rests_on"]))
    return Statement(
        kind="worked_out", text=text, refs=[_ref(_kind_of(i, read), i, read) for i in rests]
    )


def render(draft: Draft, read: Read) -> Answer:
    """The draft with every slot filled. Not yet checked: grounding decides that."""
    # About several things, each "Store does not say" names which one.
    about = {r.id for s in draft.statements for r in s.refs if r.type == "feature"}
    # A claim on a trace merged into a section is about that section, not a second thing.
    about |= {
        holder(read.claims[r.id]["feature_id"], read)
        for s in draft.statements
        for r in s.refs
        if r.type == "claim" and r.id in read.claims
    }
    return Answer(
        statements=[render_statement(s, read, name_things=len(about) > 1) for s in draft.statements]
    )
