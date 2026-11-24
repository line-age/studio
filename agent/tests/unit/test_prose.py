"""An answer in the model's own words (prose.py): free in how it is said, held to what
the tools returned in what it says. On the invented world."""

import pytest

from evals.fake_store import FakeStore, load_world
from src.answer.grounding import problems_of, reads_from
from src.answer.render import render
from src.answer.schemas import Draft
from tests.support import bound_tools


@pytest.fixture(scope="module")
def world():
    return load_world("small")


def said(world, text, *codes, words="Tell me about it", pipeline=None):
    tools = bound_tools(FakeStore(world).client())
    artifacts = [tools[0].func(world["codes"][c])[1] for c in codes]
    artifacts += [tools[1].func(world["codes"][c])[1] for c in codes if c.startswith("s")]
    if pipeline:
        artifacts += [tools[0].func(world["codes"][pipeline])[1]]
        artifacts += [tools[4].func(world["codes"][pipeline])[1]]
    read = reads_from(artifacts)
    read.words = words
    read.asked_about = [world["codes"][c] for c in (*codes, *([pipeline] if pipeline else []))]
    draft = Draft.model_validate({"statements": [{"kind": "answer", "text": text}]})
    answer = render(draft, read)
    return answer.statements[0], problems_of(draft, answer, read)


def test_an_answer_in_plain_words_with_values_that_were_read_passes(world):
    statement, problems = said(
        world,
        "It is owned by Example Pipe Line Co., by March 1932, and has a diameter of 20 in. "
        "No source names its operator. It lies in Oklahoma and is about 76 km (47 miles) "
        "long as drawn.",
        "s02",
    )
    assert problems == []
    assert statement.kind == "answer"
    # The claims whose values it states are what it rests on: their sources show beside it.
    assert {r.attribute for r in statement.refs if r.type == "claim"} == {"owner", "diameter"}


def test_a_pipeline_is_told_in_one_paragraph(world):
    statement, problems = said(
        world,
        "It is the pipeline Example trunk line, owned by Example Pipe Line Co. It has 3 "
        "sections, together about 195 km (121 miles) long as drawn, in Arkansas and "
        "Colorado.",
        pipeline="l01",
    )
    assert problems == []
    assert statement.text.startswith("It is the pipeline Example trunk line")


@pytest.mark.parametrize(
    ("text", "why"),
    [
        ("It is owned by Standard Oil.", "the name 'Standard' is in nothing that was read"),
        ("It is about 90 km long as drawn.", "the number 90 is in nothing that was read"),
        ("It has a diameter of 24 in.", "the number 24 is in nothing that was read"),
        ("It was built in 1932.", "'built' goes beyond what was read"),
        ("It is connected to another line.", "'connected' goes beyond what was read"),
        ("The store holds an owner.", "'store' is a word of the system"),
        ("It is about 76 km long.", 'a length is "as drawn"'),
        ("It has seven sections.", "'seven' (7) is in nothing that was read"),
        ("It is section deadbeef.", "the code deadbeef is in nothing that was read"),
        ('The source says "gas flows east".', "a quotation is in nothing that was read"),
    ],
)
def test_what_was_not_read_or_goes_beyond_it_is_blocked(world, text, why):
    _, problems = said(world, text, "s02")
    assert any(why in p for p in problems), problems


def test_a_value_only_proposed_must_be_said_as_proposed(world):
    _, problems = said(world, "It is owned by Sample Gas Co.", "s03")
    assert any("only proposed" in p for p in problems)
    _, problems = said(world, "Sample Gas Co. is proposed as its owner; nobody has decided.", "s03")
    assert problems == []


def test_unknown_is_not_said_of_a_fact_that_was_read(world):
    _, problems = said(world, "No owner is recorded for it.", "s02")
    assert any("an accepted owner was read" in p for p in problems)
    _, problems = said(world, "No owner is recorded for it.", "s01")
    assert problems == []


def test_todays_towns_are_said_as_todays(world):
    read_context = bound_tools(FakeStore(world).client())[1]
    towns = next(
        w["text"].split(": ")[-1].rstrip(".").split(", ")[0].split(" and ")[0]
        for w in read_context.func(world["codes"]["s01"])[1]["worked_out"]
        if "today's towns" in w["text"]
    )
    _, problems = said(world, f"It runs near {towns}.", "s01")
    assert any("today's" in p for p in problems)
    _, problems = said(world, f"It runs near today's {towns}.", "s01")
    assert problems == []


def test_a_value_from_the_persons_own_question_may_be_repeated(world):
    _, problems = said(
        world, "Nothing read says Acme Gas owned it.", "s01", words="Was it Acme Gas?"
    )
    assert problems == []


def test_a_label_or_an_ordinary_word_that_opens_a_sentence_is_not_a_name(world):
    _, problems = said(
        world,
        "It is the pipeline Example trunk line.\n\nKnown: Example Pipe Line Co. owns it.\n"
        "Sections: Together its 3 sections are about 195 km (121 miles) long as drawn. "
        "Section 2cf68921 is one of them.\nNot known: No source gives its operator.",
        pipeline="l01",
    )
    assert problems == []


def test_a_name_that_opens_a_sentence_is_still_checked(world):
    _, problems = said(world, "Standard Oil owns it.", "s02")
    assert any("'Standard'" in p for p in problems) and any("'Oil'" in p for p in problems)
