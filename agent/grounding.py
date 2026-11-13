"""The grounding check: is every statement of a rendered answer backed by what store
returned in this run? Code, not the prompt. An answer that fails is not shown.

The ledger is the tool results of this run, recorded when the tools ran: never messages,
summaries or files from an earlier turn.
"""

import re
from typing import Any

from render import FIXED_LINES, SLOT, UNKNOWN_OPENING, Read
from schemas import Answer, Draft

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
_QUOTE = re.compile(r"[\"“”‘’]|''")
# Words the model may capitalise in its own text.
VOCABULARY = {
    "Store",
    "Studio",
    "Agent",
    "Unknown",
    "Nobody",
    "One",
    "Two",
    "Its",
    "It",
    "The",
    "A",
    "An",
    "This",
    "That",
    "These",
    "Those",
    "Both",
    "Each",
    "No",
    "There",
    "Neither",
    "Owner",
    "Operator",
    "Diameter",
    "Name",
    "Status",
    "Route",
    "I",
    "He",
    "She",
    "They",
    "Another",
}


def own_words_problems(draft: Draft, question: str) -> list[str]:
    """What the model wrote outside slots: no digit, quotation, id or unknown name."""
    problems = []
    allowed = VOCABULARY | set(re.findall(r"[A-Z][A-Za-z]+", question))
    for n, statement in enumerate(draft.statements, 1):
        own = SLOT.sub("", statement.text)
        if re.search(r"\d", own):
            problems.append(f"statement {n}: a number in your own words; use a slot")
        if _QUOTE.search(own):
            problems.append(f"statement {n}: a quotation in your own words; use {{c1.quote}}")
        if _UUID.search(own):
            problems.append(f"statement {n}: an id written in the text; put it in refs")
        # A capital that only opens a sentence is not a name.
        names = re.findall(r"(?<!^)(?<![.!?:;] )\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*", own.strip())
        unknown = [w for w in names if any(part not in allowed for part in w.split())]
        if unknown:
            problems.append(
                f"statement {n}: names in your own words ({', '.join(unknown)}); use a slot"
            )
    return problems


def answer_problems(answer: Answer, read: Read) -> list[str]:
    """What the rendered answer says that this run's reads do not back."""
    problems = []
    fixed = [
        s for s in answer.statements if s.kind in ("refusal", "failure", "greeting", "clarify")
    ]
    if fixed and len(answer.statements) > 1:
        problems.append(
            f"a {fixed[0].kind} statement must be the whole answer; leave it out or answer "
            "with it alone"
        )
    for n, statement in enumerate(answer.statements, 1):
        kind, refs = statement.kind, statement.refs
        if kind in ("refusal", "failure", "greeting", "clarify"):
            if statement.text not in FIXED_LINES.values() or refs:
                problems.append(f"statement {n}: a fixed line was changed")
            continue
        for ref in refs:
            if ref.type == "claim":
                claim = read.claims.get(ref.id)
                if claim is None or claim["status"] != ref.status:
                    problems.append(f"statement {n}: claim {ref.id} was not read in this run")
            elif ref.type == "feature" and ref.id not in read.features:
                problems.append(f"statement {n}: feature {ref.id} was not read in this run")
        if kind == "fact" and not any(r.type in ("claim", "link") for r in refs):
            problems.append(f"statement {n}: a fact must name the claim it rests on")
        if kind == "unknown":
            if not statement.text.startswith(UNKNOWN_OPENING):
                problems.append(f'statement {n}: an unknown starts with "{UNKNOWN_OPENING}"')
            features = [r.id for r in refs if r.type == "feature"]
            if not features or not statement.attribute:
                problems.append(
                    f"statement {n}: an unknown names the feature it read and the attribute"
                )
            for fid in features:
                held = read.accepted(fid, statement.attribute or "")
                if held:
                    problems.append(
                        f"statement {n}: store does hold an accepted {statement.attribute} "
                        f"for this feature (claim {held[0]})"
                    )
    return problems


def problems_of(draft: Draft, answer: Answer, read: Read, question: str) -> list[str]:
    return own_words_problems(draft, question) + answer_problems(answer, read)


def reads_from(artifacts: list[dict[str, Any]]) -> Read:
    read = Read()
    for artifact in artifacts:
        for feature in artifact.get("features", []):
            read.feature(feature)
        merged = artifact.get("features", [])[1:]
        if merged:
            read.merge(artifact["features"][0]["id"], [m["id"] for m in merged])
    return read
