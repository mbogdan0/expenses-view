import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPLAY_CURRENCY_USD,
  TAG_GROUP_INVALID_LABEL,
  TAG_GROUP_NO_TAG_LABEL,
  applyBulkTagMutation,
  buildCategoryPieDatasetAbsoluteNet,
  buildCategoryPieDatasetUAHAbsoluteNet,
  buildDedupId,
  buildPiePalette,
  buildTagGroupPieDatasetUAHAbsoluteNet,
  buildUsdCoverageReport,
  buildSourceFullCategory,
  buildTagPieDatasetUAHAbsoluteNet,
  countSelectedCalendarDays,
  computeEffectiveRow,
  createEmptyState,
  getRowConversionForDisplayCurrency,
  matchesFilter,
  normalizeDisplayCurrency,
  normalizeTagGroupIndex,
  normalizeImportedRow,
  normalizeTags,
  parseCategoryMergeRulesText,
  parseExpenseCsv,
  parseManualUsdRatesText,
  parseTagGroupsText,
  parseStateSnapshotJson,
  recomputeDerivedRows,
  resolveRate,
  resolveUsdRate,
  sanitizeLoadedState,
  STORAGE_VERSION,
  summarizeRowsByDisplayCurrency,
  validateRowTagsAgainstGroups
} from '../src/core.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayOffsetDate(offsetDays) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  return new Date(today + offsetDays * DAY_MS);
}

function toDateOnlyString(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayOffsetString(offsetDays) {
  return toDateOnlyString(dayOffsetDate(offsetDays));
}

function dayOffsetDateTime(offsetDays) {
  return `${dayOffsetString(offsetDays)} 12:00`;
}

test('buildSourceFullCategory combines filename and category', () => {
  const full = buildSourceFullCategory('🌿 Богдан.csv', 'Coffee');
  assert.equal(full, '🌿 Богдан / Coffee');
});

test('buildDedupId is based on normalized source values', () => {
  const id1 = buildDedupId('2026-04-01 11:00', 'Main / Cat', '-40');
  const id2 = buildDedupId('2026-04-01T11:00', 'main / cat', '-40.00');
  assert.equal(id1, id2);
});

test('parseExpenseCsv returns expected fields', () => {
  const csv =
    'Date,Category,Price,Currency,Rate,Rate Type,Notes,Image\n' +
    '2026-04-01 11:00,Cat,-40,UAH,,,Note,';

  const rows = parseExpenseCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Date, '2026-04-01 11:00');
  assert.equal(rows[0].Category, 'Cat');
  assert.equal(rows[0].Price, '-40');
  assert.equal(rows[0].Currency, 'UAH');
  assert.equal(rows[0].Notes, 'Note');
});

test('normalizeTags parses comma-separated values and removes duplicates', () => {
  const tags = normalizeTags(' groceries, travel,Groceries,  travel  , family ');
  assert.deepEqual(tags, ['family', 'groceries', 'travel']);
});

test('buildPiePalette avoids hue collisions within one render set', () => {
  const labels = [
    'Housing',
    'Food',
    'Transport',
    'Medical',
    'Personal',
    'Entertainment',
    'Utilities',
    'Savings',
    'Debt',
    'Travel'
  ];

  const palette = buildPiePalette(labels, true);
  assert.equal(palette.background.length, labels.length);
  assert.equal(palette.border.length, labels.length);
  assert.equal(new Set(palette.hues).size, labels.length);
});

test('countSelectedCalendarDays returns inclusive range in calendar days', () => {
  assert.equal(countSelectedCalendarDays('2026-04-01T10:00', '2026-04-01T22:00'), 1);
  assert.equal(countSelectedCalendarDays('2026-04-01T10:00', '2026-04-03T09:00'), 3);
  assert.equal(countSelectedCalendarDays('', '2026-04-03T09:00'), null);
  assert.equal(countSelectedCalendarDays('2026-04-05T00:00', '2026-04-03T09:00'), 0);
});

test('resolveRate uses nearest same-currency row when explicit rate is missing', () => {
  const rows = [
    {
      id: 'a',
      date: '2026-04-10 10:00',
      currency: 'USD',
      rate: '',
      price: '-10'
    },
    {
      id: 'b',
      date: '2026-04-09 10:00',
      currency: 'USD',
      rate: '43.2',
      price: '-1'
    },
    {
      id: 'c',
      date: '2026-04-15 10:00',
      currency: 'USD',
      rate: '44.2',
      price: '-1'
    }
  ];

  const result = resolveRate(rows[0], rows);
  assert.equal(result.status, 'resolved');
  assert.equal(result.usedRate, 43.2);
  assert.equal(result.uahAmount, -432);
});

