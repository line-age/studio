"""Searching with cite from the chat: the guard, the run, what is shown, and Propose.

Offline: the model is scripted, store is the fake store on the small world, cite is the
fake cite and the proposal client a fake that keeps what it was sent.
"""

import pytest
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

import cite_flow
from agent import build_graph
from evals.fake_cite import FakeCite
from evals.fake_store import FakeStore, load_world
from schemas import Answer
from tests.support import scripted


class FakeWriter:
    def __init__(self) -> None:
        self.bundles: list[dict] = []

    def propose(self, bundle: dict) -> dict:
        self.bundles.append(bundle)
        return {
            "ids": {
                "issue": "src-1",
                "page": "cit-1",
                "claim": "9" * 8 + "-0000-4000-8000-" + "0" * 12,
            }
        }


@pytest.fixture
def world():
    return load_world("small")


class Chat:
    """One thread, several turns, as Studio holds it."""

    def __init__(self, world, *steps, cite=None, writer=None) -> None:
        self.world = world
        self.cite = cite if cite is not None else FakeCite()
        self.writer = writer if writer is not None else FakeWriter()
        self.store = FakeStore(world)
        self.graph = build_graph(
            store=self.store.client(),
            model=scripted(*steps),
            cite=self.cite,
            writer=self.writer,
            cite_poll=0,
        )
        self.graph.checkpointer = InMemorySaver()
        self.n = 0

    def ask(self, words, about=(), action=None) -> dict:
        self.n += 1
        question = {"words": words, "about": [{"kind": "section", "id": i} for i in about]}
        if action:
            question["action"] = action
        message = HumanMessage(words, id=f"q{self.n}", additional_kwargs={"question": question})
        config = {"configurable": {"thread_id": "t"}, "recursion_limit": 200}
        return self.graph.invoke({"messages": [message]}, config)


def request(section_id, attribute="owner", **steer):
    return {
        "statements": [
            {
                "kind": "citation_request",
                "text": "",
                "refs": [{"key": "f1", "type": "feature", "id": section_id}],
                "attribute": attribute,
                **steer,
            }
        ]
    }


def kinds(out) -> list[str]:
    return [s["kind"] for s in out["answer"]["statements"]]


def test_ask_and_find_shows_the_finding_in_codes_words(world):
    s01 = world["codes"]["s01"]
    places = {"places": ["Sampleton", "Exampleville"]}
    chat = Chat(world, request(s01, **places))

    out = chat.ask("Find who owned this; it runs from Sampleton to Exampleville.", [s01])

    answer = Answer.model_validate(out["answer"])
    assert answer.checked and kinds(out)[:2] == ["citation_request", "finding"]
    assert answer.statements[0].text.startswith("Searching the journals for the owner of")
    finding = answer.statements[1]
    assert finding.text.startswith(f"{cite_flow.FOUND}: Example Pipe Line Co. as the owner")
    assert finding.finding.handle == "F1" and finding.finding.places_given == [
        "Sampleton",
        "Exampleville",
    ]
    assert finding.finding.quote.startswith("The Example Pipe Line Co. is laying")
    # What reached cite: the person's places, given; the map year; a window from store.
    [sent] = chat.cite.inputs
    assert sent["places"] == sent["places_given"] == ["Sampleton", "Exampleville"]
    assert sent["attributes"] == ["Ownership"]
    assert sent["observations"][0]["year"] == 1932
    assert out["cite"]["findings"]["F1"]["finding"]["value"] == "Example Pipe Line Co."
    # Step lines from cite reached the state, and nothing was written.
    assert any(step.get("by") == "cite" for step in out["steps"])
    assert chat.writer.bundles == []
    # One reply for the question, replaced in place as the search went on.
    assert [m.id for m in out["messages"]].count("answer-q1") == 1


def test_no_towns_asks_for_them_and_the_next_message_steers_the_kept_request(world):
    s01 = world["codes"]["s01"]
    chat = Chat(
        world,
        request(s01),
        request(s01, places=["Sampleton"]),
    )
    first = chat.ask("Look for the owner of this section.", [s01])
    assert kinds(first) == ["ask_places"]
    assert first["cite"]["pending"] == {"section_id": s01, "attributes": ["owner"]}
    assert chat.cite.inputs == []

    # Nothing attached: the steering message is about the section the search was for.
    second = chat.ask("It goes through Sampleton.")
    assert "finding" in kinds(second)
    assert chat.cite.inputs[0]["places"] == ["Sampleton"]
    assert second["cite"]["pending"] is None


