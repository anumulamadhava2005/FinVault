# ASSETS_MIGRATION_PLAN.md
# FinVault — Assets Feature: Practical Mobile Migration Plan

> **Sources:** `ASSETS_FEATURE_ANALYSIS.md` (browser ground truth) · `ASSETS_GAP_ANALYSIS.md` (gap analysis)
> **Mobile stack:** Expo SDK 56, Expo Router, expo-sqlite (sync), react-native-paper, react-native-chart-kit, TypeScript
> **Date:** 2026-06-19

---

## Overview

The Assets feature is the most complex screen in FinVault. The browser version spans 11 server routes, 4 external API integrations, 8 asset types with distinct form fields, and 3 interactive chart types. The mobile implementation today is a single monolithic screen covering roughly 25% of that surface area.

This plan organises all remaining work into 3 sequentially executable phases. Each phase is independently deployable and can be tested in isolation. The phases are ordered so that each one increases user-facing value and later phases never block earlier ones.

---

# Phase 1 — Core Assets Migration

**Goal:** Make the Assets feature fully functional end-to-end for all 8 asset types. A user completing this phase should be able to add, view, edit, and delete any asset type; see accurate portfolio KPIs including monthly SIP; see prices refreshed from live market data; and have full loading and error feedback on every operation.

---

## Features Included

### 1. Complete Data Layer
- Add all 10 missing columns to the `assets` table: `isin`, `ticker`, `is_sip`, `sip_monthly_amount`, `current_nav`, `price_per_unit`, `investment_date`, `maturity_date`, `guaranteed_return_pct`, `details_json`
- Add all 5 missing columns to `sip_schedules`: `day_of_month`, `annual_step_up_pct`, `start_date`, `end_date`, `linked_bank`
- Add the `asset_images` table (for Phase 2 photo display)
- Add 4 missing asset types to seed data: `digital_gold`, `physical_gold`, `sgb`, `ppf`
- Resolve `gold` → `digital_gold` legacy slug mapping

### 2. TypeScript Model Updates
- Update `Asset` interface with all 10 new fields (nullable where appropriate)
- Update `SIPSchedule` interface with all 5 new fields
- Add `AssetImage` interface
- Add `AssetDetail` interface (parsed shape of `details_json`)
- Add `PortfolioSummaryResult` interface (formally type the return of `portfolioSummary()`)

### 3. Business Logic — Portfolio Summary
- Extend `portfolioSummary()` to compute and return `monthly_sip` (sum of `sip_monthly_amount` where `is_sip = 1`) and `active_sips` count
- Surface both in the AssetsScreen as the 4th KPI card ("Monthly SIP")

### 4. Business Logic — CAGR Utility
- Port the browser `cagr()` method from `list.html` lines 599–604
- Formula: `((current / invested) ^ (1 / max(days / 365, 0.25)) - 1) × 100`
- 0.25-year floor prevents division instability on same-day or near-same-day purchases
- Used in AssetDetailScreen (Phase 2) and in the asset row metrics if desired

### 5. Asset Type Field Configuration
- Create `AssetTypeFieldConfig.ts` as a TypeScript port of the browser's `assetConfigs` JS object (8 type configs)
- Each config specifies: section headers, field names, field types (text / number / date / select / checkbox / image / computed), mapping to schema column names, validation rules
- Add `SIP_ELIGIBLE_TYPES` and `ASSET_TYPE_KEY_MAP` to `constants.ts`

### 6. Navigation Structure Refactor
- Replace flat `src/app/assets.tsx` with a Stack navigator under the assets drawer entry
- Register `index` (list), `[id]` (detail), `[id]/edit` (edit modal) as Stack screens
- This unblocks AssetDetailScreen and EditAssetScreen in this phase

### 7. AssetRow Component
- Full per-asset list row: tappable name, ISIN/ticker sub-label, type chip, investment date, quantity, Invested / Current / P&L trio, SIP badge (if `is_sip`), action buttons (View, Edit, Configure SIP, Delete)
- SIP button only rendered for `SIP_ELIGIBLE_TYPES` (`mutual_fund`, `equity`, `digital_gold`, `ppf`)
- P&L colour-coded (green / red)