test('parseManualUsdRatesText parses strict lines and reports format issues', () => {
  const parsed = parseManualUsdRatesText(
    '"2026-04-01";"UAH/USD";"43.50"\n' +
      '"2026-04-02";"GEL/USD";"2.78"\n' +
      '2026-04-03;UAH/USD;43.1\n' +
      '"2026-02-31";"UAH/USD";"43.1"\n' +
      '"2026-04-03";"UAH/USD";"-1"'
  );

  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].pair, 'UAH/USD');
  assert.equal(parsed.entries[0].date, '2026-04-01');
  assert.equal(parsed.entries[0].rate, 43.5);
  assert.equal(parsed.entries[1].pair, 'GEL/USD');
  assert.equal(parsed.issues.length, 3);
  assert.equal(parsed.issues.some((issue) => issue.type === 'invalid_format'), true);
  assert.equal(parsed.issues.some((issue) => issue.type === 'invalid_date'), true);
  assert.equal(parsed.issues.some((issue) => issue.type === 'invalid_rate'), true);
});

test('buildUsdCoverageReport requests missing checkpoints in fixed windows', () => {
  const rows = [
    { id: 'a', date: '2026-04-01 11:00', currency: 'UAH', price: '-100' },
    { id: 'b', date: '2026-04-22 09:00', currency: 'UAH', price: '-200' },
    { id: 'c', date: '2026-04-02 11:00', currency: 'GEL', price: '-10' },
    { id: 'd', date: '2026-04-12 11:00', currency: 'GEL', price: '-20' }
  ];

  const report = buildUsdCoverageReport(
    rows,
    '"2026-04-01";"UAH/USD";"43.5"\n"2026-04-21";"UAH/USD";"43.8"\n"2026-04-03";"GEL/USD";"2.78"',
    10
  );

  assert.equal(report.requiredPairs.includes('UAH/USD'), true);
  assert.equal(report.requiredPairs.includes('GEL/USD'), true);
  assert.equal(report.isComplete, false);
  assert.deepEqual(report.missingRequests, [
    { date: '2026-04-12', pair: 'GEL/USD', line: '"2026-04-12";"GEL/USD"' },
    { date: '2026-04-11', pair: 'UAH/USD', line: '"2026-04-11";"UAH/USD"' }
  ]);
});

test('resolveUsdRate uses nearest manual pair rate and divides by rate', () => {
  const model = parseManualUsdRatesText(
    '"2026-04-01";"UAH/USD";"43.5"\n' +
      '"2026-04-11";"UAH/USD";"44.0"\n' +
      '"2026-04-09";"UAH/USD";"43.8"'
  );

  const result = resolveUsdRate(
    {
      id: 'x',
      date: '2026-04-10 10:00',
      currency: 'UAH',
      price: '-438'
    },
    model
  );

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedRate, 44);
  assert.equal(result.usdAmount, -438 / 44);
  assert.equal(result.rateSource, 'manual:UAH/USD:2026-04-11');
});

test('resolveUsdRate prefers later rate when distance tie', () => {
  const model = parseManualUsdRatesText(
    '"2026-04-08";"UAH/USD";"43.0"\n' +
      '"2026-04-10";"UAH/USD";"44.0"'
  );

  const result = resolveUsdRate(
    {
      id: 'x',
      date: '2026-04-09 12:00',
      currency: 'UAH',
      price: '-440'
    },
    model
  );

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedRate, 44);
  assert.equal(result.rateSource, 'manual:UAH/USD:2026-04-10');
  assert.equal(result.usdAmount, -10);
});

test('buildUsdCoverageReport never requests future checkpoint dates', () => {
  const todayString = dayOffsetString(0);
  const rows = [
    { id: 'a', date: dayOffsetDateTime(-2), currency: 'UAH', price: '-100' },
    { id: 'b', date: dayOffsetDateTime(25), currency: 'UAH', price: '-200' }
  ];

  const report = buildUsdCoverageReport(rows, '', 10);
  assert.equal(report.missingRequests.length >= 1, true);
  assert.equal(report.missingRequests.some((item) => item.date > todayString), false);
});

