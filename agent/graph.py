"""Expose the graph to the server (`langgraph dev`). Nothing else belongs here."""

from src.agent.config import refuse_undecided_tracing
from src.agent.graph import build_graph

# Fails here, before any question is taken, if tracing is on without its switch.
refuse_undecided_tracing()

graph = build_graph()