@pytest.mark.parametrize(
    ("steer", "refused"),
    [
        ({"places": ["Remembertown"]}, "The place Remembertown"),
        ({"places": ["Sampleton"], "years": [1911, 1912]}, "The year 1911"),
        ({"places": ["Sampleton"], "ruled_out": ["Guessed Gas Co."]}, "The value Guessed Gas Co."),
    ],
)
def test_a_hint_the_person_never_gave_is_refused_and_cite_is_not_asked(world, steer, refused):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, **steer))
    out = chat.ask("Find the owner; it runs through Sampleton.", [s01])
    [line] = out["answer"]["statements"]
    assert line["kind"] == "citation_request" and refused in line["text"]
    assert chat.cite.inputs == []


def test_steering_years_and_a_turned_down_value_reach_cite(world):
    s01 = world["codes"]["s01"]
    steer = {"places": ["Sampleton"], "years": [1928, 1935], "ruled_out": ["Other Gas Co."]}
    chat = Chat(world, request(s01, **steer))
    chat.ask("Owner? Through Sampleton, 1928 to 1935, and it is not Other Gas Co.", [s01])
    [sent] = chat.cite.inputs
    # Cut to the two years nearest the first printing (1932), as cite would cut it.
    assert sent["search_window"] == {"from": 1931, "to": 1932}
    assert {"attribute": "Ownership", "value": "Other Gas Co."} in sent["ruled_out"]


def test_operator_and_name_cannot_be_searched_yet(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, attribute="operator", places=["Sampleton"]))
    out = chat.ask("Find who operated it, through Sampleton.", [s01])
    assert out["answer"]["statements"][0]["text"].startswith("I cannot look for the operator")
    assert chat.cite.inputs == []


def test_searched_not_found_names_what_was_read_and_leaves_out_an_outage(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("nothing_found"))
    out = chat.ask("Find the owner, through Sampleton.", [s01])
    texts = [s["text"] for s in out["answer"]["statements"] if s["kind"] == "searched"]
    assert texts[0].startswith("Searched, not found: the owner of")
    assert (
        "The Example Trade Journal, 104 issues from 2 January 1930 to 24 December 1931" in texts[0]
    )
    assert texts[1].startswith("cite turned down 1 other proposed value:")


def test_sources_that_disagree_are_shown_side_by_side_and_doubt_has_its_reasons(world):
    s01 = world["codes"]["s01"]
    chat = Chat(
        world,
        request(s01, attribute="diameter", places=["Sampleton"]),
        cite=FakeCite("two_diameters"),
    )
    out = chat.ask("Find the diameter, through Sampleton.", [s01])
    statements = Answer.model_validate(out["answer"]).statements
    found = [s for s in statements if s.kind == "finding"]
    assert [f.text.split(":")[0] for f in found] == [cite_flow.FOUND, cite_flow.IN_DOUBT]
    assert [f.flag for f in found[1].finding.flags] == ["judge_unclear", "location_unconfirmed"]
    assert any(s.kind == "worked_out" and "disagree" in s.text for s in statements)


def test_propose_writes_one_candidate_only_on_the_action_and_never_from_words(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    chat.ask("Find the owner, through Sampleton.", [s01])

    typed = chat.ask("Yes, propose it.")
    assert typed["answer"]["statements"][0]["text"] == cite_flow.CITE_LINES["propose_words"]
    assert chat.writer.bundles == []

    out = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
    [statement] = Answer.model_validate(out["answer"]).statements
    assert statement.kind == "proposed" and statement.text.startswith(
        "Proposed Example Pipe Line Co."
    )
    assert statement.refs[0].type == "claim" and statement.refs[0].status == "candidate"
    [bundle] = chat.writer.bundles
    [claim] = bundle["claims"]
    assert claim["feature"] == s01 and claim["attribute"] == "owner"
    assert claim["value_text"] == "Example Pipe Line Co." and claim["start_latest"] == "1931-03-12"
    assert claim["citations"] == [{"citation": "page", "role": "states"}]
    assert claim["external_key"]["system"] == "cite"
    assert bundle["citations"][0]["quote"].startswith("The Example Pipe Line Co. is laying")
    assert bundle["citations"][0]["locator"] == "p. 41"


def test_a_build_date_found_as_by_is_shown_and_cannot_be_proposed(world):
    s01 = world["codes"]["s01"]
    chat = Chat(
        world, request(s01, attribute="status", places=["Sampleton"]), cite=FakeCite("built_by")
    )
    out = chat.ask("When was it built? Through Sampleton.", [s01])
    finding = next(s for s in out["answer"]["statements"] if s["kind"] == "finding")
    assert (
        finding["text"].startswith(f"{cite_flow.FOUND}: section ")
        and "built by 1929" in finding["text"]
    )
    assert finding["finding"]["proposable"] is False
    refused = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
    assert refused["answer"]["statements"][0]["text"].startswith("This finding cannot be proposed")
    assert chat.writer.bundles == []


def test_laying_is_proposed_as_under_construction_that_year(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, attribute="status", places=["Sampleton"]))
    chat.ask("When was it built? Through Sampleton.", [s01])
    chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
    [claim] = chat.writer.bundles[0]["claims"]
    assert (claim["attribute"], claim["value_text"]) == ("status", "under_construction")
    assert (claim["start_earliest"], claim["start_latest"]) == ("1931-01-01", "1931-12-31")


