"""Seed bad answers from good ones, to prove the grounding checks catch them.

Each mutation turns a faithful answer into one that says something store does not back,
in one of the ways a model can go wrong. A check that lets any of them through is broken.
"""

import copy
import re
from collections.abc import Callable
from typing import Any

Answer = dict[str, Any]
OTHER_ID = "00000000-0000-4000-8000-00000000beef"


def _first(answer: Answer, kind: str) -> dict[str, Any] | None:
    return next((s for s in answer["statements"] if s["kind"] == kind and s["refs"]), None)


def an_id_never_read(answer: Answer) -> Answer | None:
    """The sentence stays; its reference points at something store does not have."""
    statement = _first(answer, "fact")
    if statement is None:
        return None
    statement["refs"][0]["id"] = OTHER_ID
    return answer


def a_changed_year(answer: Answer) -> Answer | None:
    for statement in answer["statements"]:
        year = re.search(r"\b(1[89]\d\d)\b", statement["text"])
        if year:
            statement["text"] = statement["text"].replace(
                year.group(1), str(int(year.group(1)) - 7)
            )
            return answer
    return None


def a_number_in_its_own_words(answer: Answer) -> Answer | None:
    statement = _first(answer, "fact")
    if statement is None:
        return None
    statement["text"] += " It is 42 miles long."
    return answer


def a_name_typed_in(answer: Answer) -> Answer | None:
    statement = _first(answer, "fact")
    if statement is None:
        return None
    statement["text"] += " It was later sold to Remembered Oil Corporation."
    return answer


def an_altered_quote(answer: Answer) -> Answer | None:
    for statement in answer["statements"]:
        quote = re.search(r"“([^”]+)”", statement["text"])
        if quote:
            words = quote.group(1).split()
            changed = " ".join([*words[:-1], "everywhere."])
            statement["text"] = statement["text"].replace(quote.group(1), changed)
            return answer
    return None


def an_id_in_the_text(answer: Answer) -> Answer | None:
    statement = _first(answer, "fact")
    if statement is None:
        return None
    statement["text"] += f" See claim {statement['refs'][0]['id']}."
    return answer


def a_fact_with_no_reference(answer: Answer) -> Answer | None:
    statement = _first(answer, "fact")
    if statement is None:
        return None
    statement["refs"] = []
    return answer


def a_proposal_passed_off_as_accepted(answer: Answer) -> Answer | None:
    for statement in answer["statements"]:
        for ref in statement["refs"]:
            if ref.get("status") in ("candidate", "rejected"):
                ref["status"] = "accepted"
                return answer
    return None


def unknown_where_store_holds_a_value(answer: Answer) -> Answer | None:
    """ "Store does not say" about something store does say."""
    statement = _first(answer, "fact")
    if statement is None or not statement["refs"][0].get("feature_id"):
        return None
    ref = statement["refs"][0]
    if ref.get("status") != "accepted":
        return None
    answer["statements"] = [
        {
            "kind": "unknown",
            "text": "Store does not say.",
            "refs": [{"type": "feature", "id": ref["feature_id"]}],
            "attribute": ref["attribute"],
        }
    ]
    return answer


def unknown_that_checked_nothing(answer: Answer) -> Answer | None:
    statement = next((s for s in answer["statements"] if s["kind"] == "unknown"), None)
    if statement is None:
        return None
    statement["refs"], statement["attribute"] = [], None
    return answer


def a_fixed_line_reworded(answer: Answer) -> Answer | None:
    answer["statements"] = [
        {"kind": "refusal", "text": "Sorry, I would rather not get into that.", "refs": []}
    ]
    return answer


MUTATIONS: list[Callable[[Answer], Answer | None]] = [
    an_id_never_read,
    a_changed_year,
    a_number_in_its_own_words,
    a_name_typed_in,
    an_altered_quote,
    an_id_in_the_text,
    a_fact_with_no_reference,
    a_proposal_passed_off_as_accepted,
    unknown_where_store_holds_a_value,
    unknown_that_checked_nothing,
    a_fixed_line_reworded,
]


def seeded(answer: Answer) -> list[tuple[str, Answer]]:
    """Every bad answer that can be made from this good one, with the mutation's name."""
    out = []
    for mutate in MUTATIONS:
        bad = mutate(copy.deepcopy(answer))
        if bad is not None:
            out.append((mutate.__name__, bad))
    return out
