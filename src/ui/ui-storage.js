export const STORAGE_WRITE_LEVELS = [0, 1, 2, 3];

export function saveState({ app, setStatus, storageKey, statusMessage = '' }) {
  app.state.updatedAt = new Date().toISOString();
  const result = persistStateWithFallback(app.state, storageKey);

  if (statusMessage) {
    if (result.level > 0) {
      setStatus(`${statusMessage} Saved with compact mode (storage pressure).`);
    } else {
      setStatus(statusMessage);
    }
    return;
  }

  if (!result.ok) {
    setStatus('Warning: local storage quota exceeded. Changes may not persist.');
  }
}

export function persistStateWithFallback(state, storageKey) {
  for (const level of STORAGE_WRITE_LEVELS) {
    const payload = buildStoragePayload(state, level);
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
      return { ok: true, level };
    } catch (error) {
      if (!isQuotaError(error)) {
        console.error(error);
        return { ok: false, level, error };
      }
    }
  }

  return { ok: false, level: STORAGE_WRITE_LEVELS[STORAGE_WRITE_LEVELS.length - 1] };
}

export function buildStoragePayload(state, level) {
  const clone = cloneState(state);

  if (level >= 1) {
    Object.values(clone.rowsById).forEach((record) => {
      if (record.source && record.source.raw) {
        delete record.source.raw;
      }
    });
  }

  if (level >= 2) {
    clone.importHistory = (clone.importHistory || []).map((entry) => {
      const { sampleRows, ...rest } = entry;
      return rest;
    });
  }

  if (level >= 3) {
    clone.importHistory = [];
    Object.values(clone.rowsById).forEach((record) => {
      if (record.meta && Array.isArray(record.meta.fingerprints) && record.meta.fingerprints.length > 5) {
        record.meta.fingerprints = record.meta.fingerprints.slice(0, 5);
      }
    });
  }

  return clone;
}

export function cloneState(state) {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state));
}

export function loadState({ storageKey, createEmptyState, sanitizeLoadedState }) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return createEmptyState();
    }

    const parsed = JSON.parse(raw);
    return sanitizeLoadedState(parsed);
  } catch (error) {
    console.error(error);
    return createEmptyState();
  }
}

export function isQuotaError(error) {
  if (!error) {
    return false;
  }

  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}
