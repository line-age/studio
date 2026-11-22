"""The fake's answers, over HTTP, as store asks for them."""

import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from server import Handler


@pytest.fixture(scope="module")
def base():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def get(url, token="any-token"):
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def test_names_local_developer_for_any_token(base):
    status, body = get(f"{base}/user", token="local-dev")
    assert status == 200
    assert body["login"] == "local_developer"
    assert body["name"] == "Local developer"


def test_local_developer_is_an_active_member_of_local_dev(base):
    status, body = get(f"{base}/orgs/local/teams/dev/memberships/local_developer")
    assert (status, body["state"]) == (200, "active")


def test_no_other_team_or_person(base):
    assert get(f"{base}/orgs/local/teams/other/memberships/local_developer")[0] == 404
    assert get(f"{base}/orgs/local/teams/dev/memberships/someone_else")[0] == 404


def test_refuses_a_request_with_no_token(base):
    assert get(f"{base}/user", token=None)[0] == 401
    assert get(f"{base}/user", token="")[0] == 401
