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
