"""Store's rules for a value, as the Agent checks them before sending a proposal. The rules
file is store's registry; Studio's frontend reads the same file. All data is invented."""

import re

import httpx
import pytest

import store_writer
import value_rules
from store_client import StoreError
from tests.test_pipeline import load_world

CITED = {"citations": [{"citation": "page", "role": "states"}]}


def claim(**value):
    return {"ref": "claim", "feature": "s-1", **CITED, **value}


def test_the_rules_are_stores_registry():
    assert value_rules.RULES["diameter"]["units"] == ["in", "mm"]
    assert value_rules.RULES["diameter"]["min_value"] == 0
    assert "operational" in value_rules.RULES["status"]["enum_values"]


@pytest.mark.parametrize(
    "value",
    [
        {"attribute": "diameter", "value_num": 12, "value_unit": "in"},
        {"attribute": "diameter", "value_num": 610, "value_unit": "mm"},
        {"attribute": "owner", "value_text": "Alder Gas Co."},
        {"attribute": "status", "value_text": "operational"},
    ],
)
def test_a_claim_store_takes_passes(value):
    value_rules.check_claim(claim(**value), kind="section", network="gas")


@pytest.mark.parametrize(
    ("value", "words"),
    [
        ({"attribute": "diameter", "value_num": 12}, "diameter needs a unit, one of (in, mm)"),
        ({"attribute": "diameter", "value_num": 12, "value_unit": "ft"}, "needs a unit"),
        (
            {"attribute": "diameter", "value_num": 0, "value_unit": "in"},
            "diameter must be more than 0",
        ),
        ({"attribute": "diameter", "value_num": -4, "value_unit": "in"}, "must be more than 0"),
        ({"attribute": "status", "value_text": "abandoned-ish"}, "is not a value of status"),
        ({"attribute": "owner"}, "owner needs a text value"),
        ({"attribute": "colour", "value_text": "red"}, "colour is not an attribute store knows"),
    ],
)
def test_a_claim_store_refuses_is_refused_in_its_words(value, words):
    with pytest.raises(value_rules.RuleError, match=re.escape(words)):
        value_rules.check_claim(claim(**value))


def test_kind_and_network_are_checked_when_known():
    with pytest.raises(value_rules.RuleError, match="does not apply to a line"):
        value_rules.check_claim(
            claim(attribute="diameter", value_num=12, value_unit="in"), kind="line"
        )
    with pytest.raises(value_rules.RuleError, match="the electric network"):
        value_rules.check_claim(
            claim(attribute="diameter", value_num=12, value_unit="in"), network="electric"
        )


def test_a_bundle_store_would_refuse_is_never_sent():
    sent = []
    client = store_writer.ProposalClient(
        "http://127.0.0.1:1",
        "lgt_test",
        transport=httpx.MockTransport(
            lambda r: sent.append(r) or httpx.Response(200, json={"ids": {}})
        ),
    )
    bad = {"claims": [claim(attribute="diameter", value_num=12)]}
    with pytest.raises(StoreError) as caught:
        client.propose(bad)
    assert caught.value.kind == "bad_request"
    assert "needs a unit" in caught.value.detail
    assert sent == []
    client.propose({"claims": [claim(attribute="diameter", value_num=12, value_unit="in")]})
    assert len(sent) == 1


def test_every_finding_the_agent_proposes_passes_the_rules():
    from tests.test_cite import Chat as CiteChat
    from tests.test_cite import request

    world = load_world("small")
    s01 = world["codes"]["s01"]
    for attribute in ("owner", "status"):
        chat = CiteChat(world, request(s01, attribute=attribute, places=["Sampleton"]))
        chat.ask("Find it, through Sampleton.", [s01])
        chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
        [bundle] = chat.writer.bundles
        value_rules.check_bundle(bundle)
