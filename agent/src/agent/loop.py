"""The model loop: built once, when the graph is; each question passes its own context."""

from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy

from src.answer.schemas import Draft
from src.middleware.limits import loop_middleware
from src.prompts.system import SYSTEM
from src.tools import TOOLS
from src.tools.question import QuestionContext


def build_loop(model: Any):
    return create_agent(
        model,
        tools=TOOLS,
        system_prompt=SYSTEM,
        response_format=ProviderStrategy(Draft),
        middleware=loop_middleware(),
        context_schema=QuestionContext,
        name="studio-agent-loop",
    )
