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
import { USD_RATE_COVERAGE_DAYS } from './constants.js';
import { ensureTagGroupsModel, validateRowTagsAgainstGroups } from './tag-groups.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function normalizeToDayEpoch(value) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    return null;
  }

  const dayStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  return dayStart.getTime();
}

function formatDayEpoch(dayEpoch) {
  const date = new Date(dayEpoch);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDayEpoch() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
}

function parseStrictDateOnly(dateText) {
  const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return {
    dateText: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    dayEpoch: parsed.getTime()
  };
}

function parseStrictPair(pairText) {
  const match = String(pairText || '').match(/^([A-Za-z]{3})\/USD$/);
  if (!match) {
    return null;
  }

  const base = normalizeCurrency(match[1]);
  return `${base}/USD`;
}

function toRatesModel(entries, issues) {
  const byPair = new Map();
  for (const entry of entries) {
    const list = byPair.get(entry.pair) || [];
    list.push(entry);
    byPair.set(entry.pair, list);
  }

  for (const list of byPair.values()) {
    list.sort((left, right) => left.dayEpoch - right.dayEpoch);
  }

  return {
    entries,
    byPair,
    issues,
    isValid: issues.length === 0
  };
}

export function parseManualUsdRatesText(manualUsdRatesText) {
  const lines = String(manualUsdRatesText || '').split(/\r?\n/);
  const issues = [];
  const dedupedEntries = [];
  const indexByPairAndDate = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      continue;
    }

    const match = trimmedLine.match(/^"([^"]*)";"([^"]*)";"([^"]*)"$/);
    if (!match) {
      issues.push({
        line: lineNumber,
        type: 'invalid_format',
        message: `Line ${lineNumber}: use strict format \"YYYY-MM-DD\";\"CUR/USD\";\"rate\".`
      });
      continue;
    }

    const [, dateText, pairText, rateText] = match;
    const parsedDate = parseStrictDateOnly(dateText);
    if (!parsedDate) {
      issues.push({
        line: lineNumber,
        type: 'invalid_date',
        message: `Line ${lineNumber}: invalid date \"${dateText}\".`
      });
      continue;
    }

    const pair = parseStrictPair(pairText);
    if (!pair) {
      issues.push({
        line: lineNumber,
        type: 'invalid_pair',
        message: `Line ${lineNumber}: pair must match \"CUR/USD\".`
      });
      continue;
    }

    const rate = parseNumber(rateText);
    if (rate === null || rate <= 0) {
      issues.push({
        line: lineNumber,
        type: 'invalid_rate',
        message: `Line ${lineNumber}: rate must be a positive number.`
      });
      continue;
    }

    const entry = {
      line: lineNumber,
      date: parsedDate.dateText,
      pair,
      rate,
      dayEpoch: parsedDate.dayEpoch
    };

    const dedupKey = `${pair}|${parsedDate.dateText}`;
    if (indexByPairAndDate.has(dedupKey)) {
      const existingIndex = indexByPairAndDate.get(dedupKey);
      dedupedEntries[existingIndex] = entry;
      continue;
    }

    indexByPairAndDate.set(dedupKey, dedupedEntries.length);
    dedupedEntries.push(entry);
  }

  return toRatesModel(dedupedEntries, issues);
}

function collectUsdPairDateRanges(rows) {
  const byPair = new Map();

  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    if (!currency || currency === 'USD') {
      continue;
    }

    const pair = `${currency}/USD`;
    const dayEpoch = normalizeToDayEpoch(row.date);
    const existing = byPair.get(pair) || {
      pair,
      firstExpenseDay: null,
      lastExpenseDay: null,
      expenseRowsCount: 0,
      validDateRowsCount: 0
    };

    existing.expenseRowsCount += 1;

    if (dayEpoch !== null) {
      existing.validDateRowsCount += 1;
      existing.firstExpenseDay =
        existing.firstExpenseDay === null ? dayEpoch : Math.min(existing.firstExpenseDay, dayEpoch);
      existing.lastExpenseDay =
        existing.lastExpenseDay === null ? dayEpoch : Math.max(existing.lastExpenseDay, dayEpoch);
    }

    byPair.set(pair, existing);
  }

  return Array.from(byPair.values()).sort((left, right) => left.pair.localeCompare(right.pair));
}

function buildCoverageWindows(firstExpenseDay, lastExpenseDay, coverageDays) {
  if (firstExpenseDay === null || lastExpenseDay === null) {
    return [];
  }

  const windows = [];
  const intervalMs = Math.max(1, Number(coverageDays) || 1) * DAY_MS;

  for (let windowStart = firstExpenseDay; windowStart <= lastExpenseDay; windowStart += intervalMs) {
    windows.push({
      windowStart,
      windowEndExclusive: windowStart + intervalMs
    });
  }

  return windows;
}

function isWindowCovered(window, knownRates) {
  for (const rateEntry of knownRates) {
    if (rateEntry.dayEpoch >= window.windowStart && rateEntry.dayEpoch < window.windowEndExclusive) {
      return true;
    }
  }

  return false;
}

