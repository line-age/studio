"""Is every statement of an answer backed by the world it was asked about?

This re-checks grounding on its own: it does not use the Agent's ledger, its renderer or
its grounding check, only the answer and the world. So a bug in the Agent's own check
cannot hide here.
"""

import calendar
import itertools
import json
import math
import re
from typing import Any

from evals.make_world import scope
from src.answer.render import FIXED_LINES, feature_name
from src.clients import value_rules
from src.flows import change_flow
from src.flows.cite_flow import CITE_LINES, FOUND, IN_DOUBT, IN_STORE_WORDS
from src.worked_out import geometry
from src.worked_out.places import END_M, all_places
from src.worked_out.states import all_states, states_of

# Words a sentence may capitalise without having read them from store.
VOCABULARY = {
    "Store",
    "Studio",
    "Agent",
    "Unknown",
    "I",
    "My",
    *calendar.month_name[1:],
}
_QUOTED = re.compile(r"[“\"]([^”\"]+)[”\"]")
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)


def _claims(world: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        c["id"]: {**c, "feature_id": fid}
        for fid, feature in world["features"].items()
        for c in feature["claims"]
    }


def _held(world: dict[str, Any], feature_id: str, attribute: str) -> bool:
    """Does store hold an accepted claim for this attribute, as `/missing` would see it?"""
    return any(
        c["attribute_key"] == attribute and c["status"] == "accepted"
        for fid in scope(world["links"], feature_id)
        for c in world["features"][fid]["claims"]
    )


def _printings(world: dict[str, Any]) -> list[int]:
    """The printings a reader of store can know of: years sections are first shown."""
    return sorted(
        {
            int(row["properties"]["time_start"][:4])
            for row in world["sections"]
            if row["properties"].get("time_start")
        }
    )


def _towns_near(world: dict[str, Any], feature_ids: set[str]) -> list[str]:
    """Every town within END_M of a feature's accepted route: the towns a search may name.

    Worked out here from the Census places and the world, not through
    places.towns_along, so the score does not lean on how the Agent picks them.
    """
    towns: list[str] = []
    for fid in feature_ids:
        feature = world["features"].get(fid) or {}
        for claim in feature.get("claims", []):
            if claim["attribute_key"] != "route" or claim["status"] != "accepted":
                continue
            geom = claim.get("value_geom") or {}
            coords = geom.get("coordinates") or []
            lines = coords if geom.get("type") == "MultiLineString" else [coords]
            lines = [[(p[0], p[1]) for p in line] for line in lines if line]
            if not lines:
                continue
            west, south, east, north = geometry.bbox_around(lines, END_M)
            towns += [
                place.name
                for place in all_places()
                if west <= place.lon <= east
                and south <= place.lat <= north
                and geometry.to_line(place.point, lines) <= END_M
            ]
    return towns


def _map_year(claim: dict[str, Any], role: str) -> int | None:
    """A map's year, read here on purpose and not through context.py: the score checks
    the Agent, so it must not share the Agent's code for what it checks."""
    for citation in claim.get("citations") or []:
        if citation.get("role") == role and str(citation.get("as_of_edtf") or "")[:4].isdigit():
            return int(citation["as_of_edtf"][:4])
    return None


def _shown_from(world: dict[str, Any], fid: str) -> int | None:
    """The earliest printing an accepted status claim cites as showing this feature."""
    years = [
        y
        for c in world["features"][fid]["claims"]
        if c["attribute_key"] == "status"
        and c["status"] == "accepted"
        and (y := _map_year(c, "map_shows"))
    ]
    return min(years) if years else None


def _gone_on(world: dict[str, Any], fid: str) -> int | None:
    """The printing a line traced as gone was traced on, from a claim not rejected."""
    return next(
        (
            y
            for c in world["features"][fid]["claims"]
            if c["status"] != "rejected" and (y := _map_year(c, "map_omits"))
        ),
        None,
    )


def _route(world: dict[str, Any], fid: str) -> list[list[float]]:
    return [
        line
        for c in world["features"][fid]["claims"]
        if c["attribute_key"] == "route" and c["status"] == "accepted"
        for line in c["value_geom"]["coordinates"]
    ]


def _near(p: list[float], lines: list[list[list[float]]], within: float = 50.0) -> bool:
    """Is a point within `within` m of the lines? Sampled every step of a segment, flat
    earth: its own way, not the Agent's."""
    import math

    kx = 111_320 * math.cos(math.radians(p[1]))
    for line in lines:
        for a, b in itertools.pairwise(line):
            steps = 400
            for n in range(steps + 1):
                x = a[0] + (b[0] - a[0]) * n / steps
                y = a[1] + (b[1] - a[1]) * n / steps
                if math.hypot((x - p[0]) * kx, (y - p[1]) * 110_574) <= within:
                    return True
    return False


def _touch(world: dict[str, Any], a: str, b: str) -> bool:
    ra, rb = _route(world, a), _route(world, b)
    ends = lambda r: [p for line in r for p in (line[0], line[-1])]
    return any(_near(p, rb) for p in ends(ra)) or any(_near(p, ra) for p in ends(rb))


