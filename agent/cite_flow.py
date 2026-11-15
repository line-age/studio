"""Searching the journals with cite, from the chat: everything but the graph's wiring.

- The guard (plan D8): a search request is checked by code before cite is asked. Every
  place, year and turned-down value must be in the person's words, in what store holds
  or in an earlier finding. One section, attributes cite can look for, a printing to
  search from.
- What cite found becomes statements written here, by code: a finding (with its passage,
  for the card), what was searched and not found, sources that disagree, cite failing.
  The model never writes a finding's words; it can only name an earlier one by handle.
- The thread keeps what cite found (`cite` in the graph's state) until "Clear chat", so
  a finding can be shown again or proposed later. The model is told of it in a block
  code writes ("Cite so far"), never through old messages.
"""

import calendar
import datetime as dt
import re
from dataclasses import dataclass
from typing import Any

from cite_input import FROM_CITE, TO_CITE, WORDS, CiteAsk, years_in
from cite_result import CiteClaim, CiteResult
from render import Read, feature_name, one_full_stop, value_words
from schemas import Box, DraftStatement, Finding, FindingFlag, Ref, Statement

# Agreed words (plan D13). Evals match them exactly.
FOUND = "Found, not in store"
IN_DOUBT = "Found, in doubt"
CITE_LINES = {
    "ask_places": (
        "Which towns does it run between or through? I search the journals by place names. "
        "Say them, or say to search without them."
    ),
    "not_yet": (
        "I cannot look for the {what} yet. I can look for the owner, the diameter and when "
        "it was built."
    ),
    "one_section": "I search for one section at a time. Attach one section and ask again.",
    "no_edition": (
        "I cannot search for this section: no map printing in store shows it, so there is "
        "no year to search from."
    ),
    "not_given": (
        "I search only with places, years and values you gave, store holds or an earlier "
        "finding shows. {what} is none of these."
    ),
    "busy": "A search is already running. Ask again when it has finished.",
    "nothing_to_search_by": (
        "Store holds no name for this section, so without towns there is nothing to search "
        "by. Which towns does it run between or through?"
    ),
    "failed": "The search could not finish. Nothing was found and nothing was written.",
    "invalid": "cite could not search this section. Nothing was written.",
    "lost": "The search was lost, so nothing came back. Ask again.",
    "propose_words": (
        "To propose a finding, press Propose on it. I do not write to store from words."
    ),
    "not_found_finding": "That finding is no longer in this chat. Ask for it again.",
    "not_proposable": "This finding cannot be proposed: {why}",
    "already_in_store": (
        "Store already holds {value} as the {what} of {subject} ({status}), so it was not "
        "proposed again."
    ),
    "proposed": (
        "Proposed {value} as the {what} of {subject}, cited to {reference}. It waits for a "
        "person's decision."
    ),
    "store_write_failed": "Store did not take the proposal, so nothing was written.",
}
_SPACE = re.compile(r"\s+")
# Asking about what cite cannot look for yet, and the words for what it can.
_ASKED_ONLY = re.compile(r"\b(operat\w*|called|named)\b", re.IGNORECASE)
_WORDS_FOR = {
    "owner": re.compile(r"\bown", re.IGNORECASE),
    "diameter": re.compile(r"\b(diameter|size|inch|in\.)", re.IGNORECASE),
    "status": re.compile(r"\b(built|laid|construct|complet|when)", re.IGNORECASE),
}
# The person saying, in so many words, to search with no towns.
_WITHOUT_TOWNS = re.compile(
    r"\bwithout (?:any |the )?(?:towns?|places?|place names)\b", re.IGNORECASE
)


def _fold(text: str) -> str:
    return _SPACE.sub(" ", text.casefold()).strip()


# The guard -------------------------------------------------------------------------------


@dataclass
class Refused:
    """A request code turned away, with the line that says why."""

    line: str
    kind: str = "citation_request"


@dataclass
class AskForPlaces:
    """A request held until the person gives towns (or says to search without)."""

    section_id: str
    attributes: list[str]


