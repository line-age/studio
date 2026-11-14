"""The grounding check: is every statement of a rendered answer backed by what store
returned in this run? Code, not the prompt. An answer that fails is not shown.

The ledger is the tool results of this run, recorded when the tools ran: never messages,
summaries or files from an earlier turn.

What it can and cannot see. Values, dates, quotations, sources and ids reach an answer
only through slots that code fills, and statuses must be said. The model's own words
between slots are checked for numbers, quotations, ids, names, capitals and number
words. A plain lowercase phrase ("it was abandoned") is not caught here; that is what
the evals for background and memory (B5) are for.
"""

import re
from typing import Any

from render import FIXED_LINES, SLOT, Read, holder, writes_itself
from schemas import Answer, Draft

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
_QUOTE = re.compile(r"[\"“”‘’]|''")
_CAPITALISED = re.compile(r"\b[A-Z][A-Za-z]*\b")
_NUMBER_WORDS = re.compile(
    r"\b(three|four|five|six|seven|eight|nine|ten|eleven|twelve|\w+teen|twenty|thirty|"
    r"forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b",
    re.IGNORECASE,
)
# The only capitalised words the model may write itself, anywhere in a sentence.
VOCABULARY = {
    "Store",
    "Studio",
    "Agent",
    "Unknown",
    "I",
    "A",
    "An",
    "The",
    "This",
    "That",
    "These",
    "Those",
    "It",
    "Its",
    "They",
    "Their",
    "One",
    "Two",
    "Both",
    "Each",
    "Another",
    "Neither",
    "No",
    "Nobody",
    "Someone",
    "Yes",
    "There",
    "Here",
    "And",
    "But",
    "Also",
    "Only",
    "So",
    "Of",
    "For",
    "In",
    "On",
    "From",
    "By",
    "With",
    "As",
    "According",
    "Earlier",
    "Later",
    "However",
    "Owner",
    "Operator",
    "Diameter",
    "Name",
    "Status",
    "Route",
    "Pipeline",
    "Section",
    "Source",
    "What",
    "Who",
    "When",
}
# Words that name an attribute in a sentence, and the attribute they name.
ATTRIBUTE_WORDS = {
    "owner": re.compile(r"\bown(s|ed|er|ers|ership)?\b", re.IGNORECASE),
    "operator": re.compile(r"\boperat(es|ed|or|ors|ion)\b", re.IGNORECASE),
    "diameter": re.compile(r"\bdiameter\b", re.IGNORECASE),
    "name": re.compile(r"\b(called|named|name)\b", re.IGNORECASE),
}
FIXED = ("refusal", "failure", "greeting", "clarify")


# Words that turn a clue into a claim: two traced lines meeting do not prove the pipes
# joined, and when a map shows a line is never when it was built.
_NEVER_SAID = re.compile(r"\b(connected|connects|connecting|joined|joins|built)\b", re.IGNORECASE)


def own_words_problems(draft: Draft) -> list[str]:
    """What the model wrote outside slots: no digit, quotation, id, name or number word."""
    problems = []
    for n, statement in enumerate(draft.statements, 1):
        if statement.kind in (*FIXED, "unknown", "citation_request", "worked_out", "lead") or (
            writes_itself(statement)
        ):
            continue  # code writes the whole sentence
        own = SLOT.sub(" ", statement.text)
        for word in _NEVER_SAID.findall(own):
            problems.append(
                f"statement {n}: {word.lower()!r} in your own words; lines drawn touching do "
                "not prove pipes joined, and a map date is never a build date"
            )
        if re.search(r"\d", own):
            problems.append(f"statement {n}: a number in your own words; use a slot")
        if _NUMBER_WORDS.search(own):
            problems.append(f"statement {n}: a number in words; use a slot")
        if _QUOTE.search(own):
            problems.append(f"statement {n}: a quotation in your own words; use {{c1.quote}}")
        if _UUID.search(own):
            problems.append(f"statement {n}: an id written in the text; put it in refs")
        names = [w for w in _CAPITALISED.findall(own) if w not in VOCABULARY]
        if names:
            problems.append(
                f"statement {n}: a name or capitalised word in your own words "
                f"({', '.join(dict.fromkeys(names))}); a name enters only through a slot"
            )
    return problems


