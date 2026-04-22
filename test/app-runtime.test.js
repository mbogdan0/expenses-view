import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppRuntime } from '../src/app/bootstrap.js';
import * as core from '../src/core.js';

function createElementStub() {
  const listeners = new Map();

  return {
    value: '',
    checked: false,
    disabled: false,
    textContent: '',
    innerHTML: '',
    dataset: {},
    files: [],
    classList: {
      toggle() {}
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    trigger(type, event = {}) {
      const handler = listeners.get(type);
      if (!handler) {
        return;
      }
      handler({ target: this, ...event });
    }
  };
}

function createDocumentStub() {
  const byId = new Map();
  const screenTabs = [
    createElementStub(),
    createElementStub(),
    createElementStub()
  ];
  screenTabs[0].dataset.screen = core.SCREEN_DATA;
  screenTabs[1].dataset.screen = core.SCREEN_CHARTS;
  screenTabs[2].dataset.screen = core.SCREEN_FX_RATES;

  return {
    getElementById(id) {
      if (!byId.has(id)) {
        byId.set(id, createElementStub());
      }
      return byId.get(id);
    },
    querySelectorAll(selector) {
      if (selector === '.screen-tab') {
        return screenTabs;
      }
      return [];
    },
    screenTabs
  };
}

test('app runtime init + screen switch + render does not throw', () => {
  const documentRef = createDocumentStub();
  const windowRef = {
    addEventListener() {},
    confirm() {
      return true;
    }
  };

  const runtime = createAppRuntime({
    core,
    documentRef,
    windowRef,
    createChartsUi: () => ({
      renderCharts() {}
    }),
    createImportExportUi: () => ({
      importFromPicker: async () => {},
      exportDbSnapshot() {},
      importDbSnapshotFromPicker: async () => {},
      resetLocalData() {}
    }),
    createTableUi: () => ({
      onRowsBodyChange() {},
      onSelectVisibleRowsChange() {},
      runBulkTagMutation() {},
      getVisibleRows() {
        return [];
      },
      syncSelectionWithVisibleRows() {},
      buildTagGroupPreviewLabel() {
        return 'Group';
      },
      renderBulkTagControls() {},
      renderTagGroupsPanel() {},
      updateSelectionUi() {},
      renderDataTable() {},
      applyExtraColumnsVisibility() {}
    }),
    escapeAttribute: (value) => String(value ?? ''),
    escapeHtml: (value) => String(value ?? ''),
    formatFinalCategoryHtml: (value) => String(value ?? ''),
    loadState: () => core.createEmptyState(),
    persistStateWithFallback: () => ({ ok: true, level: 0 }),
    saveStateToStorage: () => {}
  });

  assert.doesNotThrow(() => {
    runtime.init();
  });

  assert.doesNotThrow(() => {
    documentRef.screenTabs[1].trigger('click');
  });

  assert.doesNotThrow(() => {
    runtime.render();
  });
});
