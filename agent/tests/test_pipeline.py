"""Proposing a pipeline from the chat: code offers it on the person's words, and only the
person's button (the action propose_pipeline) writes, as a new line with proposed links.

Offline: no model is called (the script is empty, so a model call would fail), store is
the fake store on the small world, and the proposal client is the real one over it.
"""

import json

import jsonschema
import pytest
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

import pipeline_flow
import store_writer
from agent import build_graph
from evals.fake_store import FakeStore, load_world
from schemas import Answer
from settings import ROOT
from tests.support import scripted


@pytest.fixture
def world():
    return load_world("small")


class Chat:
    def __init__(self, world, writer=True) -> None:
        self.store = FakeStore(world)
        self.graph = build_graph(
            store=self.store.client(),
            model=scripted(),
            cite=None,
            writer=self.store.writer() if writer else None,
        )
        self.graph.checkpointer = InMemorySaver()
        self.n = 0

    def ask(self, words, about=(), action=None, kind="section") -> dict:
        self.n += 1
        question = {"words": words, "about": [{"kind": kind, "id": i} for i in about]}
        if action:
            question["action"] = action
        message = HumanMessage(words, id=f"q{self.n}", additional_kwargs={"question": question})
        config = {"configurable": {"thread_id": "t"}, "recursion_limit": 50}
        return self.graph.invoke({"messages": [message]}, config)


def only(out):
    [statement] = Answer.model_validate(out["answer"]).statements
    return statement


@pytest.mark.parametrize(
    "words",
    [
        "Make these one pipeline",
        "Group them into a single pipeline, please.",
        "join these sections into a new pipeline",
        "Propose these as one pipeline",
    ],
)
def test_words_that_ask_for_a_pipeline(words):
    assert pipeline_flow.asks_for_pipeline(words)


@pytest.mark.parametrize(
    "words",
    ["Is this in a pipeline?", "What pipeline is it part of?", "Who owns the pipeline?"],
)
def test_questions_about_a_pipeline_are_not_a_request(words):
    assert not pipeline_flow.asks_for_pipeline(words)


def test_the_words_get_an_offer_and_nothing_is_written(world):
    codes = world["codes"]
    ids = [codes["s01"], codes["s02"], codes["s16"]]
    chat = Chat(world)
    statement = only(chat.ask("Make these one pipeline", ids))
    assert statement.kind == "pipeline_offer"
    assert statement.pipeline.section_ids == ids
    # s16 is already in a pipeline: proposed too, and it stays where it is.
    assert statement.pipeline.in_pipeline == [codes["s16"]]
    assert statement.text == (
        "Propose these 3 sections as one pipeline? Store keeps it as a proposal until a "
        "person decides it in the inbox. 1 of them is already in a pipeline; it stays "
        "there until a person moves it."
    )
    assert [r.id for r in statement.refs] == ids
    assert chat.store.bundles == []


@pytest.mark.parametrize(
    ("about", "kind", "line"),
    [
        (["s01"], "section", "too_few"),
        ([], "section", "too_few"),
        (["l01", "l02"], "pipeline", "not_sections"),
    ],
)
def test_an_offer_needs_two_sections_or_more(world, about, kind, line):
    chat = Chat(world)
    out = chat.ask("Make these one pipeline", [world["codes"][c] for c in about], kind=kind)
    statement = only(out)
    assert (statement.kind, statement.text) == ("refusal", pipeline_flow.LINES[line])
    assert chat.store.bundles == []


def test_the_button_writes_one_line_and_a_proposed_link_per_section(world):
    codes = world["codes"]
    ids = [codes["s01"], codes["s02"], codes["s16"]]
    chat = Chat(world)
    action = {"kind": "propose_pipeline", "section_ids": ids}
    statement = only(chat.ask("Propose pipeline", action=action))
    assert statement.kind == "proposed"
    assert statement.text == "Proposed a pipeline of 3 sections. Decide it in the inbox."
    assert statement.refs[0].label.startswith("pipeline ")
    [bundle] = chat.store.bundles
    [line] = bundle["features"]
    assert (line["kind"], line.get("label")) == ("line", None)
    assert [(link["from"], link["to"], link["status"]) for link in bundle["links"]] == [
        (i, "line", "proposed") for i in ids
    ]
    # In store: the s16 membership is still confirmed, the new one only proposed.
    s16 = chat.store.world["features"][codes["s16"]]
    assert sorted(link["status"] for link in s16["links"] if link["relation"] == "part_of") == [
        "confirmed",
        "proposed",
    ]
    # Pressed again for the same sections, in another order: nothing new.
    again = only(chat.ask("Propose pipeline", action={**action, "section_ids": ids[::-1]}))
    assert (
        again.text == "A pipeline of these 3 sections is already proposed. Decide it in the inbox."
    )
    assert (
        len([link for link in chat.store.world["links"] if link["status"] == "proposed"])
        == len([link for link in load_world("small")["links"] if link["status"] == "proposed"]) + 3
    )


@pytest.mark.parametrize(
    ("ids", "line"),
    [
        (["s01"], "too_few"),
        (["s01", "not-a-uuid"], "too_few"),
        (["s01", "l01"], "not_sections"),
    ],
)
def test_the_button_refuses_what_is_not_a_pipeline(world, ids, line):
    codes = world["codes"]
    chat = Chat(world)
    action = {"kind": "propose_pipeline", "section_ids": [codes.get(i, i) for i in ids]}
    statement = only(chat.ask("Propose pipeline", action=action))
    assert (statement.kind, statement.text) == ("refusal", pipeline_flow.LINES[line])
    assert chat.store.bundles == []


def test_without_a_proposal_token_nothing_is_written(world):
    codes = world["codes"]
    chat = Chat(world, writer=False)
    action = {"kind": "propose_pipeline", "section_ids": [codes["s01"], codes["s02"]]}
    statement = only(chat.ask("Propose pipeline", action=action))
    assert (statement.kind, statement.text) == ("failure", pipeline_flow.LINES["write_failed"])


# The bundles the Agent sends are store's bundles

BUNDLE_SCHEMA = json.loads((ROOT / "contract" / "store-bundle.schema.json").read_text())


def _closed(schema):
    """Store's schema with every object closed, so a misspelt field fails here and not
    silently in store, which ignores unknown fields."""
    if isinstance(schema, dict):
        out = {k: _closed(v) for k, v in schema.items()}
        if out.get("type") == "object" and "properties" in out:
            out.setdefault("additionalProperties", False)
        return out
    if isinstance(schema, list):
        return [_closed(v) for v in schema]
    return schema


def test_a_pipeline_bundle_is_a_bundle_store_takes(world):
    codes = world["codes"]
    bundle = store_writer.pipeline_bundle([codes["s01"], codes["s02"]], "gas")
    jsonschema.validate(bundle, _closed(BUNDLE_SCHEMA))


def test_a_finding_bundle_is_a_bundle_store_takes():
    from tests.test_cite import Chat as CiteChat
    from tests.test_cite import request

    world = load_world("small")
    s01 = world["codes"]["s01"]
    for attribute in ("owner", "status"):
        chat = CiteChat(world, request(s01, attribute=attribute, places=["Sampleton"]))
        chat.ask("Find it, through Sampleton.", [s01])
        chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
        [bundle] = chat.writer.bundles
        jsonschema.validate(bundle, _closed(BUNDLE_SCHEMA))
