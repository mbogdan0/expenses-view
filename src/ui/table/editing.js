import {
  buildUpdatedDateValue,
  formatBulkMutationStatus,
  normalizeComparableValue
} from './helpers.js';

export function createEditingHandlers({
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
  refreshSelectionControls
}) {
  function finalizeRowUpdate() {
    app.state.rowsById = recomputeDerivedRows(
      app.state.rowsById,
      app.state.tagGroupsText,
      app.state.categoryMergeRulesText,
      app.state.manualUsdRatesText
    );
    saveState();
    render();
  }

  function upsertOverride(rowId, field, value) {
    const row = app.state.rowsById[rowId];
    if (!row) {
      return;
    }

    row.overrides = row.overrides || {};

    const sourceValue = field === 'fullCategory' ? row.source.sourceFullCategory : row.source[field] || '';
    const normalizedSource = normalizeComparableValue(normalizeCurrency, normalizeTags, field, sourceValue);
    const normalizedNext = normalizeComparableValue(normalizeCurrency, normalizeTags, field, value);

    if (normalizedSource === normalizedNext) {
      delete row.overrides[field];
    } else {
      row.overrides[field] = value;
    }

    if (!Object.keys(row.overrides).length) {
      row.overrides = {};
    }

    finalizeRowUpdate();
  }

  function onRowInputChange(event) {
    const target = event.target;
    const rowElement = target.closest('tr[data-row-id]');
    if (!rowElement) {
      return;
    }

    const rowId = rowElement.dataset.rowId;
    const field = target.dataset.field;

    if (!rowId || !field) {
      return;
    }

    let nextValue = target.value;
    if (field === 'date') {
      nextValue = buildUpdatedDateValue(
        app,
        computeEffectiveRow,
        formatDateInputValue,
        rowId,
        nextValue
      );
    }
    if (field === 'currency') {
      nextValue = normalizeCurrency(nextValue);
    }
    if (field === 'tags') {
      nextValue = normalizeTags(nextValue);
      const validation = validateRowTagsAgainstGroups(nextValue, app.state.tagGroupsText);
      if (!validation.taxonomyValid) {
        setStatus('Tag update rejected: tag taxonomy has duplicate tags across groups.');
        render();
        return;
      }
      if (!validation.isValid) {
        setStatus(`Tag update rejected: ${validation.errors.join(' | ')}`);
        render();
        return;
      }
    }

    upsertOverride(rowId, field, nextValue);
  }

  function onRowsBodyChange(event) {
    const target = event.target;
    const selectableRowId = target?.dataset?.rowSelect;
    if (selectableRowId) {
      if (target.checked) {
        app.selectedRowIds.add(selectableRowId);
      } else {
        app.selectedRowIds.delete(selectableRowId);
      }
      refreshSelectionControls(app.currentRows);
      return;
    }

    onRowInputChange(event);
  }

  function runBulkTagMutation(action) {
    const selectedTag = elements.bulkTagSelect?.value || '';
    if (!selectedTag) {
      setStatus('Select a tag for bulk update.');
      return;
    }

    const selectedRowIds = Array.from(app.selectedRowIds);
    if (!selectedRowIds.length) {
      setStatus('Select at least one row for bulk update.');
      return;
    }

    const result = applyBulkTagMutation(
      app.state.rowsById,
      selectedRowIds,
      action,
      selectedTag,
      app.state.tagGroupsText
    );

    if (result.stats.updated > 0) {
      app.state.rowsById = recomputeDerivedRows(
        result.rowsById,
        app.state.tagGroupsText,
        app.state.categoryMergeRulesText,
        app.state.manualUsdRatesText
      );
      saveState(formatBulkMutationStatus(result.stats));
      render();
      return;
    }

    setStatus(formatBulkMutationStatus(result.stats));
    render();
  }

  return {
    onRowsBodyChange,
    runBulkTagMutation
  };
}
