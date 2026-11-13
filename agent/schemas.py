"""The answer the service gives Studio. The full contract arrives in contract/ (S2)."""

from typing import Literal

from pydantic import BaseModel, Field

CONTRACT_VERSION = 1

StatementKind = Literal[
    "fact", "unknown", "set", "reading", "help", "clarify", "refusal", "greeting", "failure"
]

# Kinds whose text is written by code, never by the model, and which carry no reference.
FIXED_KINDS: frozenset[str] = frozenset({"refusal", "greeting", "failure"})


class Statement(BaseModel):
    kind: StatementKind
    text: str
    refs: list[dict] = Field(default_factory=list)


class Answer(BaseModel):
    """What Studio renders. Only an answer that passed the grounding check is `checked`."""

    version: int = CONTRACT_VERSION
    checked: bool = False
    statements: list[Statement]
