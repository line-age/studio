"""What code works out about a section (context.py), on the invented world: each rule on
a shape that triggers it, and a near miss that must stay silent."""

import itertools

import pytest

from evals.fake_store import FakeStore, load_world
from src.answer.render import short_id
from src.worked_out import context


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
    assert "first shown on the 1932 map" in first.text
    assert "is not shown on the earlier 1926 map" in first.text
    assert "built" not in first.text
    status = next(
        c
        for c in world["features"][world["codes"]["s14"]]["claims"]
        if c["attribute_key"] == "status"
    )
    assert first.rests_on == [status["id"]]


def test_the_first_printing_in_store_names_none_before_it(world):
    (first,) = by(facts(world, "s08"), "first_edition")
    assert "first shown on the 1926 map." in first.text


def test_a_proposed_end_stays_unknown(world):
    found = facts(world, "s08")
    (removal,) = by(found, "removal")
    assert "proposed, and not yet decided" in removal.text and "1946" in removal.text
    assert by(found, "not_traced_later")  # still unknown when it ended


def test_a_confirmed_end_is_said_and_unknown_is_not(world):
    found = facts(world, "s09")
    (removal,) = by(found, "removal")
    assert "that is confirmed" in removal.text and "The 1951 map no longer shows" in removal.text
    assert not by(found, "not_traced_later")


def test_a_proposed_twin_is_not_an_end(world):
    # d19 is another trace of s14, not a line traced as gone: it ends nothing.
    found = facts(world, "s14")
    assert not by(found, "removal")
    (unknown,) = by(found, "not_traced_later")
    assert unknown.text.startswith("No source says when")


def test_a_section_with_no_map_date_has_no_first_printing(world):
    assert not by(facts(world, "s12"), "first_edition")


def _answer_for(world, code):
    """Render every worked-out fact for a section, as an answer would carry them."""
    from src.answer.grounding import problems_of, reads_from
    from src.answer.render import render
    from src.answer.schemas import Draft
    from src.tools.make import make_tools

    _, read_context, *_ = make_tools(FakeStore(world).client())
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
    assert any("its handle's sentence" in p for p in problems_of(draft, answer, read))


def test_a_worked_out_handle_nobody_read_cannot_be_rendered(world):
    from src.answer.render import Read, Unfillable, render
    from src.answer.schemas import Draft

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
    assert fact.text.endswith("not the section's.") and ", by a confirmed link." in fact.text
    assert "the pipeline Example trunk line" in fact.text
    assert "the pipeline's, not the section's" in fact.text


def test_a_proposed_pipeline_leaves_it_in_none(world):
    (fact,) = links_of(world, "s12")
    assert fact.text.startswith("It is proposed, and not yet decided, that ")
    assert "it is in no pipeline" in fact.text


def test_a_merged_trace_is_another_trace_of_the_same_pipe(world):
    (fact,) = links_of(world, "s13")
    assert fact.what == "same_pipe" and ", by a confirmed link." in fact.text
    assert "facts count as" in fact.text


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
    assert unknown.text.startswith("No source says when the rest of ")
    assert "dropped the rest of it" in unknown.text


def test_a_worked_out_statement_carrying_another_handles_sentence_is_blocked(world):
    draft, answer, read, problems_of = _answer_for(world, "s14")
    answer.statements[0].text = answer.statements[1].text  # W1 cited, W2's words shown
    assert any("its handle's sentence" in p for p in problems_of(draft, answer, read))


def near(world, code):
    store = FakeStore(world).client()
    feature = store.feature(world["codes"][code])
    return {
        next(c for c, i in world["codes"].items() if i == sid): (meets, gap)
        for sid, meets, gap in context.find_neighbours(store, feature).found
    }


def test_neighbours_are_found_by_how_they_are_drawn(world):
    assert near(world, "s14") == {"s15": ("end_to_end", 0.0)}  # d19 is its twin, not a neighbour
    assert near(world, "s16") == {"s15": ("end_to_middle", 0.0)}
    assert set(near(world, "s15")) >= {"s14", "s16"}
    assert "s18" not in near(world, "s15")  # crossing is not touching
    assert near(world, "s17") == {}  # a near miss
    assert near(world, "s18") == {}


@pytest.mark.parametrize("code", ["s14", "s15", "s16", "s17", "s18"])
def test_what_is_drawn_touching_is_grounded_by_an_independent_check(world, code):
    from evals.score import ungrounded

    draft, answer, read, problems_of = _answer_for(world, code)
    assert problems_of(draft, answer, read) == []
    assert ungrounded(answer.model_dump(), world) == []
    for statement in answer.statements:
        assert "connected" not in statement.text


