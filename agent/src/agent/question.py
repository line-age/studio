"""The question a message carries, and what the thread says about it."""

import uuid
from typing import Any

from langchain_core.messages import HumanMessage

from src.answer.schemas import Question


def _canonical(feature_id: str | None) -> str | None:
    try:
        return str(uuid.UUID(str(feature_id))) if feature_id else feature_id
    except ValueError:
        return feature_id


def question_of(message: HumanMessage) -> Question:
    """The question Studio sent. Raises ValueError if it is not one."""
    raw = message.additional_kwargs.get("question")
    question = Question.model_validate(raw) if raw else Question(words=str(message.content))
    for item in question.about:
        item.id = _canonical(item.id)
        if item.on and item.on.sectionId:
            item.on.sectionId = _canonical(item.on.sectionId)
    return question


def last_message(state: Any) -> HumanMessage | None:
    """The person's latest message in the thread."""
    return next((m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), None)


def to_read(question: Question, steering: str | None = None) -> list[str]:
    """The features to read for what is attached: a section or pipeline itself, a claim's
    or citation's section. Each once, in the order attached. With nothing attached, the
    section the latest search was about (plan D9)."""
    if not question.about and steering:
        return [steering]
    ids: list[str] = []
    for item in question.about:
        fid = item.id if item.kind in ("section", "pipeline") else None
        if item.kind in ("claim", "citation") and item.on and item.on.sectionId:
            fid = item.on.sectionId
        if fid and fid not in ids:
            ids.append(fid)
    return ids


def carried(messages: list[Any], current: HumanMessage) -> list[Any]:
    """What the person's last question was about, when this one has nothing attached:
    the whole attached set of the latest earlier question that had one."""
    for m in reversed(messages):
        if m.id == current.id or not isinstance(m, HumanMessage):
            continue
        try:
            about = question_of(m).about
        except ValueError:
            continue
        if about:
            return about
    return []


def people_words(messages: list[Any]) -> list[str]:
    """What the person wrote in this thread: their questions' words, never a reply's."""
    words = []
    for m in messages:
        if isinstance(m, HumanMessage):
            try:
                words.append(question_of(m).words)
            except ValueError:
                continue
    return words
