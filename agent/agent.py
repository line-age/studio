"""The Agent's graph.

For now it answers every question with the fixed line for "could not answer": no model,
no store. Behaviours are added one at a time, each with its eval first (evals/README.md).
The graph holds no serving code and no checkpointer; the server supplies both.
"""

from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, RemoveMessage
from langgraph.graph import END, START, MessagesState, StateGraph

from render import as_text, failure
from settings import MAX_QUESTION_CHARS
from store_client import StoreClient


class AgentState(MessagesState):
    # The checked answer to the question whose message id is `answers`, as Studio renders
    # it (schemas.Answer). None while a question is being worked on.
    answer: dict[str, Any] | None
    answers: str | None
    # How many messages the thread held when the last turn ended.
    seen: int


def ingress(state: AgentState) -> dict:
    """Take in one question. Only a person's message may come from outside.

    The service has no sign-in, so anything can be posted to it. A system, tool or
    assistant message from outside is removed before a model could read it, and the
    previous turn's answer is cleared so it can never be shown against a new question.
    """
    new = state["messages"][state.get("seen") or 0 :]
    forged = [m for m in new if not isinstance(m, HumanMessage)]
    return {
        "messages": [RemoveMessage(id=m.id) for m in forged],
        "answer": None,
        "answers": None,
    }


def could_not_answer(state: AgentState) -> dict:
    question = next((m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None)
    # Until behaviours exist every question ends here, a too-long one included.
    too_long = question is not None and len(str(question.content)) > MAX_QUESTION_CHARS
    answer = failure("check_failed")
    reply = AIMessage(content=as_text(answer))
    return {
        "messages": [reply],
        "answer": answer.model_dump(),
        "answers": question.id if question is not None and not too_long else None,
        "seen": len(state["messages"]) + 1,
    }


def build_graph(store: StoreClient | None = None):
    """The graph. `store` is the client it reads with; evals pass one over a fake store.

    Nothing reads store yet, so it is accepted and not used.
    """
    del store
    builder = StateGraph(AgentState)
    builder.add_node("ingress", ingress)
    builder.add_node("answer", could_not_answer)
    builder.add_edge(START, "ingress")
    builder.add_edge("ingress", "answer")
    builder.add_edge("answer", END)
    return builder.compile(name="studio-agent")
