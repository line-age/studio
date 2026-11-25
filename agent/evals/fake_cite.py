"""A cite that answers from a script, for tests and evals. Invented data only.

It has the real client's shape (`start`, `get`, and runs that are polled), so the graph
runs against it unchanged. Each search takes the next scripted result, made for the
section it was asked about, and gives its step lines over a few polls. It keeps every
input it was sent, so a test can check what reached cite (places, years, ruled out).
"""

import copy
import uuid
from collections.abc import Callable
from typing import Any

from src.clients.cite_client import CiteBusy

JOURNAL = "The Example Trade Journal"
SOURCE = {"domain": "example.org", "name": "Example Archive"}
LINES = [
    "corpus: not available yet",
    "searching the web: Sampleton Exampleville pipe line 1931 (4 results)",
    "reading The Example Trade Journal 1931-03-12: Vol 12 Iss 3",
]
CUTOFF = 0.6
WEIGHTS = {
    "quote_on_page": 0.40,
    "company_near": 0.20,
    "town_near": 0.15,
    "date_fits": 0.10,
    "second_source": 0.15,
}


def citation(
    n: int, date: str | None, page: str, text: str, places: list[str] | None = None
) -> dict[str, Any]:
    """A quote on an invented journal issue; `page` only tells two quotes apart."""
    item = f"example-trade-journal-{date or 'undated'}-{n}"
    return {
        "id": f"{item}:{page}",
        "source": SOURCE["domain"],
        "source_name": SOURCE["name"],
        "document": f"https://example.org/details/{item}",
        "title": f"{JOURNAL} {date}: Vol 12 Iss {n}" if date else JOURNAL,
        "date": date,
        "quote": text,
        "page_text": text,
        "passage": text,
        "url": f"https://example.org/details/{item}?q=%22{page}%22",
        "places_matched": places or [],
    }


def checks(**passed: bool) -> list[dict[str, Any]]:
    """The five checks, the quote always on the page; the rest pass unless said."""
    out = []
    for name, weight in WEIGHTS.items():
        ok = True if name == "quote_on_page" else passed.get(name, name != "second_source")
        out.append({"name": name, "passed": ok, "adds": weight if ok else 0.0, "note": ""})
    return out


def claim(
    attribute: str,
    value: str,
    normalized: dict[str, Any],
    cites: dict[str, Any],
    sense: str = "laying",
    flags: dict[str, str] | None = None,
    **passed: bool,
) -> dict[str, Any]:
    flags = flags or {}
    behind = checks(**passed)
    confidence = round(sum(c["adds"] for c in behind), 2)
    lead = confidence < CUTOFF or "judge_unclear" in flags
    return {
        "id": f"{attribute}:{value}:{cites['id']}",
        "attribute": attribute,
        "value": value,
        "normalized": normalized,
        "date_sense": sense,
        "kind": "lead" if lead else "finding",
        "confidence": confidence,
        "checks": behind,
        "flags": list(flags),
        "flag_reasons": flags,
        "citation_ids": [cites["id"]],
    }


