# ASSETS_FEATURE_ANALYSIS.md
# FinVault — Assets Feature: Complete Reverse-Engineering Analysis

> **Stack note:** FinVault is a Python/FastAPI + Jinja2 + Alpine.js + Chart.js monolith. It is NOT a React application. This report analyses the web implementation as-is and produces a mobile migration specification targeting Expo React Native.

---

# 1. Assets Feature Overview

## Purpose of the Assets Page

The Assets page (`/assets`) is the central portfolio management screen of FinVault. It lets authenticated users track every financial holding they own — stocks, mutual funds, gold, real estate, fixed deposits, PPF, and sovereign gold bonds — in a single unified view.

## User Workflows

1. **View Portfolio Summary** — On page load the user sees total portfolio value, total amount invested, total returns (₹ and %), and total monthly SIP commitment.
2. **Browse Holdings** — A filterable table lists every asset with name, type, investment date, quantity, invested amount, current value, P&L (₹ and %), and action buttons.
3. **Filter by Asset Type** — Tab navigation filters the table to one of the 8 asset types; the allocation chart updates to show internal distribution within that type.
4. **Add an Asset** — A modal with dynamically rendered fields (different fields per type) lets the user record a new holding. For Equity, the company name auto-fills from the ticker via `/assets/lookup/equity`.
5. **Edit an Asset** — An edit modal pre-fills all fields captured at creation and allows updating any value including optional image upload.
6. **View Asset Detail Drawer** — Clicking an asset name opens a right-side drawer showing a synthetic performance chart, key metrics (invested, current, return, CAGR estimate), SIP status, type-specific details, and an optional photo.
7. **Refresh Prices** — A "Refresh Prices" button POSTs to `/assets/refresh-prices` which fetches live prices from Yahoo Finance (equities, gold) and AMFI (mutual funds).
8. **Configure SIP** — For SIP-eligible types (Mutual Fund, Equity, Digital Gold, PPF), a dedicated SIP modal lets the user set amount, frequency, day of month, step-up %, start/end date, and source bank.
9. **Bulk Upload** — A CSV/XLSX upload modal lets the user import many assets at once with column auto-mapping and a preview before committing.
10. **Delete an Asset** — A confirmation dialog is triggered before deletion; on confirm a form POSTs to `/assets/{id}/delete`.
11. **View Allocation Charts** — A doughnut chart shows portfolio split by asset type; a horizontal bar chart compares actual vs. recommended allocation for the user's risk profile.
12. **View Benchmark Drift** — An age/profile-based allocation suggestion shows how many percentage points the portfolio drifts from the benchmark.

## User Interactions

- Click asset name → open detail drawer
- Click "Edit" → open edit modal
- Click "Delete" → confirm dialog → POST delete
- Click "Refresh Prices" → form POST → redirect with message
- Click "Add Asset" → open add modal; asset type dropdown change → re-render dynamic fields
- Click type tab → navigate to `/assets?type=<slug>`
- Click "Configure SIP" (from table row or drawer) → fetch SIP data → open SIP modal
- Click "Bulk Upload" → file input → CSV parsed in browser → column mapping → POST
- XLSX files skip client-side preview; submitted directly to server

## Business Objectives

- Give users a single source of truth for all investment holdings
- Show real-time portfolio value using live market prices
- Identify allocation drift vs. a risk-profile benchmark
- Track SIP commitments and schedule upcoming payments
- Support bulk data entry from broker exports
- Store type-specific metadata (ISIN, ticker, purity, location, nominee) without schema changes via JSON blob

---

# 2. File Dependency Map

```
Assets Feature
├── app/app/pages.py                    (Route handlers — primary controller)
│   ├── assets_list()                   GET /assets
│   ├── assets_create()                 POST /assets
│   ├── assets_equity_lookup()          GET /assets/lookup/equity
│   ├── assets_refresh_prices()         POST /assets/refresh-prices
│   ├── assets_import_template()        GET /assets/import/template
│   ├── assets_bulk_upload()            POST /assets/bulk-upload
│   ├── assets_update()                 POST /assets/{id}/update
│   ├── assets_delete()                 POST /assets/{id}/delete
│   ├── asset_image()                   GET /assets/{id}/image
│   ├── asset_sip_get()                 GET /assets/{id}/sip
│   └── asset_sip_save()                POST /assets/{id}/sip
│
├── app/app/templates/assets/list.html  (Primary UI template)
│   ├── extends base.html
│   ├── imports partials/_empty_state.html
│   └── includes partials/_sip_modal.html
│
├── app/app/services.py                 (Business logic)
│   ├── portfolio_summary()
│   ├── refresh_asset_prices()
│   └── benchmark_comparison()
│
├── app/app/market_data.py              (External data fetchers)
│   ├── equity_price()                  Yahoo Finance chart endpoint
│   ├── equity_name()                   Yahoo Finance chart endpoint (cached 24h)
│   ├── mf_nav()                        AMFI NAVAll.txt feed (cached 1h)
│   └── gold_per_gram_inr()             Yahoo Finance GC=F + INR=X (cached 30min)
│
├── app/app/models.py                   (ORM schema)
│   ├── Asset
│   ├── AssetType
│   ├── AssetImage
│   └── SIPSchedule
│
├── app/app/currency.py                 (Money utilities)
│   ├── rupees_to_paise()
│   ├── paise_to_rupees()
│   └── format_inr()
│
├── app/app/seed.py                     (Lookup data)
│   └── ASSET_TYPES list (8 types)
│
├── app/app/database.py                 (SQLAlchemy setup)
│   └── get_db() session factory
│
├── app/app/session.py                  (Auth guard)
│   └── _require() — verifies session cookie
│
├── app/app/config.py                   (Settings)
│   ├── MAX_IMAGE_BYTES (5 MB default)
│   └── MAX_UPLOAD_BYTES / MAX_IMPORT_ROWS
│
├── app/app/static/js/app.js            (Shared JS runtime)
│   ├── CSRF token injection (fetch wrapper + form tagging)
│   ├── FinVault.toast.success/error/warning/info()
│   ├── FinVault.modal.open/close()
│   └── FinVault.confirmDelete()
│
├── app/app/static/js/chart.umd.min.js  (Chart.js)
│   └── Used for doughnut and bar charts on page, line chart in drawer
│
├── app/app/static/js/alpine.min.js     (Alpine.js v3)
│   └── Powers assetsPage() component, all reactive UI
│
└── app/app/templates/partials/
    ├── _sip_modal.html                 (SIP configuration modal)
    ├── _empty_state.html               (Empty state macro)
    └── _confirm_delete.html            (Delete confirmation dialog)
```

### File Details

#### `app/app/pages.py`
- **Purpose:** FastAPI route handlers. Queries DB, calls services, builds template context, handles form POSTs, validates input, redirects.
- **Inputs:** HTTP requests (query params, form data, file uploads), DB session, session cookie.
- **Outputs:** HTMLResponse (template render) or RedirectResponse.
- **Dependencies:** models.py, services.py, market_data.py, currency.py, database.py, session.py, config.py.
- **Key constants:** `ASSET_TYPE_KEYS` dict mapping `asset_type_id` → JS config key; `ASSET_DETAIL_KEYS = ("area", "location", "purity", "account_no", "nominee")`.

#### `app/app/templates/assets/list.html`
- **Purpose:** Full Assets page HTML + Alpine.js component + inline Chart.js initialization + inline `assetConfigs` JS object defining per-type form schemas.
- **Inputs:** Jinja2 context: `assets` (list of Asset ORM objects), `types` (list of AssetType), `pf` (portfolio_summary dict), `benchmark` (benchmark_comparison dict), `assets_json` (dict serialized to `window.ASSETS`), `alloc_items`, `alloc_title`, `alloc_subtitle`, `active_type`, `msg`, `user`.
- **Outputs:** Browser-rendered HTML page with reactive Alpine.js behavior.
- **Dependencies:** base.html, _empty_state.html, _sip_modal.html, Alpine.js, Chart.js, app.js, material-symbols-outlined font.

#### `app/app/services.py`
- **Purpose:** Pure Python business logic — no HTTP, no templates.
- **Inputs:** SQLAlchemy Session, user_id string, optional parameters (risk_profile, period, months).
- **Outputs:** Python dicts consumed by page handlers.
- **Dependencies:** models.py, market_data.py (via refresh_asset_prices only).

#### `app/app/market_data.py`
- **Purpose:** Fetch live market prices from external sources with TTL caching and soft-fail on network errors.
- **Inputs:** ticker string, ISIN string.
- **Outputs:** float (price in ₹ per unit/gram) or None.
- **Dependencies:** httpx, cachetools, re, urllib.parse.

#### `app/app/models.py`
- **Purpose:** SQLAlchemy ORM table definitions. All money fields stored as integer paise.
- **Inputs:** SQLAlchemy declarative base.
- **Outputs:** ORM classes with relationships and computed properties (pnl, pnl_pct).
- **Dependencies:** SQLAlchemy, database.py.

#### `app/app/currency.py`
- **Purpose:** Convert between rupees (float) and paise (int) and produce formatted INR strings.
- **Inputs:** float/int/str amounts.
- **Outputs:** int (paise) or str (formatted ₹ string).
- **Dependencies:** decimal module only.

