export const STORAGE_VERSION = 4;
export const STORAGE_KEY = 'expense-consolidator-state-v2';
export const SCREEN_DATA = 'data';
export const SCREEN_CHARTS = 'charts';
export const SCREEN_FX_RATES = 'fx-rates';
export const SCREEN_DATA_OPS = 'data-ops';
export const SCREEN_TAGS = 'tags';
export const SCREEN_CATEGORY_MERGE = 'category-merge';
export const DISPLAY_CURRENCY_UAH = 'UAH';
export const DISPLAY_CURRENCY_USD = 'USD';
export const USD_RATE_COVERAGE_DAYS = 10;

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

export const supportedScreens = new Set([
  SCREEN_DATA,
  SCREEN_CHARTS,
  SCREEN_FX_RATES,
  SCREEN_DATA_OPS,
  SCREEN_TAGS,
  SCREEN_CATEGORY_MERGE
]);
export const supportedFilterStatus = new Set(['all', 'resolved', 'unresolved']);
export const supportedDisplayCurrencies = new Set([DISPLAY_CURRENCY_UAH, DISPLAY_CURRENCY_USD]);

export const TAG_GROUP_NO_TAG_LABEL = 'No tag in group';
export const TAG_GROUP_INVALID_LABEL = 'Invalid (multiple tags in group)';
