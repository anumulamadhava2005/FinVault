# ASSETS_GAP_ANALYSIS.md
# FinVault — Assets Feature: Mobile Migration Gap Analysis

> **Source of truth for browser implementation:** `src/screens/ASSETS_FEATURE_ANALYSIS.md`
> **Mobile codebase root:** `E:\FinVault\src\`
> **Analysis date:** 2026-06-19

---

# 1. Mobile Assets Architecture

## 1.1 Existing Assets Files

### `src/screens/AssetsScreen.tsx`
- **Purpose:** Single monolithic screen for the entire Assets feature. Renders the portfolio KPI bar, allocation doughnut chart, benchmark bar chart, holdings list, add-asset dialog, and delete confirmation dialog.
- **Inputs:** `userId` from `AppContext`; reactive to `refreshKey` via `useData`.
- **Outputs:** Rendered screen with all UI. Writes to SQLite on save/delete via `insert`/`remove`.
- **Dependencies:** `AppContext`, `useData`, `db/index`, `models/types`, `services/finance`, `components/ui`, `components/charts`, `theme`, `utils/money`, `utils/date`.
- **Gaps:** No edit, no detail view, no SIP, no price refresh, no type filter tabs, no type-specific form fields.

### `src/app/assets.tsx`
- **Purpose:** Expo Router entry point — re-exports `AssetsScreen` as the default export.
- **Inputs:** None.
- **Outputs:** `default export AssetsScreen`.
- **Dependencies:** `screens/AssetsScreen`.

## 1.2 Existing Components (Assets-related)

### `src/components/charts.tsx`
- **Purpose:** Shared chart primitives used on Assets and other screens.
- **Inputs:** Typed props (labels, series, data arrays).
- **Outputs:** Rendered chart Views.
- **Dependencies:** `react-native-chart-kit` (`LineChart`, `PieChart`), `react-native-paper`, `react-native`.
- **Exports used by Assets:** `DistributionPie` (allocation doughnut), `GroupedBars` (benchmark bar), `TrendLine` (line chart — not yet used in AssetsScreen).

### `src/components/ui.tsx`
- **Purpose:** Generic presentational building blocks used across all screens.
- **Inputs:** Typed props per component.
- **Outputs:** Rendered Views.
- **Dependencies:** `react-native-paper`, `@expo/vector-icons`, `theme`, `utils/money`.
- **Exports used by Assets:** `Screen`, `SectionCard`, `Kpi`, `Row`, `EmptyState`.
- **Assets-specific gaps:** No `AssetRow`, `AssetTypeTabs`, `AssetForm`, `SIPModal`, `PerformanceChart`, `BulkUploadModal`.

## 1.3 Existing Hooks

### `src/hooks/useData.ts`
- **Purpose:** Re-runs a synchronous SQLite query on focus and on `refreshKey` change.
- **Inputs:** `() => T` synchronous query function.
- **Outputs:** `T` (current query result).
- **Dependencies:** `expo-router` (`useFocusEffect`), `AppContext`.
- **Assets usage:** Used five times in `AssetsScreen` to load `user`, `assetTypes`, `assets`, `pf`, `bench`.

## 1.4 Existing Services

### `src/services/finance.ts` — `portfolioSummary()`
- **Purpose:** Aggregates all user assets from SQLite and returns total_invested, total_value, total_pnl, pnl_pct, asset_count, allocation array.
- **Inputs:** `userId: string`.
- **Outputs:** `{ total_invested, total_value, total_pnl, pnl_pct, asset_count, allocation: AllocationRow[] }`.
- **Dependencies:** `db/index` (`all`), `models/types` (Asset), `utils/money` (`pct`), `services/constants`.
- **Gap vs browser:** Missing `monthly_sip` field (sum of `sip_monthly_amount` where `is_sip = true`). Missing `active_sips` count.

### `src/services/finance.ts` — `benchmarkComparison()`
- **Purpose:** Compares actual portfolio allocation % against risk-profile benchmark.
- **Inputs:** `userId: string`, `riskProfile: string`.
- **Outputs:** `{ rows: [{type, actual, recommended}], drift: number, risk_profile: string }`.
- **Dependencies:** `portfolioSummary()`, `services/constants` (`BENCH_CLASS`, `BENCHMARKS`).
- **Gap vs browser:** Functionally equivalent to `services.py benchmark_comparison()`. No gap in logic.

### `src/services/constants.ts`
- **Purpose:** Domain constants: loan types, policy types, goal types, frequency map, benchmark allocations, equity/liquid type sets.
- **Inputs:** None (pure constants).
- **Outputs:** Exported constant objects.
- **Assets-relevant exports:** `BENCHMARKS`, `BENCH_CLASS`, `EQUITY_TYPES`, `LIQUID_TYPES`.
- **Gap:** No `ASSET_TYPE_KEY_MAP`, no `SIP_ELIGIBLE_TYPES`, no `ASSET_CONFIGS` (per-type field definitions).

## 1.5 Existing APIs
None. The mobile app has no HTTP API layer. All data is read/written directly to local SQLite via `src/db/index.ts`. There are no Axios/fetch calls, no API client, and no backend communication of any kind.

## 1.6 Existing State Management

### `src/context/AppContext.tsx`
- **Purpose:** Minimal global context providing `userId`, `refreshKey`, `refresh()`, `themeMode`, `isDark`.
- **Refresh model:** `refresh()` increments `refreshKey`; `useData` hooks re-query on every focus + every `refreshKey` change.
- **Gap:** No Zustand store, no React Query, no asset-specific cache, no loading/error state per-operation.

### `src/db/index.ts`
- **Purpose:** Synchronous SQLite wrapper (`expo-sqlite`). Exports `all`, `first`, `run`, `insert`, `update`, `remove`, `tx`, `newId`, `initDb`.
- **Gap:** No async query path, no optimistic updates, no offline queue.

## 1.7 Existing Navigation Structure

Navigation uses Expo Router file-based drawer (`src/app/_layout.tsx`):
```
Drawer Navigator
├── index      → DashboardScreen
├── assets     → AssetsScreen          ← single flat screen (no stack)
├── expenses   → ExpensesScreen
├── loans      → LoansScreen
├── protect    → ProtectScreen
├── goals      → GoalsScreen
├── vault      → VaultScreen
├── reports    → ReportsScreen
└── settings   → SettingsScreen
```
**Gap:** No stack navigator under Assets. No `AssetDetailScreen`, `EditAssetScreen`, `AddAssetScreen` routes. No modal presentation for SIP or Bulk Upload.

## 1.8 Existing Schema (Assets-relevant tables)

### `assets` table (from `src/db/schema.ts`)
Current columns: `id`, `user_id`, `asset_type_id`, `name`, `invested_amount`, `current_value`, `quantity`, `purchase_date`, `notes`, `created_at`.

**Missing vs browser `models.py` Asset:**
- `isin TEXT` — ISIN code for mutual funds, equity, SGB
- `ticker TEXT` — exchange ticker symbol
- `is_sip INTEGER` — boolean flag (1 = active SIP)
- `sip_monthly_amount INTEGER` — paise, SIP installment amount
- `current_nav INTEGER` — paise per unit/share/gram (refreshed by price update)
- `price_per_unit INTEGER` — paise, purchase price per unit
- `investment_date TEXT` — browser uses `investment_date`; mobile uses `purchase_date` (naming mismatch)
- `maturity_date TEXT` — ISO date (FD, SGB, PPF)
- `guaranteed_return_pct REAL` — interest/coupon rate % (FD, SGB, PPF)
- `details_json TEXT` — JSON blob for type-specific fields (area, location, purity, account_no, nominee)

### `asset_types` table
Current seed slugs (5 types): `mutual_fund`, `equity`, `fd`, `gold`, `real_estate`.

**Missing vs browser's 8 types:**
- `digital_gold` — Digital Gold (separate from physical)
- `physical_gold` — Physical Gold (with purity, weight)
- `sgb` — Sovereign Gold Bond
- `ppf` — Public Provident Fund

**Mobile seed uses `gold` as a merged type; browser treats Digital Gold, Physical Gold, and SGB as separate types with distinct form fields and price-refresh logic.**

### `sip_schedules` table
Current columns: `id`, `user_id`, `asset_id`, `amount`, `frequency`, `next_due_date`, `status`.

**Missing vs browser `SIPSchedule`:**
- `day_of_month INTEGER` — day of month (1–28) for SIP debit
- `annual_step_up_pct REAL` — annual SIP step-up percentage
- `start_date TEXT` — SIP start date
- `end_date TEXT` — SIP end date (NULL = indefinite)
- `linked_bank TEXT` — linked bank account / source description

### Missing table: `asset_images`
Browser has `AssetImage` table for optional physical gold photos. Mobile schema has no such table.
Required columns: `id TEXT`, `user_id TEXT`, `asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE`, `image_path TEXT`, `mime_type TEXT`, `created_at TEXT`.

## 1.9 Existing Types (Assets-relevant)

### `src/models/types.ts` — `Asset` interface
Current fields: `id`, `user_id`, `asset_type_id`, `name`, `invested_amount`, `current_value`, `quantity`, `purchase_date`, `notes`, `created_at`.
**Missing:** `isin`, `ticker`, `is_sip`, `sip_monthly_amount`, `current_nav`, `price_per_unit`, `investment_date`, `maturity_date`, `guaranteed_return_pct`, `details_json`.

### `src/models/types.ts` — `SIPSchedule` interface
Current fields: `id`, `user_id`, `asset_id`, `amount`, `frequency`, `next_due_date`, `status`.
**Missing:** `day_of_month`, `annual_step_up_pct`, `start_date`, `end_date`, `linked_bank`.

### Missing interface: `AssetImage`
### Missing interface: `AssetDetail` (parsed from `details_json`)
### Missing interface: `PortfolioSummaryResult` extended with `monthly_sip`, `active_sips`
### Missing interface: `AssetTypeConfig` / `FieldDef` / `SectionDef`

---

# 2. Feature Parity Matrix

## Feature 1: Portfolio Summary — 4 KPIs

**Browser Implementation:** `pf` dict from `services.portfolio_summary()` → `list.html` lines 22–29. Displays: Total Portfolio Value, Total Invested, Total Returns (₹ + %), Monthly SIP.
**Mobile Implementation:** `portfolioSummary()` in `finance.ts`; rendered in `AssetsScreen.tsx` lines 72–75. Displays: Portfolio Value, Invested, P&L (₹ + %).
**Current Status:** Partially Implemented — 3 of 4 KPIs shown.
**Classification:** Partially Implemented
**Why:** `portfolioSummary()` does not compute `monthly_sip`. The `assets` table lacks `is_sip` and `sip_monthly_amount` columns. The Kpi row shows 3 cards, not 4.

---

## Feature 2: Asset List / Holdings Table

**Browser Implementation:** `<table>` in `list.html` lines 58–90. Columns: Name (with SIP chip + ISIN/ticker), Type chip, Invested On date, Qty, Invested, Current, P&L (₹ + %), Actions (View, SIP, Edit, Delete).
**Mobile Implementation:** `assets.map()` card list in `AssetsScreen.tsx` lines 100–118. Shows: name, type_name, Invested, Current, P&L.
**Current Status:** Partially Implemented.
**Classification:** Partially Implemented
**Why:** Missing SIP badge, ISIN/ticker sub-line, quantity display, investment date, type chip (only text label), Edit button, View/Detail button, Configure SIP button. Asset name is not tappable for detail view.

---

## Feature 3: Asset Type Filter Tabs

**Browser Implementation:** `div.tabs` in `list.html` lines 52–55. "All" tab + 8 type tabs, each a navigation link to `/assets?type=<slug>`. Active tab highlighted. Doughnut chart updates to show per-type distribution.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No tab bar component, no type filter state, no filtered asset query, no type-specific allocation drilldown.

---

## Feature 4: Add Asset Modal — Generic

**Browser Implementation:** `div.modal-overlay` in `list.html` lines 112–136. POST `/assets`. Renders dynamic fields via `renderAssetFields()` from `assetConfigs` JS object. 8 type-specific field sets.
**Mobile Implementation:** `Dialog` in `AssetsScreen.tsx` lines 125–151. Only 5 generic fields: name, type dropdown, invested (₹), current (₹), quantity.
**Current Status:** Partially Implemented.
**Classification:** Partially Implemented
**Why:** The add dialog exists but only captures the 5 most basic fields. All type-specific fields are absent. No date pickers, no image picker, no SIP fields, no equity auto-compute.

---

## Feature 5: Add Asset — Type-Specific Dynamic Fields (8 types)

**Browser Implementation:** `assetConfigs` JS object in `list.html` lines 285–377. `renderAssetFields()` re-renders the form section on type change. 8 distinct field sets (mutual_fund, equity, sgb, real_estate, digital_gold, physical_gold, fd, ppf).
**Mobile Implementation:** None. The type dropdown changes the label but not the form fields.
**Current Status:** Missing.
**Classification:** Missing
**Why:** `AssetTypeFieldConfig.ts` does not exist. No conditional rendering of type-specific inputs.

---

## Feature 6: Edit Asset Modal

**Browser Implementation:** `div.modal-overlay` `x-show="showEdit"` in `list.html` lines 140–157. Pre-fills all fields from `window.ASSETS[id]`. POST `/assets/{id}/update`.
**Mobile Implementation:** None. There is no edit button on any asset row. `update()` from `db/index.ts` exists but is never called for assets.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No edit button, no edit dialog, no pre-fill logic, no update DB call for assets.

---

## Feature 7: Asset Detail Drawer / Screen

**Browser Implementation:** Right-side drawer in `list.html` lines 160–203. Shows: name, type chip, performance chart, key metrics grid (invested, current, return, CAGR, holding since), SIP status, type-specific detail fields, photo, notes, Edit/SIP/Delete actions.
**Mobile Implementation:** None. Tapping an asset name does nothing.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No `AssetDetailScreen`, no bottom sheet, no drawer. No `PerformanceChart`, no CAGR calculation, no detail rendering.

---

## Feature 8: SIP Configuration Modal

**Browser Implementation:** `_sip_modal.html` partial + `openSip()` Alpine method. Fetches `GET /assets/{id}/sip`, shows SIP form (amount, day, frequency, step-up %, start/end dates, linked bank, status). POST `/assets/{id}/sip`.
**Mobile Implementation:** None. `SIPSchedule` table exists in schema but there is no UI to create, read, update, or display SIP schedules in the Assets screen.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No `SIPModal` component, no `useSIPConfig` hook, `sip_schedules` table missing 5 of its required columns, no SIP button anywhere in AssetsScreen.

---

## Feature 9: Refresh Prices Button

**Browser Implementation:** "Refresh Prices" button in header → form POST `/assets/refresh-prices` → `services.refresh_asset_prices()` updates `current_value` and `current_nav` for equity, MF, gold in DB → redirect with flash message.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No refresh button, no price refresh service, no Yahoo Finance calls, no AMFI calls. Mobile is offline-only with local SQLite.

---

## Feature 10: Yahoo Finance Integration — Equity Prices

**Browser Implementation:** `market_data.py equity_price()` → `GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d` → `meta.regularMarketPrice`. Auto-appends `.NS` if no exchange suffix. Soft-fails on error.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No HTTP client, no Yahoo Finance fetch, no `.NS` suffix logic, no price update path.

---

## Feature 11: Yahoo Finance Integration — Equity Name Lookup

**Browser Implementation:** `market_data.equity_name()` → `GET /assets/lookup/equity?ticker=X` → JSON `{ticker, name, price}`. 24h TTL cache. Used by `wireEquityAuto()` on ticker field blur to auto-fill the asset name input.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No API call, no debounce hook, no auto-fill logic in add form.

---

## Feature 12: Yahoo Finance Integration — Gold Price (GC=F × INR=X)

**Browser Implementation:** `market_data.gold_per_gram_inr()` → two Yahoo Finance calls: `GC=F` (gold futures USD/troy oz) and `INR=X` (USD-INR rate) → `usd_oz × usd_inr / 31.1035`. 30-minute TTL cache. Updates Digital Gold and SGB assets.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No Yahoo Finance calls, no gold calculation, no price update for gold-type assets.

---

## Feature 13: AMFI NAV Integration — Mutual Fund Prices

**Browser Implementation:** `market_data.mf_nav(isin)` → `GET https://www.amfiindia.com/spages/NAVAll.txt` → parse semicolon-delimited plain text → dict `ISIN → float NAV`. 1-hour TTL cache.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No HTTP call to AMFI, no NAV map parsing, no mutual fund price update logic.

