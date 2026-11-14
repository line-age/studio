"""Leads (leads.py) on the invented world: each rule on the shape that fires it, a near
miss that stays silent, and the checks that keep a lead from passing as a claim."""

import pytest

from evals.fake_store import FakeStore, load_world
from grounding import problems_of, reads_from
from render import render
from schemas import Draft
from tools import make_tools


@pytest.fixture
def world():
    return load_world("small")


def context_of(world, code):
    _, read_context = make_tools(FakeStore(world).client())
    return reads_from([read_context.func(world["codes"][code])[1]])


def rules(read):
    return [lead["rule"] for lead in read.leads.values()]


def lead(read, rule):
    return next(item for item in read.leads.values() if item["rule"] == rule)


def test_every_lead_says_it_is_not_in_store(world):
    for code in ("s14", "s16", "s04", "s20"):
        for item in context_of(world, code).leads.values():
            assert item["text"].startswith(("Not in store", "Not settled in store"))


def test_rule_1_a_neighbours_cited_page(world):
    item = lead(context_of(world, "s14"), "neighbour_source")
    assert "p. 52" in item["text"] and item["attribute"] == "owner"


def test_rule_2_a_neighbours_owner_worth_checking_never_its_diameter(world):
    read = context_of(world, "s14")
    item = lead(read, "neighbour_owner")
    assert "Invented Natural Gas Corp." in item["text"] and "Worth checking" in item["text"]
    assert not any(
        i.get("attribute") == "diameter" and i["rule"] == "neighbour_owner"
        for i in read.leads.values()
    )


def test_rule_3_the_pipelines_owner(world):
    item = lead(context_of(world, "s16"), "pipeline_claims")
    assert "Example Pipe Line Co." in item["text"]


def test_rule_4_when_to_search_never_a_build_date(world):
    item = lead(context_of(world, "s14"), "edition_window")
    assert "1926" in item["text"] and "1932" in item["text"]
    assert "never a build date" in item["text"] and "built" not in item["text"]


def test_rule_5_what_confirming_a_proposed_twin_would_carry(world):
    item = lead(context_of(world, "s14"), "proposed_link")
    assert "Example Pipe Line Co." in item["text"] and "proposed, not decided" in item["text"]


def test_rule_6_a_value_ruled_out(world):
    item = lead(context_of(world, "s04"), "rejected_value")
    assert "Sample Gas Co." in item["text"] and "Do not propose it again" in item["text"]


def test_rule_7_disagreeing_owners_to_resolve(world):
    item = lead(context_of(world, "s20"), "conflict")
    assert "To resolve, not to pick" in item["text"]


def test_a_section_that_holds_its_owner_gets_no_owner_leads(world):
    read = context_of(world, "s15")  # owns its owner; touches s14 and s16
    assert not [
        i
        for i in read.leads.values()
        if i.get("attribute") == "owner" and i["rule"] != "rejected_value"
    ]


def test_a_near_miss_and_a_crossing_give_no_neighbour_leads(world):
    for code in ("s17", "s18"):
        assert not {"neighbour_source", "neighbour_owner"} & set(rules(context_of(world, code)))


def test_better_backed_leads_come_first(world):
    read = context_of(world, "s14")
    backing = [item["backing"] for item in read.leads.values()]
    assert backing == sorted(backing, reverse=True)


def _picked(read, kind, handle):
    return Draft.model_validate(
        {
            "statements": [
                {"kind": kind, "text": "", "refs": [{"key": "x", "type": kind, "id": handle}]}
            ]
        }
    )


@pytest.mark.parametrize("code", ["s14", "s16", "s04", "s20"])
def test_every_lead_is_grounded_by_an_independent_check(world, code):
    from evals.score import ungrounded

    read = context_of(world, code)
    draft = Draft.model_validate(
        {
            "statements": [
                {"kind": "lead", "text": "", "refs": [{"key": "l", "type": "lead", "id": h}]}
                for h in read.leads
            ]
        }
    )
    answer = render(draft, read)
    assert problems_of(draft, answer, read) == []
    assert ungrounded(answer.model_dump(), world) == []
    assert all(s.rule for s in answer.statements)


