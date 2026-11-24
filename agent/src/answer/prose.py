"""An answer the model writes in its own words, checked against what was read.

The model is free in how it says a thing. It is not free in what it says: every number,
name, code and quotation in its text must be found in what the tools returned in this
turn (claims with their values, dates and sources, and what code worked out), or in the
person's own question. Words that turn a clue into a fact stay refused, and so do the
system's own words. What was only proposed must be said as proposed.

This replaces "code writes every sentence": the tools hold the facts, the model does the
telling, and this check is what keeps the telling true.
"""

import re
from typing import Any

from src.answer.render import Read, feature_name, period_words, source_of, value_words

# Words that open a sentence or are ordinary capitalised words: never a name to check.
# Capitalised wherever they stand, and never a name to check.
_ALWAYS = frozenset(
    [
        "i",
        "studio",
        "agent",
        "edit",
        "unknown",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
    ]
)
# Ordinary words that may open a sentence, a line or a label.
_COMMON = frozenset(
    [
        "a",
        "an",
        "and",
        "all",
        "also",
        "although",
        "another",
        "any",
        "as",
        "at",
        "because",
        "both",
        "but",
        "by",
        "each",
        "either",
        "every",
        "first",
        "for",
        "from",
        "here",
        "how",
        "however",
        "if",
        "in",
        "it",
        "its",
        "later",
        "many",
        "most",
        "much",
        "neither",
        "no",
        "nobody",
        "none",
        "not",
        "nothing",
        "of",
        "on",
        "one",
        "only",
        "or",
        "other",
        "others",
        "per",
        "since",
        "so",
        "some",
        "that",
        "the",
        "their",
        "then",
        "there",
        "these",
        "they",
        "this",
        "those",
        "to",
        "today",
        "together",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "what",
        "when",
        "where",
        "which",
        "while",
        "who",
        "whose",
        "why",
        "with",
        "yes",
        "you",
        "known",
        "proposed",
        "different",
        "same",
        "section",
        "sections",
        "pipeline",
        "pipelines",
        "source",
        "sources",
        "map",
        "maps",
        "line",
        "lines",
        "town",
        "towns",
        "length",
        "look",
        "according",
        "along",
        "among",
        "between",
        "near",
        "about",
        "across",
    ]
)
_NUMBER_WORDS = {
    w: str(n)
    for n, w in enumerate(
        [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
            "twenty",
        ]
    )
}
_NEVER = re.compile(
    r"\b(connected|connects|connecting|joined|joins|built|constructed|completed|laid|"
    r"serves|served|supplies|supplied|older|oldest|newer|opened|dates from)\b",
    re.IGNORECASE,
)
_INTERNAL = re.compile(
    r"\b(store|stored|printing|printings|candidate|candidates|handle|part_of|same_as|"
    r"read_context|read_feature|sections_together|pipeline_sections|find_sections|"
    r"find_pipelines|find_nearby|traced as gone)\b",
    re.IGNORECASE,
)
_LACKS = re.compile(
    r"\bno (?:known |recorded |accepted )?(name|owner|operator|diameter)\b|"
    r"\b(name|owner|operator|diameter)(?: is| are)? (?:not known|unknown|not recorded)\b",
    re.IGNORECASE,
)


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}


def material(read: Read) -> str:
    """Everything the tools returned this turn, as text: where a value may come from."""
    parts: list[str] = [read.words]
    for feature in read.features.values():
        parts.append(feature_name(feature))
    for claim in read.claims.values():
        for words in (value_words, period_words, source_of):
            try:
                said = words(claim)
            except Exception:  # noqa: BLE001 - a claim with no words adds none
                said = None
            if said:
                parts.append(str(said))
        for citation in claim.get("citations") or []:
            parts += [str(citation.get(k) or "") for k in ("locator", "quote", "source_title")]
    for item in (*read.worked.values(), *read.leads.values()):
        parts.append(item["text"])
        parts += list((item.get("values") or {}).values())
    return "\n".join(parts)


def _value(claim: dict[str, Any]) -> str | None:
    try:
        return value_words(claim)
    except Exception:  # noqa: BLE001 - a claim with no value in words states none
        return None


