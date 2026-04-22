function trimNumberString(value) {
  if (!Number.isFinite(value)) {
    return '';
  }

  const fixed = value.toFixed(8);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function normalizeHeader(value) {
  return String(value || '')
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase();
}

export function sanitizeText(value) {
  return String(value ?? '').trim();
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value)
    .replace(/\u00A0/g, '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeNumericString(value) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return sanitizeText(value);
  }

  return trimNumberString(parsed);
}

export function normalizeDateForId(value) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    return sanitizeText(value);
  }

  return formatLocalDateTime(parsed);
}

export function parseLocalDateTime(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const input = sanitizeText(value);
  if (!input) {
    return null;
  }

  let match = input.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
      0
    );

    return Number.isFinite(date.getTime()) ? date : null;
  }

  match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const fallback = new Date(input);
  return Number.isFinite(fallback.getTime()) ? fallback : null;
}

export function formatLocalDateTime(value) {
  const date = value instanceof Date ? value : parseLocalDateTime(value);
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatDateInputValue(value) {
  const normalized = normalizeDateForId(value);
  if (!normalized) {
    return '';
  }
  return normalized.replace(' ', 'T');
}

export function displayDateTime(value) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    return sanitizeText(value);
  }
  return formatLocalDateTime(parsed);
}

export function normalizeCurrency(value) {
  return sanitizeText(value).toUpperCase();
}

export function normalizeTags(value) {
  const rawValues = Array.isArray(value) ? value : String(value ?? '').split(',');
  const unique = [];
  const seen = new Set();

  for (const rawValue of rawValues) {
    const tag = sanitizeText(rawValue);
    if (!tag) {
      continue;
    }

    const dedupKey = tag.toLowerCase();
    if (seen.has(dedupKey)) {
      continue;
    }

    seen.add(dedupKey);
    unique.push(tag);
  }

  unique.sort((left, right) =>
    left.localeCompare(right, undefined, {
      sensitivity: 'base'
    })
  );

  return unique;
}

export function formatTagsInput(value) {
  return normalizeTags(value).join(', ');
}
