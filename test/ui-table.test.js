import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableUi } from '../src/ui/ui-table.js';

function createRow(id) {
  return {
    id,
    source: {
      id,
      date: '2026-04-01 11:00',
      category: 'Category',
      sourceFullCategory: 'File / Category',
      price: '-10',
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
      uahAmount: -10,
      usdUnresolved: false,
      usdAmount: -0.25,
      rateSource: 'same-currency',
      usdRateSource: 'manual:UAH/USD:2026-04-01',
      tagValidation: {
        isValid: true,
        errors: []
      }
    }
  };
}

function createTagGroups({ isValid = true, hasGroups = true } = {}) {
  if (!hasGroups) {
    return {
      groups: [],
      allTags: [],
      isValid,
      hasGroups: false
    };
  }

  return {
    groups: [
      {
        index: 0,
        name: 'Priorities',
        tags: ['P0', 'P1']
      }
    ],
    allTags: ['P0', 'P1'],
    isValid,
    hasGroups: true
  };
}

function createTableHarness(rows, overrides = {}) {
  const rowsById = Object.fromEntries(rows.map((row) => [row.id, row]));
  const app = {
    state: {
      rowsById,
      tagGroupsText: '',
      categoryMergeRulesText: '',
      manualUsdRatesText: '',
      uiPrefs: {
        displayCurrency: 'UAH',
        filters: {}
      }
    },
    selectedRowIds: new Set(),
    currentRows: rows
  };

  const elements = {
    rowsBody: { innerHTML: '' },
    tableMeta: { textContent: '' },
    amountColumnHeader: { textContent: '' },
    selectVisibleRows: { checked: false, indeterminate: false },
    bulkSelectedCount: { textContent: '' },
    bulkTagSelect: { value: '', innerHTML: '' },
    bulkAddTagButton: { disabled: true },
    bulkRemoveTagButton: { disabled: true }
  };

  const defaultSetStatus = () => {};
  const defaultRender = () => {};
  const defaultValidateRowTagsAgainstGroups = () => ({
    taxonomyValid: true,
    isValid: true,
    errors: []
  });

  const tableUi = createTableUi({
    app,
    elements,
    computeEffectiveRow: (source, overrides = {}) => ({
      date: overrides.date ?? source.date ?? '',
      fullCategory: overrides.fullCategory ?? source.sourceFullCategory ?? '',
      price: overrides.price ?? source.price ?? '',
      currency: overrides.currency ?? source.currency ?? '',
      notes: overrides.notes ?? source.notes ?? '',
      originalCategory: source.category ?? '',
      originalSourceFullCategory: source.sourceFullCategory ?? '',
      rate: overrides.rate ?? source.rate ?? '',
      rateType: overrides.rateType ?? source.rateType ?? '',
      tags: overrides.tags ?? source.tags ?? []
    }),
    formatDateInputValue: (value) => String(value || '').replace(' ', 'T'),
    formatMoney: (value) => String(value),
    formatTagsInput: (tags) => tags.join(', '),
    matchesFilter: () => true,
    normalizeCurrency: (value) => String(value || '').trim().toUpperCase(),
    normalizeTags: (value) =>
      String(value || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    normalizeDisplayCurrency: (value) => (String(value || '').toUpperCase() === 'USD' ? 'USD' : 'UAH'),
    getRowConversionForDisplayCurrency: (row, displayCurrency) =>
      String(displayCurrency || '').toUpperCase() === 'USD'
        ? {
            unresolved: Boolean(row.derived?.usdUnresolved),
            warning: row.derived?.usdWarning || null,
            rateSource: row.derived?.usdRateSource || null,
            amount: row.derived?.usdAmount ?? null
          }
        : {
            unresolved: Boolean(row.derived?.unresolved),
            warning: row.derived?.warning || null,
            rateSource: row.derived?.rateSource || null,
            amount: row.derived?.uahAmount ?? null
          },
    recomputeDerivedRows: (rowsValue) => rowsValue,
    sortRowsByDateDesc: (rowsValue) => rowsValue,
    validateRowTagsAgainstGroups:
      overrides.validateRowTagsAgainstGroups || defaultValidateRowTagsAgainstGroups,
    applyBulkTagMutation: () => ({
      rowsById,
      stats: {
        action: 'add',
        updated: 0,
        unchanged: 0,
        skippedConflict: 0,
        skippedInvalid: 0,
        skippedUnknownTag: 0,
        skippedInvalidTaxonomy: 0,
        skippedMissingRow: 0
      }
    }),
    escapeHtml: (value) => String(value || ''),
    escapeAttribute: (value) => String(value || ''),
    formatFinalCategoryHtml: (value) => String(value || ''),
    setStatus: overrides.setStatus || defaultSetStatus,
    saveState: () => {},
    render: overrides.render || defaultRender
  });

  return { app, elements, tableUi };
}

test('row checkbox toggles selected counter and bulk buttons', () => {
  const rows = [createRow('r1'), createRow('r2')];
  const { app, elements, tableUi } = createTableHarness(rows);
  tableUi.renderBulkTagControls(rows, createTagGroups({ isValid: true, hasGroups: true }));

  assert.equal(elements.bulkSelectedCount.textContent, '0 selected');
  assert.equal(elements.bulkAddTagButton.disabled, true);

  tableUi.onRowsBodyChange({
    target: {
      dataset: { rowSelect: 'r1' },
      checked: true
    }
  });

  assert.equal(app.selectedRowIds.has('r1'), true);
  assert.equal(elements.bulkSelectedCount.textContent, '1 selected');
  assert.equal(elements.bulkAddTagButton.disabled, false);
  assert.equal(elements.bulkRemoveTagButton.disabled, false);

  tableUi.onRowsBodyChange({
    target: {
      dataset: { rowSelect: 'r1' },
      checked: false
    }
  });

  assert.equal(app.selectedRowIds.has('r1'), false);
  assert.equal(elements.bulkSelectedCount.textContent, '0 selected');
  assert.equal(elements.bulkAddTagButton.disabled, true);
  assert.equal(elements.bulkRemoveTagButton.disabled, true);
});

test('select visible updates selected counter to visible row count', () => {
  const rows = [createRow('r1'), createRow('r2'), createRow('r3')];
  const { app, elements, tableUi } = createTableHarness(rows);
  tableUi.renderBulkTagControls(rows, createTagGroups({ isValid: true, hasGroups: true }));

  tableUi.onSelectVisibleRowsChange({
    target: {
      checked: true
    }
  });

  assert.equal(app.selectedRowIds.size, 3);
  assert.equal(elements.bulkSelectedCount.textContent, '3 selected');
  assert.equal(elements.selectVisibleRows.checked, true);
  assert.equal(elements.selectVisibleRows.indeterminate, false);
  assert.equal(elements.bulkAddTagButton.disabled, false);

  tableUi.onSelectVisibleRowsChange({
    target: {
      checked: false
    }
  });

  assert.equal(app.selectedRowIds.size, 0);
  assert.equal(elements.bulkSelectedCount.textContent, '0 selected');
  assert.equal(elements.selectVisibleRows.checked, false);
  assert.equal(elements.selectVisibleRows.indeterminate, false);
  assert.equal(elements.bulkAddTagButton.disabled, true);
});

test('bulk buttons follow selected count and taxonomy eligibility', () => {
  const rows = [createRow('r1')];
  const { elements, tableUi } = createTableHarness(rows);

  tableUi.renderBulkTagControls(rows, createTagGroups({ isValid: false, hasGroups: true }));
  tableUi.onRowsBodyChange({
    target: {
      dataset: { rowSelect: 'r1' },
      checked: true
    }
  });
  assert.equal(elements.bulkSelectedCount.textContent, '1 selected');
  assert.equal(elements.bulkAddTagButton.disabled, true);
  assert.equal(elements.bulkRemoveTagButton.disabled, true);

  tableUi.renderBulkTagControls(rows, createTagGroups({ isValid: true, hasGroups: false }));
  assert.equal(elements.bulkAddTagButton.disabled, true);
  assert.equal(elements.bulkRemoveTagButton.disabled, true);

  tableUi.renderBulkTagControls(rows, createTagGroups({ isValid: true, hasGroups: true }));
  assert.equal(elements.bulkAddTagButton.disabled, false);
  assert.equal(elements.bulkRemoveTagButton.disabled, false);

  tableUi.onRowsBodyChange({
    target: {
      dataset: { rowSelect: 'r1' },
      checked: false
    }
  });
  assert.equal(elements.bulkSelectedCount.textContent, '0 selected');
  assert.equal(elements.bulkAddTagButton.disabled, true);
  assert.equal(elements.bulkRemoveTagButton.disabled, true);
});

test('syncSelectionWithVisibleRows drops hidden selections and counter follows', () => {
  const rows = [createRow('r1'), createRow('r2'), createRow('r3')];
  const visibleRows = [rows[0], rows[2]];
  const { app, elements, tableUi } = createTableHarness(rows);

  app.selectedRowIds.add('r1');
  app.selectedRowIds.add('r2');
  app.selectedRowIds.add('r3');

  tableUi.syncSelectionWithVisibleRows(visibleRows);
  tableUi.renderBulkTagControls(visibleRows, createTagGroups({ isValid: true, hasGroups: true }));

  assert.deepEqual(Array.from(app.selectedRowIds).sort(), ['r1', 'r3']);
  assert.equal(elements.bulkSelectedCount.textContent, '2 selected');
  assert.equal(elements.bulkAddTagButton.disabled, false);
});

test('renderDataTable highlights final category when merge master is missing', () => {
  const row = createRow('r1');
  row.derived.finalFullCategory = 'Child / Missing';
  row.derived.categoryMergeStatus = 'master_missing';

  const { elements, tableUi } = createTableHarness([row]);
  tableUi.renderDataTable([row]);

  assert.equal(
    elements.rowsBody.innerHTML.includes('final-category-missing-master'),
    true
  );
  assert.equal(
    elements.rowsBody.innerHTML.includes('Child / Missing'),
    true
  );
});

test('date update keeps existing time part', () => {
  const row = createRow('r1');
  const { app, tableUi } = createTableHarness([row]);

  tableUi.onRowsBodyChange({
    target: {
      dataset: { field: 'date' },
      value: '2026-04-05',
      closest: () => ({
        dataset: { rowId: 'r1' }
      })
    }
  });

  assert.equal(app.state.rowsById.r1.overrides.date, '2026-04-05 11:00');
});

test('tag edit rejects invalid taxonomy and leaves overrides unchanged', () => {
  const row = createRow('r1');
  const statusMessages = [];
  let renderCalls = 0;
  const { app, tableUi } = createTableHarness([row], {
    validateRowTagsAgainstGroups: () => ({
      taxonomyValid: false,
      isValid: false,
      errors: ['Unknown tags: P0']
    }),
    setStatus: (message) => {
      statusMessages.push(message);
    },
    render: () => {
      renderCalls += 1;
    }
  });

  tableUi.onRowsBodyChange({
    target: {
      dataset: { field: 'tags' },
      value: 'P0',
      closest: () => ({
        dataset: { rowId: 'r1' }
      })
    }
  });

  assert.equal(app.state.rowsById.r1.overrides.tags, undefined);
  assert.equal(
    statusMessages[0],
    'Tag update rejected: tag taxonomy has duplicate tags across groups.'
  );
  assert.equal(renderCalls, 1);
});

test('renderDataTable shows date-only input and full datetime title', () => {
  const row = createRow('r1');
  const { elements, tableUi } = createTableHarness([row]);

  tableUi.renderDataTable([row]);

  assert.equal(elements.rowsBody.innerHTML.includes('type="date"'), true);
  assert.equal(elements.rowsBody.innerHTML.includes('type="datetime-local"'), false);
  assert.equal(elements.rowsBody.innerHTML.includes('title="2026-04-01 11:00"'), true);
});

test('renderDataTable updates amount header and unresolved logic by display currency', () => {
  const row = createRow('r1');
  row.derived.unresolved = false;
  row.derived.uahAmount = -10;
  row.derived.rateSource = 'native';
  row.derived.usdUnresolved = true;
  row.derived.usdAmount = null;
  row.derived.usdWarning = 'Missing manual USD rate for UAH/USD';
  row.derived.usdRateSource = null;

  const { app, elements, tableUi } = createTableHarness([row]);

  app.state.uiPrefs.displayCurrency = 'UAH';
  tableUi.renderDataTable([row]);
  assert.equal(elements.amountColumnHeader.textContent, 'UAH');
  assert.equal(elements.rowsBody.innerHTML.includes('unresolved-row'), false);
  assert.equal(elements.tableMeta.textContent.includes('0 unresolved (UAH)'), true);

  app.state.uiPrefs.displayCurrency = 'USD';
  tableUi.renderDataTable([row]);
  assert.equal(elements.amountColumnHeader.textContent, 'USD');
  assert.equal(elements.rowsBody.innerHTML.includes('unresolved-row'), true);
  assert.equal(elements.tableMeta.textContent.includes('1 unresolved (USD)'), true);
});

test('getVisibleRows applies status filter using selected display currency', () => {
  const rowA = createRow('a');
  rowA.derived.unresolved = false;
  rowA.derived.usdUnresolved = true;
  const rowB = createRow('b');
  rowB.derived.unresolved = true;
  rowB.derived.usdUnresolved = false;

  const { app, tableUi } = createTableHarness([rowA, rowB]);
  app.state.uiPrefs.filters.status = 'unresolved';

  app.state.uiPrefs.displayCurrency = 'USD';
  const usdRows = tableUi.getVisibleRows();
  assert.deepEqual(usdRows.map((row) => row.id), ['a']);

  app.state.uiPrefs.displayCurrency = 'UAH';
  const uahRows = tableUi.getVisibleRows();
  assert.deepEqual(uahRows.map((row) => row.id), ['b']);
});
