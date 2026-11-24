"""Moved to `src/flows/cite_input.py`. Kept as an alias until the imports switch (plan 2026-11-24-001, A)."""

import sys

from src.flows import cite_input as _moved

sys.modules[__name__] = _moved
