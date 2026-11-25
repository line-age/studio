"""Searching with cite from the chat: the guard, the run, what is shown, and Propose.

Offline: the model is scripted, store is the fake store on the small world, cite is the
fake cite and the proposal client a fake that keeps what it was sent.
"""

import pytest
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

from evals import fake_cite
from evals.fake_cite import FakeCite
from evals.fake_store import FakeStore, load_world
from src.agent.graph import build_graph
from src.answer.schemas import Answer
from src.flows import cite_flow
from src.flows.cite_flow import CITE_LINES
from src.flows.cite_result import CiteResult
from src.worked_out import context
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

    def ask(self, words, about=(), action=None, press=True) -> dict:
        self.n += 1
        question = {"words": words, "about": [{"kind": "section", "id": i} for i in about]}
        if action:
            question["action"] = action
        message = HumanMessage(words, id=f"q{self.n}", additional_kwargs={"question": question})
        config = {"configurable": {"thread_id": "t"}, "recursion_limit": 200}
        out = self.graph.invoke({"messages": [message]}, config)
        return press_search(self, out) if press else out


def offered(out) -> dict | None:
    """The ready search an answer offers, if any."""
    for st in (out.get("answer") or {}).get("statements") or []:
        if st["kind"] == "search_offer" and st["search"]["ready"]:
            return st
    return None


def press_search(chat, out) -> dict:
    """Press Search on the offer in `out`, as Studio does, and return the answer as the
    person reads the two turns: the offer's place taken by what the search said."""
    offer = offered(out)
    if offer is None:
        return out
    after = chat.ask(
        "Search", action={"kind": "search", "offer": offer["search"]["id"]}, press=False
    )
    before = out["answer"]["statements"]
    i = before.index(offer)
    merged = [*before[:i], *after["answer"]["statements"], *before[i + 1 :]]
    return {**after, "answer": {**after["answer"], "statements": merged}, "offer": offer}


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
    assert answer.statements[0].text.startswith("Searching our sources on the web for the owner of")
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


def test_no_towns_named_searches_by_the_towns_along_its_line(world):
    from src.worked_out import places

    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01))
    out = chat.ask("Look for the owner of this section.", [s01])
    along = places.towns_along(context.route_lines(world["features"][s01]))
    assert along, "the invented line lies near real towns"
    [sent] = chat.cite.inputs
    # Code's towns, not the person's: none counts as given.
    assert sent["places"] == along and sent["places_given"] == []
    [line] = [s for s in out["answer"]["statements"] if s["kind"] == "citation_request"]
    assert "by the towns along its line (" in line["text"]
    assert "name others to change them" in line["text"]
    # What it searches for is not said again as "No source says".
    assert not any(
        s["kind"] == "unknown" and s.get("attribute") == "owner"
        for s in out["answer"]["statements"]
    )


def test_no_towns_near_it_asks_for_them_and_the_next_message_steers_the_kept_request(
    world, monkeypatch
):
    from src.worked_out import places

    monkeypatch.setattr(places, "all_places", lambda: ())
    s01 = world["codes"]["s01"]
    chat = Chat(
        world,
        request(s01),
        request(s01, places=["Sampleton"]),
    )
    first = chat.ask("Look for the owner of this section.", [s01])
    # No towns near it and none given: a search card with Search off (Figma 29, A2).
    assert kinds(first) == ["search_offer"]
    [offer] = first["answer"]["statements"]
    assert offer["search"]["ready"] is False and offer["search"]["places"] == []
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
    assert texts[0].endswith("Not found here does not mean it does not exist.")
    # What was searched, step by step: corpus first (not yet), then the web.
    assert texts[1] == "Our corpus of the journals: not searched, not available yet."
    assert texts[2].startswith(
        "Searched the web, our sources only: 2 searches (Sampleton pipe line;"
    )
    assert "Pages read: Example Archive (2)." in texts[2]
    assert texts[3].startswith("cite turned down 1 other proposed value:")


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
    assert [f.text.split(":")[0] for f in found] == [cite_flow.FOUND, cite_flow.LEAD]
    assert [f.flag for f in found[1].finding.flags] == ["judge_unclear"]
    # The reviewer was not sure: a lead, never proposed, whatever it scores.
    assert found[1].finding.lead and not found[1].finding.proposable
    assert found[1].finding.confidence == 0.7 and found[0].finding.confidence == 0.85
    assert "the reviewer was not sure" in found[1].finding.not_proposable
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
    assert bundle["citations"][0]["url"].startswith("https://example.org/details/")
    assert bundle["sources"][0]["title"] == "The Example Trade Journal 1931-03-12: Vol 12 Iss 3"
    assert bundle["sources"][0]["published_edtf"] == "1931-03-12"


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
    from src.clients.cite_client import _Run

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
    from evals import fake_cite
    from src.flows.cite_result import CiteResult

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
    assert [s.kind for s in statements] == ["finding", "finding", "searched", "searched"]
    assert all(".. " not in s.text and not s.text.endswith("..") for s in statements)


