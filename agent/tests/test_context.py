"""What code works out about a section (context.py), on the invented world: each rule on
a shape that triggers it, and a near miss that must stay silent."""

import itertools

import pytest

import context
from evals.fake_store import FakeStore, load_world


@pytest.fixture
def world():
    return load_world("small")


def facts(world, code):
    store = FakeStore(world).client()
    feature = store.feature(world["codes"][code])
    ends = context.read_ends(store, feature)
    counter = itertools.count(1)
    return context.edition_facts(
        feature, ends, context.edition_years(store), lambda: f"W{next(counter)}"
    )


def by(facts_, what):
    return [f for f in facts_ if f.what == what]


def test_the_printings_are_the_years_sections_are_first_shown(world):
    # 1946 and 1951 only remove lines here, so store's sections cannot tell of them.
    assert context.edition_years(FakeStore(world).client()) == [1926, 1932, 1938]


def test_first_traced_names_the_printing_before_it(world):
    (first,) = by(facts(world, "s14"), "first_edition")
    assert "first traced on the 1932 printing" in first.text
    assert "not on the 1926 printing" in first.text
    assert "built" not in first.text
    status = next(
        c
        for c in world["features"][world["codes"]["s14"]]["claims"]
        if c["attribute_key"] == "status"
    )
    assert first.rests_on == [status["id"]]


def test_the_first_printing_in_store_names_none_before_it(world):
    (first,) = by(facts(world, "s08"), "first_edition")
    assert "first traced on the 1926 printing." in first.text


def test_a_proposed_end_stays_unknown(world):
    found = facts(world, "s08")
    (removal,) = by(found, "removal")
    assert "proposed, and not yet decided" in removal.text and "1946" in removal.text
    assert by(found, "not_traced_later")  # still unknown when it ended


def test_a_confirmed_end_is_said_and_unknown_is_not(world):
    found = facts(world, "s09")
    (removal,) = by(found, "removal")
    assert "confirmed link" in removal.text and "1951" in removal.text
    assert not by(found, "not_traced_later")


def test_a_proposed_twin_is_not_an_end(world):
    # d19 is another trace of s14, not a line traced as gone: it ends nothing.
    found = facts(world, "s14")
    assert not by(found, "removal")
    (unknown,) = by(found, "not_traced_later")
    assert unknown.text.startswith("Store does not say when")


def test_a_section_with_no_map_date_has_no_first_printing(world):
    assert not by(facts(world, "s12"), "first_edition")


def _answer_for(world, code):
    """Render every worked-out fact for a section, as an answer would carry them."""
    from grounding import problems_of, reads_from
    from render import render
    from schemas import Draft
    from tools import make_tools

    _, read_context = make_tools(FakeStore(world).client())
    read = reads_from([read_context.func(world["codes"][code])[1]])
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "worked_out",
                    "text": "",
                    "refs": [{"key": "w", "type": "worked_out", "id": h}],
                }
                for h in read.worked
            ]
        }
    )
    answer = render(draft, read)
    return draft, answer, read, problems_of


@pytest.mark.parametrize("code", ["s14", "s08", "s09", "s01"])
def test_what_code_works_out_is_grounded_by_an_independent_check(world, code):
    from evals.score import ungrounded

    draft, answer, read, problems_of = _answer_for(world, code)
    assert problems_of(draft, answer, read) == []
    assert ungrounded(answer.model_dump(), world) == []


def test_a_worked_out_sentence_changed_is_blocked(world):
    draft, answer, read, problems_of = _answer_for(world, "s14")
    answer.statements[0].text = answer.statements[0].text.replace("1926", "1920")
    assert any("code's sentence" in p for p in problems_of(draft, answer, read))


def test_a_worked_out_handle_nobody_read_cannot_be_rendered(world):
    from render import Read, Unfillable, render
    from schemas import Draft

    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "worked_out",
                    "text": "",
                    "refs": [{"key": "w", "type": "worked_out", "id": "W9"}],
                }
            ]
        }
    )
    with pytest.raises(Unfillable):
        render(draft, Read())


def test_a_build_year_said_as_worked_out_is_ungrounded(world):
    from evals.score import ungrounded

    _, answer, _, _ = _answer_for(world, "s14")
    bad = answer.model_dump()
    bad["statements"][0]["text"] = bad["statements"][0]["text"].replace("1932", "1930")
    assert ungrounded(bad, world)
