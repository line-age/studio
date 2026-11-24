"""Short names for what a question read: claims (C1), worked-out facts (W1), leads (L1)."""

import threading


class Handles:
    """Short names for the claims a question read (C1, C2, ...). A model copies `C7`
    reliably; it does not always copy a 36-character id. Code turns them back into ids."""

    def __init__(self) -> None:
        self.ids: dict[str, str] = {}
        self._of: dict[str, str] = {}
        self._worked = 0
        self._leads = 0
        # Reads run in parallel threads; two claims must never get the same handle.
        self._lock = threading.Lock()

    def of(self, claim_id: str) -> str:
        with self._lock:
            if claim_id not in self._of:
                handle = f"C{len(self._of) + 1}"
                self._of[claim_id], self.ids[handle] = handle, claim_id
            return self._of[claim_id]

    def worked(self) -> str:
        """The next handle for something code worked out: W1, W2, ..."""
        with self._lock:
            self._worked += 1
            return f"W{self._worked}"

    def lead(self) -> str:
        """The next handle for a lead code found: L1, L2, ..."""
        with self._lock:
            self._leads += 1
            return f"L{self._leads}"

    def resolve(self, ref_id: str) -> str:
        return self.ids.get(ref_id.strip().upper(), ref_id)