def test_a_search_left_running_by_stop_is_recorded_as_stopped():
    from src.agent.nodes.ingress import ingress

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


def test_a_value_store_already_holds_is_found_in_store_and_not_offered_to_propose(world):
    s03 = world["codes"]["s03"]  # holds a candidate owner
    held = next(c for c in world["features"][s03]["claims"] if c["attribute_key"] == "owner")
    held["value_text"] = "Example Pipe Line Co."
    chat = Chat(world, request(s03, places=["Sampleton"]))
    out = chat.ask("Find the owner, through Sampleton.", [s03])
    finding = next(s for s in out["answer"]["statements"] if s["kind"] == "finding")
    assert finding["text"].startswith("Found, already in store as a candidate:")
    assert finding["finding"]["proposable"] is False


def test_start_fresh_drops_the_messages_and_keeps_what_cite_found(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    chat.ask("Find the owner, through Sampleton.", [s01])
    out = chat.ask("Start fresh", action={"kind": "fresh_start"})
    assert out["messages"] == [] and out["answer"] is None and out["seen"] == 0
    assert "F1" in out["cite"]["findings"] and out["cite"]["runs"]
    # The kept finding can still be proposed after a fresh start.
    proposed = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
    assert proposed["answer"]["statements"][0]["kind"] == "proposed"


def test_an_owner_the_pipeline_already_holds_is_not_proposed_for_it_again(world):
    s06, l01 = world["codes"]["s06"], world["codes"]["l01"]
    chat = Chat(world, request(s06, places=["Sampleton"]))
    chat.ask("Find the owner, through Sampleton.", [s06])
    out = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1", "target": l01})
    text = out["answer"]["statements"][0]["text"]
    assert text.startswith("Store already holds Example Pipe Line Co. as the owner of Example")
    assert chat.writer.bundles == []


def test_an_owner_is_proposed_for_the_pipeline_its_section_is_part_of(world):
    s06, l01 = world["codes"]["s06"], world["codes"]["l01"]
    # A pipeline that holds no owner yet.
    line = world["features"][l01]
    line["claims"] = [c for c in line["claims"] if c["attribute_key"] != "owner"]
    chat = Chat(world, request(s06, places=["Sampleton"]))
    chat.ask("Find the owner, through Sampleton.", [s06])
    out = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1", "target": l01})
    [statement] = Answer.model_validate(out["answer"]).statements
    assert statement.kind == "proposed" and "of the owner of" not in statement.text
    [bundle] = chat.writer.bundles
    [claim] = bundle["claims"]
    # On the pipeline, not the section: an owner is the pipeline's.
    assert claim["feature"] == l01 and claim["attribute"] == "owner"
    assert claim["external_key"]["key"].startswith(f"claim/{l01}/owner/")
    assert statement.refs[0].feature_id == l01


def test_no_pipeline_but_the_sections_own_is_a_target(world):
    s01, l01 = world["codes"]["s01"], world["codes"]["l01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    chat.ask("Find the owner, through Sampleton.", [s01])
    # s01 is in no pipeline: l01 is not its pipeline.
    out = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1", "target": l01})
    assert out["answer"]["statements"][0]["text"] == cite_flow.CITE_LINES["not_its_pipeline"]
    assert chat.writer.bundles == []


def test_a_diameter_is_never_proposed_for_a_pipeline(world):
    s06, l01 = world["codes"]["s06"], world["codes"]["l01"]
    chat = Chat(world, request(s06, attribute="diameter", places=["Sampleton"]))
    chat.ask("Find the diameter, through Sampleton.", [s06])
    out = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1", "target": l01})
    assert out["answer"]["statements"][0]["text"] == cite_flow.CITE_LINES["not_its_pipeline"]
    assert chat.writer.bundles == []


# A search waits for Search (plan 2b, Figma section 29 board A) ---------------------------


def test_a_search_is_offered_and_nothing_runs_until_search_is_pressed(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("owner_found"))
    out = chat.ask("Find who owned it; it runs through Sampleton.", [s01], press=False)
    offer = offered(out)
    assert offer["text"] == "Search our sources for the owner"
    assert offer["search"]["section_id"] == s01
    assert offer["search"]["places"] == ["Sampleton"]
    assert offer["search"]["years"]  # the years cite will read, known before it runs
    assert chat.cite.inputs == []  # nothing started, nothing spent
    after = chat.ask("Search", action={"kind": "search", "offer": offer["search"]["id"]})
    assert "finding" in kinds(after)
    assert len(chat.cite.inputs) == 1


def test_a_search_runs_once_and_an_unknown_offer_is_refused(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("owner_found"))
    out = chat.ask("Find who owned it; it runs through Sampleton.", [s01])
    again = chat.ask("Search", action={"kind": "search", "offer": out["offer"]["search"]["id"]})
    assert again["answer"]["statements"][0]["text"] == CITE_LINES["already_searched"]
    gone = chat.ask("Search", action={"kind": "search", "offer": "no-such-offer"})
    assert gone["answer"]["statements"][0]["text"].startswith("That card is no longer")
    assert len(chat.cite.inputs) == 1


def test_what_the_offer_says_is_what_is_searched_whatever_studio_sends(world):
    """Studio sends only the offer's id: the towns and years are the thread's own."""
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("owner_found"))
    out = chat.ask("Find who owned it; it runs through Sampleton.", [s01], press=False)
    offer = offered(out)
    chat.ask("Search", action={"kind": "search", "offer": offer["search"]["id"]})
    assert chat.cite.inputs[0]["places"] == ["Sampleton"]


def test_a_search_started_from_words_fails_its_case(world):
    """The mutation of plan 2b: an answer that starts cite with no Search pressed."""
    from evals.cases import load
    from evals.checks import check

    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("owner_found"))
    out = chat.ask("Find who owned this section in the journals. It runs through Sampleton.", [s01])
    case = next(c for c in load() if c.id == "B45-002")
    pressed = {"answer": out["answer"], "tools": [], "pressed": True}
    assert "started without" not in check(case, world, pressed)["forbidden"]["comment"]
    unpressed = {"answer": out["answer"], "tools": [], "pressed": False}
    assert "started without" in check(case, world, unpressed)["forbidden"]["comment"]


