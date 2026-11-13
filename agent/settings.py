"""Settings, read from the environment. No key or token has a default."""

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).parent

# The one conversation every browser on a Studio opens, until Studio has sign-in.
# A fixed UUID so a reload, a second browser and "Clear chat" all name the same thread.
SHARED_THREAD_ID = "5d1f0c1e-7a57-4c0d-9e61-a6e17d10a9e7"

MAX_QUESTION_CHARS = 4000


@dataclass(frozen=True)
class Settings:
    model: str
    store_url: str
    store_token: str = field(repr=False)


TRACING_VARIABLES = (
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_TRACING",
)


_ON = ("1", "true", "yes", "on")


class TracingNotAllowed(RuntimeError):
    pass


def tracing_wanted(env: Mapping[str, str]) -> bool:
    return env.get("AGENT_TRACING", "").strip().lower() in _ON


def tracing_environment(env: Mapping[str, str]) -> dict[str, str]:
    """Every tracing variable, set from the one switch AGENT_TRACING.

    A trace holds what the Agent read from store, so it must never start by accident.
    Left alone, the server turns tracing on by itself when it finds a LangSmith key, and
    an old `LANGCHAIN_TRACING_V2=true` in a shell wins over `LANGSMITH_TRACING=false`.
    `serve.py` applies this before the server starts, which is the only moment it works.
    """
    value = "true" if tracing_wanted(env) else "false"
    return dict.fromkeys(TRACING_VARIABLES, value)


def refuse_undecided_tracing(env: Mapping[str, str] | None = None) -> None:
    """Refuse to load the graph if tracing is on and AGENT_TRACING did not turn it on.

    This is what stops a server started some other way (plain `langgraph dev` with a
    LangSmith key in the shell) from sending store's data out.
    """
    env = os.environ if env is None else env
    on = [name for name in TRACING_VARIABLES if env.get(name, "").strip().lower() in _ON]
    if on and not tracing_wanted(env):
        raise TracingNotAllowed(
            f"Tracing is on ({', '.join(on)}) but AGENT_TRACING is not. A trace holds what "
            "the Agent reads from store. Start the service with `uv run python serve.py`, "
            "which turns tracing off unless AGENT_TRACING=true."
        )


def load() -> Settings:
    return Settings(
        model=os.environ.get("AGENT_MODEL", "anthropic:claude-sonnet-5-5"),
        store_url=os.environ.get("STORE_URL", "http://localhost:47110").rstrip("/"),
        store_token=os.environ.get("STORE_TOKEN", ""),
    )
