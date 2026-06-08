const ALLOWED_NOTE_TAGS = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'LABEL', 'INPUT', 'SPAN']);
const NOTE_HTML_PATTERN = /<(?:a|b|strong|i|em|u|h1|h2|p|div|br|ul|ol|li|label|input|span)(?:\s[^>]*)?>/i;
const LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

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

export function normalizeNoteHref(raw: string) {
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
}

function isSafeNoteHref(href: string) {
  return /^https?:\/\/.+/i.test(href);
}

function setSafeLinkAttributes(element: Element, href: string) {
  element.setAttribute('href', href);
  element.setAttribute('target', '_blank');
  element.setAttribute('rel', 'noreferrer noopener');
}

function sanitizeElement(element: Element) {
  const href = element.tagName === 'A' ? normalizeNoteHref(element.getAttribute('href') ?? '') : '';
  const className = element.getAttribute('class') ?? '';
  const isCheckedInput = element.tagName === 'INPUT'
    && (element.getAttribute('type') ?? '').toLowerCase() === 'checkbox'
    && element.hasAttribute('checked');
  Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));

  if (element.tagName === 'A') {
    if (!isSafeNoteHref(href)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    setSafeLinkAttributes(element, href);
  }

  if (element.tagName === 'INPUT') {
    element.setAttribute('type', 'checkbox');
    if (isCheckedInput) element.setAttribute('checked', '');
  }

  const safeClasses = className
    .split(/\s+/)
    .filter((item) => ['note-list', 'note-list-ordered', 'note-list-unordered', 'note-checklist', 'note-checkbox-item', 'note-checkbox-item-checked'].includes(item));
  if (safeClasses.length > 0) {
    element.setAttribute('class', safeClasses.join(' '));
  }

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

function linkifyTextNode(textNode: Text) {
  const value = textNode.textContent ?? '';
  LINK_PATTERN.lastIndex = 0;
  if (!LINK_PATTERN.test(value)) return;
  LINK_PATTERN.lastIndex = 0;

  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  value.replace(LINK_PATTERN, (match, _url, offset: number) => {
    if (offset > lastIndex) {
      fragment.append(document.createTextNode(value.slice(lastIndex, offset)));
    }
    const anchor = document.createElement('a');
    setSafeLinkAttributes(anchor, normalizeNoteHref(match));
    anchor.textContent = match;
    fragment.append(anchor);
    lastIndex = offset + match.length;
    return match;
  });
  if (lastIndex < value.length) {
    fragment.append(document.createTextNode(value.slice(lastIndex)));
  }
  textNode.replaceWith(fragment);
}

export function linkifyNoteHtml(value: string) {
  if (typeof document === 'undefined') return value;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeNoteHtml(value);
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('a')) return NodeFilter.FILTER_REJECT;
      LINK_PATTERN.lastIndex = 0;
      return LINK_PATTERN.test(node.textContent ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  nodes.forEach(linkifyTextNode);
  return sanitizeNoteHtml(wrapper.innerHTML);
}

export function noteValueToEditorHtml(value: string) {
  if (!value.trim()) return '';
  if (isFormattedNoteHtml(value)) return linkifyNoteHtml(value);
  return linkifyNoteHtml(escapeNoteText(value).replace(/\n/g, '<br>'));
}

export function noteHtmlToPlainText(value: string, options: { trimEnd?: boolean } = {}) {
  const shouldTrimEnd = options.trimEnd ?? true;
  if (!value.trim()) return '';
  if (typeof document === 'undefined') return value.replace(/<[^>]+>/g, '');

  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeNoteHtml(value).replace(/<br\s*\/?>/gi, '\n');
  wrapper.querySelectorAll('h1,h2,p,div,li,label').forEach((block) => {
    if (block.nextSibling) block.append(document.createTextNode('\n'));
  });
  const plainText = (wrapper.textContent ?? '').replace(/\n{3,}/g, '\n\n');
  return shouldTrimEnd ? plainText.trimEnd() : plainText;
}
