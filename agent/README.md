# The Studio Agent

The service that answers [Lineage Studio](../README.md)'s chat. It reads
[store](https://github.com/line-age/store) and says only what it read: every statement
names the claim, citation or link it rests on, and where store has nothing the answer is
"Store does not say". It writes nothing.

> **Status:** answers questions about the sections, pipelines, claims and proposals a
> person attaches (behaviours B1 and B2), with a code check on every answer. Studio's chat
> talks to it when Studio runs on store's data. Section context and leads are planned
> (below). Whole-network questions, follow-ups and `cite` are not built yet.

```sh
cd agent
uv sync
uv run pytest -q                                   # offline: no key, no network
uv run python serve.py                             # serve it on this machine, port 47190
```

It is built on LangChain's agent loop inside a LangGraph graph, served with
`langgraph dev`, which is a development server: right beside a local store, not for a
hosted deployment. Deep Agents (planning, working files) comes in with whole-network
questions. The service has no sign-in, so keep its port on `127.0.0.1`. Tracing to
LangSmith is off unless `AGENT_TRACING=true`.

## The graph

What runs for one question. Solid is built; dotted is planned.

```mermaid
flowchart TD
    Q(["Studio: a question<br/>words + attached ids"]) --> ingress

    ingress["<b>ingress</b><br/>keep only a person's message<br/>clear the last answer"] --> parse

    subgraph answer["<b>answer</b> node"]
        parse["read the question<br/>check its shape and length"]
        parse -->|not a question Studio sends| fail
        parse --> loop

        subgraph loop["model loop (create_agent)"]
            model["model<br/>claude-sonnet-5-5"]
            tool["read_feature<br/>a feature + traces merged into it<br/>claims as handles C1, C2"]
            model -->|tool call| tool
            tool -->|claims, links| model
        end

        loop -->|store unreachable or refused| fail
        loop -->|everything attached is gone| gone["fixed line:<br/>store no longer has that"]
        loop -->|draft: statements with slots| render

        render["<b>render</b><br/>fill slots from what was read:<br/>values, periods, status, sources<br/>add any source the draft left out"]
        render --> check

        check{"<b>grounding check</b><br/>own words: no number, quote, id, name<br/>every claim used, proposals said as such<br/>every unknown really unknown"}
        check -->|problems, first time| retry["send the problems back<br/>to the model once"]
        retry --> loop
        check -->|problems again| fail["fixed line:<br/>could not answer"]
    end

    check -->|passes| finish
    gone --> finish
    fail --> finish
    finish["<b>finish</b><br/>checked answer on the reply<br/>id answer-&lt;question id&gt;"] --> A(["Studio renders the answer<br/>references open the section or claim"])

    store[("store<br/>GET only")] -.- tool

    pack["section pack"]:::planned
    tool -.->|planned| pack
    pack -.->|planned: context, leads| model

    classDef planned stroke-dasharray: 5 5
```

## Planned: section context

A section's own claims are often only its route and a status. To say more about it, the
Agent will gather one **section pack**: its claims, what it is drawn touching, the map
editions that show it, its links and pipeline, and where it lies. From these it may draw
**leads**, marked "Not in store", which point at what to look for. The same pack, unchanged,
becomes `cite`'s brief for the section, and the leads its hints, once `cite` is attached.

```mermaid
flowchart LR
    subgraph store["store (read only)"]
        F["GET /features/{id}<br/>own claims, links"]
        S["GET /sections?bbox<br/>sections around it"]
        L["linked features<br/>pipeline, merged traces, removals"]
    end
    P["public-domain boundaries<br/>states, counties, towns"]

    F --> pack
    S -->|geometry: drawn touching| pack
    L --> pack
    P -->|place, length| pack

    pack["<b>Section pack</b><br/>claims · connections · editions<br/>links · place · leads"]

    pack -->|now| chat["Agent answer<br/>grounding check"]
    pack -.->|soon| cite["cite<br/>brief + leads as hints"]
    chat -.->|prepared, not sent| req["citation request<br/>+ leads"]
    req -.-> cite
```

How each kind of statement is marked in an answer:

| Kind | Comes from | Shown as |
| --- | --- | --- |
| Claim | store, accepted | the value with its source |
| Proposal | store, candidate | "proposed by a tool (or a person), not decided yet", with its source |
| Worked out | code, from geometry or public boundaries | marked worked out, with what it was worked out from |
| Lead | the Agent, from the above | "Not in store", with what it rests on; never proposed to store |
| Unknown | store holds nothing | "Store does not say" |

A section drawn touching another is a clue, not a fact: two traced lines meeting on a map
does not prove the pipes joined.

Rules, layout and how Studio talks to it: [AGENTS.md](AGENTS.md).
