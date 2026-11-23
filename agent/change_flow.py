"""A change asked for in words (plan 2026-11-23-001, D1 to D5).

The person asks, in words, to add sections to a pipeline, move them, take them out, make
a pipeline of them, rename one, or set a value. Code, not the model, reads the words
(`read_request`), checks them against what is attached and what store holds, and answers
with one offer (`change_offer`) or one fixed line. Studio shows the offer as a card and
makes the change on Approve, as the person, through the same write as its menus and
modals. The Agent writes nothing: its store client sends only GET.

Code reads the words by patterns: free, offline and the same every time. A phrasing it
does not know gets a fixed line, never a wrong card. Only attached things are changed; a
pipeline named in the words is found by its exact name or code, never by a near match.
"""

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

import value_rules
from render import feature_name, short_id, value_words
from schemas import ChangeBasis, ChangeOffer, Statement

# More than this in one change is a selection gone wrong.
MAX_SECTIONS = 200

LINES = {
    "nothing_attached": "Attach the sections to change and ask again.",
    "too_few": "To make a pipeline, attach two or more sections and ask again.",
    "too_many": f"I change at most {MAX_SECTIONS} sections at a time.",
    "not_sections": "Only sections go into a pipeline. Attach the sections and ask again.",
    "mixed_networks": "These sections are on different networks, so they are not one pipeline.",
    "gone": "One of these sections is no longer there. Attach them again and ask again.",
    "attach_pipeline": "Attach the pipeline and ask again.",
    "one_pipeline": "Attach one pipeline and ask again.",
    "no_such_pipeline": "I found no pipeline called {name}. Attach it and ask again.",
    "many_pipelines": (
        "More than one pipeline is called {name}. Attach the one you mean and ask again."
    ),
    "none_placed": "None of these sections is in a pipeline.",
    "owner_on_pipeline": (
        "An owner or operator belongs to the pipeline. Attach the pipeline and ask again."
    ),
    "diameter_on_sections": "A diameter is set on sections. Attach the sections and ask again.",
    "not_from_chat": (
        "From the chat I can set a section's diameter, and a pipeline's name, owner and "
        "operator. Use Edit for the rest."
    ),
    "cannot_read": (
        "I could not tell which change you mean. Ask as: add these to a pipeline by name, "
        "move these to it, remove these from their pipeline, make these one pipeline, "
        "rename this pipeline to a name, or set their diameter to a value."
    ),
    "person_decides": (
        "What a tool proposed is decided by a person, in the inbox above the chat. A change "
        "you ask for in words comes back as a card for you to approve."
    ),
}

OUTCOME_LINES = {
    "done": "Done.",
    "declined": "Declined. Nothing was changed.",
    "failed": "Couldn't save. Nothing was changed.",
    "out_of_date": "Out of date. Nothing was changed.",
    "dismissed": "Dismissed. Nothing was written.",
}

# The words -------------------------------------------------------------------------------

