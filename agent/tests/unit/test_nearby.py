"""The sections nearest one, however far, and how each compares (context.find_nearby,
the find_nearby tool), on the invented world."""

import itertools

import pytest

from evals.fake_store import FakeStore, load_world
from src.answer.render import feature_name
from src.worked_out import context


@pytest.fixture
def world():
    return load_world("small")


def nearby(world, code):
    store = FakeStore(world).client()
    feature = store.feature(world["codes"][code])
    near = context.find_nearby(store, feature)
    read = context.read_many(store, [sid for sid, _ in near.found])
    found = [(read[sid], gap) for sid, gap in near.found]
    counter = itertools.count(1)
    return (
        feature,
        near,
        context.nearby_facts(feature, found, near.unmeasured, lambda: f"W{next(counter)}"),
    )


def name(world, code):
    return feature_name(world["features"][world["codes"][code]])


def test_the_nearest_come_first_and_another_trace_of_it_is_not_one(world):
    _, near, _ = nearby(world, "s14")
    gaps = [gap for _, gap in near.found]
    assert gaps == sorted(gaps) and len(near.found) == context.NEARBY_MAX
    ids = [sid for sid, _ in near.found]
    # s15 meets it, s17 stops short of it: both near. d19 is the same pipe, by its link.
    assert world["codes"]["s15"] in ids and world["codes"]["s17"] in ids
    assert world["codes"]["d19"] not in ids and world["codes"]["s14"] not in ids


def test_it_looks_further_out_until_it_finds_some(world):
    # Nothing is within 100 km of s20: the search keeps going and says how far.
    _, near, found = nearby(world, "s20")
    assert near.found and near.found[0][1] > context.FAR_M
    assert found[0].text.startswith("The nearest section is about ")
    assert "so how alike they are says little" in found[0].text


def test_a_shared_owner_and_a_different_one_are_said(world):
    _, _, found = nearby(world, "s20")
    shared = next(f for f in found if name(world, "s15") in f.text)
    assert "Same owner (Invented Natural Gas Corp.)" in shared.text
    differs = next(f for f in found if "different owner" in f.text)
    assert "here, Example Pipe Line Co. there" in differs.text


def test_a_near_one_is_not_said_to_be_far(world):
    _, _, found = nearby(world, "s14")
    assert not any("says little" in f.text for f in found)
    assert "drawn within 1 km of" in found[0].text


def test_never_the_same_pipe_or_connected(world):
    for code in ("s14", "s20", "s02", "s10"):
        for fact in nearby(world, code)[2]:
            assert "connected" not in fact.text and "same pipe" not in fact.text
            assert fact.what == "nearby"


def test_every_comparison_rests_on_the_claims_it_names(world):
    feature, _, found = nearby(world, "s20")
    shared = next(f for f in found if "Same owner" in f.text)
    claims = {c["id"]: c for f in world["features"].values() for c in f.get("claims") or []}
    owners = [claims[i] for i in shared.rests_on if i in claims]
    assert {c["attribute_key"] for c in owners} >= {"owner"}
    assert feature["id"] in shared.rests_on


def _answer_for(world, code):
    from src.answer.grounding import problems_of, reads_from
    from src.answer.render import render
    from src.answer.schemas import Draft
    from src.tools.make import make_tools

    _, _, find_nearby, *_ = make_tools(FakeStore(world).client())
    read = reads_from([find_nearby.func(world["codes"][code])[1]])
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
    return draft, render(draft, read), read, problems_of


@pytest.mark.parametrize("code", ["s14", "s20", "s02", "s10"])
def test_what_it_finds_passes_the_answer_check(world, code):
    from evals.score import ungrounded

    draft, answer, read, problems_of = _answer_for(world, code)
    assert answer.statements
    assert problems_of(draft, answer, read) == []
    assert ungrounded(answer.model_dump(), world) == []
    assert all(s.text.startswith("Inferred") or s.kind == "worked_out" for s in answer.statements)


def test_its_claims_are_the_neighbours_never_the_section_asked_about(world):
    from src.answer.grounding import reads_from
    from src.tools.make import make_tools

    _, _, find_nearby, *_ = make_tools(FakeStore(world).client())
    _, artifact = find_nearby.func(world["codes"]["s20"])
    read = reads_from([artifact])
    # Read for context only: a neighbour's claim is never counted as s20's own.
    assert world["codes"]["s15"] in read.context_only


def test_asked_twice_it_reads_once(world):
    from src.tools.make import make_tools

    _, _, find_nearby, *_ = make_tools(FakeStore(world).client())
    find_nearby.func(world["codes"]["s14"])
    content, artifact = find_nearby.func(world["codes"]["s14"])
    assert "already looked" in content and artifact == {}


def test_a_distance_changed_is_caught_by_the_independent_check(world):
    from evals.score import ungrounded

    _, answer, _, _ = _answer_for(world, "s20")
    bad = answer.model_dump()
    first = next(s for s in bad["statements"] if " km from" in s["text"])
    first["text"] = first["text"].replace("about 1", "about 4", 1)
    assert any("km apart" in p for p in ungrounded(bad, world))
