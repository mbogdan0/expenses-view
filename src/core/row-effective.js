import { applyCategoryMergeToEffectiveRow } from './category-merge.js';
import { normalizeCurrency, normalizeTags } from './primitives.js';

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function pickEditableField(source, overrides, fieldName) {
  if (overrides && hasOwn(overrides, fieldName)) {
    return overrides[fieldName];
  }
  return source[fieldName];
}

export function computeEffectiveRow(source, overrides = {}, categoryMergeRuntime = null) {
  const baseFullCategory = pickEditableField(source, overrides, 'fullCategory') || source.sourceFullCategory;
  const tags = normalizeTags(pickEditableField(source, overrides, 'tags'));

  const baseRow = {
    id: source.id,
    originalCategory: source.category || '',
    originalSourceFullCategory: source.sourceFullCategory || '',
    date: pickEditableField(source, overrides, 'date') || '',
    fullCategory: baseFullCategory,
    baseFullCategory,
    price: pickEditableField(source, overrides, 'price') || '',
    currency: normalizeCurrency(pickEditableField(source, overrides, 'currency') || ''),
    rate: pickEditableField(source, overrides, 'rate') || '',
    rateType: pickEditableField(source, overrides, 'rateType') || '',
    notes: pickEditableField(source, overrides, 'notes') || '',
    image: pickEditableField(source, overrides, 'image') || '',
    tags,
    categoryMergeStatus: 'none',
    categoryMergeMaster: null
  };

  if (!categoryMergeRuntime) {
    return baseRow;
  }

  return applyCategoryMergeToEffectiveRow(baseRow, categoryMergeRuntime);
}