# A question, not a request: "How do I add one?", "Can I move these?", "Is it in one?".
_ASKING = re.compile(
    r"^\W*(?:how|where|what|why|which|who|whose|when|is|are|was|were|does|do|did|"
    r"should\s+i|can\s+i|could\s+i|may\s+i)\b|\bhow\s+(?:do|can|would|to)\b",
    re.IGNORECASE,
)
# What is attached, as the person points at it.
_THEM = (
    r"(?:(?:these|this|them|it|those|both|all)(?:\s+(?:two|three|four|five|six|\d+))?"
    r"(?:\s+sections?)?|the\s+(?:selected\s+|attached\s+)?sections?)"
)
_ADD = re.compile(
    rf"\b(?:add|put|place|include)\s+{_THEM}\s+(?:to|into|in)\s+(?P<target>.+)$", re.IGNORECASE
)
_MOVE = re.compile(rf"\bmove\s+{_THEM}\s+(?:to|into|over\s+to)\s+(?P<target>.+)$", re.IGNORECASE)
_REMOVE = re.compile(
    rf"\b(?:remove|take|drop|pull)\s+{_THEM}\s+(?:out\s+of|from|off)\b", re.IGNORECASE
)
# "Make these one pipeline", "join these sections into a new line".
_MAKE = re.compile(
    r"\b(?:make|form|group|join|combine|put|turn|merge|propose)\b[^.?!]*\b(?:one|a|single|same|new)\s+"
    r"(?:new\s+)?(?:pipe)?line\b",
    re.IGNORECASE,
)
_NAMED = re.compile(r"\b(?:call(?:ed)?|name(?:d)?)\s+(?:it\s+)?(?P<name>.+)$", re.IGNORECASE)
_RENAME = re.compile(
    r"\brename\s+(?:it|this|that|the|this\s+pipeline|that\s+pipeline|the\s+pipeline)\s+"
    r"(?:to|as)\s+(?P<name>.+)$"
    r"|\b(?:call|name)\s+(?:this|that|the)\s+pipeline\s+(?P<name2>.+)$",
    re.IGNORECASE,
)
_ATTRIBUTES = r"(?P<attr>diameter|owner|operator|name|status|commodity)"
_SET = re.compile(
    r"\b(?:set|change|make|update|correct|fix)\s+(?:the\s+|their\s+|its\s+|this\s+\w+'s\s+)?"
    rf"{_ATTRIBUTES}\b(?:\s+of\s+(?:it|them|these|this|the\s+\w+))?\s+(?:to|as)\s+(?P<value>.+)$",
    re.IGNORECASE,
)
_IS = re.compile(
    rf"^\W*(?:the\s+|their\s+|its\s+){_ATTRIBUTES}\s+(?:is|should\s+be)\s+(?P<value>.+)$",
    re.IGNORECASE,
)
# Asked to decide what a tool proposed: only a person does, in the inbox.
_DECIDE = re.compile(
    r"^\W*(?:(?:great|ok(?:ay)?|good|thanks|now|then|and|so|please|can\s+you|could\s+you|"
    r"would\s+you|will\s+you|go\s+ahead\s+and|just)\W+)*"
    # "confirm who built it" asks to check, not to decide.
    r"(?:confirm|accept|approve|reject|decline)\b"
    r"(?!\s+(?:who|what|when|where|whether|if|how|which|why)\b)",
    re.IGNORECASE,
)
# Words that sound like a change code could not read: a fixed line, never a guess.
_CHANGE_LIKE = re.compile(
    r"\b(?:add|move|put|take|remove|drop|rename|set)\b[^.?!]*\b(?:pipe)?line\b|\bset\s+(?:the|their|its)\b",
    re.IGNORECASE,
)
_ABBREVIATION = re.compile(r"\b(?:co|inc|corp|ltd|bros|jr|sr|st|no)\.$", re.IGNORECASE)
_INCH = re.compile(r"^(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:inch(?:es)?|in\.?|\"|”)$", re.IGNORECASE)
_MM = re.compile(r"^(\d+(?:\.\d+)?)\s*(?:mm|millimet(?:er|re)s?)$", re.IGNORECASE)


def _end(text: str) -> str:
    """Text without the sentence's own end: "Example Co." keeps its full stop."""
    text = re.sub(r"[!?]+$", "", text.strip()).strip()
    if text.endswith(".") and not _ABBREVIATION.search(text):
        text = text[:-1].rstrip()
    return text


def _clean(text: str) -> str:
    """A name as written, without the sentence's own end or quotes."""
    return _end(text).strip("'\"‘’“” ").strip()


def _typed(attribute: str, value: str) -> str:
    """A diameter as Studio's rules read it: "12 inches", "12-inch" and 12" are 12 in."""
    if attribute == "diameter":
        if m := _INCH.match(value):
            return f"{m.group(1)} in"
        if m := _MM.match(value):
            return f"{m.group(1)} mm"
    return value


@dataclass
class Request:
    kind: Literal["add", "move", "remove", "make", "rename", "edit"]
    # add, move: the pipeline as the words name it ("this pipeline", "Example trunk line").
    target: str | None = None
    # make, rename: the name.
    name: str | None = None
    # edit: store's attribute key and the value as typed.
    attribute: str | None = None
    value: str | None = None


def read_request(words: str) -> Request | None:
    """The change the words ask for, or None when they ask a question."""
    if _ASKING.search(words):
        return None
    if _MAKE.search(words):
        named = _NAMED.search(words)
        return Request("make", name=_clean(named.group("name")) if named else None)
    if m := _RENAME.search(words):
        return Request("rename", name=_clean(m.group("name") or m.group("name2")))
    if m := _SET.search(words) or _IS.search(words):
        attribute = m.group("attr").lower()
        typed = _typed(attribute, _end(m.group("value")))
        return Request("edit", attribute=attribute, value=_clean(typed))
    if m := _MOVE.search(words):
        return Request("move", target=_clean(m.group("target")))
    if m := _ADD.search(words):
        return Request("add", target=_clean(m.group("target")))
    if _REMOVE.search(words):
        return Request("remove")
    return None


def asks_to_decide(words: str) -> bool:
    """Words that ask the Agent to decide what a tool proposed, which a person does."""
    return bool(_DECIDE.search(words))


def sounds_like_a_change(words: str) -> bool:
    """Words that ask for a change code could not read: they get a fixed line."""
    return not _ASKING.search(words) and bool(_CHANGE_LIKE.search(words))


# The checks ------------------------------------------------------------------------------