export function buildUsdCoverageReport(
  rows,
  manualRatesModelOrText,
  coverageDays = USD_RATE_COVERAGE_DAYS
) {
  const parsedRates =
    typeof manualRatesModelOrText === 'string'
      ? parseManualUsdRatesText(manualRatesModelOrText)
      : manualRatesModelOrText || parseManualUsdRatesText('');

  const pairRanges = collectUsdPairDateRanges(rows || []);
  const missingRequests = [];
  const todayDayEpoch = getTodayDayEpoch();

  const pairStats = pairRanges.map((pairRange) => {
    const knownRates = parsedRates.byPair.get(pairRange.pair) || [];
    const cappedLastExpenseDay =
      pairRange.lastExpenseDay === null ? null : Math.min(pairRange.lastExpenseDay, todayDayEpoch);
    const windows = buildCoverageWindows(
      pairRange.firstExpenseDay,
      cappedLastExpenseDay,
      coverageDays
    );

    const missingWindows = [];
    let coveredWindows = 0;

    for (const window of windows) {
      if (isWindowCovered(window, knownRates)) {
        coveredWindows += 1;
        continue;
      }

      const missingDate = formatDayEpoch(window.windowStart);
      missingWindows.push(missingDate);
      missingRequests.push({
        date: missingDate,
        pair: pairRange.pair,
        line: `"${missingDate}";"${pairRange.pair}"`
      });
    }

    return {
      pair: pairRange.pair,
      expenseRowsCount: pairRange.expenseRowsCount,
      validDateRowsCount: pairRange.validDateRowsCount,
      knownRatesCount: knownRates.length,
      firstExpenseDate:
        pairRange.firstExpenseDay === null ? null : formatDayEpoch(pairRange.firstExpenseDay),
      lastExpenseDate:
        pairRange.lastExpenseDay === null ? null : formatDayEpoch(pairRange.lastExpenseDay),
      coverageEndDate:
        cappedLastExpenseDay === null ? null : formatDayEpoch(cappedLastExpenseDay),
      windowsCount: windows.length,
      coveredWindows,
      missingWindowsCount: missingWindows.length,
      missingWindows
    };
  });

  return {
    coverageDays: Math.max(1, Number(coverageDays) || 1),
    parsedRates,
    requiredPairs: pairStats.map((item) => item.pair),
    pairStats,
    missingRequests,
    missingRequestsText: missingRequests.map((item) => item.line).join('\n'),
    isComplete: missingRequests.length === 0
  };
}

export function buildUsdCoverageReportForRowsById(
  rowsById,
  manualUsdRatesText,
  coverageDays = USD_RATE_COVERAGE_DAYS
) {
  const records = Object.values(rowsById || {});
  const effectiveRows = records.map((record) => computeEffectiveRow(record.source, record.overrides));
  return buildUsdCoverageReport(effectiveRows, manualUsdRatesText, coverageDays);
}

function pickNearestRateByDay(targetTimestamp, candidates) {
  if (!candidates.length) {
    return null;
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      distance: Math.abs(candidate.dayEpoch - targetTimestamp)
    }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return right.dayEpoch - left.dayEpoch;
    })[0];
}

function pickLatestKnownRate(candidates) {
  if (!candidates.length) {
    return null;
  }

  return [...candidates].sort((left, right) => right.dayEpoch - left.dayEpoch)[0];
}

export function resolveUsdRate(row, manualRatesModelOrText) {
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

  if (currency === 'USD') {
    return {
      status: 'resolved',
      unresolved: false,
      usedRate: 1,
      rateSource: 'native',
      usdAmount: amount
    };
  }

  const parsedRates =
    typeof manualRatesModelOrText === 'string'
      ? parseManualUsdRatesText(manualRatesModelOrText)
      : manualRatesModelOrText || parseManualUsdRatesText('');

  const targetTimestamp = parseLocalDateTime(row.date)?.getTime() ?? null;
  if (targetTimestamp === null) {
    return {
      status: 'invalid_date',
      unresolved: true,
      warning: 'Date is empty or invalid'
    };
  }

  const pair = `${currency}/USD`;
  const candidates = parsedRates.byPair.get(pair) || [];
  if (!candidates.length) {
    return {
      status: 'missing_manual_rate',
      unresolved: true,
      warning: `Missing manual USD rate for ${pair}`
    };
  }

  const targetDayEpoch = normalizeToDayEpoch(row.date);
  const todayDayEpoch = getTodayDayEpoch();
  const isFutureRow = targetDayEpoch !== null && targetDayEpoch > todayDayEpoch;

  const selectedRate = isFutureRow
    ? pickLatestKnownRate(candidates.filter((candidate) => candidate.dayEpoch <= todayDayEpoch))
    : pickNearestRateByDay(targetTimestamp, candidates);

  if (!selectedRate) {
    return {
      status: 'missing_manual_rate',
      unresolved: true,
      warning: `Missing manual USD rate for ${pair}`
    };
  }

  return {
    status: 'resolved',
    unresolved: false,
    usedRate: selectedRate.rate,
    rateSource: `manual:${pair}:${selectedRate.date}`,
    usdAmount: amount / selectedRate.rate
  };
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

export function recomputeDerivedRows(
  rowsById,
  tagGroupsInput = '',
  categoryMergeInput = '',
  manualUsdRatesInput = ''
) {
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
  const manualUsdRatesModel = parseManualUsdRatesText(manualUsdRatesInput);

  const effectiveById = new Map(effectiveRows.map((row) => [row.id, row]));
  const nextRowsById = {};

  for (const record of records) {
    const effective = effectiveById.get(record.id);
    const conversion = resolveRate(effective, effectiveRows);
    const usdConversion = resolveUsdRate(effective, manualUsdRatesModel);
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
        usdConversionStatus: usdConversion.status,
        usdUnresolved: Boolean(usdConversion.unresolved),
        usdWarning: usdConversion.warning || null,
        usdUsedRate: usdConversion.usedRate ?? null,
        usdRateSource: usdConversion.rateSource ?? null,
        usdAmount: usdConversion.usdAmount ?? null,
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