test('buildUsdCoverageReport caps mixed past/future ranges at today', () => {
  const todayString = dayOffsetString(0);
  const rows = [
    { id: 'a', date: dayOffsetDateTime(-7), currency: 'GEL', price: '-10' },
    { id: 'b', date: dayOffsetDateTime(9), currency: 'GEL', price: '-20' }
  ];

  const report = buildUsdCoverageReport(rows, '', 5);
  assert.equal(report.requiredPairs.includes('GEL/USD'), true);
  assert.equal(report.missingRequests.some((item) => item.pair === 'GEL/USD' && item.date > todayString), false);
});

test('resolveUsdRate for future row uses latest known historical rate', () => {
  const ratePastA = dayOffsetString(-10);
  const ratePastB = dayOffsetString(-2);
  const rateFuture = dayOffsetString(5);
  const model = parseManualUsdRatesText(
    `"${ratePastA}";"UAH/USD";"42.0"\n` +
      `"${ratePastB}";"UAH/USD";"43.5"\n` +
      `"${rateFuture}";"UAH/USD";"60.0"`
  );

  const result = resolveUsdRate(
    {
      id: 'x',
      date: dayOffsetDateTime(12),
      currency: 'UAH',
      price: '-435'
    },
    model
  );

  assert.equal(result.status, 'resolved');
  assert.equal(result.usedRate, 43.5);
  assert.equal(result.rateSource, `manual:UAH/USD:${ratePastB}`);
  assert.equal(result.usdAmount, -10);
});

test('resolveUsdRate keeps future row unresolved without known historical rate', () => {
  const onlyFutureRate = dayOffsetString(3);
  const model = parseManualUsdRatesText(
    `"${onlyFutureRate}";"UAH/USD";"50.0"`
  );

  const result = resolveUsdRate(
    {
      id: 'x',
      date: dayOffsetDateTime(12),
      currency: 'UAH',
      price: '-500'
    },
    model
  );

  assert.equal(result.status, 'missing_manual_rate');
  assert.equal(result.unresolved, true);
});

test('recomputeDerivedRows marks rows without available rate as unresolved', () => {
  const normalized = normalizeImportedRow(
    {
      Date: '2026-04-01 11:00',
      Category: 'Category',
      Price: '-20',
      Currency: 'EUR',
      Rate: '',
      'Rate Type': '',
      Notes: '',
      Image: ''
    },
    'File.csv'
  );

  const rowsById = recomputeDerivedRows({ [normalized.id]: normalized });
  assert.equal(rowsById[normalized.id].derived.unresolved, true);
  assert.equal(rowsById[normalized.id].derived.conversionStatus, 'missing_rate');
  assert.equal(rowsById[normalized.id].derived.usdUnresolved, true);
  assert.equal(rowsById[normalized.id].derived.usdConversionStatus, 'missing_manual_rate');
});

test('recomputeDerivedRows returns deterministic output for identical input', () => {
  const rowsById = {
    one: {
      id: 'one',
      source: {
        id: 'one',
        date: '2026-04-01 11:00',
        category: 'Cat',
        sourceFullCategory: 'Main / One',
        price: '-100',
        currency: 'UAH',
        rate: '',
        rateType: '',
        notes: '',
        image: '',
        tags: []
      },
      overrides: {
        tags: ['P0']
      },
      derived: {}
    },
    two: {
      id: 'two',
      source: {
        id: 'two',
        date: '2026-04-02 12:00',
        category: 'Cat',
        sourceFullCategory: 'Main / Two',
        price: '-50',
        currency: 'USD',
        rate: '',
        rateType: '',
        notes: '',
        image: '',
        tags: []
      },
      overrides: {},
      derived: {}
    }
  };

  const tagGroups = 'Priorities: P0, P1';
  const categoryMerge = '"Main / One";"Main / Two"';
  const manualUsdRates = '"2026-04-02";"UAH/USD";"43.5"';

  const first = recomputeDerivedRows(structuredClone(rowsById), tagGroups, categoryMerge, manualUsdRates);
  const second = recomputeDerivedRows(structuredClone(rowsById), tagGroups, categoryMerge, manualUsdRates);

  assert.deepEqual(second, first);
});

test('computeEffectiveRow keeps source values and applies overrides', () => {
  const source = {
    id: 'x',
    date: '2026-04-01 11:00',
    category: 'Main',
    sourceFullCategory: 'Main / Cat',
    price: '-40',
    currency: 'UAH',
    rate: '',
    rateType: '',
    notes: '',
    image: '',
    tags: []
  };

  const effective = computeEffectiveRow(source, {
    fullCategory: 'Edited / Category',
    tags: ['alpha', 'travel']
  });

  assert.equal(effective.fullCategory, 'Edited / Category');
  assert.deepEqual(effective.tags, ['alpha', 'travel']);
  assert.equal(effective.price, '-40');
});

