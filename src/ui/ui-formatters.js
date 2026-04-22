export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/\n/g, ' ');
}

export function formatFinalCategoryHtml(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const slashIndex = raw.indexOf('/');
  if (slashIndex < 0) {
    return escapeHtml(raw);
  }

  const left = raw.slice(0, slashIndex).trim();
  const right = raw.slice(slashIndex + 1).trim();

  if (!left) {
    return escapeHtml(raw);
  }

  if (!right) {
    return `<strong>${escapeHtml(left)}</strong> /`;
  }

  return `<strong>${escapeHtml(left)}</strong> / ${escapeHtml(right)}`;
}
