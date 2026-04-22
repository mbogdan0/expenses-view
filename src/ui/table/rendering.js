import { getDateInputParts } from './helpers.js';

export function createRenderingHandlers({
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
  updateSelectionUi,
  refreshSelectionControls
}) {
  function getVisibleRows() {
    const records = Object.values(app.state.rowsById || {});
    const filters = app.state.uiPrefs.filters || {};
    const baseFilters = {
      ...filters,
      status: 'all'
    };
    const displayCurrency = normalizeDisplayCurrency(app.state.uiPrefs.displayCurrency);
    const status = filters.status || 'all';

    const filtered = records
      .filter((record) => matchesFilter(record, baseFilters))
      .filter((record) => {
        if (status === 'all') {
          return true;
        }

        const unresolved = Boolean(getRowConversionForDisplayCurrency(record, displayCurrency).unresolved);
        return status === 'resolved' ? !unresolved : unresolved;
      });
    return sortRowsByDateDesc(filtered);
  }

  function buildTagGroupPreviewLabel(group, index) {
    const name = String(group?.name || '').trim();
    if (name) {
      return name;
    }
    return `Group ${index + 1}`;
  }

  function renderBulkTagControls(rows, tagGroups) {
    state.latestBulkActionsEnabled = Boolean(tagGroups?.isValid && tagGroups?.hasGroups);

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

  function renderDataTable(rows) {
    const displayCurrency = normalizeDisplayCurrency(app.state.uiPrefs.displayCurrency);

    if (elements.amountColumnHeader) {
      elements.amountColumnHeader.textContent = displayCurrency;
    }

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
        const conversion = getRowConversionForDisplayCurrency(record, displayCurrency);
        const unresolved = Boolean(conversion.unresolved);
        const displayCategory = record.derived?.finalFullCategory || effective.fullCategory;
        const categoryMergeStatus = record.derived?.categoryMergeStatus || 'none';
        const finalCategoryClass =
          categoryMergeStatus === 'master_missing' ? 'final-category-missing-master' : '';
        const tagErrors = Array.isArray(record.derived?.tagValidation?.errors)
          ? record.derived.tagValidation.errors
          : [];
        const tagCount = effective.tags.length;
        const tagCountClass = tagCount === 0 ? 'tags-count-0' : tagCount === 1 ? 'tags-count-1' : 'tags-count-2plus';
        const amountDisplay = unresolved ? '—' : formatMoney(conversion.amount || 0);
        const rateSource = unresolved
          ? conversion.warning || 'Missing rate'
          : conversion.rateSource || '—';
        const dateInputParts = getDateInputParts(formatDateInputValue, effective.date);

        return `<tr data-row-id="${escapeHtml(record.id)}" class="${unresolved ? 'unresolved-row' : ''}">
        <td class="select-column"><input data-row-select="${escapeAttribute(record.id)}" type="checkbox" ${app.selectedRowIds.has(record.id) ? 'checked' : ''} /></td>
        <td class="date-column"><input data-field="date" type="date" value="${escapeAttribute(dateInputParts.datePart)}" title="${escapeAttribute(dateInputParts.titleValue)}" /></td>
        <td class="uah-cell uah-column">${escapeHtml(amountDisplay)}</td>
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

    const unresolvedCount = rows.filter((row) =>
      getRowConversionForDisplayCurrency(row, displayCurrency).unresolved
    ).length;
    const invalidTagsCount = rows.filter((row) => !row.derived?.tagValidation?.isValid).length;
    elements.tableMeta.textContent = `${rows.length} rows shown · ${Object.keys(app.state.rowsById).length} rows total · ${unresolvedCount} unresolved (${displayCurrency}) · ${invalidTagsCount} invalid tags`;
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
    getVisibleRows,
    buildTagGroupPreviewLabel,
    renderBulkTagControls,
    renderTagGroupsPanel,
    renderDataTable,
    applyExtraColumnsVisibility
  };
}
