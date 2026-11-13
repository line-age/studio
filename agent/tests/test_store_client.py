import json

import pytest

from evals.fake_store import WORLDS, FakeStore, load_world
from evals.make_world import BUILDERS, render
from store_client import ATTRIBUTE_KEYS, StoreError


def find(world, code):
    for fid, feature in world["features"].items():
        if {"system": "example-import", "key": f"section/{code}"} in feature["external_keys"]:
            return fid
    raise KeyError(code)


@pytest.fixture
def small():
    return load_world("small")


def test_world_files_are_exactly_what_the_generator_makes():
    on_disk = {p.stem for p in WORLDS.glob("*.json")}
    assert on_disk <= set(BUILDERS)
    for name in on_disk:
        assert (WORLDS / f"{name}.json").read_text() == render(name), (
            f"worlds/{name}.json was edited by hand or is stale: "
            "run `uv run python -m evals.make_world`"
        )


def test_the_same_seed_gives_the_same_world():
    assert render("wide") == render("wide")


def test_a_world_nobody_made_cannot_be_loaded():
    with pytest.raises(KeyError):
        load_world("copied-from-somewhere")


def test_people_are_never_named_and_tools_are(small):
    store = FakeStore(small)
    raw = json.dumps(small)
    assert "Alex Example" in raw  # the world does hold a person's name, as store does

    seen = [store.client().feature(fid) for fid in small["features"]]

    assert "Alex Example" not in json.dumps(seen)
    kinds = {(c["asserted_by_kind"], c.get("asserted_by_name")) for f in seen for c in f["claims"]}
    assert ("person", None) in kinds
    assert ("pipeline", "example-cite@0.1") in kinds
    assert all("asserted_by_name" not in link for f in seen for link in f["links"])
    assert all("reviewer_name" not in r for f in seen for c in f["claims"] for r in c["reviews"])


def test_an_unknown_attribute_key_never_reaches_store(small):
    store = FakeStore(small)
    with pytest.raises(StoreError) as refused:
        store.client().missing("ownr")
    assert refused.value.kind == "bad_request"
    assert store.requests == []
    # Why it matters: store itself would answer with every section.
    assert len(store._missing({"attribute": "ownr"}, 1000)) == len(small["sections"])


def test_missing_counts_what_a_section_inherits_from_its_pipeline(small):
    missing = {row["section_id"] for row in FakeStore(small).client().missing("owner").rows}
    assert find(small, "s06") not in missing  # its pipeline has an accepted owner
    assert find(small, "s02") not in missing
    assert {find(small, c) for c in ("s01", "s03", "s04")} <= missing  # candidate, rejected: no


def test_a_list_as_long_as_its_limit_is_flagged_as_cut(small):
    client = FakeStore(small).client()
    assert client.sections(limit=5).cut
    assert len(client.sections(limit=5).rows) == 5
    assert not client.sections().cut
    assert client.sections(limit=len(small["sections"])).cut  # exactly the limit: may be cut


def test_sections_filter_by_area_and_date(small):
    client = FakeStore(small).client()
    s01 = find(small, "s01")
    in_box = client.sections(bbox=(-97.5, 34.5, -96.5, 35.5)).rows
    assert [r["properties"]["section_id"] for r in in_box] == [s01]
    in_1930 = {r["properties"]["section_id"] for r in client.sections(at="1930-06-01").rows}
    assert find(small, "s08") in in_1930 and s01 not in in_1930


def test_links_filter_by_status(small):
    client = FakeStore(small).client()
    assert {r["status"] for r in client.links(status="proposed").rows} == {"proposed"}
    assert len(client.links().rows) == len(small["links"])


@pytest.mark.parametrize(
    ("fail", "kind"), [("unreachable", "unreachable"), ("refused", "refused"), ("error", "error")]
)
def test_failures_are_told_apart(small, fail, kind):
    with pytest.raises(StoreError) as failure:
        FakeStore(small, fail=fail).client().feature(find(small, "s01"))
    assert failure.value.kind == kind


def test_a_feature_that_is_gone_is_not_found(small):
    with pytest.raises(StoreError) as failure:
        FakeStore(small).client().feature("00000000-0000-4000-8000-000000000000")
    assert failure.value.kind == "not_found"


def test_the_client_only_reads(small):
    store = FakeStore(small)
    client = store.client()
    assert not [name for name in dir(client) if name.startswith(("post", "put", "delete", "write"))]
    assert "status" in ATTRIBUTE_KEYS and "build_date" not in ATTRIBUTE_KEYS
