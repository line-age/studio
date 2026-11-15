"""Use cases: a question, the invented world it runs on, and what the answer must and
must not hold. One `.jsonl` file per behaviour in `cases/`.

A case names things by the short codes of its world (`s01`), never by id, and a claim as
`code.attribute.status` (`s03.owner.candidate`; add `#1` for the second such claim).
"""

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from evals.fake_store import load_world

CASES = Path(__file__).parent / "cases"
NAMESPACE = uuid.UUID("0c1d7e57-ca5e-4000-8000-000000000000")
SPLITS = ("dev", "held_out")
# What must keep passing while a behaviour is built: its cases run with these.
KEEPS = {
    "B02": ["B01"],
    "B03": ["B01", "B02"],
    "B17": ["B01", "B02"],
    "B18": ["B01", "B02", "B17"],
    "B19": ["B01", "B02", "B17", "B18"],
    "B20": ["B01", "B02", "B17", "B18", "B19"],
    # Searching with cite: each keeps what store says (B01, B02) and the leads (B20).
    **{b: ["B01", "B02", "B20"] for b in ("B21", "B22", "B23", "B24", "B25", "B26", "B27")},
}
LABELS = ("agent-draft", "person")
# Behaviours about searching with cite: their cases always run with the fake cite.
SEARCHING = frozenset({"B21", "B22", "B23", "B24", "B25", "B26", "B27"})
MUST_KEYS = {
    "first_kind",
    "kinds",
    "refs",
    "unknown",
    "fixed_line",
    "tools",
    "text",
    # Searching with cite: how many bundles store took, and what reached cite last.
    "writes",
    "cite_sent",
}
MUST_NOT_KEYS = {"kinds", "refs", "tools", "text", "cite"}


@dataclass(frozen=True)
class Case:
    id: str
    behaviour: str
    world: str
    question: dict[str, Any]
    must: dict[str, Any] = field(default_factory=dict)
    must_not: dict[str, Any] = field(default_factory=dict)
    split: str = "dev"
    # The earlier behaviour this case keeps passing, if that is why it is here.
    keeps: str | None = None
    labeled_by: str = "agent-draft"
    note: str = ""
    # Earlier questions on the same thread, asked before `question` (same shape).
    turns: list[dict[str, Any]] = field(default_factory=list)
    # The fake cite's scripts for this case's searches, in order (evals/fake_cite.py).
    # Any case with turns or a script runs with the fake cite and a proposal client.
    cite: list[str] = field(default_factory=list)

    @property
    def searches(self) -> bool:
        return bool(self.turns or self.cite) or self.behaviour in SEARCHING

    @property
    def example_id(self) -> str:
        """A stable id for the LangSmith dataset, so a re-sync updates and never copies."""
        return str(uuid.uuid5(NAMESPACE, self.id))


def claim_id(world: dict[str, Any], selector: str) -> str:
    """`s03.owner.candidate` or `s05.operator.accepted#1` to a claim id."""
    selector, _, nth = selector.partition("#")
    code, attribute, status = selector.split(".")
    claims = [
        c
        for c in world["features"][world["codes"][code]]["claims"]
        if c["attribute_key"] == attribute and c["status"] == status
    ]
    return claims[int(nth or 0)]["id"]


def question_for(
    case: Case, world: dict[str, Any], question: dict[str, Any] | None = None
) -> dict[str, Any]:
    """The question as Studio sends it, with the world's codes turned into store ids."""
    question = question if question is not None else case.question
    about = []
    for item in question.get("about", []):
        if "id" in item:  # a literal id, for a thing store no longer has
            about.append({"kind": item["kind"], "id": item["id"], "on": None})
        elif item["kind"] == "claim":
            # As Studio sends it: the claim, and the section it is on.
            code, attribute = item["code"].split(".")[:2]
            on = {"sectionId": world["codes"][code], "pipelineId": None, "attribute": attribute}
            about.append({"kind": "claim", "id": claim_id(world, item["code"]), "on": on})
        else:
            about.append({"kind": item["kind"], "id": world["codes"][item["code"]], "on": None})
    out = {"words": question["words"], "about": about, "network": "gas"}
    if question.get("action"):
        out["action"] = question["action"]
    return out


def _check(case: Case) -> None:
    world = load_world(case.world)  # KeyError unless make_world.py makes it
    assert case.split in SPLITS and case.labeled_by in LABELS, case.id
    assert case.id.startswith(case.behaviour + "-"), case.id
    assert set(case.must) <= MUST_KEYS and set(case.must_not) <= MUST_NOT_KEYS, case.id
    assert case.must or case.must_not, f"{case.id} checks nothing"
    question_for(case, world)
    for turn in case.turns:
        question_for(case, world, turn)
    from evals.fake_cite import SCRIPTS

    assert all(name in SCRIPTS for name in case.cite), case.id
    for selector in [*case.must.get("refs", []), *case.must_not.get("refs", [])]:
        claim_id(world, selector)
    for unknown in case.must.get("unknown", []):
        assert unknown["feature"] in world["codes"], case.id


def load(behaviours: list[str] | None = None, split: str | None = None) -> list[Case]:
    cases = []
    for path in sorted(CASES.glob("B*.jsonl")):
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            case = Case(**json.loads(line))
            assert case.behaviour == path.stem, f"{case.id} is in the wrong file"
            _check(case)
            cases.append(case)
    ids = [c.id for c in cases]
    assert len(ids) == len(set(ids)), "two cases share an id"
    wanted = set(behaviours or [])
    for behaviour in behaviours or []:
        wanted.update(KEEPS.get(behaviour, []))
    return [
        c
        for c in cases
        if (not wanted or c.behaviour in wanted) and (not split or c.split == split)
    ]
