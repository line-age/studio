"""Several sections taken together (together.py): compared when two, summarised when
more. Code's sentences, on the invented world."""

import json

import pytest

from evals.fake_store import FakeStore, load_world
from src.answer.grounding import problems_of, reads_from
from src.answer.render import render
from src.answer.schemas import Draft
from src.tools.make import make_tools


@pytest.fixture(scope="module")
def world():
    return load_world("small")


def together(world, *codes):
    tool = make_tools(FakeStore(world).client())[3]
    content, artifact = tool.func([world["codes"][c] for c in codes])
    said = {w["about"]: w["text"] for w in json.loads(content)["worked_out"]}
    return said, artifact


def test_a_value_only_one_has_is_given_and_the_other_is_said_to_have_none(world):
    said, _ = together(world, "s01", "s02")
    assert said["owner"].startswith("The owner is known only for Sampletown lateral: ")
    assert "Example Pipe Line Co. No source gives it for section" in said["owner"]


def test_what_neither_has_is_said_once_for_both(world):
    said, _ = together(world, "s01", "s02")
    assert said["operator"] == "No source gives the operator of either section."


def test_two_first_shown_on_the_same_map_are_never_ranked(world):
    said, _ = together(world, "s01", "s02")
    assert said["first_map"].endswith("are both first shown on the 1932 map.")
    assert "earlier" not in said["first_map"]


def test_the_one_shown_earlier_is_named_and_a_map_year_is_no_build_date(world):
    said, _ = together(world, "s02", "s05")
    assert "so Sampletown lateral is shown earlier." in said["first_map"]
    assert said["first_map"].endswith("A map year is not a build date.")
    for word in ("older", "built"):
        assert word not in said["first_map"]


def test_with_no_map_date_for_one_which_is_earlier_is_not_known(world):
    said, _ = together(world, "s12", "s16")
    assert "so which is shown earlier is not known." in said["first_map"]


def test_the_longer_one_is_named_with_both_lengths(world):
    said, _ = together(world, "s12", "s16")
    assert "about 77 km (48 miles) long as drawn" in said["length"]
    assert "about 45 km (28 miles)" in said["length"]
    assert said["length"].endswith(", so section a9121d7a is longer.")


def test_lengths_that_round_the_same_are_not_ranked(world):
    said, _ = together(world, "s01", "s02")
    assert "are each about 76 km (47 miles) long as drawn." in said["length"]
    assert "longer" not in said["length"]


def test_the_same_pipeline_is_named(world):
    said, _ = together(world, "s06", "s07")
    assert said["pipeline"].endswith("are both in the pipeline Example trunk line.")


def test_in_no_pipeline_and_a_proposal_is_said_as_proposed(world):
    said, _ = together(world, "s12", "s16")
    assert "is in the pipeline Example trunk line; " in said["pipeline"]
    assert "is not in a pipeline. It is proposed, and not yet decided, that" in said["pipeline"]
    said, _ = together(world, "s01", "s02")
    assert said["pipeline"].startswith("Neither ") and "is in a pipeline." in said["pipeline"]


def test_two_drawn_touching_are_never_said_to_be_connected(world):
    said, _ = together(world, "s06", "s07")
    assert "is drawn touching" in said["touching"]
    assert said["touching"].endswith("Lines drawn touching do not prove the pipes joined.")
    assert "connected" not in said["touching"]


def test_two_apart_are_said_with_how_far(world):
    said, _ = together(world, "s01", "s02")
    assert "are not drawn touching: " in said["touching"] and "about 18 km from" in said["touching"]


def test_the_states_of_two_say_what_they_share(world):
    said, _ = together(world, "s02", "s11")
    assert said["states"].endswith("in Oklahoma and Texas. Both run through Oklahoma.")
    said, _ = together(world, "s01", "s02")
    assert said["states"].endswith("both lie in Oklahoma.")


MANY = ("s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10")


