"""Every reference names what it opens, as store has it, so Studio never guesses.

Studio lists sections and pipelines only. A trace merged into a section and a line
traced as gone are not on its list, so the service names them.
"""

from evals.fake_store import FakeStore, load_world
from grounding import reads_from
from render import render
from schemas import Draft
from tools import make_tools


def _read(*codes):
    world = load_world("small")
    store = FakeStore(world).client()
    (read_feature,) = make_tools(store)
    artifacts = [read_feature.func(world["codes"][code])[1] for code in codes]
    return world, reads_from(artifacts)


def _refs(read, refs):
    draft = Draft.model_validate(
        {"statements": [{"kind": "fact", "text": "Store holds this.", "refs": refs}]}
    )
    return render(draft, read).statements[0].refs


def _short(world, code):
    return world["codes"][code][:8]


def test_a_claim_on_a_merged_trace_names_the_trace_and_the_section():
    world, read = _read("s13")
    twin = world["codes"]["d13"]
    owner = next(
        c for c in read.claims.values() if c["feature_id"] == twin and c["attribute_key"] == "owner"
    )
    (ref,) = _refs(read, [{"key": "c1", "type": "claim", "id": owner["id"]}])
    assert ref.label == f"trace {_short(world, 'd13')}, merged into section {_short(world, 's13')}"


def test_a_line_traced_as_gone_is_named_so():
    world, read = _read("s08", "r01")
    (ref,) = _refs(read, [{"key": "f1", "type": "feature", "id": world["codes"]["r01"]}])
    assert ref.label == f"line traced as gone {_short(world, 'r01')}"


def test_a_section_and_a_pipeline_go_by_their_names():
    world, read = _read("s06", "l01")
    section, line = _refs(
        read,
        [
            {"key": "f1", "type": "feature", "id": world["codes"]["s06"]},
            {"key": "f2", "type": "feature", "id": world["codes"]["l01"]},
        ],
    )
    assert section.label == f"section {_short(world, 's06')}"
    assert line.label.startswith("pipeline ") or line.label == read.features[line.id]["label"]


def test_a_link_says_what_it_links():
    _, read = _read("s08", "r01", "s06")
    end = next(lk for lk in read.links.values() if lk["relation"] == "same_as")
    member = next(lk for lk in read.links.values() if lk["relation"] == "part_of")
    end_ref, member_ref = _refs(
        read,
        [
            {"key": "k1", "type": "link", "id": end["id"]},
            {"key": "k2", "type": "link", "id": member["id"]},
        ],
    )
    # A line traced as gone that is the same pipe ends the section (Studio: an end).
    assert end_ref.label == "End, traced as gone"
    assert member_ref.label == "Part of a pipeline"
