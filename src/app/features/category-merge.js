export function createCategoryMergeFeature({
  app,
  elements,
  core,
  escapeHtml,
  saveState,
  render
}) {
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

  return {
    applyCategoryMergeFromTextarea,
    renderCategoryMergePanel
  };
}
