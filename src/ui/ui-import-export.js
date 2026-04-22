export function createImportExportUi({
  app,
  elements,
  storageKey,
  screenData,
  createEmptyState,
  parseExpenseCsv,
  buildFileFingerprint,
  normalizeImportedRow,
  mergeImportedRow,
  recomputeDerivedRows,
  parseStateSnapshotJson,
  persistStateWithFallback,
  setStatus,
  saveState,
  render,
  hydrateFilterInputs,
  hydrateManualUsdRatesInputs,
  hydrateDisplayCurrencyButtons,
  applyScreen
}) {
  async function importFromPicker() {
    const files = Array.from(elements.fileInput.files || []);
    if (!files.length) {
      setStatus('Select at least one CSV file.');
      return;
    }

    elements.importButton.disabled = true;
    elements.importButton.textContent = 'Importing...';

    let added = 0;
    let updated = 0;
    let totalRows = 0;

    try {
      for (const file of files) {
        const csvText = await file.text();
        const parsedRows = parseExpenseCsv(csvText);
        const fingerprint = buildFileFingerprint({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          content: csvText
        });

        totalRows += parsedRows.length;

        for (const rawRow of parsedRows) {
          const normalized = normalizeImportedRow(rawRow, file.name);
          const existing = app.state.rowsById[normalized.id];

          if (existing) {
            updated += 1;
          } else {
            added += 1;
          }

          app.state.rowsById[normalized.id] = mergeImportedRow(existing, normalized, fingerprint);
        }

        registerImportHistory(file, fingerprint, parsedRows);
      }

      app.state.rowsById = recomputeDerivedRows(
        app.state.rowsById,
        app.state.tagGroupsText,
        app.state.categoryMergeRulesText,
        app.state.manualUsdRatesText
      );
      saveState(
        `Imported ${files.length} file(s): ${totalRows} rows parsed, ${added} added, ${updated} deduplicated.`
      );
      elements.fileInput.value = '';
      render();
    } catch (error) {
      setStatus(`Import failed: ${error.message}`);
      console.error(error);
    } finally {
      elements.importButton.disabled = false;
      elements.importButton.textContent = 'Import files';
    }
  }

  function registerImportHistory(file, fingerprint, parsedRows) {
    const now = new Date().toISOString();
    const existingIndex = app.state.importHistory.findIndex((entry) => entry.fingerprint === fingerprint);

    const entry = {
      fingerprint,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      rowCount: parsedRows.length,
      importedAt: now,
      timesImported: 1,
      sampleRows: parsedRows.slice(0, 2)
    };

    if (existingIndex >= 0) {
      const existing = app.state.importHistory[existingIndex];
      app.state.importHistory[existingIndex] = {
        ...existing,
        rowCount: parsedRows.length,
        importedAt: now,
        timesImported: Number(existing.timesImported || 0) + 1
      };
      return;
    }

    app.state.importHistory.unshift(entry);
    if (app.state.importHistory.length > 500) {
      app.state.importHistory = app.state.importHistory.slice(0, 500);
    }
  }

  function exportDbSnapshot() {
    app.state.updatedAt = new Date().toISOString();
    const persisted = persistStateWithFallback(app.state, storageKey);
    if (!persisted.ok) {
      setStatus('DB export failed: unable to persist current state to local storage.');
      return;
    }

    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setStatus('DB export failed: no local state found.');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const formatted = JSON.stringify(parsed, null, 2);
      const fileName = `expense-db-${formatSnapshotTimestamp(new Date())}.json`;
      triggerJsonDownload(fileName, formatted);
      setStatus('DB JSON exported.');
    } catch (error) {
      console.error(error);
      setStatus('DB export failed: local state is not valid JSON.');
    }
  }

  async function importDbSnapshotFromPicker() {
    const [file] = Array.from(elements.dbImportInput.files || []);
    if (!file) {
      setStatus('Select a DB JSON file.');
      return;
    }

    elements.importDbButton.disabled = true;
    elements.importDbButton.textContent = 'Importing DB...';

    try {
      const snapshotText = await file.text();
      const parsed = parseStateSnapshotJson(snapshotText);
      if (!parsed.ok) {
        setStatus(`DB import failed: ${parsed.error}`);
        return;
      }

      const ok = window.confirm('Import DB JSON and overwrite all current local data?');
      if (!ok) {
        setStatus('DB import canceled.');
        return;
      }

      app.state = parsed.state;
      saveState('DB JSON imported.');
      hydrateFilterInputs();
      hydrateManualUsdRatesInputs?.();
      hydrateDisplayCurrencyButtons?.();
      applyScreen(app.state.uiPrefs.activeScreen || screenData);
      render();
      elements.dbImportInput.value = '';
    } catch (error) {
      setStatus(`DB import failed: ${error.message}`);
      console.error(error);
    } finally {
      elements.importDbButton.disabled = false;
      elements.importDbButton.textContent = 'Import DB JSON';
    }
  }

  function formatSnapshotTimestamp(date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}-${hour}${minute}${second}`;
  }

  function triggerJsonDownload(fileName, content) {
    const blob = new Blob([content], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 0);
  }

  function resetLocalData() {
    app.state = createEmptyState();
    saveState('Local data cleared.');
    hydrateFilterInputs();
    hydrateManualUsdRatesInputs?.();
    hydrateDisplayCurrencyButtons?.();
    applyScreen(app.state.uiPrefs.activeScreen || screenData);
    render();
  }

  return {
    importFromPicker,
    exportDbSnapshot,
    importDbSnapshotFromPicker,
    resetLocalData
  };
}
