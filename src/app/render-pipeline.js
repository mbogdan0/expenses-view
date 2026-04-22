export function createRenderPipeline({
  app,
  elements,
  core,
  tableUi,
  chartsUi,
  hydrateDisplayCurrencyButtons,
  renderCategoryMergePanel,
  renderManualUsdRatesPanel,
  renderUsdCoverageWarnings,
  buildUsdCoverageModel
}) {
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

  return {
    render,
    getChartRows
  };
}
