import { isPlainObject, normalizeTags, sanitizeText } from '../primitives.js';

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
