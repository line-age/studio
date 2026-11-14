"""Read a run: a table, the gates, and the case-by-case difference from another run.

A change is judged case by case, never by the average: a case that passed and now fails
is a regression even when the score went up.
"""

import json
import statistics
import tomllib
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
GATES = tomllib.loads((HERE / "gate.toml").read_text())["gates"]


def passed(case: dict[str, Any]) -> bool:
    """A case passes when more than half of its repeats did."""
    repeats = case["repeats"]
    return sum(r["feedback"]["case_passed"]["score"] for r in repeats) * 2 > len(repeats)


def summary(report: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for case_id, case in sorted(report["cases"].items()):
        repeats = case["repeats"]
        failed = sorted(
            {
                key
                for r in repeats
                for key, value in r["feedback"].items()
                if key != "case_passed" and not value["score"]
            }
        )
        rows.append(
            {
                "id": case_id,
                "behaviour": case["behaviour"],
                "split": case["split"],
                "reviewed": case["labeled_by"] == "person",
                "passes": sum(r["feedback"]["case_passed"]["score"] for r in repeats),
                "repeats": len(repeats),
                "passed": passed(case),
                "failed": failed,
            }
        )
    return rows


def compare(now: dict[str, Any], before: dict[str, Any] | None) -> dict[str, list[str]]:
    if before is None:
        return {"regressed": [], "fixed": [], "new": sorted(now["cases"])}
    old, new = before["cases"], now["cases"]
    return {
        "regressed": sorted(c for c in new if c in old and passed(old[c]) and not passed(new[c])),
        "fixed": sorted(c for c in new if c in old and not passed(old[c]) and passed(new[c])),
        "new": sorted(c for c in new if c not in old),
    }


def speed(report: dict[str, Any]) -> dict[str, float]:
    """Median seconds per answer: about one attached thing ("one"), about ten or more
    ("ten"). Only repeats that were timed count."""
    buckets: dict[str, list[float]] = {}
    for case in report["cases"].values():
        attached = case.get("attached")
        bucket = "one" if attached == 1 else "ten" if (attached or 0) >= 10 else None
        if bucket is None:
            continue
        buckets.setdefault(bucket, []).extend(
            r["seconds"] for r in case["repeats"] if r.get("seconds") is not None
        )
    return {k: statistics.median(v) for k, v in buckets.items() if v}


def gates(now: dict[str, Any], before: dict[str, Any] | None) -> list[str]:
    """Every gate that does not hold. Empty means the change may be kept."""
    broken = []
    ungrounded = [
        case_id
        for case_id, case in now["cases"].items()
        for r in case["repeats"]
        if not r["feedback"]["no_ungrounded"]["score"]
    ]
    if len(ungrounded) > GATES["ungrounded_max"]:
        broken.append(f"ungrounded statements in {sorted(set(ungrounded))}")
    for row in summary(now):
        if not row["reviewed"]:
            continue
        case = now["cases"][row["id"]]
        forbidden = sum(not r["feedback"]["forbidden"]["score"] for r in case["repeats"])
        if forbidden > GATES["forbidden_max_reviewed"]:
            broken.append(f"{row['id']}: something forbidden in {forbidden} repeat(s)")
        if GATES["majority_reviewed"] and not row["passed"]:
            broken.append(f"{row['id']}: reviewed, and did not pass a majority of repeats")
    p50 = speed(now)
    if p50.get("one", 0) > GATES["one_p50_seconds"]:
        broken.append(f"one section: {p50['one']:.1f} s median, over {GATES['one_p50_seconds']} s")
    if p50.get("ten", 0) > GATES["ten_p50_seconds"]:
        broken.append(f"10 sections: {p50['ten']:.1f} s median, over {GATES['ten_p50_seconds']} s")
    if GATES["no_regression"]:
        for case_id in compare(now, before)["regressed"]:
            broken.append(f"{case_id}: passed before, fails now")
    return broken


def text(now: dict[str, Any], before: dict[str, Any] | None = None) -> str:
    rows, diff = summary(now), compare(now, before)
    meta = now["meta"]
    lines = [
        f"{meta['name']}  model={meta['model']}  commit={meta['commit']}  repeats={meta['repeat']}",
        "",
        f"{'case':<10} {'split':<9} {'label':<8} {'passes':<7} failed checks",
    ]
    for row in rows:
        label = "person" if row["reviewed"] else "draft"
        mark = "" if row["passed"] else "  " + ", ".join(row["failed"])
        lines.append(
            f"{row['id']:<10} {row['split']:<9} {label:<8} {row['passes']}/{row['repeats']:<5}{mark}"
        )
    total = sum(r["passed"] for r in rows)
    lines += ["", f"{total} of {len(rows)} cases pass."]
    if before is not None:
        lines.append(
            f"Against {before['meta']['name']}: {len(diff['fixed'])} now pass, "
            f"{len(diff['regressed'])} regressed, {len(diff['new'])} new."
        )
        lines += [f"  REGRESSED {c}" for c in diff["regressed"]]
    p50 = speed(now)
    if p50:
        lines.append(
            "Median seconds: "
            + ", ".join(
                f"{'one thing' if k == 'one' else '10 or more'} {v:.1f}" for k, v in p50.items()
            )
        )
    broken = gates(now, before)
    lines += ["", "Gates hold." if not broken else "Gates broken:"]
    lines += [f"  {b}" for b in broken]
    return "\n".join(lines)


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())
