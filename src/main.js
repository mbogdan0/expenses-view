import { ArcElement, Chart, Legend, PieController, Tooltip } from 'chart.js';
import * as core from './core.js';
import { createChartsUi } from './ui/ui-charts.js';
import { escapeAttribute, escapeHtml, formatFinalCategoryHtml } from './ui/ui-formatters.js';
import { createImportExportUi } from './ui/ui-import-export.js';
import {
  loadState,
  persistStateWithFallback,
  saveState as saveStateToStorage
} from './ui/ui-storage.js';
import { createTableUi } from './ui/ui-table.js';

Chart.register(PieController, ArcElement, Tooltip, Legend);

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
  fxRatesScreen: document.getElementById('fxRatesScreen'),
  dataOpsScreen: document.getElementById('dataOpsScreen'),
  tagsScreen: document.getElementById('tagsScreen'),
  categoryMergeScreen: document.getElementById('categoryMergeScreen'),
  rowsBody: document.getElementById('rowsBody'),
  tableMeta: document.getElementById('tableMeta'),
  amountColumnHeader: document.getElementById('amountColumnHeader'),
  recordsTable: document.getElementById('recordsTable'),
  selectVisibleRows: document.getElementById('selectVisibleRows'),
  bulkSelectedCount: document.getElementById('bulkSelectedCount'),
  bulkTagSelect: document.getElementById('bulkTagSelect'),
  bulkAddTagButton: document.getElementById('bulkAddTagButton'),
  bulkRemoveTagButton: document.getElementById('bulkRemoveTagButton'),
  toggleExtraColumns: document.getElementById('toggleExtraColumns'),
  dataDisplayCurrencyUah: document.getElementById('dataDisplayCurrencyUah'),
  dataDisplayCurrencyUsd: document.getElementById('dataDisplayCurrencyUsd'),
  chartsDisplayCurrencyUah: document.getElementById('chartsDisplayCurrencyUah'),
  chartsDisplayCurrencyUsd: document.getElementById('chartsDisplayCurrencyUsd'),
  filterSearch: document.getElementById('filterSearch'),
  filterTag: document.getElementById('filterTag'),
  filterTagsLt2Only: document.getElementById('filterTagsLt2Only'),
  filterDateFrom: document.getElementById('filterDateFrom'),
  filterDateTo: document.getElementById('filterDateTo'),
  filterStatus: document.getElementById('filterStatus'),
  clearFilters: document.getElementById('clearFilters'),
  chartFilterDateFrom: document.getElementById('chartFilterDateFrom'),
  chartFilterDateTo: document.getElementById('chartFilterDateTo'),
  clearChartFilters: document.getElementById('clearChartFilters'),
  cardNetTitle: document.getElementById('cardNetTitle'),
  cardNet: document.getElementById('cardNet'),
  cardNetInflow: document.getElementById('cardNetInflow'),
  cardSelectedDays: document.getElementById('cardSelectedDays'),
  cardUnresolved: document.getElementById('cardUnresolved'),
  categoryChartTitle: document.getElementById('categoryChartTitle'),
  categoryChartNet: document.getElementById('categoryChartNet'),
  categoryLegendToggle: document.getElementById('categoryLegendToggle'),
  chartTagGroupSelect: document.getElementById('chartTagGroupSelect'),
  tagChartTitle: document.getElementById('tagChartTitle'),
  tagChartNet: document.getElementById('tagChartNet'),
  tagLegendToggle: document.getElementById('tagLegendToggle'),
  categoryChart: document.getElementById('categoryChart'),
  tagChart: document.getElementById('tagChart'),
  dataUsdCoverageWarning: document.getElementById('dataUsdCoverageWarning'),
  chartsUsdCoverageWarning: document.getElementById('chartsUsdCoverageWarning'),
  ratesUsdCoverageWarning: document.getElementById('ratesUsdCoverageWarning'),
  manualUsdRequiredList: document.getElementById('manualUsdRequiredList'),
  manualUsdRatesTextarea: document.getElementById('manualUsdRatesTextarea'),
  applyManualUsdRatesButton: document.getElementById('applyManualUsdRatesButton'),
  manualUsdRatesMeta: document.getElementById('manualUsdRatesMeta'),
  manualUsdRatesIssues: document.getElementById('manualUsdRatesIssues'),
  tagGroupsTextarea: document.getElementById('tagGroupsTextarea'),
  applyTagGroupsButton: document.getElementById('applyTagGroupsButton'),
  tagGroupsMeta: document.getElementById('tagGroupsMeta'),
  tagGroupsIssues: document.getElementById('tagGroupsIssues'),
  categoryMergeTextarea: document.getElementById('categoryMergeTextarea'),
  applyCategoryMergeButton: document.getElementById('applyCategoryMergeButton'),
  categoryMergeMeta: document.getElementById('categoryMergeMeta'),
  categoryMergeIssues: document.getElementById('categoryMergeIssues')
};

