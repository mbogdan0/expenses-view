import { normalizeCurrency, parseLocalDateTime, parseNumber } from '../primitives.js';

function buildRateCandidates(rows) {
  return rows
    .map((row) => {
      const currency = normalizeCurrency(row.currency);
      const rate = parseNumber(row.rate);
      const timestamp = parseLocalDateTime(row.date)?.getTime() ?? null;
      if (!currency || currency === 'UAH' || rate === null || rate <= 0 || timestamp === null) {
        return null;
      }
      return {
        id: row.id,
        currency,
        rate,
        timestamp
      };
    })
    .filter(Boolean);
}

export function resolveRate(row, allRows) {
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

  if (currency === 'UAH') {
    return {
      status: 'resolved',
      unresolved: false,
      usedRate: 1,
      rateSource: 'native',
      uahAmount: amount
    };
  }

  const explicitRate = parseNumber(row.rate);
  if (explicitRate !== null && explicitRate > 0) {
    return {
      status: 'resolved',
      unresolved: false,
      usedRate: explicitRate,
      rateSource: 'explicit',
      uahAmount: amount * explicitRate
    };
  }

  const targetTimestamp = parseLocalDateTime(row.date)?.getTime() ?? null;
  const candidates = buildRateCandidates(allRows).filter((candidate) => candidate.currency === currency);

  if (candidates.length) {
    const nearest = candidates
      .map((candidate) => ({
        ...candidate,
        distance:
          targetTimestamp === null
            ? Number.MAX_SAFE_INTEGER
            : Math.abs(candidate.timestamp - targetTimestamp)
      }))
      .sort((left, right) => {
        if (left.distance !== right.distance) {
          return left.distance - right.distance;
        }
        return right.timestamp - left.timestamp;
      })[0];

    return {
      status: 'resolved',
      unresolved: false,
      usedRate: nearest.rate,
      rateSource: `nearest:${nearest.id}`,
      uahAmount: amount * nearest.rate
    };
  }

  return {
    status: 'missing_rate',
    unresolved: true,
    warning: `Missing conversion rate for ${currency}`
  };
}