def _slots(text: str) -> list[tuple[str, str]]:
    return [(m.group(1), m.group(2)) for m in SLOT.finditer(text)]


def fact_problems(draft: Draft, read: Read) -> list[str]:
    """A fact says what its claims hold: a value through a slot, every claim it names
    used, its status said, and no other attribute named in its words."""
    problems = []
    for n, statement in enumerate(draft.statements, 1):
        if statement.kind != "fact" or writes_itself(statement):
            continue
        slots = _slots(statement.text)
        claims = {r.key: read.claims.get(r.id) for r in statement.refs if r.type == "claim"}
        around = [
            key
            for key, claim in claims.items()
            if claim
            and holder(claim["feature_id"], read) in read.context_only
            # A pipeline's own claims are reported as the pipeline's: allowed.
            and read.features[holder(claim["feature_id"], read)].get("kind") != "line"
        ]
        if around:
            problems.append(
                f"statement {n}: {', '.join(around)} is a claim of a section around it, not "
                "of this one; leave the text empty so code says whose it is, or use a lead"
            )
        # A fact says what a claim holds ({c1.value}) or what it rests on ({c1.source},
        # {c1.quote}): both are filled from store.
        if not any(field in ("value", "source", "quote") for _, field in slots):
            problems.append(
                f"statement {n}: a fact states a value through {{c1.value}}, or its source "
                "through {c1.source}"
            )
        used = {key for key, _ in slots}
        for key in claims:
            if key not in used:
                problems.append(f"statement {n}: {key} is in refs but no slot uses it")
        own = SLOT.sub(" ", statement.text).lower()
        for key, claim in claims.items():
            if claim is None:
                continue
            said = (key, "status") in slots
            if claim["status"] == "candidate" and not (said or "propos" in own):
                problems.append(
                    f"statement {n}: {key} is a proposal; say so, or use {{{key}.status}}"
                )
            if claim["status"] == "rejected" and not (said or "reject" in own):
                problems.append(
                    f"statement {n}: {key} was rejected; say so, or use {{{key}.status}}"
                )
        attributes = {c["attribute_key"] for c in claims.values() if c}
        for attribute, words in ATTRIBUTE_WORDS.items():
            if words.search(own) and attributes and attribute not in attributes:
                problems.append(
                    f"statement {n}: the words speak of the {attribute}, but no claim in "
                    f"refs is about the {attribute}"
                )
    return problems


def _related(read: Read, feature_id: str, attribute: str) -> list[str]:
    """Every claim read in this run that bears on whether `feature_id` has `attribute`:
    its own and its merged traces' of any status, and its pipeline's, if read."""
    pipelines = [
        link["to_feature_id"]
        for link in read.links.values()
        if link["from_feature_id"] == feature_id
        and link["relation"] == "part_of"
        and link["status"] == "confirmed"
    ]
    holders = (feature_id, *read.scope.get(feature_id, []), *pipelines)
    return [
        cid
        for cid, claim in read.claims.items()
        if claim["feature_id"] in holders and claim["attribute_key"] == attribute
    ]


