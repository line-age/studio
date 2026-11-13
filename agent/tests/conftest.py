import pytest

from tests.support import offline


@pytest.fixture(autouse=True)
def _offline(monkeypatch):
    monkeypatch.setenv("AGENT_TRACING", "false")
    with offline():
        yield
