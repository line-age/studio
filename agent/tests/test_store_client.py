import datetime as dt
import json

import httpx
import pytest

from evals.fake_store import TOKEN, WORLDS, FakeStore, load_world
from evals.make_world import BUILDERS, TRACER, render
from store_client import ATTRIBUTE_KEYS, StoreClient, StoreError


@pytest.fixture
def small():
    return load_world("small")


def ids(listing):
    return {row.get("section_id") or row["properties"]["section_id"] for row in listing.rows}


def answering(response: httpx.Response) -> StoreClient:
    return StoreClient(
        "http://store.invalid", TOKEN, transport=httpx.MockTransport(lambda request: response)
    )


# The worlds


def test_world_files_are_exactly_what_the_generator_makes():
    on_disk = {p.stem for p in WORLDS.glob("*.json")}
    assert on_disk <= set(BUILDERS)
    for name in on_disk:
        assert (WORLDS / f"{name}.json").read_text() == render(name), (
            f"worlds/{name}.json was edited by hand or is stale: "
            "run `uv run python -m evals.make_world`"
        )


def test_a_world_nobody_made_cannot_be_loaded():
    with pytest.raises(KeyError):
        load_world("copied-from-somewhere")


def test_the_wide_world_is_the_one_the_counts_were_written_against():
    wide = load_world("wide")
    client = FakeStore(wide).client()
    # Pinned: a change to the generator that moves these moves every count in the evals.
    assert len(wide["sections"]) == 400
    assert len(client.missing("owner").rows) == 284
    assert len(client.links(status="proposed").rows) == 15


def test_rows_are_derived_as_store_derives_them(small):
    rows = {r["id"]: r["properties"] for r in small["sections"]}
    code = small["codes"]

    assert code["r01"] not in rows and code["d13"] not in rows  # a removal, a merged trace
    # A proposed end shows on the row, and is not in the feature's own dates.
    assert rows[code["s08"]]["end_status"] == "proposed"
    assert rows[code["s08"]]["time_end"] == "1946-12-31"
    assert small["features"][code["s08"]]["dates"]["time_end"] is None
    # A confirmed end is the section's own.
    assert rows[code["s09"]]["end_status"] == "confirmed"
    assert small["features"][code["s09"]]["dates"]["time_end"] == "1951-12-31"
    # A source that dates the start after a map already shows the line: a conflict.
    assert rows[code["s11"]]["date_conflict"] is True
    assert rows[code["s11"]]["time_start"] == "1932-12-31"
    assert rows[code["s12"]]["existed_from"] is None
    assert rows[code["s07"]]["diameter"] == "16 in"
    assert rows[code["s06"]]["line_id"] == code["l01"]


def test_a_features_claims_come_ordered_by_attribute(small):
    keys = [c["attribute_key"] for c in small["features"][small["codes"]["s02"]]["claims"]]
    assert keys == sorted(keys)


# Names


def test_no_person_is_named_in_anything_the_client_returns(small):
    raw = json.dumps(small)
    assert "Alex Example" in raw and TRACER in raw  # the world holds both, as store does
    client = FakeStore(small).client()

    seen = json.dumps(
        [
            [client.feature(fid) for fid in small["features"]],
            client.sections().rows,
            client.missing("owner").rows,
            client.links().rows,
        ]
    )

    assert "Alex Example" not in seen
    assert TRACER not in seen  # not in an external key, not in a "traced in ..." locator
    assert "external_keys" not in seen
    assert '"locator": "traced"' in seen


def test_a_tool_keeps_its_name_and_a_person_is_only_a_person(small):
    client = FakeStore(small).client()
    claims = [c for fid in small["features"] for c in client.feature(fid)["claims"]]
    named = {(c["asserted_by_kind"], c.get("asserted_by_name")) for c in claims}
    assert ("person", None) in named
    assert ("pipeline", "example-cite@0.1") in named
    assert not any(kind == "person" and name for kind, name in named)


def test_a_field_store_adds_later_does_not_reach_the_agent():
    feature = {
        "id": "00000000-0000-4000-8000-000000000001",
        "kind": "section",
        "owner_email": "someone@example.org",
        "claims": [{"id": "c", "asserted_by_kind": "person", "asserted_by_phone": "555"}],
        "links": [{"id": "l", "asserted_by_name": "Someone"}],
    }
    out = json.dumps(answering(httpx.Response(200, json=feature)).feature(feature["id"]))
    assert "example.org" not in out and "555" not in out and "Someone" not in out


# What store does not check, and this client does


def test_an_unknown_attribute_key_never_reaches_store(small):
    store = FakeStore(small)
    with pytest.raises(StoreError) as refused:
        store.client().missing("ownr")
    assert refused.value.kind == "bad_request"
    assert store.requests == []
    # Why it matters: store itself would answer with every section.
    assert len(store._missing(httpx.QueryParams({"attribute": "ownr"}), 1000)) == len(
        small["sections"]
    )