#### `app/app/seed.py`
- **Purpose:** Populate lookup tables on first run.
- **Inputs:** SQLAlchemy Session.
- **Outputs:** DB rows inserted.
- **Dependencies:** models.py.

---

# 3. UI Breakdown

## 3.1 Header Bar
- **Component:** Jinja2 block in `list.html` lines 10–18
- **Source file:** `app/app/templates/assets/list.html`
- **Data source:** Static text + server flash message (`msg` query param)
- **Elements:**
  - Subtitle text: "Track and manage all investments across categories."
  - "Refresh Prices" button — submits form POST `/assets/refresh-prices`
  - "Bulk Upload" button — sets `showBulk=true` in Alpine state
  - "Add Asset" button — sets `showAdd=true` in Alpine state

## 3.2 Summary Bar (Portfolio KPIs)
- **Component:** `div.summary-bar` inside `div.card`, lines 22–29
- **Source file:** `app/app/templates/assets/list.html`
- **Data source:** `pf` dict from `services.portfolio_summary()`
- **Displayed fields:**
  - **Total Portfolio Value** → `pf.total_value | inr` (Jinja `inr` filter calls `format_inr()`)
  - **Total Invested** → `pf.total_invested | inr`
  - **Total Returns** → `pf.total_pnl | inr` with `(pf.pnl_pct%)` — CSS class `pos`/`neg` based on sign
  - **Monthly SIP** → `pf.monthly_sip | inr`
- **User actions:** Read-only display, no interaction.

## 3.3 Allocation Doughnut Chart
- **Component:** `canvas#allocChart`, lines 36–42, initialized in `{% block scripts %}` lines 270–276
- **Source file:** `app/app/templates/assets/list.html`
- **Data source:** `alloc_items` list of `{label, pct}` dicts from `services.portfolio_summary()` allocation array (or per-type drilldown when a type tab is active)
- **Rendered by:** Chart.js doughnut, cutout 68%, 8-color palette `['#4A7C6F','#7FB5A8','#D4956A','#2D3142','#F0B429','#52A77E','#316357','#9DD1C2']`
- **Legend:** Inline HTML list beside canvas — label + color dot + percentage
- **Empty state:** "Add assets to see allocation." paragraph
- **User actions:** Read-only; no click handlers on chart.

## 3.4 Benchmark Bar Chart
- **Component:** `canvas#benchChart`, lines 44–48, initialized in scripts lines 277–282
- **Source file:** `app/app/templates/assets/list.html`
- **Data source:** `benchmark.rows` list of `{type, actual, recommended}` from `services.benchmark_comparison()`
- **Rendered by:** Chart.js grouped bar chart — "Your %" (green `#4A7C6F`) vs "Recommended %" (orange `#D4956A`), Y-axis in %
- **User actions:** Read-only.

## 3.5 Type Filter Tabs
- **Component:** `div.tabs` lines 52–55
- **Source file:** `app/app/templates/assets/list.html`
- **Data source:** `types` list of AssetType ORM objects, `active_type` string
- **Elements:** "All" tab (href `/assets`) + one tab per AssetType (href `/assets?type=<slug>`)
- **User actions:** Click tab → full page navigation to filtered URL

## 3.6 Assets Table
- **Component:** `table` inside `div.card`, lines 58–90
- **Source file:** `app/app/templates/assets/list.html`
- **Data source:** `assets` list of Asset ORM objects (server-side filtered)
- **Columns:** Name (with SIP chip and ISIN/ticker sub-line), Type chip, Invested On date, Qty, Invested, Current, P&L (₹ and %), Actions
- **Per-row actions:**
  - Click asset name → `open(id, 'view')` → detail drawer
  - "Configure SIP" icon button (SIP-eligible types only) → `openSip(id, name)`
  - "Edit" button → `open(id, 'edit')` → edit modal
  - "Delete" button → inline form POST with JS confirm dialog (`fvConfirmDelete`)
- **Empty state:** `empty_state` macro with "Add Your First Asset" and "Bulk Upload" buttons

## 3.7 Age-Based Allocation Suggestion Card
- **Component:** `div.card` lines 93–108
- **Source file:** `app/app/templates/assets/list.html`
- **Data source:** `benchmark.risk_profile`, `benchmark.drift`, `user.age`
- **Displayed:** RECOMMENDED chip, user age, risk profile name, drift % (red if >30, primary color otherwise)
- **User actions:** Read-only.

## 3.8 Add Asset Modal
- **Component:** `div.modal-overlay` with `x-show="showAdd"`, lines 112–136
- **Source file:** `app/app/templates/assets/list.html`
- **Form:** POST `/assets`, `enctype="multipart/form-data"`
- **Dynamic fields:** JS function `renderAssetFields()` called on type change; renders sections from `assetConfigs[key]`
- **Fields by type:**
  - All types: asset name (required), notes
  - Mutual Fund: ISIN, ticker, units, NAV/purchase price, invested, current value, investment date, monthly SIP, active SIP checkbox
  - Equity: ISIN, ticker (triggers auto-fill of name via `/assets/lookup/equity`), shares, avg buy price (auto-computes invested = shares × price), invested (read-only auto), current value, investment date, monthly SIP, active SIP checkbox
  - SGB: ISIN, ticker, bonds, issue price, invested, current value, issue/purchase date, coupon rate %, maturity date
  - Real Estate: area (sq ft), location/address, purchase price, current value, purchase date
  - Digital Gold: quantity (grams), buy price (₹/gram), invested, current value, investment date, monthly SIP, active SIP checkbox
  - Physical Gold: weight (grams), purity select (24K/22K/18K/14K), buy price, invested, current value, purchase date, photo file input
  - Fixed Deposit: FD account number, nominee, principal, interest rate %, start date, maturity date, maturity value
  - PPF: nominee, total invested, current value, interest rate %, account opening date, monthly contribution, regular contribution checkbox
- **Validation:** Investment date `max=today` (HTML attribute); maturity date `min=investment_date` (JS `sync()` listener); server also validates and redirects with error message
- **User actions:** Cancel (closes modal), Save asset (submits form)

## 3.9 Edit Asset Modal
- **Component:** `div.modal-overlay` with `x-show="showEdit"`, lines 140–157
- **Source file:** `app/app/templates/assets/list.html`
- **Form:** POST `/assets/{id}/update`, pre-filled via `renderEdit()` which calls `renderAssetSections(container, key, this.sel)`
- **Data source:** `window.ASSETS[id]` object (serialized from `assets_json` in template context)
- **User actions:** Cancel, Save Changes

## 3.10 Detail Drawer
- **Component:** `div.modal-overlay` with `x-show="showDrawer"`, lines 160–203, right-side panel (width 440px)
- **Source file:** `app/app/templates/assets/list.html`
- **Data source:** `window.ASSETS[id]` object via Alpine `sel` state
- **Sub-components:**
  - Asset name (`sel.name`) + type chip (`sel.type`)
  - **Performance chart** (`canvas#assetPerfChart`) — synthetic 8-point curve from invested to current value with sinusoidal wobble. Line color green (up) or red (down). Rendered by `renderPerf()`. Y-axis in ₹k.
  - **Key Metrics grid:** Invested (`sel.invested_fmt`), Current Value (`sel.current_fmt`), Total Return (`sel.pnl_fmt`), Return % (`sel.pnl_pct`), CAGR estimate (computed by `cagr()` method), Holding Since (`sel.investment_date`)
  - **SIP Status block** (shown if `sel.is_sip && sipEligible(sel.type_key)`) — active SIP amount, Configure button
  - **Type-specific detail fields** — rendered by `renderDetail()`, skips: invested, current_value, investment_date, notes, image, active_sip; formats money fields with `₹` prefix; shows remaining fields as label/value pairs
  - **Photo** (`img` tag with `:src="sel.image_url"`) — shown only if `sel.image_url` is non-empty
  - **Notes** — `sel.notes` as pre-formatted text
  - **Action buttons:** Edit (opens edit modal), Configure SIP (SIP-eligible only), Delete (confirm dialog)
- **User actions:** Close (X button or click outside), Edit, Configure SIP, Delete

## 3.11 SIP Configuration Modal
- **Component:** `div.modal-overlay` with `x-show="showSip"`, defined in `app/app/templates/partials/_sip_modal.html`
- **Source file:** `app/app/templates/partials/_sip_modal.html`
- **Form:** POST `/assets/{sipAssetId}/sip`
- **Data source:** Fetched via `GET /assets/{id}/sip` on `openSip()` call → Alpine `sip` object
- **Fields:** SIP Amount (₹), Day of Month (1–28), Frequency (monthly/quarterly/half-yearly/yearly), Annual Step-up %, Start Date, End Date (blank = indefinite), Linked Bank/Source, Status (active/paused)
- **User actions:** Cancel, Save SIP

## 3.12 Bulk Upload Modal
- **Component:** `div.modal-overlay` with `x-show="showBulk"`, lines 208–265
- **Source file:** `app/app/templates/assets/list.html`
- **3-step flow:**
  - **Step 1 (`impStep===1`):** File input (`.csv/.xlsx/.xls`). CSV → parsed client-side by `_csv()` mini-parser → Step 2. XLSX → Step `'xlsx'` (server-side parse).
  - **Step 'xlsx':** Confirmation screen, direct form POST with file attached via `impAttach()`
  - **Step 2 (`impStep===2`):** Column mapping UI (11 importable fields), preview table (first 8 rows with valid/invalid icon per row), row counts ("N rows detected", "M will import · K skipped")