def _gap_km(world: dict[str, Any], a: str, b: str) -> float:
    """The shortest gap between two traced lines, in km: both sampled along every segment,
    point to point, flat earth. Its own way, not the Agent's."""
    import math

    def points(fid: str) -> list[tuple[float, float]]:
        out = []
        for line in _route(world, fid):
            for p, q in itertools.pairwise(line):
                out += [
                    (p[0] + (q[0] - p[0]) * n / 40, p[1] + (q[1] - p[1]) * n / 40)
                    for n in range(41)
                ]
        return out

    pa, pb = points(a), points(b)
    if not pa or not pb:
        return math.inf
    return (
        min(
            math.hypot((x - u) * 111_320 * math.cos(math.radians((y + v) / 2)), (y - v) * 110_574)
            for x, y in pa
            for u, v in pb
        )
        / 1_000
    )


_NEARBY = re.compile(r"(?:is about ([\d,]+) km from|is drawn within 1 km of)")


def _same_pipe(world: dict[str, Any], fid: str) -> set[str]:
    return {
        end
        for link in world["links"]
        if fid in (link["from_feature_id"], link["to_feature_id"])
        and link["relation"] in ("same_as", "split_into", "overlaps")
        and link["status"] != "rejected"
        for end in (link["from_feature_id"], link["to_feature_id"])
    }


def _lead_problems(
    where: str, text: str, refs: list[dict[str, Any]], world: dict[str, Any]
) -> list[str]:
    """A lead about a neighbour rests on a section that really is drawn touching the one
    asked about, and never says what turns a clue into a claim. (That it is not in store
    is its kind, set by code.)"""
    problems = []
    claims = _claims(world)
    me = next((r["id"] for r in refs if r["type"] == "feature"), None)
    if "drawn touching" in text and me:
        for ref in refs:
            claim = claims.get(ref["id"]) if ref["type"] == "claim" else None
            if claim and not _touch(world, me, claim["feature_id"]):
                problems.append(f"{where}: the lead's section is not drawn touching it")
    for word in ("connected", "built in", "was built"):
        if word in text.lower():
            problems.append(f"{where}: a lead says {word!r}")
    return problems


def _route_of(world: dict[str, Any], fid: str) -> list[list[tuple[float, float]]]:
    feature = world["features"].get(fid) or {}
    return [
        line
        for c in feature.get("claims", [])
        if c["attribute_key"] == "route" and c["status"] == "accepted"
        for line in geometry.lines_of(c.get("value_geom"))
    ]


def _place_problems(
    where: str,
    text: str,
    features: list[str],
    refs: list[dict[str, Any]],
    world: dict[str, Any],
    problems: list[str],
) -> list[str]:
    """Length, towns and states of the sections a worked-out sentence rests on, worked
    out again here from the world, however the sentence is worded. Returns the words it
    may use; adds what is wrong to `problems`."""
    if _NEARBY.search(text) or "drawn touching" in text:
        return []  # a distance between two lines: checked on its own
    claims = _claims(world)
    owners = set(features) | {
        claims[r["id"]]["feature_id"] for r in refs if r["type"] == "claim" and r["id"] in claims
    }
    routes = [lines for fid in owners if (lines := _route_of(world, fid))]
    if not routes:
        return []
    lengths = []
    for lines in routes:
        # Measured again here, point to point, on a flat earth around each stretch.
        metres = 0.0
        for line in lines:
            for (x1, y1), (x2, y2) in itertools.pairwise(line):
                kx = 111_320.0 * math.cos(math.radians((y1 + y2) / 2))
                metres += math.hypot((x2 - x1) * kx, (y2 - y1) * 110_574.0)
        lengths.append(metres)
    allowed: list[str] = []
    for unit, size in (("km", 1_000.0), ("miles", 1_609.344)):
        for told in re.findall(rf"([\d.]+) {unit}\b", text):
            if not any(abs(float(told) - m / size) <= max(0.6, 0.02 * m / size) for m in lengths):
                problems.append(f"{where}: no line it rests on is {told} {unit} long")
            allowed.append(told)
    crossed = {state for lines in routes for state in states_of(lines)}
    for state in all_states():
        if re.search(rf"\b{re.escape(state.name)}\b", text) and state.name not in crossed:
            problems.append(f"{where}: the line does not run through {state.name}")
    return [*allowed, *crossed, *_towns_near(world, owners)]


def _metres(lines: list[Any]) -> float:
    """A drawn line's length, measured here point to point on a flat earth."""
    metres = 0.0
    for line in lines:
        for (x1, y1), (x2, y2) in itertools.pairwise([(p[0], p[1]) for p in line]):
            kx = 111_320.0 * math.cos(math.radians((y1 + y2) / 2))
            metres += math.hypot((x2 - x1) * kx, (y2 - y1) * 110_574.0)
    return metres


_TOGETHER = re.compile(
    r"shown earlier|both first shown|sections are first shown|^First shown: |"
    r"which is shown earlier is not known|No map date is given for (?:either|any)|"
    r"is longer\.|are each about|^Together the \d+ sections|^The longest is |a known [a-z ]+, and it differs|"
    r"is known for \d+ of the \d+|is known only for|have the same [a-z][a-z ]*: |"
    r"^The [a-z][a-z ]* differs|No source gives the [a-z][a-z ]* of|"
    r"No source names (?:either|any)|a name: |"
    r"in a pipeline|are both in |sections are in |not the same pipeline|^Of the \d+ sections, "
)


