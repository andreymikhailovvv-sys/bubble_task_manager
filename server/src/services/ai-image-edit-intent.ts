/**
 * Conservative safeguard for the temporary direct-upload image editor.
 * This is NOT a selection of a historic file: the handler requires the user
 * to attach exactly one image in the same message. References such as "it",
 * "her", "background" or "and now" must not start a paid image edit.
 *
 * In the next stage the model will select an explicit attachment ID and tool.
 */
export function isGeneratedImageEditRequest(question: string): boolean {
  const q = question.normalize('NFKC').trim().toLowerCase().replace(/ё/g, 'е');
  if (!q || q.length > 3200) return false;
  // Do not edit an uploaded image when the request is actually to generate a
  // fresh picture, even if the wording happens to contain an edit verb.
  if (/(?:нов(?:ую|ое|ый|ого)\s+(?:картинк|изображен|рисун|фот)|(?:с\s+нуля)\s+(?:картинк|изображен|рисун))/i.test(q)) return false;
  const edit = /(?:измен|передел|отредактир|поправ|исправ|перерис|поменя|замен|добав|убер|удал|сделай|сделайте|\bedit\b|\bchange\b|\bmodify\b|\breplace\b|\bremove\b|\badd\b)/i.test(q);
  if (!edit) return false;
  // Explicit media reference in the present instruction is mandatory.
  // Generic "цвет", "фон", "его", "нее" can refer to a DOCX or the task itself.
  return /(?:картинк|изображен|рисун|фотограф|фото|снимк|скриншот|png|jpe?g|webp|пиксел|\bimage\b|\bphoto\b|\bpicture\b)/i.test(q);
}
