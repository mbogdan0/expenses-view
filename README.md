# Expense Single-HTML Consolidator

A local-first browser app that imports multiple expense CSV files, deduplicates rows by immutable source identity, preserves manual edits in `localStorage`, and visualizes totals in UAH.

## Features

- Multi-file CSV import (`Date,Category,Price,Currency,Rate,Rate Type,Notes,Image`)
- Stable dedup key: `sourceDate + sourceFullCategory + sourcePrice`
- `sourceFullCategory = <filename_without_ext> / <category_from_row>`
- Manual inline editing for row fields and comma-separated multi-tags
- Re-import safety: manual edits survive repeated imports
- UAH conversion with nearest-date same-currency rate fallback
- Red-highlight unresolved rows (excluded from UAH totals/charts)
- Optional source/rate columns can be toggled on demand
- Three screens: Data, Charts, and Data Ops
- Data Ops includes CSV import, DB JSON export, and DB JSON import with overwrite confirmation
- Single self-contained HTML output (works with `file://` and HTTP server)

## Scripts

- `npm install`
- `npm run dev` - local server with rebuild-on-change
- `npm run build` - outputs `dist/expense-consolidator.html`
- `npm test` - deterministic core logic tests

## Output

The build artifact is:

- `dist/expense-consolidator.html`

Open it directly or serve it over HTTP.
