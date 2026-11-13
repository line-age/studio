"""Expose the graph to the server (`langgraph dev`). Nothing else belongs here."""

from agent import build_graph
from settings import refuse_undecided_tracing

# Fails here, before any question is taken, if tracing is on without its switch.
refuse_undecided_tracing()

graph = build_graph()
