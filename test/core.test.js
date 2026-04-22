import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCategoryPieDatasetUAHAbsoluteNet,
  buildDedupId,
  buildSourceFullCategory,
  buildTagPieDatasetUAHAbsoluteNet,
  countSelectedCalendarDays,
  computeEffectiveRow,
  createEmptyState,
  matchesFilter,
  normalizeImportedRow,
  normalizeTags,
  parseExpenseCsv,
  parseStateSnapshotJson,
  recomputeDerivedRows,
  resolveRate,
  sanitizeLoadedState,
  STORAGE_VERSION
} from '../src/core.js';

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
  assert.deepEqual(tags, ['groceries', 'travel', 'family']);
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
      dateFrom: '',
      dateTo: '',
      status: 'all'
    }),
    false
  );
});

test('sanitizeLoadedState resets legacy tags and migrates chart dates into shared filters', () => {
  const legacyState = {
    version: 1,
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
        search: '',
        tag: '',
        dateFrom: '',
        dateTo: '',
        status: 'all'
      },
      chartsFilters: {
        dateFrom: '2026-04-01T00:00',
        dateTo: '2026-04-30T23:59'
      }
    }
  };

  const migrated = sanitizeLoadedState(legacyState);
  const migratedRow = migrated.rowsById.row1;

  assert.equal(migrated.version, STORAGE_VERSION);
  assert.deepEqual(migratedRow.source.tags, []);
  assert.equal(Object.hasOwn(migratedRow.source, 'tag'), false);
  assert.equal(Object.hasOwn(migratedRow.overrides, 'tag'), false);
  assert.equal(migratedRow.overrides.notes, 'keep me');
  assert.equal(migrated.uiPrefs.filters.dateFrom, '2026-04-01T00:00');
  assert.equal(migrated.uiPrefs.filters.dateTo, '2026-04-30T23:59');
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
