"""Several sections taken together: what they share, where they differ, which is shown
earlier, which is longer, which are in a pipeline. Worked out by code from what was read
of each; never a claim, and never more than the data says.

Two sections are compared side by side. More than two are summarised: a count, the value
most share, and the exceptions by name; never a line per section per fact.

Words that carry a risk are code's: "shown earlier", never "older" or "built first"; two
values that differ are both given, never one picked; "drawn touching", never "connected".
"""

import re
from collections.abc import Callable
from typing import Any

from src.answer.render import feature_name, one_full_stop, value_words
from src.answer.schemas import WorkedOut
from src.worked_out import geometry, places, states
from src.worked_out.context import (
    _MEETS,
    _MILE_M,
    _about,
    _and,
    _distance_words,
    distance_m,
    first_shown,
    pipeline_words,
    route_lines,
)

ATTRIBUTES = ("name", "owner", "operator", "diameter")
# What each sentence is about, as the model is shown it.
TOPICS = (*ATTRIBUTES, "first_map", "length", "pipeline", "touching", "states", "towns")


class Section:
    """One section with the traces merged into it, whose claims count as its own."""

    def __init__(self, feature: dict[str, Any], merged: list[dict[str, Any]]) -> None:
        self.feature, self.own = feature, [feature, *merged]
        self.id, self.name = feature["id"], feature_name(feature)
        self.lines = route_lines(feature)

    def accepted(self, attribute: str) -> list[dict[str, Any]]:
        return [
            c
            for f in self.own
            for c in f.get("claims") or []
            if c["attribute_key"] == attribute and c["status"] == "accepted"
        ]

    def proposed(self, attribute: str) -> bool:
        """A value waits for a decision, and none is accepted."""
        return not self.accepted(attribute) and any(
            c["attribute_key"] == attribute and c["status"] == "candidate"
            for f in self.own
            for c in f.get("claims") or []
        )

    def values(self, attribute: str) -> tuple[str, ...]:
        return tuple(sorted({value_words(c) for c in self.accepted(attribute)}))

    def first_map(self) -> tuple[int, dict[str, Any]] | None:
        shown = [s for f in self.own if (s := first_shown(f))]
        return min(shown, key=lambda pair: pair[0]) if shown else None

    def pipelines(self, status: str) -> list[str]:
        return [
            link["to_feature_id"]
            for link in self.feature.get("links") or []
            if link["relation"] == "part_of"
            and link["status"] == status
            and link["from_feature_id"] == self.id
        ]


def _names(sections: list[Section]) -> str:
    return _and([s.name for s in sections])


def _length_words(lines: list[list[geometry.Point]]) -> tuple[float, str]:
    metres = geometry.length_m(lines)
    return metres, f"about {_about(metres, 1_000)} km ({_about(metres, _MILE_M)} miles)"


def _name(sections: list[Section]) -> tuple[str, list[str]]:
    """Names: a section is often called by its name already, so the name is said once."""
    held = [(s, s.values("name")) for s in sections]
    known = [(s, v) for s, v in held if v]
    unknown = [s for s, v in held if not v]
    rests = [c["id"] for s in sections for c in s.accepted("name")]
    n = len(sections)
    if not known:
        whom = "either section" if n == 2 else f"any of the {n} sections"
        return f"No source names {whom}.", rests
    said = _and([name for _, v in known for name in v])
    if not unknown:
        both = "Both sections have" if n == 2 else f"All {n} sections have"
        return f"{both} a name: {said}.", rests
    if n == 2:
        return f"Only one has a name: {said}. No source names {unknown[0].name}.", rests
    verb = "has" if len(known) == 1 else "have"
    return (
        f"{len(known)} of the {n} sections {verb} a name: {said}. No source names the "
        f"other {len(unknown)}: {_names(unknown)}."
    ), rests


