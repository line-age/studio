import socket

import pytest
from langchain_core.messages import HumanMessage

from graph import graph
from render import FIXED_LINES
from schemas import Answer


def test_a_run_returns_a_valid_checked_answer():
    out = graph.invoke({"messages": [HumanMessage("Who owns this section?")]})

    answer = Answer.model_validate(out["answer"])
    assert answer.checked
    assert [s.kind for s in answer.statements] == ["failure"]
    assert answer.statements[0].text == FIXED_LINES["check_failed"]
    assert answer.statements[0].refs == []
    assert out["messages"][-1].content == FIXED_LINES["check_failed"]


def test_the_graph_brings_no_checkpointer_of_its_own():
    assert graph.checkpointer is None


def test_the_offline_guard_refuses_the_network():
    with pytest.raises(AssertionError, match="tests never leave this machine"):
        socket.create_connection(("192.0.2.1", 80), timeout=1)


def test_fixed_lines_have_no_dash_separators():
    for line in FIXED_LINES.values():
        assert "—" not in line and "–" not in line
