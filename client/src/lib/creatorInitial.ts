/** A compact display label for the author of a collaborative subtask. */
export function getCreatorInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '';
}
