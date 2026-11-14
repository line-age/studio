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
        feature, ends, context.edition_years(store, "gas"), lambda: f"W{next(counter)}"
    )


def by(facts_, what):
    return [f for f in facts_ if f.what == what]


def test_the_printings_are_the_years_sections_are_first_shown(world):
    # 1946 and 1951 only remove lines here, so store's sections cannot tell of them.
    editions = context.edition_years(FakeStore(world).client(), "gas")
    assert (editions.years, editions.complete) == ([1926, 1932, 1938], True)


def test_first_traced_names_the_printing_before_it(world):
    (first,) = by(facts(world, "s14"), "first_edition")
    assert "first traced on the 1932 printing" in first.text
    assert "not on the earlier 1926 printing" in first.text
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


def links_of(world, code):
    store = FakeStore(world).client()
    feature = store.feature(world["codes"][code])
    counter = itertools.count(1)
    return context.link_facts(
        feature, context.read_ends(store, feature), lambda: f"W{next(counter)}"
    )


def test_a_confirmed_pipeline_is_said_with_its_claims_kept_apart(world):
    (fact,) = links_of(world, "s16")
    assert fact.what == "pipeline"
    assert fact.text.startswith("From a confirmed link in store: ")
    assert "the pipeline Example trunk line" in fact.text
    assert "the pipeline's, not the section's" in fact.text


def test_a_proposed_pipeline_leaves_it_in_none(world):
    (fact,) = links_of(world, "s12")
    assert fact.text.startswith("It is proposed, and not yet decided, that ")
    assert "it is in no pipeline" in fact.text


def test_a_merged_trace_is_another_trace_of_the_same_pipe(world):
    (fact,) = links_of(world, "s13")
    assert fact.what == "same_pipe" and fact.text.startswith("From a confirmed link")
    assert "claims as" in fact.text


def test_a_proposed_twin_is_never_said_as_settled(world):
    (fact,) = links_of(world, "s14")
    assert fact.what == "same_pipe"
    assert fact.text.startswith("It is proposed, and not yet decided, that ")


def test_a_line_traced_as_gone_is_not_said_twice(world):
    assert links_of(world, "s08") == []  # its end is the editions' to say


def test_a_section_with_no_links_has_none(world):
    assert links_of(world, "s01") == []


@pytest.mark.parametrize("code", ["s16", "s12", "s13", "s14"])
def test_what_links_say_is_grounded_by_an_independent_check(world, code):
    from evals.score import ungrounded

    draft, answer, read, problems_of = _answer_for(world, code)
    assert problems_of(draft, answer, read) == []
    assert ungrounded(answer.model_dump(), world) == []


def test_a_cut_listing_names_no_earlier_printing(world):
    store = FakeStore(world).client()
    feature = store.feature(world["codes"]["s14"])
    counter = itertools.count(1)
    found = context.edition_facts(
        feature, {}, context.Editions([1926, 1932], complete=False), lambda: f"W{next(counter)}"
    )
    (first,) = by(found, "first_edition")
    assert "earlier" not in first.text


def test_a_confirmed_part_removal_leaves_the_rest_unknown(world):
    store = FakeStore(world).client()
    section = store.feature(world["codes"]["s08"])
    gone_id = next(lk["from_feature_id"] for lk in section["links"] if lk["relation"] == "same_as")
    gone = store.feature(gone_id)
    section["links"] = [
        {**lk, "relation": "overlaps", "status": "confirmed"} for lk in section["links"]
    ]
    counter = itertools.count(1)
    found = context.edition_facts(
        section, {gone_id: gone}, context.Editions([], True), lambda: f"W{next(counter)}"
    )
    (unknown,) = by(found, "not_traced_later")
    assert unknown.text.startswith("Store does not say when the rest of ")
    assert "confirmed for the rest of it" in unknown.text


def test_a_worked_out_statement_carrying_another_handles_sentence_is_blocked(world):
    draft, answer, read, problems_of = _answer_for(world, "s14")
    answer.statements[0].text = answer.statements[1].text  # W1 cited, W2's words shown
    assert any("its handle's sentence" in p for p in problems_of(draft, answer, read))