def _together_problems(
    where: str, text: str, features: list[str], world: dict[str, Any]
) -> tuple[list[str], list[str]] | None:
    """A sentence about several sections taken together (together.py), worked out again
    here from the world: every same, differs, count, earlier and longer. None when the
    sentence is not one of those. Its own code on purpose: it shares none of the Agent's."""
    sections = [f for f in features if world["features"][f].get("kind") == "section"]
    towns = re.match(r"Today's towns along .+?, as drawn: (.+)\.$", text)
    if towns and len(sections) >= 2:
        # Each town is found again here, near one of the lines it is said of.
        near = set(_towns_near(world, set(sections)))
        rest = towns.group(1)
        for town in sorted(near, key=len, reverse=True):
            rest = rest.replace(town, "")
        left = re.sub(r",| and |\s", "", rest)
        found = [f"{where}: a town named is not near these lines: {left[:40]!r}"] if left else []
        return found, [*near, *re.findall(r"\d+", text)]
    if len(sections) < 2 or not _TOGETHER.search(text):
        return None
    problems: list[str] = []
    n = len(sections)
    name = {f: feature_name(world["features"][f]) for f in sections}
    # A longer name first, so "section 1a2b" is not found inside another name.
    by_name = sorted(name.items(), key=lambda item: -len(item[1]))

    def named(part: str) -> list[str]:
        found, rest = [], part
        for fid, words in by_name:
            if words in rest:
                found.append(fid)
                rest = rest.replace(words, " ")
        return found

    def wrong(what: str) -> None:
        problems.append(f"{where}: {what}")

    for told in re.findall(r"(?:All|the|Together the|None of the) (\d+) sections", text):
        if int(told) != n:
            wrong(f"{n} sections are taken together, not {told}")

    # First maps.
    def first(fid: str) -> int | None:
        years = [y for f in scope(world["links"], fid) if (y := _shown_from(world, f))]
        return min(years) if years else None

    firsts = {f: first(f) for f in sections}
    for part, year in re.findall(
        r"((?:[^.;]|(?<=Co)\.)*?) (?:is|are both|are) first shown on the (\d{4}) map", text
    ):
        for fid in named(part) or (sections if "sections are" in text else []):
            if firsts[fid] != int(year):
                wrong(f"{name[fid]} is first shown in {firsts[fid]}, not {year}")
    pair = re.search(r"map and (.+?) on the (\d{4}) map, so (.+?) is shown earlier", text)
    if pair:
        other, year, earlier = pair.groups()
        for fid in named(other):
            if firsts[fid] != int(year):
                wrong(f"{name[fid]} is first shown in {firsts[fid]}, not {year}")
        dated = {f: y for f, y in firsts.items() if y}
        if len(dated) != n or named(earlier) != [min(dated, key=dated.get)]:
            wrong("the one said to be shown earlier is not")
        if len(set(dated.values())) < 2:
            wrong("both are first shown on the same map: neither is earlier")
    for year, part in (
        re.findall(r"on the (\d{4}) map, ([^;.]+)", text)
        if text.startswith("First shown: ")
        else []
    ):
        told = set(named(part))
        truly = {f for f, y in firsts.items() if y == int(year)}
        if told != truly:
            wrong(f"the sections first shown on the {year} map are not those named")
    if "both first shown" in text and len(set(firsts.values())) != 1:
        wrong("they are not first shown on the same map")
    if re.search(r"No map date is given for (?:either|any)", text) and any(firsts.values()):
        wrong("a map date is given for one of them")

    # Lengths.
    length = {f: _metres(_route(world, f)) for f in sections}

    def fits(told: str, metres: float, size: float) -> bool:
        value = float(told.replace(",", ""))
        return abs(value - metres / size) <= max(0.6, 0.02 * metres / size)

    for part, km, miles in re.findall(
        r"((?:[^.;,]|(?<=Co)\.)*?),? (?:is |are each )?about ([\d,]+) km \(([\d,]+) miles\)", text
    ):
        who = named(part)
        if text.startswith("Together") and "sections are" in part:
            total = sum(length.values())
            if not fits(km, total, 1_000.0) or not fits(miles, total, 1_609.344):
                wrong(f"together they are {total / 1000:.0f} km long, not {km}")
            continue
        for fid in who:
            if not fits(km, length[fid], 1_000.0) or not fits(miles, length[fid], 1_609.344):
                wrong(f"{name[fid]} is {length[fid] / 1000:.0f} km long, not {km}")
    longer = re.search(r", so (.+?) is longer\.", text)
    if longer and named(longer.group(1)) != [max(length, key=length.get)]:
        wrong("the one said to be longer is not")
    ends = re.search(r"The longest is (.+?), about .*?; the shortest is (.+?), about", text)
    if ends and (
        named(ends.group(1)) != [max(length, key=length.get)]
        or named(ends.group(2)) != [min(length, key=length.get)]
    ):
        wrong("the longest or the shortest is not the one named")

    # Facts held: counts and who.
    recorded = {c["attribute_key"] for f in world["features"].values() for c in f["claims"]}
    for key in sorted({"name", "owner", "operator", "diameter"} | recorded - {"route", "status"}):
        attribute = key.replace("_", " ")
        holds = [f for f in sections if _held(world, f, key)]
        count = re.search(rf"The {attribute} is known for (\d+) of the", text) or (
            re.search(r"^(\d+) of the \d+ sections ha(?:s|ve) a name", text)
            if attribute == "name"
            else None
        )
        if count and int(count.group(1)) != len(holds):
            wrong(f"{len(holds)} of them hold an accepted {attribute}, not {count.group(1)}")
        if count:
            lacking = re.search(
                r"No source (?:gives it for|names the other) (\d+): (.+?)\.(?: A |$)", text
            )
            if (lacking is None) != (len(holds) == n):
                wrong(f"says wrongly whether any lacks the {attribute}")
            if lacking and (
                int(lacking.group(1)) != n - len(holds)
                or set(named(lacking.group(2))) != set(sections) - set(holds)
            ):
                wrong(f"the sections with no {attribute} are not those named")
        none = (
            rf"No source gives the {attribute} of (?:either|any)"
            if attribute != "name"
            else r"No source names (?:either|any)"
        )
        if re.search(none, text) and holds:
            wrong(f"one of them holds an accepted {attribute}")
        only = re.search(rf"The {attribute} is known only for (.+?): ", text)
        if only and named(only.group(1)) != holds:
            wrong(f"the {attribute} is not known for that one alone")
        if attribute == "name" and "Only one has a name" in text and len(holds) != 1:
            wrong("not exactly one of them has a name")
        if (
            re.search(rf"have the same {attribute}|The {attribute} differs", text)
            and len(holds) != n
        ):
            wrong(f"not all of them hold an accepted {attribute}")
        if (
            re.search(rf"All \d+ sections have (?:the same {attribute}|a name)", text)
            and (attribute != "name" or "a name" in text)
            and len(holds) != n
        ):
            wrong(f"not all of them hold an accepted {attribute}")

    waiting = re.search(
        r"(?:A name|A value for the ([a-z ]+?)) is proposed, and not decided yet, for (.+?)\.$",
        text,
    )
    if waiting:
        attribute = (waiting.group(1) or "name").replace(" ", "_")
        truly = {
            f
            for f in sections
            if not _held(world, f, attribute)
            and any(
                c["attribute_key"] == attribute and c["status"] == "candidate"
                for fid in scope(world["links"], f)
                for c in world["features"][fid]["claims"]
            )
        }
        if set(named(waiting.group(2))) != truly:
            wrong(f"the sections with a proposed {attribute} are not those named")

    # Pipelines: confirmed links only.
    def pipelines(fid: str) -> set[str]:
        return {
            link["to_feature_id"]
            for link in world["links"]
            if link["relation"] == "part_of"
            and link["status"] == "confirmed"
            and link["from_feature_id"] == fid
        }

    placed = [f for f in sections if pipelines(f)]
    count = re.search(r"^(\d+) of the \d+ sections are in a pipeline", text)
    if count and int(count.group(1)) != len(placed):
        wrong(f"{len(placed)} of them are in a pipeline, not {count.group(1)}")
    outside = re.search(r"Not in a pipeline: (.+?)\.", text)
    if outside and set(named(outside.group(1))) != set(sections) - set(placed):
        wrong("the sections in no pipeline are not those named")
    if (
        re.search(r"^(?:Neither .+ nor .+ is|None of the \d+ sections is) in a pipeline", text)
        and placed
    ):
        wrong("one of them is in a pipeline")
    if re.search(r"are both in |^All \d+ sections are in ", text) and (
        len(placed) != n or len({frozenset(pipelines(f)) for f in sections}) != 1
    ):
        wrong("they are not all in the same pipeline")
    if "not the same pipeline" in text and (
        len(placed) != n or len({frozenset(pipelines(f)) for f in sections}) == 1
    ):
        wrong("they are not in different pipelines")
    one_out = re.search(r"; (.+?) is not in a pipeline\.", text)
    if one_out and (named(one_out.group(1)) != [f for f in sections if f not in placed]):
        wrong("the one said to be in no pipeline is not the only one")

    states_said: list[str] = []
    # States, counted.
    if text.startswith("Of the "):
        for told, state in re.findall(r"(\d+) (?:lie )?in ([A-Z][A-Za-z ]+?)(?:,| and|\.)", text):
            truly = sum(
                state in states_of([[(p[0], p[1]) for p in line] for line in _route(world, f)])
                for f in sections
            )
            if truly != int(told):
                wrong(f"{truly} of them lie in {state}, not {told}")
            states_said.append(state)
    numbers = re.findall(r"\d+(?:,\d{3})*(?:\.\d+)?", text) + re.findall(r"\d+", text)
    return problems, [*numbers, *states_said]