const app = {
  state: loadState({
    storageKey: core.STORAGE_KEY,
    createEmptyState: core.createEmptyState,
    sanitizeLoadedState: core.sanitizeLoadedState
  }),
  categoryChart: null,
  tagChart: null,
  currentRows: [],
  selectedRowIds: new Set()
};

let tableUi;
let chartsUi;
let importExportUi;

setupUiModules();
init();

function setupUiModules() {
  tableUi = createTableUi({
    app,
    elements,
    computeEffectiveRow: core.computeEffectiveRow,
    formatDateInputValue: core.formatDateInputValue,
    formatMoney: core.formatMoney,
    formatTagsInput: core.formatTagsInput,
    matchesFilter: core.matchesFilter,
    normalizeCurrency: core.normalizeCurrency,
    normalizeTags: core.normalizeTags,
    normalizeDisplayCurrency: core.normalizeDisplayCurrency,
    getRowConversionForDisplayCurrency: core.getRowConversionForDisplayCurrency,
    recomputeDerivedRows: core.recomputeDerivedRows,
    sortRowsByDateDesc: core.sortRowsByDateDesc,
    validateRowTagsAgainstGroups: core.validateRowTagsAgainstGroups,
    applyBulkTagMutation: core.applyBulkTagMutation,
    escapeHtml,
    escapeAttribute,
    formatFinalCategoryHtml,
    setStatus,
    saveState,
    render
  });

  chartsUi = createChartsUi({
    app,
    elements,
    formatMoney: core.formatMoney,
    normalizeDisplayCurrency: core.normalizeDisplayCurrency,
    summarizeRowsByDisplayCurrency: core.summarizeRowsByDisplayCurrency,
    countSelectedCalendarDays: core.countSelectedCalendarDays,
    buildCategoryPieDatasetAbsoluteNet: core.buildCategoryPieDatasetAbsoluteNet,
    buildTagGroupPieDatasetAbsoluteNet: core.buildTagGroupPieDatasetAbsoluteNet,
    buildPiePalette: core.buildPiePalette,
    normalizeTagGroupIndex: core.normalizeTagGroupIndex,
    buildTagGroupPreviewLabel: (...args) => tableUi.buildTagGroupPreviewLabel(...args),
    escapeHtml
  });

  importExportUi = createImportExportUi({
    app,
    elements,
    storageKey: core.STORAGE_KEY,
    screenData: core.SCREEN_DATA,
    createEmptyState: core.createEmptyState,
    parseExpenseCsv: core.parseExpenseCsv,
    buildFileFingerprint: core.buildFileFingerprint,
    normalizeImportedRow: core.normalizeImportedRow,
    mergeImportedRow: core.mergeImportedRow,
    recomputeDerivedRows: core.recomputeDerivedRows,
    parseStateSnapshotJson: core.parseStateSnapshotJson,
    persistStateWithFallback,
    setStatus,
    saveState,
    render,
    hydrateFilterInputs,
    hydrateManualUsdRatesInputs,
    hydrateDisplayCurrencyButtons,
    applyScreen
  });
}

function init() {
  bindEvents();
  hydrateFilterInputs();
  hydrateTagGroupsInputs();
  hydrateCategoryMergeInputs();
  hydrateManualUsdRatesInputs();
  hydrateDisplayCurrencyButtons();
  applyScreen(app.state.uiPrefs.activeScreen || core.SCREEN_DATA);
  render();
}