# Seeded bad answers: what the checks must stop.


def test_a_lead_stated_as_the_sections_own_claim_is_blocked(world):
    read = context_of(world, "s14")
    neighbour_owner = next(
        c
        for c in read.claims.values()
        if c["feature_id"] == world["codes"]["s15"] and c["attribute_key"] == "owner"
    )
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "fact",
                    "text": "Its owner is {c1.value}.",
                    "refs": [{"key": "c1", "type": "claim", "id": neighbour_owner["id"]}],
                }
            ]
        }
    )
    answer = render(draft, read)
    assert problems_of(draft, answer, read)


@pytest.mark.parametrize("words", ["It is connected to the next section.", "It was built then."])
def test_connected_or_built_in_the_models_words_is_blocked(world, words):
    read = context_of(world, "s14")
    claim = next(c for c in read.claims.values() if c["attribute_key"] == "status")
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "fact",
                    "text": words + " {c1.value}",
                    "refs": [{"key": "c1", "type": "claim", "id": claim["id"]}],
                }
            ]
        }
    )
    assert problems_of(draft, render(draft, read), read)


def test_a_lead_changed_is_blocked(world):
    read = context_of(world, "s14")
    draft = _picked(read, "lead", "L1")
    answer = render(draft, read)
    answer.statements[0].text = answer.statements[0].text.replace("Not in store", "Store says", 1)
    assert problems_of(draft, answer, read)


def test_a_citation_request_carries_the_sections_leads_as_hints(world):
    read = context_of(world, "s14")
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "citation_request",
                    "text": "",
                    "attribute": "owner",
                    "refs": [{"key": "f", "type": "feature", "id": world["codes"]["s14"]}],
                }
            ]
        }
    )
    request = render(draft, read).statements[0].request
    rules_ = {h.rule for h in request.hints}
    assert {"neighbour_source", "neighbour_owner", "edition_window"} <= rules_
    assert all(h.text.startswith("Not in store") for h in request.hints)


# From the reviews of B6: each on a hand-made shape.

from context import Editions
from leads import find_leads


def _claim(
    cid, attribute, value, status="accepted", edtf=None, source="Example Gazette", page="p. 1"
):
    return {
        "id": cid,
        "attribute_key": attribute,
        "value_text": value,
        "status": status,
        "valid_edtf": edtf,
        "start_earliest": None,
        "start_latest": None,
        "end_earliest": None,
        "end_latest": None,
        "citations": [
            {"role": "states", "source_id": source, "source_title": source, "locator": page}
        ],
    }


def _feature(fid, claims=(), kind="section", links=()):
    return {"id": fid, "kind": kind, "label": None, "claims": list(claims), "links": list(links)}


def _leads(feature, neighbours=(), pipelines=(), twins=(), merged=()):
    import itertools

    counter = itertools.count(1)
    return find_leads(
        feature,
        list(merged),
        list(neighbours),
        list(pipelines),
        list(twins),
        Editions([], False),
        lambda: f"L{next(counter)}",
    )


ME = "m" * 8 + "-0"


def test_a_value_ruled_out_is_never_offered_by_another_rule():
    me = _feature(ME, [_claim("r", "owner", "Acme Gas", status="rejected")])
    other = _feature("n" * 8 + "-0", [_claim("c", "owner", "Acme Gas")])
    found = _leads(me, neighbours=[other])
    # The neighbour's page may still be pointed to; its value is never offered.
    assert not [lead for lead in found if lead.rule == "neighbour_owner"]
    assert [lead.rule for lead in found if "Acme Gas" in lead.text] == ["rejected_value"]


def test_owners_for_years_that_do_not_overlap_are_no_conflict():
    me = _feature(
        ME,
        [
            _claim("a", "owner", "A Co.", edtf="1930/1940"),
            _claim("b", "owner", "B Co.", edtf="1950/1960"),
        ],
    )
    assert not [lead for lead in _leads(me) if lead.rule == "conflict"]


def test_owners_with_no_dates_at_all_neither_crash_nor_conflict():
    me = _feature(ME, [_claim("a", "owner", "A Co."), _claim("b", "owner", "B Co.")])
    assert not [lead for lead in _leads(me) if lead.rule == "conflict"]


