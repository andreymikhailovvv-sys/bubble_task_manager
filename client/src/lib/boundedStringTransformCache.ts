/**
 * In-memory LRU for deterministic string transforms (sanitized note HTML,
 * linkified note HTML, and plain-text previews).
 *
 * A single shared character budget bounds keys and results. Nothing is written
 * to localStorage/sessionStorage and stale revisions are never reused because
 * the entire source string is part of the key.
 */
export function createBoundedStringTransformCache(limits: {
  maxEntries: number;
  maxChars: number;
  maxEntryChars: number;
}) {
  type CacheEntry = { output: string; characters: number };
  const entries = new Map<string, CacheEntry>();
  let totalCharacters = 0;

  return (kind: string, source: string, transform: () => string): string => {
    const key = `${kind}\0${source}`;
    if (key.length > limits.maxEntryChars) return transform();

    const cached = entries.get(key);
    if (cached !== undefined) {
      entries.delete(key);
      entries.set(key, cached);
      return cached.output;
    }

    const output = transform();
    const characters = key.length + output.length;
    if (characters > limits.maxEntryChars || characters > limits.maxChars ||
        limits.maxEntries < 1 || limits.maxChars < 1) return output;

    entries.set(key, { output, characters });
    totalCharacters += characters;

    while (entries.size > limits.maxEntries || totalCharacters > limits.maxChars) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldestEntry = entries.get(oldestKey);
      if (oldestEntry !== undefined) totalCharacters -= oldestEntry.characters;
      entries.delete(oldestKey);
    }

    return output;
  };
}
