"""Code checks. Each gives one feedback key, true or false, with why when false."""

from typing import Any

from pydantic import ValidationError

from evals.cases import Case, claim_id
from evals.score import ungrounded
from render import FIXED_LINES
from schemas import Answer

KEYS = (
    "valid",
    "no_ungrounded",
    "required",
    "forbidden",
    "unknown_kept",
    "tools_ok",
    "fixed_line",
)


def _ref_ids(answer: dict[str, Any]) -> set[str]:
    return {r["id"] for s in answer["statements"] for r in s.get("refs", [])}


def check(case: Case, world: dict[str, Any], outputs: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every feedback key for one run of one case, and `case_passed`."""
    answer, tools = outputs.get("answer"), outputs.get("tools") or []
    why: dict[str, list[str]] = {key: [] for key in KEYS}

    try:
        if answer is None:
            raise ValueError("no answer")
        if not Answer.model_validate(answer).checked:
            why["valid"].append("the answer was not checked")
    except (ValidationError, ValueError) as exc:
        why["valid"].append(f"not a valid answer: {str(exc)[:200]}")
        answer = {"statements": []}

    kinds = [s["kind"] for s in answer["statements"]]
    text = "\n".join(s["text"] for s in answer["statements"])
    refs = _ref_ids(answer)
    must, must_not = case.must, case.must_not

    why["no_ungrounded"] += ungrounded(answer, world, case.question["words"])

    if "first_kind" in must and kinds[:1] != [must["first_kind"]]:
        why["required"].append(f"the first statement is {kinds[:1]}, not {must['first_kind']}")
    for kind in must.get("kinds", []):
        if kind not in kinds:
            why["required"].append(f"no {kind} statement")
    for selector in must.get("refs", []):
        if claim_id(world, selector) not in refs:
            why["required"].append(f"does not rest on {selector}")
    for words in must.get("text", []):
        if words not in text:
            why["required"].append(f"does not say {words!r}")

    for kind in must_not.get("kinds", []):
        if kind in kinds:
            why["forbidden"].append(f"has a {kind} statement")
    for selector in must_not.get("refs", []):
        if claim_id(world, selector) in refs:
            why["forbidden"].append(f"rests on {selector}")
    for words in must_not.get("text", []):
        if words.lower() in text.lower():
            why["forbidden"].append(f"says {words!r}")

    for unknown in must.get("unknown", []):
        feature = world["codes"][unknown["feature"]]
        said = [
            s
            for s in answer["statements"]
            if s["kind"] == "unknown"
            and s.get("attribute") == unknown["attribute"]
            and feature in {r["id"] for r in s.get("refs", [])}
        ]
        if not said:
            why["unknown_kept"].append(
                f"does not say store has no {unknown['attribute']} for {unknown['feature']}"
            )
        elif not said[0]["text"].startswith("Store does not say"):
            why["unknown_kept"].append('the statement does not open with "Store does not say"')

    for tool in must.get("tools", []):
        if tool not in tools:
            why["tools_ok"].append(f"did not call {tool}")
    for tool in must_not.get("tools", []):
        if tool == "*" and tools:
            why["tools_ok"].append(f"called a tool: {tools}")
        elif tool in tools:
            why["tools_ok"].append(f"called {tool}")

    if "fixed_line" in must:
        line = FIXED_LINES[must["fixed_line"]]
        if [s["text"] for s in answer["statements"]] != [line]:
            why["fixed_line"].append(f"the answer is not exactly the line {must['fixed_line']!r}")

    feedback = {
        key: {"score": not reasons, "comment": "; ".join(reasons)} for key, reasons in why.items()
    }
    failed = [key for key, value in feedback.items() if not value["score"]]
    feedback["case_passed"] = {"score": not failed, "comment": ", ".join(failed)}
    return feedback
