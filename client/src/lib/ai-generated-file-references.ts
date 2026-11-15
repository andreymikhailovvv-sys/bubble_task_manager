/**
 * AI tools may leave a machine-readable file pointer in the assistant's prose.
 * It is never a URL and never proof that a file exists or belongs to this user.
 * The UI resolves it through an authenticated metadata endpoint.
 */
const GENERATED_FILE_REF = /\[\[file_ref=([A-Za-z0-9_-]{8,128})\]\]/g;

export function generatedFileReferenceId(content: string): string | null {
  GENERATED_FILE_REF.lastIndex = 0;
  return GENERATED_FILE_REF.exec(content)?.[1] ?? null;
}

/** Hide raw tool identifiers in rendered assistant prose, not in stored history. */
export function stripGeneratedFileReferences(content: string): string {
  GENERATED_FILE_REF.lastIndex = 0;
  return content.replace(GENERATED_FILE_REF, '').replace(/[ \t]{2,}/g, ' ').trim();
}