test('buildCategoryPieDatasetUAHAbsoluteNet uses absolute weight from signed net', () => {
  const rows = [
    {
      source: {
        id: 'a',
        category: 'Original',
        sourceFullCategory: 'File / Original'
      },
      overrides: {
        fullCategory: 'Food'
      },
      derived: {
        unresolved: false,
        uahAmount: -100
      }
    },
    {
      source: {
        id: 'b',
        category: 'Original',
        sourceFullCategory: 'File / Original'
      },
      overrides: {
        fullCategory: 'Food'
      },
      derived: {
        unresolved: false,
        uahAmount: 40
      }
    },
    {
      source: {
        id: 'c',
        category: 'Original',
        sourceFullCategory: 'File / Original'
      },
      overrides: {
        fullCategory: 'Rent'
      },
      derived: {
        unresolved: false,
        uahAmount: -20
      }
    }
  ];

  const result = buildCategoryPieDatasetUAHAbsoluteNet(rows);
  assert.deepEqual(result, [
    { label: 'Food', signedNet: -60, absoluteNet: 60 },
    { label: 'Rent', signedNet: -20, absoluteNet: 20 }
  ]);
});

test('display currency helpers switch summaries and datasets between UAH and USD', () => {
  const rows = [
    {
      source: {
        id: 'a',
        category: 'Original',
        sourceFullCategory: 'File / Food',
        tags: []
      },
      overrides: {
        fullCategory: 'Food'
      },
      derived: {
        unresolved: false,
        uahAmount: -100,
        usdUnresolved: false,
        usdAmount: -2.5
      }
    },
    {
      source: {
        id: 'b',
        category: 'Original',
        sourceFullCategory: 'File / Food',
        tags: []
      },
      overrides: {
        fullCategory: 'Food'
      },
      derived: {
        unresolved: false,
        uahAmount: 40,
        usdUnresolved: false,
        usdAmount: 1
      }
    },
    {
      source: {
        id: 'c',
        category: 'Original',
        sourceFullCategory: 'File / Rent',
        tags: []
      },
      overrides: {
        fullCategory: 'Rent'
      },
      derived: {
        unresolved: false,
        uahAmount: -20,
        usdUnresolved: true,
        usdAmount: null
      }
    }
  ];

  assert.equal(normalizeDisplayCurrency('usd'), 'UAH');
  assert.equal(normalizeDisplayCurrency(DISPLAY_CURRENCY_USD), DISPLAY_CURRENCY_USD);
  assert.equal(getRowConversionForDisplayCurrency(rows[0], DISPLAY_CURRENCY_USD).amount, -2.5);

  const uahSummary = summarizeRowsByDisplayCurrency(rows, 'UAH');
  const usdSummary = summarizeRowsByDisplayCurrency(rows, DISPLAY_CURRENCY_USD);
  assert.deepEqual(uahSummary, { net: -80, outflow: 120, inflow: 40, unresolved: 0 });
  assert.deepEqual(usdSummary, { net: -1.5, outflow: 2.5, inflow: 1, unresolved: 1 });

  const usdPie = buildCategoryPieDatasetAbsoluteNet(rows, DISPLAY_CURRENCY_USD);
  assert.deepEqual(usdPie, [{ label: 'Food', signedNet: -1.5, absoluteNet: 1.5 }]);
});

