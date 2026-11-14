"""Start the service: `uv run python serve.py [--qa] [--port 47190] [langgraph dev options]`.

This is the way to run it. It decides tracing before the server starts (off unless
AGENT_TRACING=true, in `.env` or the environment), then hands over to `langgraph dev`.

`--qa` runs it for end-to-end QA on an invented world: settings from `.env.qa` (made from
`.env` with store pointed at `evals.serve_world`), so a trace never holds real data.
"""

import os
import sys

from dotenv import dotenv_values

from settings import ROOT, tracing_environment

QA_STORE = {"STORE_URL": "http://127.0.0.1:47191", "STORE_TOKEN": "lgt_invented_token_for_tests"}


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


def main() -> None:
    args = sys.argv[1:]
    env_file = ".env"
    if "--qa" in args:
        args.remove("--qa")
        write_qa_env()
        env_file = ".env.qa"
        args = ["--config", "langgraph.qa.json", *args]
    if "--port" not in args:
        args = ["--port", "47190", *args]
    if "--no-browser" not in args:
        args.append("--no-browser")
    os.chdir(ROOT)
    os.execvpe("langgraph", ["langgraph", "dev", *args], environment(env_file))


if __name__ == "__main__":
    main()
