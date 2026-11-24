"""The model's tools, defined once. Each returns words for the model and, as its
artifact, exactly what store returned: the artifact is what the grounding ledger is built
from. What a question owns reaches them as the loop's context (`QuestionContext`)."""

from src.tools.context import find_nearby, read_context
from src.tools.features import read_feature
from src.tools.network import find_pipelines, find_sections
from src.tools.together import pipeline_sections, sections_together


def _as_the_model_saw_them(tools: list) -> list:
    """Each description with its lines indented as they were when the tools were closures
    (four spaces more), so the model reads exactly what it read before the move. Kept until
    a change to the descriptions gets its own eval run (agent/AGENTS.md: eval first)."""
    for t in tools:
        first, *rest = t.description.split("\n")
        t.description = "\n".join([first, *("    " + line if line else line for line in rest)])
    return tools


# In the order the model is shown them.
TOOLS = _as_the_model_saw_them(
    [
        read_feature,
        read_context,
        find_nearby,
        sections_together,
        pipeline_sections,
        find_sections,
        find_pipelines,
    ]
)
BY_NAME = {t.name: t for t in TOOLS}
