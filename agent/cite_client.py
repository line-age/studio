"""Moved to `src/clients/cite_client.py`. Kept as an alias until the imports switch (plan 2026-11-24-001, A)."""

import sys

from src.clients import cite_client as _moved

sys.modules[__name__] = _moved