test('recomputeDerivedRows applies category merge rules and flags missing masters', () => {
  const rowsById = {
    master: {
      id: 'master',
      source: {
        id: 'master',
        date: '2026-04-01 11:00',
        category: 'Cat',
        sourceFullCategory: 'Master / Bucket',
        price: '-100',
        currency: 'UAH',
        rate: '',
        rateType: '',
        notes: '',
        image: '',
        tags: []
      },
      overrides: {},
      derived: {}
    },
    child: {
      id: 'child',
      source: {
        id: 'child',
        date: '2026-04-01 12:00',
        category: 'Cat',
        sourceFullCategory: 'Child / Bucket',
        price: '-50',
        currency: 'UAH',
        rate: '',
        rateType: '',
        notes: '',
        image: '',
        tags: []
      },
      overrides: {},
      derived: {}
    },
    missing: {
      id: 'missing',
      source: {
        id: 'missing',
        date: '2026-04-01 13:00',
        category: 'Cat',
        sourceFullCategory: 'Child / Missing',
        price: '-40',
        currency: 'UAH',
        rate: '',
        rateType: '',
        notes: '',
        image: '',
        tags: []
      },
      overrides: {},
      derived: {}
    }
  };

  const nextRowsById = recomputeDerivedRows(
    rowsById,
    '',
    '"Master / Bucket";"Child / Bucket"\n"Absent / Master";"Child / Missing"'
  );

  assert.equal(nextRowsById.master.derived.finalFullCategory, 'Master / Bucket');
  assert.equal(nextRowsById.master.derived.categoryMergeStatus, 'none');
  assert.equal(nextRowsById.child.derived.baseFullCategory, 'Child / Bucket');
  assert.equal(nextRowsById.child.derived.finalFullCategory, 'Master / Bucket');
  assert.equal(nextRowsById.child.derived.categoryMergeStatus, 'merged');
  assert.equal(nextRowsById.child.derived.categoryMergeMaster, 'Master / Bucket');
  assert.equal(nextRowsById.missing.derived.baseFullCategory, 'Child / Missing');
  assert.equal(nextRowsById.missing.derived.finalFullCategory, 'Child / Missing');
  assert.equal(nextRowsById.missing.derived.categoryMergeStatus, 'master_missing');
  assert.equal(nextRowsById.missing.derived.categoryMergeMaster, 'Absent / Master');

  const categoryPie = buildCategoryPieDatasetUAHAbsoluteNet(Object.values(nextRowsById));
  assert.deepEqual(categoryPie, [
    { label: 'Master / Bucket', signedNet: -150, absoluteNet: 150 },
    { label: 'Child / Missing', signedNet: -40, absoluteNet: 40 }
  ]);
});

test('buildTagPieDatasetUAHAbsoluteNet assigns full amount to each tag', () => {
  const rows = [
    {
      source: {
        id: 'a',
        category: 'Original',
        sourceFullCategory: 'File / Original',
        tags: []
      },
      overrides: {
        tags: ['groceries', 'household']
      },
      derived: {
        unresolved: false,
        uahAmount: -80
      }
    },
    {
      source: {
        id: 'b',
        category: 'Original',
        sourceFullCategory: 'File / Original',
        tags: []
      },
      overrides: {},
      derived: {
        unresolved: false,
        uahAmount: -20
      }
    }
  ];

  const result = buildTagPieDatasetUAHAbsoluteNet(rows);
  assert.deepEqual(result, [
    { label: 'groceries', signedNet: -80, absoluteNet: 80 },
    { label: 'household', signedNet: -80, absoluteNet: 80 },
    { label: 'No tag', signedNet: -20, absoluteNet: 20 }
  ]);
});

test('parseTagGroupsText requires named groups and rejects duplicates across groups', () => {
  const parsed = parseTagGroupsText('Priorities: P0, P1, p1\nPersonal: Bogdan, Yulia\nBudget: P0, Shared');

  assert.equal(parsed.groups.length, 3);
  assert.equal(parsed.groups[0].name, 'Priorities');
  assert.deepEqual(parsed.groups[0].tags, ['P0', 'P1']);
  assert.equal(parsed.isValid, false);
  assert.equal(parsed.issues.length, 1);
  assert.equal(parsed.issues[0].type, 'duplicate_tag_across_groups');
});

test('parseTagGroupsText reports invalid lines without separator or without name', () => {
  const parsed = parseTagGroupsText('No separator line\n: orphan tags\nValid: Alpha');

  assert.equal(parsed.isValid, false);
  assert.equal(parsed.groups.length, 1);
  assert.equal(parsed.groups[0].name, 'Valid');
  assert.equal(parsed.issues.length, 2);
  assert.equal(parsed.issues[0].type, 'invalid_group_format');
  assert.equal(parsed.issues[1].type, 'missing_group_name');
});

test('parseCategoryMergeRulesText parses quoted semicolon CSV and reports conflicts', () => {
  const parsed = parseCategoryMergeRulesText(
    '"Master / One";"Child / A";"Child / B"\n' +
      '"Master / Two";"Child / B";"Child / C"\n' +
      '"Broken line"'
  );

  assert.equal(parsed.rules.length, 2);
  assert.equal(parsed.rules[0].master, 'Master / One');
  assert.deepEqual(parsed.rules[0].effectiveChildren, ['Child / A', 'Child / B']);
  assert.equal(parsed.rules[1].master, 'Master / Two');
  assert.deepEqual(parsed.rules[1].effectiveChildren, ['Child / C']);
  assert.equal(parsed.childToMaster.get('Child / A'), 'Master / One');
  assert.equal(parsed.childToMaster.get('Child / B'), 'Master / One');
  assert.equal(parsed.childToMaster.get('Child / C'), 'Master / Two');
  assert.equal(parsed.appliedMappingsCount, 3);
  assert.equal(parsed.isValid, false);
  assert.equal(parsed.issues.some((issue) => issue.type === 'child_conflict'), true);
  assert.equal(parsed.issues.some((issue) => issue.type === 'missing_children'), true);
});

