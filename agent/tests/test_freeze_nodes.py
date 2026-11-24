"""TEMPORARY: freezes the graph's behaviour on branches no other test reached, before
`agent.py` is split into nodes (plan 2026-11-24-001, step A). Through `build_graph` only.
Deleted once the split is merged; nothing here is a specification."""

import pytest
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

from agent import build_graph
from cite_flow import CITE_LINES
from evals.fake_cite import FakeCite
from evals.fake_store import FakeStore, load_world
from render import FIXED_LINES
from tests.support import scripted
from tests.test_cite import Chat, kinds, offered, request
from tests.test_graph import unknown_owner


@pytest.fixture
def world():
    return load_world("small")


def texts(out) -> list[str]:
    return [s["text"] for s in out["answer"]["statements"]]


def ask_raw(world, model, question, *, fail=None, msg_id="q1"):
    store = FakeStore(world, fail=fail)
    graph = build_graph(store=store.client(), model=model, cite=None, writer=None)
    message = HumanMessage(question["words"], id=msg_id, additional_kwargs={"question": question})
    return graph.invoke({"messages": [message]}), store


# ingress, read and answer


def test_an_id_that_is_not_a_uuid_is_kept_as_given_and_not_found(world):
    out, _ = ask_raw(
        world, scripted(), {"words": "Who owns it?", "about": [{"kind": "section", "id": "nope"}]}
    )
    assert texts(out) == [FIXED_LINES["not_found"]]


def test_a_claim_attached_reads_its_section_by_canonical_id(world):
    s02 = world["codes"]["s01"]
    claim = world["features"][s02]["claims"][0]
    question = {
        "words": "Is this right?",
        "about": [
            {
                "kind": "claim",
                "id": claim["id"],
                "on": {"sectionId": s02.upper(), "attribute": "owner"},
            }
        ],
    }
    out, store = ask_raw(world, scripted(unknown_owner(s02)), question)
    assert f"/features/{s02}" in store.requests
    assert out["tools"][:2] == ["read_feature", "read_context"]
    assert kinds(out) == ["unknown"]


def test_no_question_in_the_thread_fails_the_check(world):
    store = FakeStore(world)
    graph = build_graph(store=store.client(), model=scripted(), cite=None, writer=None)
    out = graph.invoke({"messages": []})
    assert texts(out) == [FIXED_LINES["check_failed"]]
    assert out["answers"] is None


def test_five_sections_read_are_one_step(world):
    codes = [world["codes"][f"s0{n}"] for n in (1, 2, 3, 4, 5)]
    question = {"words": "Who owns these?", "about": [{"kind": "section", "id": c} for c in codes]}
    out, _ = ask_raw(world, scripted(unknown_owner(codes[0])), question)
    steps = [s["text"] for s in out["steps"]]
    assert steps[0] == "Read 5 sections" or steps[0].startswith("Read 5 sections")
    assert all(s["done"] for s in out["steps"])


def test_a_pipeline_attached_reads_its_sections_and_says_so(world):
    l01 = world["codes"]["l01"]
    question = {"words": "What is this pipeline?", "about": [{"kind": "pipeline", "id": l01}]}
    out, _ = ask_raw(world, scripted(unknown_owner(l01)), question)
    assert "pipeline_sections" in out["tools"]
    assert any(s["text"].startswith("Read its ") for s in out["steps"])


def test_nearby_and_network_tool_calls_leave_their_steps(world):
    s01 = world["codes"]["s01"]
    model = scripted(
        [("find_nearby", {"section_id": s01}), ("find_pipelines", {}), ("find_sections", {})],
        unknown_owner(s01),
    )
    question = {"words": "What is near it?", "about": [{"kind": "section", "id": s01}]}
    out, _ = ask_raw(world, model, question)
    steps = [s["text"] for s in out["steps"]]
    # Tools the model calls leave no step of their own: only the first reads do.
    assert out["tools"][2:] == ["find_nearby", "find_pipelines", "find_sections"]
    assert steps[2:] == ["Writing the answer", "Checking the answer"]


def test_a_feature_gone_by_the_models_own_read_is_not_found(world):
    model = scripted([("read_feature", {"feature_id": "00000000-0000-4000-8000-000000000000"})])
    question = {
        "words": "And this one?",
        "about": [{"kind": "section", "id": "00000000-0000-4000-8000-000000000000"}],
    }
    out, _ = ask_raw(world, model, question)
    assert texts(out) == [FIXED_LINES["not_found"]]


def test_store_failing_while_the_model_reads_is_said(world):
    s01 = world["codes"]["s01"]
    store = FakeStore(world)
    s02 = world["codes"]["s02"]

    class Failing(type(scripted())):
        def _generate(self, messages, stop=None, run_manager=None, **kwargs):
            store.fail = "unreachable"
            return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)

    model = Failing(messages=iter(scripted([("read_feature", {"feature_id": s02})]).messages))
    graph = build_graph(store=store.client(), model=model, cite=None, writer=None)
    question = {"words": "Who owns it?", "about": [{"kind": "section", "id": s01}]}
    message = HumanMessage("Who owns it?", id="q1", additional_kwargs={"question": question})
    out = graph.invoke({"messages": [message]})
    assert texts(out) == [FIXED_LINES["store_unreachable"]]


