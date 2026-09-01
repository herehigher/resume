export function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

export function displayText(value, fallback = '') {
  return value ? escapeHTML(value) : `<span class="empty-preview">${escapeHTML(fallback)}</span>`;
}

export function isClickableUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