function bindEvents() {
  elements.importButton.addEventListener('click', () => {
    void importExportUi.importFromPicker();
  });

  elements.resetButton.addEventListener('click', () => {
    const ok = window.confirm('Clear all stored rows and import history from local storage?');
    if (!ok) {
      return;
    }

    importExportUi.resetLocalData();
  });

  elements.exportDbButton.addEventListener('click', () => {
    importExportUi.exportDbSnapshot();
  });

  elements.importDbButton.addEventListener('click', () => {
    void importExportUi.importDbSnapshotFromPicker();
  });

  elements.screenTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextScreen = normalizeScreenName(tab.dataset.screen || core.SCREEN_DATA);
      app.state.uiPrefs.activeScreen = nextScreen;
      saveState();
      applyScreen(nextScreen);
      render();
    });
  });

  bindDisplayCurrencyButton(elements.dataDisplayCurrencyUah, core.DISPLAY_CURRENCY_UAH);
  bindDisplayCurrencyButton(elements.dataDisplayCurrencyUsd, core.DISPLAY_CURRENCY_USD);
  bindDisplayCurrencyButton(elements.chartsDisplayCurrencyUah, core.DISPLAY_CURRENCY_UAH);
  bindDisplayCurrencyButton(elements.chartsDisplayCurrencyUsd, core.DISPLAY_CURRENCY_USD);

  bindFilterInput(elements.filterSearch, 'search');
  bindFilterInput(elements.filterTag, 'tag');
  bindFilterCheckbox(elements.filterTagsLt2Only, 'tagsLt2Only');
  bindSharedDateInput(elements.filterDateFrom, 'dateFrom');
  bindSharedDateInput(elements.filterDateTo, 'dateTo');
  bindFilterInput(elements.filterStatus, 'status');
  bindSharedDateInput(elements.chartFilterDateFrom, 'dateFrom');
  bindSharedDateInput(elements.chartFilterDateTo, 'dateTo');

  elements.clearFilters.addEventListener('click', () => {
    app.state.uiPrefs.filters = {
      search: '',
      tag: '',
      tagsLt2Only: false,
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

  elements.selectVisibleRows?.addEventListener('change', tableUi.onSelectVisibleRowsChange);
  elements.bulkAddTagButton?.addEventListener('click', () => {
    tableUi.runBulkTagMutation('add');
  });
  elements.bulkRemoveTagButton?.addEventListener('click', () => {
    tableUi.runBulkTagMutation('remove');
  });
  elements.chartTagGroupSelect?.addEventListener('change', () => {
    const parsed = core.parseTagGroupsText(app.state.tagGroupsText);
    app.state.uiPrefs.selectedTagGroup = core.normalizeTagGroupIndex(
      elements.chartTagGroupSelect.value,
      parsed.groups.length
    );
    saveState();
    render();
  });
  elements.applyTagGroupsButton?.addEventListener('click', () => {
    applyTagGroupsFromTextarea();
  });
  elements.applyCategoryMergeButton?.addEventListener('click', () => {
    applyCategoryMergeFromTextarea();
  });
  elements.applyManualUsdRatesButton?.addEventListener('click', () => {
    applyManualUsdRatesFromTextarea();
  });

  elements.rowsBody.addEventListener('change', tableUi.onRowsBodyChange);
}

function bindDisplayCurrencyButton(button, displayCurrency) {
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    app.state.uiPrefs.displayCurrency = core.normalizeDisplayCurrency(displayCurrency);
    hydrateDisplayCurrencyButtons();
    saveState();
    render();
  });
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

function bindFilterCheckbox(element, key) {
  if (!element) {
    return;
  }

  element.addEventListener('change', () => {
    app.state.uiPrefs.filters[key] = Boolean(element.checked);
    saveState();
    render();
  });
}

function hydrateFilterInputs() {
  const filters = app.state.uiPrefs.filters;
  elements.filterSearch.value = filters.search || '';
  elements.filterTag.value = filters.tag || '';
  if (elements.filterTagsLt2Only) {
    elements.filterTagsLt2Only.checked = filters.tagsLt2Only === true;
  }
  elements.filterDateFrom.value = filters.dateFrom || '';
  elements.filterDateTo.value = filters.dateTo || '';
  elements.filterStatus.value = filters.status || 'all';
  elements.chartFilterDateFrom.value = filters.dateFrom || '';
  elements.chartFilterDateTo.value = filters.dateTo || '';
}

function hydrateTagGroupsInputs() {
  if (elements.tagGroupsTextarea) {
    elements.tagGroupsTextarea.value = app.state.tagGroupsText || '';
  }
}

function hydrateCategoryMergeInputs() {
  if (elements.categoryMergeTextarea) {
    elements.categoryMergeTextarea.value = app.state.categoryMergeRulesText || '';
  }
}

function hydrateManualUsdRatesInputs() {
  if (elements.manualUsdRatesTextarea) {
    elements.manualUsdRatesTextarea.value = app.state.manualUsdRatesText || '';
  }
}

function hydrateDisplayCurrencyButtons() {
  const displayCurrency = core.normalizeDisplayCurrency(app.state.uiPrefs.displayCurrency);
  app.state.uiPrefs.displayCurrency = displayCurrency;

  const uahActive = displayCurrency === core.DISPLAY_CURRENCY_UAH;
  const usdActive = displayCurrency === core.DISPLAY_CURRENCY_USD;

  [elements.dataDisplayCurrencyUah, elements.chartsDisplayCurrencyUah]
    .filter(Boolean)
    .forEach((button) => button.classList.toggle('active', uahActive));
  [elements.dataDisplayCurrencyUsd, elements.chartsDisplayCurrencyUsd]
    .filter(Boolean)
    .forEach((button) => button.classList.toggle('active', usdActive));
}

function normalizeScreenName(screenName) {
  if (
    screenName === core.SCREEN_CHARTS ||
    screenName === core.SCREEN_FX_RATES ||
    screenName === core.SCREEN_DATA_OPS ||
    screenName === core.SCREEN_TAGS ||
    screenName === core.SCREEN_CATEGORY_MERGE
  ) {
    return screenName;
  }
  return core.SCREEN_DATA;
}

function applyScreen(screenName) {
  const selected = normalizeScreenName(screenName);

  elements.screenTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.screen === selected);
  });

  elements.dataScreen.classList.toggle('active', selected === core.SCREEN_DATA);
  elements.chartsScreen.classList.toggle('active', selected === core.SCREEN_CHARTS);
  elements.fxRatesScreen.classList.toggle('active', selected === core.SCREEN_FX_RATES);
  elements.dataOpsScreen.classList.toggle('active', selected === core.SCREEN_DATA_OPS);
  elements.tagsScreen.classList.toggle('active', selected === core.SCREEN_TAGS);
  elements.categoryMergeScreen.classList.toggle('active', selected === core.SCREEN_CATEGORY_MERGE);
}