def test_a_follow_up_carries_what_was_attached_and_says_so(world):
    s02 = world["codes"]["s02"]
    owner = next(c for c in world["features"][s02]["claims"] if c["attribute_key"] == "owner")
    fact = {
        "statements": [
            {
                "kind": "fact",
                "text": "The owner is {c1.value}.",
                "refs": [{"key": "c1", "type": "claim", "id": owner["id"]}],
                "attribute": None,
            }
        ]
    }
    chat = Chat(world, fact, fact)
    chat.ask("What is its diameter?", [s02])
    out = chat.ask("And who owns it?")
    assert kinds(out) == ["fact"]
    assert [r["id"] for r in out["answer"]["carried"]] == [s02]


def test_propose_in_words_after_a_finding_is_refused(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    chat.ask("Find the owner, through Sampleton.", [s01])
    out = chat.ask("Please add that finding")
    assert texts(out) == [CITE_LINES["propose_words"]]


# change offers


def test_a_change_on_more_sections_than_allowed_is_refused(world, monkeypatch):
    import change_flow

    monkeypatch.setattr(change_flow, "MAX_SECTIONS", 1)
    codes = [world["codes"]["s01"], world["codes"]["s02"]]
    question = {
        "words": "Make these a pipeline",
        "about": [{"kind": "section", "id": c} for c in codes],
    }
    out, _ = ask_raw(world, scripted(), question)
    assert texts(out) == [change_flow.LINES["too_many"]]


def test_a_change_on_a_section_store_cannot_read_says_why(world):
    import change_flow

    s01 = world["codes"]["s01"]
    question = {"words": "Make these a pipeline", "about": [{"kind": "section", "id": s01}]}
    out, _ = ask_raw(world, scripted(), question, fail="unreachable")
    assert texts(out) == [FIXED_LINES["store_unreachable"]]
    gone = "00000000-0000-4000-8000-000000000000"
    question = {"words": "Make these a pipeline", "about": [{"kind": "section", "id": gone}]}
    out, _ = ask_raw(world, scripted(), question)
    assert texts(out) == [change_flow.LINES["gone"]]


# searching with cite


def test_a_search_that_failed_is_said(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("failed"))
    out = chat.ask("Find the owner, through Sampleton.", [s01])
    assert kinds(out)[-1] == "searched"
    assert out["cite"]["runs"][-1]["outcome"] == "cite could not search it"


def test_a_search_cite_cannot_reach_is_said(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite(unreachable=True))
    out = chat.ask("Find the owner, through Sampleton.", [s01])
    assert texts(out)[-1] == CITE_LINES["failed"]
    assert out["cite"]["runs"][-1]["outcome"] == "nothing came back"


def test_a_search_offered_then_store_gone_says_why_on_search(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    out = chat.ask("Find the owner, through Sampleton.", [s01], press=False)
    offer = offered(out)
    chat.store.fail = "unreachable"
    after = chat.ask(
        "Search", action={"kind": "search", "offer": offer["search"]["id"]}, press=False
    )
    assert texts(after) == [FIXED_LINES["store_unreachable"]]


def test_search_with_no_cite_is_refused(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    out = chat.ask("Find the owner, through Sampleton.", [s01], press=False)
    offer = offered(out)
    store = chat.store
    graph = build_graph(store=store.client(), model=scripted(), cite=None, writer=None)
    graph.checkpointer = chat.graph.checkpointer
    message = HumanMessage(
        "Search",
        id="q9",
        additional_kwargs={
            "question": {
                "words": "Search",
                "about": [],
                "action": {"kind": "search", "offer": offer["search"]["id"]},
            }
        },
    )
    after = graph.invoke({"messages": [message]}, {"configurable": {"thread_id": "t"}})
    assert texts(after) == [CITE_LINES["failed"]]


# propose and outcome


def test_propose_an_unknown_finding_is_refused(world):
    chat = Chat(world)
    out = chat.ask("Propose F9", action={"kind": "propose", "finding": "F9"})
    assert texts(out) == [CITE_LINES["not_found_finding"]]


def test_propose_with_no_writer_or_no_store_fails(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    chat.ask("Find the owner, through Sampleton.", [s01])
    chat.store.fail = "unreachable"
    out = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
    assert texts(out) == [FIXED_LINES["store_unreachable"]]
    chat.store.fail = None

    class Refusing:
        def propose(self, bundle):
            from store_client import StoreError

            raise StoreError("refused", "no")

    chat.writer = Refusing()
    chat.graph = build_graph(
        store=chat.store.client(), model=scripted(), cite=chat.cite, writer=Refusing(), cite_poll=0
    )
    chat.graph.checkpointer = InMemorySaver()
    out = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
    assert texts(out) == [CITE_LINES["not_found_finding"]]


def test_an_outcome_for_a_card_not_in_the_thread_is_refused(world):
    chat = Chat(world)
    out = chat.ask("Done", action={"kind": "outcome", "offer": "nope", "state": "done"})
    assert texts(out) == ["That card is no longer in this chat. Ask again."]
