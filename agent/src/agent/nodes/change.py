"""A change asked for in words: code's card, or its fixed line. No model."""

from typing import Any

from langchain_core.messages import HumanMessage

from src.agent.deps import Deps
from src.agent.prefetch import Prefetched
from src.agent.reply import STORE_FAILURES, Steps, finish, read_words
from src.answer.render import failure, feature_name, short_id
from src.answer.schemas import Answer, Question, Statement
from src.clients.store_client import StoreError
from src.flows import change_flow
from src.worked_out import context


def change_offer(
    deps: Deps,
    question: Question,
    request: Any,
    message: HumanMessage,
    taken: Prefetched | None,
    seen: int,
) -> dict:
    """The card for a change asked for in words, or its fixed line. Reads what is
    attached and, for a pipeline named in the words, store's pipelines. No model."""
    store = deps.store

    def say(statement: Statement, steps=None) -> dict:
        return finish(Answer(statements=[statement]), message, [], seen, steps=steps)

    attached = [i for i in question.about if i.id]
    section_ids = list(dict.fromkeys(i.id for i in attached if i.kind == "section"))
    pipeline_ids = list(dict.fromkeys(i.id for i in attached if i.kind == "pipeline"))
    if len(section_ids) > change_flow.MAX_SECTIONS:
        return say(Statement(kind="refusal", text=change_flow.LINES["too_many"]))
    reader = taken if taken is not None else Prefetched(store, [*section_ids, *pipeline_ids])
    try:
        sections = [reader.feature(i) for i in section_ids]
        pipelines = [reader.feature(i) for i in pipeline_ids]
    except StoreError as error:
        if error.kind == "not_found":
            return say(Statement(kind="refusal", text=change_flow.LINES["gone"]))
        return say(failure(STORE_FAILURES.get(error.kind, "store_unreachable")).statements[0])

    def names(ids: list[str]) -> dict[str, str]:
        out = {}
        for fid in dict.fromkeys(ids):
            try:
                out[fid] = feature_name(store.feature(fid))
            except StoreError:
                continue
        return out

    def find(wanted: str) -> list[dict[str, Any]]:
        # Store has no search by name yet: the pipelines are the lines sections are
        # placed or proposed in. A list cut short, or a line that cannot be read,
        # is store's failure, never "no such pipeline".
        links = store.links(relation="part_of")
        if links.cut:
            raise StoreError("error", "too many memberships to find a pipeline by name")
        ids = list(
            dict.fromkeys(
                link["to_feature_id"] for link in links.rows if link["status"] != "rejected"
            )
        )
        read = context.read_many(store, ids)
        if len(read) < len(ids):
            raise StoreError("unreachable", "a pipeline could not be read")
        return [
            f
            for f in read.values()
            if f.get("kind") == "line"
            and wanted in {change_flow.name_key(feature_name(f)), short_id(f["id"]).casefold()}
        ]

    try:
        statement = change_flow.offer(request, sections, pipelines, find, names)
    except StoreError as error:
        return say(failure(STORE_FAILURES.get(error.kind, "store_unreachable")).statements[0])
    steps = Steps()
    steps.add_done(read_words(len(sections), len(pipelines)))
    if statement.kind == "change_offer":
        steps.add_done("Checked the change against the rules")
    return say(statement, steps)
