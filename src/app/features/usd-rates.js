export function createUsdRatesFeature({
  app,
  elements,
  core,
  escapeHtml,
  saveState,
  render
}) {
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

  return {
    applyManualUsdRatesFromTextarea,
    buildUsdCoverageModel,
    renderManualUsdRatesPanel,
    renderUsdCoverageWarnings
  };
}
