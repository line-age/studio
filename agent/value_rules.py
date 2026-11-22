"""What a claim's value may be: Studio's one rules file, the same rules Studio's Edit window
reads.

`contract/attribute-rules.json` is store's attribute registry (value type, enum words,
feature kinds, networks) plus limits store does not enforce yet: a quantity's units and its
lower bound. The frontend keeps a copy that a test holds equal; change both together. Every
bundle the Agent sends is checked here first (`store_writer.ProposalClient.propose`), so a
claim that breaks the rules is caught before it leaves, in the words store uses.
"""

import json
from pathlib import Path
from typing import Any

CONTRACT = json.loads((Path(__file__).parent / "contract" / "attribute-rules.json").read_text())
RULES: dict[str, dict[str, Any]] = {a["key"]: a for a in CONTRACT["attributes"]}


class RuleError(ValueError):
    """A claim store's rules do not allow, said as store says it."""


def check_claim(claim: dict[str, Any], *, kind: str | None = None, network: str | None = None) -> None:
    """Raise RuleError when `claim` breaks store's rules for its attribute. `kind` and
    `network` are the feature's, checked when given."""
    key = claim.get("attribute")
    rule = RULES.get(key)
    if rule is None:
        raise RuleError(f"{key} is not an attribute store knows")
    if kind is not None and kind not in rule["feature_kinds"]:
        raise RuleError(f"{key} does not apply to a {kind}")
    if network is not None and rule["networks"] is not None and network not in rule["networks"]:
        raise RuleError(f"{key} does not apply to the {network} network")
    value_type = rule["value_type"]
    needs = {"text": "value_text", "enum": "value_text", "quantity": "value_num",
             "geometry": "value_geom", "feature": "value_feature"}[value_type]
    if claim.get(needs) is None:
        raise RuleError(f"{key} needs a {value_type} value")
    if value_type == "enum" and claim["value_text"] not in rule["enum_values"]:
        raise RuleError(
            f"{claim['value_text']} is not a value of {key} ({', '.join(rule['enum_values'])})")
    if value_type == "quantity":
        units = rule["units"]
        if units is not None and claim.get("value_unit") not in units:
            raise RuleError(f"{key} needs a unit, one of ({', '.join(units)})")
        if rule["min_value"] is not None and claim["value_num"] <= rule["min_value"]:
            raise RuleError(f"{key} must be more than {rule['min_value']:g}")


def check_bundle(bundle: dict[str, Any]) -> None:
    """Check every claim in a bundle; the first that breaks a rule raises."""
    for claim in bundle.get("claims", []):
        check_claim(claim)
