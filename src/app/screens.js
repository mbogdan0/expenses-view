export function normalizeScreenName(core, screenName) {
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

export function applyScreen(elements, core, screenName) {
  const selected = normalizeScreenName(core, screenName);

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
