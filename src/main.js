import { ArcElement, Chart, Legend, PieController, Tooltip } from 'chart.js';
import {
  STORAGE_KEY,
  buildCategoryPieDatasetUAHAbsoluteNet,
  buildFileFingerprint,
  buildTagPieDatasetUAHAbsoluteNet,
  countSelectedCalendarDays,
  computeEffectiveRow,
  createEmptyState,
  displayDateTime,
  formatDateInputValue,
  formatMoney,
  formatTagsInput,
  matchesFilter,
  mergeImportedRow,
  normalizeCurrency,
  normalizeFilterDate,
  normalizeTags,
  normalizeImportedRow,
  parseExpenseCsv,
  parseStateSnapshotJson,
  recomputeDerivedRows,
  sanitizeLoadedState,
  sortRowsByDateDesc,
  summarizeUah
} from './core.js';

Chart.register(PieController, ArcElement, Tooltip, Legend);

const STORAGE_WRITE_LEVELS = [0, 1, 2, 3];
const SCREEN_DATA = 'data';
const SCREEN_CHARTS = 'charts';
const SCREEN_DATA_OPS = 'data-ops';

const elements = {
  fileInput: document.getElementById('fileInput'),
  importButton: document.getElementById('importButton'),
  exportDbButton: document.getElementById('exportDbButton'),
  dbImportInput: document.getElementById('dbImportInput'),
  importDbButton: document.getElementById('importDbButton'),
  resetButton: document.getElementById('resetButton'),
  screenTabs: Array.from(document.querySelectorAll('.screen-tab')),
  dataScreen: document.getElementById('dataScreen'),
  chartsScreen: document.getElementById('chartsScreen'),
  dataOpsScreen: document.getElementById('dataOpsScreen'),
  rowsBody: document.getElementById('rowsBody'),
  tableMeta: document.getElementById('tableMeta'),
  recordsTable: document.getElementById('recordsTable'),
  toggleExtraColumns: document.getElementById('toggleExtraColumns'),
  filterSearch: document.getElementById('filterSearch'),
  filterTag: document.getElementById('filterTag'),
  filterDateFrom: document.getElementById('filterDateFrom'),
  filterDateTo: document.getElementById('filterDateTo'),
  filterStatus: document.getElementById('filterStatus'),
  clearFilters: document.getElementById('clearFilters'),
  chartFilterDateFrom: document.getElementById('chartFilterDateFrom'),
  chartFilterDateTo: document.getElementById('chartFilterDateTo'),
  clearChartFilters: document.getElementById('clearChartFilters'),
  cardNet: document.getElementById('cardNet'),
  cardNetInflow: document.getElementById('cardNetInflow'),
  cardSelectedDays: document.getElementById('cardSelectedDays'),
  cardUnresolved: document.getElementById('cardUnresolved'),
  categoryChartNet: document.getElementById('categoryChartNet'),
  categoryLegendToggle: document.getElementById('categoryLegendToggle'),
  tagChartNet: document.getElementById('tagChartNet'),
  tagLegendToggle: document.getElementById('tagLegendToggle'),
  categoryChart: document.getElementById('categoryChart'),
  tagChart: document.getElementById('tagChart')
};

const app = {
  state: loadState(),
  categoryChart: null,
  tagChart: null,
  currentRows: []
};

init();

function init() {
  bindEvents();
  hydrateFilterInputs();
  applyScreen(app.state.uiPrefs.activeScreen || SCREEN_DATA);
  render();
}

function bindEvents() {
  elements.importButton.addEventListener('click', () => {
    void importFromPicker();
  });

  elements.resetButton.addEventListener('click', () => {
    const ok = window.confirm('Clear all stored rows and import history from local storage?');
    if (!ok) {
      return;
    }

    app.state = createEmptyState();
    saveState('Local data cleared.');
    hydrateFilterInputs();
    applyScreen(app.state.uiPrefs.activeScreen || SCREEN_DATA);
    render();
  });

  elements.exportDbButton.addEventListener('click', () => {
    exportDbSnapshot();
  });

  elements.importDbButton.addEventListener('click', () => {
    void importDbSnapshotFromPicker();
  });

  elements.screenTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextScreen = normalizeScreenName(tab.dataset.screen || SCREEN_DATA);
      app.state.uiPrefs.activeScreen = nextScreen;
      saveState();
      applyScreen(nextScreen);
      render();
    });
  });

  bindFilterInput(elements.filterSearch, 'search');
  bindFilterInput(elements.filterTag, 'tag');
  bindSharedDateInput(elements.filterDateFrom, 'dateFrom');
  bindSharedDateInput(elements.filterDateTo, 'dateTo');
  bindFilterInput(elements.filterStatus, 'status');
  bindSharedDateInput(elements.chartFilterDateFrom, 'dateFrom');
  bindSharedDateInput(elements.chartFilterDateTo, 'dateTo');

  elements.clearFilters.addEventListener('click', () => {
    app.state.uiPrefs.filters = {
      search: '',
      tag: '',
      dateFrom: '',
      dateTo: '',
      status: 'all'
    };
    hydrateFilterInputs();
    saveState();
    render();
  });

  elements.clearChartFilters.addEventListener('click', () => {
    app.state.uiPrefs.filters.dateFrom = '';
    app.state.uiPrefs.filters.dateTo = '';
    hydrateFilterInputs();
    saveState();
    render();
  });

  elements.toggleExtraColumns?.addEventListener('click', () => {
    app.state.uiPrefs.showExtraColumns = !Boolean(app.state.uiPrefs.showExtraColumns);
    saveState();
    render();
  });

  elements.rowsBody.addEventListener('change', onRowInputChange);
}