def _claims_said(text: str, read: Read) -> list[dict[str, Any]]:
    """The claims whose value the text states: what the answer rests on."""
    said = []
    for claim in read.claims.values():
        if claim["attribute_key"] == "route":
            continue
        value = _value(claim)
        if value and value.rstrip(".") in text:
            said.append(claim)
    return said


def problems(text: str, read: Read, n: int = 1) -> list[str]:
    """What an answer in the model's own words says that was not read, or says in a way
    that goes beyond it."""
    where = f"statement {n}"
    held = material(read)
    found: list[str] = []
    for word in dict.fromkeys(w.lower() for w in _NEVER.findall(text)):
        found.append(
            f"{where}: {word!r} goes beyond what was read: lines drawn touching do not "
            'prove pipes joined, and a map year is never a build date; say "shown '
            'earlier", "drawn touching", "first shown on"'
        )
    for word in dict.fromkeys(w.lower() for w in _INTERNAL.findall(text)):
        found.append(f"{where}: {word!r} is a word of the system, not the reviewer's")
    known = _numbers(held)
    for number in sorted(_numbers(text) - known):
        found.append(f"{where}: the number {number} is in nothing that was read")
    for word, digits in _NUMBER_WORDS.items():
        said = word not in ("zero", "one") and re.search(rf"\b{word}\b", text, re.IGNORECASE)
        if said and digits not in known:
            found.append(f"{where}: {word!r} ({digits}) is in nothing that was read")
    for code in set(re.findall(r"\b[0-9a-f]{8}\b", text)):
        if code not in held:
            found.append(f"{where}: the code {code} is in nothing that was read")
    for quoted in re.findall(r"[\"“]([^\"”]{3,})[\"”]", text):
        if quoted not in held:
            found.append(f"{where}: a quotation is in nothing that was read: {quoted[:50]!r}")
    lowered = held.lower()
    for found_name in re.finditer(r"\b[A-Z][A-Za-z&'-]*", text):
        bare = found_name.group().removesuffix("'s")
        if len(bare) < 2 or bare in held or bare.lower() in _ALWAYS:
            continue
        # A word that only opens a sentence, a line or a label is an ordinary word when
        # it is one: "Section 1a2b…", "Known:", "Together they…". A name is not.
        opens = re.search(r"(^|[.!?:]\s+|\n\s*(?:- )?)$", text[: found_name.start()])
        ordinary = bare.lower() in _COMMON or re.search(rf"\b{re.escape(bare.lower())}\b", lowered)
        if opens and ordinary:
            continue
        problem = f"{where}: the name {bare!r} is in nothing that was read"
        if problem not in found:
            found.append(problem)
    # What is only worked out from the drawn line is said as that.
    towns = [
        town.strip()
        for item in read.worked.values()
        if "today's towns" in item["text"].lower()
        for town in re.split(r",| and ", item["text"].split(":")[-1].rstrip("."))
    ]
    if any(t and t in text for t in towns) and not re.search(r"\btoday", text, re.IGNORECASE):
        found.append(f"{where}: say the towns are today's: no source names them")
    if re.search(r"\b(km|miles)\b", text) and "drawn" not in text.lower():
        found.append(f'{where}: a length is "as drawn": it is measured on the map')
    # A value only proposed, or turned down, is said as that.
    for claim in _claims_said(text, read):
        value = value_words(claim).rstrip(".")
        settled = any(
            c["status"] == "accepted"
            and c["attribute_key"] == claim["attribute_key"]
            and value_words(c).rstrip(".") == value
            for c in _claims_said(text, read)
        )
        if claim["status"] == "candidate" and not settled and "propos" not in text.lower():
            found.append(f"{where}: {value} is only proposed, and must be said as proposed")
        if claim["status"] == "rejected" and not settled and "reject" not in text.lower():
            found.append(f"{where}: {value} was rejected, and must be said as rejected")
    # "No owner is known" only where none is.
    asked = read.asked_about or []
    for lacking in _LACKS.finditer(text):
        attribute = (lacking.group(1) or lacking.group(2)).lower()
        holders = {h for fid in asked for h in (fid, *read.scope.get(fid, []))}
        if len(asked) == 1 and any(
            c["feature_id"] in holders
            and c["attribute_key"] == attribute
            and c["status"] == "accepted"
            for c in read.claims.values()
        ):
            found.append(f"{where}: an accepted {attribute} was read; it is not unknown")
    return found