---

## Feature 14: Allocation Doughnut Chart

**Browser Implementation:** `canvas#allocChart` initialized by Chart.js in `list.html` lines 270–276. Data: `alloc_items` from `portfolio_summary()`. 8-color palette. Inline legend. Updates when type filter tab changes.
**Mobile Implementation:** `DistributionPie` in `AssetsScreen.tsx` line 79. Powered by `react-native-chart-kit` `PieChart`. Correct 8-color palette `PIE`. Shown only when `pf.allocation.length > 0`.
**Current Status:** Partially Implemented.
**Classification:** Partially Implemented
**Why:** Base allocation chart works. Missing: per-type drilldown when a type filter tab is active. Missing: inline legend beside chart (chart-kit renders its own). Missing: "Add assets to see allocation." empty state inside the chart wrapper.

---

## Feature 15: Benchmark Bar Chart (actual vs recommended)

**Browser Implementation:** `canvas#benchChart` Chart.js grouped bar in `list.html` lines 277–282. Data from `benchmark_comparison()`. Two series: Your % (green) vs Recommended % (orange).
**Mobile Implementation:** `GroupedBars` in `AssetsScreen.tsx` lines 85–93. Same two series. Functionally correct.
**Current Status:** Fully Implemented.
**Classification:** Fully Implemented
**Why:** The `GroupedBars` component and `benchmarkComparison()` service match the browser feature.

---

## Feature 16: Synthetic Performance Line Chart (Detail Drawer)

**Browser Implementation:** `canvas#assetPerfChart` in drawer, `renderPerf()` in `list.html` lines 579–598. Generates 8-point curve from `invested` to `current` with `Math.sin` wobble. Color green (up) or red (down).
**Mobile Implementation:** `TrendLine` component exists in `charts.tsx` but is never rendered in `AssetsScreen`. There is no detail screen to place it.
**Current Status:** Missing.
**Classification:** Missing
**Why:** `AssetDetailScreen` does not exist. No `renderPerf()`-equivalent synthetic data generator exists.

---

## Feature 17: CAGR Estimate

**Browser Implementation:** Client-side JS `cagr()` method in `list.html` lines 599–604: `((current/invested)^(1/max(days/365, 0.25)) - 1) × 100`. Displayed in detail drawer key metrics grid.
**Mobile Implementation:** None. No `cagr.ts` utility, no CAGR displayed anywhere.
**Current Status:** Missing.
**Classification:** Missing
**Why:** `cagr.ts` utility file does not exist. Detail screen does not exist to display it.

---

## Feature 18: Benchmark Drift Score Display

**Browser Implementation:** "Age-based Allocation Suggestion" card in `list.html` lines 93–108. Shows risk profile, user age, drift % (red if >30). `benchmark.drift` from `benchmark_comparison()`.
**Mobile Implementation:** `benchmarkComparison()` computes `drift` correctly but the value is never rendered in AssetsScreen. The benchmark section only shows the bar chart.
**Current Status:** Partially Implemented.
**Classification:** Partially Implemented
**Why:** Calculation is done (`bench.drift` is available); it is never rendered in the UI.

---

## Feature 19: Age-Based Allocation Suggestion Card

**Browser Implementation:** Card showing RECOMMENDED chip, user age (from `user.date_of_birth`), risk profile name, drift percentage with color coding.
**Mobile Implementation:** None. `user.date_of_birth` is in the schema and seed. `bench.risk_profile` is computed. Neither is rendered in the Assets screen.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No suggestion card component rendered in AssetsScreen.

---

## Feature 20: Bulk Upload — CSV

**Browser Implementation:** `div.modal-overlay` `x-show="showBulk"`, `list.html` lines 208–265. File input → `_csv()` client-side parser → column mapping UI → preview table → POST `/assets/bulk-upload`. 11 mappable columns.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No document picker, no CSV parser, no column mapping UI, no bulk upload POST.

---

## Feature 21: Bulk Upload — XLSX

**Browser Implementation:** XLSX file → step `'xlsx'` → form POST directly to `/assets/bulk-upload`. Server uses `openpyxl` for parsing.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing

---

## Feature 22: Download CSV Template

**Browser Implementation:** `GET /assets/import/template` → returns CSV file with example rows for all 11 importable columns.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing

---

## Feature 23: Asset Photo Upload

**Browser Implementation:** Physical Gold add/edit form includes a file input for an optional photo. Server stores via Pillow in `AssetImage` table. POST as multipart.
**Mobile Implementation:** None. No `asset_images` table, no image picker, no image upload.
**Current Status:** Missing.
**Classification:** Missing

---

## Feature 24: Asset Photo View

**Browser Implementation:** `<img :src="sel.image_url">` in detail drawer, shown if `sel.image_url` is non-empty.
**Mobile Implementation:** None.
**Current Status:** Missing.
**Classification:** Missing

---

## Feature 25: Notes Field (Add/Edit + Display)

**Browser Implementation:** Notes `<textarea>` in all 8 type form configs (optional). `sel.notes` displayed as `<pre>` in detail drawer.
**Mobile Implementation:** `notes` column exists in schema and `Asset` interface. The add dialog does not include a notes TextInput, and there is no detail screen to display it.
**Current Status:** Partially Implemented.
**Classification:** Partially Implemented
**Why:** Column and type exist; no UI to enter or display notes.

---

## Feature 26: Empty State

**Browser Implementation:** `empty_state` macro in `_empty_state.html`. Shows icon, title, description, "Add Your First Asset" button, "Bulk Upload" button.
**Mobile Implementation:** `EmptyState` component rendered in `AssetsScreen.tsx` lines 98–99 when `assets.length === 0`. Shows icon, title, message.
**Current Status:** Partially Implemented.
**Classification:** Partially Implemented
**Why:** Empty state renders. Missing: "Add First Asset" CTA button inside the empty state. Missing: "Bulk Upload" CTA.

---

## Feature 27: Toast Notifications

**Browser Implementation:** `FinVault.toast.success/error/warning/info()` in `app.js`. Used after price refresh, asset saved, etc.
**Mobile Implementation:** None. No toast library installed. Errors/success states are silently swallowed after mutations.
**Current Status:** Missing.
**Classification:** Missing
**Why:** No toast library installed. No error/success feedback after operations.

---

## Feature 28: Confirm Delete Dialog

**Browser Implementation:** `fvConfirmDelete` JS function — native browser `confirm()` dialog before form POST.
**Mobile Implementation:** `Dialog` in `AssetsScreen.tsx` lines 144–151 with Cancel and Delete buttons.
**Current Status:** Fully Implemented.
**Classification:** Fully Implemented

---

## Feature 29: Delete Asset Operation

**Browser Implementation:** Inline form POST `/assets/{id}/delete` → DB deletion → redirect.
**Mobile Implementation:** `remove('assets', confirmId)` in `doDelete()` — line 63. Calls `refresh()` after.
**Current Status:** Fully Implemented.
**Classification:** Fully Implemented

---

## Feature 30: Monthly SIP Total KPI

**Browser Implementation:** `pf.monthly_sip` = sum of `Asset.sip_monthly_amount` where `is_sip = true`. Displayed as 4th KPI card.
**Mobile Implementation:** Not in `portfolioSummary()`. Not rendered. `is_sip` and `sip_monthly_amount` columns don't exist in schema.
**Current Status:** Missing.
**Classification:** Missing
**Why:** Schema missing required columns; service missing the aggregation; UI missing the 4th KPI card.

---

## Feature 31: Per-Asset P&L Calculation

**Browser Implementation:** `Asset.pnl = current_value - invested_amount` (Python property). `Asset.pnl_pct = round(pnl / invested_amount * 100, 2)`.
**Mobile Implementation:** Inline in `AssetsScreen.tsx` line 101: `const pnl = a.current_value - a.invested_amount`. `pct(pnl, a.invested_amount)` from `utils/money.ts`.
**Current Status:** Fully Implemented.
**Classification:** Fully Implemented

---

## Feature 32: Allocation Percentage Calculation

**Browser Implementation:** `pct = round(type_total / portfolio_total * 100, 1)` in `services.py portfolio_summary()`.
**Mobile Implementation:** `pct: pct(v.value, total_value)` in `finance.ts portfolioSummary()` line 55.
**Current Status:** Fully Implemented.
**Classification:** Fully Implemented

---

# 3. UI Gap Analysis

## 3.1 Summary / KPI Bar

**Browser Source:** `div.summary-bar` in `list.html` lines 22–29. 4 stat cards.
**Mobile Equivalent:** `Row` of `Kpi` cards in `AssetsScreen.tsx` lines 72–75.
**Gap:** 4th KPI (Monthly SIP) missing entirely. Browser shows P&L in ₹ + % together; mobile shows `pnl_pct%` as value and `formatINRCompact(pf.total_pnl)` as sub — functionally equivalent but compact-formatted (₹1.2L instead of ₹1,20,000).
**Recommended Implementation:** Add `monthly_sip` to `portfolioSummary()` after adding `is_sip`/`sip_monthly_amount` to schema. Add 4th `Kpi` card: `label="Monthly SIP"` `value={formatINRCompact(pf.monthly_sip)}`.

---

## 3.2 Allocation Doughnut Chart

**Browser Source:** `canvas#allocChart` Chart.js doughnut, `list.html` lines 36–42. Inline HTML legend beside canvas. Per-type drilldown when filter tab active.
**Mobile Equivalent:** `DistributionPie` in `AssetsScreen.tsx` line 79. `react-native-chart-kit` PieChart.
**Gap:** (1) No per-type drilldown (requires `activeTypeSlug` state + filtered allocation). (2) No "Add assets to see allocation." inside chart wrapper when `pf.allocation.length === 0` — whole SectionCard is hidden instead.
**Recommended Implementation:** Keep `DistributionPie` but pass `activeTypeSlug`-filtered allocation when a type tab is selected. Add empty state text inside the Allocation `SectionCard` when `pf.allocation.length === 0`.

---

## 3.3 Benchmark Bar Chart