function bindFilterInput(element, key) {
  if (!element) {
    return;
  }

  element.addEventListener('input', () => {
    app.state.uiPrefs.filters[key] = element.value;
    saveState();
    render();
  });

  element.addEventListener('change', () => {
    app.state.uiPrefs.filters[key] = element.value;
    saveState();
    render();
  });
}

function bindSharedDateInput(element, key) {
  if (!element) {
    return;
  }

  element.addEventListener('input', () => {
    app.state.uiPrefs.filters[key] = element.value;
    hydrateFilterInputs();
    saveState();
    render();
  });

  element.addEventListener('change', () => {
    app.state.uiPrefs.filters[key] = element.value;
    hydrateFilterInputs();
    saveState();
    render();
  });
}

function hydrateFilterInputs() {
  const filters = app.state.uiPrefs.filters;
  elements.filterSearch.value = filters.search || '';
  elements.filterTag.value = filters.tag || '';
  elements.filterDateFrom.value = filters.dateFrom || '';
  elements.filterDateTo.value = filters.dateTo || '';
  elements.filterStatus.value = filters.status || 'all';
  elements.chartFilterDateFrom.value = filters.dateFrom || '';
  elements.chartFilterDateTo.value = filters.dateTo || '';
}

function normalizeScreenName(screenName) {
  if (screenName === SCREEN_CHARTS || screenName === SCREEN_DATA_OPS) {
    return screenName;
  }
  return SCREEN_DATA;
}

