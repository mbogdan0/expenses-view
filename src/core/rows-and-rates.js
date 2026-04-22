import {
  normalizeCurrency,
  normalizeTags,
  parseLocalDateTime,
  parseNumber,
  sanitizeText
} from './primitives.js';
import {
  buildDedupId,
  buildSourceFullCategory,
  fileNameToMainCategory
} from './csv-and-identity.js';
import {
  applyCategoryMergeToEffectiveRow,
  buildCategoryMergeRuntime
} from './category-merge.js';
import { ensureTagGroupsModel, validateRowTagsAgainstGroups } from './tag-groups.js';

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function pickEditableField(source, overrides, fieldName) {
  if (overrides && hasOwn(overrides, fieldName)) {
    return overrides[fieldName];
  }
  return source[fieldName];
}

export function computeEffectiveRow(source, overrides = {}, categoryMergeRuntime = null) {
  const baseFullCategory = pickEditableField(source, overrides, 'fullCategory') || source.sourceFullCategory;
  const tags = normalizeTags(pickEditableField(source, overrides, 'tags'));

  const baseRow = {
    id: source.id,
    originalCategory: source.category || '',
    originalSourceFullCategory: source.sourceFullCategory || '',
    date: pickEditableField(source, overrides, 'date') || '',
    fullCategory: baseFullCategory,
    baseFullCategory,
    price: pickEditableField(source, overrides, 'price') || '',
    currency: normalizeCurrency(pickEditableField(source, overrides, 'currency') || ''),
    rate: pickEditableField(source, overrides, 'rate') || '',
    rateType: pickEditableField(source, overrides, 'rateType') || '',
    notes: pickEditableField(source, overrides, 'notes') || '',
    image: pickEditableField(source, overrides, 'image') || '',
    tags,
    categoryMergeStatus: 'none',
    categoryMergeMaster: null
  };

  if (!categoryMergeRuntime) {
    return baseRow;
  }

  return applyCategoryMergeToEffectiveRow(baseRow, categoryMergeRuntime);
}

function buildRateCandidates(rows) {
  return rows
    .map((row) => {
      const currency = normalizeCurrency(row.currency);
      const rate = parseNumber(row.rate);
      const timestamp = parseLocalDateTime(row.date)?.getTime() ?? null;
      if (!currency || currency === 'UAH' || rate === null || rate <= 0 || timestamp === null) {
        return null;
      }
      return {
        id: row.id,
        currency,
        rate,
        timestamp
      };
    })
    .filter(Boolean);
}

export function resolveRate(row, allRows) {
  const amount = parseNumber(row.price);
  if (amount === null) {
    return {
      status: 'invalid_amount',
      unresolved: true,
      warning: 'Invalid amount value'
    };
  }

  const currency = normalizeCurrency(row.currency);
  if (!currency) {
    return {
      status: 'invalid_currency',
      unresolved: true,
      warning: 'Currency is empty'
    };
  }

  if (currency === 'UAH') {
    return {
      status: 'resolved',
      unresolved: false,
      usedRate: 1,
      rateSource: 'native',
      uahAmount: amount
    };
  }

  const explicitRate = parseNumber(row.rate);
  if (explicitRate !== null && explicitRate > 0) {
    return {
      status: 'resolved',
      unresolved: false,
      usedRate: explicitRate,
      rateSource: 'explicit',
      uahAmount: amount * explicitRate
    };
  }

  const targetTimestamp = parseLocalDateTime(row.date)?.getTime() ?? null;
  const candidates = buildRateCandidates(allRows).filter((candidate) => candidate.currency === currency);

  if (candidates.length) {
    const nearest = candidates
      .map((candidate) => ({
        ...candidate,
        distance:
          targetTimestamp === null
            ? Number.MAX_SAFE_INTEGER
            : Math.abs(candidate.timestamp - targetTimestamp)
      }))
      .sort((left, right) => {
        if (left.distance !== right.distance) {
          return left.distance - right.distance;
        }
        return right.timestamp - left.timestamp;
      })[0];

    return {
      status: 'resolved',
      unresolved: false,
      usedRate: nearest.rate,
      rateSource: `nearest:${nearest.id}`,
      uahAmount: amount * nearest.rate
    };
  }

  return {
    status: 'missing_rate',
    unresolved: true,
    warning: `Missing conversion rate for ${currency}`
  };
}

export function recomputeDerivedRows(rowsById, tagGroupsInput = '', categoryMergeInput = '') {
  const records = Object.values(rowsById || {});
  const baseEffectiveRows = records.map((record) => computeEffectiveRow(record.source, record.overrides));
  const tagGroupsModel = ensureTagGroupsModel(tagGroupsInput);
  const availableBaseCategories = new Set(
    baseEffectiveRows
      .map((row) => row.baseFullCategory || row.fullCategory)
      .filter(Boolean)
  );
  const categoryMergeRuntime = buildCategoryMergeRuntime(categoryMergeInput, availableBaseCategories);
  const effectiveRows = baseEffectiveRows.map((row) =>
    applyCategoryMergeToEffectiveRow(row, categoryMergeRuntime)
  );

  const effectiveById = new Map(effectiveRows.map((row) => [row.id, row]));
  const nextRowsById = {};

  for (const record of records) {
    const effective = effectiveById.get(record.id);
    const conversion = resolveRate(effective, effectiveRows);
    const effectiveDate = parseLocalDateTime(effective.date);
    const tagValidation = validateRowTagsAgainstGroups(effective.tags, tagGroupsModel);

    nextRowsById[record.id] = {
      ...record,
      derived: {
        conversionStatus: conversion.status,
        unresolved: Boolean(conversion.unresolved),
        warning: conversion.warning || null,
        usedRate: conversion.usedRate ?? null,
        rateSource: conversion.rateSource ?? null,
        uahAmount: conversion.uahAmount ?? null,
        effectiveDateEpoch: effectiveDate ? effectiveDate.getTime() : null,
        baseFullCategory: effective.baseFullCategory || effective.fullCategory || '',
        finalFullCategory: effective.fullCategory || '',
        categoryMergeStatus: effective.categoryMergeStatus || 'none',
        categoryMergeMaster: effective.categoryMergeMaster || null,
        tagValidation: {
          isValid: tagValidation.isValid,
          unknownTags: tagValidation.unknownTags,
          duplicateGroups: tagValidation.duplicateGroups,
          errors: tagValidation.errors,
          taxonomyValid: tagValidation.taxonomyValid
        }
      }
    };
  }

  return nextRowsById;
}

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