def test_a_merged_traces_owner_that_disagrees_is_a_conflict():
    me = _feature(ME, [_claim("a", "owner", "A Co.", edtf="1938")])
    twin = _feature("t" * 8 + "-0", [_claim("b", "owner", "B Co.", edtf="1938")])
    (conflict,) = [lead for lead in _leads(me, merged=[twin]) if lead.rule == "conflict"]
    assert conflict.text.startswith("Not in store as one answer:")


def test_a_claim_with_no_words_gives_no_lead_and_fails_nothing():
    bad = _claim("c", "owner", None)
    other = _feature("n" * 8 + "-0", [bad, _claim("d", "operator", "Op Co.")])
    found = _leads(_feature(ME), neighbours=[other])
    assert any("Op Co." in lead.text for lead in found)


def test_two_neighbours_citing_one_page_are_one_place_to_look_and_one_source():
    a = _feature("a" * 8 + "-0", [_claim("c1", "owner", "Acme Gas", page="p. 9")])
    b = _feature("b" * 8 + "-0", [_claim("c2", "owner", "Acme Gas", page="p. 9")])
    found = _leads(_feature(ME), neighbours=[a, b])
    assert len([lead for lead in found if lead.rule == "neighbour_source"]) == 1
    assert {lead.backing for lead in found if lead.rule == "neighbour_owner"} == {1}


def test_a_link_is_not_backing():
    twin = _feature("t" * 8 + "-0", [_claim("c", "owner", "Acme Gas")])
    link = {"id": "k", "relation": "same_as", "status": "proposed"}
    (proposed,) = [
        lead for lead in _leads(_feature(ME), twins=[(link, twin)]) if lead.rule == "proposed_link"
    ]
    assert proposed.backing == 1


def test_two_independent_sources_for_one_value_rank_first():
    a = _feature("a" * 8 + "-0", [_claim("c1", "owner", "Acme Gas", source="Journal A")])
    line = _feature(
        "l" * 8 + "-0", [_claim("c2", "owner", "Acme Gas", source="Journal B")], kind="line"
    )
    b = _feature("b" * 8 + "-0", [_claim("c3", "owner", "Other Co.", source="Journal C")])
    found = [
        lead
        for lead in _leads(_feature(ME), neighbours=[b, a], pipelines=[line])
        if lead.rule != "neighbour_source"
    ]
    assert "Acme Gas" in found[0].text and found[0].backing == 2


def test_a_twin_is_found_whichever_end_the_section_is(world):
    from evals.fake_store import FakeStore
    from tools import make_tools

    store = FakeStore(world)
    s14, d19 = world["codes"]["s14"], world["codes"]["d19"]
    for link in store.world["features"][s14]["links"]:
        if link["relation"] == "same_as":
            link["from_feature_id"], link["to_feature_id"] = s14, d19
    _, read_context = make_tools(store.client())
    read = reads_from([read_context.func(s14)[1]])
    assert "proposed_link" in rules(read)


def test_asking_context_of_a_pipeline_uses_no_slot(world):
    from evals.fake_store import FakeStore
    from tools import make_tools

    _, read_context = make_tools(FakeStore(world).client())
    for _ in range(3):
        read_context.func(world["codes"]["l01"])
    _, artifact = read_context.func(world["codes"]["s14"])
    assert "context_of" in artifact


def test_the_model_may_write_a_fact_about_the_pipelines_own_claims(world):
    read = context_of(world, "s16")
    line = world["codes"]["l01"]
    name, owner = (
        next(c for c in read.claims.values() if c["feature_id"] == line and c["attribute_key"] == a)
        for a in ("name", "owner")
    )
    draft = Draft.model_validate(
        {
            "statements": [
                {
                    "kind": "fact",
                    "text": "Its pipeline is {c1.value}, owned by {c2.value}, {c2.period}.",
                    "refs": [
                        {"key": "c1", "type": "claim", "id": name["id"]},
                        {"key": "c2", "type": "claim", "id": owner["id"]},
                    ],
                }
            ]
        }
    )
    problems = problems_of(draft, render(draft, read), read)
    assert not [p for p in problems if "around it" in p]
