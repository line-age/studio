"""Moved to `src/prompts/system.py`. Kept as an alias until the imports switch (plan 2026-11-24-001, A)."""

import sys

from src.prompts import system as _moved

sys.modules[__name__] = _moved
