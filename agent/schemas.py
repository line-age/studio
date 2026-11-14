"""The contract: the question Studio sends, the draft the model writes, the answer
Studio renders. `contract/` holds the same shapes as JSON Schema with examples, checked
on both sides so the service and Studio cannot drift apart.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = 1

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


class Question(_Strict):
    """Everything a question carries. The selection, the map view and the filters are
    not sent: "this" means what is attached."""

    words: str
    about: list[QuestionItem] = Field(default_factory=list)
    network: str = "gas"


# The draft: what the model writes ---------------------------------------------------------


class DraftRef(_Strict):
    key: str = Field(description="A short local name used in slots: c1, c2, f1.")
    type: Literal["claim", "feature", "link", "worked_out"]
    id: str = Field(
        description=(
            "As the tool showed it: a claim's handle (C1), a worked-out item's handle (W1) "
            "or a feature's id."
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
        "fact", "unknown", "clarify", "refusal", "greeting", "citation_request", "worked_out"
    ]
    attribute: AttributeKey | None = Field(
        None, description="For kind unknown: the store attribute key that was checked."
    )
    text: str = Field(
        description=(
            "One plain sentence. Values enter only through slots such as {c1.value}; "
            "for refusal and greeting leave it empty, code writes the line."
        )
    )
    refs: list[DraftRef] = Field(default_factory=list)


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


class CitationRequest(_Strict):
    """What a citation request to store would hold (`POST /citation-requests`)."""

    feature_id: str
    attribute_keys: list[str]
    priority: Literal["interactive", "background"] = "interactive"
    # The section's leads for these attributes, as hints for the search. Never a claim.
    hints: list[Hint] = Field(default_factory=list)


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