**Browser Source:** `canvas#benchChart` Chart.js grouped bar, `list.html` lines 44–48.
**Mobile Equivalent:** `GroupedBars` in `AssetsScreen.tsx` lines 85–93.
**Gap:** No significant functional gap. Mobile truncates type labels to first word (`r.type.split(' ')[0]`).
**Recommended Implementation:** No change required for parity. Optionally use full type names with `numberOfLines={2}` in `GroupedBars` label text.

---

## 3.4 Asset Type Filter Tabs

**Browser Source:** `div.tabs` in `list.html` lines 52–55.
**Mobile Equivalent:** None.
**Gap:** Entire feature missing.
**Recommended Implementation:** Create `src/components/assets/AssetTypeTabs.tsx`. Use a horizontal `ScrollView` with touchable chips/buttons. Props: `types: AssetType[]`, `activeSlug: string | null`, `onSelect: (slug: string | null) => void`. Maintain `activeTypeSlug` state in `AssetsScreen`. Pass filtered assets to holdings list; pass filtered allocation to `DistributionPie`.

---

## 3.5 Asset Row (Holdings List Item)

**Browser Source:** `<tr>` in `list.html` lines 63–88. Columns: Name + SIP chip + ISIN/ticker, Type chip, Date, Qty, Invested, Current, P&L, Actions.
**Mobile Equivalent:** Anonymous `SectionCard` per asset in `AssetsScreen.tsx` lines 103–118.
**Gap:** Missing: SIP badge, ISIN/ticker sub-line, quantity display, investment date, type chip (only plain text), Edit button, View/Detail tappable name.
**Recommended Implementation:** Create `src/components/assets/AssetRow.tsx`. Props: `asset: Asset & {type_name: string}`, `onView`, `onEdit`, `onSIP`, `onDelete`. Render: name (touchable → onView), ISIN/ticker sub-label, type `Chip`, investment date, qty, Invested/Current/P&L `Kpi` trio, SIP `Chip` badge (if `is_sip`), action `IconButton` row.

---

## 3.6 Add Asset Form — Type-Specific Fields

**Browser Source:** `assetConfigs` in `list.html` lines 285–377. 8 type configs, each with multiple labeled sections and typed fields.
**Mobile Equivalent:** 5-field generic `Dialog`.
**Gap:** All 8 type-specific field sets are absent. No ISIN, ticker, purchase_price, investment_date, maturity_date, purity, area, location, account_no, nominee, coupon_rate, active_sip, sip_monthly fields.
**Recommended Implementation:** Create `src/components/assets/AssetTypeFieldConfig.ts` (port of `assetConfigs`). Create `src/components/assets/AssetForm.tsx` that accepts `typeKey` prop and renders the correct sections. Replace the simple `Dialog` with a modal `ScrollView` form.

---

## 3.7 Edit Asset Form

**Browser Source:** `div.modal-overlay` `x-show="showEdit"` in `list.html` lines 140–157. Pre-fills via `window.ASSETS[id]`.
**Mobile Equivalent:** None.
**Gap:** Entire feature missing.
**Recommended Implementation:** Create `src/screens/assets/EditAssetScreen.tsx` (or a modal). Reuse `AssetForm` with `initialValues` prop. On save, call `update('assets', id, {...})`.

---

## 3.8 Asset Detail View

**Browser Source:** Right-side drawer in `list.html` lines 160–203. Performance chart, key metrics grid, SIP status block, type-specific detail fields, photo, notes, actions.
**Mobile Equivalent:** None.
**Gap:** Entire feature missing.
**Recommended Implementation:** Create `src/screens/assets/AssetDetailScreen.tsx`. Use `PerformanceChart` (synthetic 8-point line). Key metrics grid using `LineItem` components. CAGR from `src/utils/cagr.ts`. SIP status from `sip_schedules` query. Type-specific fields by parsing `details_json`. Notes as `<Text>`. Edit/SIP/Delete action buttons.

---

## 3.9 SIP Configuration Modal

**Browser Source:** `_sip_modal.html` partial. Fields: amount, day, frequency, step-up %, start/end dates, linked bank, status.
**Mobile Equivalent:** None.
**Gap:** Entire feature missing.
**Recommended Implementation:** Create `src/components/assets/SIPModal.tsx`. Uses `react-native-paper` `Dialog` or bottom sheet. Date inputs via `@react-native-community/datetimepicker` or text inputs with validation. On save, `insert`/`update` on `sip_schedules` table.

---

## 3.10 Bulk Upload Modal

**Browser Source:** 3-step wizard in `list.html` lines 208–265.
**Mobile Equivalent:** None.
**Gap:** Entire feature missing.
**Recommended Implementation:** Create `src/components/assets/BulkUploadModal.tsx`. Use `expo-document-picker` for file selection. For CSV: parse with `papaparse`. Show column mapping UI and row preview. For XLSX: POST directly as multipart to backend.

---

## 3.11 Loading States

**Browser Source:** "Refresh Prices" submits form POST — page re-renders after redirect. Bulk import shows "Importing…" text.
**Mobile Equivalent:** None. No loading indicators in AssetsScreen.
**Gap:** No `ActivityIndicator` for any async operation. No pull-to-refresh.
**Recommended Implementation:** Add `isRefreshing` state in AssetsScreen. Pass `RefreshControl` to `Screen`'s `ScrollView` `refreshControl` prop (prop already supported by `Screen` in `ui.tsx`). Add per-operation loading flags.

---

## 3.12 Error States

**Browser Source:** `div.msg` at top of page for server errors. `impError` text for CSV parse failure.
**Mobile Equivalent:** None. Errors from `insert`/`remove` are swallowed silently.
**Gap:** No error display, no toast on failure.
**Recommended Implementation:** Wrap mutations in try/catch. Use `react-native-toast-message` or `Snackbar` from react-native-paper to display error messages.

---

## 3.13 Benchmark Drift Score / Age-Based Suggestion Card

**Browser Source:** `div.card` lines 93–108. Shows RECOMMENDED chip, user age, risk profile, drift % (red if >30).
**Mobile Equivalent:** Benchmark bar chart section exists but drift score card is absent.
**Gap:** `bench.drift` is computed but never rendered. User age and risk profile are available but unused in this context.
**Recommended Implementation:** After `GroupedBars`, add a small card: `{bench.drift > 0 && <SectionCard>...<Text style={{color: bench.drift > 30 ? palette.danger : palette.good}}>{bench.drift}% drift</Text>...</SectionCard>}`.

---

# 4. Yahoo Finance Migration Analysis

## 4.1 Existing Mobile Integrations
None. The mobile app makes zero HTTP calls. It has no network layer at all.

## 4.2 Missing Integrations

### Missing: Equity Price Refresh (`equity_price()`)
**Browser flow:** `services.refresh_asset_prices()` iterates assets with `tname == "Equity"` → calls `equity_price(a.ticker)` → `GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d` → `meta.regularMarketPrice` → updates `a.current_nav` and `a.current_value` in DB.
**Mobile gap:** No `ticker` column in assets table. No HTTP call. No price update path.
**Mobile implementation path:** Backend proxy (recommended) — mobile POSTs to `/api/v1/assets/refresh-prices` → server calls Yahoo Finance → returns updated values. Do NOT call Yahoo Finance directly from mobile.

### Missing: Equity Name Auto-fill (`equity_name()`)
**Browser flow:** Ticker field blur → JS `wireEquityAuto()` → `GET /assets/lookup/equity?ticker=X` → JSON `{name, price}` → auto-fills name input. 24h server-side cache.
**Mobile gap:** No ticker field in add form, no lookup call.
**Mobile implementation path:** `useEquityLookup` hook with 400ms debounce → `GET /api/v1/assets/lookup/equity?ticker=X`.

### Missing: Gold Price Calculation (`gold_per_gram_inr()`)
**Browser flow:** `_yahoo_price("GC=F")` (USD/troy oz) × `_yahoo_price("INR=X")` (INR/USD) / 31.1035 → gold price per gram INR. Updates Digital Gold and SGB assets.
**Mobile gap:** No gold price fetch. Schema does not separate Digital Gold, Physical Gold, and SGB.
**Mobile implementation path:** Backend proxy on `/api/v1/assets/refresh-prices`.

### Missing: AMFI NAV Feed (`mf_nav()`)
**Browser flow:** `GET https://www.amfiindia.com/spages/NAVAll.txt` → parse semicolon-delimited text → `dict[ISIN] = float(NAV)` with 1h TTL cache → updates Mutual Fund `current_value`.
**Mobile gap:** No AMFI call. `isin` column missing from assets table.
**Mobile implementation path:** Backend proxy on `/api/v1/assets/refresh-prices`.

## 4.3 Missing Endpoints (for backend to add)
1. `GET /api/v1/assets/lookup/equity?ticker={ticker}` — returns `{ticker, name, price}`
2. `POST /api/v1/assets/refresh-prices` — triggers full refresh, returns `{updated, candidates, errors[]}`

## 4.4 Missing Response Mappings
The mobile `Asset` type needs these fields to store refresh results:
- `current_nav: number` — paise per unit after refresh (column missing from schema)
- `current_value: number` — already exists ✓ (updated in place)

## 4.5 Missing Calculations
| Calculation | Browser Location | Mobile Status |
|---|---|---|
| `unit_price × quantity × 100 → current_value (paise)` | `services.py:115` | Missing — no price update path |
| `usd_oz × usd_inr / 31.1035` | `market_data.py:129` | Missing |
| `.NS` auto-suffix for NSE tickers | `market_data.py:70` | Missing |

## 4.6 Missing Refresh Mechanisms
- No pull-to-refresh triggering price fetch
- No "Refresh Prices" button
- No TTL cache equivalent (needed if mobile ever calls Yahoo Finance directly)

## 4.7 How Specific Values Are Obtained in Browser vs Mobile

### Current Price
| Asset Type | Browser Method | Mobile Status |
|---|---|---|
| Equity | `equity_price(ticker)` via Yahoo Finance | Missing |
| Mutual Fund | `mf_nav(isin)` via AMFI | Missing |
| Digital Gold | `gold_per_gram_inr()` via Yahoo Finance | Missing |
| Sovereign Gold Bond | `gold_per_gram_inr()` | Missing |
| Real Estate, FD, PPF, Physical Gold | User-entered only | User-entered only ✓ |

### Daily Change / Percent Change
Neither browser nor mobile computes daily change. Not a parity gap.

### Market Value (current_value per asset)
- **Browser:** `round(unit_price × quantity × 100)` in `services.py` on refresh.
- **Mobile:** `current_value` stored directly. Auto-update on price refresh not implemented.

### Asset Performance (CAGR)
- **Browser:** Client-side JS: `((current/invested)^(1/max(days/365, 0.25)) - 1) × 100`
- **Mobile:** No `cagr.ts` utility. Not displayed.

---

# 5. API Migration Analysis

## API 1: GET /assets (list page → JSON)
**Endpoint:** `GET /api/v1/assets?type=<slug>`
**Purpose:** Return assets list + portfolio summary + benchmark result as JSON for mobile.
**Browser Status:** Returns HTML only (`assets_list()` in `pages.py`).
**Mobile Status:** Missing — mobile reads SQLite directly; no HTTP call. For a local-SQLite mobile app this endpoint may remain optional.
**Migration Required:** Yes for cloud-sync scenario; No for local-first scenario.
**Classification:** Missing

---

## API 2: POST /assets (create)
**Endpoint:** `POST /assets`
**Purpose:** Create a new asset. Accepts multipart form data.
**Browser Status:** Fully implemented in `pages.py assets_create()`.
**Mobile Status:** Partially implemented — `insert('assets', {...})` exists but only handles the 5 basic fields. Missing type-specific fields.
**Migration Required:** Yes (add all fields to local insert; backend JSON API optional for cloud sync).
**Classification:** Partially Implemented

---

## API 3: GET /assets/lookup/equity
**Endpoint:** `GET /assets/lookup/equity?ticker={ticker}`
**Purpose:** Returns `{ticker, name, price}` JSON for equity name auto-fill.
**Browser Status:** Fully implemented in `pages.py assets_equity_lookup()`.
**Mobile Status:** Missing entirely.
**Migration Required:** Yes — requires backend.
**Classification:** Missing

---

## API 4: POST /assets/refresh-prices
**Endpoint:** `POST /assets/refresh-prices`
**Purpose:** Trigger Yahoo Finance + AMFI price refresh for all user assets.
**Browser Status:** Fully implemented in `pages.py assets_refresh_prices()` + `services.refresh_asset_prices()`.
**Mobile Status:** Missing entirely.
**Migration Required:** Yes — requires backend.
**Classification:** Missing

---

## API 5: GET /assets/import/template
**Endpoint:** `GET /assets/import/template`
**Purpose:** Download CSV template file.
**Browser Status:** Fully implemented.
**Mobile Status:** Missing.
**Migration Required:** Nice-to-have.
**Classification:** Missing

---

## API 6: POST /assets/bulk-upload
**Endpoint:** `POST /assets/bulk-upload`
**Purpose:** Bulk import assets from CSV or XLSX.
**Browser Status:** Fully implemented with openpyxl + validation + preview.
**Mobile Status:** Missing.
**Migration Required:** Nice-to-have.
**Classification:** Missing

---

## API 7: POST /assets/{id}/update (edit)
**Endpoint:** `POST /assets/{id}/update`
**Purpose:** Update existing asset.
**Browser Status:** Fully implemented.
**Mobile Status:** `update()` helper in `db/index.ts` exists but is never called for assets. No edit UI.
**Migration Required:** Yes (add edit UI and call `update('assets', id, {...})`).
**Classification:** Partially Implemented

