"""cite over HTTP: start one search for one section, follow it, stop it.

cite runs on its own Agent Server (port 47130) and is never imported: this repo is
public and cite's is not. A search takes minutes, so it runs in a background thread of
this process. The graph polls it (`cite_wait`), and each poll counts as a touch: when
nothing has touched a search for `idle_seconds` (Studio's Stop ended the graph's run),
the search is cancelled on cite's server. One search runs at a time: cite's caches are
not locked, and the chat is one shared thread anyway.
"""

import logging
import threading
import time
import uuid
from collections.abc import Callable
from typing import Any, Protocol

log = logging.getLogger(__name__)

IDLE_SECONDS = 15.0
# A search that has not finished after this long is cancelled and reported as failed.
MAX_SECONDS = 20 * 60


class CiteBusy(Exception):
    """A search is already running."""


class CiteRun(Protocol):
    id: str

    def touch(self) -> None: ...
    def take_lines(self) -> list[str]: ...
    def done(self) -> bool: ...
    def result(self) -> dict[str, Any] | None: ...
    def error(self) -> str | None: ...
    def cancel(self) -> None: ...


class CiteService(Protocol):
    def start(self, section: dict[str, Any]) -> CiteRun: ...
    def get(self, run_id: str) -> CiteRun | None: ...


class _Run:
    """One search, followed in a background thread."""

    def __init__(self, release: Callable[[], None]) -> None:
        self.id = str(uuid.uuid4())
        self._release = release
        self._lock = threading.Lock()
        self._lines: list[str] = []
        self._result: dict[str, Any] | None = None
        self._error: str | None = None
        self._done = threading.Event()
        self._cancelled = threading.Event()
        self._touched = time.monotonic()
        self._started = time.monotonic()
        # Where it runs on cite's server, once known: what an explicit cancel needs.
        self.server: tuple[str, str] | None = None

    def touch(self) -> None:
        self._touched = time.monotonic()

    def idle(self, idle_seconds: float) -> bool:
        now = time.monotonic()
        return now - self._touched > idle_seconds or now - self._started > MAX_SECONDS

    def take_lines(self) -> list[str]:
        with self._lock:
            lines, self._lines = self._lines, []
        return lines

    def add_line(self, line: str) -> None:
        with self._lock:
            self._lines.append(line)

    def done(self) -> bool:
        return self._done.is_set()

    def result(self) -> dict[str, Any] | None:
        return self._result

    def error(self) -> str | None:
        return self._error

    def cancel(self) -> None:
        self._cancelled.set()

    @property
    def cancelled(self) -> bool:
        return self._cancelled.is_set()

    def finish(self, result: dict[str, Any] | None, error: str | None) -> None:
        if not self._done.is_set():
            self._result, self._error = result, error
            self._done.set()
            self._release()


def progress_line(part_event: str, data: Any) -> str | None:
    """A step line from one streamed event: cite's own progress, or a node of its graph
    finishing. None for anything a person need not see."""
    if part_event.startswith("custom") and isinstance(data, dict) and data.get("progress"):
        return str(data["progress"])
    return None


def final_result(part_event: str, data: Any) -> dict[str, Any] | None:
    """cite's result, from its `finish` node's update in the outer graph."""
    if part_event == "updates" and isinstance(data, dict):
        finish = data.get("finish")
        if isinstance(finish, dict) and isinstance(finish.get("result"), dict):
            return finish["result"]
    return None


class CiteClient:
    """The real cite, through `langgraph_sdk`. `url` is cite's Agent Server."""

    def __init__(self, url: str, *, idle_seconds: float = IDLE_SECONDS) -> None:
        self.url = url
        self.idle_seconds = idle_seconds
        self._busy = threading.Lock()
        self._runs: dict[str, _Run] = {}

    def get(self, run_id: str) -> _Run | None:
        return self._runs.get(run_id)

    def start(self, section: dict[str, Any]) -> _Run:
        if not self._busy.acquire(blocking=False):
            raise CiteBusy("a search is already running")
        run = _Run(self._busy.release)
        self._runs = {run.id: run}  # only the last search is kept
        threading.Thread(target=self._follow, args=(run, section), daemon=True).start()
        threading.Thread(target=self._watch, args=(run,), daemon=True).start()
        return run

    def _client(self):
        from langgraph_sdk import get_sync_client

        return get_sync_client(url=self.url, api_key=None)

    def _follow(self, run: _Run, section: dict[str, Any]) -> None:
        result, error = None, None
        thread_id = None
        try:
            client = self._client()
            thread_id = client.threads.create()["thread_id"]

            def created(meta) -> None:
                run.server = (thread_id, meta["run_id"])

            for part in client.runs.stream(
                thread_id,
                "cite-agent",
                input={"section": section},
                stream_mode=["custom", "updates"],
                stream_subgraphs=True,
                on_disconnect="cancel",
                on_run_created=created,
            ):
                if run.cancelled:
                    break  # closing the stream cancels the run on cite's server too
                if part.event == "error":
                    error = "cite reported an error"
                    break
                if line := progress_line(part.event, part.data):
                    run.add_line(line)
                if (found := final_result(part.event, part.data)) is not None:
                    result = found
        except Exception as exc:  # noqa: BLE001 - any failure ends the search with a reason
            error = f"cite could not be reached ({type(exc).__name__})"
        finally:
            if run.cancelled:
                result, error = None, "stopped"
            elif result is None and error is None:
                error = "cite ended without a result"
            run.finish(result, error)
            if thread_id:
                try:
                    self._client().threads.delete(thread_id)
                except Exception as exc:  # noqa: BLE001 - a thread left on cite's server is harmless
                    log.debug("cite thread not deleted: %s", type(exc).__name__)

    def _watch(self, run: _Run) -> None:
        """Cancel the search on cite's server when nothing follows it any more."""
        while not run.done():
            if run.cancelled or run.idle(self.idle_seconds):
                run.cancel()
                if run.server:
                    try:
                        self._client().runs.cancel(*run.server, wait=False)
                    except Exception as exc:  # noqa: BLE001 - the stream's disconnect cancels too
                        log.debug("cite run not cancelled: %s", type(exc).__name__)
                return
            time.sleep(0.5)
