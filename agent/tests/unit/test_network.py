"""Questions across the whole network (network.py, tools.find_sections), on the two
invented worlds; and the score's own recount of every count."""

import json
import re

import pytest

from evals.fake_store import FakeStore, load_world
from evals.score import _worked_out_problems
from src.answer.grounding import problems_of, reads_from
from src.answer.render import render
from src.answer.schemas import Draft
from src.tools.make import make_tools

RULES = [
    {},
    {"lacking": "owner"},
    {"lacking": "name"},
    {"lacking": "operator"},
    {"lacking": "diameter"},
    {"first_shown": 1932},
    {"first_shown": 1800},
    {"state": "Oklahoma"},
    {"state": "arkansas"},
    {"in_pipeline": True},
    {"in_pipeline": False},
    {"proposal_waiting": True},
    {"lacking": "diameter", "state": "Arkansas"},
    {"lacking": "owner", "first_shown": 1938, "in_pipeline": False},
    {"diameter": "20 in"},
    {"diameter": "16"},
    {"end": "proposed"},
    {"end": "no_longer_shown"},
    {"longer_than_km": 76},
    {"shorter_than_km": 50},
    {"diameter": "20 in", "state": "Oklahoma", "longer_than_km": 10},
]
PIPELINE_RULES = [
    {},
    {"lacking": "owner"},
    {"lacking": "name"},
    {"lacking": "operator"},
    {"proposed_only": True},
    {"proposed_only": False},
    {"lacking": "operator", "proposed_only": False},
]


@pytest.fixture(scope="module", params=["small", "wide"])
def world(request):
    return load_world(request.param)


def find(world, **rules):
    tool = make_tools(FakeStore(world).client())[5]
    content, artifact = tool.func(**rules)
    return (json.loads(content)["worked_out"][0]["text"] if artifact else content), artifact


def _refs(artifact):
    return [{"type": "feature", "id": i} for i in artifact["worked_out"][0]["rests_on"]]


@pytest.mark.parametrize("rules", RULES, ids=lambda r: ",".join(r) or "none")
def test_every_count_is_the_one_the_score_makes_again_from_the_world(world, rules):
    text, artifact = find(world, **rules)
    assert _worked_out_problems("statement", text, _refs(artifact), world)[0] == [], text


def test_a_wrong_count_a_wrong_total_or_a_wrong_name_is_caught():
    world = load_world("small")
    text, artifact = find(world, lacking="owner")
    assert text.startswith("Sections with no known owner: 14 of the 20 in the network.")
    refs = _refs(artifact)
    for old, new in (("14 of", "15 of"), ("of the 20", "of the 21")):
        assert _worked_out_problems("statement", text.replace(old, new), refs, world)[0] != []
    has_owner = [{"type": "feature", "id": world["codes"]["s02"]}]
    assert _worked_out_problems("statement", text, has_owner, world)[0] != []


def test_the_rule_is_said_in_the_sentence_and_rules_combine():
    world = load_world("small")
    text, _ = find(world, lacking="diameter", state="Arkansas")
    assert text.startswith("Sections with no known diameter and in Arkansas: 4 of the 20")
    assert " They are: " in text


def test_no_rule_counts_the_network_and_its_pipelines():
    text, _ = find(load_world("small"))
    assert text == "The network has 20 sections."


def test_only_the_first_ten_are_named_and_the_rest_counted():
    text, artifact = find(load_world("wide"), lacking="owner")
    assert " The first 10 are: " in text and len(artifact["worked_out"][0]["rests_on"]) == 10


def test_none_and_one_are_said_plainly():
    world = load_world("small")
    assert find(world, first_shown=1800)[0] == (
        "Sections first shown on the 1800 map: 0 of the 20 in the network."
    )
    text, _ = find(world, state="Colorado", in_pipeline=True)
    assert ": 1 of the 20 in the network. It is section " in text


def test_a_state_that_is_none_and_a_fact_that_cannot_be_lacked_are_refused():
    world = load_world("small")
    assert find(world, state="Narnia") == (
        "There is no US state called Narnia. Give its full name.",
        {},
    )
    assert find(world, lacking="route")[1] == {}


def test_a_listing_that_was_cut_off_says_so():
    from src.worked_out import network

    world = load_world("small")
    sections = network.sections_of(FakeStore(world).client().sections().rows)
    fact = network.network_fact(sections, sections[:2], ["in Oklahoma"], True, lambda: "W1")
    assert fact.text.endswith("The list of sections was cut off, so there may be more.")


def test_the_sentence_passes_the_agents_own_check_and_names_link_to_sections():
    world = load_world("small")
    _, artifact = find(world, state="Oklahoma")
    read = reads_from([artifact])
    handle = artifact["worked_out"][0]["handle"]
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "worked_out",
                    "text": "",
                    "refs": [{"key": "w1", "type": "worked_out", "id": handle}],
                }
            ]
        }
    )
    answer = render(draft, read)
    assert problems_of(draft, answer, read) == []
    assert len([r for r in answer.statements[0].refs if r.type == "feature"]) == 6


def pipelines(world, **rules):
    tool = make_tools(FakeStore(world).client())[6]
    content, artifact = tool.func(**rules)
    return (json.loads(content)["worked_out"][0]["text"] if artifact else content), artifact


@pytest.mark.parametrize("rules", PIPELINE_RULES, ids=lambda r: ",".join(r) or "none")
def test_every_count_of_pipelines_is_made_again_by_the_score(world, rules):
    text, artifact = pipelines(world, **rules)
    assert _worked_out_problems("statement", text, _refs(artifact), world)[0] == [], text


def test_pipelines_are_counted_named_and_a_wrong_count_is_caught():
    world = load_world("small")
    assert pipelines(world)[0] == "The network has 2 pipelines, 1 of them only proposed."
    text, artifact = pipelines(world, lacking="operator", proposed_only=False)
    assert text.endswith(": 1 of the 2 in the network. It is the pipeline Example trunk line.")
    wrong = text.replace("1 of the 2", "2 of the 2")
    assert _worked_out_problems("statement", wrong, _refs(artifact), world)[0] != []
    assert pipelines(world, lacking="diameter")[1] == {}


def test_a_diameter_is_taken_as_a_person_writes_it():
    from src.worked_out import network

    for said in ("31", "31 in", "31-inch", "31 inches", '31"', " 31 in. "):
        assert network.diameter_named(said) == "31 in", said
    assert network.diameter_named("big") is None
    world = load_world("small")
    assert find(world, diameter="big") == ('Give the diameter in inches, as "31 in".', {})
    assert find(world, end="gone")[1] == {}


def test_a_wrong_count_by_diameter_end_or_length_is_caught():
    world = load_world("small")
    for rules in ({"diameter": "20 in"}, {"end": "proposed"}, {"longer_than_km": 76}):
        text, artifact = find(world, **rules)
        wrong = re.sub(r": (\d+) of the", lambda m: f": {int(m.group(1)) + 1} of the", text)
        assert _worked_out_problems("statement", wrong, _refs(artifact), world)[0] != [], text
