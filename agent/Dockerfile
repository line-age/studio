# The Agent service for a local stack. `langgraph dev` is a development server with no
# sign-in: fine beside a local store, not for a hosted deployment. Publish its port on
# the host as 127.0.0.1 only, or not at all and reach it through Studio's proxy.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.9 /uv /usr/local/bin/uv

# Tracing is decided by AGENT_TRACING alone (serve.py); off unless it is set to true.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    AGENT_TRACING=false \
    LANGGRAPH_CLI_NO_ANALYTICS=1

RUN useradd --create-home --uid 10001 agent
WORKDIR /app
RUN chown agent:agent /app
USER agent

COPY --chown=agent:agent pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY --chown=agent:agent . .

# Threads are kept in /app/.langgraph_api. Mount a named volume there to keep them across
# containers, and remove that volume to delete them: on a real stack they hold store's data.
RUN mkdir -p /app/.langgraph_api

EXPOSE 8000
CMD ["uv", "run", "--frozen", "python", "serve.py", "--host", "0.0.0.0", "--port", "8000", "--no-reload"]
