"""The review's findings on the grounding check, one test each."""

import copy

import pytest
from pydantic import ValidationError

from agent import build_graph
from evals.fake_store import FakeStore, load_world
from grounding import fact_problems, own_words_problems, problems_of, reads_from
from render import FIXED_LINES, render
from schemas import Draft
from tests.support import scripted
from tools import Handles, make_tools


@pytest.fixture
def world():
    return load_world("small")


def read_of(world, *codes):
    tool = make_tools(FakeStore(world).client(), Handles())[0]
    artifacts = [
        tool.invoke(
            {
                "type": "tool_call",
                "name": "read_feature",
                "args": {"feature_id": world["codes"][c]},
                "id": c,
            }
        ).artifact
        for c in codes
    ]
    return reads_from(artifacts)


def claim(world, code, attribute, status="accepted"):
    feature = world["features"][world["codes"][code]]
    return next(
        c["id"]
        for c in feature["claims"]
        if c["attribute_key"] == attribute and c["status"] == status
    )


def statement(kind="fact", text="", refs=(), attribute=None):
    return {"kind": kind, "text": text, "refs": list(refs), "attribute": attribute}


def check(world, read, *statements):
    draft = Draft.model_validate({"statements": list(statements)})
    return problems_of(draft, render(draft, read), read)


def test_help_and_reading_cannot_be_drafted_until_their_checks_exist():
    for kind in ("help", "reading"):
        with pytest.raises(ValidationError):
            Draft.model_validate(
                {"statements": [statement(kind, "It was abandoned after the war.")]}
            )


def test_a_fact_with_no_value_slot_is_blocked(world):
    read = read_of(world, "s02")
    ref = {"key": "c1", "type": "claim", "id": claim(world, "s02", "route")}
    assert any(
        "{c1.value}" in p
        for p in check(world, read, statement(text="Yes, it was owned by them.", refs=[ref]))
    )


def test_a_claims_value_cannot_be_given_as_another_attribute(world):
    read = read_of(world, "s02")
    ref = {"key": "c1", "type": "claim", "id": claim(world, "s02", "diameter")}
    problems = check(world, read, statement(text="The owner is {c1.value}.", refs=[ref]))
    assert any("speak of the owner" in p for p in problems)


def test_a_proposal_stated_as_known_is_blocked_and_said_as_one_passes(world):
    read = read_of(world, "s03")
    ref = {"key": "c1", "type": "claim", "id": claim(world, "s03", "owner", "candidate")}
    assert any(
        "proposal" in p
        for p in check(world, read, statement(text="The owner is {c1.value}.", refs=[ref]))
    )
    assert (
        check(world, read, statement(text="The owner {c1.value} is {c1.status}.", refs=[ref])) == []
    )
    assert (
        check(world, read, statement(text="A tool proposed {c1.value} as the owner.", refs=[ref]))
        == []
    )


def test_every_claim_named_must_be_used(world):
    read = read_of(world, "s02")
    refs = [
        {"key": "c1", "type": "claim", "id": claim(world, "s02", "owner")},
        {"key": "c2", "type": "claim", "id": claim(world, "s02", "diameter")},
    ]
    assert any(
        "c2 is in refs" in p
        for p in check(world, read, statement(text="The owner is {c1.value}.", refs=refs))
    )


@pytest.mark.parametrize(
    "text",
    [
        "Acme owned it, {c1.value}.",  # a name opening a sentence
        "ACME owns {c1.value}.",  # capitals
        "It was laid in nineteen thirty-eight, {c1.value}.",  # a date in words
        "Did Northern Natural own it? {c1.value}.",  # a name from the question is still a name
    ],
)
def test_names_and_numbers_in_the_models_own_words_are_caught(text):
    draft = Draft.model_validate({"statements": [statement(text=text)]})
    assert own_words_problems(draft)


def test_an_unknown_must_bring_the_pipelines_value_it_read(world):
    read = read_of(world, "s06", "l01")
    unknown = statement(
        "unknown", "", [{"key": "f1", "type": "feature", "id": world["codes"]["s06"]}], "owner"
    )
    assert any("pipeline's" in p for p in check(world, read, unknown))
    pipeline = statement(
        text="Its pipeline has an owner: {c1.value}.",
        refs=[{"key": "c1", "type": "claim", "id": claim(world, "l01", "owner")}],
    )
    assert check(world, read, unknown, pipeline) == []


