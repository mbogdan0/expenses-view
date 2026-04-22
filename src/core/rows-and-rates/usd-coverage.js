import { USD_RATE_COVERAGE_DAYS } from '../constants.js';
import { normalizeCurrency } from '../primitives.js';
import { computeEffectiveRow } from '../row-effective.js';
import { DAY_MS, formatDayEpoch, getTodayDayEpoch, normalizeToDayEpoch } from './date-helpers.js';
import { parseManualUsdRatesText } from './manual-usd-rates.js';

function collectUsdPairDateRanges(rows) {
  const byPair = new Map();

  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    if (!currency || currency === 'USD') {
      continue;
    }

    const pair = `${currency}/USD`;
    const dayEpoch = normalizeToDayEpoch(row.date);
    const existing = byPair.get(pair) || {
      pair,
      firstExpenseDay: null,
      lastExpenseDay: null,
      expenseRowsCount: 0,
      validDateRowsCount: 0
    };

    existing.expenseRowsCount += 1;

    if (dayEpoch !== null) {
      existing.validDateRowsCount += 1;
      existing.firstExpenseDay =
        existing.firstExpenseDay === null ? dayEpoch : Math.min(existing.firstExpenseDay, dayEpoch);
      existing.lastExpenseDay =
        existing.lastExpenseDay === null ? dayEpoch : Math.max(existing.lastExpenseDay, dayEpoch);
    }

    byPair.set(pair, existing);
  }

  return Array.from(byPair.values()).sort((left, right) => left.pair.localeCompare(right.pair));
}

function buildCoverageWindows(firstExpenseDay, lastExpenseDay, coverageDays) {
  if (firstExpenseDay === null || lastExpenseDay === null) {
    return [];
  }

  const windows = [];
  const intervalMs = Math.max(1, Number(coverageDays) || 1) * DAY_MS;

  for (let windowStart = firstExpenseDay; windowStart <= lastExpenseDay; windowStart += intervalMs) {
    windows.push({
      windowStart,
      windowEndExclusive: windowStart + intervalMs
    });
  }

  return windows;
}

function isWindowCovered(window, knownRates) {
  for (const rateEntry of knownRates) {
    if (rateEntry.dayEpoch >= window.windowStart && rateEntry.dayEpoch < window.windowEndExclusive) {
      return true;
    }
  }

  return false;
}

export function buildUsdCoverageReport(
  rows,
  manualRatesModelOrText,
  coverageDays = USD_RATE_COVERAGE_DAYS
) {
  const parsedRates =
    typeof manualRatesModelOrText === 'string'
      ? parseManualUsdRatesText(manualRatesModelOrText)
      : manualRatesModelOrText || parseManualUsdRatesText('');

  const pairRanges = collectUsdPairDateRanges(rows || []);
  const missingRequests = [];
  const todayDayEpoch = getTodayDayEpoch();

  const pairStats = pairRanges.map((pairRange) => {
    const knownRates = parsedRates.byPair.get(pairRange.pair) || [];
    const cappedLastExpenseDay =
      pairRange.lastExpenseDay === null ? null : Math.min(pairRange.lastExpenseDay, todayDayEpoch);
    const windows = buildCoverageWindows(
      pairRange.firstExpenseDay,
      cappedLastExpenseDay,
      coverageDays
    );

    const missingWindows = [];
    let coveredWindows = 0;

    for (const window of windows) {
      if (isWindowCovered(window, knownRates)) {
        coveredWindows += 1;
        continue;
      }

      const missingDate = formatDayEpoch(window.windowStart);
      missingWindows.push(missingDate);
      missingRequests.push({
        date: missingDate,
        pair: pairRange.pair,
        line: `"${missingDate}";"${pairRange.pair}"`
      });
    }

    return {
      pair: pairRange.pair,
      expenseRowsCount: pairRange.expenseRowsCount,
      validDateRowsCount: pairRange.validDateRowsCount,
      knownRatesCount: knownRates.length,
      firstExpenseDate:
        pairRange.firstExpenseDay === null ? null : formatDayEpoch(pairRange.firstExpenseDay),
      lastExpenseDate:
        pairRange.lastExpenseDay === null ? null : formatDayEpoch(pairRange.lastExpenseDay),
      coverageEndDate:
        cappedLastExpenseDay === null ? null : formatDayEpoch(cappedLastExpenseDay),
      windowsCount: windows.length,
      coveredWindows,
      missingWindowsCount: missingWindows.length,
      missingWindows
    };
  });

  return {
    coverageDays: Math.max(1, Number(coverageDays) || 1),
    parsedRates,
    requiredPairs: pairStats.map((item) => item.pair),
    pairStats,
    missingRequests,
    missingRequestsText: missingRequests.map((item) => item.line).join('\n'),
    isComplete: missingRequests.length === 0
  };
}

export function buildUsdCoverageReportForRowsById(
  rowsById,
  manualUsdRatesText,
  coverageDays = USD_RATE_COVERAGE_DAYS
) {
  const records = Object.values(rowsById || {});
  const effectiveRows = records.map((record) => computeEffectiveRow(record.source, record.overrides));
  return buildUsdCoverageReport(effectiveRows, manualUsdRatesText, coverageDays);
}
