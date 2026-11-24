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

from evals import replay
from evals import report as reports
from evals.cases import Case, load, question_for
from evals.checks import check
from evals.fake_store import FakeStore, load_world

HERE = Path(__file__).parent
DATASET = "studio-agent-cases"


def _message(question: dict[str, Any], n: int) -> HumanMessage:
    return HumanMessage(
        content=question["words"], id=f"q{n}", additional_kwargs={"question": question}
    )


def _key(case: Case) -> str:
    return replay.key_of(json.dumps([case.id, case.world, case.question, case.turns, case.cite]))


def _ready_offer(state: dict[str, Any]) -> dict[str, Any] | None:
    for st in (state.get("answer") or {}).get("statements") or []:
        if st["kind"] == "search_offer" and st["search"]["ready"]:
            return st
    return None


def run_case(case: Case, budget: "replay.Budget | None" = None) -> dict[str, Any]:
    """Ask one case's question of the Agent on its world. Returns what the checks read.

    With a `budget` the model is called and what it said is recorded; without one the
    case is answered from its recording, and a case with none, or a stale one, is said
    to be stale and not run.

    A case that searches runs its turns on one thread, with the fake cite and a proposal
    client into the fake store; it is timed from its last question."""
    from langgraph.checkpoint.memory import InMemorySaver

    from evals.fake_cite import FakeCite
    from src.agent.graph import build_graph

    world = load_world(case.world)
    store = FakeStore(world)
    cite = FakeCite(*case.cite, polls=1) if case.searches else None
    key = _key(case)
    recorder = replay.Recorder(budget) if budget is not None else None
    model = None if budget is not None else replay.load(case.id, key)
    if budget is None and model is None:
        return {
            "answer": None,
            "tools": [],
            "stale": True,
            "error": "no recording for it as it is now",
        }
    try:
        if case.searches:
            graph = build_graph(
                store=store.client(), model=model, cite=cite, writer=store.writer(), cite_poll=0.05
            )
            graph.checkpointer = InMemorySaver()
        elif case.acts:
            graph = build_graph(store=store.client(), model=model, cite=None, writer=store.writer())
            graph.checkpointer = InMemorySaver()
        else:
            graph = build_graph(store=store.client(), model=model, cite=None, writer=None)
        config = {"configurable": {"thread_id": "case"}}
        if recorder is not None:
            config["callbacks"] = [recorder]
        for n, turn in enumerate(case.turns, 1):
            graph.invoke({"messages": [_message(question_for(case, world, turn), n)]}, config)
        start = time.perf_counter()
        last = _message(question_for(case, world), len(case.turns) + 1)
        state = graph.invoke({"messages": [last]}, config)
        pressed = False
        offer = _ready_offer(state)
        if offer is not None and case.press_search and case.searches:
            # Search pressed, as Studio does: the search runs in its own turn, and the
            # case is judged on what the person reads, the offer's place taken by it.
            press = {
                "words": "Search",
                "about": [],
                "network": "gas",
                "action": {"kind": "search", "offer": offer["search"]["id"]},
            }
            after = graph.invoke({"messages": [_message(press, len(case.turns) + 2)]}, config)
            before = state["answer"]["statements"]
            i = before.index(offer)
            merged = [*before[:i], *after["answer"]["statements"], *before[i + 1 :]]
            state = {**after, "answer": {**after["answer"], "statements": merged}}
            pressed = True
    except Exception as exc:  # noqa: BLE001 - a crash is a failed case, not a failed run
        return {"answer": None, "tools": [], "error": f"{type(exc).__name__}: {exc}"[:500]}
    if recorder is not None:
        replay.save(case.id, key, recorder.calls)
    return {
        "calls": len(recorder.calls) if recorder else 0,
        "tokens_in": sum(c["tokens_in"] for c in recorder.calls) if recorder else 0,
        "tokens_out": sum(c["tokens_out"] for c in recorder.calls) if recorder else 0,
        # What the fake cite was asked and gave, and what store took: for the checks.
        "cite_inputs": cite.inputs if cite else [],
        "cite_results": [r.result() for r in cite.runs.values() if r.result()] if cite else [],
        "writes": len(store.bundles),
        "world_after": store.world if store.bundles else None,
        "words": [t["words"] for t in case.turns],
        # From the question in to the checked answer out, as a person waits for it.
        "seconds": round(time.perf_counter() - start, 2),
        "answer": state.get("answer"),
        "pressed": pressed,
        "tools": state.get("tools") or [],
        "blocked": state.get("blocked") or [],
        "store_reads": len(store.requests),
    }