def _attribute(sections: list[Section], key: str) -> tuple[str, list[str]]:
    if key == "name":
        return _name(sections)
    attribute = key.replace("_", " ")  # as it is said: "flow direction"
    held = [(s, s.values(key)) for s in sections]
    known = [(s, v) for s, v in held if v]
    unknown = [s for s, v in held if not v]
    rests = [c["id"] for s in sections for c in s.accepted(key)]
    n = len(sections)
    if not known:
        whom = "either section" if n == 2 else f"any of the {n} sections"
        return f"No source gives the {attribute} of {whom}.", rests
    groups: dict[tuple[str, ...], list[Section]] = {}
    for s, v in known:
        groups.setdefault(v, []).append(s)
    if n == 2:
        a, b = sections
        if unknown:
            (s, v), other = known[0], unknown[0]
            return (
                f"The {attribute} is known only for {s.name}: {_and(list(v))}. No source "
                f"gives it for {other.name}."
            ), rests
        if len(groups) == 1:
            return (
                f"{a.name} and {b.name} have the same {attribute}: {_and(list(held[0][1]))}.",
                rests,
            )
        return (
            f"The {attribute} differs: {_and(list(held[0][1]))} for {a.name}, "
            f"{_and(list(held[1][1]))} for {b.name}."
        ), rests
    if len(groups) == 1 and not unknown:
        return f"All {n} sections have the same {attribute}: {_and(list(known[0][1]))}.", rests
    parts = "; ".join(f"{_and(list(v))} for {_names(who)}" for v, who in groups.items())
    if not unknown:
        return (
            f"All {n} sections have a known {attribute}, and it differs among them: {parts}."
        ), rests
    text = f"The {attribute} is known for {len(known)} of the {n} sections: {parts}."
    if unknown:
        text += f" No source gives it for {len(unknown)}: {_names(unknown)}."
    return text, rests


def _first_map(sections: list[Section]) -> tuple[str, list[str]]:
    shown = [(s, s.first_map()) for s in sections]
    dated = [(s, m[0]) for s, m in shown if m]
    undated = [s for s, m in shown if not m]
    rests = [m[1]["id"] for _, m in shown if m]
    n = len(sections)
    if not dated:
        whom = "either section" if n == 2 else f"any of the {n} sections"
        return f"No map date is given for {whom}.", rests
    years = sorted({y for _, y in dated})
    if n == 2:
        if undated:
            s, y = dated[0]
            return (
                f"{s.name} is first shown on the {y} map. No map date is given for "
                f"{undated[0].name}, so which is shown earlier is not known."
            ), rests
        (a, ya), (b, yb) = dated
        if ya == yb:
            return f"{a.name} and {b.name} are both first shown on the {ya} map.", rests
        first = a if ya < yb else b
        return (
            f"{a.name} is first shown on the {ya} map and {b.name} on the {yb} map, so "
            f"{first.name} is shown earlier. A map year is not a build date."
        ), rests
    if len(years) == 1 and not undated:
        return f"All {n} sections are first shown on the {years[0]} map.", rests
    parts = "; ".join(
        f"on the {y} map, {_names([s for s, year in dated if year == y])}" for y in years
    )
    text = f"First shown: {parts}."
    if undated:
        text += f" No map date is given for {_names(undated)}."
    return text + " A map year is not a build date.", rests


def _length(sections: list[Section]) -> tuple[str, list[str]] | None:
    drawn = [(s, *_length_words(s.lines)) for s in sections if s.lines]
    if len(drawn) < len(sections) or not drawn:
        return None  # a section with no drawn line: nothing true to say of them all
    if len(sections) == 2:
        (a, ma, wa), (b, mb, wb) = drawn
        if wa == wb:
            return f"{a.name} and {b.name} are each {wa} long as drawn.", []
        longer = a if ma > mb else b
        return (
            f"{a.name} is {wa} long as drawn and {b.name} {wb}, so {longer.name} is longer."
        ), []
    total = _length_words([line for s in sections for line in s.lines])[1]
    max(drawn, key=lambda d: d[1])
    min(drawn, key=lambda d: d[1])
    return f"Together the {len(sections)} sections are {total} long as drawn.", []


def _extremes(sections: list[Section]) -> tuple[str, list[str]] | None:
    """The longest and the shortest of three or more: asked for apart from the total."""
    drawn = [(s, *_length_words(s.lines)) for s in sections if s.lines]
    if len(sections) < 3 or len(drawn) < len(sections):
        return None
    longest = max(drawn, key=lambda d: d[1])
    shortest = min(drawn, key=lambda d: d[1])
    return (
        f"The longest is {longest[0].name}, {longest[2]}; the shortest is "
        f"{shortest[0].name}, {shortest[2]}."
    ), []


