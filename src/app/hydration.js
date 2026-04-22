export function hydrateFilterInputs(app, elements) {
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

export function hydrateTagGroupsInputs(app, elements) {
  if (elements.tagGroupsTextarea) {
    elements.tagGroupsTextarea.value = app.state.tagGroupsText || '';
  }
}

export function hydrateCategoryMergeInputs(app, elements) {
  if (elements.categoryMergeTextarea) {
    elements.categoryMergeTextarea.value = app.state.categoryMergeRulesText || '';
  }
}

export function hydrateManualUsdRatesInputs(app, elements) {
  if (elements.manualUsdRatesTextarea) {
    elements.manualUsdRatesTextarea.value = app.state.manualUsdRatesText || '';
  }
}

export function hydrateDisplayCurrencyButtons(app, elements, core) {
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