def confirmed_pipeline(section: dict[str, Any]) -> str | None:
    """The pipeline the section is confirmed part of, if any."""
    for link in section.get("links") or []:
        if (
            link.get("relation") == "part_of"
            and link.get("status") == "confirmed"
            and link.get("from_feature_id") == section["id"]
        ):
            return link["to_feature_id"]
    return None


def check_sections(sections: list[dict[str, Any]]) -> str | None:
    """Why these cannot be changed together, or None."""
    if len(sections) > MAX_SECTIONS:
        return LINES["too_many"]
    if any(s.get("kind") != "section" for s in sections):
        return LINES["not_sections"]
    if len({s.get("network") for s in sections}) > 1:
        return LINES["mixed_networks"]
    return None


_GENERIC = re.compile(
    r"^(?:(?:the|this|that|its|their|the\s+attached|the\s+selected)\s+)?(?:pipe)?line$"
    r"|^(?:it|this|that)$",
    re.IGNORECASE,
)


def _many(items: list[Any], one: str, word: str) -> str:
    return one if len(items) == 1 else f"{len(items)} {word}s"


def _sections_words(sections: list[dict[str, Any]]) -> str:
    return _many(sections, feature_name(sections[0]) if sections else "", "section")


def _moves(sections: list[dict[str, Any]], names: dict[str, str], to: str | None) -> str | None:
    """ "S-0152 is in Harlow main now. It moves." for sections that leave a pipeline."""
    leaving: dict[str, list[str]] = {}
    for s in sections:
        now = confirmed_pipeline(s)
        if now and now != to:
            leaving.setdefault(now, []).append(feature_name(s))
    lines = []
    for pipeline_id, moving in leaving.items():
        where = names.get(pipeline_id, f"pipeline {short_id(pipeline_id)}")
        if len(moving) == 1:
            lines.append(f"{moving[0]} is in {where} now. It moves.")
        else:
            lines.append(
                f"{', '.join(moving[:-1])} and {moving[-1]} are in {where} now. They move."
            )
    return " ".join(lines) or None


def _join(*notes: str | None) -> str | None:
    return " ".join(n for n in notes if n) or None


def _accepted(feature: dict[str, Any], key: str) -> list[dict[str, Any]]:
    return [
        c
        for c in feature.get("claims") or []
        if c.get("attribute_key") == key and c.get("status") == "accepted"
    ]


def _basis(sections: list[dict[str, Any]]) -> list[ChangeBasis]:
    return [ChangeBasis(section_id=s["id"], pipeline_id=confirmed_pipeline(s)) for s in sections]


def _refusal(text: str) -> Statement:
    return Statement(kind="refusal", text=text)


def _offer(title: str, **fields: Any) -> Statement:
    return Statement(
        kind="change_offer", text=title, change=ChangeOffer(id=str(uuid.uuid4()), **fields)
    )


