"""What is not known yet (context.gap_facts), why an answer says what it says (the
why-lines), and a caution said once per answer (render.say_once)."""

import re

import pytest

from evals.fake_store import FakeStore, load_world
from src.answer.render import FIXED_LINES, SAID_ONCE, Read, Unfillable, render_statement, say_once
from src.answer.schemas import Answer, DraftStatement, Statement
from src.worked_out import context


@pytest.fixture(scope="module")
def world():
    return load_world("small")


def gaps(world, code):
    feature = FakeStore(world).client().feature(world["codes"][code])
    counter = iter(range(1, 9))
    return {f.what: f for f in context.gap_facts(feature, [], lambda: f"W{next(counter)}")}


def test_when_it_was_built_is_not_known_and_the_first_map_is_no_build_date(world):
    built = gaps(world, "s01")["built"]
    assert built.text.startswith("No source gives a build date for section ")
    assert ". The 1932 map is the first to show it" in built.text
    assert "built" not in built.text  # the word a guard looks for in every answer
    assert built.text.endswith("a map year is not a build date.")
    assert len(built.rests_on) == 2  # the section, and the map claim the year comes from


def test_a_section_no_map_shows_says_only_that_it_is_not_known(world):
    built = gaps(world, "s12")["built"]
    assert built.text.startswith("No source gives a build date for") and "map" not in built.text


def test_what_is_missing_is_one_line_naming_each_fact(world):
    missing = gaps(world, "s01")["missing"]
    assert ": the name, the owner, the operator and the diameter." in missing.text
    assert missing.text.endswith("A build date is not known either.")


def test_a_fact_a_source_gives_is_not_listed_as_missing(world):
    missing = gaps(world, "s02")["missing"]
    assert "the owner" not in missing.text and "the diameter" not in missing.text
    assert "the name" in missing.text and "the operator" in missing.text


def test_a_proposal_waiting_is_said_beside_what_is_missing(world):
    missing = gaps(world, "s03")["missing"]
    assert "A value is proposed, and not decided yet, for the owner." in missing.text


@pytest.mark.parametrize("topic", ["towns", "map_year", "touching", "drawn_length", "unknown"])
def test_a_why_question_gets_its_fixed_line_whatever_the_model_wrote(topic):
    draft = DraftStatement(kind="help", topic=topic, text="Because I say so.")
    assert render_statement(draft, Read()).text == FIXED_LINES[f"why_{topic}"]


def test_help_with_a_topic_that_is_not_its_own_is_blocked():
    # Stopped where the draft is read, or where it is rendered: never shown.
    with pytest.raises((Unfillable, ValueError)):
        render_statement(DraftStatement(kind="help", topic="network"), Read())


def test_no_why_line_names_the_system():
    for key, line in FIXED_LINES.items():
        if key.startswith("why_"):
            assert "store" not in line.lower() and "printing" not in line


def test_a_caution_is_kept_on_the_first_line_that_carries_it_only():
    caution = SAID_ONCE[0]
    answer = Answer(
        statements=[
            Statement(kind="worked_out", text=f"a is drawn touching b. {caution}"),
            Statement(kind="worked_out", text=f"c is drawn touching b. {caution}"),
            Statement(kind="worked_out", text="b is about 76 km long as drawn."),
        ]
    )
    texts = [s.text for s in say_once(answer).statements]
    assert texts == [
        f"a is drawn touching b. {caution}",
        "c is drawn touching b.",
        "b is about 76 km long as drawn.",
    ]


def test_a_caution_said_once_is_left_alone():
    answer = Answer(statements=[Statement(kind="worked_out", text=f"x. {SAID_ONCE[1]}")])
    assert say_once(answer).statements[0].text == f"x. {SAID_ONCE[1]}"


def test_every_help_topic_has_its_line_and_none_names_the_system():
    from src.answer.render import HELP_LINES

    for topic, key in HELP_LINES.items():
        draft = DraftStatement(kind="help", topic=topic, text="Whatever the model wrote.")
        line = render_statement(draft, Read()).text
        assert line == FIXED_LINES[key]
        assert not re.search(r"\b(store|printing of store|candidate)\b", line.lower()), topic


def test_the_steps_use_studios_own_menu_words():
    assert "choose Make pipeline" in FIXED_LINES["help_make_pipeline"]
    assert "choose Edit" in FIXED_LINES["help_edit"] and "Edit pipeline" in FIXED_LINES["help_edit"]
    assert "Ask the Agent" in FIXED_LINES["help_ask"]


def test_the_steps_point_where_studio_shows_sources_and_a_pipelines_facts():
    # The sources pop-up opens from a fact in the right panel; a pipeline's own
    # facts are under its row in the list, not in the right panel.
    assert "click the fact in the right panel" in FIXED_LINES["help_sources"]
    assert "under its row in the list" in FIXED_LINES["help_pipeline_facts"]
    assert "owner" in FIXED_LINES["help_pipeline_facts"]