- **Columns available for import:** name (required), type, quantity, invested, current_value, isin, ticker, investment_date, maturity_date, is_sip, sip_monthly_amount
- **Download Template:** Link to `GET /assets/import/template` (returns CSV with example rows)
- **Submit:** `doImpAssets()` — rebuilds a clean CSV from mapped columns, POST to `/assets/bulk-upload` as FormData
- **User actions:** Upload file, map columns, back, import

## 3.13 Loading States
- No explicit skeleton/spinner UI. The "Refresh Prices" button triggers a full-page form POST; the redirect latency serves as the loading indicator. The bulk import button shows "Importing…" text during the fetch.

## 3.14 Error States
- Server-side errors redirect to `/assets?msg=<message>` which renders a `div.msg` at top of page.
- CSV parse failure: `impError` text shown below file input.
- Empty asset list: `empty_state` macro with icon, title, description, and action buttons.
- Empty allocation chart: "Add assets to see allocation." paragraph.

---

# 4. Data Flow Analysis

## 4.1 Total Portfolio Value

```
Source:      Asset.current_value (integer paise) in SQLite DB
             ↓ summed by services.portfolio_summary() → total_value (int paise)
Transformation: format_inr(total_value) → "₹X,XX,XXX.00" string
State Storage: pf dict returned by portfolio_summary(), passed as template context
Rendering:   {{ pf.total_value | inr }} in list.html line 24
             Jinja filter `inr` calls format_inr() registered in main.py
```

## 4.2 Total Invested

```
Source:      Asset.invested_amount (integer paise) per asset
             ↓ summed by portfolio_summary() → total_invested
Transformation: format_inr()
Rendering:   {{ pf.total_invested | inr }} line 25
```

## 4.3 Total Returns (P&L)

```
Source:      total_pnl = total_value - total_invested  (services.py line 64)
             pnl_pct = round(total_pnl / total_invested * 100, 2) (line 65)
Transformation: format_inr(total_pnl), str(pnl_pct)
State Storage: pf dict
Rendering:   {{ pf.total_pnl | inr }} ({{ pf.pnl_pct }}%)  line 26
             CSS class 'pos' or 'neg' based on pf.total_pnl >= 0
```

## 4.4 Monthly SIP Total

```
Source:      Asset.sip_monthly_amount where Asset.is_sip == True
             ↓ summed by portfolio_summary() → monthly_sip (int paise)
Transformation: format_inr()
Rendering:   {{ pf.monthly_sip | inr }} line 27
```

## 4.5 Per-Asset P&L (table rows)

```
Source:      Asset.current_value, Asset.invested_amount (paise in DB)
             ↓ Asset.pnl property = current_value - invested_amount
             ↓ Asset.pnl_pct property = round(pnl / invested_amount * 100, 2)
Transformation: format_inr(a.pnl), str(a.pnl_pct)
Rendering:   {{ a.pnl | inr }} / {{ a.pnl_pct }}% in table row, line 74
```

## 4.6 Current Price (Equity)

```
Source:      Yahoo Finance chart endpoint
             URL: https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d
             ↓ _yahoo_meta(symbol) → dict
             ↓ meta['regularMarketPrice'] → float (USD or INR depending on exchange)
             ↓ equity_price(ticker) → float INR price per share
             ↓ services.refresh_asset_prices():
                  a.current_nav = round(unit_price * 100)         # paise per unit
                  a.current_value = round(unit_price * a.quantity * 100)  # total paise
             ↓ DB updated; next page load shows new current_value
Rendering:   {{ a.current_value | inr }} in table; sel.current_fmt in drawer
```

## 4.7 Current Price (Mutual Fund NAV)

```
Source:      AMFI NAVAll.txt feed
             URL: https://www.amfiindia.com/spages/NAVAll.txt
             ↓ _amfi_nav_map() parses semicolon-delimited lines
             Format: SchemeCode;ISINPayout;ISINReinvest;SchemeName;NAV;Date
             ↓ dict[ISIN.upper()] = float(NAV)
             ↓ mf_nav(isin) → float (₹/unit) or None
             ↓ services.refresh_asset_prices():
                  a.current_nav = round(nav * 100)
                  a.current_value = round(nav * a.quantity * 100)
             ↓ DB updated
Rendering:   {{ a.current_value | inr }} in table
```

## 4.8 Current Price (Gold — Digital Gold and SGB)

```
Source:      Yahoo Finance chart endpoint (two calls)
             Call 1: symbol = "GC=F" → gold futures USD/troy oz
             Call 2: symbol = "INR=X" → USD-INR forex rate
             ↓ gold_per_gram_inr() = usd_oz * usd_inr / 31.1035
             ↓ Cached 30 minutes (TTLCache maxsize=1 ttl=1800)
             ↓ Both Digital Gold and SGB share same gold price (fetched once)
             ↓ services.refresh_asset_prices():
                  a.current_nav = round(gold_price_per_gram * 100)
                  a.current_value = round(gold_price_per_gram * a.quantity * 100)
             Note: SGB quantity is in number of bonds (each = 1 gram of gold)
Rendering:   {{ a.current_value | inr }} in table
```

## 4.9 Allocation Percentage

```
Source:      Asset.current_value per asset, grouped by AssetType.name
             ↓ by_type[name]['value'] += a.current_value
             ↓ pct = round(v['value'] / total_value * 100, 1)
             ↓ portfolio_summary() returns allocation list
State Storage: alloc_items list in template context (with or without type filter)
Rendering:   Chart.js doughnut (data: alloc_items.map(pct))
             Legend: {{ a.label }} — {{ a.pct }}%
```

## 4.10 CAGR Estimate (Detail Drawer)

```
Source:      sel.invested (₹ float), sel.current (₹ float), sel.investment_date (ISO string)
             ↓ days = (Date.now() - new Date(investment_date).getTime()) / 86400000
             ↓ yrs = max(days/365, 0.25)
             ↓ cagr = round((pow(current/invested, 1/yrs) - 1) * 1000) / 10
Rendering:   cagr()+'%' in drawer key metrics grid (line 174)
Note:        Fully client-side. No server involvement.
```

## 4.11 Benchmark Drift

```
Source:      services.benchmark_comparison(db, user_id, risk_profile)
             ↓ Calls portfolio_summary() to get allocation %
             ↓ Pools Digital Gold + Physical Gold into "Digital/Physical Gold"
             ↓ drift += abs(actual% - recommended%) for each class
             ↓ Real Estate excluded from drift score
             BENCHMARKS dict in services.py lines 27–33:
               conservative: Equity 20, MF 20, FD 35, PPF 15, SGB 5, Gold 5
               moderate:     Equity 35, MF 30, FD 15, PPF 10, SGB 5, Gold 5
               aggressive:   Equity 60, MF 20, FD 5,  PPF 5,  SGB 5, Gold 5
Rendering:   benchmark.drift% in age-based suggestion card (line 105)
             Chart.js bar chart comparing actual vs recommended per class
```

## 4.12 window.ASSETS (Client-Side Asset Cache)

```
Source:      assets_json dict built in pages.py assets_list() lines 600–614
             Serialized via Jinja tojson filter → window.ASSETS = {...}
Fields per asset:
  id, name, type, isin, ticker, quantity
  invested (₹ float), current (₹ float)
  invested_fmt, current_fmt, pnl_fmt (formatted ₹ strings)
  pnl_pct (float %), is_sip (bool), sip_fmt (formatted ₹)
  notes, investment_date, maturity_date
  asset_type_id, type_key (JS config key e.g. 'mutual_fund')
  price_per_unit (₹ float), sip_monthly (₹ float), current_nav (₹ float)
  guaranteed_return_pct (float), details (dict from details_json)
  image_url ("/assets/{id}/image" or "")
State:       Populated once on page load; not updated live
Consumer:    Alpine assetsPage().open(id) → this.sel = window.ASSETS[id]
```

---

# 5. Yahoo Finance Integration Analysis

## 5.1 Chart Endpoint (Prices and Names)

**Endpoint:**
```
GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d
```

**Purpose:** Fetch the latest market price and display name for any Yahoo Finance-listed instrument (NSE/BSE stocks, gold futures, forex rates).

**URL Construction:**
```python
# market_data.py line 47–48
from urllib.parse import quote
url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol, safe='')}?interval=1d&range=1d"
```

**Symbol Validation (Security — F-20):**
```python
_SYMBOL_RE = re.compile(r"^[A-Za-z0-9.\-=^]{1,20}$")

def _valid_symbol(symbol: str) -> bool:
    return bool(_SYMBOL_RE.match(symbol or ""))
```
Any symbol not matching this regex is rejected before the URL is built. This prevents a user-supplied ticker from injecting path segments or query parameters.

**Symbol Format:**
- NSE stock: `RELIANCE.NS`, `HDFCBANK.NS`
- BSE stock: `RELIANCE.BO`
- Gold futures (USD/troy oz): `GC=F`
- USD-INR forex: `INR=X`
- NSE auto-suffix: If ticker has no `.` or `=`, `.NS` is appended (equity_price line 71)

**Headers:**
```python
_HEADERS = {"User-Agent": "Mozilla/5.0 (FinVault)"}
```
No authentication required. Yahoo Finance chart API is public.

