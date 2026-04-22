import { parseLocalDateTime } from '../primitives.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeToDayEpoch(value) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) {
    return null;
  }

  const dayStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
  return dayStart.getTime();
}

export function formatDayEpoch(dayEpoch) {
  const date = new Date(dayEpoch);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDayEpoch() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
}
