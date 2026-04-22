import { ArcElement, Chart, Legend, PieController, Tooltip } from 'chart.js';
import * as core from './core.js';
import { startExpenseApp } from './app/bootstrap.js';
import { createChartsUi } from './ui/ui-charts.js';
import { escapeAttribute, escapeHtml, formatFinalCategoryHtml } from './ui/ui-formatters.js';
import { createImportExportUi } from './ui/ui-import-export.js';
import {
  loadState,
  persistStateWithFallback,
  saveState as saveStateToStorage
} from './ui/ui-storage.js';
import { createTableUi } from './ui/ui-table.js';

Chart.register(PieController, ArcElement, Tooltip, Legend);

startExpenseApp({
  core,
  createChartsUi,
  createImportExportUi,
  createTableUi,
  escapeAttribute,
  escapeHtml,
  formatFinalCategoryHtml,
  loadState,
  persistStateWithFallback,
  saveStateToStorage
});
