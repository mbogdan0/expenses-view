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
  let latestBulkActionsEnabled = false;

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
      nextValue = nextValue ? nextValue.replace('T', ' ') : '';
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

  function onSelectVisibleRowsChange(event) {
    const shouldSelectVisible = Boolean(event.target.checked);
    for (const row of app.currentRows) {
      if (shouldSelectVisible) {
        app.selectedRowIds.add(row.id);
      } else {
        app.selectedRowIds.delete(row.id);
      }
    }
    renderDataTable(app.currentRows);
    refreshSelectionControls(app.currentRows);
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
        app.state.categoryMergeRulesText
      );
      saveState(formatBulkMutationStatus(result.stats));
      render();
      return;
    }

    setStatus(formatBulkMutationStatus(result.stats));
    render();
  }

  function formatBulkMutationStatus(stats) {
    const base = `Bulk ${stats.action} complete: ${stats.updated} updated, ${stats.unchanged} unchanged`;
    const details = [];

    if (stats.skippedConflict) {
      details.push(`${stats.skippedConflict} skipped (group conflict)`);
    }
    if (stats.skippedInvalid) {
      details.push(`${stats.skippedInvalid} skipped (invalid row tags)`);
    }
    if (stats.skippedUnknownTag) {
      details.push(`${stats.skippedUnknownTag} skipped (unknown target tag)`);
    }
    if (stats.skippedInvalidTaxonomy) {
      details.push(`${stats.skippedInvalidTaxonomy} skipped (invalid taxonomy)`);
    }
    if (stats.skippedMissingRow) {
      details.push(`${stats.skippedMissingRow} missing rows`);
    }

    return details.length ? `${base}. ${details.join(', ')}.` : `${base}.`;
  }

  function upsertOverride(rowId, field, value) {
    const row = app.state.rowsById[rowId];
    if (!row) {
      return;
    }

    row.overrides = row.overrides || {};

    const sourceValue = field === 'fullCategory' ? row.source.sourceFullCategory : row.source[field] || '';
    const normalizedSource = normalizeComparableValue(field, sourceValue);
    const normalizedNext = normalizeComparableValue(field, value);

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

  function normalizeComparableValue(field, value) {
    if (field === 'currency') {
      return normalizeCurrency(value);
    }

    if (field === 'date') {
      return String(value || '').replace('T', ' ').trim();
    }

    if (field === 'tags') {
      return JSON.stringify(normalizeTags(value));
    }

    return String(value || '').trim();
  }

  function finalizeRowUpdate() {
    app.state.rowsById = recomputeDerivedRows(
      app.state.rowsById,
      app.state.tagGroupsText,
      app.state.categoryMergeRulesText
    );
    saveState();
    render();
  }

  function getVisibleRows() {
    const records = Object.values(app.state.rowsById || {});
    const filtered = records.filter((record) => matchesFilter(record, app.state.uiPrefs.filters));
    return sortRowsByDateDesc(filtered);
  }

  function syncSelectionWithVisibleRows(rows) {
    const visibleIds = new Set(rows.map((row) => row.id));
    for (const selectedId of Array.from(app.selectedRowIds)) {
      if (!visibleIds.has(selectedId)) {
        app.selectedRowIds.delete(selectedId);
      }
    }
  }

  function buildTagGroupPreviewLabel(group, index) {
    const name = String(group?.name || '').trim();
    if (name) {
      return name;
    }
    return `Group ${index + 1}`;
  }

  function renderBulkTagControls(rows, tagGroups) {
    latestBulkActionsEnabled = Boolean(tagGroups?.isValid && tagGroups?.hasGroups);

    if (elements.bulkTagSelect) {
      const currentValue = elements.bulkTagSelect.value;
      const options = ['<option value="">Select tag</option>'];
      for (const group of tagGroups.groups) {
        const label = buildTagGroupPreviewLabel(group, group.index);
        for (const tag of group.tags) {
          options.push(
            `<option value="${escapeAttribute(tag)}">${escapeHtml(label)} · ${escapeHtml(tag)}</option>`
          );
        }
      }
      elements.bulkTagSelect.innerHTML = options.join('');

      const stillExists = tagGroups.allTags.some((tag) => tag === currentValue);
      elements.bulkTagSelect.value = stillExists ? currentValue : '';
    }

    refreshSelectionControls(rows);
  }

  function renderTagGroupsPanel(tagGroups) {
    if (elements.tagGroupsMeta) {
      const validityText = tagGroups.isValid ? 'valid' : 'invalid';
      elements.tagGroupsMeta.textContent = `${tagGroups.groups.length} groups · ${tagGroups.allTags.length} tags · ${validityText}`;
    }

    if (elements.tagGroupsIssues) {
      if (!tagGroups.issues.length) {
        elements.tagGroupsIssues.innerHTML = '';
        return;
      }

      elements.tagGroupsIssues.innerHTML = tagGroups.issues
        .map((issue) => `<li>${escapeHtml(issue.message)}</li>`)
        .join('');
    }
  }

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

    const shouldEnableBulkActions = selectedCount > 0 && latestBulkActionsEnabled;
    if (elements.bulkAddTagButton) {
      elements.bulkAddTagButton.disabled = !shouldEnableBulkActions;
    }
    if (elements.bulkRemoveTagButton) {
      elements.bulkRemoveTagButton.disabled = !shouldEnableBulkActions;
    }
  }

  function renderDataTable(rows) {
    if (!rows.length) {
      elements.rowsBody.innerHTML =
        '<tr><td colspan="13" style="text-align:center; padding: 24px; color: #4e6166;">No rows found for current filters.</td></tr>';
      elements.tableMeta.textContent = `0 rows shown · ${Object.keys(app.state.rowsById).length} rows total`;
      updateSelectionUi(rows);
      return;
    }

    const html = rows
      .map((record) => {
        const effective = computeEffectiveRow(record.source, record.overrides);
        const unresolved = Boolean(record.derived?.unresolved);
        const displayCategory = record.derived?.finalFullCategory || effective.fullCategory;
        const categoryMergeStatus = record.derived?.categoryMergeStatus || 'none';
        const finalCategoryClass =
          categoryMergeStatus === 'master_missing' ? 'final-category-missing-master' : '';
        const tagErrors = Array.isArray(record.derived?.tagValidation?.errors)
          ? record.derived.tagValidation.errors
          : [];
        const tagCount = effective.tags.length;
        const tagCountClass = tagCount === 0 ? 'tags-count-0' : tagCount === 1 ? 'tags-count-1' : 'tags-count-2plus';
        const uahDisplay = unresolved ? '—' : formatMoney(record.derived?.uahAmount || 0);
        const rateSource = unresolved
          ? record.derived?.warning || 'Missing rate'
          : record.derived?.rateSource || '—';

        return `<tr data-row-id="${escapeHtml(record.id)}" class="${unresolved ? 'unresolved-row' : ''}">
        <td class="select-column"><input data-row-select="${escapeAttribute(record.id)}" type="checkbox" ${app.selectedRowIds.has(record.id) ? 'checked' : ''} /></td>
        <td class="date-column"><input data-field="date" type="datetime-local" value="${escapeAttribute(formatDateInputValue(effective.date))}" /></td>
        <td class="uah-cell uah-column">${escapeHtml(uahDisplay)}</td>
        <td class="final-category-column final-category-text ${finalCategoryClass}">${formatFinalCategoryHtml(displayCategory)}</td>
        <td class="tags-column ${tagCountClass}">
          <input data-field="tags" type="text" value="${escapeAttribute(formatTagsInput(effective.tags))}" placeholder="tag1, tag2" />
          ${tagErrors.length ? `<div class="cell-error">${escapeHtml(tagErrors.join(' | '))}</div>` : ''}
        </td>
        <td class="extra-column"><input data-field="price" type="text" value="${escapeAttribute(effective.price)}" /></td>
        <td class="extra-column"><input data-field="currency" type="text" value="${escapeAttribute(effective.currency)}" /></td>
        <td class="notes-column"><input class="notes-input" data-field="notes" type="text" value="${escapeAttribute(effective.notes)}" /></td>
        <td class="readonly-cell extra-column"><div class="readonly-value">${escapeHtml(effective.originalCategory)}</div></td>
        <td class="readonly-cell extra-column"><div class="readonly-value">${escapeHtml(effective.originalSourceFullCategory)}</div></td>
        <td class="extra-column"><input data-field="rate" type="text" value="${escapeAttribute(effective.rate)}" /></td>
        <td class="extra-column"><input data-field="rateType" type="text" value="${escapeAttribute(effective.rateType)}" /></td>
        <td class="rate-source-cell extra-column">${escapeHtml(rateSource)}</td>
      </tr>`;
      })
      .join('');

    elements.rowsBody.innerHTML = html;

    const unresolvedCount = rows.filter((row) => row.derived?.unresolved).length;
    const invalidTagsCount = rows.filter((row) => !row.derived?.tagValidation?.isValid).length;
    elements.tableMeta.textContent = `${rows.length} rows shown · ${Object.keys(app.state.rowsById).length} rows total · ${unresolvedCount} unresolved · ${invalidTagsCount} invalid tags`;
    updateSelectionUi(rows);
  }

  function applyExtraColumnsVisibility() {
    if (!elements.recordsTable) {
      return;
    }

    const showExtraColumns = Boolean(app.state.uiPrefs.showExtraColumns);
    elements.recordsTable.classList.toggle('hide-extra-columns', !showExtraColumns);

    if (elements.toggleExtraColumns) {
      elements.toggleExtraColumns.textContent = showExtraColumns
        ? 'Hide extra columns'
        : 'Show extra columns';
    }
  }

  return {
    onRowsBodyChange,
    onSelectVisibleRowsChange,
    runBulkTagMutation,
    getVisibleRows,
    syncSelectionWithVisibleRows,
    buildTagGroupPreviewLabel,
    renderBulkTagControls,
    renderTagGroupsPanel,
    updateSelectionUi,
    renderDataTable,
    applyExtraColumnsVisibility
  };
}
