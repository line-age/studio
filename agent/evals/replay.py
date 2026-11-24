"""Recorded model answers: a live run saves what the model said for each case; a replay
answers from that, so the Agent's reading, rendering, checks and the score run for real
and the model is not called.

A recording is good only for the prompt, the tool descriptions and the case it was made
with: its key is a hash of the three. A change to any makes it stale, and a stale case
is reported, never run live on its own.
"""

import hashlib
import json
import threading
from pathlib import Path
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

RECORDED = Path(__file__).parent / "recorded"
# The set asks 50 questions. A question is one model call, two when its first draft is
# sent back. The most model calls one live run may make, whatever it is asked to run:
CAP = 60
# The most questions one live run may ask.
QUESTIONS = 50


class OverBudget(RuntimeError):
    """The run reached its cap of model calls."""


class Budget:
    """Model calls made in this run, counted across threads; stops the run at the cap."""

    def __init__(self, cap: int = CAP) -> None:
        self.cap, self.used, self._lock = cap, 0, threading.Lock()

    def take(self) -> None:
        with self._lock:
            if self.used >= self.cap:
                raise OverBudget(f"the cap of {self.cap} model calls is reached")
            self.used += 1


class Recorder(BaseCallbackHandler):
    """Every model call of one case: what came back, and the tokens it cost."""

    raise_error = True  # an OverBudget stops the call; it is not swallowed

    def __init__(self, budget: Budget) -> None:
        self.budget, self.calls = budget, []

    def on_chat_model_start(self, *args: Any, **kwargs: Any) -> None:
        self.budget.take()

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        message = response.generations[0][0].message
        content = message.content
        if isinstance(content, list):  # blocks: keep the text, which holds the draft
            content = "".join(b.get("text", "") for b in content if isinstance(b, dict))
        usage = message.usage_metadata or {}
        self.calls.append(
            {
                "content": content,
                "tool_calls": [
                    {"name": c["name"], "args": c["args"], "id": c["id"]}
                    for c in message.tool_calls
                ],
                "tokens_in": usage.get("input_tokens", 0),
                "tokens_out": usage.get("output_tokens", 0),
                "tokens_cached": (usage.get("input_token_details") or {}).get("cache_read", 0),
            }
        )


class Replayed(GenericFakeChatModel):
    """Answers each model call with the next recorded message; accepts tools and formats."""

    def bind_tools(self, tools: Any, **kwargs: Any) -> "Replayed":
        return self

    def bind(self, **kwargs: Any) -> "Replayed":
        return self


def key_of(case_json: str) -> str:
    """What a recording was made with: the prompt, the tools as the model sees them, and
    the case."""
    from evals.fake_store import FakeStore, load_world
    from src.prompts.retry import RETRY
    from src.prompts.system import SYSTEM
    from src.tools.make import make_tools

    tools = make_tools(FakeStore(load_world("small")).client())
    described = [(t.name, t.description, json.dumps(t.args, sort_keys=True)) for t in tools]
    blob = json.dumps([SYSTEM, RETRY, described, case_json], sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def save(case_id: str, key: str, calls: list[dict[str, Any]]) -> None:
    RECORDED.mkdir(exist_ok=True)
    (RECORDED / f"{case_id}.json").write_text(
        json.dumps({"key": key, "calls": calls}, indent=1, ensure_ascii=False) + "\n"
    )


def load(case_id: str, key: str) -> Replayed | None:
    """The model that replays a case, or None when it has no recording or a stale one."""
    path = RECORDED / f"{case_id}.json"
    if not path.exists():
        return None
    recorded = json.loads(path.read_text())
    if recorded["key"] != key:
        return None
    messages = [
        AIMessage(
            content=call["content"],
            tool_calls=[{**c, "type": "tool_call"} for c in call["tool_calls"]],
        )
        for call in recorded["calls"]
    ]
    return Replayed(messages=iter(messages))


def calls_recorded(case_id: str) -> int | None:
    path = RECORDED / f"{case_id}.json"
    return len(json.loads(path.read_text())["calls"]) if path.exists() else None