def _network_problems(
    where: str, text: str, features: list[str], world: dict[str, Any]
) -> tuple[list[str], list[str]] | None:
    """A count across the whole network (network.py), made again here from the world's
    features, claims and links: not from the listing the Agent counted. None when the
    sentence is not one."""
    everything = {row["properties"]["section_id"] for row in world["sections"]}

    def placed(fid: str) -> bool:
        return any(
            link["relation"] == "part_of"
            and link["status"] == "confirmed"
            and link["from_feature_id"] == fid
            for link in world["links"]
        )

    whole = re.match(r"The network has (\d+) sections\.", text)
    if whole:
        told = int(whole.group(1))
        wrong = (
            []
            if told == len(everything)
            else [f"{where}: the network has {len(everything)} sections, not {told}"]
        )
        return wrong, [whole.group(1)]
    lines = {
        link["to_feature_id"]: 0
        for link in world["links"]
        if link["relation"] == "part_of" and link["status"] != "rejected"
    }
    for link in world["links"]:
        if link["relation"] == "part_of" and link["status"] == "confirmed":
            lines[link["to_feature_id"]] += 1
    whole = re.match(r"The network has (\d+) pipelines, (\d+) of them only proposed\.", text)
    if whole:
        truly = (len(lines), sum(1 for n in lines.values() if n == 0))
        told = (int(whole.group(1)), int(whole.group(2)))
        wrong = [] if told == truly else [f"{where}: the network has {truly} pipelines, not {told}"]
        return wrong, [whole.group(1), whole.group(2)]
    piped = re.match(r"Pipelines (.+?): (\d+) of the (\d+) in the network\.", text)
    if piped:
        match_lines = set(lines)
        problems = []
        for rule in piped.group(1).split(" and "):
            if lacking := re.fullmatch(r"with no known (name|owner|operator)", rule):
                match_lines = {
                    f
                    for f in match_lines
                    if not any(
                        c["attribute_key"] == lacking.group(1) and c["status"] == "accepted"
                        for c in world["features"][f]["claims"]
                    )
                }
            elif rule == "only proposed, with no section decided yet":
                match_lines = {f for f in match_lines if lines[f] == 0}
            elif rule == "with at least one section decided":
                match_lines = {f for f in match_lines if lines[f] > 0}
            else:
                problems.append(f"{where}: a rule this score cannot count: {rule!r}")
        if int(piped.group(3)) != len(lines):
            problems.append(
                f"{where}: the network has {len(lines)} pipelines, not {piped.group(3)}"
            )
        if int(piped.group(2)) != len(match_lines):
            problems.append(f"{where}: {len(match_lines)} pipelines match, not {piped.group(2)}")
        for fid in features:
            if fid in lines and fid not in match_lines:
                problems.append(f"{where}: a pipeline named does not match the rule")
        return problems, [piped.group(2), piped.group(3), "10"]
    said = re.match(r"Sections (.+?): (\d+) of the (\d+) in the network\.", text)
    if not said:
        return None
    rules, count, total = said.group(1), int(said.group(2)), int(said.group(3))
    problems: list[str] = []
    allowed = [said.group(2), said.group(3), "10"]
    match = set(everything)
    known = 0
    for rule in rules.split(" and "):
        if lacking := re.fullmatch(r"with no known (name|owner|operator|diameter)", rule):
            match = {f for f in match if not _held(world, f, lacking.group(1))}
        elif year := re.fullmatch(r"first shown on the (\d{4}) map", rule):
            allowed.append(year.group(1))
            match = {
                f
                for f in match
                if min(
                    (y for g in scope(world["links"], f) if (y := _shown_from(world, g))),
                    default=None,
                )
                == int(year.group(1))
            }
        elif rule in ("in a pipeline", "in no pipeline"):
            match = {f for f in match if placed(f) == (rule == "in a pipeline")}
        elif rule == "with a proposal waiting for a decision":
            match = {
                f
                for f in match
                if any(
                    c["status"] == "candidate"
                    for g in scope(world["links"], f)
                    for c in world["features"][g]["claims"]
                )
            }
        elif inches := re.fullmatch(r"with a diameter of ([\d.]+ in)", rule):
            allowed += re.findall(r"[\d.]+", inches.group(1))
            match = {
                f
                for f in match
                if any(
                    c["attribute_key"] == "diameter"
                    and c["status"] == "accepted"
                    and c.get("value_num") is not None
                    and f"{c['value_num']:g} {c.get('value_unit')}" == inches.group(1)
                    for g in scope(world["links"], f)
                    for c in world["features"][g]["claims"]
                )
            }
        elif rule in ("with an end proposed, not decided yet", "no longer shown on a later map"):
            wanted = "proposed" if rule.startswith("with an end") else "confirmed"
            ended = {
                row["properties"]["section_id"]
                for row in world["sections"]
                if row["properties"].get("end_status") == wanted
            }
            match &= ended
        elif size := re.fullmatch(r"(longer|shorter) than ([\d.]+) km as drawn", rule):
            allowed.append(size.group(2))
            limit = float(size.group(2))
            match = {
                f
                for f in match
                if (km := _metres(_route(world, f)) / 1_000) > 0
                and ((km > limit) if size.group(1) == "longer" else (km < limit))
            }
        elif state := re.fullmatch(r"in ([A-Z][A-Za-z ]+)", rule):
            allowed.append(state.group(1))
            match = {
                f
                for f in match
                if state.group(1)
                in states_of([[(p[0], p[1]) for p in line] for line in _route(world, f)])
            }
        else:
            problems.append(f"{where}: a rule this score cannot count: {rule!r}")
            continue
        known += 1
    if total != len(everything):
        problems.append(f"{where}: the network has {len(everything)} sections, not {total}")
    if known and count != len(match):
        problems.append(f"{where}: {len(match)} sections match, not {count}")
    for fid in features:
        if fid in everything and fid not in match:
            problems.append(f"{where}: a section named does not match the rule")
    return problems, allowed


