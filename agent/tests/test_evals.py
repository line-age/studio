import json

import pytest

from evals import report as reports
from evals.cases import CASES, Case, load, question_for
from evals.checks import check
from evals.fake_store import FakeStore, load_world
from evals.mutations import MUTATIONS, seeded
from evals.score import ungrounded
from evals.sync import _example
from render import FIXED_LINES, Read, render
from schemas import Draft


@pytest.fixture(scope="module")
def world():
    return load_world("small")


def faithful(world, code, statements):
    """A good answer, made the way the Agent will make one: a draft, rendered."""
    read = Read()
    client = FakeStore(world).client()
    read.feature(client.feature(world["codes"][code]))
    feature = world["codes"][code]
    by = {(c["attribute_key"], c["status"]): c["id"] for c in read.claims.values()}
    built = []
    for kind, text, refs, attribute in statements:
        resolved = [
            {"key": key, "type": "feature", "id": feature}
            if what == "feature"
            else {"key": key, "type": "claim", "id": by[what]}
            for key, what in refs
        ]
        built.append({"kind": kind, "text": text, "refs": resolved, "attribute": attribute})
    answer = render(Draft.model_validate({"statements": built}), read)
    answer.checked = True
    return answer.model_dump()


GOOD = {
    "s02": [
        (
            "fact",
            "The accepted owner is {c1.value}, {c1.period}, from {c1.source}: {c1.quote}",
            [("c1", ("owner", "accepted"))],
            None,
        ),
        (
            "fact",
            "The accepted diameter is {c2.value}, {c2.period}.",
            [("c2", ("diameter", "accepted"))],
            None,
        ),
    ],
    "s01": [("unknown", "Store does not say who owns this section.", [("f1", "feature")], "owner")],
    "s03": [
        ("unknown", "Store does not say who owns this section.", [("f1", "feature")], "owner"),
        (
            "fact",
            "A tool proposed {c1.value}, {c1.period}. Nobody has decided on it.",
            [("c1", ("owner", "candidate"))],
            None,
        ),
    ],
    "s04": [
        ("unknown", "Store does not say who owns this section.", [("f1", "feature")], "owner"),
        (
            "fact",
            "One value for the owner was rejected: {c1.value}.",
            [("c1", ("owner", "rejected"))],
            None,
        ),
    ],
}


# Cases


def test_every_case_loads_and_names_a_generated_world():
    cases = load()
    assert {c.behaviour for c in cases} >= {"B01", "B02"}
    for case in cases:
        load_world(case.world)
    assert all(c.labeled_by in ("agent-draft", "person") for c in cases)
    assert any(c.split == "held_out" for c in cases if c.behaviour == "B01")


def test_a_behaviours_run_includes_the_cases_it_must_keep_passing():
    assert {c.behaviour for c in load(["B02"])} == {"B01", "B02"}
    assert {c.behaviour for c in load(["B01"])} == {"B01"}


def test_no_case_file_holds_an_id_or_a_real_looking_name():
    text = "".join(p.read_text() for p in CASES.glob("*.jsonl"))
    for line in text.splitlines():
        about = json.loads(line)["question"].get("about", [])
        assert all("id" not in item or item["id"].startswith("00000000-") for item in about)


def test_a_case_that_names_a_world_nobody_made_is_refused():
    from evals.cases import _check

    with pytest.raises(KeyError):
        _check(
            Case(
                id="B01-x",
                behaviour="B01",
                world="copied",
                question={"words": "?"},
                must={"kinds": ["fact"]},
            )
        )


def test_a_cases_stable_id_does_not_change():
    # Pinned: if this moves, a sync makes a second copy of every case in LangSmith.
    case = next(c for c in load() if c.id == "B01-001")
    assert case.example_id == _example(case)["id"] == "3f0c16a6-1649-5333-9b7d-f6081948c1f5"


def test_the_question_is_sent_as_studio_sends_it(world):
    case = next(c for c in load() if c.id == "B02-007")
    question = question_for(case, world)
    assert question["about"][0]["kind"] == "claim" and len(question["about"][0]["id"]) == 36
    assert question["about"][0]["on"]["sectionId"] == world["codes"]["s02"]
    assert set(question) == {"words", "about", "network"}


# The independent re-check


@pytest.mark.parametrize("code", sorted(GOOD))
def test_a_faithful_answer_is_grounded(world, code):
    assert ungrounded(faithful(world, code, GOOD[code]), world) == []


def test_every_seeded_bad_answer_is_caught(world):
    used = set()
    for code, statements in GOOD.items():
        for name, bad in seeded(faithful(world, code, statements)):
            used.add(name)
            assert ungrounded(bad, world), f"{name} on {code} got through"
    assert used == {m.__name__ for m in MUTATIONS}, "a mutation was never tried"


def test_an_unknown_is_ungrounded_when_a_merged_trace_holds_the_value(world):
    s13 = world["codes"]["s13"]
    answer = {
        "statements": [
            {
                "kind": "unknown",
                "text": "Store does not say.",
                "attribute": "owner",
                "refs": [{"type": "feature", "id": s13}],
            }
        ]
    }
    assert any("does hold" in p for p in ungrounded(answer, world))


# The checks