function applyScreen(screenName) {
  const selected = normalizeScreenName(screenName);

  elements.screenTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.screen === selected);
  });

  elements.dataScreen.classList.toggle('active', selected === SCREEN_DATA);
  elements.chartsScreen.classList.toggle('active', selected === SCREEN_CHARTS);
  elements.dataOpsScreen.classList.toggle('active', selected === SCREEN_DATA_OPS);
}

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

    app.state.rowsById = recomputeDerivedRows(app.state.rowsById);
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
  const persisted = persistStateWithFallback(app.state);
  if (!persisted.ok) {
    setStatus('DB export failed: unable to persist current state to local storage.');
    return;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
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
    applyScreen(app.state.uiPrefs.activeScreen || SCREEN_DATA);
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

function onRowInputChange(event) {
  const target = event.target;
  const rowElement = target.closest('tr[data-row-id]');
  if (!rowElement) {
    return;
  }

  const rowId = rowElement.dataset.rowId;
  const field = target.dataset.field;

  if (!rowId || !field) {
    return;
  }

  let nextValue = target.value;
  if (field === 'date') {
    nextValue = nextValue ? nextValue.replace('T', ' ') : '';
  }
  if (field === 'currency') {
    nextValue = normalizeCurrency(nextValue);
  }
  if (field === 'tags') {
    nextValue = normalizeTags(nextValue);
  }

  upsertOverride(rowId, field, nextValue);
}

function upsertOverride(rowId, field, value) {
  const row = app.state.rowsById[rowId];
  if (!row) {
    return;
  }

  row.overrides = row.overrides || {};

  const sourceValue = field === 'fullCategory' ? row.source.sourceFullCategory : row.source[field] || '';
  const normalizedSource = normalizeComparableValue(field, sourceValue);
  const normalizedNext = normalizeComparableValue(field, value);

  if (normalizedSource === normalizedNext) {
    delete row.overrides[field];
  } else {
    row.overrides[field] = value;
  }

  if (!Object.keys(row.overrides).length) {
    row.overrides = {};
  }

  finalizeRowUpdate();
}

function normalizeComparableValue(field, value) {
  if (field === 'currency') {
    return normalizeCurrency(value);
  }

  if (field === 'date') {
    return String(value || '').replace('T', ' ').trim();
  }

  if (field === 'tags') {
    return JSON.stringify(normalizeTags(value));
  }

  return String(value || '').trim();
}

function finalizeRowUpdate() {
  app.state.rowsById = recomputeDerivedRows(app.state.rowsById);
  saveState();
  render();
}

function getVisibleRows() {
  const records = Object.values(app.state.rowsById || {});
  const filtered = records.filter((record) => matchesFilter(record, app.state.uiPrefs.filters));
  return sortRowsByDateDesc(filtered);
}

function render() {
  const tableRows = getVisibleRows();
  const chartRows = getChartRows();
  app.currentRows = tableRows;

  renderDataTable(tableRows);
  applyExtraColumnsVisibility();
  if ((app.state.uiPrefs.activeScreen || 'data') === 'charts') {
    renderCharts(chartRows);
  }
}

function getChartRows() {
  const records = Object.values(app.state.rowsById || {});
  const filters = app.state.uiPrefs.filters || {};
  const fromEpoch = normalizeFilterDate(filters.dateFrom);
  const toEpoch = normalizeFilterDate(filters.dateTo);

  return records.filter((record) => {
    const epoch = record.derived?.effectiveDateEpoch;
    if ((fromEpoch !== null || toEpoch !== null) && (epoch === null || epoch === undefined)) {
      return false;
    }
    if (fromEpoch !== null && epoch < fromEpoch) {
      return false;
    }
    if (toEpoch !== null && epoch > toEpoch) {
      return false;
    }
    return true;
  });
}

function renderDataTable(rows) {
  if (!rows.length) {
    elements.rowsBody.innerHTML =
      '<tr><td colspan="12" style="text-align:center; padding: 24px; color: #4e6166;">No rows found for current filters.</td></tr>';
    elements.tableMeta.textContent = `0 rows shown · ${Object.keys(app.state.rowsById).length} rows total`;
    return;
  }

  const html = rows
    .map((record) => {
      const effective = computeEffectiveRow(record.source, record.overrides);
      const unresolved = Boolean(record.derived?.unresolved);
      const uahDisplay = unresolved ? '—' : formatMoney(record.derived?.uahAmount || 0);
      const rateSource = unresolved
        ? record.derived?.warning || 'Missing rate'
        : record.derived?.rateSource || '—';

      return `<tr data-row-id="${escapeHtml(record.id)}" class="${unresolved ? 'unresolved-row' : ''}">
        <td class="date-column"><input data-field="date" type="datetime-local" value="${escapeAttribute(formatDateInputValue(effective.date))}" /></td>
        <td class="uah-cell uah-column">${escapeHtml(uahDisplay)}</td>
        <td class="final-category-column final-category-text">${formatFinalCategoryHtml(effective.fullCategory)}</td>
        <td class="tags-column"><input data-field="tags" type="text" value="${escapeAttribute(formatTagsInput(effective.tags))}" placeholder="tag1, tag2" /></td>
        <td class="extra-column"><input data-field="price" type="text" value="${escapeAttribute(effective.price)}" /></td>
        <td class="extra-column"><input data-field="currency" type="text" value="${escapeAttribute(effective.currency)}" /></td>
        <td class="notes-column"><input class="notes-input" data-field="notes" type="text" value="${escapeAttribute(effective.notes)}" /></td>
        <td class="readonly-cell extra-column"><div class="readonly-value">${escapeHtml(effective.originalCategory)}</div></td>
        <td class="readonly-cell extra-column"><div class="readonly-value">${escapeHtml(effective.originalSourceFullCategory)}</div></td>
        <td class="extra-column"><input data-field="rate" type="text" value="${escapeAttribute(effective.rate)}" /></td>
        <td class="extra-column"><input data-field="rateType" type="text" value="${escapeAttribute(effective.rateType)}" /></td>
        <td class="rate-source-cell extra-column">${escapeHtml(rateSource)}</td>
      </tr>`;
    })
    .join('');

  elements.rowsBody.innerHTML = html;

  const unresolvedCount = rows.filter((row) => row.derived?.unresolved).length;
  elements.tableMeta.textContent = `${rows.length} rows shown · ${Object.keys(app.state.rowsById).length} rows total · ${unresolvedCount} unresolved`;
}

function applyExtraColumnsVisibility() {
  if (!elements.recordsTable) {
    return;
  }

  const showExtraColumns = Boolean(app.state.uiPrefs.showExtraColumns);
  elements.recordsTable.classList.toggle('hide-extra-columns', !showExtraColumns);

  if (elements.toggleExtraColumns) {
    elements.toggleExtraColumns.textContent = showExtraColumns
      ? 'Hide extra columns'
      : 'Show extra columns';
  }
}

function renderCharts(rows) {
  const summary = summarizeUah(rows);
  elements.cardNet.textContent = formatMoney(summary.net);
  elements.cardNetInflow.textContent = `Total inflow: ${formatMoney(summary.inflow)} · Total outflow: ${formatMoney(summary.outflow)}`;
  elements.cardUnresolved.textContent = String(summary.unresolved);
  const selectedDays = countSelectedCalendarDays(
    app.state.uiPrefs.filters.dateFrom,
    app.state.uiPrefs.filters.dateTo
  );
  elements.cardSelectedDays.textContent = selectedDays === null ? '—' : String(selectedDays);

  const categoryPie = buildCategoryPieDatasetUAHAbsoluteNet(rows);
  const tagPie = buildTagPieDatasetUAHAbsoluteNet(rows);

  renderCategoryPieChart(categoryPie);
  renderTagPieChart(tagPie);
}

function renderCategoryPieChart(data) {
  if (app.categoryChart) {
    app.categoryChart.destroy();
  }

  app.categoryChart = buildPieChart(
    elements.categoryChart,
    data,
    'Final category share',
    elements.categoryChartNet,
    elements.categoryLegendToggle
  );
}

function renderTagPieChart(data) {
  if (app.tagChart) {
    app.tagChart.destroy();
  }

  app.tagChart = buildPieChart(
    elements.tagChart,
    data,
    'Tag share',
    elements.tagChartNet,
    elements.tagLegendToggle
  );
}

function buildPieChart(canvas, items, title, netElement, toggleButton) {
  const hasData = items.length > 0;
  const chartItems = hasData
    ? items
    : [
        {
          label: 'No data',
          absoluteNet: 1,
          signedNet: 0
        }
      ];

  const totalWeight = chartItems.reduce((sum, item) => sum + item.absoluteNet, 0) || 1;
  const palette = buildPiePalette(chartItems.map((item) => item.label), hasData);

  const chart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: chartItems.map((item) => item.label),
      datasets: [
        {
          label: `${title} (UAH)`,
          data: chartItems.map((item) => item.absoluteNet),
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderWidth: 1
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#37474f',
            boxWidth: 14,
            boxHeight: 14
          },
          onHover(event, legendItem, legend) {
            const index = legendItem?.index;
            if (typeof index !== 'number') {
              return;
            }

            const chart = legend.chart;
            const active = [{ datasetIndex: 0, index }];
            chart.setActiveElements(active);
            chart.tooltip.setActiveElements(active, { x: event.x || 0, y: event.y || 0 });
            chart.update('none');
          },
          onLeave(_event, _legendItem, legend) {
            const chart = legend.chart;
            chart.setActiveElements([]);
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.update('none');
          },
          onClick(_event, legendItem, legend) {
            const index = legendItem?.index;
            if (typeof index !== 'number') {
              return;
            }

            const chart = legend.chart;
            chart.toggleDataVisibility(index);
            chart.setActiveElements([]);
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.update();
            updateChartNetLabel(chart, chartItems, netElement);
            syncLegendToggleButtonLabel(chart, chartItems, toggleButton, hasData);
          }
        },
        tooltip: {
          callbacks: {
            title(context) {
              return context[0]?.label || title;
            },
            label(context) {
              if (!hasData) {
                return 'No resolved UAH rows for this chart.';
              }

              const item = chartItems[context.dataIndex];
              const signedPrefix = item.signedNet >= 0 ? '+' : '';
              return `Net UAH: ${signedPrefix}${formatMoney(item.signedNet)} UAH`;
            },
            afterLabel(context) {
              if (!hasData) {
                return '';
              }

              const item = chartItems[context.dataIndex];
              const fullPieShare = ((item.absoluteNet / totalWeight) * 100).toFixed(1);
              const visibleTotal = getVisibleAbsoluteTotal(context.chart, chartItems);
              const visibleShare =
                visibleTotal > 0 ? `${((item.absoluteNet / visibleTotal) * 100).toFixed(1)}%` : '—';
              return [`Full pie: ${fullPieShare}%`, `Visible slices: ${visibleShare}`];
            }
          }
        }
      }
    }
  });

  if (toggleButton) {
    toggleButton.onclick = () => {
      if (!hasData) {
        return;
      }

      const showAll = !areAllSlicesVisible(chart, chartItems);
      setAllSlicesVisibility(chart, chartItems, showAll);
      chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update();
      updateChartNetLabel(chart, chartItems, netElement);
      syncLegendToggleButtonLabel(chart, chartItems, toggleButton, hasData);
    };
  }

  updateChartNetLabel(chart, chartItems, netElement);
  syncLegendToggleButtonLabel(chart, chartItems, toggleButton, hasData);
  return chart;
}

