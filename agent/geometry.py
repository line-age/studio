"""Moved to `src/worked_out/geometry.py`. Kept as an alias until the imports switch (plan 2026-11-24-001, A)."""

import sys

from src.worked_out import geometry as _moved

sys.modules[__name__] = _moved
