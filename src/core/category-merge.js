import { isPlainObject, sanitizeText } from './primitives.js';

const QUOTED_SEMICOLON_CSV_PATTERN =
  /^\s*"(?:[^"]|"")*"\s*(?:;\s*"(?:[^"]|"")*"\s*)*$/;

function isCategoryMergeModel(value) {
  return (
    isPlainObject(value) &&
    Array.isArray(value.rules) &&
    Array.isArray(value.issues) &&
    value.childToMaster instanceof Map
  );
}

function isCategoryMergeRuntime(value) {
  return (
    isCategoryMergeModel(value) &&
    value.activeChildToMaster instanceof Map &&
    value.missingMasterByChild instanceof Map &&
    Array.isArray(value.missingMasters)
  );
}

function parseQuotedSemicolonCsvLine(line) {
  const input = String(line ?? '');
  if (!QUOTED_SEMICOLON_CSV_PATTERN.test(input)) {
    return {
      ok: false,
      error:
        'Expected semicolon CSV with quoted values, for example: "Master";"Child A";"Child B".'
    };
  }

  const values = [];
  const matcher = /"((?:[^"]|"")*)"/g;
  for (const match of input.matchAll(matcher)) {
    values.push(match[1].replace(/""/g, '"'));
  }

  if (!values.length) {
    return {
      ok: false,
      error:
        'Expected semicolon CSV with quoted values, for example: "Master";"Child A";"Child B".'
    };
  }

  return {
    ok: true,
    values
  };
}

function issueWithLine(type, lineIndex, message, extra = {}) {
  return {
    type,
    lineIndex,
    lineNumber: lineIndex + 1,
    message,
    ...extra
  };
}

export function parseCategoryMergeRulesText(value) {
  const rawText = String(value ?? '');
  const lines = rawText.split(/\r?\n/);
  const rules = [];
  const issues = [];
  const childToMaster = new Map();
  const childFirstLine = new Map();
  let appliedMappingsCount = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmedLine = sanitizeText(line);
    if (!trimmedLine) {
      continue;
    }

    const parsedLine = parseQuotedSemicolonCsvLine(trimmedLine);
    if (!parsedLine.ok) {
      issues.push(issueWithLine('invalid_csv_format', lineIndex, `Line ${lineIndex + 1}: ${parsedLine.error}`));
      continue;
    }

    if (parsedLine.values.length < 2) {
      issues.push(
        issueWithLine(
          'missing_children',
          lineIndex,
          `Line ${lineIndex + 1} is invalid. Add one master and at least one child category.`
        )
      );
      continue;
    }

    const master = sanitizeText(parsedLine.values[0]);
    if (!master) {
      issues.push(
        issueWithLine(
          'missing_master',
          lineIndex,
          `Line ${lineIndex + 1} is invalid. Master category cannot be empty.`
        )
      );
      continue;
    }

    const rule = {
      index: rules.length,
      lineIndex,
      lineNumber: lineIndex + 1,
      master,
      children: [],
      effectiveChildren: []
    };
    const seenChildren = new Set();

    for (let valueIndex = 1; valueIndex < parsedLine.values.length; valueIndex += 1) {
      const child = sanitizeText(parsedLine.values[valueIndex]);
      if (!child) {
        issues.push(
          issueWithLine(
            'empty_child',
            lineIndex,
            `Line ${lineIndex + 1} has an empty child category at position ${valueIndex + 1}.`
          )
        );
        continue;
      }

      if (child === master) {
        issues.push(
          issueWithLine(
            'child_equals_master',
            lineIndex,
            `Line ${lineIndex + 1} has child category "${child}" equal to its master category.`
          )
        );
        continue;
      }

      if (seenChildren.has(child)) {
        issues.push(
          issueWithLine(
            'duplicate_child_in_line',
            lineIndex,
            `Line ${lineIndex + 1} has duplicate child category "${child}".`
          )
        );
        continue;
      }

      seenChildren.add(child);
      rule.children.push(child);

      if (childToMaster.has(child)) {
        const firstMaster = childToMaster.get(child);
        const firstLine = childFirstLine.get(child) || 0;
        issues.push(
          issueWithLine(
            'child_conflict',
            lineIndex,
            `Line ${lineIndex + 1} is ignored for "${child}" because it was already mapped to "${firstMaster}" on line ${firstLine}.`,
            {
              child,
              firstMaster,
              firstLine
            }
          )
        );
        continue;
      }

      childToMaster.set(child, master);
      childFirstLine.set(child, lineIndex + 1);
      rule.effectiveChildren.push(child);
      appliedMappingsCount += 1;
    }

    if (!rule.children.length) {
      issues.push(
        issueWithLine(
          'missing_children',
          lineIndex,
          `Line ${lineIndex + 1} is invalid. Add at least one child category.`
        )
      );
      continue;
    }

    rules.push(rule);
  }

  return {
    rawText,
    rules,
    issues,
    isValid: issues.length === 0,
    hasRules: rules.length > 0,
    childToMaster,
    appliedMappingsCount
  };
}