### 8. AssetForm — Type-Specific Dynamic Form
- Replace the current 5-field generic dialog with a full dynamic form driven by `AssetTypeFieldConfig`
- All 8 type field sets rendered correctly
- Equity type: invested amount auto-computed from `shares × buy_price`; invested field is read-only
- Date pickers for `investment_date`, `maturity_date`, `start_date`
- `investment_date` capped to today (no future dates)
- `maturity_date` validation: must be after `investment_date` / `start_date`

### 9. EditAssetScreen
- Reuses `AssetForm` with `initialValues` pre-filled from existing asset row + parsed `details_json`
- Saves via `update('assets', id, {...})` then calls `refresh()` and navigates back

### 10. AssetsScreen Refactor
- 4 KPI cards: Portfolio Value, Invested, P&L, Monthly SIP
- Holdings list using `AssetRow` (replaces anonymous `SectionCard` loop)
- Wired navigation: tap row → `AssetDetailScreen`; Edit button → `EditAssetScreen`; SIP button → `SIPModal` (Phase 2)
- Empty state with "Add First Asset" CTA button
- Pull-to-refresh via `RefreshControl`

### 11. Loading States
- `ActivityIndicator` while `useData` is re-loading on focus
- Separate loading flag for async price refresh operation
- Disabled state on buttons while any operation is in-flight

### 12. Error States + Toast Notifications
- Install and configure a toast/snackbar library (react-native-paper `Snackbar` or `react-native-toast-message`)
- Success toast: "Asset added", "Asset updated", "Asset deleted"
- Error toast: any SQLite mutation failure surfaced to user
- Add root `Toast` provider in `_layout.tsx`

### 13. Price Refresh — Backend Proxy
- "Refresh Prices" button in AssetsScreen header
- POSTs to backend `POST /api/v1/assets/refresh-prices`
- On success: writes returned `current_value` / `current_nav` values back to local SQLite, then calls `refresh()`
- On error: shows error toast; existing local values preserved (soft-fail)
- Loading indicator on the refresh button during the call

### 14. Equity Name Auto-Fill
- `useEquityLookup` hook with 400ms debounce on ticker field change
- GETs `/api/v1/assets/lookup/equity?ticker={ticker}` → `{name, price}`
- Auto-fills asset name input if name is blank or was previously auto-filled
- Silently no-ops when offline or backend unavailable

### 15. Yahoo Finance Integrations (via Backend)
- **Equity prices:** Backend calls `GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d` → `meta.regularMarketPrice`. Auto-appends `.NS` for NSE tickers.
- **Equity name lookup:** Same Yahoo Finance chart endpoint; 24h server-side cache.
- **Gold price:** Backend calls `GC=F` (USD/troy oz) and `INR=X` (USD-INR rate) → `usd_oz × usd_inr / 31.1035` to get ₹/gram. 30-min cache.
- **Mobile role:** Mobile only POSTs to backend proxy endpoints; never calls Yahoo Finance directly.

### 16. AMFI Integration (via Backend)
- Backend fetches `https://www.amfiindia.com/spages/NAVAll.txt` (semicolon-delimited plain text)
- Parses `ISIN → float NAV` map; 1-hour cache
- Updates `current_value` and `current_nav` for Mutual Fund assets on price refresh
- Mobile writes the returned values to local SQLite; no direct AMFI call from mobile

---

## APIs Included

| # | Endpoint | Direction | Purpose |
|---|---|---|---|
| 1 | `POST /api/v1/assets/refresh-prices` | Mobile → Backend | Trigger Yahoo Finance + AMFI price refresh; returns `{updated, candidates, errors[]}` |
| 2 | `GET /api/v1/assets/lookup/equity?ticker=` | Mobile → Backend | Equity name auto-fill; 24h TTL cache on backend |

**Backend prerequisites (not mobile work):**
- Both endpoints must be added to the FastAPI app with Bearer token auth
- Mobile sends `Authorization: Bearer <token>` on both calls
- `POST /api/v1/auth/login` or equivalent token issue endpoint required

---

## Files to Create