def test_touching_said_of_two_lines_that_only_cross_is_ungrounded(world):
    from evals.score import ungrounded

    s15, s18 = world["codes"]["s15"], world["codes"]["s18"]
    bad = {
        "statements": [
            {
                "kind": "worked_out",
                "text": "Worked out from the traced lines: a is drawn touching b: their ends meet.",
                "refs": [{"type": "feature", "id": s15}, {"type": "feature", "id": s18}],
            }
        ]
    }
    assert any("not drawn touching" in p for p in ungrounded(bad, world))


def test_a_neighbours_claim_always_says_whose_it_is(world):
    from src.answer.render import render
    from src.answer.schemas import Draft

    _, _, read, _ = _answer_for(world, "s14")
    owner = next(
        c
        for c in read.claims.values()
        if c["feature_id"] == world["codes"]["s15"] and c["attribute_key"] == "owner"
    )
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "fact",
                    "text": "",
                    "refs": [{"key": "c", "type": "claim", "id": owner["id"]}],
                }
            ]
        }
    )
    text = render(draft, read).statements[0].text
    assert text.startswith("For section ")


def _section(fid, links, claims=()):
    return {"id": fid, "kind": "section", "label": None, "claims": list(claims), "links": links}


def _link(rel, a, b, status="confirmed"):
    return {
        "id": f"{rel}-{a}-{b}",
        "relation": rel,
        "status": status,
        "from_feature_id": a,
        "to_feature_id": b,
    }


def test_an_overlap_is_said_the_way_store_holds_it():
    a, b = "a" * 8, "b" * 8
    link = _link("overlaps", a, b)
    (fact,) = context.link_facts(_section(a, [link]), {b: _section(b, [link])}, lambda: "W1")
    assert f"section {short_id(a)} runs along part of section {short_id(b)}" in fact.text


def test_a_section_in_a_pipeline_is_never_said_to_be_in_none():
    a, l1, l2 = "a" * 8, "c" * 8, "d" * 8
    links = [_link("part_of", a, l1), _link("part_of", a, l2, "proposed")]
    line = lambda i: {"id": i, "kind": "line", "label": None, "claims": [], "links": []}
    counter = itertools.count(1)
    facts_ = context.link_facts(
        _section(a, links), {l1: line(l1), l2: line(l2)}, lambda: f"W{next(counter)}"
    )
    assert not any("in no pipeline" in f.text for f in facts_)


def test_an_end_that_could_not_be_read_is_not_known_never_none(world):
    store = FakeStore(world).client()
    section = store.feature(world["codes"]["s09"])
    found = context.edition_facts(section, {}, context.Editions([], True), lambda: "W1")
    (unknown,) = by(found, "not_traced_later")
    assert not by(found, "removal")
    assert "could not be read in full" in unknown.text
    assert "No line traced as gone is confirmed" not in unknown.text


def test_a_link_store_has_no_words_for_is_said_as_it_is():
    a, b = "a" * 8, "b" * 8
    link = _link("serves", a, b)
    (fact,) = context.link_facts(_section(a, [link]), {b: _section(b, [link])}, lambda: "W1")
    assert "serves link between" in fact.text and "second pipe" not in fact.text


# A sentence the model writes about what code worked out: values through slots only.


def _written(world, code, text, pick):
    """One worked_out statement with the model's own text, about a section's place and
    length. `pick` names the facts by a value each holds: {"w1": "km"}."""
    from src.answer.grounding import problems_of, reads_from
    from src.answer.render import render
    from src.answer.schemas import Draft
    from src.tools.make import make_tools

    _, read_context, *_ = make_tools(FakeStore(world).client())
    read = reads_from([read_context.func(world["codes"][code])[1]])
    handle = {
        key: next(h for h, w in read.worked.items() if value in (w.get("values") or {}))
        for key, value in pick.items()
    }
    refs = [{"key": k, "type": "worked_out", "id": h} for k, h in handle.items()]
    draft = Draft.model_validate(
        {"statements": [{"kind": "worked_out", "text": text, "refs": refs}]}
    )
    return draft, read, render, problems_of


def test_a_written_sentence_takes_its_values_from_what_code_worked_out(world):
    from evals.score import ungrounded

    draft, read, render, problems_of = _written(
        world,
        "s01",
        "It is about {w1.km} long as drawn, in {w2.states}, by today's towns {w3.towns}.",
        {"w1": "km", "w2": "states", "w3": "towns"},
    )
    answer = render(draft, read)
    text = answer.statements[0].text
    assert text.startswith("It is about 76 km long as drawn, in Oklahoma, by today's towns Tribbey")
    assert [r.type for r in answer.statements[0].refs] == ["feature"]  # the section, no map
    assert problems_of(draft, answer, read) == []
    assert ungrounded(answer.model_dump(), world) == []


