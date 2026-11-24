import json

import pytest

from evals.fake_store import FakeStore, load_world
from src.agent.config import ROOT
from src.answer.render import FIXED_LINES, Read, Unfillable, period_words, render, value_words
from src.answer.schemas import Answer, Draft, Question, SectionPack
from src.flows.cite_result import CiteResult

CONTRACT = ROOT / "contract"


def test_the_schema_files_are_what_the_code_says():
    for name, model in (
        ("answer", Answer),
        ("question", Question),
        ("section-pack", SectionPack),
        ("cite-result", CiteResult),
    ):
        on_disk = json.loads((CONTRACT / f"{name}.schema.json").read_text())
        assert on_disk == model.model_json_schema(), f"contract/{name}.schema.json is stale"


@pytest.mark.parametrize(
    "path", sorted((CONTRACT / "examples").glob("*.json")), ids=lambda p: p.stem
)
def test_every_example_is_valid(path):
    model = (
        Answer
        if path.stem.startswith("answer")
        else SectionPack
        if path.stem.startswith("section-pack")
        else CiteResult
        if path.stem.startswith("cite-result")
        else Question
    )
    model.model_validate_json(path.read_text())


def test_a_fixed_line_in_an_example_is_the_line_code_writes():
    for path in (CONTRACT / "examples").glob("answer-*.json"):
        for statement in Answer.model_validate_json(path.read_text()).statements:
            if statement.kind in ("refusal", "failure", "greeting", "not_yet", "help"):
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
        (claim(), "with no date given"),
        # No bounds in store: the period as the source wrote it.
        (claim(valid_edtf="1938"), "in 1938"),
        (claim(valid_edtf="1932-03"), "in March 1932"),
        (claim(valid_edtf="../1932"), "by 1932"),
        (claim(valid_edtf="1931/1940"), "from 1931 to 1940"),
        (claim(valid_edtf="1937/.."), "from 1937"),
        (claim(valid_edtf="1930~"), "in about 1930"),
        # Store's own helper for a map: "by 1932", nothing more.
        (claim(sl="1932-12-31", ee="1932-01-01"), "by 1932"),
        # Equal bounds are that day.
        (claim(se="1931-05-01", sl="1931-05-01"), "from 1 May 1931"),
        (claim(se="1931-01-01", sl="1931-01-01"), "from 1 January 1931"),
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


def draft(text, refs, kind="fact", attribute=None, topic=None):
    statement = {"kind": kind, "text": text, "refs": refs, "attribute": attribute, "topic": topic}
    return Draft.model_validate({"statements": [statement]})


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


def test_a_background_refusal_is_its_own_fixed_line(s02):
    answer = render(
        draft("In the 1930s the biggest was...", [], kind="refusal", topic="background"), s02
    )
    assert answer.statements[0].text == FIXED_LINES["background"]


@pytest.mark.parametrize("topic", ["network", "recall", "tracer", "help"])
def test_a_not_yet_statement_is_its_topics_line_whatever_the_model_wrote(s02, topic):
    answer = render(draft("It is about 40 miles long.", [], kind="not_yet", topic=topic), s02)
    assert answer.statements[0].kind == "not_yet"
    assert answer.statements[0].text == FIXED_LINES[f"not_yet_{topic}"]
    assert answer.statements[0].refs == []


@pytest.mark.parametrize("topic", [None, "background"])
def test_a_not_yet_statement_without_one_of_its_topics_cannot_be_written(s02, topic):
    with pytest.raises(Unfillable, match="topics"):
        render(draft("", [], kind="not_yet", topic=topic), s02)


def test_what_the_agent_can_do_is_codes_text_whatever_the_model_wrote(s02):
    answer = render(draft("I can do anything.", [], kind="help", topic="capabilities"), s02)
    assert answer.statements[0].kind == "help"
    assert answer.statements[0].text == FIXED_LINES["capabilities"]


@pytest.mark.parametrize("topic", [None, "network"])
def test_a_help_statement_without_its_topic_cannot_be_written(s02, topic):
    with pytest.raises(Unfillable, match="topics"):
        render(draft("", [], kind="help", topic=topic), s02)


def test_an_unknown_names_what_was_looked_for(s02):
    feature_id = next(iter(s02.features))
    answer = render(
        draft(
            "No source says who operates this section.",
            [{"key": "f1", "type": "feature", "id": feature_id}],
            kind="unknown",
            attribute="operator",
        ),
        s02,
    )
    statement = answer.statements[0]
    assert statement.attribute == "operator"
    assert statement.text == "No source says who operates it."
    assert statement.refs[0].type == "feature" and statement.refs[0].id == feature_id


def test_a_value_that_ends_in_a_full_stop_takes_no_second_one(s02):
    owner = owner_of(s02)
    answer = render(
        draft("The owner is {c1.value}.", [{"key": "c1", "type": "claim", "id": owner["id"]}]), s02
    )
    assert answer.statements[0].text == "The owner is Example Pipe Line Co."


@pytest.mark.parametrize(
    "edtf", ["1938-21", "1938-13", "1938-00", "193X", "[1938..1940]", "1938-02-30"]
)
def test_a_date_that_cannot_be_put_into_words_truly_is_unfillable_never_no_date(edtf):
    with pytest.raises(Unfillable):
        period_words(claim(valid_edtf=edtf))


@pytest.mark.parametrize(
    ("number", "words"),
    [(1100000.0, "1100000 V"), (12.34567, "12.34567 V"), (20.0, "20 V"), (0.5, "0.5 V")],
)
def test_a_number_is_never_rounded_or_written_in_scientific_notation(number, words):
    assert value_words({"value_num": number, "value_unit": "V"}) == words


def test_the_source_slot_names_the_citation_that_states_it():
    from src.answer.render import _slot

    claim = {
        "citations": [
            {"role": "confirms", "source_title": "A confirming source"},
            {"role": "states", "source_title": "The stating source"},
        ]
    }
    assert _slot(claim, "source") == "The stating source"


def test_an_unknowns_sentence_is_code_s_whatever_the_model_wrote(s02):
    feature_id = next(iter(s02.features))
    answer = render(
        draft(
            "No source says who owns it, but it was abandoned in the war.",
            [{"key": "f1", "type": "feature", "id": feature_id}],
            kind="unknown",
            attribute="operator",
        ),
        s02,
    )
    assert answer.statements[0].text == "No source says who operates it."


def test_an_unknown_about_one_of_several_things_names_it():
    from src.answer.render import unknown_line

    assert unknown_line("owner") == "No source says who owns it."
    assert unknown_line("owner", "section 0fc87cac") == "No source says who owns section 0fc87cac."
    assert unknown_line("diameter", "Sampletown lateral") == (
        "No source says what the diameter of Sampletown lateral is."
    )


def test_a_feature_name_slot_is_its_label_or_its_short_code(s02):
    feature_id = next(iter(s02.features))
    answer = render(
        draft("This is {f1.name}.", [{"key": "f1", "type": "feature", "id": feature_id}]), s02
    )
    assert answer.statements[0].text == "This is Sampletown lateral."


def test_an_unknown_with_a_value_proposed_says_it_is_not_decided():
    from src.answer.render import unknown_line

    assert unknown_line("owner", proposed=True) == "Who owns it is not decided yet."
    assert unknown_line("diameter", "Sampletown lateral", proposed=True) == (
        "The diameter of Sampletown lateral is not decided yet."
    )
    assert unknown_line(None, proposed=True) == "No source says."