| File | Purpose |
|---|---|
| `src/db/schema.ts` *(modified — see Files to Modify)* | — |
| `src/utils/cagr.ts` | CAGR estimate utility (port of browser `cagr()`) |
| `src/components/assets/AssetTypeFieldConfig.ts` | Field configs for all 8 asset types |
| `src/components/assets/AssetRow.tsx` | Full-detail per-asset row component |
| `src/components/assets/AssetForm.tsx` | Dynamic form driven by `AssetTypeFieldConfig` |
| `src/screens/assets/EditAssetScreen.tsx` | Edit asset screen (reuses AssetForm) |
| `src/hooks/assets/useRefreshPrices.ts` | Backend price refresh hook |
| `src/hooks/assets/useEquityLookup.ts` | Debounced equity name lookup hook |
| `src/api/client.ts` | Axios instance with Bearer token interceptor |
| `src/api/assets/assetsApi.ts` | Typed API functions for both Phase 1 endpoints |
| `src/app/assets/_layout.tsx` | Stack navigator for assets screens |
| `src/app/assets/index.tsx` | Re-exports AssetsScreen |
| `src/app/assets/[id]/edit.tsx` | Re-exports EditAssetScreen |

**Total new files: 12** (plus 1 directory restructure)

---

## Files to Modify

| File | Changes |
|---|---|
| `src/db/schema.ts` | Add 10 columns to `assets`, 5 to `sip_schedules`, add `asset_images` table |
| `src/db/seed.ts` | Add `digital_gold`, `physical_gold`, `sgb`, `ppf` types; add `investment_date` population; add gold-type demo assets |
| `src/models/types.ts` | Update `Asset`, `SIPSchedule`; add `AssetImage`, `AssetDetail`, `PortfolioSummaryResult` |
| `src/services/finance.ts` | Add `monthly_sip` and `active_sips` to `portfolioSummary()` |
| `src/services/constants.ts` | Add `SIP_ELIGIBLE_TYPES`, `ASSET_TYPE_KEY_MAP` |
| `src/screens/AssetsScreen.tsx` | 4-KPI bar, `AssetRow` holdings list, navigation wiring, pull-to-refresh, loading/error states, toast calls, Refresh Prices button |
| `src/app/_layout.tsx` | Change `assets` drawer entry to point to stack `assets/` folder |

**Total files to modify: 7**

---

## Dependencies

**Internal (must exist before Phase 1 work begins):**
- `src/db/schema.ts` migration complete before any screen work
- `src/models/types.ts` update complete before `AssetForm`, `AssetRow`, `AssetsScreen` work
- `src/components/assets/AssetTypeFieldConfig.ts` complete before `AssetForm`
- `src/components/assets/AssetForm.tsx` complete before `EditAssetScreen`
- `src/app/assets/_layout.tsx` complete before `EditAssetScreen` route is reachable

**External packages (already installed or needs install):**
- `axios` — HTTP client for API calls (check `package.json`; install if absent)
- `react-native-paper` `Snackbar` — already installed ✓ (or `react-native-toast-message` if preferred)
- `@react-native-community/datetimepicker` — date picker for form fields (install if absent)
- `expo-sqlite` — already installed ✓

**Backend prerequisites (out of scope for mobile Phase 1):**
- `POST /api/v1/assets/refresh-prices` JSON endpoint on FastAPI
- `GET /api/v1/assets/lookup/equity` JSON endpoint on FastAPI
- Bearer token auth middleware on FastAPI

---

## Estimated Complexity

| Task | Complexity | Rationale |
|---|---|---|
| Schema migration | Low | SQL column additions; no data migration required for new nullable columns |
| Type updates | Low | TypeScript interface additions; no runtime impact |
| Seed update | Low | Append 4 rows; update existing demo data |
| `portfolioSummary` monthly_sip | Low | 2 extra aggregate lines in existing function |
| CAGR utility | Low | 8-line pure function; direct port from browser JS |
| `AssetTypeFieldConfig` | Low | Transcription task — 8 type configs, no logic |
| Constants update | Low | Add 2 constant objects |
| `useEquityLookup` hook | Low | Debounce + GET; well-understood pattern |
| `useRefreshPrices` hook | Low | Single POST + SQLite batch update |
| API client setup | Low | Axios instance + interceptor |
| Navigation refactor | Medium | File restructure + Stack setup; test drawer still works |
| `AssetRow` component | Medium | Many fields; prop typing; conditional SIP badge |
| `AssetForm` dynamic form | High | 8 type configs × multiple fields; date pickers; equity auto-compute; validation |
| `EditAssetScreen` | Medium | Mostly AssetForm reuse; pre-fill from `details_json` parsing |
| `AssetsScreen` refactor | Medium | Many changes in one file; regression risk on existing chart/benchmark sections |
| Loading / error / toast | Low | Standard patterns; small surface area |
| Price refresh integration | Medium | Requires backend; network error path; local SQLite batch update |
| Equity lookup integration | Medium | Debounce wiring in AssetForm; requires backend |

