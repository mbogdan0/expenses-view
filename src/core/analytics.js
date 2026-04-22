import {
  DISPLAY_CURRENCY_UAH,
  DISPLAY_CURRENCY_USD,
  TAG_GROUP_INVALID_LABEL,
  TAG_GROUP_NO_TAG_LABEL
} from './constants.js';
import { sanitizeText, parseLocalDateTime } from './primitives.js';
import { computeEffectiveRow } from './rows-and-rates.js';
import { ensureTagGroupsModel, normalizeTagGroupIndex } from './tag-groups.js';

export function sortRowsByDateDesc(rowRecords) {
  return [...rowRecords].sort((left, right) => {
    const leftDate = left.derived?.effectiveDateEpoch ?? -Infinity;
    const rightDate = right.derived?.effectiveDateEpoch ?? -Infinity;
    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }
    return left.source.id.localeCompare(right.source.id);
  });
}

export function normalizeDisplayCurrency(displayCurrency) {
  return displayCurrency === DISPLAY_CURRENCY_USD ? DISPLAY_CURRENCY_USD : DISPLAY_CURRENCY_UAH;
}

export function getRowConversionForDisplayCurrency(row, displayCurrency = DISPLAY_CURRENCY_UAH) {
  const normalizedCurrency = normalizeDisplayCurrency(displayCurrency);

  if (normalizedCurrency === DISPLAY_CURRENCY_USD) {
    return {
      displayCurrency: normalizedCurrency,
      status: row.derived?.usdConversionStatus || 'missing_manual_rate',
      unresolved: Boolean(row.derived?.usdUnresolved),
      warning: row.derived?.usdWarning || null,
      usedRate: row.derived?.usdUsedRate ?? null,
      rateSource: row.derived?.usdRateSource ?? null,
      amount: row.derived?.usdAmount ?? null
    };
  }

  return {
    displayCurrency: DISPLAY_CURRENCY_UAH,
    status: row.derived?.conversionStatus || 'missing_rate',
    unresolved: Boolean(row.derived?.unresolved),
    warning: row.derived?.warning || null,
    usedRate: row.derived?.usedRate ?? null,
    rateSource: row.derived?.rateSource ?? null,
    amount: row.derived?.uahAmount ?? null
  };
}

export function summarizeRowsByDisplayCurrency(rows, displayCurrency = DISPLAY_CURRENCY_UAH) {
  let net = 0;
  let outflow = 0;
  let inflow = 0;
  let unresolved = 0;

  for (const row of rows) {
    const conversion = getRowConversionForDisplayCurrency(row, displayCurrency);
    if (conversion.unresolved || conversion.amount === null || conversion.amount === undefined) {
      unresolved += 1;
      continue;
    }

    net += conversion.amount;
    if (conversion.amount < 0) {
      outflow += Math.abs(conversion.amount);
    } else {
      inflow += conversion.amount;
    }
  }

  return { net, outflow, inflow, unresolved };
}

export function summarizeUah(rows) {
  return summarizeRowsByDisplayCurrency(rows, DISPLAY_CURRENCY_UAH);
}

export function buildCategoryPieDatasetAbsoluteNet(rows, displayCurrency = DISPLAY_CURRENCY_UAH) {
  const totals = new Map();

  for (const row of rows) {
    const conversion = getRowConversionForDisplayCurrency(row, displayCurrency);
    if (conversion.unresolved || conversion.amount === null || conversion.amount === undefined) {
      continue;
    }

    const effective = computeEffectiveRow(row.source, row.overrides);
    const category =
      row.derived?.finalFullCategory || effective.fullCategory || 'Uncategorized';
    totals.set(category, (totals.get(category) || 0) + conversion.amount);
  }

  return Array.from(totals.entries())
    .map(([label, signedNet]) => ({
      label,
      signedNet,
      absoluteNet: Math.abs(signedNet)
    }))
    .filter((item) => item.absoluteNet > 0)
    .sort((left, right) => right.absoluteNet - left.absoluteNet);
}

export function buildCategoryPieDatasetUAHAbsoluteNet(rows) {
  return buildCategoryPieDatasetAbsoluteNet(rows, DISPLAY_CURRENCY_UAH);
}

export function buildTagPieDatasetAbsoluteNet(rows, displayCurrency = DISPLAY_CURRENCY_UAH) {
  const totals = new Map();

  for (const row of rows) {
    const conversion = getRowConversionForDisplayCurrency(row, displayCurrency);
    if (conversion.unresolved || conversion.amount === null || conversion.amount === undefined) {
      continue;
    }

    const effective = computeEffectiveRow(row.source, row.overrides);
    const tags = effective.tags.length ? effective.tags : ['No tag'];

    for (const tag of tags) {
      totals.set(tag, (totals.get(tag) || 0) + conversion.amount);
    }
  }

  return Array.from(totals.entries())
    .map(([label, signedNet]) => ({
      label,
      signedNet,
      absoluteNet: Math.abs(signedNet)
    }))
    .filter((item) => item.absoluteNet > 0)
    .sort((left, right) => right.absoluteNet - left.absoluteNet);
}

export function buildTagPieDatasetUAHAbsoluteNet(rows) {
  return buildTagPieDatasetAbsoluteNet(rows, DISPLAY_CURRENCY_UAH);
}

