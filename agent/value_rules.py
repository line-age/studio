"""Moved to `src/clients/value_rules.py`. Kept as an alias until the imports switch (plan 2026-11-24-001, A)."""

import sys

from src.clients import value_rules as _moved

sys.modules[__name__] = _moved
