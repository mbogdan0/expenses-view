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
      rateSource: 'same-currency',
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

function createTableHarness(rows) {
  const rowsById = Object.fromEntries(rows.map((row) => [row.id, row]));
  const app = {
    state: {
      rowsById,
      tagGroupsText: '',
      uiPrefs: {
        filters: {}
      }
    },
    selectedRowIds: new Set(),
    currentRows: rows
  };

  const elements = {
    rowsBody: { innerHTML: '' },
    tableMeta: { textContent: '' },
    selectVisibleRows: { checked: false, indeterminate: false },
    bulkSelectedCount: { textContent: '' },
    bulkTagSelect: { value: '', innerHTML: '' },
    bulkAddTagButton: { disabled: true },
    bulkRemoveTagButton: { disabled: true }
  };

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
    recomputeDerivedRows: (rowsValue) => rowsValue,
    sortRowsByDateDesc: (rowsValue) => rowsValue,
    validateRowTagsAgainstGroups: () => ({
      taxonomyValid: true,
      isValid: true,
      errors: []
    }),
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
    setStatus: () => {},
    saveState: () => {},
    render: () => {}
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