function applyTagGroupsFromTextarea() {
  const nextText = elements.tagGroupsTextarea?.value || '';
  app.state.tagGroupsText = nextText;

  const parsed = core.parseTagGroupsText(nextText);
  app.state.uiPrefs.selectedTagGroup = core.normalizeTagGroupIndex(
    app.state.uiPrefs.selectedTagGroup,
    parsed.groups.length
  );
  app.state.rowsById = core.recomputeDerivedRows(
    app.state.rowsById,
    app.state.tagGroupsText,
    app.state.categoryMergeRulesText,
    app.state.manualUsdRatesText
  );

  if (parsed.isValid) {
    saveState(`Tag groups applied: ${parsed.groups.length} group(s), ${parsed.allTags.length} tags.`);
  } else {
    saveState(`Tag groups applied with ${parsed.issues.length} taxonomy issue(s).`);
  }

  render();
}

function collectBaseFinalCategories(rowsById) {
  const categories = new Set();

  for (const record of Object.values(rowsById || {})) {
    const effective = core.computeEffectiveRow(record.source, record.overrides);
    const category = (effective.baseFullCategory || effective.fullCategory || '').trim();
    if (!category) {
      continue;
    }
    categories.add(category);
  }

  return categories;
}

function applyCategoryMergeFromTextarea() {
  const nextText = elements.categoryMergeTextarea?.value || '';
  app.state.categoryMergeRulesText = nextText;

  const parsed = core.parseCategoryMergeRulesText(nextText);
  app.state.rowsById = core.recomputeDerivedRows(
    app.state.rowsById,
    app.state.tagGroupsText,
    app.state.categoryMergeRulesText,
    app.state.manualUsdRatesText
  );

  const runtime = core.buildCategoryMergeRuntime(
    parsed,
    collectBaseFinalCategories(app.state.rowsById)
  );
  const issuesCount = parsed.issues.length + runtime.missingMasters.length;
  if (issuesCount === 0) {
    saveState(
      `Category merge rules applied: ${parsed.rules.length} rule(s), ${parsed.appliedMappingsCount} mapping(s).`
    );
  } else {
    saveState(`Category merge rules applied with ${issuesCount} issue(s).`);
  }

  render();
}

