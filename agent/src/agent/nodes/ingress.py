"""Taking a question in, and where it goes next."""

from langchain_core.messages import HumanMessage, RemoveMessage

from src.agent.question import last_message, question_of
from src.agent.secrets import redact
from src.agent.state import AgentState


def ingress(state: AgentState) -> dict:
    """Take in one question. Only a person's message may come from outside.

    The service has no sign-in, so anything can be posted to it. A system, tool or
    assistant message from outside is removed before a model could read it, and the
    previous turn's answer is cleared so it can never be shown against a new question.
    A key or token in a person's words is replaced by a mark, in the same message, before
    anything keeps or reads it.
    """
    new = state["messages"][state.get("seen") or 0 :]
    forged = [m for m in new if not isinstance(m, HumanMessage)]
    # A search still marked running when a new question comes in was stopped.
    cite = state.get("cite") or {}
    runs = list(cite.get("runs") or [])
    stopped = {}
    if runs and runs[-1].get("outcome") == "running":
        runs[-1] = {**runs[-1], "outcome": "stopped before it finished"}
        stopped = {"cite": {**cite, "runs": runs}}
    return {
        **stopped,
        "messages": [
            *(RemoveMessage(id=m.id) for m in forged),
            *filter(None, (_without_secrets(m) for m in new if isinstance(m, HumanMessage))),
        ],
        "answer": None,
        "answers": None,
        "tools": [],
        "blocked": [],
        "steps": [],
        "cite_job": None,
    }


def _without_secrets(message: HumanMessage) -> HumanMessage | None:
    """The same message, by id, its words with every secret replaced; None when it holds
    none."""
    found = 0
    content = message.content
    if isinstance(content, str):
        content, found = redact(content)
    kwargs = dict(message.additional_kwargs)
    question = kwargs.get("question")
    if isinstance(question, dict) and isinstance(question.get("words"), str):
        words, in_words = redact(question["words"])
        kwargs["question"], found = {**question, "words": words}, found + in_words
    if not found:
        return None
    return message.model_copy(update={"content": content, "additional_kwargs": kwargs})


def route_in(state: AgentState) -> str:
    """A question goes to `read`; a button press to its own node."""
    message = last_message(state)
    try:
        question = question_of(message) if message is not None else None
    except ValueError:
        return "read"
    if question is None or question.action is None:
        return "read"
    return question.action.kind  # propose, search, outcome or fresh_start
