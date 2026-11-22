"""A stand-in for GitHub's API, for running store on one machine without a GitHub account.

Store checks a person's token by asking GitHub who it belongs to (`GET /user`) and whether
they are in one of its teams (`GET /orgs/{org}/teams/{slug}/memberships/{login}`). This
answers both for one invented person, "Local developer", in the team `local/dev`, and takes
any bearer token. Point a local store at it with

    LINEAGE_GITHUB_API=http://fake-github:8000
    LINEAGE_GITHUB_TEAMS=local/dev

A store pointed here lets anyone in as Local developer: never point a deployed one at it.
Standard library only, so it runs in a bare Python image.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# An underscore: GitHub never issues such a login, so a store made against this
# fake can never give its Local developer to a real account.
LOGIN = "local_developer"
NAME = "Local developer"
# The team store is told to admit (LINEAGE_GITHUB_TEAMS=local/dev).
MEMBERSHIP_PATH = f"/orgs/local/teams/dev/memberships/{LOGIN}"

USER = {"login": LOGIN, "id": 1, "name": NAME, "email": None, "type": "User"}
MEMBERSHIP = {"state": "active", "role": "member"}


def answer(path: str, authorization: str) -> tuple[int, dict]:
    """What GitHub would answer for this path and Authorization header."""
    if not authorization.lower().startswith("bearer ") or not authorization[7:].strip():
        return 401, {"message": "Requires authentication"}
    if path == "/user":
        return 200, USER
    if path == MEMBERSHIP_PATH:
        return 200, MEMBERSHIP
    return 404, {"message": "Not Found"}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        status, body = answer(self.path.split("?", 1)[0], self.headers.get("Authorization", ""))
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    # Inside its container only; compose publishes no port.
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()


if __name__ == "__main__":
    main()
