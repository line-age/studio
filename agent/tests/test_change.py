"""A change asked for in words (plan 2026-11-23-001, D1 to D5): code reads the words,
checks them against what is attached and what store holds, and answers with one offer
(`change_offer`) or one fixed line. Studio shows the offer as a card and makes the change
as the person when they press Approve. The Agent writes nothing.

Offline: no model is called (the script is empty, so a model call would fail), store is
the fake store on the small world. In it, Example trunk line (l01) holds s16, s06 and s07;
l02 is a pipeline with no name and only proposed members; s02 has a diameter of 20 in.
"""

import uuid

import pytest
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

import change_flow
import store_writer
from agent import build_graph
from evals.fake_store import FakeStore, load_world
from render import feature_name
from schemas import Answer
from tests.support import scripted


@pytest.fixture
def world():
    return load_world("small")


class Chat:
    def __init__(self, world) -> None:
        self.world = world
        self.store = FakeStore(world)
        self.graph = build_graph(
            store=self.store.client(), model=scripted(), cite=None, writer=self.store.writer()
        )
        self.graph.checkpointer = InMemorySaver()
        self.n = 0

    def ask(self, words, about=(), action=None) -> Answer:
        """`about`: world codes; an `l` code is attached as a pipeline."""
        self.n += 1
        codes = self.world["codes"]
        items = [
            {"kind": "pipeline" if c.startswith("l") else "section", "id": codes.get(c, c)}
            for c in about
        ]
        question = {"words": words, "about": items}
        if action:
            question["action"] = action
        message = HumanMessage(words, id=f"q{self.n}", additional_kwargs={"question": question})
        config = {"configurable": {"thread_id": "t"}, "recursion_limit": 50}
        out = self.graph.invoke({"messages": [message]}, config)
        return Answer.model_validate(out["answer"])


def only(answer: Answer):
    [statement] = answer.statements
    return statement


def name(world, code):
    return feature_name(world["features"][world["codes"][code]])


# The words ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("words", "kind", "target", "value"),
    [
        ("Add these to Example trunk line.", "add", "Example trunk line", None),
        ("add them to this pipeline", "add", "this pipeline", None),
        ("Please put these sections into Example trunk line", "add", "Example trunk line", None),
        ("Move it to Example trunk line", "move", "Example trunk line", None),
        ("move these two into the pipeline", "move", "the pipeline", None),
        ("Remove these from their pipeline", "remove", None, None),
        ("Take it out of the pipeline.", "remove", None, None),
        ("Make these one pipeline", "make", None, None),
        ("Group them into a single pipeline, please.", "make", None, None),
        ("Make these one pipeline and call it Northfield line", "make", None, "Northfield line"),
        ("Rename this pipeline to North main", "rename", None, "North main"),
        ("Call this pipeline 'North main'.", "rename", None, "North main"),
        ("Set their diameter to 12 in", "edit", "diameter", "12 in"),
        ("set the diameter to 12 inches", "edit", "diameter", "12 in"),
        ('Change its diameter to 12".', "edit", "diameter", "12 in"),
        ("The diameter is 300 mm", "edit", "diameter", "300 mm"),
        ("Set the owner to Example Co.", "edit", "owner", "Example Co."),
    ],
)
def test_words_that_ask_for_a_change(words, kind, target, value):
    request = change_flow.read_request(words)
    assert request is not None, words
    assert request.kind == kind
    if kind in ("add", "move"):
        assert request.target == target
    if kind == "edit":
        assert (request.attribute, request.value) == (target, value)
    elif value is not None:
        assert request.name == value


@pytest.mark.parametrize(
    "words",
    [
        "Is this in a pipeline?",
        "What pipeline is it part of?",
        "Who owns the pipeline?",
        "How do I add a section to a pipeline?",
        "how can I group these into one pipeline",
        "Can I move these to another pipeline?",
        "What is the diameter?",
        "Did they add a line to the town in 1931?",
        "Which maps show it?",
        "Why was it removed from the 1937 map?",
    ],
)
def test_questions_are_not_a_change(words):
    assert change_flow.read_request(words) is None, words


def test_deciding_what_a_tool_proposed_stays_in_the_inbox():
    for words in ("Great, now confirm it for me", "Please accept these", "Reject it"):
        assert change_flow.asks_to_decide(words), words
    for words in ("Can you confirm who built it?", "Why was this rejected?"):
        assert not change_flow.asks_to_decide(words), words


