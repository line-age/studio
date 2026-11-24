"""Keys and tokens a person pastes into the chat: found and replaced before anything keeps
or reads them. The thread, the model, traces of the run and cite see only the mark. The
patterns are `contract/secret-patterns.json`, which Studio applies too before it sends."""

import json
import re

from src.agent.config import ROOT

_CONTRACT = json.loads((ROOT / "contract" / "secret-patterns.json").read_text())

REDACTED: str = _CONTRACT["mark"]
# Each pattern has a fixed prefix and one bounded run of characters, with nothing nested
# in it, so a long line costs no more than a single pass.
_SECRETS = re.compile("|".join(_CONTRACT["patterns"]))
# The value after "Bearer", whatever its shape; the word stays so the sentence still reads.
_BEARER = re.compile(_CONTRACT["bearer"])


def redact(text: str) -> tuple[str, int]:
    """The text with every key, token, Bearer value and JWT replaced by the mark, and how
    many were found."""
    text, bearers = _BEARER.subn(lambda m: m.group(1) + REDACTED, text)
    text, others = _SECRETS.subn(REDACTED, text)
    return text, bearers + others
