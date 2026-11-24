"""What the nodes share: store, the model and its loop, cite, the proposal writer, and the
reads `read` hands to `answer`. Made once, when the graph is built."""

from dataclasses import dataclass, field
from typing import Any

from langchain.chat_models import init_chat_model

from src.agent.config import CITE_POLL_SECONDS, load
from src.agent.loop import build_loop
from src.agent.prefetch import Prefetched
from src.clients import store_writer
from src.clients.cite_client import CiteClient, CiteService
from src.clients.store_client import StoreClient

UNSET: Any = object()


@dataclass
class Deps:
    store: StoreClient
    model: Any
    # None: no CITE_URL, so the Agent says what it would ask for and searches nothing.
    cite: CiteService | None
    # None: no proposal token, so Propose says the write failed.
    writer: Any
    cite_poll: float = CITE_POLL_SECONDS
    # The model loop, with the tools: built once; a question passes its own context.
    loop: Any = None
    # Reads `read` made for a question, handed to `answer` in the same process.
    prefetched: dict[str, Prefetched] = field(default_factory=dict)


def make_deps(
    store: StoreClient | None = None,
    model: Any = None,
    cite: CiteService | None = UNSET,
    writer: Any = UNSET,
    cite_poll: float = CITE_POLL_SECONDS,
) -> Deps:
    """Evals and tests pass a store client over a fake store, and may pass a scripted
    model, a fake cite and a proposal client; otherwise all come from the settings."""
    settings = load()
    if store is None:
        store = StoreClient(settings.store_url, token=settings.store_token)
    if cite is UNSET:
        cite = CiteClient(settings.cite_url) if settings.cite_url else None
    if writer is UNSET:
        writer = (
            store_writer.ProposalClient(settings.store_url, settings.cite_store_token)
            if settings.cite_store_token
            else None
        )
    if model is None:
        # The client retries a dropped connection, 429, 529 and 5xx with backoff.
        # Low effort: the model picks claims and code writes the words, so deep thinking
        # buys nothing here and cost most of the wait (ten sections 18.7 s to 8.1 s).
        model = init_chat_model(
            settings.model,
            max_tokens=4000,
            # An answer takes seconds; a minute means something is wrong. With the
            # client's retries a person waits at most about three minutes.
            timeout=60,
            max_retries=2,
            output_config={"effort": "low"},
        )
    return Deps(
        store=store,
        model=model,
        cite=cite,
        writer=writer,
        cite_poll=cite_poll,
        loop=build_loop(model),
    )
