"""Saying what is being read, before the model starts."""

from typing import Any

from src.agent.config import MAX_QUESTION_CHARS
from src.agent.deps import Deps
from src.agent.prefetch import Prefetched
from src.agent.question import last_message, question_of, to_read
from src.agent.reply import read_words
from src.agent.state import AgentState
from src.answer.render import feature_name
from src.clients.store_client import StoreError


def read(deps: Deps, state: AgentState) -> dict:
    """Say what is being read before the model starts: the attached features and
    their pipelines, read in parallel (fast), then what comes next. Studio shows
    these while the answer is worked on; `answer` reads again for itself, so
    nothing here is relied on."""
    message = last_message(state)
    try:
        question = question_of(message) if message is not None else None
    except ValueError:
        question = None
    if (
        question is None
        or not question.about
        or len(question.words) > MAX_QUESTION_CHARS  # `answer` turns it away
    ):
        return {"steps": [{"text": "Writing the answer", "done": False}]}
    ids = to_read(question)
    reader = Prefetched(deps.store, ids)
    if message is not None and message.id:
        if len(deps.prefetched) > 32:  # runs that died between the nodes; never grows
            deps.prefetched.clear()
        deps.prefetched[message.id] = reader  # `answer` takes these reads over
    steps: list[dict[str, Any]] = []
    for fid in [*ids, *reader.pipelines]:
        try:
            feature = reader.feature(fid)
        except StoreError:
            continue
        words = (
            f"Read its pipeline, {feature_name(feature)}"
            if fid in reader.pipelines
            else f"Read {feature_name(feature)}"
        )
        steps.append({"text": words, "done": True})
    if len(steps) > 4:
        kinds = [i.kind for i in question.about]
        steps = [
            {
                "text": read_words(
                    kinds.count("section"),
                    kinds.count("pipeline") + len(reader.pipelines),
                ),
                "done": True,
            }
        ]
    has_section = any(i.kind == "section" for i in question.about)
    steps.append(
        {
            "text": "Reading what surrounds it, then writing the answer"
            if has_section
            else "Writing the answer",
            "done": False,
        }
    )
    return {"steps": steps}
