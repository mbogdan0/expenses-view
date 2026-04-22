import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAG_GROUP_INVALID_LABEL,
  TAG_GROUP_NO_TAG_LABEL,
  applyBulkTagMutation,
  buildCategoryPieDatasetUAHAbsoluteNet,
  buildDedupId,
  buildPiePalette,
  buildTagGroupPieDatasetUAHAbsoluteNet,
  buildSourceFullCategory,
  buildTagPieDatasetUAHAbsoluteNet,
  countSelectedCalendarDays,
  computeEffectiveRow,
  createEmptyState,
  matchesFilter,
  normalizeTagGroupIndex,
  normalizeImportedRow,
  normalizeTags,
  parseCategoryMergeRulesText,
  parseExpenseCsv,
  parseTagGroupsText,
  parseStateSnapshotJson,
  recomputeDerivedRows,
  resolveRate,
  sanitizeLoadedState,
  STORAGE_VERSION,
  validateRowTagsAgainstGroups
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
