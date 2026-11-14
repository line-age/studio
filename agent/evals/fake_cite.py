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

from cite_client import CiteBusy

JOURNAL = "The Example Trade Journal"
LINES = ["searching 6 planned queries", "reading The Example Trade Journal, 1931-03-12, p.41"]


def citation(
    n: int, date: str, page: str, text: str, places: list[str] | None = None
) -> dict[str, Any]:
    return {
        "id": f"sim_example-trade-journal_{date}_12_{n}:40:3-24",
        "journal": JOURNAL,
        "issue_id": f"sim_example-trade-journal_{date}_12_{n}",
        "date": date,
        "volume": 12,
        "number": n,
        "leaf": 40,
        "printed_page": page,
        "printed_page_confidence": 95.0,
        "quote": text,
        "page_text": text,
        "url": f"https://example.org/details/example-trade-journal-{date}/page/n40",
        "image_url": f"https://example.org/download/example-trade-journal-{date}/page/n40.jpg",
        "page_width": 3600,
        "page_height": 5000,
        "highlight": [{"x0": 0.1, "y0": 0.3, "x1": 0.6, "y1": 0.32}],
        "places_matched": places or [],
    }


def claim(
    attribute: str,
    value: str,
    normalized: dict[str, Any],
    cites: dict[str, Any],
    sense: str = "laying",
    flags: dict[str, str] | None = None,
) -> dict[str, Any]:
    flags = flags or {}
    return {
        "id": f"{attribute}:{value}:{cites['id']}",
        "attribute": attribute,
        "value": value,
        "normalized": normalized,
        "date_sense": sense,
        "status": "flagged" if flags else "verified",
        "flags": list(flags),
        "flag_reasons": flags,
        "citation_ids": [cites["id"]],
    }


def searched(attribute: str, issues: int = 104) -> dict[str, Any]:
    return {
        "attribute": attribute,
        "journal": JOURNAL,
        "searches": 9,
        "issues_read": issues,
        "first_issue": "1930-01-02",
        "last_issue": "1931-12-24",
    }


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
    return {
        "schema_version": "0.3",
        "status": status,
        "reason": "" if status == "ok" else "invented failure",
        "section": copy.deepcopy(section),
        "citations": citations,
        "claims": [c for c in claims if c["attribute"] in asked],
        "unknowns": [
            {"attribute": a, "note": "No verified passage."} for a in asked if a not in found
        ],
        "attempts": attempts or [],
        "searched": [searched(a) for a in asked],
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
            c["status"] = "flagged"
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
            flags={
                "judge_unclear": "the passage could be about the branch line",
                "location_unconfirmed": "none of the section's places is in the quote",
            },
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


def failed(section: dict[str, Any]) -> dict[str, Any]:
    return result(section, [], [], status="failed")


SCRIPTS: dict[str, Script] = {
    "owner_found": owner_found,
    "nothing_found": nothing_found,
    "two_diameters": two_diameters,
    "built_by": built_by,
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
