"""The reply to a question as the graph writes it into the thread, and the steps Studio
shows while it is worked on."""

from typing import Any

from langchain_core.messages import AIMessage, HumanMessage

from src.agent.question import last_message
from src.answer.render import as_text, feature_name
from src.answer.schemas import Answer, Statement

STORE_FAILURES = {"unreachable": "store_unreachable", "refused": "store_refused"}

CARD_GONE = "That card is no longer in this chat. Ask again."


def _many(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


def read_words(sections: int, pipelines: int, others: int = 0) -> str:
    """ "Read 3 sections and 1 pipeline", never "Read 0 sections"."""
    parts = [
        _many(n, w)
        for n, w in ((sections, "section"), (pipelines, "pipeline"), (others, "feature"))
        if n
    ]
    return "Read " + " and ".join(parts) if parts else "Read nothing attached"


class Steps:
    """What the Agent does for a question, in plain words, kept in the graph's state and
    on the reply: Studio shows them as a chain of thought. Says what was read, never what
    is true."""

    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def start(self, text: str) -> None:
        """A step under way; it is done when the next one starts."""
        self.finish_all()
        self.items.append({"text": text, "done": False})

    def add_done(self, text: str) -> None:
        self.items.append({"text": text, "done": True})

    def finish_all(self) -> list[dict[str, Any]]:
        for item in self.items:
            item["done"] = True
        return self.items

    def reads(self, artifacts: list[dict[str, Any]], attached: set[str]) -> None:
        """One step per thing read, or one for all of them when there are many."""
        features = [
            a["features"][0] for a in artifacts if a.get("features") and "context_of" not in a
        ]
        contexts = [a for a in artifacts if "context_of" in a]
        if len(features) > 4:
            sections = sum(1 for f in features if f.get("kind") == "section")
            lines = sum(1 for f in features if f.get("kind") == "line")
            self.add_done(read_words(sections, lines, len(features) - sections - lines))
        else:
            for f in features:
                pipeline = f.get("kind") == "line" and f["id"] not in attached
                name = feature_name(f)
                self.add_done(f"Read its pipeline, {name}" if pipeline else f"Read {name}")
        for a in contexts:
            self.add_done(f"Read what surrounds {feature_name(a['features'][0])}")
        for a in artifacts:
            if "nearby_of" in a:
                me = feature_name(a["context_features"][0])
                self.add_done(f"Looked for the sections nearest {me}")
            if "network_pipelines" in a:
                self.add_done(
                    f"Looked through the network's {_many(a['network_pipelines'], 'pipeline')}"
                )
            if "network" in a:
                self.add_done(f"Looked through the network's {_many(a['network'], 'section')}")
            if "sections_of" in a:
                self.add_done(f"Read its {_many(len(a['members']), 'section')}")
            if "together" in a:
                self.add_done(f"Took the {len(a['together'])} sections together")


def finish(
    answer: Answer,
    question: HumanMessage | None,
    tools: list[str],
    seen: int,
    blocked: list[list[str]] | None = None,
    steps: Steps | None = None,
) -> dict:
    """The end of a turn: the checked answer, on its own message and in the state."""
    answer.checked = True
    return {
        "blocked": blocked or [],
        # The answer travels on its message too, so a reloaded thread shows every turn.
        "messages": [
            AIMessage(
                # One id from the start, so what streams and what is saved are one message.
                id=f"answer-{question.id}" if question is not None and question.id else None,
                content=as_text(answer),
                additional_kwargs={
                    "answer": answer.model_dump(),
                    "answers": question.id if question is not None else None,
                    "tools": tools,
                    "steps": steps.finish_all() if steps is not None else [],
                },
            )
        ],
        "answer": answer.model_dump(),
        "answers": question.id if question is not None else None,
        "tools": tools,
        "steps": steps.finish_all() if steps is not None else [],
        "seen": seen + 1,
    }


def replace_reply(state: Any, statements: list[Statement], **more) -> dict:
    """The question's answer, with these statements, replacing the reply it already
    has (one message per question, by id)."""
    question = last_message(state)
    answer_ = Answer(checked=True, statements=statements)
    steps = [{**item, "done": True} for item in state.get("steps") or []]
    return {
        "messages": [
            AIMessage(
                id=f"answer-{question.id}" if question is not None and question.id else None,
                content=as_text(answer_),
                additional_kwargs={
                    "answer": answer_.model_dump(),
                    "answers": question.id if question is not None else None,
                    "tools": state.get("tools") or [],
                    "steps": steps,
                },
            )
        ],
        "answer": answer_.model_dump(),
        "answers": question.id if question is not None else None,
        "steps": steps,
        **more,
    }