def test_a_search_cite_was_too_busy_to_start_can_be_pressed_again(world):
    """Found in review: the offer was marked run before cite started."""
    s01 = world["codes"]["s01"]
    cite = FakeCite("owner_found")
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=cite)
    out = chat.ask("Find who owned it; it runs through Sampleton.", [s01], press=False)
    offer = offered(out)["search"]["id"]
    cite.busy = True
    busy = chat.ask("Search", action={"kind": "search", "offer": offer})
    assert busy["answer"]["statements"][0]["text"] == CITE_LINES["busy"]
    cite.busy = False
    again = chat.ask("Search", action={"kind": "search", "offer": offer})
    assert "finding" in kinds(again)


# Words that name no attribute search for what the section is missing (2026-11-23) -------


def test_what_a_section_is_missing_is_worked_out_from_what_store_holds(world):
    from src.clients.store_client import StoreClient  # noqa: F401 - the fake store is its client
    from src.worked_out.context import search_gaps

    store = FakeStore(world).client()

    def gaps(code):
        feature = store.feature(world["codes"][code])
        pipeline_id = next(
            (
                link["to_feature_id"]
                for link in feature.get("links") or []
                if link["relation"] == "part_of" and link["status"] == "confirmed"
            ),
            None,
        )
        pipeline = store.feature(pipeline_id) if pipeline_id else None
        return search_gaps(feature, [], pipeline)

    assert gaps("s01") == ["owner", "diameter", "status"]
    # s02 has an accepted owner and diameter: only when it was built is missing.
    assert gaps("s02") == ["status"]
    # s16's pipeline (Example trunk line) holds the owner: the section is not missing it.
    assert "owner" not in gaps("s16")


def test_naming_no_attribute_searches_for_every_one_missing(world):
    s01 = world["codes"]["s01"]
    # The model's old habit: it drafts the owner though none was named.
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("owner_found"))
    out = chat.ask("Find a citation for it; it runs through Sampleton.", [s01], press=False)
    offer = offered(out)
    assert offer["search"]["attributes"] == ["owner", "diameter", "status"]
    assert offer["text"] == ("Search our sources for the owner, the diameter and when it was built")


def test_naming_an_attribute_searches_for_that_one_only(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, attribute="diameter", places=["Sampleton"]))
    out = chat.ask("Find the diameter; it runs through Sampleton.", [s01], press=False)
    assert offered(out)["search"]["attributes"] == ["diameter"]


def test_nothing_missing_is_said_and_nothing_is_searched(world):
    from src.answer.render import Read

    s01 = world["codes"]["s01"]
    read = Read()
    read.feature(FakeStore(world).client().feature(s01))
    drafts = request(s01, places=["Sampleton"])["statements"]
    from src.answer.schemas import DraftStatement, Ref, Statement

    verdict = cite_flow.check_request(
        [DraftStatement.model_validate(d) for d in drafts],
        [Statement(kind="citation_request", text="", refs=[Ref(type="feature", id=s01)])],
        read,
        ["Find a citation for it, through Sampleton."],
        {},
        [],
        gaps=lambda _: [],
    )
    assert isinstance(verdict, cite_flow.Refused)
    assert verdict.line == CITE_LINES["nothing_missing"]