**Phase 1 Overall Complexity: High** — primarily driven by `AssetForm` (8 type configs × complex field interactions) and the backend API prerequisite for price refresh.

---

# Phase 2 — Advanced Assets Features

**Goal:** Achieve near-complete feature parity with the browser version. A user completing this phase should be able to view a full asset detail screen with performance analytics, configure SIP schedules, filter the holdings list by asset type, and see benchmark drift visualised with contextual suggestions.

---

## Features Included

### 1. Asset Detail Screen
- Full detail view triggered by tapping an asset name in the holdings list
- **Synthetic performance line chart:** 8-point curve from `invested` to `current` with `Math.sin` wobble. Green if `current >= invested`; red otherwise. Labelled "Illustrative" to avoid misleading users.
- **Key metrics grid:** Invested, Current Value, Total Return (₹), Return %, CAGR (from `cagr.ts`), Holding Since (days since `investment_date`)
- **SIP status block:** Shown only when `is_sip = true`. Displays SIP amount/frequency/next due date and a "Configure SIP" button
- **Type-specific details:** Reads `details_json` and `AssetTypeFieldConfig` to render purity, location, area, account_no, nominee, coupon_rate per type. Uses the same exclusion list as the browser (`invested`, `current_value`, `investment_date`, `notes`, `image`, `active_sip` are hidden)
- **Notes display:** Rendered as plain `<Text>` when `notes` is non-empty
- **Actions:** Edit button (navigate to `EditAssetScreen`) and Delete button (confirm dialog, then navigate back to list)

### 2. PerformanceChart Component
- Wraps the existing `TrendLine` chart primitive from `components/charts.tsx`
- `generatePerfData(investedPaise, currentPaise)` produces an 8-point array using `Math.sin` wobble — port of the browser's `renderPerf()` function
- Props: `investedPaise`, `currentPaise`, `color` (green / red derived from caller)
- Y-axis labels in ₹k format using `formatINRCompact`

### 3. SIP Configuration Modal
- Bottom-sheet or `Dialog` with fields: amount (₹), frequency (select: monthly / quarterly / half-yearly / yearly), day of month (1–28), annual step-up %, start date, end date (optional — indefinite if blank), linked bank / source, status (active / paused)
- On save: `insert` or `update` in `sip_schedules` table; also atomically updates `assets.is_sip = 1` and `assets.sip_monthly_amount = amount` via `tx()`
- On SIP pause/delete: atomically sets `assets.is_sip = 0` and `assets.sip_monthly_amount = 0`
- Wired from: asset row SIP button and asset detail screen "Configure SIP" button

### 4. Asset Type Filter Tabs
- Horizontal scrollable tab bar at top of holdings section: "All" tab + one tab per seeded asset type
- Active tab highlighted using theme primary colour
- Selecting a tab: filters `assets` list to matching `asset_type_id`; updates `DistributionPie` to show per-type internal distribution (filtered allocation)
- "All" tab: restores full unfiltered view

### 5. Allocation Chart — Per-Type Drilldown
- When a type tab is active, `DistributionPie` receives the filtered allocation array (assets of that type broken down by sub-metric, e.g. ticker names or sub-categories)
- "Add assets to see allocation." empty state text shown inside the Allocation `SectionCard` when allocation array is empty (instead of hiding the card entirely)

### 6. Benchmark Drift Score Card
- `bench.drift` is already computed by `benchmarkComparison()` but never displayed
- Add a `SectionCard` below the `GroupedBars` benchmark chart: shows drift percentage, colour-coded red if `> 30`, primary colour otherwise
- Text: e.g. "Your portfolio drifts 14% from your benchmark"

### 7. Age-Based Allocation Suggestion Card
- Shows: user age (derived from `user.date_of_birth`), current risk profile, `bench.risk_profile`, drift %
- Visual: RECOMMENDED chip, age text, risk profile name, drift score with colour
- Matches the browser's "Age-based Allocation Suggestion" card in `list.html` lines 93–108

### 8. Notes Field in Add/Edit Form
- Add multiline `TextInput` for `notes` to `AssetForm`
- Display `notes` in `AssetDetailScreen` (already planned above)

---

