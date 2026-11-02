/** Parses only the answer string of a streamed JSON-schema response.
 * Tool arguments, document metadata and other JSON fields are never rendered.
 * The authoritative result still comes from response.completed.
 */
export class IncrementalJsonAnswer {
  private raw = '';
  private shown = '';
  push(delta: string): string {
    this.raw += delta;
    const match = /"answer"\s*:\s*"/.exec(this.raw);
    if (!match) return '';
    let escaped = false;
    let encoded = '';
    for (let index = match.index + match[0].length; index < this.raw.length; index += 1) {
      const char = this.raw[index];
      if (char === '"' && !escaped) break;
      encoded += char;
      if (char === '\\' && !escaped) escaped = true;
      else escaped = false;
    }
    // An unfinished JSON escape is not user-visible text.
    if (escaped) encoded = encoded.slice(0, -1);
    let decoded: string;
    try { decoded = JSON.parse('"' + encoded + '"') as string; }
    catch { return ''; }
    if (!decoded.startsWith(this.shown)) return '';
    const added = decoded.slice(this.shown.length);
    this.shown = decoded;
    return added;
  }
}