def test_an_earlier_finding_is_shown_again_by_handle_and_only_as_found(world):
    s01 = world["codes"]["s01"]
    again = {
        "statements": [
            {
                "kind": "finding",
                "text": "",
                "refs": [{"key": "x", "type": "finding", "id": "F1"}],
                "attribute": None,
            }
        ]
    }
    chat = Chat(world, request(s01, places=["Sampleton"]), again)
    first = chat.ask("Find the owner, through Sampleton.", [s01])
    second = chat.ask("Show me what you found again.")
    shown = next(s for s in first["answer"]["statements"] if s["kind"] == "finding")
    assert second["answer"]["statements"] == [shown]


def test_a_finding_store_already_holds_is_not_proposed_again(world):
    s02 = world["features"][world["codes"]["s02"]]
    record = {
        "finding": {"value": "Example Pipe Line Co", "date": "1931-03-12"},
        "store_key": "owner",
        "normalized": {"owner": "example pipe line"},
    }
    assert cite_flow.held_in_store(record, [s02])["status"] == "accepted"


def test_a_search_nobody_follows_any_more_is_cancelled():
    from cite_client import _Run

    run = _Run(release=lambda: None)
    assert not run.idle(15)
    run._touched -= 16
    assert run.idle(15)


def test_an_operator_question_is_never_searched_as_the_owner(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, attribute="owner", places=["Sampleton"]))
    out = chat.ask("Who operated this section? Look in the journals, through Sampleton.", [s01])
    assert out["answer"]["statements"][0]["text"].startswith("I cannot look for the operator")
    assert chat.cite.inputs == []


def test_two_owners_found_are_not_a_disagreement_and_no_name_ends_in_two_stops():
    from cite_result import CiteResult
    from evals import fake_cite

    section = {"section_id": "s", "places": [], "attributes": ["Ownership"]}
    page = fake_cite.citation(3, "1931-02-19", "64", "A Co. owns it through B Co.")
    raw = fake_cite.result(
        section,
        [
            fake_cite.claim("Ownership", "A Co.", {"owner": "a"}, page),
            fake_cite.claim("Ownership", "B Co.", {"owner": "b"}, page),
        ],
        [page],
    )
    result = CiteResult.model_validate(raw)
    records = cite_flow.findings_of(result, "s", 1)
    statements = cite_flow.report(result, records, ["owner"], "s", "section x")
    assert [s.kind for s in statements] == ["finding", "finding"]
    assert all(".." not in s.text for s in statements)


def test_a_search_left_running_by_stop_is_recorded_as_stopped():
    from agent import ingress

    state = {
        "messages": [],
        "seen": 0,
        "cite_job": None,  # Studio's Stop clears it
        "cite": {"runs": [{"section_id": "s", "outcome": "running"}], "findings": {}},
    }
    out = ingress(state)
    assert out["cite"]["runs"][-1]["outcome"] == "stopped before it finished"
    assert out["cite_job"] is None


def test_searching_the_same_years_again_is_allowed(world):
    s01 = world["codes"]["s01"]
    chat = Chat(
        world,
        request(s01, places=["Sampleton"]),
        request(s01, places=["Sampleton"], years=[1931, 1932]),
        cite=FakeCite("nothing_found", "owner_found"),
    )
    chat.ask("Find the owner, through Sampleton.", [s01])
    again = chat.ask("Try the search again, same towns.")
    assert "finding" in kinds(again)
    assert chat.cite.inputs[-1]["search_window"] == {"from": 1931, "to": 1932}