## APIs Included

No new backend API endpoints are required for Phase 2. All new features are local-SQLite-only (SIP config, detail view, filtering, charts).

The `[id]` route parameter in the navigation structure (already set up in Phase 1) is the only wiring needed.

---

## Files to Create

| File | Purpose |
|---|---|
| `src/screens/assets/AssetDetailScreen.tsx` | Full asset detail screen |
| `src/components/assets/PerformanceChart.tsx` | Synthetic performance line chart component |
| `src/components/assets/AssetTypeTabs.tsx` | Horizontal scrollable type filter tabs |
| `src/components/assets/SIPModal.tsx` | SIP configuration dialog |
| `src/hooks/assets/useSIPConfig.ts` | Read/write hook for `sip_schedules` table |
| `src/app/assets/[id].tsx` | Re-exports AssetDetailScreen (route file) |

**Total new files: 6**

---

## Files to Modify

| File | Changes |
|---|---|
| `src/screens/AssetsScreen.tsx` | Add `AssetTypeTabs`, wire SIP button to `SIPModal`, add allocation drilldown logic, add drift score card, add age-based suggestion card |
| `src/components/assets/AssetForm.tsx` | Add notes `TextInput` field across all 8 type configs |

**Total files to modify: 2**

---

## Dependencies

**Internal (Phase 1 must be complete):**
- `src/app/assets/_layout.tsx` Stack must exist (`[id]` route needs it)
- `src/utils/cagr.ts` must exist (used in `AssetDetailScreen`)
- `src/components/assets/AssetTypeFieldConfig.ts` must exist (used by detail screen to enumerate fields)
- `src/db/schema.ts` with `sip_schedules` missing columns added (Phase 1)
- `src/models/types.ts` `SIPSchedule` with new fields (Phase 1)

**External packages:**
- No new packages required if react-native-paper `Dialog` / bottom sheet is used for `SIPModal`
- Optional: `@gorhom/bottom-sheet` for a more polished SIP sheet

---

## Estimated Complexity

| Task | Complexity | Rationale |
|---|---|---|
| `PerformanceChart` component | Low | `TrendLine` already exists; only the synthetic data generator is new |
| `AssetTypeTabs` component | Low | Horizontal `ScrollView` of `Chip` buttons; standard RN pattern |
| `useSIPConfig` hook | Low | Two SQLite reads + `tx()` write; well-defined shape |
| `SIPModal` component | Medium | Multiple field types; date pickers; atomic dual-table write |
| Asset detail screen | Medium | Many sections to assemble; mostly composition of existing utilities |
| Allocation per-type drilldown | Medium | State management for active tab; conditional query/slice logic |
| Drift score card | Low | Read `bench.drift`; conditional colour; 10 lines of JSX |
| Age-based suggestion card | Low | Read `user.date_of_birth`; compute age; render card |
| Notes field in form | Low | Single `TextInput` addition to AssetForm |

**Phase 2 Overall Complexity: Medium** — no new API integrations; all features are local-first composition of existing primitives and data.

---

# Phase 3 — Validation and Hardening

**Goal:** Make the Assets feature production-ready. This phase adds no new visible features but ensures correctness, reliability, performance, and maintainability.

---

## Features Included

### 1. Unit Test Suite
- `cagrEstimate()`: test standard CAGR, 0.25-year floor, zero invested guard, negative P&L
- `formatINR()`: Indian grouping (₹12,34,567 not ₹1,234,567), paise-to-rupees conversion, compact formatting (₹1.07Cr, ₹4.2L)
- `portfolioSummary()`: with and without SIP assets; `monthly_sip` aggregation; `active_sips` count
- `benchmarkComparison()`: drift calculation excluding Real Estate; zero-asset edge case

### 2. Component Test Suite
- `AssetForm`: renders correct fields for each of the 8 `typeKey` values; invested field is read-only for `equity`; purity select present only for `physical_gold`; SIP checkbox absent for `real_estate`, `physical_gold`, `sgb`, `fd`
- `AssetRow`: SIP badge visible when `is_sip = true`; SIP Configure button absent for ineligible types; P&L negative colour applied correctly