def check_request(
    drafts: list[DraftStatement],
    resolved: list[Statement],
    read: Read,
    words: list[str],
    findings: dict[str, dict[str, Any]],
    runs: list[dict[str, Any]] | None = None,
) -> CiteAsk | Refused | AskForPlaces:
    """The model's citation_request statements, checked by code. `words` are the
    person's own messages in this thread, `findings` what cite found earlier, `runs` the
    earlier searches: a steering message keeps the towns and turned-down values of the
    last search of the same section unless it gives new towns."""
    sections = list(
        dict.fromkeys(r.id for s in resolved for r in s.refs if r.type == "feature" and r.id)
    )
    if len(sections) != 1:
        return Refused(CITE_LINES["one_section"])
    attributes = list(dict.fromkeys(d.attribute for d in drafts if d.attribute))
    # Asked about what cite cannot look for: never searched as something else instead.
    asked = _ASKED_ONLY.findall(words[-1]) if words else []
    if asked and not any(a in TO_CITE and _WORDS_FOR[a].search(words[-1]) for a in attributes):
        attributes = list(
            dict.fromkeys(["operator" if "operat" in a.lower() else "name" for a in asked])
        )
    cannot = [a for a in attributes if a not in TO_CITE]
    if cannot or not attributes:
        what = " or the ".join(a.replace("_", " ") for a in cannot) or "that"
        return Refused(CITE_LINES["not_yet"].format(what=what))
    said = _fold(" ".join(words))
    found_values = {_fold(str(f["finding"]["value"])) for f in findings.values()}
    found_years = {y for f in findings.values() for y in years_in(f["finding"]["date"])}
    store_values = {
        _fold(value_words(c))
        for c in read.claims.values()
        if c.get("value_text") or c.get("value_num") is not None
    }
    store_years = {
        y
        for item in [*read.worked.values(), *read.leads.values()]
        for y in years_in(item.get("text", ""))
    }
    places = list(dict.fromkeys(p.strip() for d in drafts for p in d.places if p.strip()))
    earlier = [r for r in runs or [] if r["section_id"] == sections[0]]
    if not places and earlier and not any(d.without_places for d in drafts):
        places = list(earlier[-1].get("places") or [])
    for place in places:
        if _fold(place) not in said:
            return Refused(CITE_LINES["not_given"].format(what=f"The place {place}"))
    years = sorted({y for d in drafts for y in d.years})
    # An earlier search's years came from the person or from store's printings.
    run_years = {y for r in runs or [] for y in range(*_span(r.get("years")))}
    for year in years:
        if str(year) not in said and year not in store_years | found_years | run_years:
            return Refused(CITE_LINES["not_given"].format(what=f"The year {year}"))
    ruled: list[tuple[str, str]] = []
    for d in drafts:
        for value in d.ruled_out:
            v = _fold(value)
            if v not in said and v not in found_values | store_values:
                return Refused(CITE_LINES["not_given"].format(what=f"The value {value}"))
            ruled.append((d.attribute, value.strip()))
    if earlier:
        kept = [tuple(r) for r in earlier[-1].get("ruled_out") or []]
        ruled = list(dict.fromkeys([*kept, *ruled]))
    without = any(d.without_places for d in drafts) or bool(_WITHOUT_TOWNS.search(words[-1]))
    if not places and not without:
        return AskForPlaces(sections[0], attributes)
    if without and "without" not in said:
        return Refused(CITE_LINES["not_given"].format(what="Searching without towns"))
    # Cut to what one search reads by cite_input.build, which knows the first printing.
    window = (years[0], years[-1]) if years else None
    return CiteAsk(sections[0], attributes, places, window, ruled)


def _span(years: list[int] | None) -> tuple[int, int]:
    return (years[0], years[-1] + 1) if years else (0, 0)


# The words -------------------------------------------------------------------------------


def _day(iso: str) -> str:
    day = dt.date.fromisoformat(iso[:10])
    return f"{day.day} {calendar.month_name[day.month]} {day.year}"


def _years(window: tuple[int, int] | list[int] | None) -> str:
    if not window:
        return "the years nearest the first map that shows it"
    start, end = window
    return str(start) if start == end else f"{start} to {end}"


def looking_line(ask: CiteAsk, subject: str) -> str:
    what = " and the ".join(_what(a) for a in ask.attributes)
    places = f", by {', '.join(ask.places)}" if ask.places else ", with no towns"
    return (
        f"Searching the journals for the {what} of {subject}{places}, reading "
        f"{_years(ask.years)}. This takes a few minutes."
    )


def _what(attribute: str) -> str:
    return "build date" if attribute == "status" else attribute


DATE_WORDS = {
    "laying": "being laid in {year}",
    "completed": "completed in {year}",
    "in_operation": "in operation in {year}",
    "by": "built by {year}",
}


def reference(f: Finding) -> str:
    number = f", vol. {f.volume} no. {f.number}" if f.volume and f.number else ""
    return f"{f.journal}{number}, {_day(f.date)}, {f.page}"


def finding_sentence(f: Finding, subject: str) -> str:
    lead = IN_DOUBT if f.flags else FOUND
    if f.attribute == "built":
        said = f"{subject}, {f.date_words}"
    else:
        said = f"{f.value} as the {f.attribute} of {subject}, {f.date_words}"
    return one_full_stop(f"{lead}: {said}. {reference(f)}.")