def test_missing_counts_a_merged_trace_but_not_the_pipeline(small):
    code, missing = small["codes"], ids(FakeStore(small).client().missing("owner"))
    assert code["s13"] not in missing  # the owner is on the trace merged into it
    assert code["s02"] not in missing
    assert code["s06"] in missing  # its pipeline has an owner; store does not count that
    assert {code[c] for c in ("s01", "s03", "s04")} <= missing  # candidate, rejected: no


def test_a_list_as_long_as_its_limit_is_flagged_as_cut(small):
    client = FakeStore(small).client()
    assert client.sections(limit=5).cut
    assert len(client.sections(limit=5).rows) == 5
    assert not client.sections().cut
    assert client.sections(limit=len(small["sections"])).cut  # exactly the limit: may be cut


@pytest.mark.parametrize("feature_id", ["../links", "../../me", "abc", "", "x?limit=5"])
def test_a_feature_id_that_is_not_a_uuid_never_reaches_store(small, feature_id):
    store = FakeStore(small)
    with pytest.raises(StoreError) as refused:
        store.client().feature(feature_id)
    assert refused.value.kind == "bad_request"
    assert store.requests == []


def test_bad_parameters_are_refused_before_store(small):
    store = FakeStore(small)
    client = store.client()
    for call in (
        lambda: client.links(status="accepted"),
        lambda: client.sections(limit=20_000),
        lambda: client.missing("owner", limit=0),
    ):
        with pytest.raises(StoreError) as refused:
            call()
        assert refused.value.kind == "bad_request"
    assert store.requests == []


# Reads


def test_sections_filter_by_area_and_date(small):
    client, code = FakeStore(small).client(), small["codes"]
    assert ids(client.sections(bbox=(-97.5, 34.5, -96.5, 35.5))) == {code["s01"]}
    in_1930 = ids(client.sections(at=dt.date(1930, 6, 1)))
    assert code["s08"] in in_1930 and code["s01"] not in in_1930
    # After the end a tool proposes, the row is no longer shown, as in store.
    assert code["s08"] not in ids(client.sections(at=dt.date(1949, 1, 1)))


def test_links_filter_by_status(small):
    client = FakeStore(small).client()
    assert {r["status"] for r in client.links(status="proposed").rows} == {"proposed"}
    assert len(client.links().rows) == len(small["links"])


# Failures


@pytest.mark.parametrize(
    ("fail", "kind"), [("unreachable", "unreachable"), ("refused", "refused"), ("error", "error")]
)
def test_failures_are_told_apart(small, fail, kind):
    with pytest.raises(StoreError) as failure:
        FakeStore(small, fail=fail).client().feature(small["codes"]["s01"])
    assert failure.value.kind == kind


def test_a_feature_that_is_gone_is_not_found(small):
    with pytest.raises(StoreError) as failure:
        FakeStore(small).client().feature("00000000-0000-4000-8000-000000000000")
    assert failure.value.kind == "not_found"


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="<html>a proxy's page</html>"),
        httpx.Response(200, json=["not", "a", "feature"]),
        httpx.Response(307, headers={"location": "http://elsewhere.invalid/"}),
        httpx.Response(204),
    ],
)
def test_an_answer_that_is_not_stores_is_an_error_not_a_crash(response):
    with pytest.raises(StoreError) as failure:
        answering(response).feature("00000000-0000-4000-8000-000000000000")
    assert failure.value.kind == "error"


def test_stores_reason_for_refusing_a_request_is_kept():
    client = answering(httpx.Response(422, json={"detail": "bbox must be minx,miny,maxx,maxy"}))
    with pytest.raises(StoreError) as refused:
        client.sections()
    assert refused.value.kind == "bad_request" and "bbox" in refused.value.detail


def test_the_fake_refuses_what_store_refuses(small):
    http = httpx.Client(
        base_url="http://store.invalid",
        transport=FakeStore(small),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    for path in ("/sections?at=1930", "/links?status=accepted", "/sections?limit=20000"):
        assert http.get(path).status_code == 422, path
    assert http.get("/features/not-a-uuid").status_code == 422


# Read only


def test_nothing_but_a_get_can_leave_the_client(small):
    store = FakeStore(small)
    client = store.client()
    for method in ("POST", "PUT", "PATCH", "DELETE"):
        with pytest.raises(RuntimeError, match="only reads"):
            client._http.request(method, "/bundles", json={})
    assert store.requests == []


def test_the_token_is_not_in_a_repr_or_an_error(small):
    from settings import Settings

    settings = Settings(model="m", store_url="http://store.invalid", store_token=TOKEN)
    assert TOKEN not in repr(settings)
    client = FakeStore(small, fail="unreachable").client()
    with pytest.raises(StoreError) as failure:
        client.feature(small["codes"]["s01"])
    assert TOKEN not in str(failure.value) and TOKEN not in repr(client)


def test_attribute_keys_are_stores_registry():
    assert "status" in ATTRIBUTE_KEYS and "build_date" not in ATTRIBUTE_KEYS
