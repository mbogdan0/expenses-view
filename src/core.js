export {
  STORAGE_VERSION,
  STORAGE_KEY,
  SCREEN_DATA,
  SCREEN_CHARTS,
  SCREEN_FX_RATES,
  SCREEN_DATA_OPS,
  SCREEN_TAGS,
  SCREEN_CATEGORY_MERGE,
  DISPLAY_CURRENCY_UAH,
  DISPLAY_CURRENCY_USD,
  USD_RATE_COVERAGE_DAYS,
  CSV_HEADERS,
  TAG_GROUP_NO_TAG_LABEL,
  TAG_GROUP_INVALID_LABEL
} from './core/constants.js';

export {
  parseNumber,
  normalizeNumericString,
  normalizeDateForId,
  parseLocalDateTime,
  formatLocalDateTime,
  formatDateInputValue,
  displayDateTime,
  normalizeCurrency,
  normalizeTags,
  formatTagsInput
} from './core/primitives.js';

export {
  parseTagGroupsText,
  normalizeTagGroupIndex,
  validateRowTagsAgainstGroups,
  applyBulkTagMutation
} from './core/tag-groups.js';

export {
  buildSourceFullCategory,
  fileNameToMainCategory,
  buildDedupId,
  hashFNV1a,
  buildFileFingerprint,
  parseCsvText,
  parseExpenseCsv
} from './core/csv-and-identity.js';

export {
  parseCategoryMergeRulesText,
  ensureCategoryMergeModel,
  buildCategoryMergeRuntime,
  ensureCategoryMergeRuntime
} from './core/category-merge.js';

export {
  computeEffectiveRow,
  resolveRate,
  resolveUsdRate,
  parseManualUsdRatesText,
  buildUsdCoverageReport,
  buildUsdCoverageReportForRowsById,
  recomputeDerivedRows,
  normalizeImportedRow,
  mergeImportedRow
} from './core/rows-and-rates.js';

export {
  createEmptyState,
  validateStateSnapshot,
  parseStateSnapshotJson,
  sanitizeLoadedState
} from './core/state.js';

export {
  sortRowsByDateDesc,
  normalizeDisplayCurrency,
  getRowConversionForDisplayCurrency,
  summarizeRowsByDisplayCurrency,
  summarizeUah,
  buildCategoryPieDatasetAbsoluteNet,
  buildCategoryPieDatasetUAHAbsoluteNet,
  buildTagPieDatasetAbsoluteNet,
  buildTagPieDatasetUAHAbsoluteNet,
  buildTagGroupPieDatasetAbsoluteNet,
  buildTagGroupPieDatasetUAHAbsoluteNet,
  buildPiePalette,
  formatMoney,
  countSelectedCalendarDays,
  normalizeFilterDate,
  matchesFilter
} from './core/analytics.js';