def _page(printed: str | None, confidence: float | None, leaf: int) -> str:
    if not printed:
        return f"leaf {leaf}"
    return f"p. {printed}" + (" (approx.)" if (confidence or 0) < 60 else "")


def _date_words(claim: CiteClaim, issue: dt.date) -> str:
    if claim.attribute == "YearConstructed":
        year = claim.normalized.get("year") or claim.value
        return DATE_WORDS[claim.date_sense].format(year=year)
    return f"as of {_day(issue.isoformat())}"


def findings_of(result: CiteResult, section_id: str, next_handle: int) -> list[dict[str, Any]]:
    """Each claim cite verified, as a finding record kept in the thread: the contract's
    Finding and what Propose needs besides (normalized value, date sense)."""
    citations = {c.id: c for c in result.citations}
    given = set(result.section.places_given if result.section else [])
    out = []
    for claim in result.claims:
        if claim.attribute not in FROM_CITE:
            continue  # LineType is never asked for (store refuses commodity)
        page = citations.get(claim.citation_ids[0])
        if page is None:
            continue
        store_key = FROM_CITE[claim.attribute]
        by = claim.attribute == "YearConstructed" and claim.date_sense == "by"
        finding = Finding(
            handle=f"F{next_handle + len(out)}",
            section_id=section_id,
            attribute=WORDS[store_key],
            value=claim.value,
            date_words=_date_words(claim, page.date),
            quote=page.page_text,
            journal=page.journal,
            volume=page.volume,
            number=page.number,
            date=page.date.isoformat(),
            page=_page(page.printed_page, page.printed_page_confidence, page.leaf),
            url=page.url,
            image_url=page.image_url,
            page_width=page.page_width,
            page_height=page.page_height,
            highlight=[Box(**b.model_dump()) for b in page.highlight],
            flags=[
                FindingFlag(flag=f, reason=claim.flag_reasons.get(f, "flagged by cite"))
                for f in claim.flags
            ],
            places_matched=page.places_matched,
            places_given=[p for p in page.places_matched if p in given],
            proposable=not by,
            not_proposable=(
                "the passage says only that the line was there by that year, not when it was built"
                if by
                else None
            ),
        )
        out.append(
            {
                "finding": finding.model_dump(),
                "normalized": claim.normalized,
                "date_sense": claim.date_sense,
                "store_key": store_key,
                "issue_id": page.issue_id,
            }
        )
    return out


def reference_of(record: dict[str, Any]) -> str:
    return reference(Finding.model_validate(record["finding"]))


def _owner_words(text: str) -> str:
    noise = {"the", "co", "company", "corp", "corporation", "inc", "incorporated", "ltd", "of"}
    words = re.findall(r"[a-z0-9]+", text.casefold())
    return " ".join(w for w in words if w not in noise)


def held_in_store(record: dict[str, Any], features: list[dict[str, Any]]) -> dict[str, Any] | None:
    """A claim store already holds for this value, of any status: accepted (known),
    candidate (proposed already) or rejected (ruled out). None if store holds none."""
    f, key = record["finding"], record["store_key"]
    for feature in features:
        for claim in feature.get("claims") or []:
            if claim["attribute_key"] != key:
                continue
            if key == "owner" and _owner_words(str(claim.get("value_text") or "")) == _owner_words(
                f["value"]
            ):
                return claim
            if (
                key == "diameter"
                and claim.get("value_num") is not None
                and float(claim["value_num"]) == float(record["normalized"].get("inches", -1))
            ):
                return claim
            if key == "status" and claim.get("value_text") in ("under_construction", "operational"):
                year = str(record["normalized"].get("year"))
                bounds = [claim.get(b) or "" for b in ("start_earliest", "start_latest")]
                cited_text = any(c.get("role") == "states" for c in claim.get("citations") or [])
                if cited_text and any(b.startswith(year) for b in bounds):
                    return claim
    return None


def finding_statement(
    record: dict[str, Any], read: Read | None, names: dict[str, str]
) -> Statement:
    """A finding as shown: code's sentence, the passage, and the section it is about."""
    finding = Finding.model_validate(record["finding"])
    subject = names.get(finding.section_id) or "the section"
    return Statement(
        kind="finding",
        text=finding_sentence(finding, subject),
        refs=[
            Ref(
                type="feature",
                id=finding.section_id,
                label=subject,
                source=reference(finding),
            )
        ],
        attribute={"built": "status"}.get(finding.attribute, finding.attribute),
        finding=finding,
    )


