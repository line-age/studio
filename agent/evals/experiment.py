"""Run use cases against the Agent.

    uv run python -m evals.experiment --behaviour B01 --repeat 3 --local
    uv run python -m evals.experiment --behaviour B01 --repeat 3          # a LangSmith experiment
    uv run python -m evals.experiment --full --held-out --repeat 3        # before a change is kept

`--local` uploads nothing. Without it the run is a LangSmith experiment on the dataset
`studio-agent-cases`. Both run every case on an invented world behind a fake store, so
no real data is involved either way. `--save NAME` keeps the report in `history/`.
"""

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from langchain_core.messages import HumanMessage

from evals import report as reports
from evals.cases import Case, load, question_for
from evals.checks import check
from evals.fake_store import FakeStore, load_world

HERE = Path(__file__).parent
DATASET = "studio-agent-cases"


def run_case(case: Case) -> dict[str, Any]:
    """Ask one case's question of the Agent on its world. Returns what the checks read."""
    from agent import build_graph

    world = load_world(case.world)
    store = FakeStore(world)
    question = question_for(case, world)
    message = HumanMessage(content=question["words"], additional_kwargs={"question": question})
    try:
        graph = build_graph(store=store.client())
        start = time.perf_counter()
        state = graph.invoke({"messages": [message]})
    except Exception as exc:  # noqa: BLE001 - a crash is a failed case, not a failed run
        return {"answer": None, "tools": [], "error": f"{type(exc).__name__}: {exc}"[:500]}
    return {
        # From the question in to the checked answer out, as a person waits for it.
        "seconds": round(time.perf_counter() - start, 2),
        "answer": state.get("answer"),
        "tools": state.get("tools") or [],
        "blocked": state.get("blocked") or [],
        "store_reads": len(store.requests),
    }


def _meta(name: str, repeat: int) -> dict[str, Any]:
    import prompts

    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        capture_output=True,
        text=True,
        cwd=HERE,
        check=False,
    ).stdout.strip()
    return {
        "name": name,
        "at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "model": os.environ.get("AGENT_MODEL", "anthropic:claude-sonnet-5-5"),
        "commit": commit,
        "prompt": hashlib.sha256(prompts.SYSTEM.encode()).hexdigest()[:12],
        "repeat": repeat,
    }


def _entry(case: Case) -> dict[str, Any]:
    return {
        "behaviour": case.behaviour,
        "split": case.split,
        "labeled_by": case.labeled_by,
        "attached": len(case.question.get("about", [])),
        "repeats": [],
    }


def _text(outputs: dict[str, Any]) -> str:
    answer = outputs.get("answer") or {"statements": []}
    return "\n".join(s["text"] for s in answer["statements"]) or outputs.get("error", "")


def run_local(cases: list[Case], repeat: int, name: str) -> dict[str, Any]:
    from langsmith import tracing_context

    def one(case: Case) -> dict[str, Any]:
        outputs = run_case(case)
        return {
            "feedback": check(case, load_world(case.world), outputs),
            "answer": _text(outputs),
            "tools": outputs["tools"],
            "blocked": outputs.get("blocked", []),
            "seconds": outputs.get("seconds"),
        }

    out = {"meta": _meta(name, repeat), "cases": {c.id: _entry(c) for c in cases}}
    with tracing_context(enabled=False), ThreadPoolExecutor(max_workers=4) as pool:
        jobs = [(case, pool.submit(one, case)) for case in cases for _ in range(repeat)]
        for case, job in jobs:
            out["cases"][case.id]["repeats"].append(job.result())
    return out


def run_langsmith(cases: list[Case], repeat: int, name: str) -> dict[str, Any]:
    from langsmith import Client

    from evals.sync import sync

    # An experiment names its own destination; the agent's address must not be beside it.
    for variable in ("LANGSMITH_AGENT_ID", "LANGSMITH_AGENT_ENVIRONMENT", "LANGSMITH_PROJECT"):
        os.environ.pop(variable, None)
    os.environ["LANGSMITH_TRACING"] = "true"
    client = Client()
    sync(client)
    by_id = {c.id: c for c in cases}
    examples = list(
        client.list_examples(dataset_name=DATASET, example_ids=[c.example_id for c in cases])
    )

    def target(inputs: dict[str, Any]) -> dict[str, Any]:
        return run_case(by_id[inputs["case"]])

    def evaluator(run, example) -> dict[str, Any]:
        case = by_id[example.inputs["case"]]
        feedback = check(case, load_world(case.world), run.outputs or {})
        return {
            "results": [
                {"key": key, "score": int(value["score"]), "comment": value["comment"]}
                for key, value in feedback.items()
            ]
        }

    meta = _meta(name, repeat)
    results = client.evaluate(
        target,
        data=examples,
        evaluators=[evaluator],
        num_repetitions=repeat,
        experiment_prefix=name,
        metadata={k: meta[k] for k in ("model", "commit", "prompt")},
        max_concurrency=4,
    )
    out = {
        "meta": {**meta, "experiment": results.experiment_name},
        "cases": {c.id: _entry(c) for c in cases},
    }
    for row in results:
        case = by_id[row["example"].inputs["case"]]
        outputs = row["run"].outputs or {}
        out["cases"][case.id]["repeats"].append(
            {
                "feedback": check(case, load_world(case.world), outputs),
                "answer": _text(outputs),
                "tools": outputs.get("tools", []),
                "blocked": outputs.get("blocked", []),
            }
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--behaviour", action="append", help="B01; with the ones it must keep")
    parser.add_argument("--full", action="store_true", help="every behaviour")
    parser.add_argument("--held-out", action="store_true", help="include the held-out cases")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--local", action="store_true", help="upload nothing")
    parser.add_argument("--save", help="keep the report as history/NAME.json")
    parser.add_argument("--against", help="compare with history/NAME.json")
    parser.add_argument(
        "--baseline", action="store_true", help="a run before the build: gates not applied"
    )
    args = parser.parse_args()
    if not args.full and not args.behaviour:
        parser.error("name a --behaviour, or --full")

    from dotenv import load_dotenv

    load_dotenv(HERE.parent / ".env")
    cases = load(None if args.full else args.behaviour)
    if not args.held_out:
        cases = [c for c in cases if c.split == "dev"]
    name = args.save or ("full" if args.full else "-".join(args.behaviour))
    result = (run_local if args.local else run_langsmith)(cases, args.repeat, name)

    before = reports.load(HERE / "history" / f"{args.against}.json") if args.against else None
    print(reports.text(result, before))
    runs = HERE / "runs"
    runs.mkdir(exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    (runs / f"{stamp}-{name}.json").write_text(json.dumps(result, indent=1, ensure_ascii=False))
    if args.save:
        (HERE / "history" / f"{args.save}.json").write_text(
            json.dumps(result, indent=1, ensure_ascii=False) + "\n"
        )
    if not args.baseline and reports.gates(result, before):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
