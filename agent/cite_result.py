"""What the Agent reads of a cite run's result, and nothing more.

cite is a separate service, reached over HTTP. Its result has more in it than this; what
is not listed here is ignored, so cite can add fields without breaking the Agent, and a
field the Agent relies on that goes missing fails here, loudly, not in a sentence.
`contract/cite-result.schema.json` is this as JSON Schema; cite's own tests check its
results against it.
"""

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# cite's attribute names, and the ones the Agent asks for (plan D1). LineType is never
# asked for: store refuses `commodity`.
CiteAttribute = Literal["YearConstructed", "Ownership", "Size", "LineType"]
DateSense = Literal["by", "laying", "completed", "in_operation"]


class _Read(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CiteBox(_Read):
    """A highlight rectangle, 0 to 1 of the page image."""

    x0: float
    y0: float
    x1: float
    y1: float


class CiteCitation(_Read):
    id: str
    journal: str
    issue_id: str
    date: dt.date
    volume: int | None = None
    number: int | None = None
    leaf: int
    printed_page: str | None = None
    printed_page_confidence: float | None = None
    # The page's own words the quote aligned to: what is shown and what store keeps.
    page_text: str
    url: str
    image_url: str | None = None
    page_width: int | None = None
    page_height: int | None = None
    highlight: list[CiteBox] = Field(default_factory=list)
    places_matched: list[str] = Field(default_factory=list)


class CiteClaim(_Read):
    id: str
    attribute: CiteAttribute
    value: str
    normalized: dict[str, str | int | float | None] = Field(default_factory=dict)
    date_sense: DateSense
    status: Literal["verified", "flagged"]
    flags: list[str] = Field(default_factory=list)
    flag_reasons: dict[str, str] = Field(default_factory=dict)
    citation_ids: list[str] = Field(min_length=1)


class CiteClaimIn(_Read):
    attribute: CiteAttribute
    value: str


class CiteAttempt(_Read):
    claim: CiteClaimIn | None = None
    stage: Literal["source", "verifier", "ruled_out", "judge"]
    reason: str


class CiteSearched(_Read):
    attribute: CiteAttribute
    journal: str
    searches: int
    issues_read: int
    first_issue: dt.date | None = None
    last_issue: dt.date | None = None


class CiteUnknown(_Read):
    attribute: CiteAttribute
    note: str


class CiteSection(_Read):
    section_id: str | None = None  # empty when cite turned the input away
    places: list[str] = Field(default_factory=list)
    places_given: list[str] = Field(default_factory=list)


class CiteResult(_Read):
    schema_version: Literal["0.3"]
    status: Literal["ok", "invalid", "failed"]
    reason: str = ""
    section: CiteSection | None = None
    citations: list[CiteCitation] = Field(default_factory=list)
    claims: list[CiteClaim] = Field(default_factory=list)
    unknowns: list[CiteUnknown] = Field(default_factory=list)
    attempts: list[CiteAttempt] = Field(default_factory=list)
    searched: list[CiteSearched] = Field(default_factory=list)
