/** Decide only when we can confidently recognize retrieval of stored user data.
 * Ordinary chat, product questions, note creation and task mutations remain automatic. */
export type ForcedPersonalLookup = 'search_notes' | 'search_workspace';

export function selectRequiredPersonalLookup(question: string): ForcedPersonalLookup | null {
  const text = question.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  if (!text || text.length > 8000) return null;

  const mentionsNotes = /\bзамет(?:ка|ку|ки|ок|ках|ках|ке|ками|ками|ок)|\bзапис(?:ь|и|ей|ях|ью)|\bблокнот(?:а|е|ы)?\b/.test(text);
  const mentionsTasks = /\bзадач(?:а|у|и|ей|ах|ами|е)|\bподзадач(?:а|и|у|ах)|\bдела(?:х|ми)?\b/.test(text);
  const retrieval = /\b(?:найд\w*|поищ\w*|ищ\w*|отыщ\w*|поиск\w*|покаж\w*|прочит\w*|открой\w*|посмотр\w*|содерж\w*|напис\w*|запис\w*|говор\w*|упомин\w*|хран\w*)\b/.test(text);
  const personal = /\b(?:я|мне|мои|моих|моей|мое|у меня|мы|наш|наши|наших|где-то|когда-то)\b/.test(text);
  const vaguePast = /(?:где|что|о чем|про что|помнишь|напомни)\s+(?:(?:я|мы|мне|у меня)\s+)?(?:раньше\s+|где-то\s+|когда-то\s+)?(?:писал\w*|записал\w*|упоминал\w*|сохранял\w*|отмечал\w*)/.test(text);
  const vagueLookup = /(?:где\s+(?:у меня\s+)?(?:это\s+)?(?:было|написано|записано)|я\s+где-то\s+(?:писал|записал)|что\s+у\s+меня\s+(?:было|есть)\s+про)/.test(text);
  // A mention of a stored note without a request to retrieve it is not a lookup.
  // «Добавь заметку» must not force a search.
  if (mentionsNotes && (retrieval || /\b(?:что|где|какие|какая|есть ли)\b/.test(text))) {
    return mentionsTasks ? 'search_workspace' : 'search_notes';
  }
  if (personal && (vaguePast || vagueLookup)) return 'search_workspace';
  return null;
}
