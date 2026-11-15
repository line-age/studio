"""The contract: the question Studio sends, the draft the model writes, the answer
Studio renders. `contract/` holds the same shapes as JSON Schema with examples, checked
on both sides so the service and Studio cannot drift apart.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = 2

StatementKind = Literal[
    "fact",
    "unknown",
    "set",
    "reading",
    "help",
    "clarify",
    "refusal",
    "greeting",
    "failure",
    # A request for new citations: what store's POST /citation-requests would be sent.
    # Version 1 only shows it; sending it (with the person's go-ahead) is step 2.
    "citation_request",
    # Worked out by code from what store holds (geometry, editions), never a claim. Its
    # text names what it was worked out from; refs are the features it rests on.
    "worked_out",
    # Found by code by a fixed rule over the section pack: somewhere to look, never a
    # claim and never written to store. Its text says "Not in store" and its rule.
    "lead",
    # What cite found in a journal for one section, not in store: code's sentence, and
    # the passage in `finding`. Written to store only by the person's Propose.
    "finding",
    # What cite searched for one attribute and did not find: journal, dates, issues read.
    "searched",
    # A search needs place names from the person first; the request is kept until then.
    "ask_places",
    # A finding the person proposed is in store now, as a candidate claim.
    "proposed",
]
# Kinds whose text is written by code, never by the model, and which carry no reference.
FIXED_KINDS: frozenset[str] = frozenset({"refusal", "greeting", "failure"})
# Kinds that must rest on something read from store in this run.
GROUNDED_KINDS: frozenset[str] = frozenset({"fact", "unknown", "set", "reading"})


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# The question -----------------------------------------------------------------------------


class Where(_Strict):
    sectionId: str | None = None
    pipelineId: str | None = None
    attribute: str | None = None


class QuestionItem(_Strict):
    """One attached thing: its kind and store id, or where it is when it has no id."""

    kind: Literal["pipeline", "section", "claim", "citation", "link"]
    id: str | None = None
    on: Where | None = None


class Action(_Strict):
    """A button the person pressed, not words: code acts on it, no model reads it.

    propose: write a finding to store as a candidate claim.
    fresh_start: drop the conversation's messages, keep what cite found."""

    kind: Literal["propose", "fresh_start"]
    # For propose: the finding's handle in this thread (F1).
    finding: str | None = None


class Question(_Strict):
    """Everything a question carries. The selection, the map view and the filters are
    not sent: "this" means what is attached."""

    words: str
    about: list[QuestionItem] = Field(default_factory=list)
    network: str = "gas"
    action: Action | None = None


# The draft: what the model writes ---------------------------------------------------------


class DraftRef(_Strict):
    key: str = Field(description="A short local name used in slots: c1, c2, f1.")
    type: Literal["claim", "feature", "link", "worked_out", "lead", "finding"]
    id: str = Field(
        description=(
            "As the tool showed it: a claim's handle (C1), a worked-out item's handle (W1), "
            "a finding's handle (F1) or a feature's id."
        )
    )


# store's attribute keys. A closed list in the schema also keeps the model's output from
# running on inside this one field.
AttributeKey = Literal[
    "name",
    "owner",
    "operator",
    "status",
    "route",
    "location",
    "diameter",
    "voltage",
    "gauge",
    "lanes",
    "station_kind",
    "serves",
    "flow_direction",
    "commodity",
]


class DraftStatement(_Strict):
    # help and reading come with their behaviours (B10, B12) and their checks.
    kind: Literal[
        "fact",
        "unknown",
        "clarify",
        "refusal",
        "greeting",
        "citation_request",
        "worked_out",
        "lead",
        "finding",
    ]
    attribute: AttributeKey | None = Field(
        None,
        description=(
            "For kind unknown: the store attribute key that was checked. For "
            "citation_request: the one to search for (owner, diameter, or status for when "
            "it was built)."
        ),
    )
    text: str = Field(
        description=(
            "One plain sentence. Values enter only through slots such as {c1.value}; "
            "for refusal and greeting leave it empty, code writes the line."
        )
    )
    refs: list[DraftRef] = Field(default_factory=list)
    # For citation_request only: what the person gave to steer the search. Code checks
    # that each one is in the person's words, in store or in an earlier finding.
    places: list[str] = Field(
        default_factory=list, description="Towns along the line, as the person wrote them."
    )
    years: list[int] = Field(
        default_factory=list, description="The years to read: [from, to], or empty."
    )
    ruled_out: list[str] = Field(
        default_factory=list, description="Values the person turned down, as written."
    )
    without_places: bool = Field(
        False, description="True only when the person said to search without towns."
    )


