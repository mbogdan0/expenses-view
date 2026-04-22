import {
  buildDedupId,
  buildSourceFullCategory,
  fileNameToMainCategory
} from '../csv-and-identity.js';
import { normalizeCurrency, sanitizeText } from '../primitives.js';

export function normalizeImportedRow(rawRow, fileName) {
  const mainCategory = fileNameToMainCategory(fileName);
  const sourceFullCategory = buildSourceFullCategory(mainCategory, rawRow.Category || '');
  const id = buildDedupId(rawRow.Date, sourceFullCategory, rawRow.Price);

  return {
    id,
    source: {
      id,
      date: sanitizeText(rawRow.Date),
      category: sanitizeText(rawRow.Category),
      fullCategory: sourceFullCategory,
      sourceFullCategory,
      price: sanitizeText(rawRow.Price),
      currency: normalizeCurrency(rawRow.Currency),
      rate: sanitizeText(rawRow.Rate),
      rateType: sanitizeText(rawRow['Rate Type']),
      notes: sanitizeText(rawRow.Notes),
      image: sanitizeText(rawRow.Image),
      tags: [],
      fileName: sanitizeText(fileName),
      mainCategory,
      raw: { ...rawRow }
    },
    overrides: {},
    derived: {},
    meta: {
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      importCount: 1,
      fingerprints: []
    }
  };
}

export function mergeImportedRow(existingRow, importedRow, fingerprint) {
  if (!existingRow) {
    const created = {
      ...importedRow,
      meta: {
        ...importedRow.meta,
        fingerprints: fingerprint ? [fingerprint] : []
      }
    };
    return created;
  }

  const fingerprints = new Set(existingRow.meta?.fingerprints || []);
  if (fingerprint) {
    fingerprints.add(fingerprint);
  }

  return {
    ...existingRow,
    source: {
      ...existingRow.source,
      ...importedRow.source
    },
    meta: {
      ...(existingRow.meta || {}),
      lastSeenAt: new Date().toISOString(),
      importCount: Number(existingRow.meta?.importCount || 0) + 1,
      fingerprints: Array.from(fingerprints)
    }
  };
}
