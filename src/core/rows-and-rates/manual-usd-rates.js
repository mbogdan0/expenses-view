import { normalizeCurrency, parseNumber } from '../primitives.js';

function parseStrictDateOnly(dateText) {
  const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return {
    dateText: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    dayEpoch: parsed.getTime()
  };
}

function parseStrictPair(pairText) {
  const match = String(pairText || '').match(/^([A-Za-z]{3})\/USD$/);
  if (!match) {
    return null;
  }

  const base = normalizeCurrency(match[1]);
  return `${base}/USD`;
}

function toRatesModel(entries, issues) {
  const byPair = new Map();
  for (const entry of entries) {
    const list = byPair.get(entry.pair) || [];
    list.push(entry);
    byPair.set(entry.pair, list);
  }

  for (const list of byPair.values()) {
    list.sort((left, right) => left.dayEpoch - right.dayEpoch);
  }

  return {
    entries,
    byPair,
    issues,
    isValid: issues.length === 0
  };
}

export function parseManualUsdRatesText(manualUsdRatesText) {
  const lines = String(manualUsdRatesText || '').split(/\r?\n/);
  const issues = [];
  const dedupedEntries = [];
  const indexByPairAndDate = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      continue;
    }

    const match = trimmedLine.match(/^"([^"]*)";"([^"]*)";"([^"]*)"$/);
    if (!match) {
      issues.push({
        line: lineNumber,
        type: 'invalid_format',
        message: `Line ${lineNumber}: use strict format \"YYYY-MM-DD\";\"CUR/USD\";\"rate\".`
      });
      continue;
    }

    const [, dateText, pairText, rateText] = match;
    const parsedDate = parseStrictDateOnly(dateText);
    if (!parsedDate) {
      issues.push({
        line: lineNumber,
        type: 'invalid_date',
        message: `Line ${lineNumber}: invalid date \"${dateText}\".`
      });
      continue;
    }

    const pair = parseStrictPair(pairText);
    if (!pair) {
      issues.push({
        line: lineNumber,
        type: 'invalid_pair',
        message: `Line ${lineNumber}: pair must match \"CUR/USD\".`
      });
      continue;
    }

    const rate = parseNumber(rateText);
    if (rate === null || rate <= 0) {
      issues.push({
        line: lineNumber,
        type: 'invalid_rate',
        message: `Line ${lineNumber}: rate must be a positive number.`
      });
      continue;
    }

    const entry = {
      line: lineNumber,
      date: parsedDate.dateText,
      pair,
      rate,
      dayEpoch: parsedDate.dayEpoch
    };

    const dedupKey = `${pair}|${parsedDate.dateText}`;
    if (indexByPairAndDate.has(dedupKey)) {
      const existingIndex = indexByPairAndDate.get(dedupKey);
      dedupedEntries[existingIndex] = entry;
      continue;
    }

    indexByPairAndDate.set(dedupKey, dedupedEntries.length);
    dedupedEntries.push(entry);
  }

  return toRatesModel(dedupedEntries, issues);
}
