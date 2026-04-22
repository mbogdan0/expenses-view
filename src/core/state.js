import {
  DISPLAY_CURRENCY_UAH,
  SCREEN_DATA,
  STORAGE_VERSION,
  supportedDisplayCurrencies,
  supportedFilterStatus,
  supportedScreens
} from './constants.js';
import { isPlainObject, normalizeTags, parseLocalDateTime, sanitizeText } from './primitives.js';
import { normalizeTagGroupIndex, parseTagGroupsText } from './tag-groups.js';
import { recomputeDerivedRows } from './rows-and-rates.js';

function normalizeActiveScreen(screenName) {
  return supportedScreens.has(screenName) ? screenName : SCREEN_DATA;
}

export function createEmptyState() {
  return {
    version: STORAGE_VERSION,
    tagGroupsText: '',
    categoryMergeRulesText: '',
    manualUsdRatesText: '',
    rowsById: {},
    importHistory: [],
    uiPrefs: {
      activeScreen: SCREEN_DATA,
      selectedTagGroup: 0,
      displayCurrency: DISPLAY_CURRENCY_UAH,
      showExtraColumns: false,
      filters: {
        search: '',
        tag: '',
        tagsLt2Only: false,
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

  if (typeof snapshot.tagGroupsText !== 'string') {
    return 'Snapshot tagGroupsText must be a string.';
  }

  if (hasOwn(snapshot, 'categoryMergeRulesText') && typeof snapshot.categoryMergeRulesText !== 'string') {
    return 'Snapshot categoryMergeRulesText must be a string when provided.';
  }

  if (hasOwn(snapshot, 'manualUsdRatesText') && typeof snapshot.manualUsdRatesText !== 'string') {
    return 'Snapshot manualUsdRatesText must be a string when provided.';
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

  if (
    typeof snapshot.uiPrefs.activeScreen !== 'string' ||
    !supportedScreens.has(snapshot.uiPrefs.activeScreen)
  ) {
    return 'Snapshot uiPrefs.activeScreen is invalid.';
  }

  if (!Number.isInteger(snapshot.uiPrefs.selectedTagGroup) || snapshot.uiPrefs.selectedTagGroup < 0) {
    return 'Snapshot uiPrefs.selectedTagGroup must be a non-negative integer.';
  }

  if (
    hasOwn(snapshot.uiPrefs, 'displayCurrency') &&
    !supportedDisplayCurrencies.has(snapshot.uiPrefs.displayCurrency)
  ) {
    return 'Snapshot uiPrefs.displayCurrency is invalid.';
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

  if (hasOwn(filters, 'tagsLt2Only') && typeof filters.tagsLt2Only !== 'boolean') {
    return 'Snapshot uiPrefs.filters.tagsLt2Only must be a boolean.';
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

function toDateOnlyValue(value) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    return '';
  }

  const year = String(parsed.getFullYear());
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeRowsById(rowsById) {
  const sanitized = {};

  for (const [rowId, rawRecord] of Object.entries(rowsById || {})) {
    if (!rawRecord || typeof rawRecord !== 'object') {
      continue;
    }

    const source =
      rawRecord.source && typeof rawRecord.source === 'object' ? { ...rawRecord.source } : {};
    const overrides =
      rawRecord.overrides && typeof rawRecord.overrides === 'object' ? { ...rawRecord.overrides } : {};

    source.tags = normalizeTags(source.tags);
    delete source.tag;
    if (hasOwn(overrides, 'tags')) {
      overrides.tags = normalizeTags(overrides.tags);
    }
    delete overrides.tag;

    sanitized[rowId] = {
      ...rawRecord,
      source,
      overrides
    };
  }

  return sanitized;
}

export function sanitizeLoadedState(maybeState) {
  const base = createEmptyState();
  if (!isPlainObject(maybeState)) {
    return base;
  }

  const incomingVersion = Number(maybeState.version || 0);
  if (incomingVersion !== STORAGE_VERSION) {
    return base;
  }

  const rowsById = sanitizeRowsById(isPlainObject(maybeState.rowsById) ? maybeState.rowsById : {});
  const importHistory = Array.isArray(maybeState.importHistory) ? maybeState.importHistory : [];
  const maybeUiPrefs = isPlainObject(maybeState.uiPrefs) ? maybeState.uiPrefs : {};
  const maybeFilters = isPlainObject(maybeUiPrefs.filters) ? maybeUiPrefs.filters : {};
  const tagGroupsText = typeof maybeState.tagGroupsText === 'string' ? maybeState.tagGroupsText : base.tagGroupsText;
  const categoryMergeRulesText =
    typeof maybeState.categoryMergeRulesText === 'string'
      ? maybeState.categoryMergeRulesText
      : base.categoryMergeRulesText;
  const manualUsdRatesText =
    typeof maybeState.manualUsdRatesText === 'string'
      ? maybeState.manualUsdRatesText
      : base.manualUsdRatesText;
  const parsedTagGroups = parseTagGroupsText(tagGroupsText);

  const state = {
    ...base,
    ...maybeState,
    version: STORAGE_VERSION,
    tagGroupsText,
    categoryMergeRulesText,
    manualUsdRatesText,
    rowsById,
    importHistory,
    uiPrefs: {
      activeScreen: normalizeActiveScreen(maybeUiPrefs.activeScreen),
      selectedTagGroup: normalizeTagGroupIndex(
        maybeUiPrefs.selectedTagGroup,
        parsedTagGroups.groups.length
      ),
      displayCurrency: supportedDisplayCurrencies.has(maybeUiPrefs.displayCurrency)
        ? maybeUiPrefs.displayCurrency
        : base.uiPrefs.displayCurrency,
      showExtraColumns: Boolean(maybeUiPrefs.showExtraColumns),
      filters: {
        ...base.uiPrefs.filters,
        ...maybeFilters,
        tagsLt2Only: maybeFilters.tagsLt2Only === true,
        dateFrom: toDateOnlyValue(maybeFilters.dateFrom),
        dateTo: toDateOnlyValue(maybeFilters.dateTo),
        status: supportedFilterStatus.has(maybeFilters.status)
          ? maybeFilters.status
          : base.uiPrefs.filters.status
      }
    },
    updatedAt: sanitizeText(maybeState.updatedAt) || base.updatedAt
  };

  state.rowsById = recomputeDerivedRows(
    state.rowsById,
    state.tagGroupsText,
    state.categoryMergeRulesText,
    state.manualUsdRatesText
  );
  return state;
}