function updateChartNetLabel(chart, chartItems, netElement) {
  if (!netElement) {
    return;
  }

  let visibleNet = 0;
  for (let index = 0; index < chartItems.length; index += 1) {
    if (chart.getDataVisibility(index)) {
      visibleNet += chartItems[index].signedNet;
    }
  }

  const sign = visibleNet > 0 ? '+' : '';
  netElement.textContent = `Net UAH: ${sign}${formatMoney(visibleNet)}`;
}

function getVisibleAbsoluteTotal(chart, chartItems) {
  let visibleTotal = 0;
  for (let index = 0; index < chartItems.length; index += 1) {
    if (chart.getDataVisibility(index)) {
      visibleTotal += chartItems[index].absoluteNet;
    }
  }
  return visibleTotal;
}

function areAllSlicesVisible(chart, chartItems) {
  for (let index = 0; index < chartItems.length; index += 1) {
    if (!chart.getDataVisibility(index)) {
      return false;
    }
  }
  return true;
}

function setAllSlicesVisibility(chart, chartItems, visible) {
  for (let index = 0; index < chartItems.length; index += 1) {
    const isVisible = chart.getDataVisibility(index);
    if (isVisible !== visible) {
      chart.toggleDataVisibility(index);
    }
  }
}

function syncLegendToggleButtonLabel(chart, chartItems, button, hasData) {
  if (!button) {
    return;
  }

  if (!hasData) {
    button.disabled = true;
    button.textContent = 'Show all';
    return;
  }

  button.disabled = false;
  button.textContent = areAllSlicesVisible(chart, chartItems) ? 'Hide all' : 'Show all';
}