# Offers ---------------------------------------------------------------------------------


def offer_of(answer):
    statement = only(answer)
    assert statement.kind == "change_offer", statement.text
    assert uuid.UUID(statement.change.id)
    return statement


def test_add_by_the_pipelines_name_offers_and_writes_nothing(world):
    codes = world["codes"]
    chat = Chat(world)
    s = offer_of(chat.ask("Add these to Example trunk line.", ["s01", "s02"]))
    assert s.text == "Add 2 sections to Example trunk line"
    assert s.change.kind == "add"
    assert s.change.pipeline_id == codes["l01"]
    assert s.change.section_ids == [codes["s01"], codes["s02"]]
    assert [(b.section_id, b.pipeline_id) for b in s.change.basis] == [
        (codes["s01"], None),
        (codes["s02"], None),
    ]
    assert chat.store.bundles == []


def test_add_to_the_attached_pipeline(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Add them to this pipeline", ["s01", "l01"]))
    assert (s.change.pipeline_id, s.change.section_ids) == (codes["l01"], [codes["s01"]])
    assert s.text == f"Add {name(world, 's01')} to Example trunk line"


def test_a_section_already_there_is_left_out_and_said_so(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Add these to Example trunk line", ["s01", "s16"]))
    assert s.change.section_ids == [codes["s01"]]
    assert s.change.left_out == [codes["s16"]]
    assert s.change.note == f"{name(world, 's16')} is already in Example trunk line."


def test_all_already_there_gets_a_line_and_no_card(world):
    s = only(Chat(world).ask("Add these to Example trunk line", ["s16", "s06"]))
    assert (s.kind, s.text) == ("refusal", "These 2 sections are already in Example trunk line.")


def test_a_section_in_another_pipeline_moves_and_the_card_says_so(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Move it to this pipeline", ["s16", "l02"]))
    assert s.change.kind == "move"
    assert s.change.pipeline_id == codes["l02"]
    assert s.change.basis[0].pipeline_id == codes["l01"]
    assert s.change.note == f"{name(world, 's16')} is in Example trunk line now. It moves."


def test_remove_takes_each_section_out_of_its_own_pipeline(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Remove these from their pipeline", ["s16", "s06", "s01"]))
    assert s.change.kind == "remove"
    assert s.change.section_ids == [codes["s16"], codes["s06"]]
    assert s.change.left_out == [codes["s01"]]
    assert s.text == "Remove 2 sections from Example trunk line"
    assert s.change.note == f"{name(world, 's01')} is in no pipeline."


def test_remove_when_none_is_in_a_pipeline(world):
    s = only(Chat(world).ask("Take them out of the pipeline", ["s01", "s02"]))
    assert (s.kind, s.text) == ("refusal", change_flow.LINES["none_placed"])


def test_make_a_pipeline_with_a_name(world):
    codes = world["codes"]
    s = offer_of(
        Chat(world).ask("Make these one pipeline and call it Northfield line", ["s01", "s02"])
    )
    assert (s.change.kind, s.change.name) == ("make", "Northfield line")
    assert s.change.section_ids == [codes["s01"], codes["s02"]]
    assert s.text == "Make a pipeline of 2 sections, named Northfield line"


def test_make_moves_a_section_that_is_in_a_pipeline(world):
    s = offer_of(Chat(world).ask("Make these one pipeline", ["s01", "s16"]))
    assert s.text == "Make a pipeline of 2 sections"
    assert s.change.note == f"{name(world, 's16')} is in Example trunk line now. It moves."


def test_rename_the_attached_pipeline(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Rename this pipeline to North main", ["l01"]))
    assert (s.change.kind, s.change.pipeline_id, s.change.name) == (
        "rename",
        codes["l01"],
        "North main",
    )
    assert s.text == "Rename Example trunk line to North main"


def test_set_the_diameter_of_the_attached_sections(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Set their diameter to 12 inches", ["s01", "s02"]))
    assert s.change.kind == "edit"
    assert (s.change.attribute, s.change.value) == ("diameter", "12 in")
    assert s.change.section_ids == [codes["s01"], codes["s02"]]
    assert s.text == "Set the diameter of 2 sections"
    assert s.change.note == f"Replaces 20 in on {name(world, 's02')}."


def test_set_the_owner_of_the_attached_pipeline(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Set the owner to Sample Gas Co.", ["l01"]))
    assert (s.change.kind, s.change.pipeline_id) == ("edit", codes["l01"])
    assert (s.change.attribute, s.change.value) == ("owner", "Sample Gas Co.")
    assert s.text == "Set the owner of Example trunk line"
    # An owner can be several: Studio adds the new one beside it, it does not replace it.
    assert s.change.note == "Example Pipe Line Co. stays beside it."


# What is refused, each with its fixed line ---------------------------------------------


@pytest.mark.parametrize(
    ("words", "about", "line"),
    [
        ("Add these to Example trunk line", [], "nothing_attached"),
        ("Make these one pipeline", ["s01"], "too_few"),
        ("Make these one pipeline", ["l01", "l02"], "not_sections"),
        ("Rename this pipeline to North main", ["s01"], "attach_pipeline"),
        ("Set their owner to Sample Gas Co.", ["s01", "s02"], "owner_on_pipeline"),
        ("Set its operator to Sample Gas Co.", ["s01"], "owner_on_pipeline"),
        ("Set its status to abandoned", ["s01"], "not_from_chat"),
        ("Set their diameter to 12 in", ["l01"], "diameter_on_sections"),
    ],
)
def test_what_cannot_be_offered_gets_its_line(world, words, about, line):
    chat = Chat(world)
    s = only(chat.ask(words, about))
    assert (s.kind, s.text) == ("refusal", change_flow.LINES[line])
    assert chat.store.bundles == []


@pytest.mark.parametrize(
    ("value", "rule"),
    [
        ("twelve", "Give a number and a unit, like 12 in."),
        ("12", "Give the unit: in or mm."),
        ("0 in", "Must be more than 0."),
    ],
)
def test_a_value_that_breaks_the_rules_gets_the_rules_words(world, value, rule):
    s = only(Chat(world).ask(f"Set their diameter to {value}", ["s01"]))
    assert (s.kind, s.text) == ("refusal", f"Diameter {value}: {rule} Nothing was offered.")


def test_a_pipeline_named_that_is_not_in_store(world):
    s = only(Chat(world).ask("Add these to Nowhere main", ["s01"]))
    assert (s.kind, s.text) == (
        "refusal",
        change_flow.LINES["no_such_pipeline"].format(name="Nowhere main"),
    )


def test_a_section_store_no_longer_has(world):
    s = only(Chat(world).ask("Add these to Example trunk line", [str(uuid.uuid4()), "s01"]))
    assert (s.kind, s.text) == ("refusal", change_flow.LINES["gone"])


def test_checks_on_the_sections_themselves():
    def section(i, network="gas"):
        return {"id": f"00000000-0000-4000-8000-{i:012d}", "kind": "section", "network": network}

    assert (
        change_flow.check_sections([section(1), section(2, "oil")])
        == (change_flow.LINES["mixed_networks"])
    )
    many = [section(i) for i in range(change_flow.MAX_SECTIONS + 1)]
    assert change_flow.check_sections(many) == change_flow.LINES["too_many"]
    assert change_flow.check_sections([section(1), section(2)]) is None


def test_deciding_in_words_points_to_the_inbox(world):
    s = only(Chat(world).ask("Please accept these", ["s01"]))
    assert (s.kind, s.text) == ("refusal", change_flow.LINES["person_decides"])


# The outcome comes back as an action ----------------------------------------------------


def test_the_outcome_of_a_card_is_recorded_and_writes_nothing(world):
    chat = Chat(world)
    offer = offer_of(chat.ask("Add these to Example trunk line", ["s01", "s02"]))
    action = {"kind": "outcome", "offer": offer.change.id, "state": "done"}
    s = only(chat.ask("Approve", action=action))
    assert (s.kind, s.text) == ("changed", change_flow.OUTCOME_LINES["done"])
    assert chat.store.bundles == []


def test_the_agent_has_no_way_to_write_a_persons_change():
    assert not hasattr(store_writer, "pipeline_bundle")
    assert [n for n in dir(store_writer.ProposalClient) if not n.startswith("_")] == ["propose"]


# The independent re-check (evals/score.py) and the case check (evals/checks.py) --------


def test_a_faithful_offer_is_grounded_and_a_seeded_bad_one_is_caught(world):
    from evals.mutations import an_offer_for_a_section_never_read
    from evals.score import ungrounded

    for words, about in [
        ("Add these to Example trunk line", ["s01", "s16"]),
        ("Remove these from their pipeline", ["s16", "s01"]),
        ("Set their diameter to 12 in", ["s01", "s02"]),
        ("Make these one pipeline", ["s01", "s16"]),
    ]:
        answer = Chat(world).ask(words, about).model_dump()
        assert ungrounded(answer, world) == [], words
        bad = an_offer_for_a_section_never_read(answer)
        assert any("not in store" in p for p in ungrounded(bad, world)), words


def test_an_offer_for_a_section_not_attached_fails_the_case(world):
    from evals.cases import load
    from evals.checks import check

    case = next(c for c in load() if c.id == "B44-001")
    answer = Chat(world).ask("Add these to Example trunk line", ["s01", "s02"]).model_dump()
    assert check(case, world, {"answer": answer, "tools": []})["case_passed"]["score"]
    answer["statements"][0]["change"]["section_ids"].append(world["codes"]["s03"])
    result = check(case, world, {"answer": answer, "tools": []})
    assert not result["case_passed"]["score"]
    assert "not attached" in result["forbidden"]["comment"]


# The empty chat's examples (contract/composer-examples.json) ----------------------------


def test_every_example_the_message_box_offers_is_read_as_it_means():
    import json

    from settings import ROOT

    examples = json.loads((ROOT / "contract" / "composer-examples.json").read_text())
    for attached in ("none", "section", "sections", "pipeline"):
        for words in examples[attached]["do"]:
            assert change_flow.read_request(words) is not None, words
        for words in examples[attached]["ask"]:
            assert change_flow.read_request(words) is None, words
            assert not change_flow.sounds_like_a_change(words), words
            assert not change_flow.asks_to_decide(words), words


# Found in review, 2026-11-23 ------------------------------------------------------------


@pytest.mark.parametrize(
    "words",
    [
        "The name is wrong",
        "The owner is who?",
        "The diameter is unknown",
        "Their diameter is correct",
    ],
)
def test_a_complaint_or_a_question_is_not_a_change(words):
    assert change_flow.read_request(words) is None, words


@pytest.mark.parametrize(
    ("words", "attribute", "value"),
    [
        ("set the owner to Example Co. please", "owner", "Example Co."),
        ("Set the diameter of these sections to 12 inches", "diameter", "12 in"),
        ("set the diameter of these two to 300 mm, thanks", "diameter", "300 mm"),
        ("Change the diameter of the selected sections to 16 in", "diameter", "16 in"),
    ],
)
def test_set_reads_the_natural_phrasings_and_leaves_politeness_out(words, attribute, value):
    request = change_flow.read_request(words)
    assert request is not None, words
    assert (request.kind, request.attribute, request.value) == ("edit", attribute, value)


def test_a_pipeline_is_found_by_its_name_with_or_without_the_and_pipeline():
    found = []

    def find(wanted):
        found.append(wanted)
        return (
            [
                {
                    "id": "00000000-0000-4000-8000-000000000001",
                    "kind": "line",
                    "label": "The Dalles line",
                }
            ]
            if wanted == change_flow.name_key("The Dalles line")
            else []
        )

    for words in ("The Dalles line", "the Dalles line", "Dalles line pipeline", "The Dalles"):
        target = change_flow._target(words, [], find)
        assert isinstance(target, dict), (words, target)


def test_the_attached_pipeline_said_politely_is_still_the_attached_one(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Add it to this pipeline please", ["s01", "l01"]))
    assert s.change.pipeline_id == codes["l01"]


def test_a_named_pipeline_with_the_word_pipeline_after_it(world):
    codes = world["codes"]
    s = offer_of(Chat(world).ask("Move these to the Example trunk line pipeline", ["s01"]))
    assert s.change.pipeline_id == codes["l01"]


def test_a_name_edit_without_a_pipeline_asks_for_the_pipeline(world):
    s = only(Chat(world).ask("Set the name to Elm trunk", ["s01"]))
    assert (s.kind, s.text) == ("refusal", change_flow.LINES["attach_pipeline"])


def test_a_pipeline_list_cut_short_is_a_failure_never_no_such_pipeline(world, monkeypatch):
    from store_client import StoreClient

    real = StoreClient.links

    def cut(self, *args, **kwargs):
        import dataclasses

        return dataclasses.replace(real(self, *args, **kwargs), cut=True)

    monkeypatch.setattr(StoreClient, "links", cut)
    s = only(Chat(world).ask("Add these to Example trunk line", ["s01"]))
    assert s.kind == "failure"
    assert "no pipeline called" not in s.text
