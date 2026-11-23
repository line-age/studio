# The Studio Agent

The service that answers [Lineage Studio](../README.md)'s chat. It reads
[store](https://github.com/line-age/store) and says only what it read: every statement
names the claim, citation or link it rests on, and where store has nothing the answer is
"Store does not say". It writes one thing only, on a person's button: a finding they
pressed Propose on, as a candidate claim.

> **Status:** answers questions about the sections, pipelines, claims and proposals a
> person attaches; what surrounds a section (which printings show it, what ends it, its
> links, what it is drawn touching, leads on where to look next); what is nearby, the
> towns and states a line runs through and its length; several sections taken together;
> a pipeline as a whole; the network by a rule; what a word means; and follow-ups on the
> last question. Every answer passes a code check. A change asked for in words comes
> back as a card that Studio makes on Approve; a search of the journals with `cite`
> waits for Search, and a finding reaches store only on Propose. Studio's chat talks to
> it when Studio runs on store's data.

```sh
cd agent
uv sync
uv run pytest -q                                   # offline: no key, no network
uv run python serve.py                             # serve it on this machine, port 47190
```

It is built on LangChain's agent loop inside a LangGraph graph, served with
`langgraph dev`, which is a development server: right beside a local store, not for a
hosted deployment. Deep Agents (planning, working files) is not used yet. The service has no sign-in, so keep its port on `127.0.0.1`. Tracing to
LangSmith is off unless `AGENT_TRACING=true`.

## The graph

What runs for one message from Studio: a question, or the press of a button on a card
(an action).

```mermaid
flowchart TD
    Q(["Studio: a question (words + attached ids)<br/>or an action (a button on a card)"]) --> ingress

    ingress["<b>ingress</b><br/>keep only a person's message<br/>clear the last answer"]
    ingress -->|a question| read
    ingress -->|Propose on a finding| propose["<b>propose</b><br/>the one write: a candidate claim<br/>POST /bundles, cite's own token"]
    ingress -->|Search on a search card| search["<b>search</b><br/>the request the thread kept, once"]
    ingress -->|what came of a card| outcome["<b>outcome</b><br/>recorded in the thread<br/>no model, no write"]
    ingress -->|Start fresh| fresh["<b>fresh_start</b><br/>the messages go<br/>what cite found stays"]
    search --> cite["<b>cite_start, cite_wait, cite_report</b><br/>cite over HTTP, followed step by step<br/>code writes every sentence about a finding"]
    cite --> F(["Studio: a card per finding<br/>Propose or Dismiss"])

    read["<b>read</b><br/>read what is attached and its pipelines, at once<br/>steps: what was read, what comes next"] --> answer

    subgraph answer["<b>answer</b> node"]
        parse["read the question<br/>check its shape and length"]
        parse -->|not a question Studio sends| fail
        parse -->|a change asked in words| offer["<b>change_flow</b>, no model<br/>one change card, or a fixed line"]
        parse -->|asks to look something up| soffer["a search card:<br/>section, years, towns<br/>nothing runs, nothing is spent"]
        parse --> context

        context["<b>read_context</b> for up to three sections<br/>printings, end, links, drawn touching (50 m)<br/>leads by seven fixed rules · the section pack"]
        context -->|nothing attached is left in store| gone["fixed line:<br/>store no longer has that"]
        context --> loop

        subgraph loop["model loop (create_agent), effort low"]
            model["model<br/>claude-haiku-5-5"]
            tool["read_feature · read_context · find_nearby<br/>sections_together · pipeline_sections<br/>find_sections · find_pipelines<br/>claims C1, worked out W1, leads L1"]
            model -->|tool call| tool
            tool --> model
        end

        loop -->|store unreachable or refused| fail
        loop -->|draft: picks by handle, slots| render

        render["<b>render</b><br/>code writes one-claim facts, worked-out facts and leads<br/>fills slots from what was read; each claim carries its source"]
        render --> check

        check{"<b>grounding check</b><br/>own words: no number, quote, id, name, connected, built<br/>every claim used, proposals said as such<br/>a neighbour's claim never as this section's"}
        check -->|problems, first time| retry["send the problems back<br/>to the model once"]
        retry --> loop
        check -->|problems again| fail["fixed line:<br/>could not answer"]
    end

    check -->|passes| finish
    gone --> finish
    fail --> finish
    offer --> finish
    soffer --> finish
    finish["<b>finish</b><br/>checked answer and steps on the reply<br/>id answer-&lt;question id&gt;"] --> A(["Studio: steps above, statements with sources and links,<br/>worked out and leads marked"])

    store[("store<br/>GET only")] -.- read
    store -.- tool
    propose -.->|the only POST| store
```

## Section context

What it is and why: the controlplane's
[components.md, The Agent service](https://github.com/line-age/controlplane/blob/main/components.md#the-agent-service).
How each kind of statement is shown in an answer:

| Kind | Comes from | Shown as |
| --- | --- | --- |
| Claim | store, accepted | the value in a sentence, its source beside it |
| Proposal | store, candidate | "A tool (or a person) proposed ...; nobody has decided", its source beside it |
| Worked out | code, from the maps, the links or the traced lines | marked "Inferred" (hover says what it means), with what it rests on |
| Lead | code, by fixed rules over the above; the model only picks it | marked "Lead, not in store", with what it rests on; never written to store |
| Unknown | store holds nothing | "Store does not say" |

A section drawn touching another is a clue, not a fact: two traced lines meeting on a map
do not prove the pipes joined. The same pack of context is kept whole as `cite`'s brief
(`contract/section-pack.schema.json`, golden example in `contract/examples/`).

Rules, layout and how Studio talks to it: [AGENTS.md](AGENTS.md).
