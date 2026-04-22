export function bindEvents({
  app,
  core,
  elements,
  importExportUi,
  tableUi,
  saveState,
  render,
  hydrateFilterInputs,
  hydrateDisplayCurrencyButtons,
  applyScreen,
  normalizeScreenName,
  applyTagGroupsFromTextarea,
  applyCategoryMergeFromTextarea,
  applyManualUsdRatesFromTextarea,
  windowRef = window
}) {
  elements.importButton.addEventListener('click', () => {
    void importExportUi.importFromPicker();
  });

  elements.resetButton.addEventListener('click', () => {
    const ok = windowRef.confirm('Clear all stored rows and import history from local storage?');
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
}
