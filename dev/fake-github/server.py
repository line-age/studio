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

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOGIN = "local-developer"
NAME = "Local developer"
TEAM = ("local", "dev")

USER = {"login": LOGIN, "id": 1, "name": NAME, "email": None, "type": "User"}
MEMBERSHIP = {"state": "active", "role": "member"}


def answer(path: str, authorization: str) -> tuple[int, dict]:
    """What GitHub would answer for this path and Authorization header."""
    if not authorization.lower().startswith("bearer ") or not authorization[7:].strip():
        return 401, {"message": "Requires authentication"}
    if path == "/user":
        return 200, USER
    org, slug = TEAM
    if path == f"/orgs/{org}/teams/{slug}/memberships/{LOGIN}":
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

    def log_message(self, format: str, *args: object) -> None:
        # Path and status only; never a header, so never a token.
        print(f"{self.command} {self.path.split('?', 1)[0]} {args[1] if len(args) > 1 else ''}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