def offer(
    request: Request,
    sections: list[dict[str, Any]],
    pipelines: list[dict[str, Any]],
    find_pipeline: Callable[[str], list[dict[str, Any]]],
    pipeline_names: Callable[[list[str]], dict[str, str]],
) -> Statement:
    """The card for `request` on the attached `sections` and `pipelines` (read from store),
    or the fixed line saying why there is none. `find_pipeline` finds pipelines by exact
    name or code; `pipeline_names` names pipelines by id."""
    if sections and (line := check_sections(sections)):
        return _refusal(line)
    kind = request.kind

    if kind == "rename" or (kind == "edit" and request.attribute == "name" and pipelines):
        if len(pipelines) != 1:
            return _refusal(LINES["attach_pipeline" if not pipelines else "one_pipeline"])
        pipeline = pipelines[0]
        name = request.name if kind == "rename" else request.value
        try:
            value_rules.read_typed("name", name or "")
        except value_rules.RuleError as error:
            return _refusal(f"Name {name}: {error} Nothing was offered.")
        return _offer(
            f"Rename {feature_name(pipeline)} to {name}",
            kind="rename",
            pipeline_id=pipeline["id"],
            name=name,
        )

    if kind == "edit":
        return _edit(request, sections, pipelines)

    if not sections:
        if kind == "make" and pipelines:
            return _refusal(LINES["not_sections"])
        return _refusal(LINES["nothing_attached"])

    if kind == "make":
        if len(sections) < 2:
            return _refusal(LINES["too_few"])
        names = pipeline_names([p for s in sections if (p := confirmed_pipeline(s))])
        title = f"Make a pipeline of {len(sections)} sections"
        if request.name:
            title += f", named {request.name}"
        return _offer(
            title,
            kind="make",
            section_ids=[s["id"] for s in sections],
            name=request.name,
            note=_moves(sections, names, None),
            basis=_basis(sections),
        )

    if kind == "remove":
        placed = [s for s in sections if confirmed_pipeline(s)]
        rest = [s for s in sections if not confirmed_pipeline(s)]
        if not placed:
            return _refusal(LINES["none_placed"])
        froms = list(dict.fromkeys(confirmed_pipeline(s) for s in placed))
        names = pipeline_names(froms)
        where = names.get(froms[0], "its pipeline") if len(froms) == 1 else "their pipelines"
        note = None
        if rest:
            verb = "is" if len(rest) == 1 else "are"
            note = f"{_sections_words(rest)} {verb} in no pipeline."
        return _offer(
            f"Remove {_sections_words(placed)} from {where}",
            kind="remove",
            section_ids=[s["id"] for s in placed],
            left_out=[s["id"] for s in rest],
            note=note,
            basis=_basis(placed),
        )

    # add, move: into one pipeline, attached or named.
    target = _target(request.target or "", pipelines, find_pipeline)
    if isinstance(target, str):
        return _refusal(target)
    to = target["id"]
    to_name = feature_name(target)
    there = [s for s in sections if confirmed_pipeline(s) == to]
    going = [s for s in sections if confirmed_pipeline(s) != to]
    if not going:
        if len(there) == 1:
            return _refusal(f"{feature_name(there[0])} is already in {to_name}.")
        return _refusal(f"These {len(there)} sections are already in {to_name}.")
    already = None
    if there:
        verb = "is" if len(there) == 1 else "are"
        already = f"{_sections_words(there)} {verb} already in {to_name}."
    names = pipeline_names([p for s in going if (p := confirmed_pipeline(s))])
    verb = "Move" if kind == "move" else "Add"
    return _offer(
        f"{verb} {_sections_words(going)} to {to_name}",
        kind=kind,
        section_ids=[s["id"] for s in going],
        pipeline_id=to,
        left_out=[s["id"] for s in there],
        note=_join(_moves(going, names, to), already),
        basis=_basis(going),
    )


def _target(
    words: str,
    pipelines: list[dict[str, Any]],
    find_pipeline: Callable[[str], list[dict[str, Any]]],
) -> dict[str, Any] | str:
    """The pipeline the words name: the attached one, or one store holds by that exact
    name or code. Or the line saying why there is none."""
    if _GENERIC.match(words):
        if len(pipelines) == 1:
            return pipelines[0]
        return LINES["attach_pipeline" if not pipelines else "one_pipeline"]
    wanted = re.sub(r"^the\s+", "", words, flags=re.IGNORECASE).casefold()
    for p in pipelines:
        if wanted in {feature_name(p).casefold(), short_id(p["id"]).casefold()}:
            return p
    found = find_pipeline(wanted)
    if not found:
        return LINES["no_such_pipeline"].format(name=words)
    if len(found) > 1:
        return LINES["many_pipelines"].format(name=words)
    return found[0]


def _edit(
    request: Request, sections: list[dict[str, Any]], pipelines: list[dict[str, Any]]
) -> Statement:
    key = request.attribute or ""
    value = request.value or ""
    if key in ("owner", "operator"):
        if not pipelines:
            return _refusal(LINES["owner_on_pipeline"])
        if len(pipelines) != 1:
            return _refusal(LINES["one_pipeline"])
        try:
            value_rules.read_typed(key, value)
        except value_rules.RuleError as error:
            return _refusal(f"{key.capitalize()} {value}: {error} Nothing was offered.")
        pipeline = pipelines[0]
        held = [value_words(c) for c in _accepted(pipeline, key)]
        held = [h for h in held if h.casefold() != value.casefold()]
        note = None
        if held:
            verb = "stays" if len(held) == 1 else "stay"
            note = f"{' and '.join(held)} {verb} beside it."
        return _offer(
            f"Set the {key} of {feature_name(pipeline)}",
            kind="edit",
            pipeline_id=pipeline["id"],
            attribute=key,
            value=value,
            note=note,
        )
    if key != "diameter":
        return _refusal(LINES["not_from_chat"])
    if not sections:
        return _refusal(LINES["diameter_on_sections" if pipelines else "nothing_attached"])
    try:
        value_rules.read_typed(key, value)
    except value_rules.RuleError as error:
        return _refusal(f"Diameter {value}: {error} Nothing was offered.")
    replaced = []
    for s in sections:
        for claim in _accepted(s, key):
            words = value_words(claim)
            if words != value:
                replaced.append(f"{words} on {feature_name(s)}")
    return _offer(
        f"Set the diameter of {_sections_words(sections)}",
        kind="edit",
        section_ids=[s["id"] for s in sections],
        attribute=key,
        value=value,
        note=f"Replaces {', '.join(replaced)}." if replaced else None,
        basis=_basis(sections),
    )