def test_many_sections_are_counted_with_the_exceptions_by_name(world):
    said, _ = together(world, *MANY)
    assert said["owner"].startswith("The owner is known for 2 of the 10 sections: ")
    assert "No source gives it for 8: " in said["owner"]
    assert said["name"] == "No source names any of the 10 sections."
    assert said["pipeline"].startswith("2 of the 10 sections are in a pipeline: ")
    assert "Not in a pipeline: " in said["pipeline"]
    assert "touching" not in said  # a pair's fact; never said of many


def test_many_sections_first_maps_are_grouped_by_map(world):
    said, _ = together(world, *MANY)
    assert said["first_map"].startswith("First shown: on the 1926 map, ")
    assert "; on the 1932 map, " in said["first_map"] and "; on the 1938 map, " in said["first_map"]


def test_many_sections_get_a_total_length_and_the_two_ends(world):
    said, _ = together(world, *MANY)
    assert said["length"].startswith("Together the 10 sections are about 756 km (470 miles)")
    assert "The longest is " in said["longest"] and "; the shortest is " in said["longest"]


def test_many_sections_states_are_counted(world):
    said, _ = together(world, *MANY)
    assert said["states"].startswith("Of the 10 sections, 5 lie in Arkansas, ")


def test_sections_all_alike_are_said_as_all(world):
    said, _ = together(world, "s01", "s02", "s03")
    assert said["first_map"] == "All 3 sections are first shown on the 1932 map."


def test_one_section_or_a_pipeline_is_not_taken_together(world):
    tool = make_tools(FakeStore(world).client())[3]
    assert tool.func([world["codes"]["s01"]]) == ("Give two or more sections.", {})
    content, artifact = tool.func([world["codes"]["s01"], world["codes"]["l01"]])
    assert content == "Only sections are taken together." and artifact == {}


def test_a_section_that_is_gone_is_said_to_be_gone(world):
    tool = make_tools(FakeStore(world).client())[3]
    gone = "00000000-0000-4000-8000-00000000dead"
    _, artifact = tool.func([world["codes"]["s01"], gone])
    assert artifact == {"not_found": gone}


def test_a_together_sentence_is_shown_as_code_wrote_it_and_passes_the_check(world):
    _, artifact = together(world, "s02", "s05")
    read = reads_from([artifact])
    read.asked_about = [world["codes"]["s02"], world["codes"]["s05"]]
    first = next(w for w in artifact["worked_out"] if "shown earlier" in w["text"])
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "worked_out",
                    "text": "",
                    "refs": [{"key": "w1", "type": "worked_out", "id": first["handle"]}],
                }
            ]
        }
    )
    answer = render(draft, read)
    assert answer.statements[0].text == first["text"]
    assert problems_of(draft, answer, read) == []


def test_a_together_sentence_the_model_rewrote_is_blocked(world):
    _, artifact = together(world, "s02", "s05")
    read = reads_from([artifact])
    first = next(w for w in artifact["worked_out"] if "shown earlier" in w["text"])
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "worked_out",
                    "text": "The first one is older.",
                    "refs": [{"key": "w1", "type": "worked_out", "id": first["handle"]}],
                }
            ]
        }
    )
    try:
        answer = render(draft, read)
        problems = problems_of(draft, answer, read)
    except Exception as error:  # noqa: BLE001 - blocked either way
        problems = [str(error)]
    assert problems


def test_a_name_is_said_once_not_as_the_name_of_itself(world):
    said, _ = together(world, "s02", "s11")
    assert said["name"].startswith("Only one has a name: Mockville loop. No source names ")
    said, _ = together(world, "s01", "s02")
    assert said["name"] == "No source names either section."
    said, _ = together(world, "s01", "s02", "s11")
    assert said["name"].startswith("1 of the 3 sections has a name: Mockville loop. ")


# The score's own recompute (evals/score.py): every true sentence passes, a false one fails.

GROUPS = [
    ("s01", "s02"),
    ("s02", "s11"),
    ("s06", "s07"),
    ("s02", "s05"),
    ("s12", "s16"),
    ("s01", "s02", "s03"),
    ("s01", "s03"),
    ("s01", "s02", "s11"),
    MANY,
]


