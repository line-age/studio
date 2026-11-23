"""A behaviour's cases as a table a person can read and judge, with no model.

    uv run python -m evals.review B01 [B02 ...] > review.md

For each case: the question (and the turns before it), what the invented world holds for
the things attached, what the answer must and must not hold, and the note. The person
fixes or strikes a case in its `.jsonl` file and sets `labeled_by` to `person`.
"""

import argparse
import json
from typing import Any

from evals.cases import Case, load
from evals.fake_store import load_world


def _value(claim: dict[str, Any]) -> str:
    if claim.get("value_text"):
        return claim["value_text"]
    if claim.get("value_num") is not None:
        return f"{claim['value_num']:g} {claim.get('value_unit') or ''}".strip()
    if claim.get("value_geom"):
        return "a drawn line"
    if claim.get("value_feature_id"):
        return "a link"
    return "?"


def holds(world: dict[str, Any], code: str) -> str:
    """What the world holds for one code: its claims as `attribute value (status, when)`."""
    if code not in world["codes"]:
        return f"{code}: not in the world"
    feature = world["features"][world["codes"][code]]
    parts = []
    for c in feature["claims"]:
        when = c.get("valid_edtf") or "no date"
        sources = ", ".join(
            f"{x.get('source_title') or 'a source'} {x.get('as_of_edtf') or x.get('published_edtf') or ''}".strip()
            for x in c.get("citations") or []
        )
        cited = f", cited to {sources}" if sources else ", no citation"
        parts.append(f"{c['attribute_key']} {_value(c)} ({c['status']}, {when}{cited})")
    label = feature.get("label")
    head = f"{code}" + (f' "{label}"' if label else "")
    return f"{head}: " + ("; ".join(parts) if parts else "no claims")


def _codes(question: dict[str, Any]) -> list[str]:
    codes = []
    for item in question.get("about", []):
        if "code" in item:
            codes.append(item["code"].split(".")[0])
        elif "id" in item:
            codes.append(f"id {item['id'][:8]} (not in store)")
    return codes


def _asked(question: dict[str, Any]) -> str:
    words = question["words"]
    action = question.get("action")
    if action:
        words += f" [button: {action.get('kind', json.dumps(action))}]"
    attached = ", ".join(_codes(question)) or "nothing"
    return f'"{words}" (attached: {attached})'


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def _checks(checks: dict[str, Any]) -> str:
    return "; ".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in checks.items())


def table(cases: list[Case]) -> str:
    rows = [
        "| Case | Asked | World holds | Must | Must not | Note |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for case in cases:
        world = load_world(case.world)
        asked = " then ".join(_asked(q) for q in (*case.turns, case.question))
        codes = []
        for q in (*case.turns, case.question):
            codes += [c for c in _codes(q) if c in world["codes"] and c not in codes]
        held = "<br>".join(holds(world, c) for c in codes) or "nothing attached"
        mark = case.id + ("" if case.split == "dev" else " (held out)")
        mark += "" if case.labeled_by == "person" else " draft"
        rows.append(
            "| "
            + " | ".join(
                _cell(x)
                for x in (mark, asked, held, _checks(case.must), _checks(case.must_not), case.note)
            )
            + " |"
        )
    return "\n".join(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("behaviours", nargs="+", help="B01 B02 ...")
    args = parser.parse_args()
    for behaviour in args.behaviours:
        cases = [c for c in load() if c.behaviour == behaviour]
        print(f"## {behaviour} ({len(cases)} cases)\n")
        print(table(cases) + "\n")


if __name__ == "__main__":
    main()
