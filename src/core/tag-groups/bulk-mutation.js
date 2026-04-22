import { normalizeTags, sanitizeText } from '../primitives.js';
import { computeEffectiveRow } from '../row-effective.js';
import { ensureTagGroupsModel } from './model.js';
import { validateRowTagsAgainstGroups } from './validation.js';

function normalizeTagsForOverrideComparison(value) {
  return JSON.stringify(normalizeTags(value));
}

function applyTagsOverride(record, nextTags) {
  const normalizedNextTags = normalizeTags(nextTags);
  const sourceTags = normalizeTags(record.source?.tags);
  const nextRecord = {
    ...record,
    overrides: {
      ...(record.overrides || {})
    }
  };

  if (normalizeTagsForOverrideComparison(sourceTags) === normalizeTagsForOverrideComparison(normalizedNextTags)) {
    delete nextRecord.overrides.tags;
  } else {
    nextRecord.overrides.tags = normalizedNextTags;
  }

  if (!Object.keys(nextRecord.overrides).length) {
    nextRecord.overrides = {};
  }

  return nextRecord;
}

export function applyBulkTagMutation(rowsById, selectedRowIds, action, targetTag, tagGroupsInput) {
  const selectedIds = Array.from(
    new Set(
      (Array.isArray(selectedRowIds) ? selectedRowIds : [])
        .map((rowId) => String(rowId || '').trim())
        .filter(Boolean)
    )
  );

  const stats = {
    action,
    selected: selectedIds.length,
    processed: 0,
    updated: 0,
    unchanged: 0,
    skippedMissingRow: 0,
    skippedUnknownTag: 0,
    skippedConflict: 0,
    skippedInvalid: 0,
    skippedInvalidTaxonomy: 0
  };

  if (!selectedIds.length) {
    return {
      rowsById,
      stats
    };
  }

  const model = ensureTagGroupsModel(tagGroupsInput);
  if (!model.hasGroups || !model.isValid) {
    stats.skippedInvalidTaxonomy = selectedIds.length;
    return {
      rowsById,
      stats
    };
  }

  const normalizedTarget = sanitizeText(targetTag);
  const targetKey = normalizedTarget.toLowerCase();
  if (!targetKey || !model.tagToGroupIndex.has(targetKey)) {
    stats.skippedUnknownTag = selectedIds.length;
    return {
      rowsById,
      stats
    };
  }

  if (action !== 'add' && action !== 'remove') {
    throw new Error(`Unsupported bulk tag action: ${action}`);
  }

  const canonicalTarget = model.tagCanonicalByKey.get(targetKey) || normalizedTarget;
  const targetGroupIndex = model.tagToGroupIndex.get(targetKey);
  let nextRowsById = rowsById;

  for (const rowId of selectedIds) {
    const row = rowsById[rowId];
    if (!row) {
      stats.skippedMissingRow += 1;
      continue;
    }

    stats.processed += 1;
    const effective = computeEffectiveRow(row.source, row.overrides);
    const currentTags = normalizeTags(effective.tags);
    const currentValidation = validateRowTagsAgainstGroups(currentTags, model);

    if (action === 'add' && !currentValidation.isValid) {
      stats.skippedInvalid += 1;
      continue;
    }

    if (action === 'add') {
      const hasTarget = currentTags.some((tag) => tag.toLowerCase() === targetKey);
      if (hasTarget) {
        stats.unchanged += 1;
        continue;
      }

      const sameGroupTags = currentTags.filter(
        (tag) => model.tagToGroupIndex.get(tag.toLowerCase()) === targetGroupIndex
      );
      if (sameGroupTags.length > 0) {
        stats.skippedConflict += 1;
        continue;
      }

      const updatedRecord = applyTagsOverride(row, [...currentTags, canonicalTarget]);
      if (nextRowsById === rowsById) {
        nextRowsById = { ...rowsById };
      }
      nextRowsById[rowId] = updatedRecord;
      stats.updated += 1;
      continue;
    }

    const nextTags = currentTags.filter((tag) => tag.toLowerCase() !== targetKey);
    if (nextTags.length === currentTags.length) {
      stats.unchanged += 1;
      continue;
    }

    const updatedRecord = applyTagsOverride(row, nextTags);
    if (nextRowsById === rowsById) {
      nextRowsById = { ...rowsById };
    }
    nextRowsById[rowId] = updatedRecord;
    stats.updated += 1;
  }

  return {
    rowsById: nextRowsById,
    stats
  };
}