test('validateRowTagsAgainstGroups catches unknown tags and same-group conflicts', () => {
  const taxonomy = parseTagGroupsText('Priorities: P0, P1\nPersonal: Bogdan, Yulia');
  const validation = validateRowTagsAgainstGroups(['P0', 'P1', 'Ghost'], taxonomy);

  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.unknownTags, ['Ghost']);
  assert.deepEqual(validation.duplicateGroups, [{ groupIndex: 0, tags: ['P0', 'P1'] }]);
});

test('normalizeTagGroupIndex keeps value in range', () => {
  assert.equal(normalizeTagGroupIndex('1', 3), 1);
  assert.equal(normalizeTagGroupIndex('9', 3), 0);
  assert.equal(normalizeTagGroupIndex('-1', 3), 0);
});

test('applyBulkTagMutation updates selected rows and reports skips', () => {
  const rowsById = {
    r1: {
      id: 'r1',
      source: { id: 'r1', tags: [] },
      overrides: { tags: ['P0'] }
    },
    r2: {
      id: 'r2',
      source: { id: 'r2', tags: [] },
      overrides: { tags: ['Yulia'] }
    },
    r3: {
      id: 'r3',
      source: { id: 'r3', tags: [] },
      overrides: { tags: ['Ghost'] }
    }
  };

  const addResult = applyBulkTagMutation(
    rowsById,
    ['r1', 'r2', 'r3'],
    'add',
    'Bogdan',
    'Priorities: P0, P1\nPersonal: Bogdan, Yulia'
  );

  assert.equal(addResult.stats.updated, 1);
  assert.equal(addResult.stats.skippedConflict, 1);
  assert.equal(addResult.stats.skippedInvalid, 1);
  assert.deepEqual(addResult.rowsById.r1.overrides.tags, ['Bogdan', 'P0']);

  const removeResult = applyBulkTagMutation(
    addResult.rowsById,
    ['r1'],
    'remove',
    'P0',
    'Priorities: P0, P1\nPersonal: Bogdan, Yulia'
  );
  assert.equal(removeResult.stats.updated, 1);
  assert.deepEqual(removeResult.rowsById.r1.overrides.tags, ['Bogdan']);
});

test('buildTagGroupPieDatasetUAHAbsoluteNet uses one bucket per row in selected group', () => {
  const rows = [
    {
      source: {
        id: 'a',
        category: 'Original',
        sourceFullCategory: 'File / Original',
        tags: []
      },
      overrides: {
        tags: ['P0', 'Bogdan']
      },
      derived: {
        unresolved: false,
        uahAmount: -100
      }
    },
    {
      source: {
        id: 'b',
        category: 'Original',
        sourceFullCategory: 'File / Original',
        tags: []
      },
      overrides: {
        tags: ['P1']
      },
      derived: {
        unresolved: false,
        uahAmount: -50
      }
    },
    {
      source: {
        id: 'c',
        category: 'Original',
        sourceFullCategory: 'File / Original',
        tags: []
      },
      overrides: {},
      derived: {
        unresolved: false,
        uahAmount: -20
      }
    },
    {
      source: {
        id: 'd',
        category: 'Original',
        sourceFullCategory: 'File / Original',
        tags: []
      },
      overrides: {
        tags: ['P0', 'P1']
      },
      derived: {
        unresolved: false,
        uahAmount: -30
      }
    }
  ];

  const result = buildTagGroupPieDatasetUAHAbsoluteNet(
    rows,
    'Priorities: P0, P1\nPersonal: Bogdan, Yulia',
    0
  );
  assert.deepEqual(result, [
    { label: 'P0', signedNet: -100, absoluteNet: 100 },
    { label: 'P1', signedNet: -50, absoluteNet: 50 },
    { label: TAG_GROUP_INVALID_LABEL, signedNet: -30, absoluteNet: 30 },
    { label: TAG_GROUP_NO_TAG_LABEL, signedNet: -20, absoluteNet: 20 }
  ]);
});