---

## API 8: POST /assets/{id}/delete
**Endpoint:** `POST /assets/{id}/delete`
**Purpose:** Delete asset.
**Browser Status:** Fully implemented.
**Mobile Status:** `remove('assets', id)` — fully works locally.
**Migration Required:** No (local-first works).
**Classification:** Already Implemented

---

## API 9: GET /assets/{id}/image
**Endpoint:** `GET /assets/{id}/image`
**Purpose:** Serve asset photo.
**Browser Status:** Fully implemented with Pillow.
**Mobile Status:** Missing. No `asset_images` table.
**Migration Required:** Yes (for Physical Gold photo feature).
**Classification:** Missing

---

## API 10: GET /assets/{id}/sip
**Endpoint:** `GET /assets/{id}/sip`
**Purpose:** Returns SIP configuration JSON for an asset.
**Browser Status:** Fully implemented.
**Mobile Status:** `sip_schedules` table exists but is missing 5 columns. No query or UI for SIP.
**Migration Required:** Yes (local SQLite read of `sip_schedules`; no HTTP needed for local-first).
**Classification:** Partially Implemented

---

## API 11: POST /assets/{id}/sip
**Endpoint:** `POST /assets/{id}/sip`
**Purpose:** Save SIP configuration for an asset.
**Browser Status:** Fully implemented.
**Mobile Status:** Missing — no SIP form, no `insert`/`update` for SIP schedules.
**Migration Required:** Yes.
**Classification:** Missing

---

# 6. Business Logic Gap Analysis

## Calculation 1: Portfolio Total Value
**Formula:** `sum(asset.current_value)`
**Browser Location:** `services.py` line 63
**Mobile Location:** `finance.ts portfolioSummary()` line 43
**Current Status:** Fully Implemented
**Required Work:** None

---

## Calculation 2: Total Invested
**Formula:** `sum(asset.invested_amount)`
**Browser Location:** `services.py` line 62
**Mobile Location:** `finance.ts portfolioSummary()` line 42
**Current Status:** Fully Implemented
**Required Work:** None

---

## Calculation 3: Total P&L
**Formula:** `total_value - total_invested`
**Browser Location:** `services.py` line 64
**Mobile Location:** `finance.ts portfolioSummary()` line 44
**Current Status:** Fully Implemented
**Required Work:** None

---

## Calculation 4: P&L Percentage
**Formula:** `round(total_pnl / total_invested * 100, 2)` — zero if `total_invested === 0`
**Browser Location:** `services.py` line 65
**Mobile Location:** `finance.ts portfolioSummary()` line 61
**Current Status:** Fully Implemented
**Required Work:** None

---

## Calculation 5: Monthly SIP Total
**Formula:** `sum(asset.sip_monthly_amount where asset.is_sip = true)`
**Browser Location:** `services.py` line 66
**Mobile Location:** Not implemented
**Current Status:** Missing
**Required Work:** (1) Add `is_sip INTEGER DEFAULT 0` and `sip_monthly_amount INTEGER DEFAULT 0` columns to `assets` table in `schema.ts`. (2) Add to `portfolioSummary()`: `const monthly_sip = assets.filter(a => a.is_sip).reduce((s,a) => s + (a.sip_monthly_amount || 0), 0)`. (3) Return `monthly_sip` and `active_sips` from `portfolioSummary()`. (4) Render 4th Kpi card in AssetsScreen.

---

## Calculation 6: Per-Asset P&L
**Formula:** `current_value - invested_amount` and `round(pnl / invested_amount * 100, 2)`
**Browser Location:** `models.py` lines 137–145 (ORM properties)
**Mobile Location:** `AssetsScreen.tsx` line 101 inline; `pct()` from `utils/money.ts`
**Current Status:** Fully Implemented
**Required Work:** None — consider extracting to a utility function for reuse in `AssetRow` and `AssetDetailScreen`.

---

## Calculation 7: Allocation Percentage
**Formula:** `round(type_total_current_value / portfolio_total_current_value * 100, 1)`
**Browser Location:** `services.py` lines 75–78
**Mobile Location:** `finance.ts portfolioSummary()` line 55
**Current Status:** Fully Implemented
**Required Work:** None

---

## Calculation 8: Benchmark Drift
**Formula:** `sum(abs(actual_pct - recommended_pct))` for each class, excluding Real Estate
**Browser Location:** `services.py` lines 125–142. Benchmarks: conservative/moderate/aggressive.
**Mobile Location:** `finance.ts benchmarkComparison()` lines 67–84. Identical logic.
**Current Status:** Fully Implemented (calculation). Partially Implemented (display — `bench.drift` not shown in UI).
**Required Work:** Add drift display card to AssetsScreen UI after benchmark bar chart.

---

## Calculation 9: Gold Price per Gram (INR)
**Formula:** `usd_per_troy_oz × usd_inr_rate / 31.1035`
**Browser Location:** `market_data.py` lines 125–132. Constant `_OZ_TO_GRAM = 31.1035`.
**Mobile Location:** Not implemented.
**Current Status:** Missing
**Required Work:** Server-side only (backend proxy approach). Mobile calls `/api/v1/assets/refresh-prices`; backend handles the gold price calculation.

---

## Calculation 10: CAGR Estimate
**Formula:** `((current/invested)^(1/max(days/365, 0.25)) - 1) × 100`, rounded to 1 decimal
**Browser Location:** `list.html` lines 599–604 (client-side JS `cagr()` method)
**Mobile Location:** Not implemented
**Current Status:** Missing
**Required Work:** Create `src/utils/cagr.ts`:
```typescript
export function cagrEstimate(
  investedPaise: number,
  currentPaise: number,
  investmentDateISO: string | null
): number {
  if (!investedPaise || investedPaise <= 0 || !investmentDateISO) return 0;
  const days = (Date.now() - new Date(investmentDateISO + 'T00:00:00').getTime()) / 86400000;
  const yrs = Math.max(days / 365, 0.25);
  const ratio = currentPaise / investedPaise;
  if (ratio <= 0) return 0;
  return Math.round((Math.pow(ratio, 1 / yrs) - 1) * 1000) / 10;
}
```

---

## Calculation 11: Current NAV / Price Per Unit
**Formula (at creation):** `round(price_per_unit_input × 100)` or `round(invested / quantity)` if no explicit price input
**Formula (at refresh):** `round(unit_price × 100)` where `unit_price` is float ₹
**Browser Location:** `pages.py` lines 662–671; `services.py` line 115
**Mobile Location:** Not stored. `current_nav` column missing from schema.
**Current Status:** Missing
**Required Work:** Add `current_nav INTEGER` and `price_per_unit INTEGER` to `assets` table. Compute and store on create. Update on price refresh.

---

## Calculation 12: Equity Auto-Computed Invested Amount
**Formula (client-side):** `invested = round(shares × buy_price × 100) / 100`
**Browser Location:** `list.html` lines 486–492 (JS `wireEquityAuto()`). Invested field made `readOnly = true` for Equity type.
**Mobile Location:** Not implemented
**Current Status:** Missing
**Required Work:** In `AssetForm.tsx` for `typeKey === 'equity'`: watch `quantity` (shares) and `price_per_unit` (buy price) fields; compute and set `invested_amount` automatically; mark invested field read-only.

---

## Calculation 13: SIP Next Due Date
**Formula:** `date.today() + timedelta(days=30)` — simple 30-day lookahead
**Browser Location:** `pages.py` lines 686, 811
**Mobile Location:** Not implemented
**Current Status:** Missing
**Required Work:** On SIP creation: `next_due_date = addDays(todayISO(), 30)`. Add to SIPModal save logic.

---

# 7. State Management Gap Analysis

## 7.1 Current Mobile State

| Layer | Mechanism | Assets Usage |
|---|---|---|
| Global | `AppContext` (`refreshKey`, `userId`) | `refresh()` called after create/delete |
| Local screen | `useState` in `AssetsScreen` | `addOpen`, `form`, `typeMenu`, `confirmId` |
| Data cache | `useData` hook (re-runs on focus + refreshKey) | 5 queries: `user`, `assetTypes`, `assets`, `pf`, `bench` |
| DB | Synchronous SQLite via `expo-sqlite` | Direct read/write |

## 7.2 Missing Stores

### Missing: `src/store/assetsStore.ts` (Zustand)
**Browser equivalent:** `window.ASSETS` global + Alpine `assetsPage()` component state
**Required state:**
- `assets: (Asset & { type_name: string })[]`
- `portfolio: PortfolioSummaryResult | null`
- `benchmark: BenchmarkResult | null`
- `selectedAsset: Asset | null`
- `activeTypeSlug: string | null`
- `isRefreshing: boolean`
- `error: string | null`
- Actions: `setAssets`, `setSelectedAsset`, `setActiveType`, `invalidate`

## 7.3 Missing Contexts
None needed beyond `AppContext` for local-first approach.

## 7.4 Missing Hooks

### Missing: `src/hooks/assets/useRefreshPrices.ts`
Triggers POST to backend `/api/v1/assets/refresh-prices`. Returns `{ refresh, isRefreshing, result }`. On success: updates local SQLite with returned `current_value`/`current_nav` values, then calls `refresh()`.

### Missing: `src/hooks/assets/useSIPConfig.ts`
Reads `sip_schedules` for a given `asset_id`. Exposes `{ sip, isLoading, save, isSaving }` for SIPModal.

### Missing: `src/hooks/assets/useEquityLookup.ts`
Debounced 400ms GET to `/api/v1/assets/lookup/equity?ticker=X`. Returns `{ name, price, isLoading }`.

### Missing: `src/hooks/assets/useBulkUpload.ts`
Wraps `expo-document-picker`, CSV parse via `papaparse`, POST to bulk-upload endpoint.

## 7.5 Missing Cache Layers
- No TTL cache for equity names (browser caches 24h) — lives in backend
- No TTL cache for gold price (browser caches 30min) — lives in backend
- No TTL cache for AMFI NAV map (browser caches 1h) — lives in backend

## 7.6 Missing State Synchronization
After price refresh, local SQLite needs to be written with updated `current_value` and `current_nav` values returned from backend. Currently `refresh()` only re-runs queries; it does not pull from backend.

## 7.7 Alpine.js State vs Mobile Equivalent

| Alpine Property | Purpose | Mobile Equivalent | Status |
|---|---|---|---|
| `showAdd` | Add modal visibility | `addOpen` useState | Implemented |
| `showEdit` | Edit modal visibility | Not present | Missing |
| `showDrawer` | Detail drawer visibility | Not present | Missing |
| `showBulk` | Bulk upload modal visibility | Not present | Missing |
| `showSip` | SIP modal visibility | Not present | Missing |
| `sel` | Selected asset object | Not present | Missing |
| `sipAssetId/Name` | SIP modal target | Not present | Missing |
| `sip` | SIP data object | Not present | Missing |
| `impStep/Error/Headers/Rows/Map` | Bulk upload wizard state | Not present | Missing |
| `importing` | Import in-progress flag | Not present | Missing |

---

# 8. Missing Components Inventory

## Component 1: AssetTypeTabs
**Browser File:** `list.html` lines 52–55 (`div.tabs`)
**Recommended Mobile File:** `src/components/assets/AssetTypeTabs.tsx`
**Dependencies:** `react-native` `ScrollView`, `react-native-paper` `Chip`, `models/types` `AssetType`
**Priority:** High
**Complexity:** Low

---

## Component 2: AssetRow
**Browser File:** `list.html` lines 63–88 (`<tr>` with all columns)
**Recommended Mobile File:** `src/components/assets/AssetRow.tsx`
**Dependencies:** `react-native-paper` (`Chip`, `IconButton`, `Text`), `components/ui` (`Kpi`, `Row`), `utils/money` (`formatINR`, `pct`), `models/types` (`Asset`)
**Priority:** High
**Complexity:** Medium

---

## Component 3: AssetForm
**Browser File:** `list.html` lines 284–526 (dynamic form driven by `assetConfigs` + `renderAssetFields()`)
**Recommended Mobile File:** `src/components/assets/AssetForm.tsx`
**Dependencies:** `AssetTypeFieldConfig.ts`, `react-native-paper` (`TextInput`, `Menu`, `Checkbox`), `@react-native-community/datetimepicker` or equivalent, `expo-image-picker` (for Physical Gold photo)
**Priority:** High
**Complexity:** High

---

## Component 4: AssetTypeFieldConfig
**Browser File:** `list.html` lines 285–377 (`assetConfigs` JS object) + lines 378–410 (`assetNameMap`)
**Recommended Mobile File:** `src/components/assets/AssetTypeFieldConfig.ts`
**Dependencies:** None (pure config)
**Priority:** High (blocks AssetForm)
**Complexity:** Low (transcription task — 8 type configs)

---

## Component 5: PerformanceChart
**Browser File:** `list.html` lines 579–598 (`renderPerf()` + `canvas#assetPerfChart`)
**Recommended Mobile File:** `src/components/assets/PerformanceChart.tsx`
**Dependencies:** `components/charts` (`TrendLine`), synthetic data generation function
**Priority:** Medium
**Complexity:** Low (`TrendLine` already exists; need only the synthetic data generator)

---

