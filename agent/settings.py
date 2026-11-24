"""Moved to `src/agent/config.py`. Kept as an alias until the imports switch (plan 2026-11-24-001, A)."""

import sys

from src.agent import config as _moved

sys.modules[__name__] = _moved