@pytest.mark.parametrize(
    ("text", "why"),
    [
        ("It is about 80 km long, or {w1.km}.", "a number in your own words"),
        ("It passes Tulsa and is {w1.km} long.", "a name or capitalised word"),
        ("It was built {w1.km} long.", "'built' in your own words"),
        ("It serves towns along {w1.km}.", "'serves' in your own words"),
        ("The store has it at {w1.km}.", "'store' is a word of the system"),
        ("The printing gives {w1.km}.", "'printing' is a word of the system"),
    ],
)
def test_a_written_sentence_with_a_value_of_its_own_is_blocked(world, text, why):
    draft, read, render, problems_of = _written(world, "s01", text, {"w1": "km"})
    assert any(why in p for p in problems_of(draft, render(draft, read), read))


@pytest.mark.parametrize(
    ("text", "pick", "why"),
    [
        ("It is long.", {"w1": "km"}, "no slot uses it"),
        ("It is {w1.furlongs} long.", {"w1": "km"}, "has no value 'furlongs'"),
        ("It is {w9.km} long.", {"w1": "km"}, "names a key that is not in refs"),
    ],
)
def test_a_written_sentence_that_cannot_be_filled_is_not_shown(world, text, pick, why):
    from src.answer.render import Unfillable

    draft, read, render, _ = _written(world, "s01", text, pick)
    with pytest.raises(Unfillable, match=why):
        render(draft, read)


def test_a_wrong_length_in_a_written_sentence_fails_the_independent_check(world):
    from evals.score import ungrounded

    draft, read, render, _ = _written(world, "s01", "It is {w1.km} long.", {"w1": "km"})
    answer = render(draft, read).model_dump()
    answer["statements"][0]["text"] = "It is 99 km long."
    assert any("99 km" in p for p in ungrounded(answer, world))
    answer["statements"][0]["text"] = "It is 76 km long, in Kansas."
    assert any("Kansas" in p for p in ungrounded(answer, world))


def test_one_attached_section_is_it_and_several_keep_their_names(world):
    _, answer, _, _ = _answer_for(world, "s01")
    name = f"section {short_id(world['codes']['s01'])}"
    texts = [s.text for s in answer.statements]
    assert not [t for t in texts if name in t]
    assert any(t.startswith("It is about 76 km") for t in texts)
    assert any(t.startswith("Its drawn line lies in Oklahoma") for t in texts)


def test_towns_in_a_written_sentence_are_said_to_be_todays(world):
    draft, read, render, problems_of = _written(
        world, "s01", "It passes {w1.towns}.", {"w1": "towns"}
    )
    assert any("towns are today's" in p for p in problems_of(draft, render(draft, read), read))
    draft, read, render, problems_of = _written(
        world, "s01", "It runs near today's towns {w1.towns}.", {"w1": "towns"}
    )
    assert problems_of(draft, render(draft, read), read) == []


def test_it_is_what_was_attached_even_when_its_pipeline_was_read_too(world):
    from src.answer.grounding import reads_from
    from src.answer.render import as_it, feature_name
    from src.tools.make import make_tools

    read_feature, read_context, *_ = make_tools(FakeStore(world).client())
    section, pipeline = world["codes"]["s02"], world["codes"]["l01"]
    read = reads_from(
        [
            read_feature.func(section)[1],
            read_feature.func(pipeline)[1],
            read_context.func(section)[1],
        ]
    )
    name = feature_name(read.features[section])
    sentence = f"{name} is about 76 km long as drawn."
    assert as_it(sentence, read) == sentence  # two things read: nobody said which
    read.asked_about = [section]
    assert as_it(sentence, read) == "It is about 76 km long as drawn."
    assert as_it(f"Along {name}'s drawn line.", read) == "Along its drawn line."


# In no pipeline: said only when no link, confirmed or proposed, puts it in one.


def _no_pipeline(world, code):
    feature = FakeStore(world).client().feature(world["codes"][code])
    return context.no_pipeline_fact(feature, lambda: "W1")


def test_a_section_no_link_puts_in_a_pipeline_is_said_to_be_in_none(world):
    (fact,) = _no_pipeline(world, "s01")
    assert fact.what == "pipeline" and fact.text.endswith("is not in a pipeline.")
    assert fact.rests_on == [world["codes"]["s01"]]


def test_a_section_in_a_pipeline_or_proposed_for_one_gets_no_such_line(world):
    assert _no_pipeline(world, "s16") == []
    assert _no_pipeline(world, "s12") == []


def test_a_rejected_link_leaves_it_in_no_pipeline():
    a, l1 = "a" * 8, "c" * 8
    (fact,) = context.no_pipeline_fact(
        _section(a, [_link("part_of", a, l1, "rejected")]), lambda: "W1"
    )
    assert "not in a pipeline" in fact.text


def test_a_pipeline_is_never_said_to_be_in_no_pipeline():
    line = {"id": "c" * 8, "kind": "line", "label": None, "claims": [], "links": []}
    assert context.no_pipeline_fact(line, lambda: "W1") == []
