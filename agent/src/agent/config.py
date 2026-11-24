"""Settings, read from the environment, and the Agent's fixed limits. No key or token has
a default."""

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

# The service's folder (agent/), where .env, contract/ and data/ live.
ROOT = Path(__file__).resolve().parents[2]

# The one conversation every browser on a Studio opens, until Studio has sign-in.
# A fixed UUID so a reload, a second browser and "Clear chat" all name the same thread.
SHARED_THREAD_ID = "5d1f0c1e-7a57-4c0d-9e61-a6e17d10a9e7"

MAX_QUESTION_CHARS = 4000

# The most years one cite search reads (owner, 2026-11-14): about 104 weekly issues.
CITE_WINDOW_YEARS = 2

# The most tool calls one try at one question may make, and the most model calls. Past
# the tool limit a call is refused and the model has to answer from what it has, so the
# model limit leaves room for that answer.
TOOL_CALLS = 4
MODEL_CALLS = TOOL_CALLS + 2

# How much of the chat the model is shown, to know what the person means.
HISTORY_TURNS = 4
HISTORY_ANSWER_CHARS = 500

# How long one pass of `cite_wait` waits for news before the graph shows what it has.
CITE_POLL_SECONDS = 2.0
# Step lines kept from a search: the latest ones, as a person follows them.
CITE_STEPS = 40


@dataclass(frozen=True)
class Settings:
    model: str
    # The read client sends GET only.
    store_url: str
    # The Agent's own read token for store (a pipeline token, starts with lgt_). Empty:
    # no token is sent, for a store that takes a request without one (development).
    store_token: str = field(default="", repr=False)
    # cite's Agent Server. Empty: the Agent cannot search, and says what it would ask for.
    cite_url: str = ""
    # A second store token, minted for the pipeline `cite@<version>`: the only one that
    # writes, and only a finding the person pressed Propose on (plan D7).
    cite_store_token: str = field(default="", repr=False)


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
        model=os.environ.get("AGENT_MODEL", "anthropic:claude-haiku-5-5"),
        store_url=os.environ.get("STORE_URL", "http://localhost:47110").rstrip("/"),
        cite_url=os.environ.get("CITE_URL", "").rstrip("/"),
        store_token=os.environ.get("STORE_TOKEN", ""),
        cite_store_token=os.environ.get("STORE_CITE_TOKEN", ""),
    )