class Draft(_Strict):
    statements: list[DraftStatement]


# The answer: what Studio renders ----------------------------------------------------------


class Ref(_Strict):
    """What a statement rests on, by store id, so Studio can open it."""

    type: Literal["claim", "citation", "link", "feature", "source", "help", "set"]
    id: str
    # For a claim: which feature it is on, its attribute, and whether it is what is known
    # (accepted), a proposal (candidate) or a value somebody ruled out (rejected).
    feature_id: str | None = None
    attribute: str | None = None
    status: Literal["accepted", "candidate", "rejected", "proposed", "confirmed"] | None = None
    asserter: Literal["person", "pipeline"] | None = None
    # What it opens, named from what was read: a feature by its label or kind and short
    # id; a claim by the feature it is on; a link by what it says. Studio lists sections
    # and pipelines only, so it cannot name a merged trace or a line traced as gone.
    label: str | None = None
    # For a claim: its source as Studio shows it beside the statement ("Example Gazette,
    # vol. 32 no. 3, p. 41"), or None when store holds no source for it.
    source: str | None = None
    # For a claim: the passage its citation quotes and a link to the source, as store
    # holds them, for Studio to show on hover. None when store holds none.
    quote: str | None = None
    url: str | None = None
    # For a claim: what its source does for it (states, map_shows, map_omits, confirms)
    # and, for a map, the date it is as of (EDTF). For Studio's hover card.
    role: str | None = None
    as_of: str | None = None


LeadRule = Literal[
    "neighbour_source",  # a neighbour's claim is cited to a source and page: look there
    "neighbour_owner",  # a neighbour's owner or operator: worth checking here
    "pipeline_claims",  # its pipeline's own owner or operator
    "edition_window",  # the years between the last edition without it and the first with it
    "proposed_link",  # what confirming a proposed same_as or overlaps would carry
    "rejected_value",  # a value ruled out, so it is not proposed again
    "conflict",  # accepted claims that disagree for the same years
]


class Hint(_Strict):
    """A lead handed to cite with a citation request: where to look, not what is true."""

    rule: LeadRule
    text: str
    # The source and page the lead points to, when it rests on a cited claim.
    source: str | None = None


class CitationRequest(_Strict):
    """What a citation request to store would hold (`POST /citation-requests`)."""

    feature_id: str
    attribute_keys: list[str]
    priority: Literal["interactive", "background"] = "interactive"
    # The section's leads for these attributes, as hints for the search. Never a claim.
    hints: list[Hint] = Field(default_factory=list)


class FindingFlag(_Strict):
    """Why a finding is in doubt, in code's words (or the reviewer model's, for unclear)."""

    flag: str
    reason: str


class Box(_Strict):
    """A highlight rectangle, 0 to 1 of the page image."""

    x0: float
    y0: float
    x1: float
    y1: float


class Finding(_Strict):
    """A passage cite found and checked, for one attribute of one section. Not in store
    until the person proposes it; then it is a candidate claim, never more."""

    handle: str
    section_id: str
    attribute: Literal["owner", "diameter", "built"]
    value: str
    # When, as the passage gives it: "laying in 1939", "completed in 1939", "by 1939".
    date_words: str
    # The page's own words, as aligned by cite's verifier.
    quote: str
    journal: str
    volume: int | None = None
    number: int | None = None
    date: str
    page: str
    url: str
    image_url: str | None = None
    page_width: int | None = None
    page_height: int | None = None
    highlight: list[Box] = Field(default_factory=list)
    flags: list[FindingFlag] = Field(default_factory=list)
    places_matched: list[str] = Field(default_factory=list)
    # Of those, the ones the person typed in.
    places_given: list[str] = Field(default_factory=list)
    # Store already holds this value for the section, and with which status: then it
    # is not "not in store", and Propose is not offered.
    in_store: Literal["accepted", "candidate", "rejected"] | None = None
    # Whether Propose may write it, and if not, why (a "by" build date, plan D12).
    proposable: bool = True
    not_proposable: str | None = None


