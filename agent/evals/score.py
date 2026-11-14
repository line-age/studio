"""Is every statement of an answer backed by the world it was asked about?

This re-checks grounding on its own: it does not use the Agent's ledger, its renderer or
its grounding check, only the answer and the world. So a bug in the Agent's own check
cannot hide here.
"""

import calendar
import itertools
import json
import re
from typing import Any

from evals.make_world import scope
from render import FIXED_LINES, feature_name

# Words a sentence may capitalise without having read them from store.
VOCABULARY = {
    "Store",
    "Studio",
    "Agent",
    "Unknown",
    "I",
    "My",
    *calendar.month_name[1:],
}
_QUOTED = re.compile(r"[“\"]([^”\"]+)[”\"]")
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)


def _claims(world: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        c["id"]: {**c, "feature_id": fid}
        for fid, feature in world["features"].items()
        for c in feature["claims"]
    }


def _held(world: dict[str, Any], feature_id: str, attribute: str) -> bool:
    """Does store hold an accepted claim for this attribute, as `/missing` would see it?"""
    return any(
        c["attribute_key"] == attribute and c["status"] == "accepted"
        for fid in scope(world["links"], feature_id)
        for c in world["features"][fid]["claims"]
    )


def _printings(world: dict[str, Any]) -> list[int]:
    """The printings a reader of store can know of: years sections are first shown."""
    return sorted(
        {
            int(row["properties"]["time_start"][:4])
            for row in world["sections"]
            if row["properties"].get("time_start")
        }
    )


def _map_year(claim: dict[str, Any], role: str) -> int | None:
    """A map's year, read here on purpose and not through context.py: the score checks
    the Agent, so it must not share the Agent's code for what it checks."""
    for citation in claim.get("citations") or []:
        if citation.get("role") == role and str(citation.get("as_of_edtf") or "")[:4].isdigit():
            return int(citation["as_of_edtf"][:4])
    return None


def _shown_from(world: dict[str, Any], fid: str) -> int | None:
    """The earliest printing an accepted status claim cites as showing this feature."""
    years = [
        y
        for c in world["features"][fid]["claims"]
        if c["attribute_key"] == "status"
        and c["status"] == "accepted"
        and (y := _map_year(c, "map_shows"))
    ]
    return min(years) if years else None


def _gone_on(world: dict[str, Any], fid: str) -> int | None:
    """The printing a line traced as gone was traced on, from a claim not rejected."""
    return next(
        (
            y
            for c in world["features"][fid]["claims"]
            if c["status"] != "rejected" and (y := _map_year(c, "map_omits"))
        ),
        None,
    )


def _route(world: dict[str, Any], fid: str) -> list[list[float]]:
    return [
        line
        for c in world["features"][fid]["claims"]
        if c["attribute_key"] == "route" and c["status"] == "accepted"
        for line in c["value_geom"]["coordinates"]
    ]


def _near(p: list[float], lines: list[list[list[float]]], within: float = 50.0) -> bool:
    """Is a point within `within` m of the lines? Sampled every step of a segment, flat
    earth: its own way, not the Agent's."""
    import math

    kx = 111_320 * math.cos(math.radians(p[1]))
    for line in lines:
        for a, b in itertools.pairwise(line):
            steps = 400
            for n in range(steps + 1):
                x = a[0] + (b[0] - a[0]) * n / steps
                y = a[1] + (b[1] - a[1]) * n / steps
                if math.hypot((x - p[0]) * kx, (y - p[1]) * 110_574) <= within:
                    return True
    return False


def _touch(world: dict[str, Any], a: str, b: str) -> bool:
    ra, rb = _route(world, a), _route(world, b)
    ends = lambda r: [p for line in r for p in (line[0], line[-1])]
    return any(_near(p, rb) for p in ends(ra)) or any(_near(p, ra) for p in ends(rb))


def _same_pipe(world: dict[str, Any], fid: str) -> set[str]:
    return {
        end
        for link in world["links"]
        if fid in (link["from_feature_id"], link["to_feature_id"])
        and link["relation"] in ("same_as", "split_into", "overlaps")
        and link["status"] != "rejected"
        for end in (link["from_feature_id"], link["to_feature_id"])
    }


def _lead_problems(
    where: str, text: str, refs: list[dict[str, Any]], world: dict[str, Any]
) -> list[str]:
    """A lead about a neighbour rests on a section that really is drawn touching the one
    asked about, and never says what turns a clue into a claim. (That it is not in store
    is its kind, set by code.)"""
    problems = []
    claims = _claims(world)
    me = next((r["id"] for r in refs if r["type"] == "feature"), None)
    if "drawn touching" in text and me:
        for ref in refs:
            claim = claims.get(ref["id"]) if ref["type"] == "claim" else None
            if claim and not _touch(world, me, claim["feature_id"]):
                problems.append(f"{where}: the lead's section is not drawn touching it")
    for word in ("connected", "built in", "was built"):
        if word in text.lower():
            problems.append(f"{where}: a lead says {word!r}")
    return problems