### 3. End-to-End Test Suite (Maestro or Detox)
- Add Mutual Fund → verify in list with ISIN sub-line and correct P&L
- Tap asset → verify detail screen: CAGR value non-zero, key metrics populated
- Edit asset → change current value → P&L updates
- Configure SIP on Mutual Fund → SIP badge appears; Monthly SIP KPI updates
- Select Equity type tab → only Equity assets shown; allocation chart updates
- Delete asset → confirm → removed from list; SIP schedule cascade-deleted

### 4. Edge Case Hardening
- `investment_date` in the future rejected at form validation level (not just server-side)
- `maturity_date` must be strictly after `investment_date`; empty `maturity_date` valid for FD/PPF (optional)
- Quantity = 0 warning (allowed to save but shown as a hint)
- `details_json` parse failure caught with `try/catch`, falls back to `{}`
- `portfolioSummary()` with zero assets returns safe zeroes (not `NaN`)
- CAGR for assets older than 30 years does not overflow
- `SIPModal` amount field: positive integer only; `day_of_month` 1–28 only; `annual_step_up_pct` 0–50 range

### 5. Error Recovery
- Price refresh: exponential backoff on 429/503 (max 2 retries); no retry on 401/403
- Equity lookup: request cancelled on component unmount (debounce cleanup); silent no-op on network error
- SQLite mutation errors: surfaced as toast with a "Try again" action button where possible
- App cold-start with corrupted `details_json` in existing rows: patched to `{}` on first read

### 6. Performance Improvements
- `portfolioSummary()` and `benchmarkComparison()` both do full table scans on main thread; profile on device with 200+ assets
- If jank detected: migrate these two functions to `expo-sqlite` async API (`runAsync` / `getFirstAsync`)
- `AssetForm` conditional rendering: memoize the `AssetTypeFieldConfig` lookup to avoid re-deriving on every keystroke
- `AssetRow` list: wrap in `React.memo` with shallow props comparison; holdings lists of 50+ rows will otherwise re-render entirely on any state change in parent

### 7. Type Safety Improvements
- Enable `strictNullChecks` on new nullable fields (`isin | null`, `ticker | null`, etc.) — ensure all callers guard against `null` before use
- Replace raw `(a as any).is_sip` casts added during Phase 1 rapid iteration with properly typed access now that types are locked
- Audit `details_json` usage: define a discriminated union `AssetDetail` type per asset type key; parse with a type guard

### 8. Security Review
- Confirm `details_json` content is never rendered as raw HTML (it is rendered as `<Text>` in RN — safe ✓)
- Confirm `ticker` and `isin` inputs are passed to backend only as query parameters (never interpolated into SQL on mobile — safe, uses parameterised `insert`/`update` ✓)
- Confirm Bearer token is stored in `expo-secure-store`, not `AsyncStorage`; update `api/client.ts` if needed
- Confirm image URI from `expo-image-picker` is copied to the app's document directory before storing path (raw Camera Roll URIs can be revoked by the OS)

### 9. Accessibility (a11y)
- All interactive elements (`AssetRow`, `AssetTypeTabs` chips, form fields) have `accessibilityLabel` and `accessibilityRole` props
- Colour-coded P&L (red/green) also communicates via text ("+₹1.2L" vs "−₹1.2L") — not colour-only
- `DistributionPie` has `accessibilityLabel` summarising allocation percentages

### 10. Code Cleanup
- Extract inline `const pnl = a.current_value - a.invested_amount` from `AssetsScreen` (from Phase 1 holdover if still present) into a shared `assetPnl(asset)` utility in `utils/money.ts`
- Remove `src/app/assets.tsx` (the old flat entry point) once `src/app/assets/` directory is confirmed working
- Remove `gold` type from seed if all existing demo assets have been migrated to `digital_gold`
- Confirm `TrendLine` in `components/charts.tsx` has no dead code from the pre-Phase-2 period

### 11. Bulk Upload (Nice-to-Have)
- `BulkUploadModal` with `expo-document-picker` for CSV/XLSX file selection
- CSV: parse via `papaparse`; display column mapping UI; preview first 8 rows; POST mapped data to backend `/api/v1/assets/bulk-upload`
- XLSX: direct file upload to backend; server-side `openpyxl` parse
- 11 importable columns: name, type, quantity, invested, current_value, isin, ticker, investment_date, maturity_date, is_sip, sip_monthly_amount
- "Download CSV Template" link pointing to `/api/v1/assets/import/template`

