"""Shared offline setup: tests never trace and never leave this machine."""

import socket
from contextlib import contextmanager
from unittest.mock import patch

from langsmith import tracing_context


@contextmanager
def offline():
    connect = socket.socket.connect

    def guarded(sock, address):
        if sock.family == socket.AF_UNIX:
            return connect(sock, address)
        host = address[0] if isinstance(address, tuple) else address
        raise AssertionError(
            f"Refused connection to {host}: tests never leave this machine. Use the fake store."
        )

    with tracing_context(enabled=False), patch("socket.socket.connect", guarded):
        yield


# A model that follows a script, so the graph runs offline with no key.

import itertools
import json

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage


class ScriptedModel(GenericFakeChatModel):
    """Answers each model call with the next scripted message; accepts tools and formats."""

    def bind_tools(self, tools, **kwargs):
        return self

    def bind(self, **kwargs):
        return self


_ids = itertools.count()


def scripted(*steps) -> ScriptedModel:
    """Each step is a list of (tool, args) calls, or a final draft as a dict."""
    messages = []
    for step in steps:
        if isinstance(step, dict):
            messages.append(AIMessage(content=json.dumps(step)))
        else:
            calls = [
                {"name": name, "args": args, "id": f"call_{next(_ids)}", "type": "tool_call"}
                for name, args in step
            ]
            messages.append(AIMessage(content="", tool_calls=calls))
    return ScriptedModel(messages=iter(messages))
