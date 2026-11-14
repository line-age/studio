"""The section pack: one invented section's pack is kept as the golden cite brief, and
the pack read out as a brief says only what the pack holds."""

import json

from evals.fake_store import FakeStore, load_world
from pack import brief
from schemas import SectionPack
from settings import ROOT
from tools import make_tools

GOLDEN = ROOT / "contract" / "examples" / "section-pack.json"


def pack_of(code: str) -> SectionPack:
    world = load_world("small")
    _, read_context = make_tools(FakeStore(world).client())
    return SectionPack.model_validate(read_context.func(world["codes"][code])[1]["pack"])


def test_the_golden_pack_is_what_the_code_makes():
    # s14: only route and status of its own; a neighbour with a cited owner, a proposed
    # twin, printings, leads. Regenerate with the line below when the pack changes.
    made = pack_of("s14").model_dump(mode="json")
    assert json.loads(GOLDEN.read_text()) == made, (
        "the pack changed: if that is meant, rewrite contract/examples/section-pack.json "
        "from pack_of('s14') and review the difference"
    )


def test_the_pack_holds_what_cite_takes_in():
    pack = pack_of("s14")
    assert pack.network == "gas" and len(pack.endpoints) == 2
    assert pack.states == [] and pack.places == []  # no place data yet
    assert [n.meets for n in pack.neighbours] == ["end_to_end"]
    assert pack.neighbours[0].claims  # the neighbour's own claims, kept under it
    assert {lead.rule for lead in pack.leads} >= {"neighbour_source", "edition_window"}


def test_the_pack_reads_as_a_brief_and_says_only_what_it_holds():
    pack = pack_of("s14")
    text = brief(pack)
    assert text.startswith(f"Section: section {pack.section_id[:8]}")
    assert "States and places: Unknown" in text
    assert "Worked out (not claims):" in text and "Leads (not in store; where to look):" in text
    for lead in pack.leads:
        assert lead.text in text
    assert "connected" not in text and "built" not in text.replace("never a build date", "")
