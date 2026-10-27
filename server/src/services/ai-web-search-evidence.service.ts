/** Verified, clickable URLs returned by an actual provider web search.
 * Responses API web_search_call.action.sources includes consulted pages even
 * when the final answer carries no url_citation annotations.
 */
export type AiWebSource = { title: string; url: string };
export type AiWebCitation = { startIndex: number; endIndex: number; sourceIndex: number };
export function extractAiWebEvidence(response: { output?: unknown }): {
  sources: AiWebSource[]; citations: AiWebCitation[];
} {
  const sources: AiWebSource[] = [];
  const citations: AiWebCitation[] = [];
  const indexByUrl = new Map<string, number>();
  const add = (rawUrl: unknown, rawTitle: unknown): number | null => {
    if (typeof rawUrl !== 'string' || rawUrl.length > 2048) return null;
    let url: URL;
    try { url = new URL(rawUrl); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    const existing = indexByUrl.get(url.href);
    if (existing !== undefined) return existing;
    if (sources.length >= 15) return null;
    const sourceIndex = sources.length;
    indexByUrl.set(url.href, sourceIndex);
    sources.push({
      url: url.href,
      title: typeof rawTitle === 'string' && rawTitle.trim()
        ? rawTitle.trim().slice(0, 180) : url.hostname
    });
    return sourceIndex;
  };
  if (!Array.isArray(response.output)) return { sources, citations };
  // Process quoted sources first so their indices are stable and useful.
  for (const value of response.output) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const fragment of content) {
      if (!fragment || typeof fragment !== 'object') continue;
      const piece = fragment as Record<string, unknown>;
      const annotations = Array.isArray(piece.annotations) ? piece.annotations : [];
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== 'object') continue;
        const ref = annotation as Record<string, unknown>;
        if (ref.type !== 'url_citation') continue;
        const sourceIndex = add(ref.url, ref.title);
        if (sourceIndex !== null && typeof ref.start_index === 'number' &&
          typeof ref.end_index === 'number' && ref.start_index <= ref.end_index) {
          citations.push({ startIndex: ref.start_index, endIndex: ref.end_index, sourceIndex });
        }
      }
    }
  }
  for (const value of response.output) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    if (item.type !== 'web_search_call') continue;
    const action = item.action && typeof item.action === 'object'
      ? item.action as Record<string, unknown> : {};
    for (const rawSource of Array.isArray(action.sources) ? action.sources : []) {
      if (!rawSource || typeof rawSource !== 'object') continue;
      const source = rawSource as Record<string, unknown>;
      add(source.url, source.title);
    }
  }
  return { sources, citations };
}

/** Incrementally combine evidence from multiple provider rounds. */
export function mergeAiWebEvidence(response: { output?: unknown },
  sources: AiWebSource[], citations: AiWebCitation[]) {
  const current = extractAiWebEvidence(response);
  const byUrl = new Map(sources.map((source, index) => [source.url, index]));
  for (const source of current.sources) {
    if (!byUrl.has(source.url) && sources.length < 15) {
      byUrl.set(source.url, sources.length);
      sources.push(source);
    }
  }
  for (const citation of current.citations) {
    const source = current.sources[citation.sourceIndex];
    if (!source) continue;
    const sourceIndex = byUrl.get(source.url);
    if (sourceIndex !== undefined) citations.push({ ...citation, sourceIndex });
  }
}
