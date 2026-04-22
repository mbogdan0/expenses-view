import { normalizeTags } from '../primitives.js';
import { ensureTagGroupsModel } from './model.js';

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