def test_an_unknown_must_bring_the_proposal_it_read(world):
    read = read_of(world, "s03")
    unknown = statement(
        "unknown", "", [{"key": "f1", "type": "feature", "id": world["codes"]["s03"]}], "owner"
    )
    assert any("add a fact for each" in p for p in check(world, read, unknown))


def ask(world, model, question, store=None):
    from langchain_core.messages import HumanMessage

    graph = build_graph(store=(store or FakeStore(world)).client(), model=model)
    return graph.invoke(
        {"messages": [HumanMessage("hi", id="q", additional_kwargs={"question": question})]}
    )


def test_a_question_studio_would_never_send_is_answered_with_the_fixed_line(world):
    out = ask(world, scripted(), {"words": "hi", "about": [{"kind": "nope"}]})
    assert out["answer"]["statements"][0]["text"] == FIXED_LINES["check_failed"]


def test_the_length_limit_is_on_the_words_that_reach_the_model(world):
    out = ask(world, scripted(), {"words": "x" * 100_000, "about": []})
    assert out["answer"]["statements"][0]["text"] == FIXED_LINES["check_failed"]


def test_an_attached_id_in_capitals_is_the_same_section(world):
    s01 = world["codes"]["s01"]
    model = scripted(
        [("read_feature", {"feature_id": s01})],
        {"statements": [statement("unknown", "", [], "owner")]},
    )
    out = ask(
        world, model, {"words": "Who owns it?", "about": [{"kind": "section", "id": s01.upper()}]}
    )
    assert out["answer"]["statements"][0]["refs"][0]["id"] == s01


def test_a_merged_trace_that_is_gone_does_not_make_the_section_gone(world):
    broken = copy.deepcopy(world)
    del broken["features"][world["codes"]["d13"]]
    tool = make_tools(FakeStore(broken).client(), Handles())[0]
    shown = tool.invoke(
        {
            "type": "tool_call",
            "name": "read_feature",
            "args": {"feature_id": world["codes"]["s13"]},
            "id": "x",
        }
    )
    assert "could_not_read" in shown.content and "not_found" not in shown.artifact


def test_a_handle_in_lower_case_is_still_the_claim():
    handles = Handles()
    handle = handles.of("11111111-1111-4111-8111-111111111111")
    assert handles.resolve(handle.lower()) == "11111111-1111-4111-8111-111111111111"


def test_fact_problems_ignore_unknowns_and_fixed_lines(world):
    draft = Draft.model_validate({"statements": [statement("unknown", "", [], "owner")]})
    assert fact_problems(draft, read_of(world, "s01")) == []


def test_a_citation_request_is_written_by_code_and_carries_what_store_would_be_sent(world):
    read = read_of(world, "s02")
    s02 = world["codes"]["s02"]
    draft = Draft.model_validate(
        {
            "statements": [
                statement(
                    "citation_request",
                    "I found three new sources!",
                    [{"key": "f1", "type": "feature", "id": s02}],
                    "operator",
                )
            ]
        }
    )
    answer = render(draft, read)
    request = answer.statements[0]
    assert request.text == (
        "I cannot look for new sources yet. This is what I would ask for: a source for the "
        "operator of Sampletown lateral."
    )
    assert request.request.model_dump() == {
        "feature_id": s02,
        "attribute_keys": ["operator"],
        "priority": "interactive",
    }
    assert problems_of(draft, answer, read) == []


def test_a_citation_request_for_something_not_read_is_blocked(world):
    read = read_of(world, "s02")
    draft = Draft.model_validate(
        {
            "statements": [
                statement(
                    "citation_request",
                    "",
                    [{"key": "f1", "type": "feature", "id": world["codes"]["s01"]}],
                    "owner",
                )
            ]
        }
    )
    from render import Unfillable

    with pytest.raises(Unfillable):
        render(draft, read)
