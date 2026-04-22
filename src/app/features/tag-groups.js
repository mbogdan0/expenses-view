export function createTagGroupsFeature({ app, elements, core, saveState, render }) {
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

  return {
    applyTagGroupsFromTextarea
  };
}
