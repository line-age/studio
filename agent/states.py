"""Moved to `src/worked_out/states.py`. Kept as an alias until the imports switch (plan 2026-11-24-001, A)."""

import sys

from src.worked_out import states as _moved

sys.modules[__name__] = _moved
