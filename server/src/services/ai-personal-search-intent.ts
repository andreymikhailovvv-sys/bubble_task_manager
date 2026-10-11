/** Force a read-only lookup only when the user clearly requests their stored information. */
export type ForcedPersonalLookup = 'search_notes' | 'search_workspace';

export function selectRequiredPersonalLookup(question: string): ForcedPersonalLookup | null {
  const text = question.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  if (!text || text.length > 8000) return null;

  // Avoid JS \b and \w for Cyrillic: by default those identify ASCII word characters.
  const mentionsNotes = /заметк|заметок|запис[ьи]|записей|запися|блокнот/.test(text);
  const mentionsTasks = /задач|подзадач/.test(text);
  const retrieval = /найд|поищ|ищу|ищем|искать|отыщ|поиск|покаж|прочит|откро|посмотр|содерж|что\s+(?:у\s+меня\s+)?(?:в|на)\s+(?:моих\s+)?заметк|какие\s+у\s+меня\s+заметк/.test(text);
  const vaguePast = /(?:я|мы|мне|у\s+меня)\s+(?:где[\s-]*то\s+|когда[\s-]*то\s+|раньше\s+)?(?:писал|писала|записал|записала|упоминал|сохранял)/.test(text);
  const vagueLookup = /(?:где\s+(?:я\s+)?(?:это\s+)?(?:писал|записал|написал)|где\s+(?:у\s+меня\s+)?(?:это\s+)?(?:было|написано|записано)|что\s+у\s+меня\s+(?:было|есть)\s+про)/.test(text);
  if (mentionsNotes && retrieval) return mentionsTasks ? 'search_workspace' : 'search_notes';
  if (vagueLookup || (vaguePast && /где|что|найд|поищ|ищ|напомни|было\s+про/.test(text))) {
    return 'search_workspace';
  }
  return null;
}
