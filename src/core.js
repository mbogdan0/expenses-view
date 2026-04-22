export const STORAGE_VERSION = 2;
export const STORAGE_KEY = 'expense-consolidator-state-v1';
export const SCREEN_DATA = 'data';
export const SCREEN_CHARTS = 'charts';
export const SCREEN_DATA_OPS = 'data-ops';

export const CSV_HEADERS = [
  'Date',
  'Category',
  'Price',
  'Currency',
  'Rate',
  'Rate Type',
  'Notes',
  'Image'
];

const headerAliasMap = new Map(
  CSV_HEADERS.map((header) => [normalizeHeader(header), header])
);
const supportedScreens = new Set([SCREEN_DATA, SCREEN_CHARTS, SCREEN_DATA_OPS]);
const supportedFilterStatus = new Set(['all', 'resolved', 'unresolved']);

function normalizeHeader(value) {
  return String(value || '')
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase();
}

function sanitizeText(value) {
  return String(value ?? '').trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeActiveScreen(screenName) {
  return supportedScreens.has(screenName) ? screenName : SCREEN_DATA;
}

function trimNumberString(value) {
  if (!Number.isFinite(value)) {
    return '';
  }

  const fixed = value.toFixed(8);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
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

  return unique;
}

export function formatTagsInput(value) {
  return normalizeTags(value).join(', ');
}

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

  const normalizedHeaders = headerRow.map((header) => headerAliasMap.get(normalizeHeader(header)) || sanitizeText(header));
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

export function createEmptyState() {
  return {
    version: STORAGE_VERSION,
    rowsById: {},
    importHistory: [],
    uiPrefs: {
      activeScreen: SCREEN_DATA,
      showExtraColumns: false,
      filters: {
        search: '',
        tag: '',
        dateFrom: '',
        dateTo: '',
        status: 'all'
      }
    },
    updatedAt: new Date().toISOString()
  };
}

export function validateStateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return 'Snapshot root must be an object.';
  }

  if (!Number.isInteger(snapshot.version) || snapshot.version !== STORAGE_VERSION) {
    return `Unsupported snapshot version. Expected ${STORAGE_VERSION}.`;
  }

  if (!isPlainObject(snapshot.rowsById)) {
    return 'Snapshot rowsById must be an object.';
  }

  for (const [rowId, record] of Object.entries(snapshot.rowsById)) {
    if (!isPlainObject(record)) {
      return `Snapshot row "${rowId}" must be an object.`;
    }
    if (typeof record.id !== 'string' || !record.id) {
      return `Snapshot row "${rowId}" must have a non-empty id.`;
    }
    if (!isPlainObject(record.source)) {
      return `Snapshot row "${rowId}" must contain source object.`;
    }
    if (!isPlainObject(record.overrides)) {
      return `Snapshot row "${rowId}" must contain overrides object.`;
    }
  }

  if (!Array.isArray(snapshot.importHistory)) {
    return 'Snapshot importHistory must be an array.';
  }

  for (let index = 0; index < snapshot.importHistory.length; index += 1) {
    if (!isPlainObject(snapshot.importHistory[index])) {
      return `Snapshot importHistory[${index}] must be an object.`;
    }
  }

  if (!isPlainObject(snapshot.uiPrefs)) {
    return 'Snapshot uiPrefs must be an object.';
  }

  if (typeof snapshot.uiPrefs.activeScreen !== 'string' || !supportedScreens.has(snapshot.uiPrefs.activeScreen)) {
    return 'Snapshot uiPrefs.activeScreen is invalid.';
  }

  if (typeof snapshot.uiPrefs.showExtraColumns !== 'boolean') {
    return 'Snapshot uiPrefs.showExtraColumns must be a boolean.';
  }

  const filters = snapshot.uiPrefs.filters;
  if (!isPlainObject(filters)) {
    return 'Snapshot uiPrefs.filters must be an object.';
  }

  const requiredFilterFields = ['search', 'tag', 'dateFrom', 'dateTo', 'status'];
  for (const fieldName of requiredFilterFields) {
    if (typeof filters[fieldName] !== 'string') {
      return `Snapshot uiPrefs.filters.${fieldName} must be a string.`;
    }
  }

  if (!supportedFilterStatus.has(filters.status)) {
    return 'Snapshot uiPrefs.filters.status is invalid.';
  }

  if (typeof snapshot.updatedAt !== 'string' || !snapshot.updatedAt.trim()) {
    return 'Snapshot updatedAt must be a non-empty string.';
  }

  return null;
}

