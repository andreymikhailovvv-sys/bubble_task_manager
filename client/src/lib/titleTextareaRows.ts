/** Measure wrapped title height without the field's existing minimum height. */
export function measureTitleTextareaRows(textarea: HTMLTextAreaElement, maxRows = 3): number {
  const originalRows = textarea.rows;
  const originalMinHeight = textarea.style.minHeight;
  const originalMaxHeight = textarea.style.maxHeight;
  textarea.style.minHeight = '0px';
  textarea.style.maxHeight = 'none';
  textarea.rows = 1;
  const computed = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 36;
  const verticalPadding = (Number.parseFloat(computed.paddingTop) || 0) + (Number.parseFloat(computed.paddingBottom) || 0);
  const naturalHeight = Math.max(lineHeight, textarea.scrollHeight - verticalPadding - 2);
  const rows = Math.max(1, Math.min(maxRows, Math.ceil((naturalHeight - 1) / lineHeight)));
  textarea.rows = originalRows;
  textarea.style.minHeight = originalMinHeight;
  textarea.style.maxHeight = originalMaxHeight;
  if (document.activeElement !== textarea) {
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
  }
  return rows;
}