def answer_problems(answer: Answer, read: Read) -> list[str]:
    """What the rendered answer says that this run's reads do not back."""
    problems = []
    fixed = [s for s in answer.statements if s.kind in FIXED]
    if fixed and len(answer.statements) > 1:
        problems.append(
            f"a {fixed[0].kind} statement must be the whole answer; leave it out or answer "
            "with it alone"
        )
    cited = {r.id for s in answer.statements for r in s.refs if r.type == "claim"}
    for n, statement in enumerate(answer.statements, 1):
        kind, refs = statement.kind, statement.refs
        if kind in FIXED:
            if statement.text not in FIXED_LINES.values() or refs:
                problems.append(f"statement {n}: a fixed line was changed")
            continue
        for ref in refs:
            if ref.type == "claim":
                claim = read.claims.get(ref.id)
                if claim is None or claim["status"] != ref.status:
                    problems.append(f"statement {n}: claim {ref.id} was not read in this run")
            elif ref.type == "feature" and ref.id not in read.features:
                problems.append(f"statement {n}: feature {ref.id} was not read in this run")
        if kind == "citation_request":
            features = [r.id for r in refs if r.type == "feature"]
            if not features or features[0] not in read.features or not statement.request:
                problems.append(f"statement {n}: a citation request names a feature you read")
            elif read.features[features[0]].get("kind") not in ("section", "line"):
                problems.append(f"statement {n}: citations are asked for a section or a pipeline")
            elif read.accepted(features[0], statement.attribute or ""):
                # R14: never ask for what is already claimed.
                problems.append(
                    f"statement {n}: store already holds an accepted {statement.attribute} "
                    "there; do not ask for it, say what store holds instead"
                )
        if kind == "fact" and not any(r.type in ("claim", "link") for r in refs):
            problems.append(f"statement {n}: a fact must name the claim it rests on")
        if kind == "unknown":
            features = [r.id for r in refs if r.type == "feature"]
            if not features or not statement.attribute:
                problems.append(
                    f"statement {n}: an unknown names the feature it read and the attribute"
                )
            for fid in features:
                attribute = statement.attribute or ""
                held = read.accepted(fid, attribute)
                if held:
                    problems.append(
                        f"statement {n}: store does hold an accepted {attribute} for this "
                        f"feature (claim {held[0]})"
                    )
                left_out = [c for c in _related(read, fid, attribute) if c not in cited]
                if left_out and not held:
                    problems.append(
                        f"statement {n}: you read {len(left_out)} other {attribute} claim(s) "
                        "(a proposal, a rejected value or the pipeline's); add a fact for each"
                    )
    return problems


def worked_out_problems(draft: Draft, answer: Answer, read: Read) -> list[str]:
    """A worked-out fact or a lead says exactly what its own handle holds, nothing else."""
    problems = []
    for n, (wrote, shown) in enumerate(zip(draft.statements, answer.statements, strict=False), 1):
        if wrote.kind not in ("worked_out", "lead"):
            continue
        pool = read.worked if wrote.kind == "worked_out" else read.leads
        handles = [r.id.strip().upper() for r in wrote.refs if r.type == wrote.kind]
        item = pool.get(handles[0]) if len(handles) == 1 else None
        if item is None or shown.text != item["text"]:
            what = "a worked-out fact" if wrote.kind == "worked_out" else "a lead"
            problems.append(f"statement {n}: {what} is its handle's sentence, unchanged")
    return problems


def problems_of(draft: Draft, answer: Answer, read: Read) -> list[str]:
    return (
        own_words_problems(draft)
        + fact_problems(draft, read)
        + answer_problems(answer, read)
        + worked_out_problems(draft, answer, read)
    )


def reads_from(artifacts: list[dict[str, Any]]) -> Read:
    read = Read()
    for artifact in artifacts:
        for feature in artifact.get("features", []):
            read.feature(feature)
            read.context_only.discard(feature["id"])  # read in its own right
        # Read for context: known, but never counted as the section's own.
        for feature in artifact.get("context_features", []):
            if feature["id"] not in read.features:
                read.feature(feature)
                read.context_only.add(feature["id"])
        for item in artifact.get("worked_out", []):
            read.worked[item["handle"]] = item
        for item in artifact.get("leads", []):
            read.leads[item["handle"]] = item
        merged = artifact.get("features", [])[1:]
        if merged:
            read.merge(artifact["features"][0]["id"], [m["id"] for m in merged])
    return read
