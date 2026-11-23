"""Start the service: `uv run python serve.py [--qa] [--port 47190] [langgraph dev options]`.

This is the way to run it. It decides tracing before the server starts (off unless
AGENT_TRACING=true, in `.env` or the environment), then hands over to `langgraph dev`.

`--qa` runs it for end-to-end QA on an invented world: settings from `.env.qa` (made from
`.env` with store pointed at `evals.serve_world`), so a trace never holds real data.

`--real` runs it on a store with real data, on this machine only: settings from
`.env.real` (git ignores it), tracing only if AGENT_TRACING=true there, and its threads
kept apart in `.data/real/` so they never mix with QA's.
"""

import json
import os
import sys
from pathlib import Path

from dotenv import dotenv_values

from settings import ROOT, tracing_environment, tracing_wanted

QA_STORE = {"STORE_URL": "http://127.0.0.1:47191"}


def write_qa_env() -> None:
    """`.env.qa`: the keys and settings of `.env`, with store the invented world."""
    values = {k: v for k, v in dotenv_values(ROOT / ".env").items() if v is not None}
    values.update(QA_STORE)
    (ROOT / ".env.qa").write_text("".join(f"{k}={v}\n" for k, v in values.items()))
    (ROOT / ".env.qa").chmod(0o600)


def environment(env_file: str = ".env") -> dict[str, str]:
    # The env file wins over the shell, as it does for the server itself.
    from_file = {k: v for k, v in dotenv_values(ROOT / env_file).items() if v is not None}
    env = {**os.environ, **from_file}
    env.update(tracing_environment(env))
    if env.get("LANGSMITH_AGENT_ID"):
        # Traces are addressed to the agent. A project left in a shell beside it would
        # make LangSmith trace nothing, so the agent's address wins.
        for name in ("LANGSMITH_PROJECT", "LANGCHAIN_PROJECT"):
            env.pop(name, None)
    env.setdefault("LANGGRAPH_CLI_NO_ANALYTICS", "1")
    return env


def real_environment() -> dict[str, str]:
    """`.env.real`'s settings. Tracing follows AGENT_TRACING there, off unless it says
    true: the owner allowed real data in traces (2026-11-22). With tracing off, the
    LangSmith key is dropped, so nothing can send a trace by another route."""
    env = environment(".env.real")
    if not tracing_wanted(env):
        for name in ("LANGSMITH_API_KEY", "LANGCHAIN_API_KEY"):
            env.pop(name, None)
    return env


def write_real_config() -> Path:
    """The real run's config, in its own git-ignored folder: absolute paths, since the
    server runs there so its threads are kept apart from QA's."""
    here = ROOT / ".data" / "real"
    here.mkdir(parents=True, exist_ok=True)
    config = json.loads((ROOT / "langgraph.json").read_text())
    config["dependencies"] = [str(ROOT)]
    config["graphs"] = {"agent": f"{ROOT / 'graph.py'}:graph"}
    config["env"] = str(ROOT / ".env.real")
    path = here / "langgraph.json"
    path.write_text(json.dumps(config, indent=2) + "\n")
    return path


def main() -> None:
    args = sys.argv[1:]
    env_file = ".env"
    if "--qa" in args:
        args.remove("--qa")
        write_qa_env()
        env_file = ".env.qa"
        args = ["--config", "langgraph.qa.json", *args]
    real = "--real" in args
    if real:
        args.remove("--real")
        if not (ROOT / ".env.real").exists():
            sys.exit("--real needs .env.real (STORE_URL and the model key).")
        env_file = ".env.real"
        args = ["--config", str(write_real_config()), *args]
    if "--port" not in args:
        args = ["--port", "47190", *args]
    if "--no-browser" not in args:
        args.append("--no-browser")
    env = real_environment() if real else environment(env_file)
    if real:
        (ROOT / ".data" / "real").mkdir(parents=True, exist_ok=True)
        os.chdir(ROOT / ".data" / "real")
    else:
        os.chdir(ROOT)
    os.execvpe("langgraph", ["langgraph", "dev", *args], env)


if __name__ == "__main__":
    main()
