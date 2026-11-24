"""Keys and tokens a person pastes into the chat: found and replaced before anything keeps
or reads them. The thread, the model, traces of the run and cite see only the mark."""

import re

REDACTED = "[REDACTED_SECRET]"

# Each pattern has a fixed prefix and one bounded run of characters, with nothing nested
# in it, so a long line costs no more than a single pass.
_SECRETS = re.compile(
    r"""
      \bsk-ant-[A-Za-z0-9_-]{20,512}                  # Anthropic
    | \bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,512}   # OpenAI and the like
    | \blgt_[A-Za-z0-9_-]{16,512}                     # store's pipeline tokens
    | \b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,255}   # GitHub
    | \bgithub_pat_[A-Za-z0-9_]{30,255}
    | \blsv2_(?:pt|sk)_[A-Za-z0-9_]{20,255}           # LangSmith
    | \bAKIA[0-9A-Z]{16}\b                            # AWS access key id
    | \bxox[abpors]-[A-Za-z0-9-]{10,255}              # Slack
    | \beyJ[A-Za-z0-9_-]{8,2048}\.eyJ[A-Za-z0-9_-]{4,4096}\.[A-Za-z0-9_-]{8,2048}  # JWT
    """,
    re.VERBOSE,
)
# The value after "Bearer", whatever its shape; the word stays so the sentence still reads.
_BEARER = re.compile(r"\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,4096}")


def redact(text: str) -> tuple[str, int]:
    """The text with every key, token, Bearer value and JWT replaced by the mark, and how
    many were found."""
    text, bearers = _BEARER.subn(lambda m: m.group(1) + REDACTED, text)
    text, others = _SECRETS.subn(REDACTED, text)
    return text, bearers + others
