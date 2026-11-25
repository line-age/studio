"""Searching our sources with cite, from the chat: everything but the graph's wiring.

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
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from src.answer.render import Read, feature_name, one_full_stop, value_words
from src.answer.schemas import (
    DraftStatement,
    Finding,
    FindingCheck,
    FindingFlag,
    Ref,
    Statement,
)
from src.flows.cite_input import FROM_CITE, TO_CITE, WORDS, CiteAsk, years_in
from src.flows.cite_result import CiteClaim, CiteResult, CiteSearchStep
from src.worked_out.context import route_lines
from src.worked_out.places import towns_along

# Agreed words (plan D13). Evals match them exactly.
FOUND = "Found, not in store"
IN_DOUBT = "Found, in doubt"
# Below cite's cut-off, or its reviewer was not sure: shown with its source, never proposed.
LEAD = "A lead, not a finding"
# Each check behind the confidence, as a person reads it.
CHECK_WORDS = {
    "quote_on_page": "The quote is on the page, word for word",
    "company_near": "The company is named in the passage",
    "town_near": "A town of the section is named in the passage",
    "date_fits": "The date fits the years searched",
    "second_source": "A second source says the same",
}
# Found again: store already holds it (as accepted, a candidate or rejected).
FOUND_IN_STORE = "Found, already in store as {status}"
IN_STORE_WORDS = {"accepted": "accepted", "candidate": "a candidate", "rejected": "rejected"}
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
    "nothing_missing": (
        "Its owner, diameter and when it was built are all known already. Name one to "
        "search for it again."
    ),
    "already_searched": "That search has run already. Ask again to search again.",
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
    "not_its_pipeline": (
        "Only the owner can be proposed for a pipeline, and only for the pipeline the "
        "section is confirmed part of. Nothing was written."
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
    gaps: Callable[[str], list[str]] | None = None,
    pending: dict[str, Any] | None = None,
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
    # No attribute named in the person's words, and no earlier search or question for
    # towns being steered: search for what the section is missing, never a guess
    # (2026-11-23). Code reads the words; the model's attribute is not trusted here.
    named = bool(words) and any(rx.search(words[-1]) for rx in _WORDS_FOR.values())
    steering = any(r["section_id"] == sections[0] for r in runs or []) or (
        bool(pending) and pending.get("section_id") == sections[0]
    )
    if gaps is not None and not named and not asked and not steering:
        attributes = gaps(sections[0])
        if not attributes:
            return Refused(CITE_LINES["nothing_missing"])
    cannot = [a for a in attributes if a not in TO_CITE]
    if cannot or not attributes:
        what = " or the ".join(a.replace("_", " ") for a in cannot) or "that"
        return Refused(CITE_LINES["not_yet"].format(what=what))
    said = _fold(" ".join(words))
    found_values = {_fold(str(f["finding"]["value"])) for f in findings.values()}
    found_years = {y for f in findings.values() for y in years_in(f["finding"].get("date") or "")}
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
    from_line = bool(
        earlier
        and not any(d.places for d in drafts)
        and places == list(earlier[-1].get("places") or [])
        and earlier[-1].get("from_line")
    )
    if not places and not without:
        # No towns named: the towns along the traced line, worked out by code. Only when
        # none is near it does the person get asked.
        feature = read.features.get(sections[0])
        places = towns_along(route_lines(feature)) if feature else []
        if not places:
            return AskForPlaces(sections[0], attributes)
        from_line = True
    if without and "without" not in said:
        return Refused(CITE_LINES["not_given"].format(what="Searching without towns"))
    # Cut to what one search reads by cite_input.build, which knows the first printing.
    window = (years[0], years[-1]) if years else None
    return CiteAsk(sections[0], attributes, places, window, ruled, from_line)


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


_OFFER_WORDS = {"owner": "the owner", "diameter": "the diameter", "status": "when it was built"}


def offer_line(attributes: list[str]) -> str:
    """The search card's title: "Search our sources for the owner, the diameter and
    when it was built"."""
    words = [_OFFER_WORDS.get(a, f"the {_what(a)}") for a in attributes]
    joined = words[0] if len(words) == 1 else f"{', '.join(words[:-1])} and {words[-1]}"
    return f"Search our sources for {joined}"


