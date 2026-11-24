"""What the graph keeps in a thread."""

from typing import Any

from langgraph.graph import MessagesState


class AgentState(MessagesState):
    # The checked answer to the question whose message id is `answers`, as Studio renders
    # it (schemas.Answer). None while a question is being worked on.
    answer: dict[str, Any] | None
    answers: str | None
    # How many messages the thread held when the last turn ended.
    seen: int
    # The tools the model called for the last question, in order. For step lines and evals.
    tools: list[str]
    # What the grounding check found in each draft that was sent back. For traces and evals.
    blocked: list[list[str]]
    # What the Agent does for the question, in plain words, as it goes: set by `read`
    # (what it read, and what it is doing next) and by `answer` (all of it, done).
    # Studio shows them while it works; it reads the graph's values, which it always
    # receives.
    steps: list[dict[str, Any]]
    # What cite found in this thread (plan D4), kept until "Clear chat": `runs` (each
    # search, in order), `findings` (by handle, F1...), `pending` (a search waiting for
    # towns). Never cleared by a new question.
    cite: dict[str, Any]
    # The search the current question started, while it runs. Cleared by each question.
    cite_job: dict[str, Any] | None
