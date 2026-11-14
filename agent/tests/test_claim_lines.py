"""A fact about one claim, with no text, is written by code: the model only picks the
claim. Fewer words for the model to write, so an answer about many sections is quick
and is never cut off, and nothing in the sentence is the model's."""

import pytest

from evals.fake_store import FakeStore, load_world
from grounding import problems_of
from render import Read, Unfillable, feature_name, render
from schemas import Draft


@pytest.fixture
def world():
    return load_world("small")


def _read(world, *codes):
    store = FakeStore(world).client()
    read = Read()
    for code in codes:
        read.feature(store.feature(world["codes"][code]))
    return read


def _claim(world, read, code, attribute, status):
    fid = world["codes"][code]
    return next(
        c
        for c in read.claims.values()
        if c["feature_id"] == fid and c["attribute_key"] == attribute and c["status"] == status
    )


def _picked(*claim_ids):
    return Draft.model_validate(
        {
            "statements": [
                {"kind": "fact", "text": "", "refs": [{"key": "c1", "type": "claim", "id": cid}]}
                for cid in claim_ids
            ]
        }
    )


def test_an_accepted_claim_reads_with_its_period_and_source(world):
    read = _read(world, "s02")
    owner = _claim(world, read, "s02", "owner", "accepted")
    answer = render(_picked(owner["id"]), read)
    assert answer.statements[0].text == (
        "The owner is Example Pipe Line Co., by March 1932. "
        "The source is Example Gazette, vol. 32 no. 3, p. 41."
    )
    assert problems_of(_picked(owner["id"]), answer, read) == []


def test_a_proposal_says_who_proposed_it_and_that_nobody_decided(world):
    read = _read(world, "s03")
    proposed = _claim(world, read, "s03", "owner", "candidate")
    text = render(_picked(proposed["id"]), read).statements[0].text
    assert text.startswith(("A tool proposed ", "A person proposed "))
    assert "as the owner" in text and "Nobody has decided on it yet." in text
    assert "The source is " in text


def test_about_several_sections_each_sentence_names_its_own(world):
    read = _read(world, "s02", "s05")
    a = _claim(world, read, "s02", "owner", "accepted")
    b = _claim(world, read, "s05", "operator", "accepted")
    first, second = (s.text for s in render(_picked(a["id"], b["id"]), read).statements)
    names = [feature_name(read.features[world["codes"][c]]) for c in ("s02", "s05")]
    assert first.startswith(f"For {names[0]}, the owner is ")
    assert second.startswith(f"For {names[1]}, the operator is ")


def test_a_claim_held_through_a_merged_trace_is_said_of_the_section(world):
    from grounding import reads_from
    from tools import make_tools

    (read_feature,) = make_tools(FakeStore(world).client())
    read = reads_from([read_feature.func(world["codes"]["s13"])[1]])
    owner = _claim(world, read, "d13", "owner", "accepted")
    text = render(_picked(owner["id"]), read).statements[0].text
    assert text.startswith("The owner is ")
    assert "d13" not in text and world["codes"]["d13"][:8] not in text


def test_a_route_claim_cannot_be_said_as_a_value(world):
    read = _read(world, "s02")
    route = _claim(world, read, "s02", "route", "accepted")
    with pytest.raises(Unfillable):
        render(_picked(route["id"]), read)


def test_a_pipelines_claim_always_says_it_is_the_pipelines(world):
    read = _read(world, "s06", "l01")
    claim = next(
        c
        for c in read.claims.values()
        if c["feature_id"] == world["codes"]["l01"]
        and c["status"] == "accepted"
        and c["attribute_key"] in ("owner", "name", "operator")
    )
    text = render(_picked(claim["id"]), read).statements[0].text
    assert text.startswith(("For the pipeline ", "For pipeline "))