def passes(case_id, world, answer, tools=("read_feature",)):
    case = next(c for c in load() if c.id == case_id)
    return check(case, world, {"answer": answer, "tools": list(tools)})


def test_a_good_answer_passes_its_case(world):
    for case_id, code in (
        ("B01-001", "s01"),
        ("B01-002", "s02"),
        ("B01-003", "s03"),
        ("B01-004", "s04"),
    ):
        feedback = passes(case_id, world, faithful(world, code, GOOD[code]))
        assert feedback["case_passed"]["score"], (case_id, feedback)


def test_a_value_where_store_has_none_fails_the_case(world):
    wrong = faithful(world, "s02", GOOD["s02"])  # an owner, given for a section with none
    feedback = passes("B01-001", world, wrong)
    assert not feedback["case_passed"]["score"]
    assert not feedback["unknown_kept"]["score"] and not feedback["required"]["score"]


def test_an_unchecked_answer_is_not_valid(world):
    answer = faithful(world, "s01", GOOD["s01"])
    answer["checked"] = False
    assert not passes("B01-001", world, answer)["valid"]["score"]


def test_answering_without_reading_store_fails_the_case(world):
    feedback = passes("B01-001", world, faithful(world, "s01", GOOD["s01"]), tools=())
    assert not feedback["tools_ok"]["score"] and not feedback["case_passed"]["score"]


def test_the_not_found_line_is_a_fixed_line():
    assert "not_found" in FIXED_LINES


# The report


def run(**cases):
    def repeat(ok, grounded=True, forbidden=True):
        return {
            "feedback": {
                "case_passed": {"score": ok},
                "no_ungrounded": {"score": grounded},
                "forbidden": {"score": forbidden},
                "required": {"score": ok},
            }
        }

    return {
        "meta": {"name": "t", "model": "m", "commit": "c", "repeat": 3},
        "cases": {
            cid: {
                "behaviour": "B01",
                "split": "dev",
                "labeled_by": label,
                "repeats": [repeat(*r) for r in reps],
            }
            for cid, (label, reps) in cases.items()
        },
    }


def timed(attached, seconds):
    report = run(a=("agent-draft", [(True,)] * len(seconds)))
    case = report["cases"]["a"]
    case["attached"] = attached
    for r, s in zip(case["repeats"], seconds, strict=True):
        r["seconds"] = s
    return report


def test_speed_is_the_median_of_repeats_by_how_much_is_attached():
    assert reports.speed(timed(1, [3.0, 9.0, 4.0])) == {"one": 4.0}
    assert reports.speed(timed(10, [11.0, 12.5, 30.0])) == {"ten": 12.5}
    assert reports.speed(run(a=("agent-draft", [(True,)]))) == {}


def test_a_slow_answer_breaks_the_speed_gate():
    assert reports.gates(timed(1, [4.0, 5.0, 6.0]), None) == []
    assert any("one section" in g for g in reports.gates(timed(1, [5.5, 6.0, 4.0]), None))
    assert any("10 sections" in g for g in reports.gates(timed(10, [13.0, 13.0, 1.0]), None))


def test_a_case_passes_on_a_majority_of_repeats():
    report = run(
        a=("person", [(True,), (True,), (False,)]), b=("person", [(True,), (False,), (False,)])
    )
    assert [r["passed"] for r in reports.summary(report)] == [True, False]


def test_a_regression_is_seen_case_by_case_even_when_more_cases_pass():
    before = run(a=("person", [(True,)]), b=("person", [(False,)]), c=("person", [(False,)]))
    now = run(a=("person", [(False,)]), b=("person", [(True,)]), c=("person", [(True,)]))
    diff = reports.compare(now, before)
    assert diff["regressed"] == ["a"] and diff["fixed"] == ["b", "c"]
    assert any("passed before, fails now" in g for g in reports.gates(now, before))


def test_one_ungrounded_repeat_breaks_the_gate_even_on_a_draft_case():
    report = run(a=("agent-draft", [(True,), (True,), (True, False)]))
    assert any("ungrounded" in g for g in reports.gates(report, None))


def test_a_failing_draft_case_does_not_gate_and_a_reviewed_one_does():
    assert reports.gates(run(a=("agent-draft", [(False,)])), None) == []
    assert reports.gates(run(a=("person", [(False,)])), None)
    assert reports.gates(run(a=("person", [(True, True, False), (True,), (True,)])), None)


def test_the_saved_baseline_shows_every_new_case_failing():
    baseline = reports.load(reports.HERE / "history" / "baseline-B01-B02.json")
    rows = reports.summary(baseline)
    assert rows and not any(r["passed"] for r in rows)
    assert "Gates hold." in reports.text(baseline)


def test_a_claim_on_a_merged_trace_may_name_the_section_it_counts_for(world):
    from evals.score import ungrounded
    from render import feature_name

    s13, d13 = world["codes"]["s13"], world["codes"]["d13"]
    owner = next(c for c in world["features"][d13]["claims"] if c["attribute_key"] == "owner")
    name = feature_name(world["features"][s13])
    answer = {
        "statements": [
            {
                "kind": "fact",
                "text": f"For {name}, the owner is {owner['value_text']}.",
                "refs": [{"type": "claim", "id": owner["id"], "status": "accepted"}],
            }
        ]
    }
    assert ungrounded(answer, world) == []
