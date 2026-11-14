"""A model error that passes (a dropped connection, an overloaded or rate-limited
model) is tried again once; then the fixed line. Any other error, a timeout among them,
is not retried."""

import anthropic
import httpx
import pytest
from langchain_core.messages import HumanMessage

from agent import build_graph
from evals.fake_store import FakeStore, load_world
from render import FIXED_LINES
from tests.support import ScriptedModel, scripted


def _request():
    return httpx.Request("POST", "https://model.invalid/v1/messages")


def _status(code):
    response = httpx.Response(code, request=_request())
    return anthropic.APIStatusError("model said no", response=response, body=None)


PASSING = [
    anthropic.APIConnectionError(request=_request()),
    _status(429),
    _status(529),
    _status(503),
]


class Failing(ScriptedModel):
    """Raises the given errors on its first calls, then follows its script."""

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        errors = self.__dict__.setdefault("_errors", [])
        if errors:
            raise errors.pop(0)
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


def failing(errors, *steps):
    model = Failing(messages=iter(scripted(*steps).messages))
    model.__dict__["_errors"] = list(errors)
    return model


def _ask(model):
    world = load_world("small")
    s01 = world["codes"]["s01"]
    graph = build_graph(store=FakeStore(world).client(), model=model)
    question = {"words": "Who owns it?", "about": [{"kind": "section", "id": s01}]}
    message = HumanMessage("Who owns it?", id="q1", additional_kwargs={"question": question})
    return graph.invoke({"messages": [message]})["answer"]["statements"], s01


def _unknown_owner(feature_id):
    return {
        "statements": [
            {
                "kind": "unknown",
                "text": "Store does not say who owns this section.",
                "refs": [{"key": "f1", "type": "feature", "id": feature_id}],
                "attribute": "owner",
            }
        ]
    }


@pytest.mark.parametrize("error", PASSING, ids=lambda e: type(e).__name__)
def test_a_passing_model_error_is_tried_again_once(error):
    s01 = load_world("small")["codes"]["s01"]
    model = failing([error], [("read_feature", {"feature_id": s01})], _unknown_owner(s01))
    statements, _ = _ask(model)
    assert [s["kind"] for s in statements] == ["unknown"]


def test_twice_is_the_fixed_line():
    s01 = load_world("small")["codes"]["s01"]
    errors = [anthropic.APIConnectionError(request=_request())] * 2
    model = failing(errors, [("read_feature", {"feature_id": s01})], _unknown_owner(s01))
    statements, _ = _ask(model)
    assert statements[0]["text"] == FIXED_LINES["model_failed"]


# A timeout is not tried again here: the client already waited and retried it.
@pytest.mark.parametrize(
    "error",
    [_status(400), ValueError("bad output"), anthropic.APITimeoutError(request=_request())],
    ids=str,
)
def test_an_error_that_will_not_pass_is_not_retried(error):
    s01 = load_world("small")["codes"]["s01"]
    model = failing([error], [("read_feature", {"feature_id": s01})], _unknown_owner(s01))
    statements, _ = _ask(model)
    assert statements[0]["text"] == FIXED_LINES["model_failed"]
