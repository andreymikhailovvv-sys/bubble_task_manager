const ALLOWED_NOTE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'P', 'DIV', 'BR']);
const NOTE_HTML_PATTERN = /<(?:b|strong|i|em|u|h1|h2|p|div|br)(?:\s[^>]*)?>/i;

export function isFormattedNoteHtml(value?: string | null) {
  return Boolean(value && NOTE_HTML_PATTERN.test(value));
}

export function escapeNoteText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeElement(element: Element) {
  Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));

  Array.from(element.children).forEach((child) => {
    if (!ALLOWED_NOTE_TAGS.has(child.tagName)) {
      child.replaceWith(...Array.from(child.childNodes));
      return;
    }
    sanitizeElement(child);
  });
}

export function sanitizeNoteHtml(value: string) {
  if (typeof document === 'undefined') return value;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = value;
  sanitizeElement(wrapper);
  return wrapper.innerHTML;
}

export function noteValueToEditorHtml(value: string) {
  if (!value.trim()) return '';
  if (isFormattedNoteHtml(value)) return sanitizeNoteHtml(value);
  return escapeNoteText(value).replace(/\n/g, '<br>');
}

export function noteHtmlToPlainText(value: string) {
  if (!value.trim()) return '';
  if (typeof document === 'undefined') return value.replace(/<[^>]+>/g, '');

  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeNoteHtml(value).replace(/<br\s*\/?>/gi, '\n');
  wrapper.querySelectorAll('h1,h2,p,div').forEach((block) => {
    if (block.nextSibling) block.append(document.createTextNode('\n'));
  });
  return (wrapper.textContent ?? '').replace(/\n{3,}/g, '\n\n').trimEnd();
}
