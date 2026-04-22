import { computeEffectiveRow } from './rows-and-rates.js';
import { isPlainObject, normalizeTags, sanitizeText } from './primitives.js';

function isTagGroupsModel(value) {
  return isPlainObject(value) && Array.isArray(value.groups) && value.tagToGroupIndex instanceof Map;
}

export function parseTagGroupsText(value) {
  const rawText = String(value ?? '');
  const lines = rawText.split(/\r?\n/);
  const groups = [];
  const issues = [];
  const tagToGroupIndex = new Map();
  const tagCanonicalByKey = new Map();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmedLine = sanitizeText(line);
    if (!trimmedLine) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf(':');
    if (separatorIndex < 0) {
      issues.push({
        type: 'invalid_group_format',
        lineIndex,
        lineNumber: lineIndex + 1,
        message: `Line ${lineIndex + 1} is invalid. Expected "Group name: tag1, tag2".`
      });
      continue;
    }

    const groupName = sanitizeText(trimmedLine.slice(0, separatorIndex));
    if (!groupName) {
      issues.push({
        type: 'missing_group_name',
        lineIndex,
        lineNumber: lineIndex + 1,
        message: `Line ${lineIndex + 1} is invalid. Group name is required before ":".`
      });
      continue;
    }

    const tagsPart = trimmedLine.slice(separatorIndex + 1);
    const tags = normalizeTags(tagsPart);
    if (!tags.length) {
      issues.push({
        type: 'missing_group_tags',
        lineIndex,
        lineNumber: lineIndex + 1,
        message: `Line ${lineIndex + 1} is invalid. Add at least one tag after ":".`
      });
      continue;
    }

    const groupIndex = groups.length;
    groups.push({
      index: groupIndex,
      lineIndex,
      lineNumber: lineIndex + 1,
      name: groupName,
      tags
    });

    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (tagToGroupIndex.has(key)) {
        const firstGroupIndex = tagToGroupIndex.get(key);
        issues.push({
          type: 'duplicate_tag_across_groups',
          tag,
          firstGroupIndex,
          firstGroupLine: groups[firstGroupIndex]?.lineNumber || firstGroupIndex + 1,
          duplicateGroupIndex: groupIndex,
          duplicateGroupLine: lineIndex + 1,
          message: `Tag "${tag}" is duplicated across groups (lines ${groups[firstGroupIndex]?.lineNumber || firstGroupIndex + 1} and ${lineIndex + 1}).`
        });
        continue;
      }

      tagToGroupIndex.set(key, groupIndex);
      tagCanonicalByKey.set(key, tag);
    }
  }

  return {
    rawText,
    groups,
    issues,
    isValid: issues.length === 0,
    hasGroups: groups.length > 0,
    tagToGroupIndex,
    tagCanonicalByKey,
    allTags: Array.from(tagCanonicalByKey.values())
  };
}

export function ensureTagGroupsModel(tagGroupsInput) {
  if (isTagGroupsModel(tagGroupsInput)) {
    return tagGroupsInput;
  }
  return parseTagGroupsText(tagGroupsInput);
}

export function normalizeTagGroupIndex(value, groupsCount) {
  if (!Number.isFinite(groupsCount) || groupsCount <= 0) {
    return 0;
  }

  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= groupsCount) {
    return 0;
  }
  return parsed;
}

function findTagGroupMatches(tags, tagGroupsInput, specificGroupIndex = null) {
  const model = ensureTagGroupsModel(tagGroupsInput);
  const normalizedTags = normalizeTags(tags);
  const unknownTags = [];
  const matchesByGroup = new Map();

  for (const tag of normalizedTags) {
    const key = tag.toLowerCase();
    const groupIndex = model.tagToGroupIndex.get(key);

    if (groupIndex === undefined) {
      unknownTags.push(tag);
      continue;
    }

    if (specificGroupIndex !== null && groupIndex !== specificGroupIndex) {
      continue;
    }

    const canonicalTag = model.tagCanonicalByKey.get(key) || tag;
    const groupTags = matchesByGroup.get(groupIndex) || [];
    if (!groupTags.some((existing) => existing.toLowerCase() === canonicalTag.toLowerCase())) {
      groupTags.push(canonicalTag);
    }
    matchesByGroup.set(groupIndex, groupTags);
  }

  return {
    model,
    normalizedTags,
    unknownTags,
    matchesByGroup
  };
}

export function validateRowTagsAgainstGroups(tags, tagGroupsInput) {
  const { model, normalizedTags, unknownTags, matchesByGroup } = findTagGroupMatches(tags, tagGroupsInput);
  const duplicateGroups = [];
  const errors = [];

  for (const [groupIndex, matchedTags] of matchesByGroup.entries()) {
    if (matchedTags.length <= 1) {
      continue;
    }

    duplicateGroups.push({
      groupIndex,
      tags: matchedTags
    });
  }

  if (unknownTags.length) {
    errors.push(`Unknown tags: ${unknownTags.join(', ')}`);
  }

  for (const duplicateGroup of duplicateGroups) {
    errors.push(
      `Multiple tags in one group (group ${duplicateGroup.groupIndex + 1}): ${duplicateGroup.tags.join(', ')}`
    );
  }

  return {
    isValid: errors.length === 0,
    inputTags: normalizedTags,
    unknownTags,
    duplicateGroups,
    errors,
    taxonomyValid: model.isValid,
    taxonomyIssues: model.issues
  };
}

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
