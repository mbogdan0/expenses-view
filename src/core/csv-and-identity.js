import { CSV_HEADERS } from './constants.js';
import {
  normalizeDateForId,
  normalizeHeader,
  normalizeNumericString,
  sanitizeText
} from './primitives.js';

const headerAliasMap = new Map(CSV_HEADERS.map((header) => [normalizeHeader(header), header]));

function canonicalCategory(value) {
  return sanitizeText(value).toLowerCase();
}

export function buildSourceFullCategory(fileName, category) {
  const mainCategory = fileNameToMainCategory(fileName);
  const subCategory = sanitizeText(category) || 'Uncategorized';
  return `${mainCategory} / ${subCategory}`;
}

export function fileNameToMainCategory(fileName) {
  return sanitizeText(fileName).replace(/\.csv$/i, '').trim();
}

export function buildDedupId(sourceDate, sourceFullCategory, sourcePrice) {
  const normalizedDate = normalizeDateForId(sourceDate);
  const normalizedCategory = canonicalCategory(sourceFullCategory);
  const normalizedPrice = normalizeNumericString(sourcePrice);
  return `${normalizedDate}|${normalizedCategory}|${normalizedPrice}`;
}

export function hashFNV1a(value) {
  const input = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildFileFingerprint({ name, size, lastModified, content }) {
  const textHash = hashFNV1a(content);
  return `${sanitizeText(name)}|${size}|${lastModified}|${textHash}`;
}

export function parseCsvText(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const text = String(csvText || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      if (nextChar === '\n') {
        continue;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function parseExpenseCsv(csvText) {
  const matrix = parseCsvText(csvText);
  if (!matrix.length) {
    return [];
  }

  const [headerRow, ...rows] = matrix;

  const normalizedHeaders = headerRow.map(
    (header) => headerAliasMap.get(normalizeHeader(header)) || sanitizeText(header)
  );
  const headerToIndex = new Map(normalizedHeaders.map((header, index) => [header, index]));

  return rows
    .filter((row) => row.some((cell) => sanitizeText(cell) !== ''))
    .map((row) => {
      const record = {};
      CSV_HEADERS.forEach((header) => {
        const position = headerToIndex.get(header);
        record[header] = position !== undefined ? sanitizeText(row[position] ?? '') : '';
      });
      return record;
    });
}