function applyManualUsdRatesFromTextarea() {
  const nextText = elements.manualUsdRatesTextarea?.value || '';
  app.state.manualUsdRatesText = nextText;
  app.state.rowsById = core.recomputeDerivedRows(
    app.state.rowsById,
    app.state.tagGroupsText,
    app.state.categoryMergeRulesText,
    app.state.manualUsdRatesText
  );

  const coverageModel = buildUsdCoverageModel();
  const parseIssuesCount = coverageModel.parsedRates.issues.length;
  const missingCount = coverageModel.missingRequests.length;

  saveState(
    `Manual USD rates applied: ${coverageModel.parsedRates.entries.length} valid line(s), ${parseIssuesCount} parse issue(s), ${missingCount} missing checkpoint(s).`
  );
  render();
}

function renderCategoryMergePanel(categoryMergeModel) {
  const runtime = core.buildCategoryMergeRuntime(
    categoryMergeModel,
    collectBaseFinalCategories(app.state.rowsById)
  );
  const parseIssueCount = categoryMergeModel.issues.length;
  const missingMasterCount = runtime.missingMasters.length;
  const totalIssues = parseIssueCount + missingMasterCount;

  if (elements.categoryMergeMeta) {
    const validity = totalIssues === 0 ? 'valid' : 'with issues';
    elements.categoryMergeMeta.textContent = `${categoryMergeModel.rules.length} rules · ${categoryMergeModel.appliedMappingsCount} mappings · ${runtime.activeChildToMaster.size} active mappings · ${missingMasterCount} missing master categories · ${validity}`;
  }

  if (elements.categoryMergeIssues) {
    const issueMessages = [
      ...categoryMergeModel.issues.map((issue) => issue.message),
      ...runtime.missingMasters.map((missing) => missing.message)
    ];

    if (!issueMessages.length) {
      elements.categoryMergeIssues.innerHTML = '';
      return;
    }

    elements.categoryMergeIssues.innerHTML = issueMessages
      .map((message) => `<li>${escapeHtml(message)}</li>`)
      .join('');
  }
}

