"""The one bundle the Agent sends is store's bundle: a finding the person pressed Propose
on. A change asked for in words is never written by the Agent (tests/test_change.py).
"""

import json

import jsonschema

from evals.fake_store import load_world
from settings import ROOT

__all__ = ["load_world"]

BUNDLE_SCHEMA = json.loads((ROOT / "contract" / "store-bundle.schema.json").read_text())


def _closed(schema):
    """Store's schema with every object closed, so a misspelt field fails here and not
    silently in store, which ignores unknown fields."""
    if isinstance(schema, dict):
        out = {k: _closed(v) for k, v in schema.items()}
        if out.get("type") == "object" and "properties" in out:
            out.setdefault("additionalProperties", False)
        return out
    if isinstance(schema, list):
        return [_closed(v) for v in schema]
    return schema


def test_a_finding_bundle_is_a_bundle_store_takes():
    from tests.test_cite import Chat as CiteChat
    from tests.test_cite import request

    world = load_world("small")
    s01 = world["codes"]["s01"]
    for attribute in ("owner", "status"):
        chat = CiteChat(world, request(s01, attribute=attribute, places=["Sampleton"]))
        chat.ask("Find it, through Sampleton.", [s01])
        chat.ask("Propose F1", action={"kind": "propose", "finding": "F1"})
        [bundle] = chat.writer.bundles
        jsonschema.validate(bundle, _closed(BUNDLE_SCHEMA))
