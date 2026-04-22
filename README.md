# Expense Export Parser

Parser and local-first consolidator for CSV exports produced by [Expenses & Spending Tracker](https://apps.apple.com/us/app/expenses-spending-tracker/id1492055171).

## What It Does

- Imports multiple CSV files and merges records with stable deduplication.
- Preserves manual edits and tags in local storage.
- Converts to UAH, highlights unresolved rows, and shows category/tag charts.
- Produces a single self-contained HTML app.

## Quick Start

```bash
npm install
npm run build
npm run dev
npm test
```

## Build Output

- `dist/expense-consolidator.html`

## GitHub Pages

- After enabling Pages in the repository, the app is published from GitHub Actions.
- Site URL pattern: `https://<owner>.github.io/<repository>/`

## Disclaimer

This project is not affiliated with or endorsed by the developer of Expenses & Spending Tracker.
