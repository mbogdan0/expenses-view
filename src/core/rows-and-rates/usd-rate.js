import { normalizeCurrency, parseLocalDateTime, parseNumber } from '../primitives.js';
import { getTodayDayEpoch, normalizeToDayEpoch } from './date-helpers.js';
import { parseManualUsdRatesText } from './manual-usd-rates.js';

function pickNearestRateByDay(targetTimestamp, candidates) {
  if (!candidates.length) {
    return null;
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      distance: Math.abs(candidate.dayEpoch - targetTimestamp)
    }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return right.dayEpoch - left.dayEpoch;
    })[0];
}

function pickLatestKnownRate(candidates) {
  if (!candidates.length) {
    return null;
  }

  return [...candidates].sort((left, right) => right.dayEpoch - left.dayEpoch)[0];
}

export function resolveUsdRate(row, manualRatesModelOrText) {
  const amount = parseNumber(row.price);
  if (amount === null) {
    return {
      status: 'invalid_amount',
      unresolved: true,
      warning: 'Invalid amount value'
    };
  }

  const currency = normalizeCurrency(row.currency);
  if (!currency) {
    return {
      status: 'invalid_currency',
      unresolved: true,
      warning: 'Currency is empty'
    };
  }

  if (currency === 'USD') {
    return {
      status: 'resolved',
      unresolved: false,
      usedRate: 1,
      rateSource: 'native',
      usdAmount: amount
    };
  }

  const parsedRates =
    typeof manualRatesModelOrText === 'string'
      ? parseManualUsdRatesText(manualRatesModelOrText)
      : manualRatesModelOrText || parseManualUsdRatesText('');

  const targetTimestamp = parseLocalDateTime(row.date)?.getTime() ?? null;
  if (targetTimestamp === null) {
    return {
      status: 'invalid_date',
      unresolved: true,
      warning: 'Date is empty or invalid'
    };
  }

  const pair = `${currency}/USD`;
  const candidates = parsedRates.byPair.get(pair) || [];
  if (!candidates.length) {
    return {
      status: 'missing_manual_rate',
      unresolved: true,
      warning: `Missing manual USD rate for ${pair}`
    };
  }

  const targetDayEpoch = normalizeToDayEpoch(row.date);
  const todayDayEpoch = getTodayDayEpoch();
  const isFutureRow = targetDayEpoch !== null && targetDayEpoch > todayDayEpoch;

  const selectedRate = isFutureRow
    ? pickLatestKnownRate(candidates.filter((candidate) => candidate.dayEpoch <= todayDayEpoch))
    : pickNearestRateByDay(targetTimestamp, candidates);

  if (!selectedRate) {
    return {
      status: 'missing_manual_rate',
      unresolved: true,
      warning: `Missing manual USD rate for ${pair}`
    };
  }

  return {
    status: 'resolved',
    unresolved: false,
    usedRate: selectedRate.rate,
    rateSource: `manual:${pair}:${selectedRate.date}`,
    usdAmount: amount / selectedRate.rate
  };
}