## Component 6: SIPModal
**Browser File:** `app/app/templates/partials/_sip_modal.html`
**Recommended Mobile File:** `src/components/assets/SIPModal.tsx`
**Dependencies:** `react-native-paper` (`Dialog`), `hooks/assets/useSIPConfig`, date picker, `models/types` (`SIPSchedule`), `services/constants` (`FREQ_PER_YEAR`)
**Priority:** Medium
**Complexity:** Medium

---

## Component 7: BulkUploadModal
**Browser File:** `list.html` lines 208–265
**Recommended Mobile File:** `src/components/assets/BulkUploadModal.tsx`
**Dependencies:** `expo-document-picker`, `papaparse` (CSV), `hooks/assets/useBulkUpload`
**Priority:** Low (nice-to-have)
**Complexity:** High

---

## Component 8: AssetDetailScreen
**Browser File:** `list.html` lines 160–203 (detail drawer)
**Recommended Mobile File:** `src/screens/assets/AssetDetailScreen.tsx`
**Dependencies:** `PerformanceChart`, `SIPModal`, `utils/cagr`, `components/ui` (`LineItem`, `SectionCard`), `models/types`
**Priority:** High
**Complexity:** Medium

---

## Component 9: EditAssetScreen
**Browser File:** `list.html` lines 140–157 (edit modal) + `pages.py assets_update()`
**Recommended Mobile File:** `src/screens/assets/EditAssetScreen.tsx`
**Dependencies:** `AssetForm`, `db/index` (`update`), `models/types`
**Priority:** High
**Complexity:** Medium (reuses AssetForm; mostly pre-fill logic)

---

# 9. Migration Task Breakdown

## TASK-001: Schema Migration — Add Missing Asset Columns
**Task ID:** TASK-001
**Description:** Add all missing columns to `assets` table and `sip_schedules` table. Add `asset_images` table. Update `Asset` and `SIPSchedule` TypeScript interfaces.
**Files to Create:** None
**Files to Modify:**
- `src/db/schema.ts` — add `isin`, `ticker`, `is_sip`, `sip_monthly_amount`, `current_nav`, `price_per_unit`, `investment_date`, `maturity_date`, `guaranteed_return_pct`, `details_json` to assets; add `day_of_month`, `annual_step_up_pct`, `start_date`, `end_date`, `linked_bank` to sip_schedules; add `asset_images` table
- `src/models/types.ts` — update `Asset` interface, update `SIPSchedule` interface, add `AssetImage` interface
**Dependencies:** None
**Complexity:** Low
**Classification:** Foundation

---

## TASK-002: Seed Migration — Add Missing Asset Types
**Task ID:** TASK-002
**Description:** Add Digital Gold, Physical Gold, Sovereign Gold Bond, PPF asset types to seed data. Add demo SIP schedules. Add demo SGB/PPF/Digital Gold assets.
**Files to Create:** None
**Files to Modify:**
- `src/db/seed.ts` — add 4 new asset types, add demo SIP data, add demo assets for new types
**Dependencies:** TASK-001
**Complexity:** Low
**Classification:** Foundation

---

## TASK-003: Service Update — portfolioSummary monthly_sip
**Task ID:** TASK-003
**Description:** Add `monthly_sip` (sum of `sip_monthly_amount` where `is_sip = 1`) and `active_sips` count to `portfolioSummary()` return value.
**Files to Create:** None
**Files to Modify:**
- `src/services/finance.ts` — update `portfolioSummary()`
**Dependencies:** TASK-001
**Complexity:** Low
**Classification:** Business Logic

---

## TASK-004: Utility — CAGR Estimate
**Task ID:** TASK-004
**Description:** Create `cagrEstimate(investedPaise, currentPaise, investmentDateISO)` utility function, porting the browser's `cagr()` JS method from `list.html` lines 599–604.
**Files to Create:**
- `src/utils/cagr.ts`
**Files to Modify:** None
**Dependencies:** None
**Complexity:** Low
**Classification:** Business Logic

---

## TASK-005: Constants — Asset Type Configs
**Task ID:** TASK-005
**Description:** Create `AssetTypeFieldConfig.ts` with `ASSET_CONFIGS`, `FIELD_NAME_MAP`, `SIP_ELIGIBLE_TYPES`, `ASSET_TYPE_KEY_MAP` — full TypeScript port of `assetConfigs` from `list.html` lines 285–410 for all 8 asset types.
**Files to Create:**
- `src/components/assets/AssetTypeFieldConfig.ts`
**Files to Modify:**
- `src/services/constants.ts` — add `SIP_ELIGIBLE_TYPES`, `ASSET_TYPE_KEY_MAP`
**Dependencies:** TASK-002
**Complexity:** Low (transcription)
**Classification:** Foundation

---

## TASK-006: Component — AssetTypeTabs
**Task ID:** TASK-006
**Description:** Create horizontal scrollable type filter tab bar component. Props: `types: AssetType[]`, `activeSlug: string | null`, `onSelect: (slug: string | null) => void`.
**Files to Create:**
- `src/components/assets/AssetTypeTabs.tsx`
**Files to Modify:** None
**Dependencies:** TASK-005
**Complexity:** Low
**Classification:** UI

---

## TASK-007: Component — AssetRow
**Task ID:** TASK-007
**Description:** Create asset row component with name (touchable), ISIN/ticker sub-label, type chip, investment date, quantity, invested/current/P&L trio, SIP badge (if is_sip), and action buttons (view, edit, SIP, delete).
**Files to Create:**
- `src/components/assets/AssetRow.tsx`
**Files to Modify:** None
**Dependencies:** TASK-001, TASK-005
**Complexity:** Medium
**Classification:** UI

---

## TASK-008: Component — AssetForm (with type-specific fields)
**Task ID:** TASK-008
**Description:** Create dynamic form component that renders different field sets based on `typeKey` prop using `AssetTypeFieldConfig`. Handles date pickers, SIP checkbox, equity auto-compute for invested amount.
**Files to Create:**
- `src/components/assets/AssetForm.tsx`
**Files to Modify:** None
**Dependencies:** TASK-005
**Complexity:** High
**Classification:** UI

---

## TASK-009: Component — PerformanceChart
**Task ID:** TASK-009
**Description:** Create synthetic 8-point performance line chart for asset detail view. Generates sinusoidal wobble between `invested` and `current` values using `Math.sin`. Uses existing `TrendLine` component.
**Files to Create:**
- `src/components/assets/PerformanceChart.tsx`
**Files to Modify:** None
**Dependencies:** None (uses existing `TrendLine`)
**Complexity:** Low
**Classification:** UI

---

## TASK-010: Screen — AssetDetailScreen
**Task ID:** TASK-010
**Description:** Create full asset detail screen. Shows performance chart, key metrics grid (invested, current, return, CAGR, holding since), SIP status block, type-specific parsed detail fields, photo, notes, Edit/SIP/Delete actions.
**Files to Create:**
- `src/screens/assets/AssetDetailScreen.tsx`
**Files to Modify:**
- `src/app/_layout.tsx` — add stack navigator under assets tab
**Dependencies:** TASK-001, TASK-004, TASK-009
**Complexity:** Medium
**Classification:** UI

---

## TASK-011: Screen — EditAssetScreen
**Task ID:** TASK-011
**Description:** Create edit asset screen that reuses `AssetForm` pre-filled with existing asset data. Saves via `update('assets', id, {...})` with all type-specific fields.
**Files to Create:**
- `src/screens/assets/EditAssetScreen.tsx`
**Files to Modify:**
- `src/app/_layout.tsx` — add edit route
**Dependencies:** TASK-008
**Complexity:** Medium
**Classification:** UI

---

## TASK-012: Component — SIPModal
**Task ID:** TASK-012
**Description:** Create SIP configuration dialog. Fields: amount, day of month (1–28), frequency, step-up %, start date, end date, linked bank, status. Saves to `sip_schedules` table via `useSIPConfig`.
**Files to Create:**
- `src/components/assets/SIPModal.tsx`
- `src/hooks/assets/useSIPConfig.ts`
**Files to Modify:** None
**Dependencies:** TASK-001, TASK-002
**Complexity:** Medium
**Classification:** UI

---

## TASK-013: AssetsScreen Refactor
**Task ID:** TASK-013
**Description:** Refactor `AssetsScreen` to use all new components: `AssetTypeTabs`, `AssetRow`, 4-KPI portfolio summary bar (add monthly SIP), per-type allocation drilldown, drift score display card, edit/view/SIP action wiring, pull-to-refresh, toast on mutations.
**Files to Create:** None
**Files to Modify:**
- `src/screens/AssetsScreen.tsx` — major refactor
**Dependencies:** TASK-003, TASK-006, TASK-007, TASK-010, TASK-011, TASK-012, TASK-015
**Complexity:** Medium
**Classification:** UI

---

## TASK-014: Navigation Refactor
**Task ID:** TASK-014
**Description:** Add stack navigator under Assets drawer entry. Register `AssetDetailScreen` and `EditAssetScreen` as stack screens. Convert `src/app/assets.tsx` to `src/app/assets/` directory with `index.tsx`, `[id].tsx`, `[id]/edit.tsx`.
**Files to Create:**
- `src/app/assets/_layout.tsx`
- `src/app/assets/index.tsx`
- `src/app/assets/[id].tsx`
- `src/app/assets/[id]/edit.tsx`
**Files to Modify:**
- `src/app/_layout.tsx` — assets entry now points to stack
**Dependencies:** TASK-010, TASK-011
**Complexity:** Medium
**Classification:** Foundation

---

## TASK-015: Toast Notifications
**Task ID:** TASK-015
**Description:** Install `react-native-toast-message` (or use react-native-paper `Snackbar`). Add `Toast` root to `_layout.tsx`. Show success/error toasts after create, edit, delete, price refresh operations.
**Files to Create:** None
**Files to Modify:**
- `src/app/_layout.tsx` — add `Toast` root component
- `src/screens/AssetsScreen.tsx` — replace silent mutations with toast calls
**Dependencies:** None
**Complexity:** Low
**Classification:** UI

---

## TASK-016: Loading States
**Task ID:** TASK-016
**Description:** Add `RefreshControl` to Screen's ScrollView for pull-to-refresh. Add per-operation loading indicator for price refresh button.
**Files to Create:** None
**Files to Modify:**
- `src/screens/AssetsScreen.tsx`
**Dependencies:** None
**Complexity:** Low
**Classification:** UI

---

## TASK-017: Price Refresh Integration (requires backend)
**Task ID:** TASK-017
**Description:** Add "Refresh Prices" button to AssetsScreen header. POST to backend `/api/v1/assets/refresh-prices`. Update local SQLite `current_value`/`current_nav` with returned values. Show toast with updated/errors count.
**Files to Create:**
- `src/hooks/assets/useRefreshPrices.ts`
- `src/api/assets/assetsApi.ts`
**Files to Modify:**
- `src/screens/AssetsScreen.tsx`
**Dependencies:** TASK-001, TASK-015, backend API changes
**Complexity:** Medium
**Classification:** API

---

## TASK-018: Equity Lookup Integration (requires backend)
**Task ID:** TASK-018
**Description:** Add `useEquityLookup` hook with 400ms debounce. Wire into `AssetForm` for `typeKey === 'equity'` — auto-fill name on ticker field blur.
**Files to Create:**
- `src/hooks/assets/useEquityLookup.ts`
**Files to Modify:**
- `src/components/assets/AssetForm.tsx`
**Dependencies:** TASK-008, backend `/api/v1/assets/lookup/equity`
**Complexity:** Low
**Classification:** API

---

## TASK-019: Bulk Upload (Nice-to-Have)
**Task ID:** TASK-019
**Description:** Implement BulkUploadModal with expo-document-picker, papaparse CSV parsing, column mapping UI, row preview, and POST to backend bulk-upload endpoint.
**Files to Create:**
- `src/components/assets/BulkUploadModal.tsx`
- `src/hooks/assets/useBulkUpload.ts`
**Files to Modify:**
- `src/screens/AssetsScreen.tsx`
**Dependencies:** TASK-017, backend `/api/v1/assets/bulk-upload`
**Complexity:** High
**Classification:** UI

---

## TASK-020: Asset Photo Support (Nice-to-Have)
**Task ID:** TASK-020
**Description:** Add `expo-image-picker` for Physical Gold photo. Store `image_path` in `asset_images` table. Display in AssetDetailScreen.
**Files to Create:** None (handled within AssetForm and AssetDetailScreen)
**Files to Modify:**
- `src/components/assets/AssetForm.tsx`
- `src/screens/assets/AssetDetailScreen.tsx`
**Dependencies:** TASK-008, TASK-010, TASK-001
**Complexity:** Medium
**Classification:** UI

---

## TASK-021: Testing
**Task ID:** TASK-021
**Description:** Unit tests for `cagr.ts`, `formatINR` Indian grouping, `AssetTypeFieldConfig` completeness. Component tests for `AssetForm` per type. Integration tests for `portfolioSummary` with SIP data.
**Files to Create:**
- `src/utils/__tests__/cagr.test.ts`
- `src/utils/__tests__/money.test.ts`
- `src/components/assets/__tests__/AssetForm.test.tsx`
**Files to Modify:** None
**Dependencies:** TASK-004, TASK-005, TASK-008
**Complexity:** Medium
**Classification:** Testing

---

# 10. Dependency Graph

