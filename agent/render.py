"""The one place where words that are not the model's own are written."""

from schemas import Answer, Statement

# Agreed by the owner. Evals match them exactly; changing one is a deliberate edit
# with an eval run before and after.
FIXED_LINES = {
    "unrelated": "I can only help with what is in store, its sources and how Studio works.",
    "background": (
        "I cannot answer that here. I only say what store, its sources or Studio's help hold."
    ),
    "unknown": "Store does not say.",
    "check_failed": (
        "I could not give an answer I can back with store. Try asking about one thing at a time."
    ),
    "store_unreachable": "Store cannot be reached, so I cannot answer. Your question is kept.",
    "store_refused": "Store refused the Agent's token. Your question is kept.",
    "model_failed": "The Agent could not finish. Your question is kept; try again.",
    "stopped": "Stopped. Nothing was answered.",
    "what_is_meant": (
        "What do you mean? Attach the section, claim or source you are asking about."
    ),
}


def failure(line: str = "check_failed") -> Answer:
    """A checked answer holding one fixed line. Nothing in it comes from a model."""
    return Answer(checked=True, statements=[Statement(kind="failure", text=FIXED_LINES[line])])


def as_text(answer: Answer) -> str:
    return "\n\n".join(statement.text for statement in answer.statements)