def total_length(sections: list[Section]) -> tuple[str, list[str]] | None:
    """How long two sections are drawn in all: what "how long is this pipeline" asks,
    which comparing the two does not say."""
    if len(sections) != 2 or not all(s.lines for s in sections):
        return None
    total = _length_words([line for s in sections for line in s.lines])[1]
    return f"Together the 2 sections are {total} long as drawn.", []


def _pipeline(sections: list[Section], lines: dict[str, dict[str, Any]]) -> tuple[str, list[str]]:
    def named(ids: list[str]) -> tuple[str, ...]:
        return tuple(sorted(pipeline_words(lines[i]) for i in ids if i in lines))

    placed = [(s, named(s.pipelines("confirmed"))) for s in sections]
    inside = [(s, p) for s, p in placed if p]
    outside = [s for s, p in placed if not p]
    n = len(sections)
    groups: dict[tuple[str, ...], list[Section]] = {}
    for s, p in inside:
        groups.setdefault(p, []).append(s)
    if not inside:
        text = (
            f"Neither {sections[0].name} nor {sections[1].name} is in a pipeline."
            if n == 2
            else f"None of the {n} sections is in a pipeline."
        )
    elif len(groups) == 1 and not outside:
        both = (
            f"{sections[0].name} and {sections[1].name} are both"
            if n == 2
            else f"All {n} sections are"
        )
        text = f"{both} in {_and(list(inside[0][1]))}."
    elif n == 2 and not outside:
        (a, pa), (b, pb) = inside
        text = f"{a.name} is in {_and(list(pa))} and {b.name} is in {_and(list(pb))}: not the same pipeline."
    elif n == 2:
        (s, p), other = inside[0], outside[0]
        text = f"{s.name} is in {_and(list(p))}; {other.name} is not in a pipeline."
    else:
        parts = "; ".join(f"{_names(who)} in {_and(list(p))}" for p, who in groups.items())
        text = f"{len(inside)} of the {n} sections are in a pipeline: {parts}."
        if outside:
            text += f" Not in a pipeline: {_names(outside)}."
    for s in sections:
        proposed = named(s.pipelines("proposed"))
        if proposed:
            text += (
                f" It is proposed, and not yet decided, that {s.name} is part of "
                f"{_and(list(proposed))}."
            )
    rests = [
        link["id"]
        for s in sections
        for link in s.feature.get("links") or []
        if link["relation"] == "part_of" and link["status"] != "rejected"
    ]
    return text, rests


def _touching(a: Section, b: Section) -> tuple[str, list[str]] | None:
    if not a.lines or not b.lines:
        return None
    meets = geometry.touching(a.lines, b.lines)
    if meets:
        return (
            _MEETS[meets[0]].format(me=a.name, other=b.name)
            + " Lines drawn touching do not prove the pipes joined."
        ), []
    gap = _distance_words(distance_m(a.lines, b.lines))
    return f"{a.name} and {b.name} are not drawn touching: {a.name} is {gap} {b.name}.", []


def _states(sections: list[Section]) -> tuple[str, list[str]] | None:
    crossed = [(s, states.states_of(s.lines)) for s in sections if s.lines]
    crossed = [(s, c) for s, c in crossed if c]
    if len(crossed) < len(sections) or not crossed:
        return None
    n = len(sections)
    every = sorted({state for _, c in crossed for state in c})
    if all(sorted(c) == every for _, c in crossed):
        whom = f"{sections[0].name} and {sections[1].name} both" if n == 2 else f"All {n} sections"
        verb = "lie in" if len(every) == 1 else "run through"
        return f"{whom} {verb} {_and(every)}.", []
    if n == 2:
        (a, ca), (b, cb) = crossed
        shared = sorted(set(ca) & set(cb))
        text = f"{a.name} lies in {_and(ca)} and {b.name} in {_and(cb)}."
        return text + (f" Both run through {_and(shared)}." if shared else ""), []
    counts = [f"{sum(state in c for _, c in crossed)} in {state}" for state in every]
    return (
        f"Of the {n} sections, {counts[0].replace(' in ', ' lie in ', 1)}, {_and(counts[1:])}.",
        [],
    )


def _towns(sections: list[Section]) -> tuple[str, list[str]] | None:
    """Today's towns near the drawn lines, all of them taken as one: where they lie,
    never places a source names or the pipes supplied."""
    lines = [line for s in sections for line in s.lines]
    towns = places.towns_along(lines) if lines else []
    if not towns:
        return None
    whom = (
        f"{sections[0].name} and {sections[1].name}"
        if len(sections) == 2
        else f"the {len(sections)} sections"
    )
    return f"Today's towns along {whom}, as drawn: {_and(towns)}.", []


