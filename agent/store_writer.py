"""The Agent's writes: a finding the person pressed Propose on, or a pipeline the person
pressed Propose pipeline on, each as one bundle.

A client of its own, apart from the read client, with its own token: a pipeline token
minted for `cite@<version>`, so store records cite as the claim's asserter and keeps it a
candidate whatever is sent (plan D7). It can send one request, `POST /bundles`, and
nothing else; the read client still sends only GET. The model has no way to reach it:
only the `propose` and `propose_pipeline` nodes call it, on the person's action.
"""

import hashlib
from typing import Any

import httpx

import value_rules
from store_client import StoreError, check_store_url


def _only_bundles(request: httpx.Request) -> None:
    if request.method != "POST" or request.url.path != "/bundles":
        raise RuntimeError(f"the Agent writes only bundles: refused {request.method}")


class ProposalClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 30.0,
    ):
        self._http = httpx.Client(
            base_url=check_store_url(base_url),
            headers={"Authorization": f"Bearer {token}"},
            transport=transport,
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
            event_hooks={"request": [_only_bundles]},
        )

    def propose(self, bundle: dict[str, Any]) -> dict[str, Any]:
        """Send one bundle. Returns store's `ids` (ref to UUID) and `created`. A claim
        store's rules refuse (value_rules) is never sent."""
        try:
            value_rules.check_bundle(bundle)
        except value_rules.RuleError as exc:
            raise StoreError("bad_request", str(exc)) from exc
        try:
            response = self._http.post("/bundles", json=bundle)
        except httpx.HTTPError as exc:
            raise StoreError("unreachable", type(exc).__name__) from exc
        if response.status_code in (401, 403):
            raise StoreError("refused", str(response.status_code))
        if response.status_code not in (200, 201):
            raise StoreError("error", f"{response.status_code}: {response.text[:300]}")
        body = response.json()
        if not isinstance(body, dict) or not isinstance(body.get("ids"), dict):
            raise StoreError("error", "store answered in a shape this client does not know")
        return body


def _key(*parts: Any) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:16]


STATUS_OF_SENSE = {
    "laying": "under_construction",
    "completed": "operational",
    "in_operation": "operational",
}


def bundle(record: dict[str, Any], feature: str | None = None) -> dict[str, Any]:
    """A finding as store's bundle (plan S8): the issue as source, the page as citation
    with the page's own words, and one candidate claim, on `feature` (its section unless
    given). External keys under the system `cite`, so sending it again changes nothing."""
    f = record["finding"]
    on = feature or f["section_id"]
    number = (
        f", vol. {f['volume']} no. {f['number']}" if f.get("volume") and f.get("number") else ""
    )
    issue = record.get("issue_id") or _key(f["journal"], f["date"])
    source = {
        "ref": "issue",
        "kind": "issue",
        "title": f"{f['journal']}{number}",
        "published_edtf": f["date"],
        "external_key": {"system": "cite", "key": f"source/{issue}"},
    }
    citation = {
        "ref": "page",
        "source": "issue",
        "locator": f["page"],
        "quote": f["quote"],
        "url": f["url"],
        "external_key": {
            "system": "cite",
            "key": f"citation/{issue}/{_key(f['page'], f['quote'])}",
        },
    }
    claim: dict[str, Any] = {
        "ref": "claim",
        "feature": on,
        "citations": [{"citation": "page", "role": "states"}],
    }
    key = record["store_key"]
    if key == "owner":
        claim |= {"attribute": "owner", "value_text": f["value"], "start_latest": f["date"]}
    elif key == "diameter":
        claim |= {
            "attribute": "diameter",
            "value_num": float(record["normalized"]["inches"]),
            "value_unit": "in",
            "start_latest": f["date"],
        }
    else:
        year = int(record["normalized"]["year"])
        status = STATUS_OF_SENSE[record["date_sense"]]
        claim |= {"attribute": "status", "value_text": status, "valid_edtf": str(year)}
        if status == "under_construction":
            claim |= {"start_earliest": f"{year}-01-01", "start_latest": f"{year}-12-31"}
        else:
            claim |= {"start_latest": f"{year}-12-31"}
    value = claim.get("value_text") or claim.get("value_num")
    claim["external_key"] = {
        "system": "cite",
        "key": f"claim/{on}/{claim['attribute']}/{_key(value, issue, f['page'])}",
    }
    return {"sources": [source], "citations": [citation], "claims": [claim]}


def pipeline_bundle(section_ids: list[str], network: str) -> dict[str, Any]:
    """A pipeline the person pressed Propose pipeline on: a new `line` with no label (it
    has no name until one is cited) and a proposed `part_of` link from each section.
    External keys under `cite`, keyed on the sections, so a second press for the same
    sections makes nothing new. The links are sent as proposed; store keeps a pipeline
    token's link proposed whatever it says."""
    group = _key(*sorted(section_ids))
    return {
        "features": [
            {
                "ref": "line",
                "kind": "line",
                "network": network,
                "external_key": {"system": "cite", "key": f"line/{group}"},
            }
        ],
        "links": [
            {
                "ref": f"member{n}",
                "from": section_id,
                "to": "line",
                "relation": "part_of",
                "status": "proposed",
                "external_key": {"system": "cite", "key": f"part_of/{group}/{section_id}"},
            }
            for n, section_id in enumerate(section_ids)
        ],
    }
