import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  PieController,
  Tooltip
} from 'chart.js';
import * as core from './core.js';
import { startExpenseApp } from './app/bootstrap.js';
import { createChartsUi } from './ui/ui-charts.js';
import { escapeAttribute, escapeHtml, formatFinalCategoryHtml } from './ui/ui-formatters.js';
import { createImportExportUi } from './ui/ui-import-export.js';
import { createMonthlyUi } from './ui/ui-monthly.js';
import {
  loadState,
  persistStateWithFallback,
  saveState as saveStateToStorage
} from './ui/ui-storage.js';
import { createTableUi } from './ui/ui-table.js';

Chart.register(
  PieController,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

startExpenseApp({
  core,
  createChartsUi,
  createImportExportUi,
  createMonthlyUi,
  createTableUi,
  escapeAttribute,
  escapeHtml,
  formatFinalCategoryHtml,
  loadState,
  persistStateWithFallback,
  saveStateToStorage
});
