# The Studio Agent

The service that answers [Lineage Studio](../README.md)'s chat. It reads
[store](https://github.com/line-age/store) and says only what it read: every statement
names the claim, citation or link it rests on, and where store has nothing the answer is
"Store does not say". It writes nothing.

> **Status: a scaffold.** The service runs and answers every question with one fixed line.
> Studio is not connected to it yet.

```sh
cd agent
uv sync
uv run pytest -q                                   # offline: no key, no network
uv run python serve.py                             # serve it on this machine, port 47190
```

It is a [Deep Agent](https://github.com/langchain-ai/deepagents) in Python, served with
`langgraph dev`, which is a development server: right beside a local store, not for a
hosted deployment. The service has no sign-in, so keep its port on `127.0.0.1`. Tracing to
LangSmith is off unless `AGENT_TRACING=true`.

Rules, layout and how Studio talks to it: [AGENTS.md](AGENTS.md).
