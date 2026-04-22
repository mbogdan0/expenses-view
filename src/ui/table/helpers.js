export function getDateInputParts(formatDateInputValue, value) {
  const normalized = formatDateInputValue(value);
  if (!normalized) {
    return { datePart: '', timePart: '', titleValue: '' };
  }

  const [datePart = '', timePart = ''] = normalized.split('T');
  const hasTime = /^\d{2}:\d{2}$/.test(timePart);

  return {
    datePart,
    timePart: hasTime ? timePart : '',
    titleValue: hasTime ? `${datePart} ${timePart}` : datePart
  };
}

export function buildUpdatedDateValue(app, computeEffectiveRow, formatDateInputValue, rowId, selectedDate) {
  const nextDate = String(selectedDate || '').trim();
  if (!nextDate) {
    return '';
  }

  const row = app.state.rowsById?.[rowId];
  const effectiveDate = row ? computeEffectiveRow(row.source, row.overrides).date : '';
  const { timePart } = getDateInputParts(formatDateInputValue, effectiveDate);
  return timePart ? `${nextDate} ${timePart}` : nextDate;
}

export function normalizeComparableValue(normalizeCurrency, normalizeTags, field, value) {
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

export function formatBulkMutationStatus(stats) {
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
