"""Start the service: `uv run python serve.py [--port 47190] [more langgraph dev options]`.

This is the way to run it. It decides tracing before the server starts (off unless
AGENT_TRACING=true, in `.env` or the environment), then hands over to `langgraph dev`.
"""

import os
import sys

from dotenv import dotenv_values

from settings import ROOT, tracing_environment


def environment() -> dict[str, str]:
    # `.env` wins over the shell, as it does for the server itself.
    from_file = {k: v for k, v in dotenv_values(ROOT / ".env").items() if v is not None}
    env = {**os.environ, **from_file}
    env.update(tracing_environment(env))
    env.setdefault("LANGGRAPH_CLI_NO_ANALYTICS", "1")
    return env


def main() -> None:
    args = sys.argv[1:]
    if "--port" not in args:
        args = ["--port", "47190", *args]
    if "--no-browser" not in args:
        args.append("--no-browser")
    os.chdir(ROOT)
    os.execvpe("langgraph", ["langgraph", "dev", *args], environment())


if __name__ == "__main__":
    main()
