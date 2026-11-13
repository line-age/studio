"""Settings, read from the environment. No key or token has a default."""

import os
from dataclasses import dataclass
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
    store_token: str


def load() -> Settings:
    return Settings(
        model=os.environ.get("AGENT_MODEL", "anthropic:claude-sonnet-5-5"),
        store_url=os.environ.get("STORE_URL", "http://localhost:47110").rstrip("/"),
        store_token=os.environ.get("STORE_TOKEN", ""),
    )