**Timeout:** 12 seconds (`_TIMEOUT = 12.0`)

**Response Shape:**
```json
{
  "chart": {
    "result": [{
      "meta": {
        "regularMarketPrice": 2450.50,
        "longName": "Reliance Industries Limited",
        "shortName": "RELIANCE.NS"
      }
    }]
  }
}
```

**Fields Used:**
- `meta.regularMarketPrice` → current price (float)
- `meta.longName` or `meta.shortName` → company name (equity_name only)

**Caching:**
- `equity_price()`: No cache (called on demand during refresh, which is user-triggered)
- `equity_name()`: TTLCache(maxsize=256, ttl=86400) — cached 24 hours per ticker
- `gold_per_gram_inr()`: TTLCache(maxsize=1, ttl=1800) — cached 30 minutes

**Error Handling:**
- Any `httpx.HTTPError`, `ValueError`, network timeout → `_get()` returns None, logs warning
- Missing keys in JSON (`KeyError`, `IndexError`, `TypeError`) → `_yahoo_meta()` returns None
- All callers check for None and skip update (soft-fail)

**Rate Limiting Logic:**
- No explicit rate limiting implemented. The app relies on Yahoo Finance's tolerance of infrequent requests.
- Refresh is user-triggered (not automatic), reducing request frequency.
- `equity_name()` 24h cache avoids repeated lookups.

**Retry Logic:** None. Single attempt only. Failure leaves existing stored value unchanged.

---

**Detailed call: `equity_price(ticker)`**
```
File: app/app/market_data.py lines 65–72
Input: ticker string (e.g. "RELIANCE" or "RELIANCE.NS")
1. Strip + uppercase ticker
2. If no "." or "=" in ticker → append ".NS"
3. Call _yahoo_price(sym) → _yahoo_meta(sym) → _get(url)
4. Return meta['regularMarketPrice'] as float, or None
Used by: services.refresh_asset_prices() when tname == "Equity"
```

**Detailed call: `equity_name(ticker)` — for Add Asset auto-fill**
```
File: app/app/market_data.py lines 75–93
Input: ticker string
1. Build candidates: ["{sym}.NS", "{sym}.BO"] if no suffix; else [sym]
2. Try each candidate: call _yahoo_meta(s)
3. Return meta['longName'] or meta['shortName'] from first successful hit
4. Cached 24h to avoid repeated lookups during form interactions
Endpoint: GET /assets/lookup/equity?ticker=RELIANCE
Response: {"ticker": "RELIANCE", "name": "Reliance Industries Limited", "price": 2450.50}
Used by: wireEquityAuto() JS function in list.html — auto-fills name input on ticker blur/change
```

**Detailed call: `gold_per_gram_inr()`**
```
File: app/app/market_data.py lines 125–132
Input: none
1. _yahoo_price("GC=F") → USD per troy oz
2. _yahoo_price("INR=X") → INR per USD
3. gold_per_gram_inr = usd_oz * usd_inr / 31.1035
_OZ_TO_GRAM = 31.1035 (troy oz to gram conversion constant)
Used by: services.refresh_asset_prices() for Digital Gold and SGB
Cached: 30 minutes
```

## 5.2 AMFI NAVAll Feed (Mutual Fund NAV)

**Endpoint:**
```
GET https://www.amfiindia.com/spages/NAVAll.txt
```

**Purpose:** Fetch the daily NAV for all Indian mutual fund schemes, indexed by ISIN.

**URL Construction:** Hardcoded literal string (no user input). No authentication.

**Response Format:** Plain text, semicolon-delimited:
```
Scheme Code;ISIN Payout;ISIN Reinvest;Scheme Name;NAV;Date
120503;INF179K01CC4;INF179K01CD2;HDFC Mid-Cap Opportunities Fund;89.5432;18-Jun-2026
```

**Parsing Logic (market_data.py lines 103–115):**
```python
for line in r.text.splitlines():
    parts = line.split(";")
    if len(parts) < 6:
        continue
    try:
        nav = float(parts[4].strip())
    except ValueError:
        continue
    for isin in (parts[1].strip(), parts[2].strip()):  # both ISIN variants
        if isin and isin != "-":
            out[isin.upper()] = nav
```

**Fields Used:** `parts[1]` (ISIN Payout), `parts[2]` (ISIN Reinvest), `parts[4]` (NAV)

**Caching:** TTLCache(maxsize=1, ttl=3600) — entire map cached 1 hour in process memory.

**Error Handling:** HTTP failure → returns empty dict → `mf_nav()` returns None → asset left unchanged.

**Used by:** `services.refresh_asset_prices()` when `tname == "Mutual Fund"` and `a.isin` is set.

---

## 5.3 How Specific Values Are Obtained

### Current Price

| Asset Type | Method | Source |
|---|---|---|
| Equity | `equity_price(a.ticker)` | Yahoo Finance `GC=F`+`.NS`/`.BO` suffix |
| Mutual Fund | `mf_nav(a.isin)` | AMFI NAVAll.txt |
| Digital Gold | `gold_per_gram_inr()` | Yahoo Finance `GC=F` × `INR=X` / 31.1035 |
| Sovereign Gold Bond | `gold_per_gram_inr()` | Same as Digital Gold |
| Real Estate, FD, PPF, Physical Gold | Not auto-refreshed | User-entered values only |

### Daily Change / Percent Change
**Not computed.** The app does not retrieve or store previous-day closing prices. There is no daily change field in the Asset model or the UI. Only total P&L from purchase price is shown.

### Market Value (current_value per asset)
```
current_value (paise) = round(unit_price * quantity * 100)
```
Where `unit_price` is in ₹ (float) and `quantity` is float units/shares/grams.

### Asset Performance (CAGR estimate — client-side only)
```javascript
// list.html cagr() method
const days = (Date.now() - new Date(sel.investment_date).getTime()) / 86400000;
const yrs = Math.max(days / 365, 0.25);
cagr = Math.round((Math.pow(sel.current / sel.invested, 1 / yrs) - 1) * 1000) / 10;
```
This is a synthetic estimate. There is no server-side historical price data.

---

# 6. External API Inventory

## API 1: Yahoo Finance Chart (Prices)
- **Name:** Yahoo Finance v8 Chart API
- **Endpoint:** `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d`
- **Purpose:** Current price and display name for equities, gold futures (GC=F), and forex (INR=X)
- **Files:** `app/app/market_data.py` (lines 42–72, 125–132), `app/app/services.py` (line 92), `app/app/pages.py` (line 704)
- **Data Returned:** JSON with `chart.result[0].meta` containing `regularMarketPrice`, `longName`, `shortName`
- **Used For:** Equity price refresh, gold price calculation, equity name auto-fill in Add Asset form
- **Auth:** None
- **Rate Limiting:** None implemented

## API 2: AMFI NAVAll Feed
- **Name:** AMFI India NAV feed
- **Endpoint:** `https://www.amfiindia.com/spages/NAVAll.txt`
- **Purpose:** Daily NAV for all Indian mutual fund schemes, keyed by ISIN
- **Files:** `app/app/market_data.py` (lines 96–122)
- **Data Returned:** Plain text, semicolon-delimited; 6 fields per line
- **Used For:** Mutual fund price refresh
- **Auth:** None

## Internal FastAPI Routes (Assets Feature)

| Method | Path | Purpose |
|---|---|---|
| GET | `/assets` | Render full assets page |
| POST | `/assets` | Create new asset |
| GET | `/assets/lookup/equity` | Ticker → name + price (JSON) |
| POST | `/assets/refresh-prices` | Trigger live price refresh |
| GET | `/assets/import/template` | Download CSV template |
| POST | `/assets/bulk-upload` | Bulk import (CSV or XLSX) |
| POST | `/assets/{id}/update` | Update existing asset |
| POST | `/assets/{id}/delete` | Delete asset |
| GET | `/assets/{id}/image` | Serve asset photo |
| GET | `/assets/{id}/sip` | Get SIP config (JSON) |
| POST | `/assets/{id}/sip` | Save SIP config |

---

# 7. Business Logic Extraction

## 7.1 Portfolio Value
- **Formula:** `total_value = sum(asset.current_value for all assets)`
- **Source Data:** `Asset.current_value` (paise integer) per asset
- **File Location:** `app/app/services.py` line 63
- **Output Field:** `pf['total_value']` → rendered as `{{ pf.total_value | inr }}`

## 7.2 Total Invested
- **Formula:** `total_invested = sum(asset.invested_amount for all assets)`
- **Source Data:** `Asset.invested_amount` (paise integer)
- **File Location:** `app/app/services.py` line 62
- **Output Field:** `pf['total_invested']`

## 7.3 Total P&L
- **Formula:** `total_pnl = total_value - total_invested`
- **Source Data:** Derived from above two
- **File Location:** `app/app/services.py` line 64
- **Output Field:** `pf['total_pnl']`

## 7.4 P&L Percentage
- **Formula:** `pnl_pct = round(total_pnl / total_invested * 100, 2) if total_invested else 0.0`
- **File Location:** `app/app/services.py` line 65
- **Output Field:** `pf['pnl_pct']`