export function buildTagGroupPieDatasetAbsoluteNet(
  rows,
  tagGroupsInput,
  selectedGroupIndex = 0,
  displayCurrency = DISPLAY_CURRENCY_UAH
) {
  const model = ensureTagGroupsModel(tagGroupsInput);
  if (!model.hasGroups || !model.isValid) {
    return [];
  }

  const normalizedGroupIndex = normalizeTagGroupIndex(selectedGroupIndex, model.groups.length);
  const selectedGroup = model.groups[normalizedGroupIndex];
  if (!selectedGroup) {
    return [];
  }

  const allowedKeys = new Set(selectedGroup.tags.map((tag) => tag.toLowerCase()));
  const totals = new Map();

  for (const row of rows) {
    const conversion = getRowConversionForDisplayCurrency(row, displayCurrency);
    if (conversion.unresolved || conversion.amount === null || conversion.amount === undefined) {
      continue;
    }

    const effective = computeEffectiveRow(row.source, row.overrides);
    const groupTags = [];
    const seenGroupTags = new Set();

    for (const tag of effective.tags) {
      const key = tag.toLowerCase();
      if (!allowedKeys.has(key) || seenGroupTags.has(key)) {
        continue;
      }
      seenGroupTags.add(key);
      groupTags.push(model.tagCanonicalByKey.get(key) || tag);
    }

    const label =
      groupTags.length === 0
        ? TAG_GROUP_NO_TAG_LABEL
        : groupTags.length === 1
          ? groupTags[0]
          : TAG_GROUP_INVALID_LABEL;

    totals.set(label, (totals.get(label) || 0) + conversion.amount);
  }

  return Array.from(totals.entries())
    .map(([label, signedNet]) => ({
      label,
      signedNet,
      absoluteNet: Math.abs(signedNet)
    }))
    .filter((item) => item.absoluteNet > 0)
    .sort((left, right) => right.absoluteNet - left.absoluteNet);
}

export function buildTagGroupPieDatasetUAHAbsoluteNet(rows, tagGroupsInput, selectedGroupIndex = 0) {
  return buildTagGroupPieDatasetAbsoluteNet(
    rows,
    tagGroupsInput,
    selectedGroupIndex,
    DISPLAY_CURRENCY_UAH
  );
}

export function formatMoney(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function buildPiePalette(labels, colorful) {
  if (!colorful) {
    return {
      background: ['rgba(130, 142, 150, 0.45)'],
      border: ['rgba(94, 103, 110, 0.9)'],
      hues: []
    };
  }

  const items = labels.map((label, index) => ({ label: String(label || ''), index }));
  items.sort((left, right) =>
    left.label.localeCompare(right.label, undefined, {
      sensitivity: 'base'
    })
  );

  const count = Math.max(1, items.length);
  const hueOffset = 12;
  const hues = new Array(items.length);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    hues[item.index] = (hueOffset + (index * 360) / count) % 360;
  }

  const background = hues.map((hue) => `hsla(${hue}, 62%, 58%, 0.78)`);
  const border = hues.map((hue) => `hsla(${hue}, 66%, 34%, 0.95)`);

  return { background, border, hues };
}

export function countSelectedCalendarDays(dateFrom, dateTo) {
  const from = parseLocalDateTime(dateFrom);
  const to = parseLocalDateTime(dateTo);

  if (!from || !to) {
    return null;
  }

  const startDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  if (endDay.getTime() < startDay.getTime()) {
    return 0;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((endDay.getTime() - startDay.getTime()) / dayMs) + 1;
}

export function normalizeFilterDate(value, boundary = 'start') {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = parsed.getMonth();
  const day = parsed.getDate();
  const normalized =
    boundary === 'end'
      ? new Date(year, month, day, 23, 59, 59, 999)
      : new Date(year, month, day, 0, 0, 0, 0);
  return normalized.getTime();
}

export function matchesFilter(record, filters) {
  const effective = computeEffectiveRow(record.source, record.overrides);
  const displayedCategory = record.derived?.finalFullCategory || effective.fullCategory;
  const baseCategory = record.derived?.baseFullCategory || effective.baseFullCategory || effective.fullCategory;
  const search = sanitizeText(filters.search).toLowerCase();
  const tagFilter = sanitizeText(filters.tag).toLowerCase();
  const fromEpoch = normalizeFilterDate(filters.dateFrom, 'start');
  const toEpoch = normalizeFilterDate(filters.dateTo, 'end');
  const rowEpoch = parseLocalDateTime(effective.date)?.getTime() ?? null;
  const tagsText = effective.tags.join(' ');

  const haystack = [
    displayedCategory,
    baseCategory,
    effective.originalCategory,
    effective.originalSourceFullCategory,
    effective.notes,
    effective.currency,
    effective.rateType,
    tagsText
  ]
    .join(' ')
    .toLowerCase();

  if (search && !haystack.includes(search)) {
    return false;
  }

  if (tagFilter && !effective.tags.some((tag) => tag.toLowerCase().includes(tagFilter))) {
    return false;
  }

  if (filters.tagsLt2Only === true && effective.tags.length >= 2) {
    return false;
  }

  if (fromEpoch !== null && rowEpoch !== null && rowEpoch < fromEpoch) {
    return false;
  }

  if (toEpoch !== null && rowEpoch !== null && rowEpoch > toEpoch) {
    return false;
  }

  if (filters.status === 'resolved' && record.derived?.unresolved) {
    return false;
  }

  if (filters.status === 'unresolved' && !record.derived?.unresolved) {
    return false;
  }

  return true;
}
