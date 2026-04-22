import { createElements } from './elements.js';
import { bindEvents } from './events.js';
import {
  hydrateCategoryMergeInputs,
  hydrateDisplayCurrencyButtons,
  hydrateFilterInputs,
  hydrateManualUsdRatesInputs,
  hydrateTagGroupsInputs
} from './hydration.js';
import { createRenderPipeline } from './render-pipeline.js';
import { applyScreen as applyScreenByCore, normalizeScreenName as normalizeScreenByCore } from './screens.js';
import { createCategoryMergeFeature } from './features/category-merge.js';
import { createTagGroupsFeature } from './features/tag-groups.js';
import { createUsdRatesFeature } from './features/usd-rates.js';

export function createAppRuntime({
  core,
  createChartsUi,
  createImportExportUi,
  createTableUi,
  escapeAttribute,
  escapeHtml,
  formatFinalCategoryHtml,
  loadState,
  persistStateWithFallback,
  saveStateToStorage,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  elements: providedElements
}) {
  const elements = providedElements || createElements(documentRef);
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
  let renderPipeline;

  function setStatus(message) {
    if (!message) {
      return;
    }

    console.info(`[Expense Consolidator] ${message}`);
  }

  function saveState(statusMessage = '') {
    saveStateToStorage({
      app,
      setStatus,
      storageKey: core.STORAGE_KEY,
      statusMessage
    });
  }

  function hydrateFilterInputsRuntime() {
    hydrateFilterInputs(app, elements);
  }

  function hydrateTagGroupsInputsRuntime() {
    hydrateTagGroupsInputs(app, elements);
  }

  function hydrateCategoryMergeInputsRuntime() {
    hydrateCategoryMergeInputs(app, elements);
  }

  function hydrateManualUsdRatesInputsRuntime() {
    hydrateManualUsdRatesInputs(app, elements);
  }

  function hydrateDisplayCurrencyButtonsRuntime() {
    hydrateDisplayCurrencyButtons(app, elements, core);
  }

  function normalizeScreenNameRuntime(screenName) {
    return normalizeScreenByCore(core, screenName);
  }

  function applyScreenRuntime(screenName) {
    applyScreenByCore(elements, core, screenName);
  }

  function render() {
    renderPipeline.render();
  }

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
      hydrateFilterInputs: hydrateFilterInputsRuntime,
      hydrateManualUsdRatesInputs: hydrateManualUsdRatesInputsRuntime,
      hydrateDisplayCurrencyButtons: hydrateDisplayCurrencyButtonsRuntime,
      applyScreen: applyScreenRuntime
    });
  }

  setupUiModules();

  const tagGroupsFeature = createTagGroupsFeature({
    app,
    elements,
    core,
    saveState,
    render
  });

  const categoryMergeFeature = createCategoryMergeFeature({
    app,
    elements,
    core,
    escapeHtml,
    saveState,
    render
  });

  const usdRatesFeature = createUsdRatesFeature({
    app,
    elements,
    core,
    escapeHtml,
    saveState,
    render
  });

  renderPipeline = createRenderPipeline({
    app,
    elements,
    core,
    tableUi,
    chartsUi,
    hydrateDisplayCurrencyButtons: hydrateDisplayCurrencyButtonsRuntime,
    renderCategoryMergePanel: categoryMergeFeature.renderCategoryMergePanel,
    renderManualUsdRatesPanel: usdRatesFeature.renderManualUsdRatesPanel,
    renderUsdCoverageWarnings: usdRatesFeature.renderUsdCoverageWarnings,
    buildUsdCoverageModel: usdRatesFeature.buildUsdCoverageModel
  });

  function bindAppEvents() {
    bindEvents({
      app,
      core,
      elements,
      importExportUi,
      tableUi,
      saveState,
      render,
      hydrateFilterInputs: hydrateFilterInputsRuntime,
      hydrateDisplayCurrencyButtons: hydrateDisplayCurrencyButtonsRuntime,
      applyScreen: applyScreenRuntime,
      normalizeScreenName: normalizeScreenNameRuntime,
      applyTagGroupsFromTextarea: tagGroupsFeature.applyTagGroupsFromTextarea,
      applyCategoryMergeFromTextarea: categoryMergeFeature.applyCategoryMergeFromTextarea,
      applyManualUsdRatesFromTextarea: usdRatesFeature.applyManualUsdRatesFromTextarea,
      windowRef
    });
  }

  function init() {
    bindAppEvents();
    hydrateFilterInputsRuntime();
    hydrateTagGroupsInputsRuntime();
    hydrateCategoryMergeInputsRuntime();
    hydrateManualUsdRatesInputsRuntime();
    hydrateDisplayCurrencyButtonsRuntime();
    applyScreenRuntime(app.state.uiPrefs.activeScreen || core.SCREEN_DATA);
    render();
  }

  function recomputeDerivedAndRender() {
    app.state.rowsById = core.recomputeDerivedRows(
      app.state.rowsById,
      app.state.tagGroupsText,
      app.state.categoryMergeRulesText,
      app.state.manualUsdRatesText
    );
    render();
  }

  return {
    core,
    app,
    elements,
    init,
    render,
    saveState,
    setStatus,
    recomputeDerivedAndRender
  };
}

export function startExpenseApp(options) {
  const runtime = createAppRuntime(options);
  runtime.init();

  const windowRef = options?.windowRef || globalThis.window;
  if (windowRef?.addEventListener) {
    windowRef.addEventListener('beforeunload', () => {
      runtime.saveState();
    });
  }

  if (windowRef) {
    windowRef.debugExpenseApp = {
      getState() {
        return runtime.app.state;
      },
      recompute() {
        runtime.recomputeDerivedAndRender();
      },
      showVisibleRows() {
        return runtime.app.currentRows.map((row) => {
          const effective = runtime.core.computeEffectiveRow(row.source, row.overrides);
          return {
            id: row.id,
            date: runtime.core.displayDateTime(effective.date),
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
  }

  return runtime;
}