test('matchesFilter finds rows by any tag in a multi-tag row', () => {
  const record = {
    source: {
      id: 'a',
      date: '2026-04-01 11:00',
      category: 'Original',
      sourceFullCategory: 'File / Original',
      price: '-100',
      currency: 'UAH',
      rate: '',
      rateType: '',
      notes: 'Weekly shopping',
      image: '',
      tags: []
    },
    overrides: {
      tags: ['groceries', 'family']
    },
    derived: {
      unresolved: false,
      effectiveDateEpoch: 1711962000000
    }
  };

  assert.equal(
    matchesFilter(record, {
      search: '',
      tag: 'fam',
      tagsLt2Only: false,
      dateFrom: '',
      dateTo: '',
      status: 'all'
    }),
    true
  );

  assert.equal(
    matchesFilter(record, {
      search: '',
      tag: 'rent',
      tagsLt2Only: false,
      dateFrom: '',
      dateTo: '',
      status: 'all'
    }),
    false
  );
});

test('matchesFilter can find both merged and base final categories', () => {
  const record = {
    source: {
      id: 'a',
      date: '2026-04-01 11:00',
      category: 'Original',
      sourceFullCategory: 'Child / Bucket',
      price: '-100',
      currency: 'UAH',
      rate: '',
      rateType: '',
      notes: 'Weekly shopping',
      image: '',
      tags: []
    },
    overrides: {},
    derived: {
      unresolved: false,
      effectiveDateEpoch: 1711962000000,
      baseFullCategory: 'Child / Bucket',
      finalFullCategory: 'Master / Bucket'
    }
  };

  assert.equal(
    matchesFilter(record, {
      search: 'master / bucket',
      tag: '',
      tagsLt2Only: false,
      dateFrom: '',
      dateTo: '',
      status: 'all'
    }),
    true
  );

  assert.equal(
    matchesFilter(record, {
      search: 'child / bucket',
      tag: '',
      tagsLt2Only: false,
      dateFrom: '',
      dateTo: '',
      status: 'all'
    }),
    true
  );
});

test('matchesFilter supports <2 tags toggle for table filtering', () => {
  const record = {
    source: {
      id: 'a',
      date: '2026-04-01 11:00',
      category: 'Original',
      sourceFullCategory: 'File / Original',
      price: '-100',
      currency: 'UAH',
      rate: '',
      rateType: '',
      notes: 'Weekly shopping',
      image: '',
      tags: []
    },
    overrides: {
      tags: ['family', 'groceries']
    },
    derived: {
      unresolved: false,
      effectiveDateEpoch: 1711962000000
    }
  };

  assert.equal(
    matchesFilter(record, {
      search: '',
      tag: '',
      tagsLt2Only: true,
      dateFrom: '',
      dateTo: '',
      status: 'all'
    }),
    false
  );

  assert.equal(
    matchesFilter(record, {
      search: '',
      tag: '',
      tagsLt2Only: false,
      dateFrom: '',
      dateTo: '',
      status: 'all'
    }),
    true
  );
});

test('matchesFilter keeps end date inclusive for full day', () => {
  const record = {
    source: {
      id: 'a',
      date: '2026-04-01 23:59',
      category: 'Original',
      sourceFullCategory: 'File / Original',
      price: '-100',
      currency: 'UAH',
      rate: '',
      rateType: '',
      notes: '',
      image: '',
      tags: []
    },
    overrides: {},
    derived: {
      unresolved: false,
      effectiveDateEpoch: 1712015940000
    }
  };

  assert.equal(
    matchesFilter(record, {
      search: '',
      tag: '',
      tagsLt2Only: false,
      dateFrom: '2026-04-01',
      dateTo: '2026-04-01',
      status: 'all'
    }),
    true
  );

  assert.equal(
    matchesFilter(record, {
      search: '',
      tag: '',
      tagsLt2Only: false,
      dateFrom: '2026-04-02',
      dateTo: '2026-04-02',
      status: 'all'
    }),
    false
  );
});