def _scored(world, codes, text):
    from evals.score import _worked_out_problems

    refs = [{"type": "feature", "id": world["codes"][c]} for c in codes]
    return _worked_out_problems("statement", text, refs, world)[0]


@pytest.mark.parametrize("codes", GROUPS, ids=lambda c: "+".join(c))
def test_the_score_passes_every_sentence_code_makes(world, codes):
    said, _ = together(world, *codes)
    for about, text in said.items():
        assert _scored(world, codes, text) == [], (about, text)


@pytest.mark.parametrize(
    ("codes", "about", "old", "new"),
    [
        (("s02", "s05"), "first_map", "so Sampletown lateral is", "so section aa16d282 is"),
        (("s02", "s05"), "first_map", "1938", "1926"),
        (("s01", "s02"), "first_map", "1932", "1938"),
        (("s12", "s16"), "length", "so section a9121d7a is", "so section 7707ea05 is"),
        (("s12", "s16"), "length", "45 km", "95 km"),
        (("s01", "s02"), "owner", "Sampletown lateral: ", "section 06a875ca: "),
        (MANY, "owner", "2 of the 10", "4 of the 10"),
        (MANY, "owner", "for 8: section 06a875ca, ", "for 8: "),
        (MANY, "pipeline", "2 of the 10", "3 of the 10"),
        (MANY, "length", "756 km", "956 km"),
        (MANY, "states", "5 lie in Arkansas", "7 lie in Arkansas"),
        (MANY, "first_map", "on the 1926 map", "on the 1932 map"),
    ],
)
def test_the_score_catches_a_sentence_that_is_not_true(world, codes, about, old, new):
    said, _ = together(world, *codes)
    assert old in said[about], said[about]
    assert _scored(world, codes, said[about].replace(old, new, 1)) != []


def test_the_score_catches_a_pipeline_said_of_sections_in_none(world):
    text = "section 06a875ca and Sampletown lateral are both in the pipeline Example trunk line."
    assert _scored(world, ("s01", "s02"), text) != []
    text = "2 of the 10 sections are in a pipeline: x. Not in a pipeline: section 06a875ca."
    assert _scored(world, MANY, text) != []


def test_a_value_proposed_and_not_decided_is_said_beside_no_source_gives(world):
    said, _ = together(world, "s01", "s03")
    assert said["owner"].startswith("No source gives the owner of either section. ")
    assert "A value for the owner is proposed, and not decided yet, for section" in said["owner"]
    wrong = said["owner"].replace("for section 7228cfbd", "for section 06a875ca")
    assert _scored(world, ("s01", "s03"), wrong) != []


def test_each_sentence_is_labelled_same_differs_or_nothing_known(world):
    from src.worked_out import together as module

    said, _ = together(world, "s06", "s07")
    labels = {about: module.says(text) for about, text in said.items()}
    assert labels["first_map"] == labels["pipeline"] == labels["touching"] == "same"
    assert labels["diameter"] == "differs" and labels["owner"] == "nothing_known"
    said, _ = together(world, "s02", "s05")
    labels = {about: module.says(text) for about, text in said.items()}
    assert labels["first_map"] == labels["length"] == labels["states"] == "differs"
    assert labels["pipeline"] == "nothing_known"


def test_any_other_fact_the_sections_hold_is_summarised_too():
    from src.worked_out import together as module

    def section(fid, **held):
        claims = [
            {"id": f"{fid}-{key}", "attribute_key": key, "status": "accepted", "value_text": v}
            for key, v in held.items()
        ]
        feature = {"id": fid, "kind": "section", "label": None, "claims": claims, "links": []}
        return module.Section(feature, [])

    pair = [section("a" * 8, flow_direction="eastward"), section("b" * 8, commodity="gas")]
    assert module.other_attributes(pair) == ["commodity", "flow_direction"]
    counter = iter(range(1, 30))
    said = dict(module.together_facts(pair, {}, lambda: f"W{next(counter)}"))
    assert said["flow_direction"].text.startswith("The flow direction is known only for section ")
    assert ": eastward. No source gives it for section " in said["flow_direction"].text
    assert "route" not in said and "status" not in said