class Statement(_Strict):
    kind: StatementKind
    text: str
    refs: list[Ref] = Field(default_factory=list)
    # For kind unknown: what was looked for and not found.
    attribute: str | None = None
    # For kind citation_request: the request, ready for step 2 to send.
    request: CitationRequest | None = None
    # For kind lead: the rule that found it.
    rule: LeadRule | None = None
    # For kind finding: the passage, with everything Studio shows and Propose writes.
    finding: Finding | None = None


class Answer(_Strict):
    """Only an answer that passed the grounding check is `checked`, and Studio shows no
    other."""

    version: int = CONTRACT_VERSION
    checked: bool = False
    statements: list[Statement]


# The section pack: what code works out about one section, for the chat and for cite ---


class PackClaim(_Strict):
    """A claim store holds, as code words it. `handle` is how the model names it (C1)."""

    handle: str
    id: str
    attribute: str
    value: str
    period: str
    status: Literal["accepted", "candidate", "rejected"]
    source: str | None = None


class PackLink(_Strict):
    """A link store holds from or to the section, and what is at its other end."""

    id: str
    relation: Literal["same_as", "overlaps", "split_into", "part_of", "parallel_to"]
    status: Literal["proposed", "confirmed", "rejected"]
    other_id: str
    other: str
    score: float | None = None


class Neighbour(_Strict):
    """A section drawn touching this one: a line end within the tolerance of the other
    line. A clue, never proof that the pipes joined."""

    section_id: str
    name: str
    meets: Literal["end_to_end", "end_to_middle", "middle_to_end"]
    gap_m: float
    claims: list[PackClaim] = Field(default_factory=list)


class WorkedOut(_Strict):
    """A fact code worked out from what store holds, with what from. Never a claim."""

    handle: str
    what: Literal[
        "first_edition",
        "removal",
        "not_traced_later",
        "pipeline",
        "same_pipe",
        "split",
        "overlap",
        "parallel",
        "link",
        "drawn_touching",
    ]
    text: str
    rests_on: list[str] = Field(default_factory=list)


class Lead(_Strict):
    """Somewhere to look, found by a fixed rule. Not in store, never written to it.
    `backing` counts the independent things it rests on; more ranks higher."""

    handle: str
    rule: LeadRule
    text: str
    # The attribute it would help find, if one: a citation request carries it as a hint.
    attribute: str | None = None
    # The source and page it points to or rests on, when one: cite's best place to look.
    source: str | None = None
    rests_on: list[str] = Field(default_factory=list)
    backing: int = 1


class SectionPack(_Strict):
    """Everything code can say about one section from store: the chat answers from it
    and cite takes it as its brief. Fields follow cite's input (ids, line type, name,
    states, place names, observations). States and places are empty until place data
    comes in (owner, 2026-11-14)."""

    version: int = 1
    section_id: str
    network: str | None = None
    name: str | None = None
    # (longitude, latitude) of the line's two ends, WGS 84.
    endpoints: list[tuple[float, float]] = Field(default_factory=list)
    states: list[str] = Field(default_factory=list)
    places: list[str] = Field(default_factory=list)
    claims: list[PackClaim] = Field(default_factory=list)
    pipeline_id: str | None = None
    pipeline_claims: list[PackClaim] = Field(default_factory=list)
    links: list[PackLink] = Field(default_factory=list)
    neighbours: list[Neighbour] = Field(default_factory=list)
    worked_out: list[WorkedOut] = Field(default_factory=list)
    leads: list[Lead] = Field(default_factory=list)