test('sanitizeLoadedState resets unsupported versions to empty state', () => {
  const legacyState = {
    version: STORAGE_VERSION - 1,
    rowsById: {
      row1: {
        id: 'row1',
        source: {
          id: 'row1',
          date: '2026-04-01 11:00',
          category: 'Original',
          sourceFullCategory: 'File / Original',
          price: '-20',
          currency: 'UAH',
          rate: '',
          rateType: '',
          notes: '',
          image: '',
          tag: 'legacy-source-tag'
        },
        overrides: {
          tag: 'legacy-override-tag',
          notes: 'keep me'
        },
        derived: {}
      }
    },
    uiPrefs: {
      filters: {
        search: 'legacy',
        tag: 'legacy',
        dateFrom: '2026-04-01T00:00',
        dateTo: '2026-04-30T23:59',
        status: 'resolved'
      }
    }
  };

  const migrated = sanitizeLoadedState(legacyState);
  const emptyState = createEmptyState();

  assert.equal(migrated.version, STORAGE_VERSION);
  assert.deepEqual(migrated.rowsById, emptyState.rowsById);
  assert.deepEqual(migrated.importHistory, emptyState.importHistory);
  assert.equal(migrated.tagGroupsText, '');
  assert.equal(migrated.categoryMergeRulesText, '');
  assert.equal(migrated.uiPrefs.activeScreen, emptyState.uiPrefs.activeScreen);
  assert.equal(migrated.uiPrefs.filters.status, emptyState.uiPrefs.filters.status);
  assert.equal(migrated.uiPrefs.filters.search, emptyState.uiPrefs.filters.search);
});

test('sanitizeLoadedState normalizes filter dates to YYYY-MM-DD and defaults tagsLt2Only', () => {
  const state = createEmptyState();
  state.uiPrefs.filters.dateFrom = '2026-04-01T10:22';
  state.uiPrefs.filters.dateTo = '2026-04-30 23:59';
  state.uiPrefs.filters.tagsLt2Only = true;

  const sanitized = sanitizeLoadedState(state);
  assert.equal(sanitized.uiPrefs.filters.dateFrom, '2026-04-01');
  assert.equal(sanitized.uiPrefs.filters.dateTo, '2026-04-30');
  assert.equal(sanitized.uiPrefs.filters.tagsLt2Only, true);

  const withoutBoolean = sanitizeLoadedState({
    ...state,
    uiPrefs: {
      ...state.uiPrefs,
      filters: {
        ...state.uiPrefs.filters,
        tagsLt2Only: 'yes'
      }
    }
  });
  assert.equal(withoutBoolean.uiPrefs.filters.tagsLt2Only, false);
});

test('sanitizeLoadedState defaults displayCurrency and manualUsdRatesText when missing', () => {
  const state = createEmptyState();
  delete state.manualUsdRatesText;
  delete state.uiPrefs.displayCurrency;

  const sanitized = sanitizeLoadedState(state);
  assert.equal(sanitized.manualUsdRatesText, '');
  assert.equal(sanitized.uiPrefs.displayCurrency, 'UAH');
});

test('parseStateSnapshotJson accepts valid current snapshot', () => {
  const snapshot = createEmptyState();
  snapshot.uiPrefs.activeScreen = 'data-ops';
  snapshot.updatedAt = '2026-04-22T09:00:00.000Z';

  const parsed = parseStateSnapshotJson(JSON.stringify(snapshot));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.state.version, STORAGE_VERSION);
  assert.equal(parsed.state.uiPrefs.activeScreen, 'data-ops');
});

test('parseStateSnapshotJson accepts snapshot without categoryMergeRulesText', () => {
  const snapshot = createEmptyState();
  delete snapshot.categoryMergeRulesText;

  const parsed = parseStateSnapshotJson(JSON.stringify(snapshot));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.state.categoryMergeRulesText, '');
});

test('parseStateSnapshotJson accepts snapshot without manualUsdRatesText', () => {
  const snapshot = createEmptyState();
  delete snapshot.manualUsdRatesText;

  const parsed = parseStateSnapshotJson(JSON.stringify(snapshot));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.state.manualUsdRatesText, '');
});

test('parseStateSnapshotJson rejects invalid JSON', () => {
  const parsed = parseStateSnapshotJson('{ invalid json ');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'Invalid JSON.');
});

test('parseStateSnapshotJson rejects unsupported snapshot version', () => {
  const snapshot = createEmptyState();
  snapshot.version = STORAGE_VERSION - 1;

  const parsed = parseStateSnapshotJson(JSON.stringify(snapshot));
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Unsupported snapshot version/);
});

test('parseStateSnapshotJson rejects missing required shape', () => {
  const snapshot = createEmptyState();
  snapshot.uiPrefs = {};

  const parsed = parseStateSnapshotJson(JSON.stringify(snapshot));
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /uiPrefs\.activeScreen/);
});

test('parseStateSnapshotJson rejects invalid displayCurrency', () => {
  const snapshot = createEmptyState();
  snapshot.uiPrefs.displayCurrency = 'EUR';

  const parsed = parseStateSnapshotJson(JSON.stringify(snapshot));
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /uiPrefs\.displayCurrency/);
});