# Confidence, leads and what was searched (cite 0.4)


def test_a_finding_shows_its_confidence_and_the_checks_behind_it(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    out = chat.ask("Find the owner, through Sampleton.", [s01])
    finding = next(s for s in out["answer"]["statements"] if s["kind"] == "finding")
    f = finding["finding"]
    assert finding["text"].endswith("Confidence 0.85.")
    assert (f["confidence"], f["lead"], f["proposable"]) == (0.85, False, True)
    assert [(c["label"], c["passed"]) for c in f["checks"]] == [
        ("The quote is on the page, word for word", True),
        ("The company is named in the passage", True),
        ("A town of the section is named in the passage", True),
        ("The date fits the years searched", True),
        ("A second source says the same", False),
    ]
    assert (f["source"], f["title"]) == (
        "Example Archive",
        "The Example Trade Journal 1931-03-12: Vol 12 Iss 3",
    )


def test_a_lead_is_shown_with_its_source_and_is_never_proposed(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("weak_lead"))
    out = chat.ask("Find the owner, through Sampleton.", [s01])
    finding = next(s for s in out["answer"]["statements"] if s["kind"] == "finding")
    f = finding["finding"]
    assert finding["text"].startswith(f"{cite_flow.LEAD}: Other Gas Co. as the owner of")
    assert "in an undated document" in finding["text"]
    assert finding["text"].endswith("Confidence 0.40.")
    assert (f["lead"], f["proposable"], f["date"]) == (True, False, None)
    assert f["not_proposable"] == "its confidence, 0.40, is below what a finding needs (0.60)"
    assert f["url"] and f["quote"]
    refused = chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
    assert refused["answer"]["statements"][0]["text"].startswith("This finding cannot be proposed")
    assert chat.writer.bundles == []


def test_an_owner_on_an_undated_document_is_not_offered_to_propose():
    section = {"section_id": "s", "places": [], "places_given": []}
    page = fake_cite.citation(4, None, "9", "The Example Pipe Line Co. owns the Sampleton line.")
    raw = fake_cite.result(
        section,
        [fake_cite.claim("Ownership", "Example Pipe Line Co.", {"owner": "example"}, page)],
        [page],
    )
    [record] = cite_flow.findings_of(CiteResult.model_validate(raw), "s", 1)
    f = record["finding"]
    assert (f["lead"], f["proposable"]) == (False, False)
    assert f["not_proposable"].startswith("the document has no date")


def test_every_search_says_what_was_searched_found_or_not(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    out = chat.ask("Find the owner, through Sampleton.", [s01])
    searched = [s["text"] for s in out["answer"]["statements"] if s["kind"] == "searched"]
    assert searched[0] == "Our corpus of the journals: not searched, not available yet."
    assert searched[1].startswith("Searched the web, our sources only: 2 searches")


def test_a_search_that_could_not_run_is_never_worded_as_not_found(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]), cite=FakeCite("failed"))
    out = chat.ask("Find the owner, through Sampleton.", [s01])
    searched = [s["text"] for s in out["answer"]["statements"] if s["kind"] == "searched"]
    assert searched[0] == CITE_LINES["failed"]
    assert "The web, our sources only: not searched, the search failed." in searched
    assert not any("not found" in text for text in searched)


def test_pages_a_source_refused_are_said_and_not_counted_as_searched():
    section = {"section_id": "s", "places": ["Sampleton"], "places_given": ["Sampleton"]}
    raw = fake_cite.result({**section, "attributes": ["Ownership"]}, [], [])
    raw["not_read"] = [
        {"url": "https://refused.example/a", "source": "refused.example", "reason": "refused"},
        {"url": "https://elsewhere.example/b", "source": "", "reason": "not on the list"},
    ]
    lines = cite_flow.searched_lines(CiteResult.model_validate(raw))
    assert lines[-1].startswith("Could not be read: 1 page a source refused")


def test_the_search_card_says_the_most_a_search_may_do(world):
    s01 = world["codes"]["s01"]
    chat = Chat(world, request(s01, places=["Sampleton"]))
    out = chat.ask("Find the owner, through Sampleton.", [s01], press=False)
    offer = next(s for s in out["answer"]["statements"] if s["kind"] == "search_offer")
    assert (offer["search"]["web_searches"], offer["search"]["pages"]) == (6, 6)
