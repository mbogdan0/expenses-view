export function createSelectionHandlers({ app, elements, state, rerenderTable }) {
  function updateSelectionUi(rows) {
    if (!elements.selectVisibleRows) {
      return;
    }

    const totalRows = rows.length;
    const selectedVisible = rows.filter((row) => app.selectedRowIds.has(row.id)).length;
    elements.selectVisibleRows.checked = totalRows > 0 && selectedVisible === totalRows;
    elements.selectVisibleRows.indeterminate = selectedVisible > 0 && selectedVisible < totalRows;
  }

  function refreshSelectionControls(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const selectedCount = app.selectedRowIds.size;

    updateSelectionUi(safeRows);

    if (elements.bulkSelectedCount) {
      elements.bulkSelectedCount.textContent = `${selectedCount} selected`;
    }

    const shouldEnableBulkActions = selectedCount > 0 && state.latestBulkActionsEnabled;
    if (elements.bulkAddTagButton) {
      elements.bulkAddTagButton.disabled = !shouldEnableBulkActions;
    }
    if (elements.bulkRemoveTagButton) {
      elements.bulkRemoveTagButton.disabled = !shouldEnableBulkActions;
    }
  }

  function onSelectVisibleRowsChange(event) {
    const shouldSelectVisible = Boolean(event.target.checked);
    for (const row of app.currentRows) {
      if (shouldSelectVisible) {
        app.selectedRowIds.add(row.id);
      } else {
        app.selectedRowIds.delete(row.id);
      }
    }
    rerenderTable(app.currentRows);
    refreshSelectionControls(app.currentRows);
  }

  function syncSelectionWithVisibleRows(rows) {
    const visibleIds = new Set(rows.map((row) => row.id));
    for (const selectedId of Array.from(app.selectedRowIds)) {
      if (!visibleIds.has(selectedId)) {
        app.selectedRowIds.delete(selectedId);
      }
    }
  }

  return {
    updateSelectionUi,
    refreshSelectionControls,
    onSelectVisibleRowsChange,
    syncSelectionWithVisibleRows
  };
}