```
TASK-001 (Schema Migration)
↓
TASK-002 (Seed Migration — new asset types)
↓
TASK-003 (portfolioSummary monthly_sip)
TASK-005 (AssetTypeFieldConfig)
↓
TASK-006 (AssetTypeTabs)
TASK-007 (AssetRow)
TASK-008 (AssetForm)
   ↓
   TASK-011 (EditAssetScreen)

TASK-004 (CAGR utility) ──────────────────┐
TASK-009 (PerformanceChart) ──────────────┤
                                          ↓
                               TASK-010 (AssetDetailScreen)
                                          ↓
                               TASK-014 (Navigation Refactor)

TASK-012 (SIPModal) ← TASK-001, TASK-002

TASK-015 (Toast) ─────────────────────────┐
TASK-016 (Loading States) ────────────────┤
TASK-006, 007, 010, 011, 012, 014 ────────┤
                                          ↓
                               TASK-013 (AssetsScreen Refactor)

TASK-017 (Price Refresh API) ← TASK-001, TASK-015, backend
TASK-018 (Equity Lookup API) ← TASK-008, backend
TASK-019 (Bulk Upload)        ← TASK-017, backend
TASK-020 (Asset Photos)       ← TASK-008, TASK-010
TASK-021 (Testing)            ← TASK-004, TASK-005, TASK-008
```

**Why this order is required:**

1. **TASK-001 first** — All other tasks depend on the schema having the correct columns. Without `is_sip`, `isin`, `investment_date`, etc., no feature can be built correctly.
2. **TASK-002 after 001** — Seed data must reference updated column names and new asset type IDs.
3. **TASK-005 early** — `AssetTypeFieldConfig` is a dependency of `AssetForm`, `AssetRow`, and constants. It has no code dependencies itself.
4. **TASK-008 (AssetForm) before TASK-010/011** — Both detail and edit screens embed or depend on form logic.
5. **TASK-009 before TASK-010** — Performance chart must exist before detail screen is assembled.
6. **TASK-014 (Navigation) before TASK-013** — AssetsScreen must navigate to screens that already exist.
7. **API tasks (017/018) last** — They require backend changes that are out-of-scope for local-first phase.

---

# 11. Migration Roadmap

## Phase 1 — Foundation
**Objectives:** Fix the data model so all subsequent phases build on a complete schema and type system.
**Tasks:** TASK-001, TASK-002, TASK-003, TASK-004, TASK-005
**Files Impacted:**
- `src/db/schema.ts`
- `src/models/types.ts`
- `src/db/seed.ts`
- `src/services/finance.ts`
- `src/services/constants.ts`
- `src/utils/cagr.ts` (new)
- `src/components/assets/AssetTypeFieldConfig.ts` (new)
**Dependencies:** None
**Expected Outcomes:**
- `assets` table has all 10 missing columns
- `sip_schedules` table has all 5 missing columns
- `asset_images` table created
- All 8 asset types seeded
- `portfolioSummary()` returns `monthly_sip` and `active_sips`
- `cagrEstimate()` utility available
- Full `ASSET_CONFIGS` type-field map available for all 8 types

---

## Phase 2 — Core UI Components
**Objectives:** Build the atomic components that AssetsScreen will compose.
**Tasks:** TASK-006, TASK-007, TASK-008, TASK-009, TASK-015, TASK-016
**Files Impacted:**
- `src/components/assets/AssetTypeTabs.tsx` (new)
- `src/components/assets/AssetRow.tsx` (new)
- `src/components/assets/AssetForm.tsx` (new)
- `src/components/assets/PerformanceChart.tsx` (new)
**Dependencies:** Phase 1
**Expected Outcomes:**
- Type filter tabs component renders and fires callbacks
- Asset row renders all browser columns (name, ISIN/ticker, type chip, date, qty, invested, current, P&L, SIP badge, action buttons)
- AssetForm renders correct fields for all 8 type keys
- Equity form auto-computes invested from shares × price
- Synthetic performance chart generates 8-point sinusoidal curve

---

## Phase 3 — Screens and Navigation
**Objectives:** Build AssetDetailScreen, EditAssetScreen, SIPModal. Wire navigation. Refactor AssetsScreen.
**Tasks:** TASK-010, TASK-011, TASK-012, TASK-013, TASK-014
**Files Impacted:**
- `src/screens/assets/AssetDetailScreen.tsx` (new)
- `src/screens/assets/EditAssetScreen.tsx` (new)
- `src/components/assets/SIPModal.tsx` (new)
- `src/hooks/assets/useSIPConfig.ts` (new)
- `src/screens/AssetsScreen.tsx` (major refactor)
- `src/app/assets/` directory (new navigation structure)
**Dependencies:** Phase 2
**Expected Outcomes:**
- Tapping asset name navigates to `AssetDetailScreen` with CAGR, metrics, SIP status, type details
- Edit button navigates to `EditAssetScreen` pre-filled
- SIP button opens `SIPModal`; SIP data persists to `sip_schedules`
- Type filter tabs filter holdings list and allocation chart
- Monthly SIP KPI card shown in summary bar
- Benchmark drift score card displayed
- Toast notifications on all mutations
- Pull-to-refresh wired to ScrollView

---

## Phase 4 — API Integration (requires backend)
**Objectives:** Connect mobile to FastAPI backend for price refresh and equity lookup.
**Tasks:** TASK-017, TASK-018
**Files Impacted:**
- `src/api/assets/assetsApi.ts` (new)
- `src/hooks/assets/useRefreshPrices.ts` (new)
- `src/hooks/assets/useEquityLookup.ts` (new)
- `src/screens/AssetsScreen.tsx` (add Refresh button)
- `src/components/assets/AssetForm.tsx` (wire equity lookup)
**Backend changes required:**
- `GET /api/v1/assets/lookup/equity` — token-auth JSON endpoint
- `POST /api/v1/assets/refresh-prices` — returns JSON `{updated, candidates, errors[]}`
- Token-based auth middleware (Bearer token instead of session cookie)
**Dependencies:** Phase 3, backend API changes
**Expected Outcomes:**
- "Refresh Prices" button updates equity/MF/gold current values from live market data
- Equity name auto-fills on ticker blur in add/edit form

---

## Phase 5 — Nice-to-Have and Testing
**Objectives:** Bulk upload, asset photos, full test suite.
**Tasks:** TASK-019, TASK-020, TASK-021
**Files Impacted:**
- `src/components/assets/BulkUploadModal.tsx` (new)
- `src/hooks/assets/useBulkUpload.ts` (new)
- `src/utils/__tests__/cagr.test.ts` (new)
- `src/utils/__tests__/money.test.ts` (new)
- `src/components/assets/__tests__/AssetForm.test.tsx` (new)
**Dependencies:** Phase 4
**Expected Outcomes:**
- CSV import works via `expo-document-picker` + papaparse
- Physical Gold photo upload and display works
- All business logic unit tested
- AssetForm renders correct fields for all 8 types (component test)

---

# 12. Final Assets Completion Checklist

```
[ ] Foundation
    [ ] Add isin, ticker, is_sip, sip_monthly_amount, current_nav, price_per_unit columns to assets table
    [ ] Add investment_date column to assets table (distinguish from purchase_date)
    [ ] Add maturity_date, guaranteed_return_pct, details_json columns to assets table
    [ ] Add day_of_month, annual_step_up_pct, start_date, end_date, linked_bank to sip_schedules
    [ ] Add asset_images table to schema
    [ ] Update Asset TypeScript interface with all missing fields
    [ ] Update SIPSchedule TypeScript interface with all missing fields
    [ ] Add AssetImage TypeScript interface
    [ ] Add 4 missing asset types to seed: digital_gold, physical_gold, sgb, ppf
    [ ] Create AssetTypeFieldConfig.ts with all 8 type configs (mutual_fund, equity, sgb, real_estate, digital_gold, physical_gold, fd, ppf)

[ ] API Integration
    [ ] Create src/api/assets/assetsApi.ts with all endpoint functions
    [ ] GET /api/v1/assets — fetch asset list + portfolio summary (backend JSON endpoint)
    [ ] POST /api/v1/assets — create asset
    [ ] GET /api/v1/assets/lookup/equity?ticker= — equity name auto-fill
    [ ] POST /api/v1/assets/refresh-prices — trigger price refresh (returns JSON)
    [ ] GET /api/v1/assets/import/template — download CSV template
    [ ] POST /api/v1/assets/bulk-upload — bulk import
    [ ] PUT /api/v1/assets/{id} — update asset
    [ ] DELETE /api/v1/assets/{id} — delete asset
    [ ] GET /api/v1/assets/{id}/image — serve asset photo
    [ ] GET /api/v1/assets/{id}/sip — fetch SIP config
    [ ] POST /api/v1/assets/{id}/sip — save SIP config
    [ ] Backend: token-based auth middleware (Bearer token)

[ ] Yahoo Finance Integration
    [ ] Equity price refresh via backend proxy (POST /api/v1/assets/refresh-prices)
    [ ] Equity name auto-fill via GET /api/v1/assets/lookup/equity
    [ ] Gold price: GC=F × INR=X / 31.1035 (backend)
    [ ] Mutual Fund NAV via AMFI NAVAll.txt (backend)
    [ ] .NS auto-suffix for NSE equity tickers (backend)
    [ ] 24h TTL cache for equity names (backend)
    [ ] 30-min TTL cache for gold price (backend)
    [ ] 1h TTL cache for AMFI NAV map (backend)
    [ ] Soft-fail: keep existing values on Yahoo/AMFI error

[ ] Portfolio Summary
    [ ] Total Portfolio Value (sum of current_value, ₹ formatted)
    [ ] Total Invested (sum of invested_amount)
    [ ] Total Returns (P&L ₹ + %)
    [ ] Monthly SIP total (sum of sip_monthly_amount where is_sip=1) — 4th KPI card

[ ] Holdings List
    [ ] Asset name (tappable → detail screen)
    [ ] ISIN / ticker sub-line (when present)
    [ ] Type chip label
    [ ] Investment date display
    [ ] Quantity display
    [ ] Invested amount (₹)
    [ ] Current value (₹)
    [ ] P&L (₹ and %) with positive/negative color
    [ ] SIP badge (₹/mo) for assets where is_sip=1
    [ ] Type filter tabs (All + 8 types, horizontally scrollable)
    [ ] Filtered holdings list per selected type tab
    [ ] Filtered allocation chart per selected type tab
    [ ] Empty state with "Add First Asset" CTA button
    [ ] Edit button per row
    [ ] Configure SIP button per row (SIP-eligible types only: mutual_fund, equity, digital_gold, ppf)
    [ ] Delete button per row with confirmation dialog

[ ] Asset Details Screen
    [ ] Synthetic performance line chart (8-point, invested → current, Math.sin wobble)
    [ ] Line chart color: green if current >= invested, red if current < invested
    [ ] Key metrics: Invested, Current Value, Total Return (₹), Return %, CAGR, Holding Since
    [ ] CAGR formula: ((current/invested)^(1/max(days/365, 0.25)) - 1) × 100, 0.25yr floor
    [ ] SIP status block (shown only if is_sip=1 and type is SIP-eligible)
    [ ] SIP Configure button in detail view
    [ ] Type-specific detail fields from details_json: purity, location, area, account_no, nominee
    [ ] Asset photo display (Physical Gold)
    [ ] Notes display
    [ ] Edit action button
    [ ] Delete action button (with confirmation dialog)

[ ] Add Asset Form
    [ ] Asset type selector (8 types)
    [ ] Dynamic fields rendered per type via AssetTypeFieldConfig
    [ ] Mutual Fund: ISIN, ticker, units, NAV/purchase price, invested, current, date, monthly SIP, SIP checkbox
    [ ] Equity: ISIN, ticker (auto-fill name on blur), shares, buy price, invested (auto-computed read-only), current, date, monthly SIP, SIP checkbox
    [ ] SGB: ISIN, ticker, bonds, issue price, invested, current, issue date, coupon rate %, maturity date
    [ ] Real Estate: area (sq ft), location/address, purchase price, current value, purchase date
    [ ] Digital Gold: quantity (grams), buy price (₹/gram), invested, current, investment date, monthly SIP, SIP checkbox
    [ ] Physical Gold: weight (grams), purity select (24K/22K/18K/14K), buy price, invested, current, purchase date, photo input
    [ ] Fixed Deposit: FD account number, nominee, principal, interest rate %, start date, maturity date, maturity value
    [ ] PPF: nominee, total invested, current value, interest rate %, account opening date, monthly contribution, SIP checkbox
    [ ] Date pickers for all date fields
    [ ] Investment date: max = today (reject future dates)
    [ ] Maturity date: min = investment/start date
    [ ] Equity: invested auto-computed from shares × buy price; invested field is read-only
    [ ] Image picker for Physical Gold photo (expo-image-picker)
    [ ] Notes field (optional, multiline)

[ ] Edit Asset Form
    [ ] All add-form fields pre-filled from existing asset data
    [ ] details_json fields pre-filled per type
    [ ] Save updates asset in SQLite via update()
    [ ] Navigate back to list or detail on save

[ ] Current Price Refresh
    [ ] "Refresh Prices" button visible in Assets screen header
    [ ] Loading indicator during refresh
    [ ] POST to backend /api/v1/assets/refresh-prices
    [ ] Update local SQLite current_value and current_nav from response
    [ ] Show success toast: "X assets updated"
    [ ] Show error toast on network failure
    [ ] Soft-fail: assets without ticker/ISIN left unchanged

[ ] SIP Configuration
    [ ] SIP amount (₹) TextInput
    [ ] Frequency selector (monthly/quarterly/half-yearly/yearly)
    [ ] Day of month field (1–28)
    [ ] Annual step-up % field
    [ ] Start date picker
    [ ] End date picker (optional, blank = indefinite)
    [ ] Linked bank / source text field
    [ ] Status selector (active/paused)
    [ ] SIP eligibility check: only show SIP button for mutual_fund, equity, digital_gold, ppf
    [ ] Save to sip_schedules table
    [ ] Update assets.is_sip and assets.sip_monthly_amount on SIP save
    [ ] SIP badge appears on asset row after save
    [ ] Monthly SIP KPI updates after save

[ ] Charts
    [ ] Allocation doughnut chart (by asset type, 8-color palette: #4A7C6F, #7FB5A8, #D4956A, #2D3142, #F0B429, #52A77E, #316357, #9DD1C2)
    [ ] Allocation chart updates to per-type internal distribution when type tab selected
    [ ] "Add assets to see allocation." shown inside chart card when allocation is empty
    [ ] Benchmark bar chart (Your % vs Recommended %, 3 risk profiles)
    [ ] Benchmark drift score displayed below bar chart
    [ ] Drift % shown in red if > 30, primary color otherwise
    [ ] Age-based allocation suggestion card (user age, risk profile, drift)
    [ ] Synthetic performance line chart in asset detail view

[ ] Bulk Upload (Nice-to-Have)
    [ ] expo-document-picker for CSV/XLSX file selection
    [ ] Client-side CSV parse via papaparse
    [ ] Column mapping UI (11 importable fields: name, type, quantity, invested, current_value, isin, ticker, investment_date, maturity_date, is_sip, sip_monthly_amount)
    [ ] Row preview table (first 8 rows)
    [ ] Valid/invalid row count display
    [ ] POST to /api/v1/assets/bulk-upload
    [ ] XLSX: direct upload (server-side parse via openpyxl)
    [ ] Download CSV template link

[ ] Benchmark / Allocation Suggestion
    [ ] Benchmark drift calculation ✓ (already in benchmarkComparison)
    [ ] Drift score displayed in UI (currently missing)
    [ ] Age-based suggestion card (user age, risk profile, drift %)
    [ ] Color coding: red if drift > 30

[ ] Error Handling
    [ ] Network error during price refresh (show toast, keep existing values)
    [ ] API error messages (toast or Snackbar)
    [ ] Form validation: required fields highlighted
    [ ] Form validation: no future investment dates
    [ ] Form validation: maturity date must be after start/investment date
    [ ] Image upload errors (size limit, wrong format)
    [ ] CSV parse errors (shown below file input)
    [ ] Empty state on network error (if applicable)

[ ] Loading States
    [ ] Pull-to-refresh (RefreshControl on Screen ScrollView)
    [ ] Price refresh button loading indicator
    [ ] Bulk import "Importing…" state
    [ ] SIP data loading when opening SIP modal
    [ ] Equity name lookup loading indicator (on ticker field)

[ ] Toast Notifications
    [ ] Install and configure toast library (react-native-toast-message or Snackbar)
    [ ] Success toast after add asset
    [ ] Success toast after edit asset
    [ ] Success toast after delete asset
    [ ] Success toast after price refresh (N assets updated)
    [ ] Error toast on any operation failure

[ ] Equity Name Auto-Fill
    [ ] useEquityLookup hook with 400ms debounce
    [ ] Call /api/v1/assets/lookup/equity on ticker field blur
    [ ] Auto-fill name input if name is blank or previously auto-filled
    [ ] Handle offline/error silently (no crash)

[ ] Delete Asset
    [ ] Confirmation dialog ✓ (already implemented)
    [ ] DELETE from SQLite ✓ (already implemented)
    [ ] CASCADE delete sip_schedules (ON DELETE CASCADE in schema)
    [ ] CASCADE delete asset_images (ON DELETE CASCADE in schema)
    [ ] Toast on success
    [ ] Navigate back if deleted from detail screen
```