### 12. Asset Photo Support (Nice-to-Have)
- `expo-image-picker` for Physical Gold photo selection on add/edit form
- Copy selected image to `expo-file-system` document directory; store path in `asset_images` table
- Display photo in `AssetDetailScreen` for Physical Gold assets
- Handle Android `READ_MEDIA_IMAGES` permission; iOS `NSPhotoLibraryUsageDescription` info.plist key

---

## Files to Create

| File | Purpose |
|---|---|
| `src/utils/__tests__/cagr.test.ts` | Unit tests for CAGR utility |
| `src/utils/__tests__/money.test.ts` | Unit tests for money formatting utilities |
| `src/services/__tests__/finance.test.ts` | Unit tests for `portfolioSummary` and `benchmarkComparison` |
| `src/components/assets/__tests__/AssetForm.test.tsx` | Component tests for AssetForm per type |
| `src/components/assets/__tests__/AssetRow.test.tsx` | Component tests for AssetRow |
| `e2e/assets.spec.ts` | End-to-end test suite (Maestro or Detox) |
| `src/components/assets/BulkUploadModal.tsx` | Bulk upload wizard (nice-to-have) |
| `src/hooks/assets/useBulkUpload.ts` | Document picker + CSV parse + upload hook (nice-to-have) |

**Total new files: 8** (6 core + 2 nice-to-have)

---

## Files to Modify

| File | Changes |
|---|---|
| `src/api/client.ts` | Switch token storage from `AsyncStorage` to `expo-secure-store` if not already done |
| `src/services/finance.ts` | Async SQLite migration if profiling reveals jank; replace `(a as any)` casts |
| `src/models/types.ts` | Add discriminated union `AssetDetail` type; tighten null types |
| `src/components/assets/AssetRow.tsx` | Add `React.memo`; add `accessibilityLabel`/`accessibilityRole` |
| `src/utils/money.ts` | Add `assetPnl(asset)` utility function |
| `src/screens/AssetsScreen.tsx` | Remove any lingering inline P&L calc; replace with `assetPnl()` |
| `src/components/assets/AssetForm.tsx` | Memoize config lookup; add `expo-image-picker` for physical gold (nice-to-have) |
| `src/screens/assets/AssetDetailScreen.tsx` | Add photo display for physical gold; add `accessibilityLabel` on chart |

**Total files to modify: 8**

---

## Dependencies

**Internal (Phases 1 and 2 must be complete):**
- All Phase 1 and Phase 2 files must be in place before any Phase 3 code review or test writing begins
- Unit tests depend on the finalized function signatures from Phases 1–2

**External packages:**
- `jest` + `@testing-library/react-native` — already configured in Expo SDK 56 projects
- `expo-secure-store` — for secure token storage (may already be installed; check `package.json`)
- `papaparse` — CSV parsing (install if bulk upload is in scope)
- `expo-document-picker` — file selection for bulk upload
- `expo-image-picker` — already available in Expo SDK 56; needs permission config

---

## Estimated Complexity

| Task | Complexity | Rationale |
|---|---|---|
| Unit tests (cagr, money, finance) | Low | Pure functions; straightforward to test |
| Component tests (AssetForm, AssetRow) | Medium | Need RN Testing Library setup; 8 type configs to cover |
| E2E tests | Medium | Maestro/Detox setup overhead; flow scripting |
| Edge case hardening | Low | Validation additions to existing form logic |
| Error recovery (retry, cleanup) | Medium | Async cancellation patterns; retry logic |
| Performance profiling + async SQLite | Medium | Profile-first; migration is mechanical once identified |
| Type safety improvements | Low | Mechanical substitution of `as any` casts |
| Security review | Low | Review-only; fixes are small if issues found |
| Accessibility | Low | Prop additions; no architectural change |
| Code cleanup | Low | Mechanical; no logic changes |
| Bulk upload (nice-to-have) | High | 3-step wizard; CSV mapping; two file formats; backend endpoint |
| Asset photos (nice-to-have) | Medium | Permission handling; file copy; display in detail screen |

**Phase 3 Overall Complexity: Medium** (Low without nice-to-haves; High with both nice-to-haves fully in scope)

---

# Migration Summary

## Feature Counts

| Category | Count |
|---|---|
| Total browser features analysed | 32 |
| Mobile features already fully implemented | 8 |
| Mobile features partially implemented (require extension) | 6 |
| Mobile features entirely missing | 18 |
| **Total features to migrate (partial + missing)** | **24** |