## 7.5 Per-Asset P&L (ORM properties)
- **Formula:** `pnl = current_value - invested_amount`
- **Formula:** `pnl_pct = round(pnl / invested_amount * 100, 2) if invested_amount else 0.0`
- **File Location:** `app/app/models.py` lines 137–145 (Python properties on Asset class)
- **Output:** Used in table rows and `pnl_fmt` in `assets_json`

## 7.6 Allocation Percentage (per type)
- **Formula:** `pct = round(type_total_current_value / portfolio_total_current_value * 100, 1) if total else 0.0`
- **File Location:** `app/app/services.py` lines 75–78
- **Output Field:** `pf['allocation'][i]['pct']`

## 7.7 Monthly SIP Total
- **Formula:** `monthly_sip = sum(asset.sip_monthly_amount for assets where asset.is_sip == True)`
- **File Location:** `app/app/services.py` line 66
- **Output Field:** `pf['monthly_sip']`

## 7.8 Benchmark Drift
- **Formula:** `drift = sum(abs(actual_pct - recommended_pct) for each asset class, excluding Real Estate)`
- **Benchmarks:** Hardcoded dict in `services.py` lines 27–33 (conservative/moderate/aggressive)
- **Gold pooling:** `Digital Gold` and `Physical Gold` both contribute to `"Digital/Physical Gold"` class
- **Risk profile source:** `user.risk_profile` column (default `"moderate"`)
- **File Location:** `app/app/services.py` lines 125–142
- **Output Field:** `benchmark['drift']`

## 7.9 Price per Unit (at creation)
- **Formula:** `price = rupees_to_paise(price_per_unit_input) or (round(invested / quantity) if quantity else 0)`
- **File Location:** `app/app/pages.py` line 662
- **Equity special case:** `invested = shares × buy_price` auto-computed client-side before form submission

## 7.10 Current NAV (stored per asset)
- **Formula:** `current_nav = round(current_value_rupees / quantity * 100) if quantity else None`
- **At creation:** `pages.py` line 671
- **At refresh:** `a.current_nav = round(unit_price * 100)` in `services.py` line 115
- **Note:** Stored as paise integer. Represents price per single unit/share/gram.

## 7.11 CAGR Estimate (client-side)
- **Formula:** `cagr = ((current / invested) ^ (1 / max(days/365, 0.25)) - 1) × 100`
- **File Location:** `list.html` lines 599–604 (JS `cagr()` method)
- **Note:** Rounded to 1 decimal place. Floor of 0.25 years prevents near-zero time blowing up the result.

## 7.12 Gold Price per Gram (INR)
- **Formula:** `gold_per_gram_inr = usd_per_troy_oz × usd_inr_rate / 31.1035`
- **File Location:** `app/app/market_data.py` lines 125–132
- **Constant:** `_OZ_TO_GRAM = 31.1035` (troy ounce to gram)

## 7.13 SIP Schedule Next Due Date (at creation)
- **Formula:** `next_due_date = (date.today() + timedelta(days=30)).isoformat()`
- **File Location:** `app/app/pages.py` line 686, 811
- **Note:** Simple 30-day lookahead, not calendar-month-aware.

## 7.14 Equity Auto-Computed Invested Amount (client-side)
- **Formula:** `invested = round(shares × buy_price × 100) / 100`
- **File Location:** `list.html` lines 486–492 (JS `wireEquityAuto()`)
- **Note:** The invested field is made `readOnly = true` for Equity type.

---

# 8. State Management Analysis

## 8.1 Server-Side Session State

- **What:** Authenticated user identity (user_id, vault key, session token, last-activity timestamp)
- **Where:** In-memory Python dict in `app/app/session.py`; token stored in httponly cookie `fv_session`
- **Who Updates:** Login handler sets session; activity updates last-activity; logout clears it; auto-lock after inactivity (default 15 min) clears vault key
- **Who Consumes:** Every route handler calls `_require(request, db)` which reads the cookie, looks up the session dict, and returns the User ORM object or a redirect

## 8.2 Database State (SQLite)

- **What:** All persistent data: Asset, AssetType, SIPSchedule, AssetImage records
- **Where:** `finvault.db` SQLite file, platform-specific path via `app/app/paths.py`
- **Who Updates:** Route handlers (`assets_create`, `assets_update`, `assets_delete`, `assets_refresh_prices`, `asset_sip_save`)
- **Who Consumes:** `assets_list()` queries assets, types on every page load; `portfolio_summary()` queries all user assets; `refresh_asset_prices()` reads and writes current_value/current_nav

## 8.3 Alpine.js Component State (`assetsPage()`)

All client-side state lives in the Alpine component returned by `assetsPage()` (list.html lines 529–676):

| Property | Type | Purpose |
|---|---|---|
| `showAdd` | bool | Controls Add Asset modal visibility |
| `showEdit` | bool | Controls Edit Asset modal visibility |
| `showDrawer` | bool | Controls Detail Drawer visibility |
| `showBulk` | bool | Controls Bulk Upload modal visibility |
| `showSip` | bool | Controls SIP Configuration modal visibility |
| `sel` | object | Currently selected asset (from window.ASSETS) |
| `sipAssetId` | string | Asset ID for SIP modal |
| `sipAssetName` | string | Asset name for SIP modal header |
| `sip` | object | SIP data fetched from GET /assets/{id}/sip |
| `_perfChart` | Chart instance | Reference to Chart.js line chart in drawer |
| `impStep` | int or 'xlsx' | Bulk upload wizard step |
| `impError` | string | Bulk upload error message |
| `impHeaders` | array | CSV column headers |
| `impRows` | array | Parsed CSV rows |
| `impMap` | object | Column → field mapping |
| `importing` | bool | Import in-progress flag |

## 8.4 window.ASSETS Global (Client-Side Asset Cache)

- **What:** Full serialized snapshot of all assets for the current filter/page
- **Where:** `window.ASSETS` global dict, set by Jinja `{{ assets_json | tojson }}` in list.html line 528
- **Who Updates:** Injected server-side on every page load; never mutated client-side
- **Who Consumes:** `assetsPage().open(id)` reads `window.ASSETS[id]` into `sel` for edit/view operations

## 8.5 Market Data TTL Cache (Process Memory)

- **What:** Cached external API responses to avoid hammering Yahoo Finance / AMFI on every refresh
- **Where:** Module-level `cachetools.TTLCache` objects in `market_data.py`
- **Caches:**
  - `_amfi_nav_map()`: 1-hour TTL, maxsize=1 (entire ISIN→NAV map)
  - `equity_name()`: 24-hour TTL, maxsize=256 (ticker→name map)
  - `gold_per_gram_inr()`: 30-minute TTL, maxsize=1
- **Who Updates:** Auto-filled by `@cached` decorator on first call after TTL expiry
- **Who Consumes:** `refresh_asset_prices()`, `assets_equity_lookup()` endpoint
- **Note:** Cache is process-local; cleared on server restart

## 8.6 No Client-Side Persistent Storage

- No `localStorage` or `sessionStorage` usage in the Assets feature
- No IndexedDB
- All state resets on page reload (Alpine component re-initializes from `window.ASSETS`)
- CSRF token is in a cookie (`fv_csrf`) and a `<meta name="csrf-token">` tag

---

# 9. Mobile Migration Requirements

## 9.1 Feature Classification Table

| Feature | Category | Current File | Mobile Equivalent | Complexity |
|---|---|---|---|---|
| Portfolio Summary (4 KPIs) | Must Migrate | list.html:22–29, services.py:60–85 | React Native View with summary cards | Low |
| Asset List / Table | Must Migrate | list.html:58–90 | FlatList with custom AssetRow component | Low |
| Asset Type Filter Tabs | Must Migrate | list.html:52–55 | ScrollView tab bar or SegmentedControl | Low |
| Add Asset Modal | Must Migrate | list.html:112–136, pages.py:623–691 | React Native Modal with type-conditional form | High |
| Edit Asset Modal | Must Migrate | list.html:140–157, pages.py:820–893 | Same form component, pre-filled | High |
| Detail Drawer | Must Migrate | list.html:160–203 | Bottom sheet or stack screen | Medium |
| SIP Configuration | Must Migrate | _sip_modal.html, pages.py:930–980 | Modal form with DatePicker | Medium |
| Refresh Prices (manual) | Must Migrate | pages.py:708–720, services.py:88–122 | Pull-to-refresh or button → API call | Medium |
| Yahoo Finance integration | Must Migrate | market_data.py | Backend proxy (mobile cannot call Yahoo Finance directly due to CORS/API changes) | High |
| AMFI MF NAV | Must Migrate | market_data.py:96–122 | Backend proxy | Medium |
| Allocation Doughnut Chart | Must Migrate | list.html:270–276 | react-native-gifted-charts or victory-native | Medium |
| Benchmark Bar Chart | Must Migrate | list.html:277–282 | Same charting lib, grouped bar | Medium |
| Synthetic Performance Line Chart | Must Migrate | list.html:578–598 | Line chart in detail screen | Medium |
| CAGR Estimate | Must Migrate | list.html:599–604 | Pure JS/TS function, reuse same formula | Low |
| Benchmark Drift Score | Must Migrate | services.py:125–142 | Backend API endpoint or replicate formula | Medium |
| Age-Based Allocation Suggestion | Nice to Have | list.html:93–108 | Info card in portfolio screen | Low |
| Bulk Upload (CSV) | Nice to Have | list.html:623–674 | Document picker + parse with papaparse | High |
| Bulk Upload (XLSX) | Nice to Have | pages.py:761–816 | Server-side only, document picker → upload | High |
| Download CSV Template | Nice to Have | pages.py:727–745 | Share sheet or deep link | Low |
| Asset Photo Upload | Nice to Have | pages.py:511–565 | expo-image-picker + multipart upload | Medium |
| Asset Photo View | Nice to Have | list.html:190–193 | Image component with authenticated URL | Low |
| Notes field | Must Migrate | models.py:121, list.html | TextInput multiline | Low |
| Empty state screen | Must Migrate | _empty_state.html | Custom EmptyState component | Low |
| Toast notifications | Must Migrate | app.js:73+ | React Native toast library (e.g. react-native-toast-message) | Low |
| Confirm delete dialog | Must Migrate | app.js | Alert.alert() | Low |
| Equity name auto-fill | Nice to Have | list.html:476–511 | Fetch /assets/lookup/equity from mobile | Low |
| CSRF protection | Desktop Only | app.js:17–70 | Not needed — use token auth (JWT/session) | N/A |
| Session auto-lock | Must Migrate | session.py | App background lock + biometric unlock | High |
| Server-side form rendering | Desktop Only | pages.py | N/A — mobile uses JSON API | N/A |