---

# 13. Migration Risk Assessment

## Risk 1: Paise Integer Convention in New Schema Columns
**Description:** New columns `sip_monthly_amount`, `current_nav`, `price_per_unit` must store paise integers (1 ₹ = 100 paise). Any mobile UI displaying these must divide by 100 via `paiseToRupees()`. Any form saving these must multiply by 100 via `rupeesToPaise()`.
**Impact:** If a developer stores ₹1,500 as `1500` (not `150000`), displayed values will be 100× too small. Portfolio calculations will be incorrect.
**Mitigation:** Add `// paise` JSDoc comments to every new integer money column. Use `formatINR(paise)` exclusively for display, never raw division.

---

## Risk 2: investment_date vs purchase_date Column Name Mismatch
**Description:** The browser schema uses `investment_date`. The mobile schema uses `purchase_date`. Both refer to the same concept (purchase date).
**Impact:** If not reconciled, queries and TypeScript interfaces will be inconsistent. Code written using `investment_date` will silently return `null` against mobile SQLite (the column does not exist).
**Mitigation:** In TASK-001, add `investment_date TEXT` as a new column alongside `purchase_date`. Keep `purchase_date` for backwards compatibility with existing seed data. All new code should use `investment_date`. The seed migration in TASK-002 should populate `investment_date` from `purchase_date` for existing rows.

---

## Risk 3: Asset Type Slug Mismatch (5 vs 8 types; `gold` not in browser)
**Description:** Mobile seed uses 5 types with slug `gold`. Browser has 8 types — no `gold` slug; it uses `digital_gold`, `physical_gold`, `sgb` instead. After TASK-002, `AssetTypeFieldConfig` will have no entry for the `gold` slug.
**Impact:** Existing demo assets seeded with `gold` type will not render type-specific form fields. The benchmark `BENCH_CLASS` mapping will not correctly pool gold types for existing `gold` records.
**Mitigation:** In TASK-002, decide whether to rename `gold` → `digital_gold` in seed (breaking: existing seeded data has `gold` type_id) or keep `gold` as a legacy slug with a fallback in `AssetTypeFieldConfig`. Recommended: keep `gold` mapped to `digital_gold` config in `ASSET_TYPE_KEY_MAP`.

---

## Risk 4: details_json Parsing
**Description:** Type-specific fields (area, location, purity, account_no, nominee) are stored as a JSON blob in `details_json TEXT`. Rendering these in `AssetDetailScreen` requires parsing and knowing which fields to show per type.
**Impact:** Displaying wrong fields, null values, or crashes if JSON is malformed.
**Mitigation:** Always wrap `JSON.parse(details_json)` in try/catch with fallback to `{}`. Use `ASSET_CONFIGS[typeKey].sections` to enumerate displayable fields. Apply the same exclusion list as browser's `renderDetail()` (skip: `invested`, `current_value`, `investment_date`, `notes`, `image`, `active_sip`).

---

## Risk 5: Synthetic Performance Chart Not Real Price History
**Description:** The performance line chart in `AssetDetailScreen` (`renderPerf()` equivalent) generates a fake curve using `Math.sin` wobble between invested and current values. This is identical behavior to the browser — neither version shows actual historical prices.
**Impact:** Users may be misled into thinking the chart shows real price history.
**Mitigation:** Label the chart "Illustrative" or add a footnote "Simulated performance". This matches or improves on the browser's unlabeled synthetic chart.

---

## Risk 6: Yahoo Finance API Stability
**Description:** The `v8` chart endpoint (`https://query1.finance.yahoo.com/v8/finance/chart/`) is unofficial and undocumented. It has changed previously.
**Impact:** Price refresh could silently fail for all assets, leaving stale values permanently (soft-fail means no error is shown).
**Mitigation:** Soft-fail is already implemented in the backend. Add a `last_refreshed_at` timestamp column to `assets` to display when prices were last updated. Monitor backend logs for HTTP 403/429 from Yahoo Finance.

---

## Risk 7: No Backend for Phase 4 (API Tasks)
**Description:** TASK-017 and TASK-018 require backend API changes (JSON endpoints, token auth). The current FastAPI backend serves HTML pages only.
**Impact:** Price refresh and equity lookup features are blocked until backend is updated. The local-SQLite-only app achieves ~80% feature parity without a backend.
**Mitigation:** Design mobile to degrade gracefully — show "Prices not refreshed" banner instead of crashing when backend is unreachable. Implement Phases 1–3 (local-first) fully before touching Phase 4.

---

## Risk 8: expo-sqlite Synchronous API on Large Datasets
**Description:** The mobile app uses `expo-sqlite` synchronous API exclusively. All queries run on the main thread.
**Impact:** For users with 100+ assets, `portfolioSummary()` (queries all assets + joins) may cause UI jank on older Android devices.
**Mitigation:** expo-sqlite v14+ supports async API. Consider migrating `useData` to use async SQLite calls for performance-sensitive queries in a future phase.

---

## Risk 9: SIP Monthly Amount Dual Storage
**Description:** The browser stores SIP amount in two places: `Asset.sip_monthly_amount` (denormalized) and `SIPSchedule.amount`. These can drift out of sync.
**Impact:** Monthly SIP KPI (`portfolioSummary.monthly_sip`) reads from `assets.sip_monthly_amount`. If only `sip_schedules.amount` is updated, the KPI will show stale data.
**Mitigation:** In `useSIPConfig.ts` save function, always update both `sip_schedules.amount` and `assets.sip_monthly_amount` atomically via `tx()`. When SIP is deleted or paused, also set `assets.is_sip = 0` and `assets.sip_monthly_amount = 0`.

---

## Risk 10: expo-image-picker — Android Permissions
**Description:** expo-image-picker behavior differs between iOS and Android, especially for file URI handling and runtime permissions (`READ_MEDIA_IMAGES` on Android 13+).
**Impact:** Physical Gold photo upload may work on iOS but fail on Android.
**Mitigation:** Use `expo-image-picker` with `requestMediaLibraryPermissionsAsync()`. Store only the copied file URI in `asset_images.image_path` using `expo-file-system.copyAsync()` to the app's document directory. Test on both platforms before shipping.

---

## Risk 11: Browser-Only Web APIs Used in Browser (No Mobile Equivalent)
The following browser APIs used in `list.html` have no direct React Native equivalent:
- `FileReader` (line 652 — CSV reading): Mobile alternative: `expo-file-system` `readAsStringAsync`.
- `DataTransfer` (line 664 — XLSX attachment): Not applicable in RN; use `expo-document-picker` directly.
- `File`/`Blob` (lines 671–672 — CSV POST): Mobile: construct `FormData` with `{ uri, name, type }` object.
- `canvas` element: Chart.js requires `<canvas>`. Mobile uses `react-native-chart-kit` (already solved).
- `Date.now()` / `new Date()`: Available in React Native ✓.
**Mitigation:** All already have identified mobile alternatives. The CAGR utility uses `Date.now()` safely.

---

## Risk 12: CSRF Token Not Needed; Token Auth Not Yet Implemented
**Description:** The browser web app uses a double-submit CSRF cookie pattern. Mobile apps cannot use httponly cookies.
**Impact:** Phase 4 API calls will fail if the backend does not add a token-based auth path.
**Mitigation:** Backend needs `POST /api/v1/auth/login` → Bearer token. Mobile sends `Authorization: Bearer <token>` on every API call. This is scoped to Phase 4 only; Phases 1–3 are local-first and don't need auth.

---

# 14. Final Implementation Blueprint

This section provides a step-by-step specification for an engineer who does not have access to the browser codebase.

## 14.1 Recommended Final Directory Structure

```
src/
├── app/
│   ├── _layout.tsx                        # Modified: drawer; assets entry → assets/
│   └── assets/
│       ├── _layout.tsx                    # New: Stack.Navigator for assets
│       ├── index.tsx                      # Re-exports AssetsScreen
│       ├── [id].tsx                       # Re-exports AssetDetailScreen
│       └── [id]/
│           └── edit.tsx                   # Re-exports EditAssetScreen
│
├── screens/
│   ├── AssetsScreen.tsx                   # Modified: major refactor
│   └── assets/
│       ├── AssetDetailScreen.tsx          # New
│       └── EditAssetScreen.tsx            # New
│
├── components/
│   └── assets/
│       ├── AssetTypeTabs.tsx              # New
│       ├── AssetRow.tsx                   # New
│       ├── AssetForm.tsx                  # New
│       ├── AssetTypeFieldConfig.ts        # New
│       ├── PerformanceChart.tsx           # New
│       ├── SIPModal.tsx                   # New
│       └── BulkUploadModal.tsx            # New (Phase 5)
│
├── hooks/
│   └── assets/
│       ├── useSIPConfig.ts                # New
│       ├── useRefreshPrices.ts            # New (Phase 4)
│       ├── useEquityLookup.ts             # New (Phase 4)
│       └── useBulkUpload.ts               # New (Phase 5)
│
├── api/
│   └── assets/
│       ├── assetsApi.ts                   # New (Phase 4)
│       └── types.ts                       # New (Phase 4)
│
├── db/
│   ├── schema.ts                          # Modified: new columns + tables
│   ├── index.ts                           # Unchanged
│   └── seed.ts                            # Modified: new asset types + SIP data
│
├── models/
│   └── types.ts                           # Modified: Asset, SIPSchedule, + AssetImage
│
├── services/
│   ├── finance.ts                         # Modified: portfolioSummary monthly_sip
│   └── constants.ts                       # Modified: SIP_ELIGIBLE_TYPES, ASSET_TYPE_KEY_MAP
│
└── utils/
    ├── cagr.ts                            # New
    ├── money.ts                           # Unchanged
    └── date.ts                            # Unchanged
```

