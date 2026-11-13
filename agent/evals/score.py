"""Is every statement of an answer backed by the world it was asked about?

This re-checks grounding on its own: it does not use the Agent's ledger, its renderer or
its grounding check, only the answer and the world. So a bug in the Agent's own check
cannot hide here.
"""

import calendar
import json
import re
from typing import Any

from evals.make_world import scope
from render import FIXED_LINES

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
        elif not backing and not [r for r in refs if r["type"] == "link"]:
            problems.append(f"{where}: rests on no claim or link")

        # Every number, quotation and name in the sentence must come from what it cites.
        source = json.dumps(backing, ensure_ascii=False) + " " + question
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