## 9.2 Feature Details

### Must Migrate: Add/Edit Asset Forms
- **Current File:** `list.html` lines 284–526, `pages.py` lines 623–693 and 820–893
- **Mobile Equivalent:** A single `AssetForm` React Native screen/modal that accepts a `typeKey` prop and renders the appropriate fields using a config object mirroring `assetConfigs` in list.html.
- **Implementation Notes:** All 8 asset type configs need to be replicated. Equity auto-compute for invested amount and ticker name lookup are nice to include. Date pickers via `@react-native-community/datetimepicker` or `expo-date-picker`. File upload via `expo-image-picker`.
- **Dependencies:** Backend must accept JSON body (not multipart form) for non-image fields, or keep multipart. Image upload still multipart.
- **Complexity:** High

### Must Migrate: Yahoo Finance Price Refresh
- **Current File:** `market_data.py`, `services.py:88–122`, `pages.py:708–720`
- **Mobile Equivalent:** Mobile app calls its own backend `/assets/refresh-prices`. The backend already handles Yahoo Finance. Mobile just triggers the refresh and refreshes the list.
- **Implementation Notes:** Do NOT call Yahoo Finance from mobile directly — the API is not designed for client use, has no CORS headers, and the URL format could change.
- **Complexity:** Medium (backend already done; mobile adds a button/pull-to-refresh)

### Nice to Have: Bulk Upload
- **Current File:** `list.html:622–674`, `pages.py:748–817`
- **Mobile Equivalent:** Use `expo-document-picker` to pick a file; upload to `/assets/bulk-upload` as multipart. CSV preview and column mapping would need a dedicated screen.
- **Complexity:** High

---

# 10. Assets Feature Checklist

```
[ ] API Integration
    [ ] GET /assets — fetch asset list with portfolio summary
    [ ] POST /assets — create asset (multipart form)
    [ ] GET /assets/lookup/equity?ticker= — equity name auto-fill
    [ ] POST /assets/refresh-prices — trigger price refresh
    [ ] GET /assets/import/template — download CSV template
    [ ] POST /assets/bulk-upload — bulk import
    [ ] POST /assets/{id}/update — edit asset
    [ ] POST /assets/{id}/delete — delete asset
    [ ] GET /assets/{id}/image — serve asset photo
    [ ] GET /assets/{id}/sip — fetch SIP config
    [ ] POST /assets/{id}/sip — save SIP config

[ ] Portfolio Summary
    [ ] Total Portfolio Value (sum of current_value, formatted in ₹)
    [ ] Total Invested (sum of invested_amount)
    [ ] Total Returns (P&L ₹ and %)
    [ ] Monthly SIP total

[ ] Holdings List
    [ ] Asset name, type chip, investment date
    [ ] Quantity, invested amount, current value
    [ ] P&L (₹ and %) with positive/negative color
    [ ] SIP badge (amount/mo) for SIP assets
    [ ] ISIN / ticker sub-line
    [ ] Type filter tabs (All + 8 types)
    [ ] Empty state with Add and Bulk Upload CTAs

[ ] Asset Details
    [ ] Synthetic performance line chart (invested → current, 8 points)
    [ ] Key metrics grid (invested, current, return, return%, CAGR, holding since)
    [ ] SIP status block with Configure button
    [ ] Type-specific details (purity, location, account_no, nominee, etc.)
    [ ] Asset photo display
    [ ] Notes display
    [ ] Edit and Delete actions

[ ] Add/Edit Asset Form
    [ ] Asset type selector
    [ ] Dynamic fields per type (8 type configs)
    [ ] Mutual Fund: ISIN, ticker, units, NAV, invested, current, date, SIP
    [ ] Equity: ISIN, ticker (name auto-fill), shares, buy price, invested (auto), current, date, SIP
    [ ] SGB: ISIN, ticker, bonds, issue price, invested, current, date, coupon rate, maturity date
    [ ] Real Estate: area, location, purchase price, current value, purchase date
    [ ] Digital Gold: quantity (grams), buy price, invested, current, date, SIP
    [ ] Physical Gold: weight, purity (24K/22K/18K/14K), buy price, invested, current, date, photo
    [ ] Fixed Deposit: account no, nominee, principal, interest rate, start date, maturity date, maturity value
    [ ] PPF: nominee, invested, current, interest rate, opening date, monthly contribution, SIP checkbox
    [ ] Date validation (no future investment dates; maturity after start)
    [ ] Image upload (for Physical Gold)
    [ ] Pre-fill for edit mode

[ ] Current Price Refresh
    [ ] Equity: Yahoo Finance .NS suffix auto-append
    [ ] Mutual Fund: AMFI ISIN lookup
    [ ] Digital Gold: gold_per_gram_inr = GC=F × INR=X / 31.1035
    [ ] SGB: same as Digital Gold
    [ ] Real Estate / FD / PPF / Physical Gold: no auto-refresh
    [ ] Soft-fail (keep existing values on API error)
    [ ] Success/failure message display

[ ] Charts
    [ ] Allocation doughnut chart (by asset type, 8 colors)
    [ ] Benchmark bar chart (actual vs recommended %, 3 risk profiles)
    [ ] Synthetic performance line chart in detail view
    [ ] Per-type drilldown: when type filter active, doughnut shows internal distribution

[ ] SIP Configuration
    [ ] SIP amount (₹)
    [ ] Frequency (monthly/quarterly/half-yearly/yearly)
    [ ] Day of month (1–28)
    [ ] Annual step-up %
    [ ] Start and end dates
    [ ] Linked bank / source
    [ ] Status (active/paused)
    [ ] SIP eligibility check (only MF, Equity, Digital Gold, PPF)

[ ] Bulk Upload
    [ ] CSV file picker and client-side parse
    [ ] XLSX file upload (server-side parse)
    [ ] Column auto-mapping (11 fields)
    [ ] Preview table (first 8 rows)
    [ ] Valid/invalid row count display
    [ ] Download template

[ ] Benchmark / Allocation Suggestion
    [ ] Benchmark drift calculation (3 profiles)
    [ ] Age-based suggestion card
    [ ] Drift percentage display with color coding

[ ] Error Handling
    [ ] Network error during price refresh (soft-fail)
    [ ] API error messages (flash/toast)
    [ ] Form validation errors (date constraints, required fields)
    [ ] Image upload errors (size, format)
    [ ] CSV parse errors

[ ] Loading States
    [ ] Price refresh in-progress indicator
    [ ] Bulk import in-progress ("Importing…")
    [ ] SIP data fetch (openSip async)
    [ ] Equity name lookup (fetch on ticker blur)

[ ] Equity Name Auto-Fill
    [ ] Call /assets/lookup/equity?ticker={ticker} on ticker field blur
    [ ] Auto-fill name if name is blank or previously auto-filled
    [ ] Handle offline/error silently

[ ] Delete Asset
    [ ] Confirmation dialog
    [ ] POST /assets/{id}/delete
    [ ] Redirect to list with success state
```

---

# 11. Risks and Hidden Dependencies

## 11.1 Paise Integer Arithmetic
- **Risk:** All money is stored as integer paise (1 ₹ = 100 paise). Any mobile-side calculation must round to integers before comparison or storage. Displaying requires dividing by 100.
- **Impact:** If mobile sends rupee floats to the backend without the `rupees_to_paise()` conversion, values will be 100× too large in the DB.
- **Mitigation:** Use the existing backend endpoints for all writes. Document the convention clearly.

## 11.2 Yahoo Finance URL Stability
- **Risk:** Yahoo Finance has changed their API endpoints multiple times historically. The `v8` chart endpoint used here is undocumented and unofficial.
- **Impact:** Price refresh could break silently (soft-fail means data goes stale).
- **Mitigation:** Add monitoring; consider using a paid data provider for production mobile app.

## 11.3 AMFI Feed Format
- **Risk:** The AMFI NAVAll.txt semicolon-delimited format is not officially versioned. Field order or delimiter could change.
- **Impact:** All mutual fund NAV lookups would silently return None.
- **Mitigation:** Add a checksum/format validation step; monitor for parse failures.

