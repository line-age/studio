"""What one question owns while its tools run, passed to the loop on each run."""

import threading
from dataclasses import dataclass, field
from typing import Any

from langchain.tools import ToolRuntime
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool

from src.tools.handles import Handles


@dataclass
class QuestionContext:
    """The tools are defined once; what a question owns travels with each run as the
    loop's context. A feature read twice in the same question is not fetched again: the
    model is told it already has it. Claims are shown by handle."""

    # Store, or store with the attached features already fetched.
    store: Any
    handles: Handles = field(default_factory=Handles)
    # The network a question is asked about, for the tools that look across it.
    network: str | None = None
    features_read: set[str] = field(default_factory=set)
    contexts_read: set[str] = field(default_factory=set)
    nearby_read: set[str] = field(default_factory=set)
    # Context reads run in parallel; one section must never take two of their places.
    lock: Any = field(default_factory=threading.Lock)

    def fresh(self) -> "QuestionContext":
        """The same question with nothing read yet, for a try after the model failed;
        the handles stay, so C1 still means C1."""
        return QuestionContext(self.store, self.handles, self.network)


def runtime_for(
    context: QuestionContext, config: RunnableConfig, tool_call_id: str | None
) -> ToolRuntime:
    """The runtime the loop gives a tool, for a call made outside it."""
    return ToolRuntime(
        state={},
        context=context,
        config=config,
        stream_writer=lambda _: None,
        tool_call_id=tool_call_id,
        store=None,
    )


def run_tool(
    tool: BaseTool, call: dict[str, Any], context: QuestionContext, config: RunnableConfig
) -> ToolMessage:
    """Run one tool call outside the loop, as the loop would, with the question's
    context: for reading what is attached before the model starts."""
    runtime = runtime_for(context, config, call["id"])
    return tool.invoke({**call, "args": {**call["args"], "runtime": runtime}}, config)