def _worked_out_problems(
    where: str, text: str, refs: list[dict[str, Any]], world: dict[str, Any]
) -> tuple[list[str], list[str]]:
    """Every year a worked-out sentence names, worked out again here from the world. The
    years it may name, and what is wrong."""
    problems: list[str] = []
    allowed: list[str] = []
    claims, links = _claims(world), {link["id"]: link for link in world["links"]}
    for ref in refs:
        if ref["type"] == "claim" and ref["id"] in claims:
            fid = claims[ref["id"]]["feature_id"]
            first = _shown_from(world, fid)
            before = [y for y in _printings(world) if first and y < first]
            said = re.search(r"first shown on the (\d{4}) map", text)
            if said and int(said.group(1)) != first:
                problems.append(f"{where}: first shown in {first}, not {said.group(1)}")
            said = re.search(r"The (\d{4}) map is the first to show it", text)
            if said and int(said.group(1)) != first:
                problems.append(f"{where}: first shown in {first}, not {said.group(1)}")
            said = re.search(r"not shown on the earlier (\d{4}) map", text)
            if said and (not before or int(said.group(1)) != before[-1]):
                problems.append(f"{where}: the printing before is not {said.group(1)}")
            if first:
                allowed += [str(first), *(str(y) for y in before[-1:])]
        if ref["type"] == "link" and ref["id"] in links:
            gone = _gone_on(world, links[ref["id"]]["from_feature_id"])
            if gone:
                allowed.append(str(gone))
    features = [r["id"] for r in refs if r["type"] == "feature" and r["id"] in world["features"]]
    across = _network_problems(where, text, features, world)
    if across is not None:
        return across
    has = re.search(r" has (?:(\d+) sections?: |no sections yet\.)", text)
    lines_named = [f for f in features if world["features"][f].get("kind") == "line"]
    if has and lines_named:
        # A pipeline's sections, counted again here from the confirmed links to it.
        truly = {
            link["from_feature_id"]
            for link in world["links"]
            if link["relation"] == "part_of"
            and link["status"] == "confirmed"
            and link["to_feature_id"] == lines_named[0]
        }
        told = int(has.group(1) or 0)
        if told != len(truly):
            problems.append(f"{where}: the pipeline has {len(truly)} sections, not {told}")
        listed = text.split(" It is proposed")[0]
        for fid in truly:
            if feature_name(world["features"][fid]) not in listed:
                problems.append(f"{where}: a section of the pipeline is not named")
        for fid in set(features) - truly - set(lines_named):
            if feature_name(world["features"][fid]) in listed:
                problems.append(f"{where}: a section named is not in the pipeline")
        return problems, [str(told)]
    together = _together_problems(where, text, features, world)
    if together is not None:
        return together
    if "is drawn touching" in text and len(features) == 2 and not _touch(world, *features):
        problems.append(f"{where}: the two lines are not drawn touching")
    said = _NEARBY.search(text)
    if said and len(features) >= 2:
        # A distance is measured again here, from the two lines, and allowed when close.
        km = _gap_km(world, features[0], features[1])
        if said.group(1):
            told = int(said.group(1).replace(",", ""))
            if abs(told - km) > max(2.0, 0.1 * km):
                problems.append(f"{where}: about {km:.0f} km apart, not {told}")
            allowed += [said.group(1), said.group(1).replace(",", "")]
        elif km > 1.5:
            problems.append(f"{where}: about {km:.0f} km apart, not within 1 km")
        else:
            allowed.append("1")
    allowed += _place_problems(where, text, features, refs, world, problems)
    if "no other section is drawn touching" in text and features:
        me = features[0]
        drawn = (
            {row["properties"]["section_id"] for row in world["sections"]}
            - _same_pipe(world, me)
            - {me}
        )
        if any(_touch(world, me, other) for other in drawn):
            problems.append(f"{where}: a section is drawn touching it")
    return problems, allowed