## 11.4 No Daily Change Data
- **Risk:** The app does not store or retrieve previous-day prices. There is no "daily change %" field. The performance chart in the drawer is entirely synthetic (fabricated curve, not real price history).
- **Impact:** Mobile migration cannot add a daily change % field without additional data source work.

## 11.5 Browser-Only APIs Used Client-Side
The following Web APIs are used in list.html and have no React Native equivalents:
- `FileReader` — CSV reading (`onImpFile()` line 652). Mobile alternative: `expo-file-system` or `expo-document-picker`.
- `DataTransfer` — XLSX file attachment (`impAttach()` line 664). Not applicable in RN.
- `File` / `Blob` — CSV reconstruction before POST (`doImpAssets()` lines 671–672). Mobile: construct FormData with file URI.
- `canvas` element — Chart.js requires `<canvas>`. React Native needs a dedicated charting library.
- `Date.now()` / `new Date()` — Used freely. Available in RN.

## 11.6 CSRF Protection (Desktop Only)
- The web app uses a double-submit cookie pattern: `fv_csrf` cookie + `X-CSRF-Token` header / `?csrf=` query param.
- Mobile apps should use token-based authentication (JWT or session token in Authorization header), not cookie-based CSRF.
- The FastAPI backend would need a parallel authentication path for mobile clients.

## 11.7 Environment Variables / Config
All configurable limits are in `app/app/config.py` (Pydantic Settings):
- `MAX_IMAGE_BYTES` — image upload size cap (default 5 MB = 5,242,880)
- `MAX_UPLOAD_BYTES` — bulk file upload size cap (default 10 MB)
- `MAX_IMPORT_ROWS` — max rows in bulk import (default 5000)
- `AUTO_LOCK_MINUTES` — session inactivity timeout (default 15)
- These may be read from environment variables; check `config.py` for env var names.

## 11.8 Pillow Dependency (Image Processing)
- Asset image upload uses Python Pillow for structural validation and re-encoding.
- This is server-side and transparent to mobile clients.
- Mobile must send image as multipart upload; validation happens on server.
- **Risk:** If PIL/Pillow is not installed on the server, image upload will raise ImportError (import is deferred inside `_save_asset_image`).

## 11.9 openpyxl Dependency (XLSX)
- XLSX bulk upload uses `openpyxl`. If not installed, the XLSX path will fail.
- CSV path has no extra dependencies.

## 11.10 Session Cookie vs. Token Auth
- The backend currently uses httponly session cookies (`fv_session`).
- Mobile apps cannot easily use httponly cookies. The backend would need to expose a token-based auth endpoint (e.g., returning a Bearer token on login) for mobile API calls.

## 11.11 Asset Detail JSON Blob
- Type-specific fields (area, location, purity, account_no, nominee) are stored as a JSON string in `Asset.details_json`.
- The mobile app needs to parse this JSON and display the appropriate fields per type.
- The `assetConfigs` JS object in list.html (lines 285–377) is the canonical field schema — replicate it in the mobile app.

## 11.12 Implicit Gold Quantity Convention
- For Digital Gold: quantity is in grams.
- For Sovereign Gold Bond: quantity is number of bonds, each representing 1 gram of gold.
- For Physical Gold: quantity is in grams; purity affects effective pure gold weight but the app stores gross weight.
- The refresh logic treats all three as grams × gold_per_gram_inr.

## 11.13 Synthetic Performance Chart
- The performance line chart in the detail drawer (`renderPerf()` in list.html lines 579–598) generates a fake curve using `Math.sin` for wobble between invested and current values.
- There is no actual price history stored or fetched.
- The mobile migration should either replicate this synthetic approach or clearly label it as "Illustrative".

---

# 12. Final Migration Blueprint

## Overview

Rebuild the Assets feature as a set of Expo React Native screens backed by the existing FastAPI backend. The backend needs minor additions: a JSON-returning asset list endpoint and token-based authentication. All business logic (portfolio summary, benchmark comparison, price refresh) stays server-side.

---

## 12.1 Recommended Component Structure

```
src/
├── screens/
│   └── assets/
│       ├── AssetsScreen.tsx            # Main list screen (tab navigator entry point)
│       ├── AssetDetailScreen.tsx       # Full detail screen (or bottom sheet)
│       ├── AddAssetScreen.tsx          # Add asset form (modal stack screen)
│       └── EditAssetScreen.tsx         # Edit asset form (reuses AssetForm)
│
├── components/
│   └── assets/
│       ├── PortfolioSummaryBar.tsx     # 4 KPI cards (value, invested, P&L, SIP)
│       ├── AssetRow.tsx                # Single row in the holdings list
│       ├── AssetTypeTabs.tsx           # Horizontal scrollable type filter
│       ├── AllocationChart.tsx         # Doughnut chart (victory-native or gifted-charts)
│       ├── BenchmarkChart.tsx          # Grouped bar chart
│       ├── PerformanceChart.tsx        # Synthetic line chart for detail view
│       ├── AssetForm.tsx               # Dynamic form with typeKey prop
│       ├── AssetTypeFieldConfig.ts     # Port of assetConfigs JS object from list.html
│       ├── SIPModal.tsx                # SIP configuration bottom sheet
│       ├── BulkUploadModal.tsx         # Document picker + preview
│       └── AssetEmptyState.tsx         # Empty state with Add and Import CTAs
│
├── hooks/
│   └── assets/
│       ├── useAssets.ts                # Fetch asset list + portfolio summary
│       ├── useAssetDetail.ts           # Fetch or select single asset from cache
│       ├── useRefreshPrices.ts         # Trigger price refresh, handle loading/error
│       ├── useSIPConfig.ts             # Fetch and save SIP for an asset
│       ├── useEquityLookup.ts          # Debounced ticker → name lookup
│       └── useBulkUpload.ts            # Document picker, parse CSV, POST upload
│
├── api/
│   └── assets/
│       ├── assetsApi.ts                # All Axios/fetch calls to /assets endpoints
│       └── types.ts                    # TypeScript interfaces mirroring backend response shapes
│
├── store/
│   └── assetsStore.ts                  # Zustand store: asset list, portfolio summary, selected asset
│
└── utils/
    ├── currency.ts                     # paise_to_rupees, rupees_to_paise, format_inr (port from currency.py)
    ├── cagr.ts                         # CAGR estimate formula (port from list.html cagr())
    └── assetTypeConfig.ts              # Asset type ID → key mapping, SIP eligibility
```

---

## 12.2 Recommended Hooks

### `useAssets.ts`
```typescript
// Fetches GET /assets (JSON version) and returns:
// { assets, portfolioSummary, allocationItems, benchmark, isLoading, error, refetch }
// Backed by Zustand store; refetch on pull-to-refresh or after mutation
```

### `useRefreshPrices.ts`
```typescript
// POST /assets/refresh-prices
// Returns { refresh, isRefreshing, result }
// result: { updated, candidates, errors }
// Called from AssetsScreen pull-to-refresh or Refresh button
```

### `useSIPConfig.ts`
```typescript
// GET /assets/{id}/sip → sip object
// POST /assets/{id}/sip with form values
// Returns { sip, isLoading, save, isSaving }
```

### `useEquityLookup.ts`
```typescript
// Debounced (400ms) call to GET /assets/lookup/equity?ticker=X
// Returns { name, price, isLoading }
// Used in AssetForm when typeKey === 'equity'
```

---

## 12.3 API Layer Design

Create `src/api/assets/assetsApi.ts`:

```typescript
import { apiClient } from '../client'; // Axios instance with auth token header

export interface AssetSummary {
  id: string;
  name: string;
  type: string;
  type_key: string;
  isin: string;
  ticker: string;
  quantity: number;
  invested: number;        // ₹ float (already converted from paise by backend)
  current: number;         // ₹ float
  invested_fmt: string;    // "₹1,23,456.00"
  current_fmt: string;
  pnl_fmt: string;
  pnl_pct: number;
  is_sip: boolean;
  sip_monthly: number;     // ₹ float
  sip_fmt: string;
  investment_date: string; // ISO date string
  maturity_date: string;
  price_per_unit: number;
  current_nav: number;
  guaranteed_return_pct: number;
  notes: string;
  image_url: string;
  details: Record<string, string>; // type-specific extras
}

export interface PortfolioSummary {
  total_invested: number;  // paise
  total_value: number;     // paise
  total_pnl: number;       // paise
  pnl_pct: number;
  monthly_sip: number;     // paise
  asset_count: number;
  active_sips: number;
  allocation: { type: string; value: number; invested: number; count: number; pct: number }[];
}

export const fetchAssets = (typeSlug?: string) =>
  apiClient.get<{ assets: AssetSummary[]; portfolio: PortfolioSummary; benchmark: BenchmarkResult }>(
    '/assets/json', { params: { type: typeSlug } }
  );

export const createAsset = (data: FormData) =>
  apiClient.post('/assets', data, { headers: { 'Content-Type': 'multipart/form-data' } });

export const updateAsset = (id: string, data: FormData) =>
  apiClient.post(`/assets/${id}/update`, data, { headers: { 'Content-Type': 'multipart/form-data' } });

export const deleteAsset = (id: string) =>
  apiClient.post(`/assets/${id}/delete`);

export const refreshPrices = () =>
  apiClient.post<{ updated: number; candidates: number; errors: string[] }>('/assets/refresh-prices/json');

export const lookupEquity = (ticker: string) =>
  apiClient.get<{ ticker: string; name: string | null; price: number | null }>(
    '/assets/lookup/equity', { params: { ticker } }
  );

export const getSIPConfig = (assetId: string) =>
  apiClient.get(`/assets/${assetId}/sip`);

export const saveSIPConfig = (assetId: string, data: SIPFormData) =>
  apiClient.post(`/assets/${assetId}/sip`, data);

export const bulkUpload = (file: { uri: string; name: string; type: string }) => {
  const fd = new FormData();
  fd.append('file', file as any);
  return apiClient.post('/assets/bulk-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
```