def looking_line(ask: CiteAsk, subject: str) -> str:
    what = " and the ".join(_what(a) for a in ask.attributes)
    if ask.from_line:
        places = (
            f", by the towns along its line ({', '.join(ask.places)}; name others to change them)"
        )
    else:
        places = f", by {', '.join(ask.places)}" if ask.places else ", with no towns"
    return (
        f"Searching our sources on the web for the {what} of {subject}{places}, for "
        f"{_years(ask.years)}. Our corpus of the journals is not available yet."
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
    """Where it was found: the document, its date when it has one and is not already in
    the title, and the source."""
    dated = f", {_day(f.date)}" if f.date and f.date not in f.title else ""
    return f"{f.title}{dated} ({f.source})"


def finding_sentence(f: Finding, subject: str) -> str:
    if f.in_store:
        lead = FOUND_IN_STORE.format(status=IN_STORE_WORDS[f.in_store])
    elif f.lead:
        lead = LEAD
    else:
        lead = IN_DOUBT if f.flags else FOUND
    if f.attribute == "built":
        said = f"{subject}, {f.date_words}"
    else:
        said = f"{f.value} as the {f.attribute} of {subject}, {f.date_words}"
    return one_full_stop(f"{lead}: {said}. {reference(f)}. Confidence {f.confidence:.2f}.")


def _date_words(claim: CiteClaim, printed: dt.date | None) -> str:
    if claim.attribute == "YearConstructed":
        year = claim.normalized.get("year") or claim.value
        return DATE_WORDS[claim.date_sense].format(year=year)
    return f"as of {_day(printed.isoformat())}" if printed else "in an undated document"


def _not_proposable(claim: CiteClaim, printed: dt.date | None, cutoff: float | None) -> str | None:
    """Why Propose is not offered, or None when it is."""
    if claim.kind == "lead":
        if "judge_unclear" in claim.flags:
            return "the reviewer was not sure the passage is about this section"
        below = f" ({cutoff:.2f})" if cutoff is not None else ""
        return f"its confidence, {claim.confidence:.2f}, is below what a finding needs{below}"
    if claim.attribute == "YearConstructed" and claim.date_sense == "by":
        return "the passage says only that the line was there by that year, not when it was built"
    if claim.attribute != "YearConstructed" and printed is None:
        return "the document has no date, so there is no date to record it as of"
    return None


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
        why_not = _not_proposable(claim, page.date, result.cutoff)
        finding = Finding(
            handle=f"F{next_handle + len(out)}",
            section_id=section_id,
            attribute=WORDS[store_key],
            value=claim.value,
            date_words=_date_words(claim, page.date),
            quote=page.page_text,
            source=page.source_name,
            title=page.title,
            date=page.date.isoformat() if page.date else None,
            url=page.url,
            confidence=claim.confidence,
            checks=[
                FindingCheck(label=CHECK_WORDS[c.name], passed=c.passed, note=c.note)
                for c in claim.checks
            ],
            lead=claim.kind == "lead",
            flags=[
                FindingFlag(flag=f, reason=claim.flag_reasons.get(f, "flagged by cite"))
                for f in claim.flags
            ],
            places_matched=page.places_matched,
            places_given=[p for p in page.places_matched if p in given],
            proposable=why_not is None,
            not_proposable=why_not,
        )
        out.append(
            {
                "finding": finding.model_dump(),
                "normalized": claim.normalized,
                "date_sense": claim.date_sense,
                "store_key": store_key,
                "document": page.document,
            }
        )
    return out


def mark_held(records: list[dict[str, Any]], features: list[dict[str, Any]]) -> None:
    """A finding store already holds says so, and is not offered to Propose."""
    for record in records:
        held = held_in_store(record, features)
        if held is not None:
            f = record["finding"]
            f["in_store"] = held["status"]
            f["proposable"] = False
            f["not_proposable"] = f"store already holds it ({IN_STORE_WORDS[held['status']]})"


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
        # A search that could not run says so, with what did and did not run: it is
        # never worded as "not found".
        return [
            Statement(kind="searched", text=text, refs=[feature])
            for text in [line, *searched_lines(result)]
        ]
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
        out.append(
            Statement(
                kind="searched",
                text=f"Searched, not found: the {_what(attribute)} of {subject}. "
                "Not found here does not mean it does not exist.",
                refs=[feature],
                attribute=attribute,
            )
        )
    # What was searched, step by step, whatever was found: corpus first, then the web.
    out += [
        Statement(kind="searched", text=line, refs=[feature]) for line in searched_lines(result)
    ]
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


def searched_lines(result: CiteResult) -> list[str]:
    """One line a step, in code's words: whether it ran, and what it covered."""
    lines = []
    for step in result.searched:
        lines.append(_corpus_line(step) if step.step == "corpus" else _web_line(step))
    refused = [n for n in result.not_read if n.source]
    if refused:
        n = len(refused)
        lines.append(
            f"Could not be read: {n} page{'' if n == 1 else 's'} a source refused or that "
            "holds no text. They are not counted as searched."
        )
    return lines


def _corpus_line(step: CiteSearchStep) -> str:
    if step.ran:
        return "Searched our corpus of the journals."
    return f"Our corpus of the journals: not searched, {step.why_not or 'not available'}."


def _web_line(step: CiteSearchStep) -> str:
    if not step.ran:
        return f"The web, our sources only: not searched, {step.why_not or 'not asked for'}."
    n = len(step.queries)
    read = [s for s in step.sources if s.pages_read]
    where = ", ".join(f"{s.name} ({s.pages_read})" for s in read) or "none"
    years = f" Years asked for: {_years(step.years)}." if step.years else ""
    words = "; ".join(step.queries)
    failed = (
        f" {len(step.errors)} kind{'' if len(step.errors) == 1 else 's'} of search error."
        if step.errors
        else ""
    )
    return one_full_stop(
        f"Searched the web, our sources only: {n} search{'' if n == 1 else 'es'}"
        f"{f' ({words})' if words else ''}. Pages read: {where}.{years}{failed}"
    )


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