def searched(section: dict[str, Any], citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The two steps of every search: corpus, not available yet, then the web."""
    window = section.get("search_window") or {}
    years = [window["from"], window["to"]] if window else None
    places = " ".join(section.get("places") or [])
    read = len({c["document"] for c in citations}) or 2
    return [
        {"step": "corpus", "ran": False, "why_not": "not available yet"},
        {
            "step": "web",
            "ran": True,
            "queries": [f"{places} pipe line".strip(), f"{places} gas line laid".strip()],
            "sources": [{**SOURCE, "results": 7, "pages_read": read, "not_read": 0}],
            "pages_read": read,
            "years": years,
        },
    ]


def result(
    section: dict[str, Any],
    claims: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    attempts: list[dict[str, Any]] | None = None,
    status: str = "ok",
) -> dict[str, Any]:
    """A cite result for the section asked about: every asked attribute with no claim
    comes back unknown, with what was searched."""
    found = {c["attribute"] for c in claims}
    asked = section.get("attributes") or ["YearConstructed", "Ownership", "Size", "LineType"]
    steps = searched(section, citations)
    if status != "ok":
        steps[1] = {"step": "web", "ran": False, "why_not": "the search failed"}
    return {
        "schema_version": "0.4",
        "status": status,
        "reason": "" if status == "ok" else "invented failure",
        "section": copy.deepcopy(section),
        "citations": citations,
        "claims": [c for c in claims if c["attribute"] in asked],
        "unknowns": [
            {"attribute": a, "note": "No verified passage."} for a in asked if a not in found
        ],
        "attempts": attempts or [],
        "searched": steps,
        "not_read": [],
        "limits": {
            "web_searches": {"used": 2, "allowed": 6},
            "pages_read": {"used": steps[1].get("pages_read", 0), "allowed": 6},
            "model_calls": {"used": 5, "allowed": 10},
        },
        "cutoff": CUTOFF,
    }


# A script answers a section: (section) -> cite result.
Script = Callable[[dict[str, Any]], dict[str, Any]]


def owner_found(section: dict[str, Any]) -> dict[str, Any]:
    """The owner and diameter, found on one page; built as laying in 1931."""
    places = section.get("places") or []
    text = (
        f"The Example Pipe Line Co. is laying a 10-in. line from "
        f"{' to '.join(places) or 'the field'}."
    )
    page = citation(3, "1931-03-12", "41", text, places[:2])
    claims = [
        claim("Ownership", "Example Pipe Line Co.", {"owner": "example pipe line"}, page),
        claim("Size", "10-in.", {"inches": 10.0}, page),
        claim("YearConstructed", "1931", {"year": 1931, "basis": "issue_date"}, page),
    ]
    if not places:
        reason = "no place names were given, so the passage was matched on name only"
        for c in claims:
            c["flags"], c["flag_reasons"] = (
                ["low_confidence_no_places"],
                {"low_confidence_no_places": reason},
            )
    ruled = {(r["attribute"], r["value"]) for r in section.get("ruled_out") or []}
    attempts = [
        {
            "claim": {"attribute": c["attribute"], "value": c["value"]},
            "stage": "ruled_out",
            "reason": "this value was ruled out before the run",
        }
        for c in claims
        if (c["attribute"], c["value"]) in ruled
    ]
    kept = [c for c in claims if (c["attribute"], c["value"]) not in ruled]
    return result(section, kept, [page] if kept else [], attempts)


def nothing_found(section: dict[str, Any]) -> dict[str, Any]:
    attempt = {
        "claim": {"attribute": "Ownership", "value": "Other Gas Co."},
        "stage": "judge",
        "reason": "the passage is about another line",
    }
    outage = {
        "claim": {"attribute": "Ownership", "value": "Other Gas Co."},
        "stage": "judge",
        "reason": "reviewer unavailable (TimeoutError); try again later",
    }
    return result(section, [], [], [attempt, outage])


def two_diameters(section: dict[str, Any]) -> dict[str, Any]:
    """Two pages that disagree on the diameter; one flagged by the reviewer."""
    places = section.get("places") or []
    one = citation(3, "1931-03-12", "41", "A 10-in. line is being laid to Sampleton.", places[:1])
    two = citation(9, "1931-05-07", "18", "The 12-in. line to Sampleton is in operation.")
    claims = [
        claim("Size", "10-in.", {"inches": 10.0}, one),
        claim(
            "Size",
            "12-in.",
            {"inches": 12.0},
            two,
            sense="in_operation",
            flags={"judge_unclear": "the passage could be about the branch line"},
            town_near=False,
        ),
    ]
    return result(section, claims, [one, two])


def built_by(section: dict[str, Any]) -> dict[str, Any]:
    """A build date the passage gives only as "by": shown, never proposed."""
    page = citation(5, "1930-06-05", "77", "The line to Sampleton, built in 1929, carries gas.")
    return result(
        section,
        [claim("YearConstructed", "1929", {"year": 1929, "basis": "quote"}, page, sense="by")],
        [page],
    )


def weak_lead(section: dict[str, Any]) -> dict[str, Any]:
    """An owner on an undated page that names no town of the section and no company
    known for it: the quote is there, little ties it to the section. A lead."""
    page = citation(7, None, "12", "The Other Gas Co. owns a line in the district.")
    lead = claim(
        "Ownership",
        "Other Gas Co.",
        {"owner": "other gas"},
        page,
        company_near=False,
        town_near=False,
        date_fits=False,
    )
    return result(section, [lead], [page])


def failed(section: dict[str, Any]) -> dict[str, Any]:
    return result(section, [], [], status="failed")


SCRIPTS: dict[str, Script] = {
    "owner_found": owner_found,
    "nothing_found": nothing_found,
    "two_diameters": two_diameters,
    "built_by": built_by,
    "weak_lead": weak_lead,
    "failed": failed,
}


class _FakeRun:
    def __init__(self, outcome: dict[str, Any] | None, lines: list[str], polls: int) -> None:
        self.id = str(uuid.uuid4())
        self._outcome = outcome
        self._lines = list(lines)
        self._polls = polls
        self.cancelled = False
        self.touches = 0

    def touch(self) -> None:
        self.touches += 1

    def take_lines(self) -> list[str]:
        self._polls -= 1
        return [self._lines.pop(0)] if self._lines else []

    def done(self) -> bool:
        return self.cancelled or (self._polls <= 0 and not self._lines)

    def result(self) -> dict[str, Any] | None:
        return None if self.cancelled else self._outcome

    def error(self) -> str | None:
        if self.cancelled:
            return "stopped"
        return None if self._outcome is not None else "cite could not be reached (ConnectError)"

    def cancel(self) -> None:
        self.cancelled = True


class FakeCite:
    """Answers each search with the next script ("owner_found" by default)."""

    def __init__(self, *scripts: str, polls: int = 2, unreachable: bool = False) -> None:
        self.scripts = list(scripts)
        self.polls = polls
        self.unreachable = unreachable
        self.inputs: list[dict[str, Any]] = []
        self.runs: dict[str, _FakeRun] = {}
        self.busy = False

    def start(self, section: dict[str, Any]) -> _FakeRun:
        if self.busy:
            raise CiteBusy("a search is already running")
        self.inputs.append(copy.deepcopy(section))
        name = self.scripts.pop(0) if self.scripts else "owner_found"
        outcome = None if self.unreachable else SCRIPTS[name](section)
        run = _FakeRun(outcome, LINES, self.polls)
        self.runs[run.id] = run
        return run

    def get(self, run_id: str) -> _FakeRun | None:
        return self.runs.get(run_id)