export function ensureCategoryMergeModel(categoryMergeInput) {
  if (isCategoryMergeModel(categoryMergeInput)) {
    return categoryMergeInput;
  }
  return parseCategoryMergeRulesText(categoryMergeInput);
}

function toCategorySet(categories) {
  const output = new Set();
  const input = categories instanceof Set ? Array.from(categories) : Array.from(categories || []);

  for (const category of input) {
    const normalized = sanitizeText(category);
    if (!normalized) {
      continue;
    }
    output.add(normalized);
  }

  return output;
}

export function buildCategoryMergeRuntime(categoryMergeInput, existingCategories = []) {
  const model = ensureCategoryMergeModel(categoryMergeInput);
  const availableCategories = toCategorySet(existingCategories);
  const activeChildToMaster = new Map();
  const missingMasterByChild = new Map();
  const missingMasters = [];

  for (const rule of model.rules) {
    if (!rule.effectiveChildren.length) {
      continue;
    }

    if (!availableCategories.has(rule.master)) {
      missingMasters.push({
        lineIndex: rule.lineIndex,
        lineNumber: rule.lineNumber,
        master: rule.master,
        children: [...rule.effectiveChildren],
        message: `Line ${rule.lineNumber}: master category "${rule.master}" was not found in current Final Category values.`
      });

      for (const child of rule.effectiveChildren) {
        if (!missingMasterByChild.has(child)) {
          missingMasterByChild.set(child, rule.master);
        }
      }
      continue;
    }

    for (const child of rule.effectiveChildren) {
      activeChildToMaster.set(child, rule.master);
    }
  }

  return {
    ...model,
    availableCategories,
    activeChildToMaster,
    missingMasterByChild,
    missingMasters,
    hasMissingMasters: missingMasters.length > 0
  };
}

export function ensureCategoryMergeRuntime(categoryMergeInput, existingCategories = []) {
  if (isCategoryMergeRuntime(categoryMergeInput)) {
    return categoryMergeInput;
  }
  return buildCategoryMergeRuntime(categoryMergeInput, existingCategories);
}

export function resolveCategoryMerge(fullCategory, categoryMergeRuntime) {
  const baseFullCategory = sanitizeText(fullCategory);
  const runtime = isCategoryMergeRuntime(categoryMergeRuntime) ? categoryMergeRuntime : null;

  if (!baseFullCategory || !runtime) {
    return {
      baseFullCategory,
      fullCategory: baseFullCategory,
      categoryMergeStatus: 'none',
      categoryMergeMaster: null
    };
  }

  const missingMaster = runtime.missingMasterByChild.get(baseFullCategory);
  if (missingMaster) {
    return {
      baseFullCategory,
      fullCategory: baseFullCategory,
      categoryMergeStatus: 'master_missing',
      categoryMergeMaster: missingMaster
    };
  }

  const mappedMaster = runtime.activeChildToMaster.get(baseFullCategory);
  if (mappedMaster) {
    return {
      baseFullCategory,
      fullCategory: mappedMaster,
      categoryMergeStatus: 'merged',
      categoryMergeMaster: mappedMaster
    };
  }

  return {
    baseFullCategory,
    fullCategory: baseFullCategory,
    categoryMergeStatus: 'none',
    categoryMergeMaster: null
  };
}

export function applyCategoryMergeToEffectiveRow(effectiveRow, categoryMergeRuntime) {
  const merge = resolveCategoryMerge(effectiveRow?.baseFullCategory || effectiveRow?.fullCategory, categoryMergeRuntime);

  return {
    ...effectiveRow,
    baseFullCategory: merge.baseFullCategory,
    fullCategory: merge.fullCategory,
    categoryMergeStatus: merge.categoryMergeStatus,
    categoryMergeMaster: merge.categoryMergeMaster
  };
}