def _meta(name: str, repeat: int) -> dict[str, Any]:
    from src.prompts.system import SYSTEM

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
        "model": os.environ.get("AGENT_MODEL", "anthropic:claude-haiku-5-5"),
        "commit": commit,
        "prompt": hashlib.sha256(SYSTEM.encode()).hexdigest()[:12],
        "repeat": repeat,
    }


def _entry(case: Case) -> dict[str, Any]:
    return {
        "behaviour": case.behaviour,
        "split": case.split,
        "labeled_by": case.labeled_by,
        "attached": len(case.question.get("about", [])),
        "cite": case.searches,
        "repeats": [],
    }


def _text(outputs: dict[str, Any]) -> str:
    answer = outputs.get("answer") or {"statements": []}
    return "\n".join(s["text"] for s in answer["statements"]) or outputs.get("error", "")


def run_local(
    cases: list[Case],
    repeat: int,
    name: str,
    retry: int = 0,
    budget: "replay.Budget | None" = None,
) -> dict[str, Any]:
    from langsmith import tracing_context

    def one(case: Case) -> dict[str, Any]:
        outputs = run_case(case, budget)
        return {
            "stale": bool(outputs.get("stale")),
            "calls": outputs.get("calls", 0),
            "tokens_in": outputs.get("tokens_in", 0),
            "tokens_out": outputs.get("tokens_out", 0),
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
        # A case that failed is run again: it passes on a majority, so one bad draw does
        # not fail it, and a case that passes first time costs one answer, not three.
        again = [
            c
            for c in cases
            if not all(r["feedback"]["case_passed"]["score"] for r in out["cases"][c.id]["repeats"])
        ]
        jobs = [(case, pool.submit(one, case)) for case in again for _ in range(retry)]
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
                # As run_local records it: without it the speed gates read a crash.
                "seconds": outputs.get("seconds"),
            }
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--behaviour", action="append", help="B01; with the ones it must keep")
    parser.add_argument("--full", action="store_true", help="every behaviour")
    parser.add_argument("--held-out", action="store_true", help="include the held-out cases")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument(
        "--retry", type=int, default=0, help="more runs of a case that failed (live runs)"
    )
    parser.add_argument(
        "--live", action="store_true", help="call the model and record what it says"
    )
    parser.add_argument("--yes", action="store_true", help="with --live: go ahead and spend")
    parser.add_argument("--stale", action="store_true", help="with --live: only stale cases")
    parser.add_argument(
        "--with-keeps", action="store_true", help="also the behaviours these must keep"
    )
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
    if not args.full and not args.with_keeps:
        cases = [c for c in cases if c.behaviour in args.behaviour]
    name = args.save or ("full" if args.full else "-".join(args.behaviour))
    if not args.live:
        # The default costs nothing: every case is answered from its recording.
        result = run_local(cases, 1, name)
    else:
        if args.stale:
            cases = [c for c in cases if replay.load(c.id, _key(c)) is None]
        asked = sum(1 + len(c.turns) for c in cases) * args.repeat
        known = [replay.calls_recorded(c.id) for c in cases]
        guess = sum(
            k if k is not None else 1 + len(c.turns) for k, c in zip(known, cases, strict=True)
        )
        print(
            f"Live: {len(cases)} cases, {asked} questions, about {guess * args.repeat} model "
            f"calls (stops at {replay.CAP}), retries {args.retry}."
        )
        if asked > replay.QUESTIONS:
            parser.error(f"more than {replay.QUESTIONS} questions in one live run: narrow it")
        if not args.yes:
            print("Nothing was run. Add --yes to spend this.")
            return
        budget = replay.Budget()
        result = run_local(cases, args.repeat, name, args.retry, budget)
        repeats = [r for c in result["cases"].values() for r in c["repeats"]]
        print(
            f"Spent: {budget.used} model calls, {sum(r['tokens_in'] for r in repeats):,} tokens "
            f"in, {sum(r['tokens_out'] for r in repeats):,} out."
        )
    stale = sorted(
        cid for cid, c in result["cases"].items() if any(r.get("stale") for r in c["repeats"])
    )
    if stale:
        print(f"Stale, not run ({len(stale)}): {' '.join(stale)}")
        print("Their prompt, tools or case changed. Record them: --live --stale --yes")
        # A stale case is neither a pass nor a failure: it is left out of the report.
        result["cases"] = {k: v for k, v in result["cases"].items() if k not in stale}
        if not result["cases"]:
            return

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
