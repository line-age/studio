"""A pipeline as a whole (tools.pipeline_sections): its sections counted and named, and
taken together. On the invented world."""

import json

import pytest

from evals.fake_store import FakeStore, load_world
from evals.score import _worked_out_problems
from src.answer.grounding import problems_of, reads_from
from src.answer.render import render
from src.answer.schemas import Draft
from tests.support import bound_tools


@pytest.fixture(scope="module")
def world():
    return load_world("small")


def sections_of(world, code):
    tool = bound_tools(FakeStore(world).client())[4]
    content, artifact = tool.func(world["codes"][code])
    said = {w["about"]: w["text"] for w in json.loads(content)["worked_out"]}
    return said, artifact


def test_a_pipelines_sections_are_counted_and_named(world):
    said, artifact = sections_of(world, "l01")
    assert said["sections"].startswith("The pipeline Example trunk line has 3 sections: ")
    assert len(artifact["members"]) == 3


def test_its_sections_are_taken_together_without_saying_they_share_the_pipeline(world):
    said, _ = sections_of(world, "l01")
    assert said["length"].startswith("Together the 3 sections are about 195 km (121 miles)")
    assert said["diameter"].startswith("The diameter is known for 1 of the 3 sections: ")
    assert said["states"] == "Of the 3 sections, 2 lie in Arkansas, 1 in Colorado."
    assert "pipeline" not in said and "touching" not in said


def test_a_pipeline_with_only_a_proposed_section_has_none_yet(world):
    said, artifact = sections_of(world, "l02")
    assert said["sections"].startswith("Pipeline ") and " has no sections yet. " in said["sections"]
    assert "It is proposed, and not yet decided, that section" in said["sections"]
    assert said["sections"].endswith("is part of it.")
    assert artifact["members"] == [] and list(said) == ["sections"]


def test_a_section_is_not_a_pipeline_and_a_gone_one_is_said_gone(world):
    tool = bound_tools(FakeStore(world).client())[4]
    assert tool.func(world["codes"]["s01"]) == ("Only a pipeline has sections.", {})
    gone = "00000000-0000-4000-8000-00000000dead"
    assert tool.func(gone)[1] == {"not_found": gone}


def _refs(world, artifact, handle):
    item = next(w for w in artifact["worked_out"] if w["handle"] == handle)
    return [{"type": "feature", "id": i} for i in item["rests_on"] if i in world["features"]], item[
        "text"
    ]


def test_the_score_passes_every_sentence_and_catches_a_wrong_count(world):
    _, artifact = sections_of(world, "l01")
    for item in artifact["worked_out"]:
        refs, text = _refs(world, artifact, item["handle"])
        assert _worked_out_problems("statement", text, refs, world)[0] == [], text
    refs, text = _refs(world, artifact, artifact["worked_out"][0]["handle"])
    wrong = text.replace("has 3 sections", "has 4 sections")
    assert _worked_out_problems("statement", wrong, refs, world)[0] != []
    left_out = text.replace("section 2cf68921, ", "")
    assert _worked_out_problems("statement", left_out, refs, world)[0] != []


def test_a_sentence_about_a_pipelines_sections_passes_the_agents_own_check(world):
    _, artifact = sections_of(world, "l01")
    read = reads_from([artifact])
    read.asked_about = [world["codes"]["l01"]]
    handles = [w["handle"] for w in artifact["worked_out"]]
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "worked_out",
                    "text": "",
                    "refs": [{"key": "w1", "type": "worked_out", "id": h}],
                }
                for h in handles
            ]
        }
    )
    answer = render(draft, read)
    assert problems_of(draft, answer, read) == []
    # One pipeline attached: it is "it", never "the pipeline it".
    assert answer.statements[0].text.startswith("It has 3 sections: ")


def test_todays_towns_along_the_pipelines_sections_are_said_as_todays(world):
    said, artifact = sections_of(world, "l01")
    assert said["towns"].startswith("Today's towns along the 3 sections, as drawn: ")
    item = next(w for w in artifact["worked_out"] if w["text"] == said["towns"])
    refs = [{"type": "feature", "id": i} for i in item["rests_on"] if i in world["features"]]
    assert _worked_out_problems("statement", said["towns"], refs, world)[0] == []
    wrong = said["towns"].replace(", as drawn: ", ", as drawn: Atlantis, ")
    assert _worked_out_problems("statement", wrong, refs, world)[0] != []


def test_a_total_or_a_list_for_the_set_is_neither_shared_nor_a_difference(world):
    from src.worked_out import together

    said, _ = sections_of(world, "l01")
    assert together.says(said["towns"]) == together.says(said["length"]) == "all_of_them"


def test_two_sections_also_get_their_length_in_all():
    from src.worked_out import together

    world = load_world("small")
    store = FakeStore(world).client()
    pair = [together.Section(store.feature(world["codes"][c]), []) for c in ("s12", "s16")]
    text, _ = together.total_length(pair)
    assert text == "Together the 2 sections are about 122 km (76 miles) long as drawn."
    refs = [{"type": "feature", "id": s.id} for s in pair]
    assert _worked_out_problems("statement", text, refs, world)[0] == []
    assert _worked_out_problems("statement", text.replace("122", "222"), refs, world)[0] != []
    assert together.total_length(pair[:1]) is None
