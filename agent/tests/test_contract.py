import json

import pytest

from evals.fake_store import FakeStore, load_world
from render import FIXED_LINES, Read, Unfillable, period_words, render, value_words
from schemas import Answer, Draft, Question
from settings import ROOT

CONTRACT = ROOT / "contract"


def test_the_schema_files_are_what_the_code_says():
    for name, model in (("answer", Answer), ("question", Question)):
        on_disk = json.loads((CONTRACT / f"{name}.schema.json").read_text())
        assert on_disk == model.model_json_schema(), f"contract/{name}.schema.json is stale"


@pytest.mark.parametrize(
    "path", sorted((CONTRACT / "examples").glob("*.json")), ids=lambda p: p.stem
)
def test_every_example_is_valid(path):
    model = Answer if path.stem.startswith("answer") else Question
    model.model_validate_json(path.read_text())


def test_a_fixed_line_in_an_example_is_the_line_code_writes():
    for path in (CONTRACT / "examples").glob("answer-*.json"):
        for statement in Answer.model_validate_json(path.read_text()).statements:
            if statement.kind in ("refusal", "failure", "greeting"):
                assert statement.text in FIXED_LINES.values()
                assert statement.refs == []


# How a period reads


def claim(se=None, sl=None, ee=None, el=None, **more):
    return {"start_earliest": se, "start_latest": sl, "end_earliest": ee, "end_latest": el, **more}


@pytest.mark.parametrize(
    ("bounds", "words"),
    [
        # A map only proves "by" its date.
        (claim(sl="1932-12-31"), "by 1932"),
        # The source gave a month, so the month is kept.
        (claim(sl="1932-03-31"), "by March 1932"),
        (claim(sl="1932-03-14"), "by 14 March 1932"),
        (claim(se="1933-01-01", sl="1933-12-31"), "from 1933"),
        (claim(se="1933-05-01", sl="1933-05-31"), "from May 1933"),
        (claim(se="1932-01-01", sl="1934-12-31"), "from between 1932 and 1934"),
        (claim("1932-01-01", "1932-12-31", "1940-01-01", "1940-12-31"), "from 1932 to 1940"),
        (claim(se="1938-01-01"), "not before 1938"),
        (claim(sl="1932-12-31", el="1946-12-31"), "by 1932 until 1946 at the latest"),
        (claim(ee="1940-01-01"), "until at least 1940"),
        (claim(), "with no date in store"),
    ],
)
def test_a_period_reads_as_the_source_gave_it(bounds, words):
    assert period_words(bounds) == words


def test_a_map_date_never_reads_as_a_start():
    assert "from" not in period_words(claim(sl="1932-12-31"))


def test_values_read_as_written():
    assert value_words({"value_num": 20.0, "value_unit": "in"}) == "20 in"
    assert value_words({"value_num": 6.625, "value_unit": "in"}) == "6.625 in"
    assert value_words({"value_text": "Example Pipe Line Co."}) == "Example Pipe Line Co."
    with pytest.raises(Unfillable):
        value_words({"attribute_key": "route", "value_geom": {"type": "MultiLineString"}})


# Filling slots


@pytest.fixture
def s02():
    world = load_world("small")
    read = Read()
    read.feature(FakeStore(world).client().feature(world["codes"]["s02"]))
    return read


def owner_of(read):
    return next(c for c in read.claims.values() if c["attribute_key"] == "owner")


def draft(text, refs, kind="fact", attribute=None):
    return Draft.model_validate(
        {"statements": [{"kind": kind, "text": text, "refs": refs, "attribute": attribute}]}
    )


def test_slots_are_filled_from_the_claim_that_was_read(s02):
    owner = owner_of(s02)
    answer = render(
        draft(
            "The accepted owner is {c1.value}, {c1.period}, from {c1.source}, {c1.locator}: {c1.quote}",
            [{"key": "c1", "type": "claim", "id": owner["id"]}],
        ),
        s02,
    )
    statement = answer.statements[0]
    assert statement.text == (
        "The accepted owner is Example Pipe Line Co., by March 1932, from Example Gazette, "
        "vol. 32 no. 3, p. 41: “The Example Pipe Line Co. has completed its line to Sampletown.”"
    )
    ref = statement.refs[0]
    assert (ref.type, ref.id, ref.attribute, ref.status, ref.asserter) == (
        "claim",
        owner["id"],
        "owner",
        "accepted",
        "person",
    )
    assert answer.checked is False  # rendering is not the check


@pytest.mark.parametrize(
    ("text", "refs", "why"),
    [
        ("{c9.value}", [], "not in refs"),
        (
            "{c1.value}",
            [{"key": "c1", "type": "claim", "id": "00000000-0000-4000-8000-000000000000"}],
            "not read",
        ),
        ("{c1.colour}", "owner", "not a field"),
        ("{f1.value}", "feature", "not a field"),
        ("{c1.value}", "route", "no value that is words"),
        ("{c1.value} and {c1.value}", "twice", "two things"),
    ],
)
def test_a_slot_that_cannot_be_filled_is_a_problem_never_a_guess(s02, text, refs, why):
    owner = owner_of(s02)
    route = next(c for c in s02.claims.values() if c["attribute_key"] == "route")
    feature_id = next(iter(s02.features))
    refs = (
        {
            "owner": [{"key": "c1", "type": "claim", "id": owner["id"]}],
            "feature": [{"key": "f1", "type": "feature", "id": feature_id}],
            "route": [{"key": "c1", "type": "claim", "id": route["id"]}],
            "twice": [
                {"key": "c1", "type": "claim", "id": owner["id"]},
                {"key": "c1", "type": "claim", "id": route["id"]},
            ],
        }.get(refs, refs)
        if isinstance(refs, str)
        else refs
    )
    with pytest.raises(Unfillable, match=why):
        render(draft(text, refs), s02)


def test_a_refusal_is_the_fixed_line_whatever_the_model_wrote(s02):
    answer = render(draft("Sure, here is a poem about pipelines.", [], kind="refusal"), s02)
    assert answer.statements[0].text == FIXED_LINES["unrelated"]
    assert answer.statements[0].refs == []


def test_an_unknown_names_what_was_looked_for(s02):
    feature_id = next(iter(s02.features))
    answer = render(
        draft(
            "Store does not say who operates this section.",
            [{"key": "f1", "type": "feature", "id": feature_id}],
            kind="unknown",
            attribute="operator",
        ),
        s02,
    )
    statement = answer.statements[0]
    assert statement.attribute == "operator"
    assert statement.refs[0].type == "feature" and statement.refs[0].id == feature_id