---

## 14.2 Schema Changes (exact SQL additions)

In `src/db/schema.ts`, inside `CREATE TABLE IF NOT EXISTS assets`, add after `notes TEXT`:

```sql
  isin TEXT,
  ticker TEXT,
  is_sip INTEGER NOT NULL DEFAULT 0,
  sip_monthly_amount INTEGER NOT NULL DEFAULT 0,
  current_nav INTEGER,
  price_per_unit INTEGER,
  investment_date TEXT,
  maturity_date TEXT,
  guaranteed_return_pct REAL,
  details_json TEXT
```

In `CREATE TABLE IF NOT EXISTS sip_schedules`, add after `status TEXT`:

```sql
  day_of_month INTEGER NOT NULL DEFAULT 5,
  annual_step_up_pct REAL NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  linked_bank TEXT
```

Add new table after `sip_schedules`:

```sql
CREATE TABLE IF NOT EXISTS asset_images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  created_at TEXT NOT NULL
);
```

---

## 14.3 Updated TypeScript Interfaces (exact additions)

In `src/models/types.ts`, update `Asset` with new optional fields:

```typescript
export interface Asset {
  // ... existing fields unchanged ...
  // new fields (all nullable for backwards compat with existing rows)
  isin: string | null;
  ticker: string | null;
  is_sip: boolean;                    // stored as 0|1 in SQLite
  sip_monthly_amount: number;         // paise
  current_nav: number | null;         // paise per unit/share/gram
  price_per_unit: number | null;      // paise, at purchase time
  investment_date: string | null;     // ISO date, preferred over purchase_date
  maturity_date: string | null;
  guaranteed_return_pct: number | null;
  details_json: string | null;        // JSON: {purity?, area?, location?, account_no?, nominee?}
}
```

Update `SIPSchedule`:

```typescript
export interface SIPSchedule {
  // ... existing fields unchanged ...
  day_of_month: number;               // 1–28
  annual_step_up_pct: number;
  start_date: string | null;
  end_date: string | null;            // null = indefinite
  linked_bank: string | null;
}
```

Add:

```typescript
export interface AssetImage {
  id: string;
  user_id: string;
  asset_id: string;
  image_path: string;
  mime_type: string;
  created_at: string;
}
```

---

## 14.4 AssetTypeFieldConfig.ts — Full Field Specification per Type

Port of `assetConfigs` from `list.html` lines 285–377. All 8 types must be present. Key notes per type:

**mutual_fund:** Sections: Identifiers (isin optional, ticker optional), Investment Details (units→quantity, purchase_price→price_per_unit optional, invested→invested_amount, current_value, investment_date, sip→sip_monthly_amount optional), SIP checkbox (active_sip→is_sip), Notes.

**equity:** Sections: Identifiers (isin optional, ticker — triggers name auto-fill), Investment Details (shares→quantity, buy_price→price_per_unit, invested→invested_amount READ-ONLY AUTO-COMPUTED, current_value, investment_date, sip→sip_monthly_amount optional), SIP checkbox (active_sip→is_sip), Notes.

**sgb:** Sections: Identifiers (isin optional, ticker optional), Investment Details (bonds→quantity, issue_price→price_per_unit, invested→invested_amount, current_value, investment_date), Bond Details (coupon→guaranteed_return_pct %, maturity_date isMaturityDate=true), Notes.

**real_estate:** Sections: Property Details (area→details_json.area sq ft, location→details_json.location), Investment Details (purchase_price→invested_amount, current_value, investment_date), Notes.

**digital_gold:** Sections: Investment Details (quantity grams, buy_price→price_per_unit ₹/gram, invested→invested_amount, current_value, investment_date, sip→sip_monthly_amount optional), SIP checkbox (active_sip→is_sip), Notes.

**physical_gold:** Sections: Gold Details (weight→quantity grams, purity→details_json.purity select: 24K/22K/18K/14K), Investment Details (buy_price→price_per_unit, invested→invested_amount, current_value, purchase_date→investment_date), Photo (image file), Notes.

**fd:** Sections: Account Details (account_no→details_json.account_no, nominee→details_json.nominee), Investment Details (principal→invested_amount, interest_rate→guaranteed_return_pct %, start_date→investment_date, maturity_date isMaturityDate=true, maturity_value→current_value), Notes.

**ppf:** Sections: Account Details (nominee→details_json.nominee), Investment Details (total_invested→invested_amount, current_value, interest_rate→guaranteed_return_pct %, account_opening_date→investment_date, monthly_contribution→sip_monthly_amount optional), SIP checkbox (active_sip→is_sip, label "Regular contributions active"), Notes.

---

## 14.5 CAGR Utility (`src/utils/cagr.ts`)

```typescript
/**
 * CAGR estimate. Port of list.html cagr() method (lines 599–604).
 * Floor of 0.25 years prevents near-zero holding time blowing up the result.
 * Inputs are paise integers; output is % rounded to 1 decimal.
 */
export function cagrEstimate(
  investedPaise: number,
  currentPaise: number,
  investmentDateISO: string | null,
): number {
  if (!investedPaise || investedPaise <= 0 || !investmentDateISO) return 0;
  const days = (Date.now() - new Date(investmentDateISO + 'T00:00:00').getTime()) / 86400000;
  const yrs = Math.max(days / 365, 0.25);
  const ratio = currentPaise / investedPaise;
  if (ratio <= 0) return 0;
  return Math.round((Math.pow(ratio, 1 / yrs) - 1) * 1000) / 10;
}
```

---

## 14.6 Synthetic Performance Data Generator

```typescript
// Inside src/components/assets/PerformanceChart.tsx
export function generatePerfData(investedPaise: number, currentPaise: number): number[] {
  const start = investedPaise / 100;  // to rupees
  const end = currentPaise / 100;
  const points = 8;
  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const wobble = Math.sin(i * 1.3) * Math.abs(end - start) * 0.08;
    return Math.round(start + (end - start) * t + wobble);
  });
}
```

Pass to `TrendLine` as a single dataset. Use `palette.good` color if `currentPaise >= investedPaise`, `palette.danger` otherwise. Y-axis labels in ₹k (divide by 1000).

---

## 14.7 portfolioSummary — Updated Return Shape

```typescript
export const portfolioSummary = (userId: string) => {
  // ... existing query unchanged ...
  const monthly_sip = assets
    .filter(a => (a as any).is_sip)
    .reduce((s, a) => s + ((a as any).sip_monthly_amount || 0), 0);
  const active_sips = assets.filter(a => (a as any).is_sip).length;
  return {
    total_invested,
    total_value,
    total_pnl,
    pnl_pct: total_invested ? Number(((total_pnl / total_invested) * 100).toFixed(2)) : 0,
    asset_count: assets.length,
    monthly_sip,      // new: paise
    active_sips,      // new: count
    allocation,
  };
};
```

---

## 14.8 Navigation Setup (Expo Router v3)

Remove `src/app/assets.tsx`. Create directory `src/app/assets/` with:

**`src/app/assets/_layout.tsx`:**
```typescript
import { Stack } from 'expo-router';
export default function AssetsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Asset Detail' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Asset', presentation: 'modal' }} />
    </Stack>
  );
}
```

**`src/app/assets/index.tsx`:** `export { default } from '@/screens/AssetsScreen';`
**`src/app/assets/[id].tsx`:** `export { default } from '@/screens/assets/AssetDetailScreen';`
**`src/app/assets/[id]/edit.tsx`:** `export { default } from '@/screens/assets/EditAssetScreen';`

In `AssetsScreen`, navigate: `router.push('/assets/' + asset.id)` for detail, `router.push('/assets/' + asset.id + '/edit')` for edit.

---

## 14.9 API Client Design (Phase 4 only)

Create `src/api/client.ts` with Axios instance:

```typescript
import axios from 'axios';
export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 15000,
});
apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

Backend additions required for Phase 4:
1. `GET /api/v1/assets/lookup/equity?ticker={ticker}` — JSON auth endpoint
2. `POST /api/v1/assets/refresh-prices` — JSON response `{updated, candidates, errors[]}`
3. Token-based auth middleware (`Authorization: Bearer <token>`)

---

## 14.10 Testing Strategy

### Unit Tests (Jest)
- `src/utils/__tests__/cagr.test.ts`: Test `cagrEstimate(10000000, 15000000, '2024-06-19')` → ~41.4%. Test 0.25yr floor (same-day purchase). Test zero invested returns 0. Test negative P&L returns negative CAGR.
- `src/utils/__tests__/money.test.ts`: Test `formatINR(123456700)` → `₹12,34,567` (Indian grouping). Test `rupeesToPaise('1500.50')` → `150050`. Test `paiseToRupees(0)` → `0`. Test `formatINRCompact(10700000)` → `₹1.07Cr`.
- `src/services/__tests__/finance.test.ts`: Test `portfolioSummary()` with SIP assets returns correct `monthly_sip`. Test `benchmarkComparison()` drift excludes Real Estate. Test drift score with 0 assets returns 0.

### Component Tests (React Native Testing Library)
- `AssetForm` renders correct fields for each of 8 `typeKey` values: check ISIN field present in `mutual_fund`; check purity select present in `physical_gold`; check ISIN absent in `real_estate`.
- `AssetForm` equity type: invested field is disabled/read-only; changing shares or buy_price updates invested.
- `AssetRow` shows SIP `Chip` badge when `asset.is_sip = true`.
- `AssetRow` hides SIP button for `real_estate` and `physical_gold` types.
- `AssetsScreen` renders 4 KPI cards after Phase 1 migration.

### End-to-End Tests (Maestro or Detox)
- Add a Mutual Fund asset (all fields) → verify appears in holdings list with ISIN sub-line and correct P&L.
- Tap asset → verify detail screen shows CAGR value and key metrics.
- Edit asset → change current value → verify P&L updates in list.
- Configure SIP → verify SIP badge appears on asset row and Monthly SIP KPI updates.
- Select type tab "Equity" → verify only Equity assets shown; allocation chart updates.
- Delete asset → confirm dialog → verify removed from list.

### Manual QA Checklist
- Verify Indian number grouping: ₹12,34,567 (not ₹1,234,567) on all money displays.
- Verify CAGR edge case: asset bought today shows very small % (0.25yr floor applied).
- Verify purity select shows 24K/22K/18K/14K options only for Physical Gold.
- Verify investment date rejects future dates.
- Verify maturity date for FD is required; for PPF is optional.
- Verify SIP Configure button does NOT appear on Real Estate, Physical Gold, SGB, FD rows.
- Verify allocation chart updates to per-type distribution when a type filter tab is selected.
- Verify benchmark drift card shows red text when drift > 30%.
- Verify synthetic performance chart color is green when current > invested, red otherwise.
- Verify deleting an asset also removes its SIP schedule (cascade delete).

---

# 15. Final Summary Statistics

| Metric | Count |
|---|---|
| **Total browser features analyzed** | 32 |
| **Mobile features fully implemented** | 8 |
| **Mobile features partially implemented** | 6 |
| **Mobile features missing** | 18 |
| **Total APIs to migrate** | 11 |
| **External integrations to migrate** | 4 (Yahoo Finance equity price, Yahoo Finance equity name, Yahoo Finance gold price via GC=F+INR=X, AMFI NAVAll.txt) |
| **Estimated new files to create** | 17 |
| **Estimated existing files to modify** | 7 |
| **Total files impacted** | 24 |

### Fully Implemented (8)
1. Portfolio Total Value KPI
2. Portfolio Invested KPI
3. Portfolio P&L KPI (₹ + %)
4. Allocation Doughnut Chart (base, no type drilldown)
5. Benchmark Bar Chart (actual vs recommended)
6. Per-Asset P&L Calculation
7. Confirm Delete Dialog
8. Delete Asset Operation

### Partially Implemented (6)
1. Add Asset Form (generic fields only; missing all 8 type-specific field sets)
2. Holdings List (missing SIP badge, ISIN/ticker, date, qty, edit/view buttons)
3. Portfolio KPI Bar (missing Monthly SIP — 4th card)
4. Allocation Chart (missing per-type drilldown and empty state text)
5. Benchmark Drift (calculated but not displayed in UI)
6. Empty State (renders correctly but missing CTA action buttons)

### Missing (18)
1. Asset Type Filter Tabs
2. Edit Asset (screen + form pre-fill)
3. Asset Detail Screen
4. SIP Configuration Modal
5. Refresh Prices Button
6. Yahoo Finance Equity Price Integration
7. Yahoo Finance Equity Name Lookup
8. Yahoo Finance Gold Price (GC=F × INR=X)
9. AMFI Mutual Fund NAV Integration
10. Monthly SIP Total KPI
11. Type-Specific Add/Edit Form Fields (all 8 types)
12. Synthetic Performance Line Chart (detail view)
13. CAGR Estimate Utility + Display
14. Age-Based Allocation Suggestion Card
15. Toast Notifications
16. Loading States (pull-to-refresh, operation indicators)
17. Notes Field (UI to enter and display)
18. Asset Photo Upload + Display (Physical Gold)

---

*End of ASSETS_GAP_ANALYSIS.md*