function getChartRows() {
  const records = Object.values(app.state.rowsById || {});
  const filters = app.state.uiPrefs.filters || {};
  const fromEpoch = core.normalizeFilterDate(filters.dateFrom, 'start');
  const toEpoch = core.normalizeFilterDate(filters.dateTo, 'end');

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

function buildUsdCoverageModel() {
  return core.buildUsdCoverageReportForRowsById(
    app.state.rowsById,
    app.state.manualUsdRatesText,
    core.USD_RATE_COVERAGE_DAYS
  );
}

function setCoverageWarning(element, isVisible, message) {
  if (!element) {
    return;
  }

  element.classList.toggle('hidden', !isVisible);
  element.textContent = isVisible ? message : '';
}

function renderUsdCoverageWarnings(coverageModel) {
  const hasRequirements = coverageModel.requiredPairs.length > 0;
  const shouldWarn = hasRequirements && !coverageModel.isComplete;
  const affectedPairs = new Set(coverageModel.missingRequests.map((request) => request.pair)).size;
  const warningText = shouldWarn
    ? `USD coverage is incomplete: missing ${coverageModel.missingRequests.length} checkpoint(s) across ${affectedPairs} pair(s). USD conversions may be inaccurate.`
    : '';

  setCoverageWarning(elements.dataUsdCoverageWarning, shouldWarn, warningText);
  setCoverageWarning(elements.chartsUsdCoverageWarning, shouldWarn, warningText);
  setCoverageWarning(elements.ratesUsdCoverageWarning, shouldWarn, warningText);
}

function renderManualUsdRatesPanel(coverageModel) {
  if (elements.manualUsdRequiredList) {
    elements.manualUsdRequiredList.value =
      coverageModel.missingRequestsText || 'All required USD checkpoints are currently covered.';
  }

  if (elements.manualUsdRatesMeta) {
    const pairCount = coverageModel.requiredPairs.length;
    elements.manualUsdRatesMeta.textContent = `${coverageModel.parsedRates.entries.length} valid rate line(s) · ${coverageModel.parsedRates.issues.length} parse issue(s) · ${coverageModel.missingRequests.length} missing checkpoint(s) · ${pairCount} required pair(s)`;
  }

  if (elements.manualUsdRatesIssues) {
    if (!coverageModel.parsedRates.issues.length) {
      elements.manualUsdRatesIssues.innerHTML = '';
      return;
    }

    elements.manualUsdRatesIssues.innerHTML = coverageModel.parsedRates.issues
      .map((issue) => `<li>${escapeHtml(issue.message)}</li>`)
      .join('');
  }
}

function render() {
  const tableRows = tableUi.getVisibleRows();
  const chartRows = getChartRows();
  const tagGroups = core.parseTagGroupsText(app.state.tagGroupsText);
  const categoryMerge = core.parseCategoryMergeRulesText(app.state.categoryMergeRulesText);
  const displayCurrency = core.normalizeDisplayCurrency(app.state.uiPrefs.displayCurrency);
  const usdCoverageModel = buildUsdCoverageModel();

  app.state.uiPrefs.displayCurrency = displayCurrency;
  app.state.uiPrefs.selectedTagGroup = core.normalizeTagGroupIndex(
    app.state.uiPrefs.selectedTagGroup,
    tagGroups.groups.length
  );
  tableUi.syncSelectionWithVisibleRows(tableRows);
  app.currentRows = tableRows;

  hydrateDisplayCurrencyButtons();
  tableUi.renderDataTable(tableRows);
  tableUi.renderBulkTagControls(tableRows, tagGroups);
  tableUi.renderTagGroupsPanel(tagGroups);
  renderCategoryMergePanel(categoryMerge);
  renderManualUsdRatesPanel(usdCoverageModel);
  renderUsdCoverageWarnings(usdCoverageModel);
  tableUi.applyExtraColumnsVisibility();
  if ((app.state.uiPrefs.activeScreen || core.SCREEN_DATA) === core.SCREEN_CHARTS) {
    chartsUi.renderCharts(chartRows, tagGroups, displayCurrency);
  }
}

function saveState(statusMessage = '') {
  saveStateToStorage({
    app,
    setStatus,
    storageKey: core.STORAGE_KEY,
    statusMessage
  });
}

function setStatus(message) {
  if (!message) {
    return;
  }

  console.info(`[Expense Consolidator] ${message}`);
}

window.addEventListener('beforeunload', () => {
  saveState();
});

window.debugExpenseApp = {
  getState() {
    return app.state;
  },
  recompute() {
    app.state.rowsById = core.recomputeDerivedRows(
      app.state.rowsById,
      app.state.tagGroupsText,
      app.state.categoryMergeRulesText,
      app.state.manualUsdRatesText
    );
    render();
  },
  showVisibleRows() {
    return app.currentRows.map((row) => {
      const effective = core.computeEffectiveRow(row.source, row.overrides);
      return {
        id: row.id,
        date: core.displayDateTime(effective.date),
        finalCategory: row.derived?.finalFullCategory || effective.fullCategory,
        baseFinalCategory: row.derived?.baseFullCategory || effective.baseFullCategory,
        categoryMergeStatus: row.derived?.categoryMergeStatus || 'none',
        sourceCategory: effective.originalCategory,
        sourceFullCategory: effective.originalSourceFullCategory,
        tags: effective.tags,
        uahAmount: row.derived?.uahAmount,
        usdAmount: row.derived?.usdAmount,
        unresolvedUah: row.derived?.unresolved,
        unresolvedUsd: row.derived?.usdUnresolved
      };
    });
  }
};
