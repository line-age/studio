"""The contract: the question Studio sends, the draft the model writes, the answer
Studio renders. `contract/` holds the same shapes as JSON Schema with examples, checked
on both sides so the service and Studio cannot drift apart.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = 1

StatementKind = Literal[
    "fact", "unknown", "set", "reading", "help", "clarify", "refusal", "greeting", "failure"
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
    type: Literal["claim", "feature", "link"]
    id: str = Field(description="As the tool showed it: a claim's handle (C1) or a feature's id.")


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
    kind: Literal["fact", "unknown", "clarify", "refusal", "greeting"]
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


class Statement(_Strict):
    kind: StatementKind
    text: str
    refs: list[Ref] = Field(default_factory=list)
    # For kind unknown: what was looked for and not found.
    attribute: str | None = None


class Answer(_Strict):
    """Only an answer that passed the grounding check is `checked`, and Studio shows no
    other."""

    version: int = CONTRACT_VERSION
    checked: bool = False
    statements: list[Statement]
