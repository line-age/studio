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
    "search",
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

    # After a write, the world as store holds it then; and every word the person wrote.
    seen = outputs.get("world_after") or world
    words = " ".join([*outputs.get("words", []), case.question["words"]])
    why["no_ungrounded"] += ungrounded(answer, seen, words, outputs.get("cite_results"))

    # A change offer changes only what the person attached (D4, D5).
    attached = {
        i.get("id") or world["codes"].get(i.get("code"), "") for i in case.question.get("about", [])
    }
    for statement in answer["statements"]:
        offer = statement.get("change") or {}
        for sid in [*(offer.get("section_ids") or []), *(offer.get("left_out") or [])]:
            if sid not in attached:
                why["forbidden"].append(f"the offer changes {sid}, which was not attached")

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

    if "max_statements" in must and len(kinds) > must["max_statements"]:
        why["required"].append(f"{len(kinds)} statements, more than {must['max_statements']}")
    if "carried" in must and bool(answer.get("carried")) != must["carried"]:
        why["required"].append(
            "does not say it is about the last question's things"
            if must["carried"]
            else "says it is about the last question's things"
        )

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
        elif not (
            said[0]["text"].startswith("No source says")
            or said[0]["text"].endswith("is not decided yet.")
        ):
            why["unknown_kept"].append(
                'the statement neither opens with "No source says" nor ends "is not decided yet."'
            )

    for tool in must.get("tools", []):
        if tool not in tools:
            why["tools_ok"].append(f"did not call {tool}")
    for tool in must_not.get("tools", []):
        if tool == "*" and tools:
            why["tools_ok"].append(f"called a tool: {tools}")
        elif tool in tools:
            why["tools_ok"].append(f"called {tool}")

    if "writes" in must and outputs.get("writes", 0) != must["writes"]:
        why["search"].append(f"store took {outputs.get('writes', 0)} bundles, not {must['writes']}")
    sent = outputs.get("cite_inputs") or []
    for key, value in (must.get("cite_sent") or {}).items():
        if not sent or sent[-1].get(key) != value:
            got = sent[-1].get(key) if sent else "nothing (cite was not asked)"
            why["search"].append(f"cite was sent {key}={got!r}, not {value!r}")
    if must_not.get("cite") and sent:
        why["search"].append(f"cite was asked {len(sent)} time(s)")

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