# cite's fixed lines, with their slots as "anything": they are code's, not the model's.
_CITE_LINES = [
    re.compile("^" + re.sub(r"\\\{\w+\\\}", ".+", re.escape(line)) + "$", re.DOTALL)
    for line in CITE_LINES.values()
]
CITE_KINDS = ("finding", "searched", "ask_places", "proposed")


def _cite_line(text: str) -> bool:
    return any(p.match(text) for p in _CITE_LINES)


def _cite_problems(
    where: str,
    statement: dict[str, Any],
    cite_results: list[dict[str, Any]],
    words: str,
    world: dict[str, Any],
) -> list[str]:
    """A statement about a search, re-checked against what the fake cite gave: a finding
    is a claim cite verified with its own page's words, and every number or name said
    about a search is in cite's results or the person's words."""
    problems = []
    kind, text = statement["kind"], statement["text"]
    names = [
        feature_name(world["features"][r["id"]])
        for r in statement.get("refs", [])
        if r["type"] == "feature" and r["id"] in world["features"]
    ]
    source = " ".join([json.dumps(cite_results, ensure_ascii=False), words, *names])
    if kind == "finding":
        f = statement.get("finding") or {}
        pages = [c for r in cite_results for c in r.get("citations", [])]
        page = next((c for c in pages if c["page_text"] == f.get("quote")), None)
        values = {
            c["value"]
            for r in cite_results
            for c in r.get("claims", [])
            if page and page["id"] in c["citation_ids"]
        }
        if page is None:
            problems.append(f"{where}: the passage is on no page cite read")
        elif f.get("value") not in values:
            problems.append(f"{where}: cite did not find {f.get('value')!r} on that page")
        held = f.get("in_store")
        lead = (
            f"Found, already in store as {IN_STORE_WORDS[held]}:"
            if held
            else (IN_DOUBT if f.get("flags") else FOUND) + ":"
        )
        if not text.startswith(lead):
            problems.append(f"{where}: a finding does not say whether it is in store")
        if not held and bool(f.get("flags")) != text.startswith(IN_DOUBT):
            problems.append(f"{where}: a finding in doubt must say so, and only then")
        return problems
    if kind == "ask_places":
        return [] if text == CITE_LINES["ask_places"] else [f"{where}: not code's line"]
    plain = _QUOTED.sub("", text)
    for number in re.findall(r"\d+(?:\.\d+)?", plain):
        if number not in source:
            problems.append(f"{where}: the number {number} is in no search result")
    for word in re.findall(r"(?<![.!?:] )(?<!^)\b[A-Z][A-Za-z]+", plain):
        if word not in VOCABULARY and word not in source and word not in ("Found",):
            problems.append(f"{where}: the name {word!r} is in no search result")
    return problems


