# The Agent service for a local stack. `langgraph dev` is a development server:
# fine beside a local store, not for a hosted deployment.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.9 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY . .

# Threads are kept here. Mount a volume on it or they go with the container.
VOLUME /app/.langgraph_api

EXPOSE 8000
CMD ["uv", "run", "--frozen", "langgraph", "dev", "--host", "0.0.0.0", "--port", "8000", "--no-browser", "--no-reload"]
