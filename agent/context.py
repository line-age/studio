"""What code works out about one section from store: the section pack.

Editions (B17) now; links (B18), neighbours (B19) and leads (B20) follow. Every sentence
here is code's. The model picks them by handle (W1, L1) and writes none of their words,
so nothing worked out can be passed off as a claim (plan D1).

A map printing only says a line was drawn. "First traced on the 1932 printing" is never
a build date, and a printing that is not traced as removing a line does not prove the
line was still there.
"""

import re
import threading
import time
import weakref
from collections.abc import Callable
from typing import Any

from render import feature_name, is_traced_as_gone
from schemas import WorkedOut
from store_client import MAX_LIMIT, StoreError

# The list of printings is the network's, not a question's: kept a while, not per run.
EDITIONS_TTL_SECONDS = 600
_editions: "weakref.WeakKeyDictionary[Any, tuple[float, list[int]]]" = weakref.WeakKeyDictionary()
_editions_lock = threading.Lock()

_YEAR = re.compile(r"(\d{4})")


def edition_years(store: Any) -> list[int]:
    """The map printings store has traced, as years: every year a section is first
    shown. Store keeps no list of sources, so a printing that first shows nothing is
    missing here; nothing below says more than this list holds."""
    key = getattr(store, "origin", store)
    with _editions_lock:
        kept = _editions.get(key)
        if kept and time.monotonic() - kept[0] < EDITIONS_TTL_SECONDS:
            return kept[1]
    rows = store.sections(limit=MAX_LIMIT).rows
    years = sorted(
        {
            int(m.group(1))
            for row in rows
            if (m := _YEAR.match(str(row["properties"].get("time_start") or "")))
        }
    )
    with _editions_lock:
        _editions[key] = (time.monotonic(), years)
    return years


def map_year(claim: dict[str, Any], role: str) -> int | None:
    """The year of the printing a claim is cited to in this role, if any."""
    for citation in claim.get("citations") or []:
        if citation.get("role") != role:
            continue
        found = _YEAR.match(str(citation.get("as_of_edtf") or citation.get("published_edtf") or ""))
        if found:
            return int(found.group(1))
    return None


def first_shown(feature: dict[str, Any]) -> tuple[int, dict[str, Any]] | None:
    """The earliest printing an accepted status claim says shows the section, with that
    claim. Only status: a route is traced off some map, and that is not a date."""
    shown = [
        (year, claim)
        for claim in feature.get("claims") or []
        if claim["attribute_key"] == "status"
        and claim["status"] == "accepted"
        and (year := map_year(claim, "map_shows"))
    ]
    return min(shown, key=lambda pair: pair[0]) if shown else None


def removal_links(feature: dict[str, Any]) -> list[dict[str, Any]]:
    """Links that may end the section: a same_as or overlaps from another feature to it,
    not rejected. Whether the other end is a line traced as gone is read, not assumed."""
    return [
        link
        for link in feature.get("links") or []
        if link["relation"] in ("same_as", "overlaps")
        and link.get("to_feature_id") == feature["id"]
        and link["status"] != "rejected"
    ]


def edition_facts(
    feature: dict[str, Any],
    others: dict[str, dict[str, Any]],
    years: list[int],
    handle: Callable[[], str],
) -> list[WorkedOut]:
    """When the maps first show the section, and what store holds about its end."""
    name = feature_name(feature)
    facts: list[WorkedOut] = []

    first = first_shown(feature)
    if first:
        year, claim = first
        before = [y for y in years if y < year]
        text = f"Worked out from the maps in store: {name} is first traced on the {year} printing"
        text += f", and not on the {before[-1]} printing before it." if before else "."
        facts.append(
            WorkedOut(handle=handle(), what="first_edition", text=text, rests_on=[claim["id"]])
        )

    ended = False
    for link in removal_links(feature):
        gone = others.get(link["from_feature_id"])
        if gone is None or not is_traced_as_gone(gone):
            continue
        year = next((y for c in gone.get("claims") or [] if (y := map_year(c, "map_omits"))), None)
        on = f"on the {year} printing" if year else "on a later printing"
        part = "the same pipe as" if link["relation"] == "same_as" else "along part of"
        if link["status"] == "confirmed":
            ended = ended or link["relation"] == "same_as"
            shows = (
                "that printing is the first in store not to show it"
                if link["relation"] == "same_as"
                else "that printing no longer shows that part"
            )
            text = (
                f"Worked out from a confirmed link: a line traced as gone {on} is {part} "
                f"{name}, so {shows}."
            )
        else:
            text = (
                f"It is proposed, and not yet decided, that a line traced as gone {on} "
                f"is {part} {name}. Until someone decides, when it ended stays Unknown."
            )
        facts.append(WorkedOut(handle=handle(), what="removal", text=text, rests_on=[link["id"]]))

    if not ended:
        facts.append(
            WorkedOut(
                handle=handle(),
                what="not_traced_later",
                text=(
                    f"Store does not say when {name} ended. No line traced as gone is "
                    "confirmed for it, which is no proof that it lasted."
                ),
                rests_on=[feature["id"]],
            )
        )
    return facts


def read_ends(store: Any, feature: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The features at the far end of the links that may end the section."""
    ends: dict[str, dict[str, Any]] = {}
    for link in removal_links(feature):
        fid = link["from_feature_id"]
        try:
            ends[fid] = store.feature(fid)
        except StoreError as error:
            if error.kind not in ("not_found", "bad_request"):
                raise
    return ends
