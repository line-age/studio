"""The Agent's graph.

For now it answers every question with the fixed line for "could not answer": no model,
no store. Behaviours are added one at a time, each with its eval first (evals/README.md).
The graph holds no serving code and no checkpointer; the server supplies both.
"""

from typing import Any

from langchain_core.messages import AIMessage
from langgraph.graph import END, START, MessagesState, StateGraph

from render import as_text, failure


class AgentState(MessagesState):
    # The checked answer for the last question, as Studio renders it (schemas.Answer).
    answer: dict[str, Any] | None


def could_not_answer(state: AgentState) -> dict:
    answer = failure("check_failed")
    return {
        "messages": [AIMessage(content=as_text(answer))],
        "answer": answer.model_dump(),
    }


def build_graph():
    builder = StateGraph(AgentState)
    builder.add_node("answer", could_not_answer)
    builder.add_edge(START, "answer")
    builder.add_edge("answer", END)
    return builder.compile(name="studio-agent")