### Already Fully Implemented (8)
Portfolio Total Value KPI · Total Invested KPI · P&L KPI (₹ + %) · Allocation Doughnut Chart (base) · Benchmark Bar Chart · Per-Asset P&L Calculation · Confirm Delete Dialog · Delete Asset Operation

### Partially Implemented — Need Extension (6)
Add Asset Form (generic only) · Holdings List (missing 6 of 9 columns) · Portfolio KPI Bar (3 of 4 cards) · Allocation Chart (missing type drilldown) · Benchmark Drift (calculated, not displayed) · Empty State (missing CTA buttons)

### Missing Entirely (18)
Asset Type Filter Tabs · Edit Asset · Asset Detail Screen · SIP Configuration Modal · Refresh Prices Button · Yahoo Finance Equity Price · Yahoo Finance Equity Name Lookup · Yahoo Finance Gold Price · AMFI Mutual Fund NAV · Monthly SIP Total KPI · Type-Specific Add/Edit Fields · Synthetic Performance Chart · CAGR Estimate Utility · Age-Based Suggestion Card · Toast Notifications · Loading States · Notes Field UI · Asset Photo Upload/Display

---

## API Counts

| Category | Count |
|---|---|
| Total browser API endpoints | 11 |
| Already implemented locally (SQLite-equivalent) | 2 (create, delete) |
| To implement as local SQLite operations | 3 (update, SIP get, SIP save) |
| Require backend JSON endpoint (Phase 1) | 2 (price refresh, equity lookup) |
| Require backend JSON endpoint (Phase 3 nice-to-have) | 4 (bulk upload, template, image serve, asset list JSON) |
| **Total APIs to migrate** | **11** |

---

## External Integration Counts

| Integration | Purpose | Cache TTL | Mobile Approach |
|---|---|---|---|
| Yahoo Finance chart API — equity price | `GET /v8/finance/chart/{symbol}` → `meta.regularMarketPrice` | None (live) | Backend proxy via `POST /api/v1/assets/refresh-prices` |
| Yahoo Finance chart API — equity name | Same endpoint, different use | 24 hours (backend) | Backend proxy via `GET /api/v1/assets/lookup/equity` |
| Yahoo Finance GC=F + INR=X — gold price | USD/troy oz × USD-INR / 31.1035 → ₹/gram | 30 minutes (backend) | Backend proxy via `POST /api/v1/assets/refresh-prices` |
| AMFI NAVAll.txt — MF NAV | Semicolon-delimited ISIN → float NAV | 1 hour (backend) | Backend proxy via `POST /api/v1/assets/refresh-prices` |
| **Total Yahoo Finance integrations** | **4** (equity price, equity name, gold via GC=F, gold via INR=X) | | |
| **Total AMFI integrations** | **1** | | |
| **Total external integrations** | **5** | | |

---

## File Counts

| Category | Phase 1 | Phase 2 | Phase 3 | Total |
|---|---|---|---|---|
| Files to create | 12 | 6 | 8 | **26** |
| Files to modify | 7 | 2 | 8 | **17** |
| **Total files impacted** | **19** | **8** | **16** | **43** |

*Note: Some files modified in Phase 1 are also modified in Phase 3 (e.g. `AssetsScreen.tsx`, `finance.ts`). Total unique files impacted is lower: approximately 30.*

---

## Phase Effort Summary

| Phase | Scope | Complexity | Blocks |
|---|---|---|---|
| Phase 1 — Core Assets Migration | Data layer, forms, API, Yahoo Finance / AMFI, navigation, loading/error states | **High** | Requires 2 backend endpoints before price refresh and equity lookup are testable |
| Phase 2 — Advanced Assets Features | Detail screen, SIP modal, filter tabs, charts, benchmark UI | **Medium** | Requires Phase 1 complete; no backend dependency |
| Phase 3 — Validation and Hardening | Tests, edge cases, error recovery, performance, a11y, security, code cleanup | **Medium** | Requires Phases 1 and 2 complete |

**Recommended execution order:** Phase 1 → Phase 2 → Phase 3.
Phase 2 can begin independently on components that have no Phase 1 dependency (e.g. `PerformanceChart`, `AssetTypeTabs`), but `AssetDetailScreen` and `SIPModal` require the Phase 1 schema and type updates.

---

*End of ASSETS_MIGRATION_PLAN.md*