def _slots(line: str) -> str:
    return re.sub(r"\\\{\w+\\\}", ".+", re.escape(line))


# A change asked for in words: code's lines, and the offer re-checked against the world.
_CHANGE_LINES = [
    re.compile("^" + _slots(line) + "$")
    for line in [*change_flow.LINES.values(), *change_flow.OUTCOME_LINES.values()]
] + [
    re.compile(r"^That card is no longer in this chat\. Ask again\.$"),
    re.compile(r"^.+ is already in .+\.$"),
    re.compile(r"^These \d+ sections are already in .+\.$"),
    re.compile(r"^(?:Diameter|Owner|Operator|Name) .*: .+ Nothing was offered\.$"),
]


def _change_line(text: str) -> bool:
    return any(p.match(text) for p in _CHANGE_LINES)


def _placed_in(world: dict[str, Any], section_id: str) -> str | None:
    return next(
        (
            link["to_feature_id"]
            for link in world["links"]
            if link["from_feature_id"] == section_id
            and link["relation"] == "part_of"
            and link["status"] == "confirmed"
        ),
        None,
    )


def _change_problems(where: str, statement: dict[str, Any], world: dict[str, Any]) -> list[str]:
    """A change offer, re-checked against the world: every section and pipeline it names
    is in store as one, what it says a section is in now is true, its count is the
    sections it changes, it changes something, and a typed value keeps the rules."""
    offer = statement.get("change") or {}
    features = world["features"]
    kind, ids = offer.get("kind"), offer.get("section_ids") or []
    problems = []
    for sid in [*ids, *(offer.get("left_out") or [])]:
        if features.get(sid, {}).get("kind") != "section":
            problems.append(f"{where}: section {sid} is not in store")
    to = offer.get("pipeline_id")
    if to and features.get(to, {}).get("kind") != "line":
        problems.append(f"{where}: pipeline {to} is not in store")
    for basis in offer.get("basis") or []:
        if basis.get("pipeline_id") != _placed_in(world, basis["section_id"]):
            problems.append(f"{where}: says wrongly which pipeline {basis['section_id']} is in")
    count = re.match(r"^\w+ (?:a pipeline of |the \w+ of )?(\d+) sections", statement["text"])
    if count and int(count.group(1)) != len(ids):
        problems.append(f"{where}: says {count.group(1)} sections and changes {len(ids)}")
    if kind in ("add", "move", "remove", "make") and not ids:
        problems.append(f"{where}: changes no section")
    if kind in ("add", "move") and any(_placed_in(world, sid) == to for sid in ids):
        problems.append(f"{where}: adds a section already in the pipeline")
    if kind == "remove" and any(_placed_in(world, sid) is None for sid in ids):
        problems.append(f"{where}: removes a section that is in no pipeline")
    if kind == "edit":
        try:
            value_rules.read_typed(offer.get("attribute") or "", offer.get("value") or "")
        except value_rules.RuleError as error:
            problems.append(f"{where}: the value breaks the rules: {error}")
    if statement.get("refs"):
        problems.append(f"{where}: an offer carries a reference")
    return problems


