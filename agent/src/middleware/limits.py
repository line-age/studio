"""What wraps the model loop of one question: its limits and prompt caching."""

from langchain.agents.middleware import ModelCallLimitMiddleware, ToolCallLimitMiddleware
from langchain_anthropic.middleware import AnthropicPromptCachingMiddleware

from src.agent.config import MODEL_CALLS, TOOL_CALLS


def loop_middleware() -> list:
    """The system prompt and the tools are the same for every question, and each call of
    a loop repeats the one before: cached, they are read at a tenth of the price. A model
    that is not Anthropic's (a test's fake) runs uncached."""
    return [
        # A question is a handful of model calls at most. On 2026-11-22 a loop with no
        # limit made about 370 calls in ten minutes: never again. Past the tool limit a
        # call is refused and the model answers from what it has read; at the model
        # limit the loop ends, and the question gets the fixed "could not answer" line.
        ModelCallLimitMiddleware(run_limit=MODEL_CALLS, exit_behavior="end"),
        ToolCallLimitMiddleware(run_limit=TOOL_CALLS, exit_behavior="continue"),
        AnthropicPromptCachingMiddleware(unsupported_model_behavior="ignore"),
    ]
