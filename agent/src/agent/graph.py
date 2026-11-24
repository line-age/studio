"""The Agent's graph: take the question in, let the model read store and draft an answer,
fill the draft's slots, check it against what was read, and only then attach it.

    ingress -> read -> answer -> END
                        answer -> cite_start -> cite_wait (loops) -> cite_report -> END
    ingress -> propose -> END                          (a Propose button, no model)
    ingress -> search -> cite_start -> ...             (a Search button, no model)
    ingress -> outcome -> END                          (what came of a card, no model)

`answer` runs the model loop (`create_agent`, tools read store), renders the draft and
checks it (grounding.py). A draft that fails goes back once with what failed; a second
failure ends with the fixed "could not answer" line. When the checked answer asks for a
search and the guard lets it through, cite searches the journals (cite_flow.py): code
starts it, follows it and writes every sentence of what it found. The graph holds no
serving code and no checkpointer; the server supplies both. This file is wiring only:
each node is in `nodes/`, and what they share in `deps.py`.
"""

from functools import partial
from typing import Any

from langgraph.graph import END, START, StateGraph

from src.agent.config import CITE_POLL_SECONDS
from src.agent.deps import UNSET, make_deps
from src.agent.nodes import actions, answer, ingress, read
from src.agent.nodes import cite as searching
from src.agent.state import AgentState
from src.clients.cite_client import CiteService
from src.clients.store_client import StoreClient


def build_graph(
    store: StoreClient | None = None,
    model: Any = None,
    *,
    cite: CiteService | None = UNSET,
    writer: Any = UNSET,
    cite_poll: float = CITE_POLL_SECONDS,
):
    """The graph. Evals and tests pass a store client over a fake store, and may pass a
    scripted model, a fake cite and a proposal client; otherwise all come from the
    settings. Without cite (no CITE_URL) the Agent says what it would ask for and
    searches nothing."""
    deps = make_deps(store, model, cite, writer, cite_poll)

    builder = StateGraph(AgentState)
    builder.add_node("ingress", ingress.ingress)
    builder.add_node("read", partial(read.read, deps))
    builder.add_node("answer", partial(answer.answer, deps))
    builder.add_node("propose", partial(actions.propose, deps))
    builder.add_node("search", partial(actions.search, deps))
    builder.add_node("outcome", actions.outcome)
    builder.add_node("fresh_start", actions.fresh_start)
    builder.add_node("cite_start", partial(searching.cite_start, deps))
    builder.add_node("cite_wait", partial(searching.cite_wait, deps))
    builder.add_node("cite_report", partial(searching.cite_report, deps))

    def searching_next(state: AgentState) -> str:
        return "cite_start" if state.get("cite_job") else END

    builder.add_edge(START, "ingress")
    builder.add_conditional_edges(
        "ingress", ingress.route_in, ["read", "propose", "search", "outcome", "fresh_start"]
    )
    builder.add_edge("read", "answer")
    builder.add_conditional_edges("answer", searching_next, ["cite_start", END])
    builder.add_conditional_edges("search", searching_next, ["cite_start", END])
    builder.add_conditional_edges(
        "cite_start", lambda s: "cite_wait" if s.get("cite_job") else END, ["cite_wait", END]
    )
    builder.add_conditional_edges(
        "cite_wait", partial(searching.searching, deps), ["cite_wait", "cite_report"]
    )
    builder.add_edge("cite_report", END)
    builder.add_edge("propose", END)
    builder.add_edge("outcome", END)
    builder.add_edge("fresh_start", END)
    # A search is followed one pass at a time, so its run takes many steps.
    return builder.compile(name="studio-agent").with_config(recursion_limit=1000)