def ungrounded(
    answer: dict[str, Any],
    world: dict[str, Any],
    question: str = "",
    cite_results: list[dict[str, Any]] | None = None,
) -> list[str]:
    """Every way the answer says something the world does not back. Empty means grounded.
    A statement about a search is checked against what cite gave in the run instead."""
    problems: list[str] = []
    claims, links = _claims(world), {link["id"]: link for link in world["links"]}
    for n, statement in enumerate(answer.get("statements", [])):
        kind, text, refs = statement["kind"], statement["text"], statement.get("refs", [])
        where = f"statement {n + 1} ({kind})"
        if kind == "search_offer":
            offer = statement.get("search") or {}
            if world["features"].get(offer.get("section_id"), {}).get("kind") != "section":
                problems.append(f"{where}: section {offer.get('section_id')} is not in store")
            if not re.match(r"^Search the journals for the .+$", text):
                problems.append(f"{where}: not code's line")
            continue
        if kind == "change_offer":
            problems += _change_problems(where, statement, world)
            continue
        if kind in ("refusal", "changed") and _change_line(text):
            if refs:
                problems.append(f"{where}: a fixed line carries a reference")
            continue
        about_search = kind in CITE_KINDS or (
            kind == "worked_out" and text.startswith("The sources disagree")
        )
        if about_search:
            problems += _cite_problems(where, statement, cite_results or [], question, world)
            if kind != "proposed":
                continue
        if kind in ("refusal", "failure", "citation_request") and _cite_line(text):
            continue
        if kind in ("refusal", "failure", "greeting", "clarify", "not_yet", "help"):
            if text not in FIXED_LINES.values():
                problems.append(f"{where}: not a fixed line")
            if refs:
                problems.append(f"{where}: a fixed line carries a reference")
            continue

        backing = []
        for ref in refs:
            if ref["type"] == "claim":
                claim = claims.get(ref["id"])
                if claim is None:
                    problems.append(f"{where}: claim {ref['id']} is not in store")
                    continue
                if ref.get("status") != claim["status"]:
                    problems.append(
                        f"{where}: the claim is {claim['status']}, not {ref.get('status')}"
                    )
                backing.append(claim)
            elif ref["type"] == "link":
                if ref["id"] not in links:
                    problems.append(f"{where}: link {ref['id']} is not in store")
            elif ref["type"] == "feature":
                if ref["id"] not in world["features"]:
                    problems.append(f"{where}: feature {ref['id']} is not in store")
            else:
                problems.append(f"{where}: a {ref['type']} reference cannot be checked yet")

        if kind == "unknown":
            features = [r["id"] for r in refs if r["type"] == "feature"]
            attribute = statement.get("attribute")
            if not features or not attribute:
                problems.append(f"{where}: does not name the feature and attribute it checked")
            for fid in features:
                if fid in world["features"] and attribute and _held(world, fid, attribute):
                    problems.append(f"{where}: store does hold an accepted {attribute}")
        elif kind in ("worked_out", "lead"):
            counted = _network_problems(where, text, [], world)
            if counted is not None:
                # A count across the network names no section when none match, or
                # when it only counts: checked by counting again.
                problems += counted[0]
                if not refs:
                    continue
            if not refs:
                problems.append(f"{where}: worked out from nothing")
        elif kind == "citation_request":
            # Code's sentence about what it would ask for: it names the feature, no claim.
            if not [r for r in refs if r["type"] == "feature"]:
                problems.append(f"{where}: a citation request names no feature")
        elif not backing and not [r for r in refs if r["type"] == "link"]:
            problems.append(f"{where}: rests on no claim or link")

        # Every number, quotation and name in the sentence must come from what it cites.
        # A thing is named as Studio names it: its name, or "section" and its short id.
        named = {r["id"] for r in refs if r["type"] == "feature"} | {
            c["feature_id"] for c in backing
        }
        # A link names what it links.
        named |= {
            end
            for r in refs
            if r["type"] == "link" and r["id"] in links
            for end in (links[r["id"]]["from_feature_id"], links[r["id"]]["to_feature_id"])
        }
        # A claim on a trace merged into a section is said of that section.
        held = {c["feature_id"] for c in backing}
        named |= {f for f in world["features"] if held & set(scope(world["links"], f)) - {f}}
        names = [feature_name(world["features"][f]) for f in named if f in world["features"]]
        worked: list[str] = []
        if kind in ("worked_out", "lead"):
            wrong, worked = _worked_out_problems(where, text, refs, world)
            problems += wrong
        if kind == "lead":
            problems += _lead_problems(where, text, refs, world)
        # A search's years come from the person, or lie between printings store knows of.
        known = _printings(world)
        printings = (
            [str(y) for y in range(known[0], known[-1] + 1)]
            if kind == "citation_request" and known
            else []
        )
        # A search may name the towns near the line it searches by (places.py).
        towns = _towns_near(world, named) if kind == "citation_request" else []
        source = " ".join(
            [json.dumps(backing, ensure_ascii=False), question, *names, *worked, *printings, *towns]
        )
        for number in re.findall(r"\d+(?:\.\d+)?", text):
            if number not in re.findall(r"\d+(?:\.\d+)?", source):
                problems.append(f"{where}: the number {number} is in no cited claim")
        for quoted in _QUOTED.findall(text):
            if quoted not in source.replace('\\"', '"'):
                problems.append(f"{where}: the quotation is in no cited claim: {quoted[:60]!r}")
        if _UUID.search(text):
            problems.append(f"{where}: an id is written in the text")
        plain = _QUOTED.sub("", text)
        for word in re.findall(r"(?<![.!?:] )(?<!^)\b[A-Z][A-Za-z]+", plain):
            if word not in VOCABULARY and word not in source:
                problems.append(f"{where}: the name {word!r} is in no cited claim")
    return problems
