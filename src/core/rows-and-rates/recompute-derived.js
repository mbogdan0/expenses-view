import {
  applyCategoryMergeToEffectiveRow,
  buildCategoryMergeRuntime
} from '../category-merge.js';
import { parseLocalDateTime } from '../primitives.js';
import { computeEffectiveRow } from '../row-effective.js';
import { ensureTagGroupsModel, validateRowTagsAgainstGroups } from '../tag-groups.js';
import { parseManualUsdRatesText } from './manual-usd-rates.js';
import { resolveRate } from './uah-rate.js';
import { resolveUsdRate } from './usd-rate.js';

export function recomputeDerivedRows(
  rowsById,
  tagGroupsInput = '',
  categoryMergeInput = '',
  manualUsdRatesInput = ''
) {
  const records = Object.values(rowsById || {});
  const baseEffectiveRows = records.map((record) => computeEffectiveRow(record.source, record.overrides));
  const tagGroupsModel = ensureTagGroupsModel(tagGroupsInput);
  const availableBaseCategories = new Set(
    baseEffectiveRows
      .map((row) => row.baseFullCategory || row.fullCategory)
      .filter(Boolean)
  );
  const categoryMergeRuntime = buildCategoryMergeRuntime(categoryMergeInput, availableBaseCategories);
  const effectiveRows = baseEffectiveRows.map((row) =>
    applyCategoryMergeToEffectiveRow(row, categoryMergeRuntime)
  );
  const manualUsdRatesModel = parseManualUsdRatesText(manualUsdRatesInput);

  const effectiveById = new Map(effectiveRows.map((row) => [row.id, row]));
  const nextRowsById = {};

  for (const record of records) {
    const effective = effectiveById.get(record.id);
    const conversion = resolveRate(effective, effectiveRows);
    const usdConversion = resolveUsdRate(effective, manualUsdRatesModel);
    const effectiveDate = parseLocalDateTime(effective.date);
    const tagValidation = validateRowTagsAgainstGroups(effective.tags, tagGroupsModel);

    nextRowsById[record.id] = {
      ...record,
      derived: {
        conversionStatus: conversion.status,
        unresolved: Boolean(conversion.unresolved),
        warning: conversion.warning || null,
        usedRate: conversion.usedRate ?? null,
        rateSource: conversion.rateSource ?? null,
        uahAmount: conversion.uahAmount ?? null,
        usdConversionStatus: usdConversion.status,
        usdUnresolved: Boolean(usdConversion.unresolved),
        usdWarning: usdConversion.warning || null,
        usdUsedRate: usdConversion.usedRate ?? null,
        usdRateSource: usdConversion.rateSource ?? null,
        usdAmount: usdConversion.usdAmount ?? null,
        effectiveDateEpoch: effectiveDate ? effectiveDate.getTime() : null,
        baseFullCategory: effective.baseFullCategory || effective.fullCategory || '',
        finalFullCategory: effective.fullCategory || '',
        categoryMergeStatus: effective.categoryMergeStatus || 'none',
        categoryMergeMaster: effective.categoryMergeMaster || null,
        tagValidation: {
          isValid: tagValidation.isValid,
          unknownTags: tagValidation.unknownTags,
          duplicateGroups: tagValidation.duplicateGroups,
          errors: tagValidation.errors,
          taxonomyValid: tagValidation.taxonomyValid
        }
      }
    };
  }

  return nextRowsById;
}
