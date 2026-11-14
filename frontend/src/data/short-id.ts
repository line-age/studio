/**
 * A feature's short name: 8 hex digits hashed from its whole id (FNV-1a, 32 bits, then
 * murmur3's finaliser).
 *
 * Not a slice of the id: store's ids share their first digits within one import (the
 * time) and run in sequence at the end (sections side by side differ by one digit), so
 * a slice names many sections the same or nearly so. The Agent computes the same hash
 * (`agent/render.py`, `short_id`), so a name in an answer is the name on screen.
 */
export function shortId(id: string): string {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(id.toLowerCase())) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // murmur3's finaliser: one changed character changes every digit.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return (h >>> 0).toString(16).padStart(8, "0")
}