def members_fact(
    line: dict[str, Any],
    members: list[Section],
    waiting: list[dict[str, Any]],
    handle: Callable[[], str],
) -> WorkedOut:
    """Which sections a pipeline has, counted and named; and any proposed for it, said
    as proposed. `waiting` are the sections a proposed link would add."""
    name = pipeline_words(line)
    name = f"{name[0].upper()}{name[1:]}"
    if not members:
        text = f"{name} has no sections yet."
    elif len(members) == 1:
        text = f"{name} has 1 section: {members[0].name}."
    else:
        text = f"{name} has {len(members)} sections: {_names(members)}."
    if waiting:
        text += (
            " It is proposed, and not yet decided, that "
            f"{_and([feature_name(f) for f in waiting])} "
            f"{'is' if len(waiting) == 1 else 'are'} part of it."
        )
    links = [
        link["id"]
        for link in line.get("links") or []
        if link["relation"] == "part_of" and link["status"] != "rejected"
    ]
    return WorkedOut(
        handle=handle(),
        what="together",
        text=one_full_stop(text),
        rests_on=[line["id"], *(s.id for s in members), *links],
    )


def _with_proposals(text: str, sections: list[Section], attribute: str) -> str:
    """A value proposed and not decided is said beside "no source gives": a source does
    say something there, and a person has yet to decide on it."""
    waiting = [s for s in sections if s.proposed(attribute)]
    if not waiting:
        return text
    said = attribute.replace("_", " ")
    one = "A name" if attribute == "name" else f"A value for the {said}"
    return f"{text} {one} is proposed, and not decided yet, for {_names(waiting)}."


# Never summarised as a value: the line itself, where it is, and its status, which the
# maps and the end facts say.
NOT_SUMMARISED = frozenset({"route", "location", "status"})


def other_attributes(sections: list[Section]) -> list[str]:
    """Any other fact at least one of the sections holds, accepted or proposed: said
    too, so a summary leaves nothing recorded out."""
    held = {
        c["attribute_key"]
        for s in sections
        for f in s.own
        for c in f.get("claims") or []
        if c["status"] in ("accepted", "candidate")
    }
    return sorted(held - set(ATTRIBUTES) - NOT_SUMMARISED)


def says(text: str) -> str:
    """What kind of thing a sentence says of the sections, so "in common" and "differ"
    are picked by code's label, not by reading: same, differs, nothing_known, or
    all_of_them (a total or a list for the whole set)."""
    if re.match(r"No source |No map date is given for (either|any)|Neither |None of ", text):
        return "nothing_known"
    if text.startswith(("Today's towns along ", "Together the ", "The longest is ")):
        return "all_of_them"  # a total or a list for the set: neither shared nor a difference
    alike = (
        " have the same " in text
        or " both " in text
        or text.startswith(("All ", "Both "))
        or " are each " in text
        or (" is drawn touching " in text)
    )
    return "same" if alike else "differs"


def together_facts(
    sections: list[Section],
    lines: dict[str, dict[str, Any]],
    handle: Callable[[], str],
) -> list[tuple[str, WorkedOut]]:
    """One sentence per topic about the sections taken together, each with what it is
    about. `lines` are the pipelines any of them is linked to, by id."""
    made: list[tuple[str, tuple[str, list[str]] | None]] = [
        *(
            (a, (_with_proposals(found[0], sections, a), found[1]))
            for a in (*ATTRIBUTES, *other_attributes(sections))
            for found in [_attribute(sections, a)]
        ),
        ("first_map", _first_map(sections)),
        ("length", _length(sections)),
        ("longest", _extremes(sections)),
        ("pipeline", _pipeline(sections, lines)),
        ("touching", _touching(*sections) if len(sections) == 2 else None),
        ("states", _states(sections)),
        ("towns", _towns(sections)),
    ]
    ids = [s.id for s in sections]
    return [
        (
            topic,
            WorkedOut(
                handle=handle(),
                what="together",
                text=one_full_stop(found[0]),
                rests_on=[*ids, *found[1]],
            ),
        )
        for topic, found in made
        if found
    ]
