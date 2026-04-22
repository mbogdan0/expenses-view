import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.js';

const EXPECTED_EXPORTS = [
  'CSV_HEADERS',
  'SCREEN_CHARTS',
  'SCREEN_DATA',
  'SCREEN_DATA_OPS',
  'SCREEN_TAGS',
  'STORAGE_KEY',
  'STORAGE_VERSION',
  'TAG_GROUP_INVALID_LABEL',
  'TAG_GROUP_NO_TAG_LABEL',
  'applyBulkTagMutation',
  'buildCategoryPieDatasetUAHAbsoluteNet',
  'buildDedupId',
  'buildFileFingerprint',
  'buildPiePalette',
  'buildSourceFullCategory',
  'buildTagGroupPieDatasetUAHAbsoluteNet',
  'buildTagPieDatasetUAHAbsoluteNet',
  'computeEffectiveRow',
  'countSelectedCalendarDays',
  'createEmptyState',
  'displayDateTime',
  'fileNameToMainCategory',
  'formatDateInputValue',
  'formatLocalDateTime',
  'formatMoney',
  'formatTagsInput',
  'hashFNV1a',
  'matchesFilter',
  'mergeImportedRow',
  'normalizeCurrency',
  'normalizeDateForId',
  'normalizeFilterDate',
  'normalizeImportedRow',
  'normalizeNumericString',
  'normalizeTagGroupIndex',
  'normalizeTags',
  'parseCsvText',
  'parseExpenseCsv',
  'parseLocalDateTime',
  'parseNumber',
  'parseStateSnapshotJson',
  'parseTagGroupsText',
  'recomputeDerivedRows',
  'resolveRate',
  'sanitizeLoadedState',
  'sortRowsByDateDesc',
  'summarizeUah',
  'validateRowTagsAgainstGroups',
  'validateStateSnapshot'
];

test('core.js export surface remains stable', () => {
  const names = Object.keys(core).sort();
  assert.deepEqual(names, EXPECTED_EXPORTS);
});
