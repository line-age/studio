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


class CiteCitation(_Read):
    """One quote on one document cite fetched as text: a journal issue, a web page."""

    id: str
    source: str  # the listed source's domain
    source_name: str
    document: str  # the document's own address: the same for every quote from it
    title: str
    date: dt.date | None = None
    # The document's own words the quote aligned to: what is shown and what store keeps.
    page_text: str
    url: str  # opens the document, at the quote where the source can
    places_matched: list[str] = Field(default_factory=list)


class CiteCheck(_Read):
    """One check behind a claim's confidence. cite's code decides each; no model does."""

    name: Literal["quote_on_page", "company_near", "town_near", "date_fits", "second_source"]
    passed: bool
    adds: float
    note: str = ""


class CiteClaim(_Read):
    id: str
    attribute: CiteAttribute
    value: str
    normalized: dict[str, str | int | float | None] = Field(default_factory=dict)
    date_sense: DateSense
    # A finding can be proposed; a lead scored below cite's cut-off, or its reviewer was
    # not sure, and it cannot.
    kind: Literal["finding", "lead"]
    confidence: float = Field(ge=0, le=1)
    checks: list[CiteCheck] = Field(default_factory=list)
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


class CiteSourceSearched(_Read):
    domain: str
    name: str
    results: int = 0
    pages_read: int = 0
    not_read: int = 0


class CiteSearchStep(_Read):
    """One step of a search, run or not. Corpus comes first and is not available yet;
    the web step searches the listed sources only."""

    step: Literal["corpus", "web"]
    ran: bool
    why_not: str = ""
    queries: list[str] = Field(default_factory=list)
    sources: list[CiteSourceSearched] = Field(default_factory=list)
    pages_read: int = 0
    years: tuple[int, int] | None = None
    errors: list[str] = Field(default_factory=list)


class CiteNotRead(_Read):
    """An address cite tried to read and could not."""

    url: str
    source: str = ""
    reason: str


class CiteUsed(_Read):
    used: int
    allowed: int


class CiteLimits(_Read):
    web_searches: CiteUsed
    pages_read: CiteUsed
    model_calls: CiteUsed


class CiteUnknown(_Read):
    attribute: CiteAttribute
    note: str


class CiteSection(_Read):
    section_id: str | None = None  # empty when cite turned the input away
    places: list[str] = Field(default_factory=list)
    places_given: list[str] = Field(default_factory=list)


class CiteResult(_Read):
    schema_version: Literal["0.4"]
    status: Literal["ok", "invalid", "failed"]
    reason: str = ""
    section: CiteSection | None = None
    citations: list[CiteCitation] = Field(default_factory=list)
    claims: list[CiteClaim] = Field(default_factory=list)
    unknowns: list[CiteUnknown] = Field(default_factory=list)
    attempts: list[CiteAttempt] = Field(default_factory=list)
    searched: list[CiteSearchStep] = Field(default_factory=list)
    not_read: list[CiteNotRead] = Field(default_factory=list)
    limits: CiteLimits | None = None
    cutoff: float | None = None
