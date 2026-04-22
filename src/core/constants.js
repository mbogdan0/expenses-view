export const STORAGE_VERSION = 4;
export const STORAGE_KEY = 'expense-consolidator-state-v2';
export const SCREEN_DATA = 'data';
export const SCREEN_CHARTS = 'charts';
export const SCREEN_DATA_OPS = 'data-ops';
export const SCREEN_TAGS = 'tags';

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

export const supportedScreens = new Set([SCREEN_DATA, SCREEN_CHARTS, SCREEN_DATA_OPS, SCREEN_TAGS]);
export const supportedFilterStatus = new Set(['all', 'resolved', 'unresolved']);

export const TAG_GROUP_NO_TAG_LABEL = 'No tag in group';
export const TAG_GROUP_INVALID_LABEL = 'Invalid (multiple tags in group)';