export function parseStateSnapshotJson(snapshotText) {
  let parsed;
  try {
    parsed = JSON.parse(String(snapshotText ?? ''));
  } catch (_error) {
    return { ok: false, error: 'Invalid JSON.' };
  }

  const validationError = validateStateSnapshot(parsed);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  return {
    ok: true,
    state: sanitizeLoadedState(parsed)
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function pickEditableField(source, overrides, fieldName) {
  if (overrides && hasOwn(overrides, fieldName)) {
    return overrides[fieldName];
  }
  return source[fieldName];
}

export function computeEffectiveRow(source, overrides = {}) {
  const fullCategory = pickEditableField(source, overrides, 'fullCategory') || source.sourceFullCategory;
  const tags = normalizeTags(pickEditableField(source, overrides, 'tags'));

  return {
    id: source.id,
    originalCategory: source.category || '',
    originalSourceFullCategory: source.sourceFullCategory || '',
    date: pickEditableField(source, overrides, 'date') || '',
    fullCategory,
    price: pickEditableField(source, overrides, 'price') || '',
    currency: normalizeCurrency(pickEditableField(source, overrides, 'currency') || ''),
    rate: pickEditableField(source, overrides, 'rate') || '',
    rateType: pickEditableField(source, overrides, 'rateType') || '',
    notes: pickEditableField(source, overrides, 'notes') || '',
    image: pickEditableField(source, overrides, 'image') || '',
    tags
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

export function recomputeDerivedRows(rowsById) {
  const records = Object.values(rowsById || {});
  const effectiveRows = records.map((record) => computeEffectiveRow(record.source, record.overrides));

  const effectiveById = new Map(effectiveRows.map((row) => [row.id, row]));
  const nextRowsById = {};

  for (const record of records) {
    const effective = effectiveById.get(record.id);
    const conversion = resolveRate(effective, effectiveRows);
    const effectiveDate = parseLocalDateTime(effective.date);

    nextRowsById[record.id] = {
      ...record,
      derived: {
        conversionStatus: conversion.status,
        unresolved: Boolean(conversion.unresolved),
        warning: conversion.warning || null,
        usedRate: conversion.usedRate ?? null,
        rateSource: conversion.rateSource ?? null,
        uahAmount: conversion.uahAmount ?? null,
        effectiveDateEpoch: effectiveDate ? effectiveDate.getTime() : null
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

export function sanitizeLoadedState(maybeState) {
  const base = createEmptyState();
  if (!isPlainObject(maybeState)) {
    return base;
  }

  const incomingVersion = Number(maybeState.version || 0);
  const resetLegacyTags = incomingVersion < STORAGE_VERSION;
  const rowsById = sanitizeRowsById(
    isPlainObject(maybeState.rowsById) ? maybeState.rowsById : {},
    resetLegacyTags
  );
  const importHistory = Array.isArray(maybeState.importHistory) ? maybeState.importHistory : [];
  const maybeUiPrefs = isPlainObject(maybeState.uiPrefs) ? maybeState.uiPrefs : {};
  const maybeFilters = isPlainObject(maybeUiPrefs.filters) ? maybeUiPrefs.filters : {};
  const maybeChartsFilters =
    isPlainObject(maybeUiPrefs.chartsFilters) ? maybeUiPrefs.chartsFilters : {};
  const migratedDateFrom = sanitizeText(maybeFilters.dateFrom) || sanitizeText(maybeChartsFilters.dateFrom);
  const migratedDateTo = sanitizeText(maybeFilters.dateTo) || sanitizeText(maybeChartsFilters.dateTo);

  const state = {
    ...base,
    ...maybeState,
    version: STORAGE_VERSION,
    rowsById,
    importHistory,
    uiPrefs: {
      activeScreen: normalizeActiveScreen(maybeUiPrefs.activeScreen),
      showExtraColumns: Boolean(maybeUiPrefs.showExtraColumns),
      filters: {
        ...base.uiPrefs.filters,
        ...maybeFilters,
        dateFrom: migratedDateFrom || '',
        dateTo: migratedDateTo || '',
        status: supportedFilterStatus.has(maybeFilters.status) ? maybeFilters.status : base.uiPrefs.filters.status
      }
    },
    updatedAt: sanitizeText(maybeState.updatedAt) || base.updatedAt
  };

  state.rowsById = recomputeDerivedRows(state.rowsById);
  return state;
}

function sanitizeRowsById(rowsById, resetLegacyTags) {
  const sanitized = {};

  for (const [rowId, rawRecord] of Object.entries(rowsById || {})) {
    if (!rawRecord || typeof rawRecord !== 'object') {
      continue;
    }

    const source =
      rawRecord.source && typeof rawRecord.source === 'object' ? { ...rawRecord.source } : {};
    const overrides =
      rawRecord.overrides && typeof rawRecord.overrides === 'object' ? { ...rawRecord.overrides } : {};

    if (resetLegacyTags) {
      source.tags = [];
      delete source.tag;
      delete overrides.tags;
      delete overrides.tag;
    } else {
      source.tags = normalizeTags(source.tags);
      delete source.tag;
      if (hasOwn(overrides, 'tags')) {
        overrides.tags = normalizeTags(overrides.tags);
      }
      delete overrides.tag;
    }

    sanitized[rowId] = {
      ...rawRecord,
      source,
      overrides
    };
  }

  return sanitized;
}

export function sortRowsByDateDesc(rowRecords) {
  return [...rowRecords].sort((left, right) => {
    const leftDate = left.derived?.effectiveDateEpoch ?? -Infinity;
    const rightDate = right.derived?.effectiveDateEpoch ?? -Infinity;
    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }
    return left.source.id.localeCompare(right.source.id);
  });
}

export function summarizeUah(rows) {
  let net = 0;
  let outflow = 0;
  let inflow = 0;
  let unresolved = 0;

  for (const row of rows) {
    const amount = row.derived?.uahAmount;
    if (row.derived?.unresolved || amount === null || amount === undefined) {
      unresolved += 1;
      continue;
    }

    net += amount;
    if (amount < 0) {
      outflow += Math.abs(amount);
    } else {
      inflow += amount;
    }
  }

  return { net, outflow, inflow, unresolved };
}

export function buildCategoryPieDatasetUAHAbsoluteNet(rows) {
  const totals = new Map();

  for (const row of rows) {
    const amount = row.derived?.uahAmount;
    if (row.derived?.unresolved || amount === null || amount === undefined) {
      continue;
    }

    const effective = computeEffectiveRow(row.source, row.overrides);
    const category = effective.fullCategory || 'Uncategorized';
    totals.set(category, (totals.get(category) || 0) + amount);
  }

  return Array.from(totals.entries())
    .map(([label, signedNet]) => ({
      label,
      signedNet,
      absoluteNet: Math.abs(signedNet)
    }))
    .filter((item) => item.absoluteNet > 0)
    .sort((left, right) => right.absoluteNet - left.absoluteNet);
}

export function buildTagPieDatasetUAHAbsoluteNet(rows) {
  const totals = new Map();

  for (const row of rows) {
    const amount = row.derived?.uahAmount;
    if (row.derived?.unresolved || amount === null || amount === undefined) {
      continue;
    }

    const effective = computeEffectiveRow(row.source, row.overrides);
    const tags = effective.tags.length ? effective.tags : ['No tag'];

    for (const tag of tags) {
      totals.set(tag, (totals.get(tag) || 0) + amount);
    }
  }

  return Array.from(totals.entries())
    .map(([label, signedNet]) => ({
      label,
      signedNet,
      absoluteNet: Math.abs(signedNet)
    }))
    .filter((item) => item.absoluteNet > 0)
    .sort((left, right) => right.absoluteNet - left.absoluteNet);
}

export function formatMoney(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function countSelectedCalendarDays(dateFrom, dateTo) {
  const from = parseLocalDateTime(dateFrom);
  const to = parseLocalDateTime(dateTo);

  if (!from || !to) {
    return null;
  }

  const startDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  if (endDay.getTime() < startDay.getTime()) {
    return 0;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((endDay.getTime() - startDay.getTime()) / dayMs) + 1;
}

export function normalizeFilterDate(value) {
  const parsed = parseLocalDateTime(value);
  return parsed ? parsed.getTime() : null;
}

export function matchesFilter(record, filters) {
  const effective = computeEffectiveRow(record.source, record.overrides);
  const search = sanitizeText(filters.search).toLowerCase();
  const tagFilter = sanitizeText(filters.tag).toLowerCase();
  const fromEpoch = normalizeFilterDate(filters.dateFrom);
  const toEpoch = normalizeFilterDate(filters.dateTo);
  const rowEpoch = parseLocalDateTime(effective.date)?.getTime() ?? null;
  const tagsText = effective.tags.join(' ');

  const haystack = [
    effective.fullCategory,
    effective.originalCategory,
    effective.originalSourceFullCategory,
    effective.notes,
    effective.currency,
    effective.rateType,
    tagsText
  ]
    .join(' ')
    .toLowerCase();

  if (search && !haystack.includes(search)) {
    return false;
  }

  if (
    tagFilter &&
    !effective.tags.some((tag) => tag.toLowerCase().includes(tagFilter))
  ) {
    return false;
  }

  if (fromEpoch !== null && rowEpoch !== null && rowEpoch < fromEpoch) {
    return false;
  }

  if (toEpoch !== null && rowEpoch !== null && rowEpoch > toEpoch) {
    return false;
  }

  if (filters.status === 'resolved' && record.derived?.unresolved) {
    return false;
  }

  if (filters.status === 'unresolved' && !record.derived?.unresolved) {
    return false;
  }

  return true;
}
