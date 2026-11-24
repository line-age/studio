"""The Edit form filled in by the Agent (an edit_offer): the value is the person's own,
the Agent writes nothing, and what cannot be an edit is never offered."""

import pytest

from evals.fake_store import FakeStore, load_world
from src.answer.grounding import problems_of, reads_from
from src.answer.render import Unfillable, render
from src.answer.schemas import Draft
from tests.support import bound_tools


@pytest.fixture(scope="module")
def world():
    return load_world("small")


def offered(world, words, attribute, value, *codes):
    read_feature = bound_tools(FakeStore(world).client())[0]
    read = reads_from([read_feature.func(world["codes"][c])[1] for c in codes])
    read.words = words
    read.asked_about = [world["codes"][c] for c in codes]
    refs = [
        {"key": f"f{n}", "type": "feature", "id": world["codes"][c]} for n, c in enumerate(codes, 1)
    ]
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "edit_offer",
                    "text": "",
                    "attribute": attribute,
                    "value": value,
                    "refs": refs,
                }
            ]
        }
    )
    answer = render(draft, read)
    return answer.statements[0], problems_of(draft, answer, read)


def test_the_form_is_filled_with_the_persons_own_value(world):
    statement, problems = offered(world, "Set the diameter to 20 in", "diameter", "20 in", "s01")
    assert problems == []
    assert statement.kind == "edit_offer"
    assert statement.edit.target == "sections" and statement.edit.attribute == "diameter"
    assert statement.edit.value == "20 in"
    assert statement.edit.feature_ids == [world["codes"]["s01"]]
    assert statement.text.startswith("I filled in the Edit form: diameter 20 in for ")
    assert statement.text.endswith("Nothing is changed until you save.")


def test_several_sections_take_one_value(world):
    statement, _ = offered(world, "the diameter is 20 in", "diameter", "20 in", "s01", "s03")
    assert len(statement.edit.feature_ids) == 2


def test_a_pipeline_is_edited_through_its_own_form(world):
    statement, _ = offered(world, "rename it to North line", "name", "North line", "l01")
    assert statement.edit.target == "pipeline"


def test_a_value_the_person_did_not_write_is_never_offered(world):
    with pytest.raises(Unfillable, match="own words"):
        offered(world, "Set the owner to whoever it was", "owner", "Standard Oil", "l01")


def test_the_value_is_matched_whatever_the_case_and_spacing(world):
    statement, _ = offered(
        world, "owner:  example  PIPE line co.", "owner", "Example Pipe Line Co.", "l01"
    )
    assert statement.edit.value == "Example Pipe Line Co."


@pytest.mark.parametrize(
    ("attribute", "codes", "why"),
    [
        ("route", ("s01",), "has no route"),
        ("owner", ("s01", "l01"), "attached sections, or for one attached pipeline"),
        ("owner", (), "attached sections, or for one attached pipeline"),
    ],
)
def test_what_the_edit_form_cannot_take_is_not_offered(world, attribute, codes, why):
    with pytest.raises(Unfillable, match=why):
        offered(world, "set it to Example Co.", attribute, "Example Co.", *codes)


def test_an_edit_with_no_value_is_not_offered(world):
    with pytest.raises(Unfillable, match="names the attribute and the value"):
        offered(world, "set the owner", "owner", "", "l01")


def test_a_fact_of_the_pipeline_asked_of_a_section_says_where_it_is_set(world):
    from src.answer.render import FIXED_LINES

    statement, problems = offered(
        world, "Set the owner to Example Co.", "owner", "Example Co.", "s01"
    )
    assert statement.kind == "refusal" and statement.text == FIXED_LINES["edit_on_pipeline"]
    assert statement.edit is None and problems == []
    statement, _ = offered(world, "its diameter is 20 in", "diameter", "20 in", "l01")
    assert statement.text == FIXED_LINES["edit_on_section"]
