"""The section pack: everything code can say about one section from store, as one object.

The chat answers from what read_context gathers; the pack is the same thing kept whole,
so cite can take it as its brief (contract/section-pack.schema.json). Its fields follow
cite's input: ids, line type (the network), name, states, place names, observations.
States and places stay empty until place data comes in (owner, 2026-11-14).
"""

from typing import Any

import geometry
from context import route_lines
from render import feature_name, period_words, source_line, value_words
from schemas import Lead, Neighbour, PackClaim, PackLink, SectionPack, WorkedOut

_NO_WORDS = ("route",)


def pack_claims(feature: dict[str, Any], handle_of: Any) -> list[PackClaim]:
    """A feature's claims as code words them, with the handles the model saw."""
    out = []
    for claim in feature.get("claims") or []:
        if claim["attribute_key"] in _NO_WORDS:
            continue
        source = source_line([claim])
        out.append(
            PackClaim(
                handle=handle_of(claim["id"]),
                id=claim["id"],
                attribute=claim["attribute_key"],
                value=value_words(claim),
                period=period_words(claim),
                status=claim["status"],
                source=None if source.startswith("Store holds no source") else source,
            )
        )
    return out


def build_pack(
    feature: dict[str, Any],
    merged: list[dict[str, Any]],
    ends: dict[str, dict[str, Any]],
    lines: list[dict[str, Any]],
    found: list[tuple[dict[str, Any], geometry.Meets, float]],
    worked: list[WorkedOut],
    leads: list[Lead],
    handle_of: Any,
) -> SectionPack:
    route = route_lines(feature)
    endpoints = [route[0][0], route[-1][-1]] if route else []
    links = []
    for link in feature.get("links") or []:
        other_id = (
            link["to_feature_id"]
            if link["from_feature_id"] == feature["id"]
            else link["from_feature_id"]
        )
        other = ends.get(other_id)
        links.append(
            PackLink(
                id=link["id"],
                relation=link["relation"],
                status=link["status"],
                other_id=other_id,
                other=feature_name(other) if other else f"feature {other_id[:8]}",
                score=link.get("score"),
            )
        )
    return SectionPack(
        section_id=feature["id"],
        network=feature.get("network"),
        name=feature.get("label"),
        endpoints=[(round(x, 6), round(y, 6)) for x, y in endpoints],
        claims=[c for f in (feature, *merged) for c in pack_claims(f, handle_of)],
        pipeline_id=lines[0]["id"] if lines else None,
        pipeline_claims=pack_claims(lines[0], handle_of) if lines else [],
        links=links,
        neighbours=[
            Neighbour(
                section_id=other["id"],
                name=feature_name(other),
                meets=meets,
                gap_m=gap,
                claims=pack_claims(other, handle_of),
            )
            for other, meets, gap in found
        ],
        worked_out=worked,
        leads=leads,
    )


def brief(pack: SectionPack) -> str:
    """The pack as a person or cite reads it: what store holds, what code worked out,
    and where to look. Every line comes from the pack."""
    name = pack.name or f"section {pack.section_id[:8]}"
    out = [f"Section: {name} ({pack.section_id})", f"Network: {pack.network or 'Unknown'}"]
    if pack.endpoints:
        (x1, y1), (x2, y2) = pack.endpoints[0], pack.endpoints[-1]
        out.append(f"Ends: {y1:.4f}, {x1:.4f} and {y2:.4f}, {x2:.4f} (latitude, longitude)")
    out.append("States and places: Unknown (no place data yet)")
    out.append("What store holds:")
    out += [f"  {c.attribute}: {c.value}, {c.period}, {c.status}" for c in pack.claims] or [
        "  nothing but its traced line"
    ]
    if pack.pipeline_claims:
        out.append("Its pipeline's own claims (the pipeline's, not the section's):")
        out += [f"  {c.attribute}: {c.value}, {c.period}" for c in pack.pipeline_claims]
    out.append("Worked out (not claims):")
    out += [f"  {w.text}" for w in pack.worked_out]
    out.append("Leads (not in store; where to look):")
    out += [f"  [{lead.rule}] {lead.text}" for lead in pack.leads] or ["  none"]
    return "\n".join(out)