def _worked_out_problems(
    where: str, text: str, refs: list[dict[str, Any]], world: dict[str, Any]
) -> tuple[list[str], list[str]]:
    """Every year a worked-out sentence names, worked out again here from the world. The
    years it may name, and what is wrong."""
    problems: list[str] = []
    allowed: list[str] = []
    claims, links = _claims(world), {link["id"]: link for link in world["links"]}
    for ref in refs:
        if ref["type"] == "claim" and ref["id"] in claims:
            fid = claims[ref["id"]]["feature_id"]
            first = _shown_from(world, fid)
            before = [y for y in _printings(world) if first and y < first]
            said = re.search(r"first traced on the (\d{4}) printing", text)
            if said and int(said.group(1)) != first:
                problems.append(f"{where}: first shown in {first}, not {said.group(1)}")
            said = re.search(r"not traced on the earlier (\d{4}) printing", text)
            if said and (not before or int(said.group(1)) != before[-1]):
                problems.append(f"{where}: the printing before is not {said.group(1)}")
            if first:
                allowed += [str(first), *(str(y) for y in before[-1:])]
        if ref["type"] == "link" and ref["id"] in links:
            gone = _gone_on(world, links[ref["id"]]["from_feature_id"])
            if gone:
                allowed.append(str(gone))
    features = [r["id"] for r in refs if r["type"] == "feature" and r["id"] in world["features"]]
    if "is drawn touching" in text and len(features) == 2 and not _touch(world, *features):
        problems.append(f"{where}: the two lines are not drawn touching")
    if "no section in store is drawn touching" in text and features:
        me = features[0]
        drawn = (
            {row["properties"]["section_id"] for row in world["sections"]}
            - _same_pipe(world, me)
            - {me}
        )
        if any(_touch(world, me, other) for other in drawn):
            problems.append(f"{where}: a section is drawn touching it")
    return problems, allowed


def ungrounded(answer: dict[str, Any], world: dict[str, Any], question: str = "") -> list[str]:
    """Every way the answer says something the world does not back. Empty means grounded."""
    problems: list[str] = []
    claims, links = _claims(world), {link["id"]: link for link in world["links"]}
    for n, statement in enumerate(answer.get("statements", [])):
        kind, text, refs = statement["kind"], statement["text"], statement.get("refs", [])
        where = f"statement {n + 1} ({kind})"
        if kind in ("refusal", "failure", "greeting", "clarify"):
            if text not in FIXED_LINES.values():
                problems.append(f"{where}: not a fixed line")
            if refs:
                problems.append(f"{where}: a fixed line carries a reference")
            continue

        backing = []
        for ref in refs:
            if ref["type"] == "claim":
                claim = claims.get(ref["id"])
                if claim is None:
                    problems.append(f"{where}: claim {ref['id']} is not in store")
                    continue
                if ref.get("status") != claim["status"]:
                    problems.append(
                        f"{where}: the claim is {claim['status']}, not {ref.get('status')}"
                    )
                backing.append(claim)
            elif ref["type"] == "link":
                if ref["id"] not in links:
                    problems.append(f"{where}: link {ref['id']} is not in store")
            elif ref["type"] == "feature":
                if ref["id"] not in world["features"]:
                    problems.append(f"{where}: feature {ref['id']} is not in store")
            else:
                problems.append(f"{where}: a {ref['type']} reference cannot be checked yet")

        if kind == "unknown":
            features = [r["id"] for r in refs if r["type"] == "feature"]
            attribute = statement.get("attribute")
            if not features or not attribute:
                problems.append(f"{where}: does not name the feature and attribute it checked")
            for fid in features:
                if fid in world["features"] and attribute and _held(world, fid, attribute):
                    problems.append(f"{where}: store does hold an accepted {attribute}")
        elif kind in ("worked_out", "lead"):
            if not refs:
                problems.append(f"{where}: worked out from nothing")
        elif kind == "citation_request":
            # Code's sentence about what it would ask for: it names the feature, no claim.
            if not [r for r in refs if r["type"] == "feature"]:
                problems.append(f"{where}: a citation request names no feature")
        elif not backing and not [r for r in refs if r["type"] == "link"]:
            problems.append(f"{where}: rests on no claim or link")

        # Every number, quotation and name in the sentence must come from what it cites.
        # A thing is named as Studio names it: its name, or "section" and its short id.
        named = {r["id"] for r in refs if r["type"] == "feature"} | {
            c["feature_id"] for c in backing
        }
        # A link names what it links.
        named |= {
            end
            for r in refs
            if r["type"] == "link" and r["id"] in links
            for end in (links[r["id"]]["from_feature_id"], links[r["id"]]["to_feature_id"])
        }
        # A claim on a trace merged into a section is said of that section.
        held = {c["feature_id"] for c in backing}
        named |= {f for f in world["features"] if held & set(scope(world["links"], f)) - {f}}
        names = [feature_name(world["features"][f]) for f in named if f in world["features"]]
        worked: list[str] = []
        if kind in ("worked_out", "lead"):
            wrong, worked = _worked_out_problems(where, text, refs, world)
            problems += wrong
        if kind == "lead":
            problems += _lead_problems(where, text, refs, world)
        source = " ".join([json.dumps(backing, ensure_ascii=False), question, *names, *worked])
        for number in re.findall(r"\d+(?:\.\d+)?", text):
            if number not in re.findall(r"\d+(?:\.\d+)?", source):
                problems.append(f"{where}: the number {number} is in no cited claim")
        for quoted in _QUOTED.findall(text):
            if quoted not in source.replace('\\"', '"'):
                problems.append(f"{where}: the quotation is in no cited claim: {quoted[:60]!r}")
        if _UUID.search(text):
            problems.append(f"{where}: an id is written in the text")
        plain = _QUOTED.sub("", text)
        for word in re.findall(r"(?<![.!?:] )(?<!^)\b[A-Z][A-Za-z]+", plain):
            if word not in VOCABULARY and word not in source:
                problems.append(f"{where}: the name {word!r} is in no cited claim")
    return problems