function buildPiePalette(labels, colorful) {
  if (!colorful) {
    return {
      background: ['rgba(130, 142, 150, 0.45)'],
      border: ['rgba(94, 103, 110, 0.9)']
    };
  }

  const background = labels.map((label) => {
    const hue = hashLabelToHue(label);
    return `hsla(${hue}, 62%, 58%, 0.78)`;
  });

  const border = labels.map((label) => {
    const hue = hashLabelToHue(label);
    return `hsla(${hue}, 66%, 34%, 0.95)`;
  });

  return { background, border };
}

function hashLabelToHue(label) {
  const input = String(label || '');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33 + input.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

function saveState(statusMessage = '') {
  app.state.updatedAt = new Date().toISOString();
  const result = persistStateWithFallback(app.state);

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

function persistStateWithFallback(state) {
  for (const level of STORAGE_WRITE_LEVELS) {
    const payload = buildStoragePayload(state, level);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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

function buildStoragePayload(state, level) {
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

function cloneState(state) {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

function setStatus(message) {
  if (!message) {
    return;
  }

  console.info(`[Expense Consolidator] ${message}`);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/\n/g, ' ');
}

function formatFinalCategoryHtml(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const slashIndex = raw.indexOf('/');
  if (slashIndex < 0) {
    return escapeHtml(raw);
  }

  const left = raw.slice(0, slashIndex).trim();
  const right = raw.slice(slashIndex + 1).trim();

  if (!left) {
    return escapeHtml(raw);
  }

  if (!right) {
    return `<strong>${escapeHtml(left)}</strong> /`;
  }

  return `<strong>${escapeHtml(left)}</strong> / ${escapeHtml(right)}`;
}

function isQuotaError(error) {
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

window.addEventListener('beforeunload', () => {
  saveState();
});

window.debugExpenseApp = {
  getState() {
    return app.state;
  },
  recompute() {
    app.state.rowsById = recomputeDerivedRows(app.state.rowsById);
    render();
  },
  showVisibleRows() {
    return app.currentRows.map((row) => {
      const effective = computeEffectiveRow(row.source, row.overrides);
      return {
        id: row.id,
        date: displayDateTime(effective.date),
        finalCategory: effective.fullCategory,
        sourceCategory: effective.originalCategory,
        sourceFullCategory: effective.originalSourceFullCategory,
        tags: effective.tags,
        uahAmount: row.derived?.uahAmount,
        unresolved: row.derived?.unresolved
      };
    });
  }
};
