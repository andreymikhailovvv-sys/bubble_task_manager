/** Task descriptions use the same small HTML dialect as the notes editor.
 * Preserve stored markup verbatim when appending; escape plain text before
 * combining it with HTML. Reject unknown tags/attributes in new model HTML. */
export const DESCRIPTION_FORMAT_GUIDE = 'Описание задачи хранится как текст или HTML редактора заметок, не Markdown. Для красивого оформления используй <h1>, <h2>, <p>, <br>, <b>/<strong>, <i>/<em>, <u>, <s>, <ul>/<ol> с <li>. Не используй CSS, style, скрипты, изображения, таблицы HTML, произвольные атрибуты или Markdown-звёздочки. Для ссылок можно оставить обычный URL. Закрывай теги, не оборачивай в блок кода. Для дополнения передай только новый фрагмент; для частичной правки сначала прочитай описание и сохрани все неизменённые сведения.';
const markup = /<(?:a|b|strong|i|em|u|s|del|h1|h2|p|div|br|ul|ol|li|label|input|span)(?:\s[^>]*)?>/i;
const safeTag = /^<\/?(?:h1|h2|p|b|strong|i|em|u|s|del|ul|ol|li|div|span)>$|^<br\s*\/?>$/i;
const escape = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
export function editTaskDescription(previous: string | null, content: unknown, mode: unknown, isSubtask: boolean, format: unknown) {
  if (typeof content !== 'string' || (mode !== 'append' && mode !== 'replace') || (format !== 'text' && format !== 'html'))
    throw new TypeError('Укажите текст, режим append/replace и формат text/html.');
  if (mode === 'append' && !content.trim()) throw new TypeError('Нельзя добавить пустой текст.');
  if (format === 'html') {
    const stack: string[] = [];
    const rest = content.replace(/<[^>]*>/g, tag => {
      if (!safeTag.test(tag)) throw new TypeError('Недопустимая разметка описания.');
      const name = tag.match(/^<\/?([a-z0-9]+)/i)![1].toLowerCase();
      if (name === 'br') return '';
      if (tag.startsWith('</')) {
        if (stack.pop() !== name) throw new TypeError('Неправильно закрытые теги.');
      } else stack.push(name);
      return '';
    });
    if (stack.length || /[<>]/.test(rest)) throw new TypeError('Некорректная HTML-разметка.');
  }
  const old = previous ?? '';
  const html = format === 'html' || (mode === 'append' && markup.test(old));
  const fragment = html && format === 'text' ? escape(content) : content;
  const result = mode === 'replace' || !old ? fragment :
    html ? (markup.test(old) ? old : escape(old)) + '<br><br>' + fragment : old + '\n\n' + fragment;
  if (result.length > (isSubtask ? 2000 : 4000)) throw new TypeError('Описание превышает допустимый размер. Сократите новый фрагмент, не удаляя исходный текст.');
  return result;
}