**Backend additions required:**
- `GET /assets/json` — same logic as `assets_list()` but returns JSON instead of HTML
- `POST /assets/refresh-prices/json` — same as `assets_refresh_prices()` but returns JSON result, not redirect
- Token-based auth middleware (`Authorization: Bearer <token>` header)

---

## 12.4 State Management Design

Use **Zustand** for global asset state:

```typescript
// src/store/assetsStore.ts
import { create } from 'zustand';

interface AssetsState {
  assets: AssetSummary[];
  portfolio: PortfolioSummary | null;
  benchmark: BenchmarkResult | null;
  selectedAsset: AssetSummary | null;
  activeTypeSlug: string;
  isLoading: boolean;
  error: string | null;

  setAssets: (assets: AssetSummary[], portfolio: PortfolioSummary, benchmark: BenchmarkResult) => void;
  setSelectedAsset: (asset: AssetSummary | null) => void;
  setActiveType: (slug: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  invalidate: () => void; // trigger refetch
}
```

**React Query (TanStack Query)** is recommended for server state caching on top of Zustand:
- `useQuery(['assets', typeSlug], fetchAssets)` — cached, auto-refetch on focus
- `useMutation(refreshPrices)` — with `onSuccess: () => queryClient.invalidateQueries(['assets'])`

---

## 12.5 Asset Type Field Config (TypeScript port of assetConfigs)

```typescript
// src/components/assets/AssetTypeFieldConfig.ts
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'file' | 'checkbox';

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  optional?: boolean;
  options?: string[];  // for select
  isMaturityDate?: boolean;
}

export interface SectionDef {
  label: string;
  cols: 1 | 2;
  fields: FieldDef[];
}

export interface AssetTypeConfig {
  nameLabel: string;
  namePlaceholder: string;
  sections: SectionDef[];
}

export const ASSET_CONFIGS: Record<string, AssetTypeConfig> = {
  mutual_fund: {
    nameLabel: 'Fund name', namePlaceholder: 'e.g. HDFC Mid Cap',
    sections: [
      { label: 'Identifiers', cols: 2, fields: [
        { id: 'isin', label: 'ISIN code', type: 'text', placeholder: 'INF179K01CC4', optional: true },
        { id: 'ticker', label: 'BSE/NSE ticker', type: 'text', placeholder: 'HDFCMIDCAP', optional: true },
      ]},
      { label: 'Investment details', cols: 2, fields: [
        { id: 'units', label: 'Units', type: 'number', placeholder: '0' },
        { id: 'purchase_price', label: 'NAV / purchase price (₹)', type: 'number', optional: true },
        { id: 'invested', label: 'Invested (₹)', type: 'number' },
        { id: 'current_value', label: 'Current value (₹)', type: 'number' },
        { id: 'investment_date', label: 'Investment date', type: 'date' },
        { id: 'sip', label: 'Monthly SIP (₹)', type: 'number', optional: true },
      ]},
      { label: 'SIP', cols: 1, fields: [
        { id: 'active_sip', label: 'This asset has an active SIP', type: 'checkbox' },
      ]},
      { label: 'Notes', cols: 1, fields: [
        { id: 'notes', label: 'Notes', type: 'textarea', optional: true },
      ]},
    ],
  },
  // ... equity, sgb, real_estate, digital_gold, physical_gold, fd, ppf
  // (full definitions mirror assetConfigs in list.html lines 285–377 exactly)
};

// Field ID → form field name mapping (mirrors assetNameMap in list.html line 378)
export const FIELD_NAME_MAP: Record<string, string> = {
  units: 'quantity', invested: 'invested_amount', current_value: 'current_value',
  sip: 'sip_monthly_amount', active_sip: 'is_sip', investment_date: 'investment_date',
  isin: 'isin', ticker: 'ticker', notes: 'notes', maturity_date: 'maturity_date',
  interest_rate: 'guaranteed_return_pct', coupon: 'guaranteed_return_pct',
  purchase_price: 'price_per_unit_input', purity: 'purity',
  area: 'area', location: 'location', account_no: 'account_no', nominee: 'nominee',
};

export const SIP_ELIGIBLE_TYPES = ['mutual_fund', 'equity', 'digital_gold', 'ppf'];

export const ASSET_TYPE_KEY_MAP: Record<string, string> = {
  at_mf: 'mutual_fund', at_eq: 'equity', at_sgb: 'sgb', at_re: 'real_estate',
  at_dg: 'digital_gold', at_pg: 'physical_gold', at_fd: 'fd', at_ppf: 'ppf',
};
```

---

## 12.6 Currency Utilities (TypeScript port of currency.py)

```typescript
// src/utils/currency.ts
export function paiseToRupees(paise: number | null): number {
  if (paise == null) return 0;
  return paise / 100;
}

export function rupeesToPaise(rupees: number | string | null): number {
  if (rupees == null || rupees === '') return 0;
  return Math.round(Number(rupees) * 100);
}

export function formatINR(paise: number | null): string {
  const rupees = paiseToRupees(paise ?? 0);
  const sign = rupees < 0 ? '-' : '';
  const abs = Math.abs(rupees);
  const whole = Math.floor(abs);
  const frac = Math.round((abs - whole) * 100);
  const s = String(whole);
  let grouped: string;
  if (s.length > 3) {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
    if (rest) parts.unshift(rest);
    grouped = parts.join(',') + ',' + last3;
  } else {
    grouped = s;
  }
  return `${sign}₹${grouped}.${String(frac).padStart(2, '0')}`;
}
```

---

## 12.7 Navigation Integration

Use **Expo Router** (file-based) or **React Navigation** (stack + tab):

```
Tab Navigator
└── Assets Tab (AssetsScreen)
    └── Stack Navigator
        ├── AssetsScreen           (index)
        ├── AssetDetailScreen      (asset/:id)
        ├── AddAssetScreen         (modal)
        └── EditAssetScreen        (modal, asset/:id/edit)

Modals (presented over tab bar):
├── SIPModal                       (asset/:id/sip)
└── BulkUploadModal
```

**Deep linking:** `/assets/:id` → `AssetDetailScreen` with pre-loaded asset

---

## 12.8 Backend API Changes Required

The existing FastAPI backend serves HTML pages, not JSON. For the mobile app, add:

1. **`GET /api/v1/assets`** — Return JSON with assets list, portfolio summary, benchmark result
2. **`POST /api/v1/assets`** — Create asset (same fields, JSON or multipart)
3. **`PUT /api/v1/assets/{id}`** — Update asset
4. **`DELETE /api/v1/assets/{id}`** — Delete asset
5. **`POST /api/v1/assets/refresh-prices`** — Trigger refresh, return JSON result (not redirect)
6. **`GET /api/v1/assets/{id}/sip`** — Already returns JSON (no change needed)
7. **`POST /api/v1/assets/{id}/sip`** — Returns JSON result instead of redirect
8. **`POST /api/v1/auth/login`** — Return Bearer token (not cookie) for mobile clients
9. The existing `/assets/lookup/equity` already returns JSON — just add to API prefix

---

## 12.9 Testing Strategy

### Unit Tests
- `currency.ts`: Test `formatINR`, `paiseToRupees`, `rupeesToPaise` against known values (especially Indian grouping: 1,23,456)
- `cagr.ts`: Test CAGR formula against manual calculations
- `AssetTypeFieldConfig.ts`: Verify all 8 type configs have required fields

### Integration Tests
- `assetsApi.ts`: Mock server responses; verify request shape for create/update (FormData fields match backend parameter names)
- `useRefreshPrices`: Verify optimistic update and error handling

### Component Tests (React Native Testing Library)
- `PortfolioSummaryBar`: Renders correct ₹ values from paise input
- `AssetForm`: Renders correct fields for each of 8 type keys
- `AssetForm` Equity: Investing amount auto-computes from shares × price
- `AssetRow`: Shows SIP badge when `is_sip=true`
- `BenchmarkChart`: Renders all asset classes from benchmark data

### End-to-End Tests (Detox or Maestro)
- Add a Mutual Fund asset → verify appears in list with correct P&L
- Tap "Refresh Prices" → verify loading state → verify updated values
- Configure SIP → verify SIP badge appears on asset row
- Delete asset → confirm dialog → verify removed from list

### Manual QA Checklist
- Verify Indian number formatting (1,23,456 not 123,456) on all money displays
- Verify CAGR edge cases: same day (0.25 year floor), very long holding, negative P&L
- Verify gold price calculation matches a real spot price
- Verify AMFI NAV matches AMFI website for a known ISIN
- Verify XLSX bulk upload on both iOS and Android
- Verify image upload, display, and replacement for Physical Gold

---

*End of ASSETS_FEATURE_ANALYSIS.md*
