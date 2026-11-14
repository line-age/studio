"""Serve an invented world over HTTP, as store would, for end-to-end QA.

    uv run python -m evals.serve_world [--world small] [--port 47191]

Studio (in store mode) and the Agent both read it, so the whole chain runs on invented
data and can be traced. GET only, on 127.0.0.1 only. The token is the fake store's.
"""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx

from evals.fake_store import TOKEN, FakeStore, load_world


def handler_for(store: FakeStore) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            request = httpx.Request(
                "GET",
                f"http://store{self.path}",
                headers={"authorization": self.headers.get("authorization", "")},
            )
            if self.path == "/healthz":
                response = httpx.Response(200, json={"ok": True})
            else:
                response = store.handle_request(request)
            body = response.content
            self.send_response(response.status_code)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            pass

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--world", default="small")
    parser.add_argument("--port", type=int, default=47191)
    args = parser.parse_args()
    # Studio reads every section's feature at once; the default backlog of 5 drops some.
    ThreadingHTTPServer.request_queue_size = 256
    server = ThreadingHTTPServer(
        ("127.0.0.1", args.port), handler_for(FakeStore(load_world(args.world)))
    )
    print(f"invented world {args.world!r} on http://127.0.0.1:{args.port}  token {TOKEN}")
    server.serve_forever()


if __name__ == "__main__":
    main()
