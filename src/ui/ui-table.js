import { createEditingHandlers } from './table/editing.js';
import { createRenderingHandlers } from './table/rendering.js';
import { createSelectionHandlers } from './table/selection.js';

export function createTableUi({
  app,
  elements,
  computeEffectiveRow,
  formatDateInputValue,
  formatMoney,
  formatTagsInput,
  matchesFilter,
  normalizeCurrency,
  normalizeTags,
  normalizeDisplayCurrency,
  getRowConversionForDisplayCurrency,
  recomputeDerivedRows,
  sortRowsByDateDesc,
  validateRowTagsAgainstGroups,
  applyBulkTagMutation,
  escapeHtml,
  escapeAttribute,
  formatFinalCategoryHtml,
  setStatus,
  saveState,
  render
}) {
  const state = {
    latestBulkActionsEnabled: false
  };

  let rerenderTable = () => {};

  const selection = createSelectionHandlers({
    app,
    elements,
    state,
    rerenderTable: (rows) => rerenderTable(rows)
  });

  const rendering = createRenderingHandlers({
    app,
    elements,
    state,
    computeEffectiveRow,
    formatDateInputValue,
    formatMoney,
    formatTagsInput,
    matchesFilter,
    normalizeDisplayCurrency,
    getRowConversionForDisplayCurrency,
    sortRowsByDateDesc,
    escapeHtml,
    escapeAttribute,
    formatFinalCategoryHtml,
    updateSelectionUi: selection.updateSelectionUi,
    refreshSelectionControls: selection.refreshSelectionControls
  });

  rerenderTable = rendering.renderDataTable;

  const editing = createEditingHandlers({
    app,
    elements,
    computeEffectiveRow,
    formatDateInputValue,
    normalizeCurrency,
    normalizeTags,
    validateRowTagsAgainstGroups,
    applyBulkTagMutation,
    recomputeDerivedRows,
    setStatus,
    saveState,
    render,
    refreshSelectionControls: selection.refreshSelectionControls
  });

  return {
    onRowsBodyChange: editing.onRowsBodyChange,
    onSelectVisibleRowsChange: selection.onSelectVisibleRowsChange,
    runBulkTagMutation: editing.runBulkTagMutation,
    getVisibleRows: rendering.getVisibleRows,
    syncSelectionWithVisibleRows: selection.syncSelectionWithVisibleRows,
    buildTagGroupPreviewLabel: rendering.buildTagGroupPreviewLabel,
    renderBulkTagControls: rendering.renderBulkTagControls,
    renderTagGroupsPanel: rendering.renderTagGroupsPanel,
    updateSelectionUi: selection.updateSelectionUi,
    renderDataTable: rendering.renderDataTable,
    applyExtraColumnsVisibility: rendering.applyExtraColumnsVisibility
  };
}
