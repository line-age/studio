"""Guards on what comes in and what goes out (plan 2026-11-24-001, B): a secret typed into
the chat is never kept or shown to the model, and an answer cut off by the output limit
is said as such. Offline: invented world, scripted model."""

import json

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from evals.fake_store import FakeStore, load_world
from src.agent.graph import build_graph
from src.agent.secrets import REDACTED, redact
from src.answer.render import FIXED_LINES
from tests.support import ScriptedModel, scripted
from tests.unit.test_graph import unknown_owner


@pytest.fixture
def world():
    return load_world("small")


# Invented, shaped like the real thing; none of them was ever a key.
SECRETS = [
    "sk-ant-api03-" + "Ab3" * 30,
    "sk-proj-" + "x9Z" * 16,
    "lgt_" + "f00d" * 10,
    "ghp_" + "A1b2" * 9,
    "github_pat_" + "11ABCDEFG" * 4,
    "lsv2_pt_" + "0123456789abcdef" * 2 + "_" + "a1b2c3d4e5",
    "AKIA" + "ABCDEFGHIJKLMNOP",
    "xoxb-" + "123456789012-" + "abcdEFGHijkl" * 2,
    "eyJhbGciOiJIUzI1NiJ9." + "eyJzdWIiOiJleGFtcGxlIn0" + "." + "c2lnbmF0dXJlLWV4YW1wbGU",
]


@pytest.mark.parametrize("secret", SECRETS)
def test_a_key_or_token_in_the_words_is_redacted(secret):
    text, found = redact(f"Here is my key {secret}, why does it fail?")
    assert secret not in text and REDACTED in text and found == 1
    assert text.startswith("Here is my key ") and text.endswith(", why does it fail?")


def test_a_bearer_value_is_redacted_and_the_word_kept():
    text, found = redact("curl -H 'Authorization: Bearer abc.DEF-123_456789xyz' /features")
    assert text == f"curl -H 'Authorization: Bearer {REDACTED}' /features" and found == 1


@pytest.mark.parametrize(
    "words",
    [
        "Who owns 0fc87cac-291d-5c57-9d84-7b1c734d02ec?",
        "Compare section 06a875ca with s01, 31 in, built 1931.",
        "Is the Example Pipe Line Co. the owner? Ask cite for 1930 to 1932.",
        "The bearer of this news says it was laid in 1931.",
        "skip the ask-ant part and read sk-8 again",
    ],
)
def test_ordinary_words_ids_and_codes_are_left_alone(words):
    assert redact(words) == (words, 0)


def test_a_very_long_run_of_letters_is_handled_quickly():
    import time

    start = time.monotonic()
    redact("sk-" + "a" * 200_000 + " eyJ" + "b." * 50_000)
    assert time.monotonic() - start < 1.0


class Watching(ScriptedModel):
    """Keeps every message the model was shown."""

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.__dict__.setdefault("shown", []).append("\n".join(str(m.content) for m in messages))
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


def test_a_secret_never_reaches_the_model_or_the_thread(world):
    s01 = world["codes"]["s01"]
    secret = SECRETS[0]
    model = Watching(messages=iter(scripted(unknown_owner(s01)).messages))
    graph = build_graph(store=FakeStore(world).client(), model=model, cite=None, writer=None)
    words = f"My key is {secret}. Who owns this section?"
    question = {"words": words, "about": [{"kind": "section", "id": s01}]}
    out = graph.invoke(
        {"messages": [HumanMessage(words, id="q1", additional_kwargs={"question": question})]}
    )
    assert all(secret not in shown for shown in model.shown)
    [asked] = [m for m in out["messages"] if isinstance(m, HumanMessage)]
    assert asked.id == "q1"
    assert secret not in asked.content and REDACTED in asked.content
    assert secret not in json.dumps(asked.additional_kwargs)
    assert out["answers"] == "q1"


def test_a_question_without_a_secret_is_kept_as_sent(world):
    s01 = world["codes"]["s01"]
    graph = build_graph(
        store=FakeStore(world).client(), model=scripted(unknown_owner(s01)), cite=None, writer=None
    )
    question = {"words": "Who owns this section?", "about": [{"kind": "section", "id": s01}]}
    sent = HumanMessage("Who owns this section?", id="q1", additional_kwargs={"question": question})
    out = graph.invoke({"messages": [sent]})
    [asked] = [m for m in out["messages"] if isinstance(m, HumanMessage)]
    assert asked.content == sent.content and asked.additional_kwargs == sent.additional_kwargs


# An answer cut off by the output limit


class CutOff(ScriptedModel):
    """Answers with a draft cut off half way, as the API does at max_tokens."""

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.__dict__["calls"] = self.__dict__.get("calls", 0) + 1
        message = AIMessage(
            content='{"statements": [{"kind": "unknown", "text": "No source says',
            response_metadata={"stop_reason": "max_tokens"},
        )
        return ChatResult(generations=[ChatGeneration(message=message)])


def test_an_answer_cut_off_by_the_output_limit_is_said_and_not_tried_again(world):
    s01 = world["codes"]["s01"]
    model = CutOff(messages=iter([]))
    graph = build_graph(store=FakeStore(world).client(), model=model, cite=None, writer=None)
    question = {"words": "Who owns this section?", "about": [{"kind": "section", "id": s01}]}
    out = graph.invoke(
        {
            "messages": [
                HumanMessage(question["words"], id="q1", additional_kwargs={"question": question})
            ]
        }
    )
    assert [s["text"] for s in out["answer"]["statements"]] == [FIXED_LINES["check_failed"]]
    assert any("cut off at the output limit" in line for b in out["blocked"] for line in b)
    assert model.calls == 1