def report(
    result: CiteResult,
    records: list[dict[str, Any]],
    ask_attributes: list[str],
    section_id: str,
    subject: str,
) -> list[Statement]:
    """What cite found and did not, for one search, all in code's words."""
    feature = Ref(type="feature", id=section_id, label=subject)
    if result.status != "ok":
        line = CITE_LINES["invalid" if result.status == "invalid" else "failed"]
        return [Statement(kind="searched", text=line, refs=[feature])]
    names = {section_id: subject}
    out = [finding_statement(r, None, names) for r in records]
    # Sources that disagree: kept side by side, never picked (house rule).
    by_attribute: dict[str, list[str]] = {}
    for r in records:
        f = r["finding"]
        values = by_attribute.setdefault(f["attribute"], [])
        if f["value"] not in values:
            values.append(f["value"])
    # A section has one diameter at a time; it may have several owners at once (store
    # keeps joint owners), so two owners found are not a disagreement.
    for attribute, values in by_attribute.items():
        if attribute == "diameter" and len(values) > 1:
            out.append(
                Statement(
                    kind="worked_out",
                    text=one_full_stop(
                        f"The sources disagree on the {attribute}: {' and '.join(values)}. "
                        "Both are shown; neither is picked."
                    ),
                    refs=[feature],
                )
            )
    found = {FROM_CITE[c.attribute] for c in result.claims if c.attribute in FROM_CITE}
    for attribute in ask_attributes:
        if attribute in found:
            continue
        mine = [s for s in result.searched if s.attribute == TO_CITE[attribute]]
        parts = [
            f"{s.searches} searches of {s.journal}, {s.issues_read} issues from "
            f"{_day(s.first_issue.isoformat())} to {_day(s.last_issue.isoformat())}"
            if s.first_issue and s.last_issue
            else f"{s.searches} searches of {s.journal}, no issues read"
            for s in mine
        ] or ["nothing was searched"]
        out.append(
            Statement(
                kind="searched",
                text=f"Searched, not found: the {_what(attribute)} of {subject}. "
                + "; ".join(parts)
                + ".",
                refs=[feature],
                attribute=attribute,
            )
        )
    # Passages cite read and turned down, in one line. An outage is not a verdict.
    turned_down = [
        a
        for a in result.attempts
        if a.claim is not None and not a.reason.startswith("reviewer unavailable")
    ]
    if turned_down:
        n = len(turned_down)
        out.append(
            Statement(
                kind="searched",
                text=(
                    f"cite turned down {n} other proposed value{'' if n == 1 else 's'}: the "
                    "page did not say it, it was about another line, or it was ruled out."
                ),
                refs=[feature],
            )
        )
    return out


# What the model is told -------------------------------------------------------------------


def so_far(cite: dict[str, Any], names: dict[str, str]) -> str:
    """The "Cite so far" block: what earlier searches in this chat found, in code's words.
    The model may name a finding by its handle; it never sees the passages to retell."""
    if not cite or not (cite.get("runs") or cite.get("pending")):
        return ""
    lines = ["", "Cite so far (earlier searches in this chat; code wrote these lines):"]
    for run in cite.get("runs") or []:
        subject = names.get(run["section_id"]) or run.get("subject") or "a section"
        what = ", ".join(_what(a) for a in run["attributes"])
        places = ", ".join(run.get("places") or []) or "no towns"
        lines.append(
            f"- searched {subject} (id {run['section_id']}) for {what}, by {places}, "
            f"reading {_years(run.get('years'))}: {run.get('outcome', 'running')}"
        )
        if run.get("ruled_out"):
            lines.append(
                "  ruled out: " + "; ".join(f"{_what(a)} {v}" for a, v in run["ruled_out"])
            )
    for handle, record in (cite.get("findings") or {}).items():
        f = Finding.model_validate(record["finding"])
        subject = names.get(f.section_id) or "the section"
        flag = f" (in doubt: {'; '.join(x.reason for x in f.flags)})" if f.flags else ""
        lines.append(f"  - {handle}: {finding_sentence(f, subject)}{flag}")
    pending = cite.get("pending")
    if pending:
        what = " and ".join(_what(a) for a in pending["attributes"])
        lines.append(
            f"- waiting for towns to search for the {what} of section id {pending['section_id']}"
        )
    return "\n".join(lines)


def latest_section(cite: dict[str, Any]) -> str | None:
    """The section a steering message with nothing attached is about (plan D9)."""
    if cite.get("pending"):
        return cite["pending"]["section_id"]
    runs = cite.get("runs") or []
    return runs[-1]["section_id"] if runs else None


def subject_of(feature: dict[str, Any] | None) -> str:
    return feature_name(feature) if feature else "the section"
