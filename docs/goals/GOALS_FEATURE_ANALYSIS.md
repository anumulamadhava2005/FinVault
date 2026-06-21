# GOALS FEATURE ANALYSIS — FinVault
## Complete Reverse-Engineering Report for Mobile Migration

> **Stack Reality Check:** FinVault is NOT a React application. It is a Python/FastAPI server-rendered web app using Jinja2 templates, Alpine.js for client-side reactivity, htmx for progressive enhancement, and Chart.js for charts. All "components" are Jinja2 macros or HTML partials. This report is structured so a React Native / Expo engineer can rebuild the feature from scratch without any web source code.

---

# 1. Goals Feature Overview

## Purpose of the Goals Page

The Goals page (`/goals`) allows users to define named financial milestones (e.g., Retirement Fund, Child Education, Europe Trip), link existing investment assets to each goal, and track progress automatically as asset values change. It provides a real-time view of whether the user is on track to meet each goal by its target date.

## User Workflows

1. **View Goals Dashboard** — User navigates to `/goals`. The page renders a summary bar with aggregate statistics, an optional consolidated bar chart, and individual goal cards.
2. **Switch Views** — User toggles between "Cards" view (detailed cards with progress bars) and "Focus" view (radial rings with milestone dots). Both views are rendered server-side; Alpine.js toggles visibility.
3. **Create a Goal** — User clicks "+ Add Goal", fills in a modal form (name, type, target amount, monthly contribution, target date, linked assets), and submits. The form POSTs to `/goals`.
4. **Delete a Goal** — User clicks the "×" button on any goal card. A JavaScript confirm dialog appears (fvConfirmDelete). On confirmation, the form POSTs to `/goals/{goal_id}/delete`.
5. **Monitor Progress** — Progress is derived automatically from linked asset current values. No manual "contribution entry" is required for the goals page itself.

**There is NO goal editing flow.** Goals cannot be edited once created. The user must delete and re-create.

## Business Objectives

- Motivate users to save by making abstract financial targets visible and measurable.
- Surface timeline-based status (on track / behind / overdue) using a simple linear interpolation model so users know if their pace of saving is sufficient.
- Provide a projection for "months to completion" in the Focus view.
- Show consolidated progress across all goals to encourage holistic portfolio thinking.

## Goal Lifecycle

```
Creation → Linking Assets → Monitoring (auto-updated as assets change) → Completion (when current >= target)
```

1. **Creation:** User defines name, type, target amount, monthly budget, target date, and links assets.
2. **Auto-tracking:** `current` value is always recalculated from the sum of `asset.current_value × allocation_pct / 100` for each linked asset.
3. **Status Determination:** At each page load, `goal_timeline()` is called per goal to derive status from elapsed time vs. saved amount.
4. **Completion:** When `current >= target_amount` (and target > 0), status is automatically set to "completed".
5. **Overdue:** When `today >= target_date` and goal is not completed.
6. **No soft-delete or archive** — the only terminal action is hard delete.

## How Goals Are Structured

A goal is defined by:
- A name and type (from a fixed set of 7 types)
- A target amount in paise (integer, 1 rupee = 100 paise)
- An optional user-entered monthly contribution amount (informational, not enforced)
- An optional target date (ISO date string `YYYY-MM-DD`)
- An icon emoji (auto-assigned from type) and a hex color (auto-assigned from type)
- A set of linked assets via a join table, each with an allocation percentage (default 100%)

The "current" value is always computed, never stored — it is recalculated at query time from linked assets.

## How Progress is Tracked

- Progress = sum of (asset.current_value × allocation_pct / 100) for all linked assets.
- Progress % = (current / target_amount) × 100.
- Expected progress % = (elapsed_days / total_days) × 100, where elapsed = days from goal creation to today, total = days from creation to target date.

## How Completion is Determined

Completion is determined programmatically at query time: `current >= target_amount AND target_amount > 0`. There is no separate `is_completed` flag that is actively updated (the model field exists but is never set by the routes).

---

# 2. File Dependency Map

```
Goals Feature
├── app/app/templates/goals/list.html          ← Main page template
│   ├── partials/_bars.html                    ← score_color macro
│   ├── partials/_confirm_delete.html          ← Delete confirmation modal
│   ├── partials/_modal_system.html            ← Toast + session modal system
│   └── base.html                              ← Layout, nav, CSS/JS includes
│
├── app/app/pages.py (lines 3123–3187)         ← HTTP routes for goals
│   ├── GET  /goals    → goals_page()
│   ├── POST /goals    → goals_create()
│   └── POST /goals/{goal_id}/delete → goals_delete()
│
├── app/app/services.py (lines 556–651)        ← Business logic / calculations
│   ├── GOAL_STATUS dict
│   ├── goal_timeline()
│   └── goals_progress()
│
├── app/app/models.py (lines 259–293)          ← ORM data models
│   ├── FinancialGoal
│   └── GoalAssetLink
│
├── app/app/currency.py                        ← Money formatting
│   ├── rupees_to_paise()
│   ├── paise_to_rupees()
│   └── format_inr()  (registered as |inr Jinja2 filter)
│
├── app/app/static/js/app.js                   ← Shared JS: modals, toast, fvConfirmDelete
├── app/app/static/js/chart.umd.min.js         ← Chart.js (vendored)
├── app/app/static/js/chart-theme.js           ← Chart color constants (FV_CHART_COLORS)
├── app/app/static/js/alpine.min.js            ← Alpine.js reactivity (vendored)
├── app/app/static/css/main.css                ← All styles including .goal-card, .goal-ring, .ms-dot, .tl-*
│
├── app/app/static/img/logo-goals/             ← Goal type icon images
│   ├── retirement.png
│   ├── education.png
│   ├── travel.png
│   ├── emergency.png
│   ├── home.png
│   ├── wedding.png
│   └── custom.png                             ← Fallback used via onerror=
│
├── app/app/sample_data.py (lines 51–56)       ← Seed goals for demo
└── app/app/templates/dashboard/index.html     ← Embeds top 3 goals as widget
```

### Per-File Details

#### `app/app/templates/goals/list.html`
- **Purpose:** Main Goals page template; renders summary, chart, cards, focus view, timeline, and add-goal modal.
- **Inputs:** `progress` dict (from `goals_progress()`), `assets` list (all user assets for the link picker), `timeline` list (goals with target_date, sorted ascending), `today` (ISO date string from base context).
- **Outputs:** Server-rendered HTML page.
- **Dependencies:** `base.html`, `partials/_bars.html` (score_color macro), Alpine.js, Chart.js.
- **Components (Jinja2 macros):**
  - `goal_status_badge(g)` — renders a colored chip with icon + label from `g.status_tone`, `g.status_icon`, `g.status_label`.

#### `app/app/pages.py` (goals section)
- **Purpose:** FastAPI route handlers for goal CRUD.
- **Inputs:** HTTP requests (GET/POST), form fields, DB session.
- **Outputs:** HTML responses (render) or 303 RedirectResponse to `/goals`.
- **Functions exported:**
  - `goals_page(request, db)` — fetches data, renders template.
  - `goals_create(request, db, name, goal_type, target_amount, monthly_needed, target_date, priority, linked_assets)` — creates FinancialGoal + GoalAssetLink records.
  - `goals_delete(request, goal_id, db)` — deletes goal (cascades to GoalAssetLink).
- **Constants:**
  - `GOAL_ICONS` dict — maps goal_type to emoji.
  - `GOAL_COLORS` dict — maps goal_type to hex color string.

#### `app/app/services.py` (goals section)
- **Purpose:** All goal calculation and aggregation logic.
- **Inputs:** SQLAlchemy Session, user_id.
- **Outputs:** Python dicts consumed by templates.
- **Functions exported:**
  - `goal_timeline(start, target_date, target_amount, current, today)` — timeline-based status engine.
  - `goals_progress(db, user_id)` — aggregate progress for all user goals.
- **Constants:**
  - `GOAL_STATUS` — maps status key to `{label, icon, tone}`.

#### `app/app/models.py` (goals section)
- **Purpose:** SQLAlchemy ORM models defining the DB schema.
- **Classes exported:**
  - `FinancialGoal` — main goal record (table: `financial_goals`).
  - `GoalAssetLink` — many-to-many join between goals and assets (table: `goal_asset_links`).

#### `app/app/currency.py`
- **Purpose:** Paise ↔ rupee conversion and INR display formatting.
- **Functions exported:**
  - `rupees_to_paise(amount)` — converts float/int/str to integer paise (uses Decimal for precision).
  - `paise_to_rupees(paise)` — converts integer paise to float rupees.
  - `format_inr(paise)` — formats paise as `₹X,XX,XXX.XX` (Indian grouping).
- **Used in:** All money display in templates via `|inr` filter, all form submissions.

#### `app/app/static/css/main.css` (goal-relevant rules)
- **Purpose:** All visual styling. Goal-specific classes include: `.goal-card`, `.goal-head`, `.goal-ico`, `.goal-ico-img`, `.goal-logo`, `.goal-logo-sm`, `.goal-logo-xs`, `.goal-meta`, `.goal-ring`, `.goal-ring-in`, `.milestones`, `.ms-dot`, `.ms-dot.hit`, `.tl-node`, `.tl-dot`, `.tl-card`, `.tl-logo`, `.tl-date`, `.tl-pct`, `.chip`, `.chip.warn`, `.bar`, `.summary-bar`, `.seg`.

#### `app/app/static/js/app.js`
- **Purpose:** Global JS runtime. Provides `fvConfirmDelete(form, message, title)` used in the goals delete buttons. Also provides the modal system, toast system, CSRF token injection, and session timeout countdown.

#### `app/app/static/img/logo-goals/`
- **Purpose:** PNG icons for each goal type. Loaded via `src="/static/img/logo-goals/{goal_type}.png"` with `onerror="this.src='/static/img/logo-goals/custom.png'"` fallback.

#### `app/app/sample_data.py` (GOALS list)
- **Purpose:** Seeds 4 demo goals (Retirement Fund, Child Education, Europe Trip, Emergency Fund) with linked assets.

#### `app/app/templates/dashboard/index.html`
- **Purpose:** Dashboard page embeds up to 3 goals from `stats.goals.goals[:3]` as a "Goal Progress" widget with a "VIEW ALL" link to `/goals`.

---

# 3. UI Breakdown

## Summary Bar (`<div class="summary-bar">`)

| UI Element | Component | Source File | Data Source | User Actions | State Dependencies |
|---|---|---|---|---|---|
| Total Goal Value | `<div class="value">` | goals/list.html:28 | `progress.total_target \| inr` | None | goals_progress() result |
| Total Achieved | `<div class="value pos">` | goals/list.html:29 | `progress.total_current \| inr` + `(progress.overall_pct)%` | None | goals_progress() result |
| On Track Status | `<div class="value">` | goals/list.html:30 | `progress.on_track` of `progress.count` goals | None | goals_progress() result |
| Overall Progress Bar | `.bar` > `<span>` | goals/list.html:31 | `progress.overall_pct` (width %), `score_color(progress.overall_pct)` (color) | None | goals_progress() result |

## Consolidated Bar Chart (`<canvas id="fundsChart">`)

| UI Element | Component | Source File | Data Source | User Actions | State Dependencies |
|---|---|---|---|---|---|
| "All Funds — Achieved vs Target" Chart | Chart.js grouped bar | goals/list.html:168–191 | `progress.goals` names, `current` values, `target` values | None (read-only chart) | progress.goals (rendered only if goals exist) |

- **Rendered when:** `progress.goals` is non-empty.
- **Chart type:** `'bar'` (grouped).
- **Dataset 1 (Achieved):** `backgroundColor: '#2FA86B'`, `data = goals.map(g => g.current / 100)` (converts paise to rupees).
- **Dataset 2 (Target):** `backgroundColor: '#C2E033'`, `data = goals.map(g => g.target / 100)`.
- **Y-axis tick:** `'₹' + (v/1000) + 'k'` (values in thousands of rupees, displayed as "₹Xk").
- **Tooltip:** `'₹' + Math.round(c.parsed.y).toLocaleString('en-IN')`.
- **Note:** The division by 100 in the dataset is because Chart.js receives rupee values; `progress.goals[n].current` is already in paise (integer), so the template divides by 100 before passing to Chart.js. However, this means the Y axis callback `v/1000` actually shows values in rupees / 1000 (thousands of rupees).

## View Toggle (Segmented Control)

| UI Element | Component | Source File | Data Source | User Actions | State Dependencies |
|---|---|---|---|---|---|
| Cards / Focus toggle | `.seg` buttons | goals/list.html:17–20 | None | Click sets Alpine.js `view` to `'cards'` or `'focus'` | `view` in Alpine.js `x-data="{showAdd:false, view:'cards'}"` |

## Goal Cards (Cards View — `x-show="view==='cards'"`)

Each goal renders a `.goal-card` with:

| UI Element | Component | Source File | Data Source | User Actions | State Dependencies |
|---|---|---|---|---|---|
| Goal icon image | `<img class="goal-ico-img">` | goals/list.html:49 | `/static/img/logo-goals/{g.goal_type}.png` | None | `g.goal_type` |
| Goal name | `<b style="font-size:15px">` | goals/list.html:50 | `g.name` | None | — |
| Status badge | `goal_status_badge(g)` macro | goals/list.html:8–12 | `g.status_tone`, `g.status_icon`, `g.status_label` | None | Status from goal_timeline() |
| Delete button | `<button class="btn-danger btn-sm">×</button>` | goals/list.html:52 | `g.id`, `g.name` | Click triggers `fvConfirmDelete(form, message, title)` → form POST `/goals/{g.id}/delete` | — |
| Current / Target amounts | `<b>` + `<span class="muted tiny">` | goals/list.html:54 | `g.current \| inr`, `g.target \| inr` | None | — |
| Progress bar | `.bar` > `<span>` | goals/list.html:55 | `g.pct` (width %), `score_color(g.pct)` (background color) | None | pct from goals_progress() |
| "X% complete" text | `<span>` | goals/list.html:57 | `g.pct` | None | — |
| Info tooltip (on "X% complete") | `.fv-info` + `.fv-tip` | goals/list.html:58 | Static explanatory text, `g.expected_pct` | Hover/Focus reveals tooltip | — |
| "Save ~X/mo to finish on time" | `<span>` (conditional) | goals/list.html:60 | `g.required_monthly \| inr` | None | `g.status != 'completed'` and `g.required_monthly` truthy |
| Target Date meta | `.goal-meta` cell | goals/list.html:63 | `g.target_date` (or '—') | None | — |
| Monthly Needed meta | `.goal-meta` cell | goals/list.html:64 | `g.monthly_needed \| inr` | None | — |
| Linked Assets meta | `.goal-meta` cell | goals/list.html:65 | `g.linked` (count of GoalAssetLink records) | None | — |

## Empty State (Cards View)

| UI Element | Component | Source File | Condition |
|---|---|---|---|
| "No goals yet" card | `<div class="card">` | goals/list.html:69 | `progress.goals` is empty (Jinja2 `{% else %}` on for loop) |

## Focus View (`x-show="view==='focus'"`)

Each goal renders a `.goal-card` with `text-align: center`:

| UI Element | Component | Source File | Data Source | User Actions | State Dependencies |
|---|---|---|---|---|---|
| Status badge (top-right) | `goal_status_badge(g)` | goals/list.html:82 | Same as cards view | None | — |
| Delete button (top-right) | `<button class="btn-danger btn-sm">×</button>` | goals/list.html:83 | `g.id`, `g.name` | fvConfirmDelete → POST | — |
| Radial progress ring | `.goal-ring` with conic-gradient | goals/list.html:85 | `score_color(g.pct)` (color), `g.pct` (progress %) | None | `g.pct` |
| Percentage label inside ring | `.goal-ring-in` > `<b>` | goals/list.html:86 | `g.pct`% | None | — |
| Goal icon | `<img class="goal-logo-sm">` | goals/list.html:88 | `/static/img/logo-goals/{g.goal_type}.png` | None | — |
| Goal name | `<b>` | goals/list.html:89 | `g.name` | None | — |
| Current / Target text | `<p class="tiny muted">` | goals/list.html:90 | `g.current \| inr`, `g.target \| inr` | None | — |
| Milestone dots (25/50/75/100%) | `.ms-dot` (`.hit` if pct>=m) | goals/list.html:92–96 | `g.pct` vs [25, 50, 75, 100] | None (visual only) | `g.pct` |
| Target Date meta | `.goal-meta` cell | goals/list.html:98 | `g.target_date` or '—' | None | — |
| Projection meta | `.goal-meta` cell | goals/list.html:99 | `months` = ceil((remaining / monthly_needed)) if monthly_needed else 0 | None | `g.pct`, `months`, `g.monthly_needed` |

**Projection calculation (in template, not service):**
```jinja2
{% set remaining = (g.target - g.current) %}
{% set months = ((remaining / g.monthly_needed) | round(0, 'ceil') | int) if g.monthly_needed else 0 %}
```
- If `g.pct >= 100`: shows "Achieved 🎉"
- Elif `months > 0`: shows "~{months} mo"
- Else: shows "Set monthly"

## Goal Timeline (`x-show="view==='cards'"`)

Shown below the cards when at least one goal has a `target_date`.

| UI Element | Component | Source File | Data Source | User Actions | State Dependencies |
|---|---|---|---|---|---|
| Timeline container | `.timeline` | goals/list.html:114 | `timeline` context list | None | Conditional: `{% if timeline %}` |
| Timeline node | `.tl-node` | goals/list.html:115 | per goal in `timeline` | None | — |
| Timeline dot | `.tl-dot` with `--tl: {g.color}` | goals/list.html:118 | `g.color` (hex from `color_hex` field) | None | — |
| Goal logo | `<img class="tl-logo">` | goals/list.html:119 | `/static/img/logo-goals/{g.goal_type}.png` | None | — |
| Goal name | `<b>` | goals/list.html:120 | `g.name` | None | — |
| Target date | `.tl-date` | goals/list.html:121 | `g.target_date` | None | — |
| Progress % | `.tl-pct.pos` | goals/list.html:122 | `g.pct`% | None | — |

## Add Goal Modal (`x-show="showAdd"`)

Shown when Alpine.js `showAdd` is true.

| UI Element | Component | Source File | Data Source | User Actions | State Dependencies |
|---|---|---|---|---|---|
| Goal type icon preview | `<img class="goal-logo-sm">` | goals/list.html:136 | `:src="'/static/img/logo-goals/'+gt+'.png'"` (Alpine reactive) | Reacts to goal type select change | `gt` (Alpine model) |
| Goal Name input | `<input name="name">` | goals/list.html:139 | None | User types | Required field |
| Goal Type select | `<select name="goal_type" x-model="gt">` | goals/list.html:139 | Options: retirement, education, travel, emergency, home, wedding, custom | Change updates `gt` + preview icon | `gt` Alpine model |
| Target (₹) input | `<input type="number" name="target_amount">` | goals/list.html:147 | None | User types | Required |
| Monthly Needed (₹) input | `<input type="number" name="monthly_needed" value="0">` | goals/list.html:148 | Default 0 | User types | Optional |
| Target Date input | `<input type="date" name="target_date" min="{{ today }}">` | goals/list.html:149 | `today` from base context | User picks | Optional; min = today's ISO date |
| Link Assets checkboxes | `<input type="checkbox" name="linked_assets" value="{a.id}">` | goals/list.html:154 | `assets` list (user's assets with current_value) | Check/uncheck | Optional; multiple allowed |
| Cancel button | `<button @click="showAdd=false">` | goals/list.html:158 | None | Click closes modal | `showAdd` Alpine |
| Create Goal button | `<button class="btn">` | goals/list.html:158 | None | Submit form POST /goals | — |

## Confirm Delete Dialog

| UI Element | Component | Source File | Data Source | User Actions | State Dependencies |
|---|---|---|---|---|---|
| Delete confirmation modal | `fvConfirmDelete(form, message, title)` | partials/_confirm_delete.html + app.js | `g.name` (in message text) | Confirm → form.submit(); Cancel → close | — |

## Loading States

**No explicit loading states.** The page is fully server-rendered. When a form is submitted, the browser navigates (full page reload). There is no async data fetching on the goals page.

## Error States

**No explicit error states on the goals page.** All errors are handled by redirect (e.g., auth redirect to `/login`). The empty state (no goals) is handled by the Jinja2 `{% else %}` clause.

## Status Badges (all views)

| Status Key | Label | Icon | Tone | Background | Text Color |
|---|---|---|---|---|---|
| `completed` | Completed | ✓ | `good` | `var(--green-soft)` | `var(--primary)` |
| `on_track` | On Track | ● | `good` | `var(--green-soft)` | `var(--primary)` |
| `behind` | Behind Schedule | ▲ | `warn` | `var(--warn-soft)` | `var(--warn)` |
| `overdue` | Overdue | ! | `bad` | `var(--danger-soft)` | `var(--danger-strong)` |

---

# 4. Data Flow Analysis

## Trace for Every Displayed Field

### Goal Name
```
DB: financial_goals.name (String)
→ No transformation
→ goals_progress(): out[].name
→ Template: g.name in goal-card, focus view, timeline, add-modal form
```

### Goal Category / Type
```
DB: financial_goals.goal_type (String, default "custom")
→ No transformation in service
→ goals_progress(): out[].goal_type
→ Template: used as image path /static/img/logo-goals/{g.goal_type}.png
→ Also: form select default "retirement"
```

### Current Amount
```
DB: asset.current_value (Integer paise) via GoalAssetLink.allocation_pct
→ services.goals_progress():
    current = sum(
        round(l.asset.current_value * l.allocation_pct / 100)
        for l in g.links if l.asset
    )
→ goals_progress(): out[].current (Integer paise)
→ Template: g.current | inr → format_inr(paise) → "₹X,XX,XXX.XX"
```

### Target Amount
```
DB: financial_goals.target_amount (Integer paise)
→ No transformation
→ goals_progress(): out[].target (= g.target_amount, Integer paise)
→ Template: g.target | inr
```

### Progress %
```
DB: target_amount + computed current
→ services.goals_progress():
    pct = round(current / g.target_amount * 100, 1) if g.target_amount else 0.0
    pct = min(pct, 100)  ← capped at 100 for display
→ goals_progress(): out[].pct (float, 0..100)
→ Template: g.pct% text + progress bar width: {{ g.pct }}%; background: {{ score_color(g.pct) }}
```

### Monthly Requirement (User-Entered)
```
DB: financial_goals.monthly_needed (Integer paise)
→ No transformation in service
→ goals_progress(): out[].monthly_needed (= g.monthly_needed)
→ Template (Cards): g.monthly_needed | inr in goal-meta cell
```

### Required Monthly Contribution (Calculated)
```
DB: target_amount + created_at + target_date
→ services.goal_timeline():
    remaining_amount = max(target_amount - current, 0)
    remaining_months = max(round((target_date - today).days / 30.44), 1)
    required_monthly = round(remaining_amount / remaining_months)
    (If target_date <= today: required_monthly = remaining_amount — full shortfall due now)
→ goals_progress(): out[].required_monthly (Integer paise)
→ Template: "Save ~{{ g.required_monthly | inr }}/mo to finish on time"
   (shown when g.status != 'completed' and g.required_monthly is truthy)
```

### Expected Amount / Expected Pct
```
DB: financial_goals.created_at (ISO datetime), financial_goals.target_date
→ services.goal_timeline():
    start = _parse_iso_date(g.created_at)  # date portion of ISO datetime
    total_days = (target_date - start).days
    elapsed = max(0, min((today - start).days, total_days))
    frac = elapsed / total_days
    expected = round(frac * target_amount)
    expected_pct = round(frac * 100, 1)
→ goals_progress(): out[].expected (paise), out[].expected_pct (float 0..100)
→ Template: expected_pct used in tooltip text: "({{ g.expected_pct }}% expected so far)"
```

### Target Date
```
DB: financial_goals.target_date (String "YYYY-MM-DD" or None)
→ No transformation
→ goals_progress(): out[].target_date
→ Template: g.target_date or '—'
→ Also: used by timeline (sorted ascending), goal_timeline() to compute remaining_months
```

### Goal Status
```
DB: target_amount + created_at + target_date + computed current
→ services.goal_timeline():
    if current >= target_amount: status = "completed"
    elif today >= target_date: status = "overdue"
    elif current >= expected: status = "on_track"
    else: status = "behind"
→ goals_progress(): out[].status (str key), out[].status_label, out[].status_icon, out[].status_tone
→ Template: goal_status_badge(g) macro uses status_tone/icon/label
```

### On Track / Behind Schedule Indicator
```
DB: computed status
→ goals_progress(): out[].on_track = (tl["status"] in ("completed", "on_track"))
→ Template: .chip with green/warn/danger styling based on status_tone
→ Summary bar: progress.on_track (count of on-track goals)
```

### Remaining Amount
```
Not stored in DB; calculated in template and in goal_timeline()
→ Template (Focus view only):
    {% set remaining = (g.target - g.current) %}  (paise)
    {% set months = ceil(remaining / g.monthly_needed) if g.monthly_needed else 0 %}
```

### Linked Assets Count
```
DB: GoalAssetLink (count via len(g.links))
→ goals_progress(): out[].linked = len(g.links)
→ Template: g.linked in goal-meta "Linked Assets" cell
```

### Completion Forecast (Focus View Projection)
```
Calculated inline in template:
    remaining = g.target - g.current  (paise)
    months = ceil(remaining / g.monthly_needed) if g.monthly_needed else 0
Display:
    - "Achieved 🎉" if pct >= 100
    - "~{months} mo" if months > 0
    - "Set monthly" otherwise
```

---

# 5. Goal Calculation Engine Analysis

## All Calculation Logic Location: `app/app/services.py`

### Calculation 1: Current Value (Computed from Linked Assets)

```
Formula:    current = Σ( round(link.asset.current_value × link.allocation_pct / 100) )
            for each GoalAssetLink where link.asset is not None
```
- **Purpose:** Derive how much money has been accumulated toward this goal.
- **Inputs:** `GoalAssetLink.asset.current_value` (paise), `GoalAssetLink.allocation_pct` (float, default 100.0)
- **Outputs:** `current` (Integer paise)
- **File:** `services.py`, `goals_progress()`, line ~629
- **Components using it:** Cards view (current/target display), Focus view, Timeline, Summary bar

### Calculation 2: Progress Percentage

```
Formula:    pct = round(current / target_amount × 100, 1)  if target_amount > 0 else 0.0
            pct = min(pct, 100)   ← capped for display width (not for status logic)
```
- **Purpose:** Display and color the progress bar; used as the ring fill in Focus view.
- **Inputs:** `current` (paise), `g.target_amount` (paise)
- **Outputs:** `pct` (float, 0..100 for display)
- **File:** `services.py`, `goals_progress()`, line ~631
- **Components:** Progress bar, ring, percentage text, score_color calls

### Calculation 3: Expected Fraction (Timeline)

```
Formula:    total_days = (target_date - start).days
            if total_days <= 0:
                frac = 1.0
            else:
                elapsed = max(0, min((today - start).days, total_days))
                frac = elapsed / total_days
```
- **Purpose:** Determine what fraction of the target should have been saved by today, assuming a linear accumulation pace from goal creation to target date.
- **Inputs:** `start` (date from g.created_at), `target_date` (date), `today` (date)
- **Outputs:** `frac` (float, 0.0..1.0)
- **Edge cases:**
  - `start == target_date` or inverted: `frac = 1.0` (fully expected now)
  - `today < start`: `elapsed = 0`, `frac = 0`
  - `today > target_date`: `elapsed = total_days`, `frac = 1.0`
  - No `start` or no `target_date`: `frac = 0.0`
- **File:** `services.py`, `goal_timeline()`, lines 593–601

### Calculation 4: Expected Amount by Now

```
Formula:    expected = round(frac × target_amount)
```
- **Purpose:** The amount you should have saved by today for a steady linear pace.
- **Inputs:** `frac` (float), `target_amount` (paise)
- **Outputs:** `expected` (Integer paise)
- **File:** `services.py`, `goal_timeline()`, line ~601
- **Used in:** Status determination (on_track vs behind), tooltip text

### Calculation 5: Expected Percentage

```
Formula:    expected_pct = round(frac × 100, 1)
```
- **Purpose:** Display in tooltip: "(X% expected so far)"
- **Inputs:** `frac`
- **Outputs:** `expected_pct` (float)
- **File:** `services.py`, `goal_timeline()`, line 618

### Calculation 6: Remaining Monthly Contribution Required

```
Formula:    remaining_amount = max(target_amount - current, 0)
            if target_date and target_date > today:
                remaining_months = max(round((target_date - today).days / 30.44), 1)
                required_monthly = round(remaining_amount / remaining_months)
            else:
                required_monthly = remaining_amount  ← full shortfall due now
```
- **Purpose:** Tell the user how much to save per month to hit the goal on time.
- **Inputs:** `target_amount` (paise), `current` (paise), `target_date` (date), `today` (date)
- **Outputs:** `required_monthly` (Integer paise)
- **Note:** Uses 30.44 average days/month. Minimum 1 month to avoid division by zero.
- **File:** `services.py`, `goal_timeline()`, lines 604–609

### Calculation 7: Goal Status Determination

```
Formula:
    if current >= target_amount and target_amount > 0:
        status = "completed"
    elif start and target_date:
        expected = round(frac × target_amount)
        if target_date and today >= target_date:
            status = "overdue"
        elif current >= expected:
            status = "on_track"
        else:
            status = "behind"
    else:
        # No timeline data
        status = "on_track"  (current >= 0 which is always >= expected=0)
```
- **Purpose:** Classify the goal into one of 4 statuses.
- **Inputs:** `current`, `target_amount`, `expected`, `target_date`, `today`
- **Outputs:** `status` ∈ {"completed", "on_track", "behind", "overdue"}
- **File:** `services.py`, `goal_timeline()`, lines 612–618

### Calculation 8: Overall Portfolio Progress

```
Formula:    total_target = Σ(g.target_amount) for all goals
            total_current = Σ(current) for all goals
            overall_pct = round(total_current / total_target × 100, 1) if total_target else 0.0
            on_track = count of goals where status in ("completed", "on_track")
```
- **Purpose:** Summary bar aggregate across all goals.
- **Inputs:** All computed per-goal values
- **Outputs:** `total_target`, `total_current`, `overall_pct`, `on_track`, `count`
- **File:** `services.py`, `goals_progress()`, lines 623–651

### Calculation 9: Focus View Projection (In Template)

```
Formula:    remaining = g.target - g.current
            months = ceil(remaining / g.monthly_needed) if g.monthly_needed else 0
```
- **Purpose:** Estimate months to completion using user-entered monthly budget.
- **Inputs:** `g.target` (paise), `g.current` (paise), `g.monthly_needed` (paise)
- **Outputs:** `months` (integer)
- **File:** `templates/goals/list.html`, lines 78–79
- **Note:** This is different from `required_monthly` (which is computed from target date). This projection uses the user-entered `monthly_needed` as the denominator.

### Score Color Formula (Progress Bar / Ring Color)

```
Formula:    if v >= 70: color = 'var(--bar-good)'   ← green
            elif v >= 40: color = 'var(--warn)'      ← orange
            else: color = 'var(--danger)'             ← red
```
- **File:** `templates/partials/_bars.html`, Jinja2 macro `score_color(v)`
- **Used in:** Progress bars (cards + summary), ring fill color (focus view)

---

# 6. External API Inventory

**There are NO external APIs used by the Goals feature.** All data is stored locally in SQLite and computed at query time.

**Internal Endpoints used by the Goals feature:**

| Name | Endpoint | Method | Purpose | Files | Data Sent | Data Returned |
|---|---|---|---|---|---|---|
| Goals Page | `/goals` | GET | Render goals dashboard | pages.py:3132 | none (auth cookie) | Full HTML page |
| Create Goal | `/goals` | POST | Create new FinancialGoal record | pages.py:3146 | name, goal_type, target_amount, monthly_needed, target_date, priority, linked_assets[] | 303 Redirect to /goals |
| Delete Goal | `/goals/{goal_id}/delete` | POST | Hard-delete goal and links | pages.py:3177 | goal_id (path), CSRF token | 303 Redirect to /goals |
| Keep-alive | `/api/keep-alive` | GET | Session heartbeat (shared, not goal-specific) | pages.py:442 | none | 204 No Content |
| Theme toggle | `/preferences/theme` | POST | Dark/light mode (shared) | pages.py:181 | `dark=0\|1` | 204 No Content |

**Goal Creation Flow:**
1. User submits form → POST `/goals` with form body.
2. `goals_create()` in pages.py creates `FinancialGoal` record (money converted via `rupees_to_paise()`).
3. For each `linked_assets` asset ID: validates ownership, creates `GoalAssetLink` record.
4. DB commit → 303 redirect to GET `/goals`.

**Goal Deletion Flow:**
1. User clicks "×" → `fvConfirmDelete()` shows confirm dialog.
2. On confirm → form submits POST `/goals/{goal_id}/delete`.
3. `goals_delete()` queries goal by id+user_id → `db.delete(goal)` → cascade deletes `GoalAssetLink` records.
4. DB commit → 303 redirect to GET `/goals`.

**Goal Progress Updates:**
Goals have no dedicated "progress update" API. Progress is always recalculated from asset values. To update progress, the user updates asset current values via `/assets/{asset_id}/update`. The goals page then recomputes everything on the next GET.

**No forecast retrieval API.** Forecasts are computed server-side at render time.

---

# 7. Business Logic Extraction

## Complete Business Logic with File References

### B1: Goal Progress Percentage
```
Formula:    pct = round(current / target_amount × 100, 1)
            display_pct = min(pct, 100)
Source:     DB fields financial_goals.target_amount, computed current from GoalAssetLink
File:       services.py, goals_progress(), line ~631
Output:     progress.goals[n].pct (float, 0..100 for display)
```

### B2: Goal Completion
```
Formula:    is_complete = (current >= target_amount) AND (target_amount > 0)
Source:     current (computed), target_amount (DB)
File:       services.py, goal_timeline(), line ~587–589
Output:     status = "completed"; is_complete leads to required_monthly = 0
```

### B3: Required Monthly Contribution
```
Formula:    remaining_amount = max(target_amount - current, 0)
            if target_date > today:
                remaining_months = max(round((target_date - today).days / 30.44), 1)
                required_monthly = round(remaining_amount / remaining_months)
            else:
                required_monthly = remaining_amount
Source:     target_amount, current, target_date
File:       services.py, goal_timeline(), lines 604–609
Output:     progress.goals[n].required_monthly (paise)
```

### B4: Remaining Amount (Template Only)
```
Formula:    remaining = g.target - g.current
Source:     progress.goals[n].target, progress.goals[n].current (both paise)
File:       templates/goals/list.html, line 78
Output:     Local Jinja2 variable `remaining` (paise), used only for projection calculation
```

### B5: Focus View Projection (Months)
```
Formula:    months = ceil(remaining / g.monthly_needed) if g.monthly_needed else 0
Source:     remaining (B4), g.monthly_needed (DB field in paise)
File:       templates/goals/list.html, line 79
Output:     Text display "~{months} mo" or "Achieved 🎉" or "Set monthly"
```

### B6: Expected Amount (What You Should Have Saved)
```
Formula:    frac = elapsed_days / total_days
            expected = round(frac × target_amount)
Source:     g.created_at (start date), g.target_date, g.target_amount, today
File:       services.py, goal_timeline(), lines 593–601
Output:     progress.goals[n].expected (paise)
```

### B7: Goal Health Score (Velocity)
```
Formula:    The system uses the GOAL_STATUS directly as health classification.
            "on_track" = current >= expected (at or ahead of linear pace)
            "behind"   = current < expected (behind linear pace)
            No numeric velocity or health score separate from status.
Source:     goal_timeline() status logic
File:       services.py, lines 612–618
Output:     progress.goals[n].on_track (bool); summary: progress.on_track (int count)
```

### B8: Overall Portfolio Goal Achievement
```
Formula:    overall_pct = round(total_current / total_target × 100, 1) if total_target else 0.0
Source:     All goals' target_amount and computed current
File:       services.py, goals_progress(), line ~649–650
Output:     progress.overall_pct (float)
```

### B9: Score Color Thresholds
```
Formula:    >= 70%: green (#2FA86B, var(--bar-good))
            >= 40%: orange (var(--warn))
             < 40%: red (var(--danger))
Source:     progress percentage (pct)
File:       templates/partials/_bars.html, score_color macro
Output:     CSS color string applied to progress bar spans and conic-gradient
```

### B10: On-Track Count
```
Formula:    on_track = count of goals where status ∈ {"completed", "on_track"}
Source:     Computed status for each goal
File:       services.py, goals_progress(), line ~635–636
Output:     progress.on_track (int); displayed as "X of Y goals"
```

---

# 8. State Management Analysis

## State Types and Locations

### Alpine.js Local UI State (Client-side, per page load)

| State Key | Type | Initial Value | Who Updates | Who Reads | Persistence |
|---|---|---|---|---|---|
| `showAdd` | boolean | `false` | "Add Goal" button click, "Cancel" click, backdrop click, Escape key | Modal visibility `x-show="showAdd"` | None — resets on page reload |
| `view` | string | `'cards'` | Segmented control buttons | `.grid.grid-2` and focus div `x-show` | None — resets on page reload |
| `gt` (goal type) | string | `'retirement'` | Goal type select `x-model="gt"` | Icon preview `:src="'/static/img/logo-goals/'+gt+'.png'"` | None |

### Server-Side State (Database)

| State | Table | Field | Who Updates | Who Reads | Persistence |
|---|---|---|---|---|---|
| Goals list | `financial_goals` | all fields | POST /goals (create), POST /goals/{id}/delete | GET /goals via goals_progress() | SQLite — permanent |
| Goal-asset links | `goal_asset_links` | goal_id, asset_id, allocation_pct | POST /goals (create) | goals_progress() via g.links | SQLite — permanent, cascades on delete |
| Goal completion | derived | — | Never stored; computed at query time | goals_progress() | N/A |
| Asset current values | `assets` | current_value | POST /assets/{id}/update, POST /assets/refresh-prices | goals_progress() via GoalAssetLink | SQLite — permanent |

### Query / Derived State (Computed at Request Time)

| Derived Value | Computed In | From | Used In |
|---|---|---|---|
| `current` (per goal) | `goals_progress()` | GoalAssetLink + Asset.current_value | All goal displays |
| `pct` | `goals_progress()` | `current / target_amount` | Progress bars, rings |
| `status` | `goal_timeline()` | `current`, `expected`, `target_date`, `today` | Status badges, on_track count |
| `required_monthly` | `goal_timeline()` | `remaining_amount`, `remaining_months` | Card subtitle |
| `expected_pct` | `goal_timeline()` | `frac` | Tooltip text |
| `timeline` | `goals_page()` handler | `progress.goals` filtered + sorted | Timeline section |

### No Memoization / Query Caching

The Goals feature has no memoization, no React Query, no Redis cache, and no HTTP caching. Every GET /goals request recalculates all goal metrics from scratch. This is acceptable for a local SQLite app where DB queries are microseconds, but on mobile with a remote API this would need a caching strategy.

### Goal Form State

The add-goal form is a standard HTML form with no client-side state management. Field values are not persisted between sessions. On validation error, the entire page redirects (via 303) to `/goals` — there is no form error message displayed; validation is minimal (only `required` HTML attribute on name and target_amount).

---

# 9. Goal Status System Analysis

## Status Definitions

### `completed`
- **Trigger Logic:** `current >= target_amount AND target_amount > 0`
- **Source File:** `services.py`, `goal_timeline()`, lines 587–589
- **Displayed In:** Status badge in all views, Summary bar "On Track" count
- **UI Representation:** Green chip with "✓ Completed"
- **Color Mapping:** `background: var(--green-soft); color: var(--primary)` (inline in template)
- **Icon Mapping:** ✓ (Unicode check mark character)
- **On Track:** Yes — `tracked = tl["status"] in ("completed", "on_track")`

### `on_track`
- **Trigger Logic:** `current >= expected AND NOT (today >= target_date) AND NOT completed`
- **Source File:** `services.py`, `goal_timeline()`, line 616
- **Displayed In:** Status badge in all views, Summary bar "On Track" count
- **UI Representation:** Green chip with "● On Track"
- **Color Mapping:** `background: var(--green-soft); color: var(--primary)` (inline in template)
- **Icon Mapping:** ● (Unicode bullet/circle character)
- **On Track:** Yes

### `behind`
- **Trigger Logic:** `current < expected AND NOT (today >= target_date) AND NOT completed`
- **Source File:** `services.py`, `goal_timeline()`, line 618
- **Displayed In:** Status badge in all views
- **UI Representation:** Orange chip with "▲ Behind Schedule"
- **Color Mapping:** `.chip.warn` → `background: var(--warn-soft); color: var(--warn)`
- **Icon Mapping:** ▲ (Unicode upward triangle character)
- **On Track:** No

### `overdue`
- **Trigger Logic:** `today >= target_date AND NOT completed`
- **Source File:** `services.py`, `goal_timeline()`, lines 612–614
- **Displayed In:** Status badge in all views
- **UI Representation:** Red chip with "! Overdue"
- **Color Mapping:** Inline `background: var(--danger-soft); color: var(--danger-strong)`
- **Icon Mapping:** ! (Exclamation mark character)
- **On Track:** No

## Status Transition Diagram

```
Goal Created (no target_date)
    → "on_track" (because expected = 0, current >= 0 always true)

Goal Created (with target_date)
    → "behind" if current < expected (behind linear pace)
    → "on_track" if current >= expected

On any status (not completed):
    → "overdue" when today >= target_date
    → "completed" when current >= target_amount (can happen at any time)

"completed" is terminal — no transition out
"overdue" can transition to "completed" if user adds more linked assets
```

## Goal Tone Mapping (for badge rendering)

```python
# In goal_status_badge macro (templates/goals/list.html):
if g.status_tone == 'good':   → green chip (var(--green-soft) / var(--primary))
elif g.status_tone == 'warn': → .chip.warn (var(--warn-soft) / var(--warn))
else (bad):                   → danger chip (var(--danger-soft) / var(--danger-strong))
```

---

# 10. Mobile Migration Requirements

## Feature Classification

| Feature | Category | Current File | Mobile Equivalent | Implementation Notes | Dependencies | Complexity |
|---|---|---|---|---|---|---|
| Goals Dashboard Screen | Must Migrate | goals/list.html | `GoalsDashboardScreen` | Full-screen with summary + list | Goal data store | Medium |
| Summary Bar (4 stats) | Must Migrate | goals/list.html:27–33 | `GoalSummaryBar` component | Horizontal scroll or 2×2 grid on narrow screens | goals_progress API | Low |
| Consolidated Bar Chart | Must Migrate | goals/list.html:37–42 | `GoalFundsChart` (Victory Native or react-native-chart-kit) | Replace Chart.js with RN-compatible chart lib | chart library | Medium |
| Goal Cards | Must Migrate | goals/list.html:44–71 | `GoalCard` component | FlatList of GoalCard; remove absolute %width for progress bar (use Animated/StyleSheet) | GoalCard state | Medium |
| Progress Bar (linear) | Must Migrate | `.bar` CSS | `<View>` with fixed-width inner `<View>` | Use `width: pct + '%'` in StyleSheet | — | Low |
| Status Badges | Must Migrate | goal_status_badge macro | `GoalStatusBadge` component | Map status → color + icon + label | Status colors | Low |
| Goal Detail View | Must Migrate | N/A (not in web) | `GoalDetailScreen` | Add this screen for mobile — web shows all info inline on cards | — | Medium |
| Focus View (Radial Ring) | Must Migrate | goals/list.html:74–107 | `GoalRingCard` component using `react-native-svg` | `conic-gradient` not available in RN; use SVG arc or `react-native-progress/Circle` | SVG or progress lib | High |
| Milestone Dots (25/50/75/100%) | Must Migrate | goals/list.html:92–96 | `MilestoneDots` component | Simple row of `<View>` circles | — | Low |
| Goal Timeline | Must Migrate | goals/list.html:109–128 | `GoalTimeline` component | Horizontal FlatList with timeline nodes | — | Medium |
| Add Goal Modal | Must Migrate | goals/list.html:131–161 | `AddGoalModal` (react-native-modal or stack navigator screen) | Date picker → `@react-native-community/datetimepicker` | Form validation | Medium |
| Goal Type Select | Must Migrate | `<select name="goal_type">` | Dropdown or bottom sheet picker | 7 options; show icon preview | — | Low |
| Link Assets (checkboxes) | Must Migrate | goals/list.html:151–156 | Multi-select list in add-goal modal | Show asset name + current value | Assets data | Medium |
| Goal Deletion | Must Migrate | form POST /goals/{id}/delete | Alert.alert + DELETE API call | Use Alert.alert for confirmation | API client | Low |
| Goal Creation | Must Migrate | form POST /goals | API call + form validation | Add client-side validation (required fields) | API client | Low |
| Goal Editing | Nice to Have | Not in web | `EditGoalScreen` or modal | Web has no edit; mobile should add this | — | Medium |
| View Toggle (Cards/Focus) | Nice to Have | Alpine.js `view` state | Tab bar or header toggle | Less critical if using navigation stack | — | Low |
| INR Formatting | Must Migrate | currency.py format_inr() | `formatINR(paise)` utility | Replicate Indian grouping logic in JS/TS | — | Low |
| Paise conversion | Must Migrate | currency.py | `rupeesToPaise()`, `paiseToRupees()` | Critical for all money handling | — | Low |
| Dark mode | Nice to Have | base.html theme toggle | `useColorScheme()` + theme context | Colors already defined in CSS variables | — | Medium |
| Offline handling | Nice to Have | N/A (server-rendered) | Cache last fetch; show stale data | No offline in web app | TanStack Query | Medium |
| Goal notifications | Nice to Have | N/A (scheduler only does SIP) | Push notifications for "behind schedule" | Not in web, but scheduler pattern can be adapted | expo-notifications | High |
| Search/Filter/Sort | Nice to Have | Not in web | Add in mobile | Web has none; mobile users will expect it | — | Low |
| Goal analytics detail | Desktop Only | Inline in card | Mobile: may need dedicated screen | All analytics visible in card on web | — | Low |

---

# 11. Goals Feature Migration Checklist

```
[ ] Goal Dashboard Screen
    [ ] Summary bar (Total Goal Value, Total Achieved %, On Track count, Overall Progress)
    [ ] Conditional "All Funds" bar chart (only when goals exist)
    [ ] View toggle (Cards / Focus)
    [ ] Empty state when no goals

[ ] Goal Cards (Cards View)
    [ ] Goal icon image (from type)
    [ ] Goal name
    [ ] Status badge (completed/on_track/behind/overdue with icon + color)
    [ ] Current / Target amount (formatted INR)
    [ ] Progress bar (colored by threshold: green>=70, orange>=40, red<40)
    [ ] "X% complete" text
    [ ] Info tooltip explaining on-track definition (accessible)
    [ ] "Save ~X/mo to finish on time" (conditional on status != completed)
    [ ] Goal meta grid: Target Date, Monthly Needed, Linked Assets count
    [ ] Delete action (with confirmation dialog)

[ ] Goal Detail Screen (new for mobile)
    [ ] All card fields in expanded view
    [ ] Linked assets list with individual current values
    [ ] Goal creation date
    [ ] Priority field
    [ ] Notes field

[ ] Goal Focus / Radial View
    [ ] Radial progress ring (SVG-based)
    [ ] Progress percentage inside ring
    [ ] Goal icon
    [ ] Current / Target text
    [ ] Milestone dots (25%, 50%, 75%, 100%)
    [ ] Target Date + Projection (months or "Achieved 🎉")

[ ] Goal Timeline
    [ ] Sorted by target date ascending
    [ ] Only goals with target_date
    [ ] Timeline node with dot (colored by goal color), logo, name, date, pct

[ ] Goal Creation
    [ ] Goal Name input (required)
    [ ] Goal Type select with 7 options (retirement, education, travel, emergency, home, wedding, custom)
    [ ] Goal type icon preview (reactive to select)
    [ ] Target Amount input (required, numeric, rupees)
    [ ] Monthly Needed input (optional, numeric, rupees)
    [ ] Target Date picker (optional, min = today)
    [ ] Asset multi-select (optional, checkboxes with name + current value)
    [ ] Submit → POST /goals → redirect/refresh
    [ ] Cancel / close modal

[ ] Goal Editing (new for mobile — not in web)
    [ ] Edit name, type, target amount, monthly, target date
    [ ] Manage linked assets (add/remove)

[ ] Goal Deletion
    [ ] Confirmation dialog with goal name
    [ ] DELETE /goals/{id} API call
    [ ] Remove from list state

[ ] Progress Tracking (Calculation Engine)
    [ ] current = Σ(asset.current_value × allocation_pct / 100)
    [ ] pct = current / target × 100 (capped at 100 for display)
    [ ] expected = frac × target (linear interpolation)
    [ ] required_monthly = remaining / remaining_months (30.44 days/month)
    [ ] focus_months = ceil(remaining / monthly_needed)

[ ] Forecasting Engine (Calculation Engine)
    [ ] goal_timeline(): status, expected, expected_pct, required_monthly
    [ ] Status logic: completed / on_track / behind / overdue

[ ] Goal Status Logic
    [ ] GOAL_STATUS constants: label, icon, tone
    [ ] Score color thresholds (>=70 green, >=40 orange, <40 red)
    [ ] On-track boolean per goal
    [ ] Global on_track count + overall_pct

[ ] Goal Analytics (Summary)
    [ ] total_target, total_current, overall_pct
    [ ] on_track count of N goals
    [ ] Bar chart data (name, current, target per goal)

[ ] Charts
    [ ] Grouped bar chart: Achieved vs Target per goal (Chart.js → Victory Native)

[ ] Milestones
    [ ] Visual dots at 25%, 50%, 75%, 100% (no DB model needed)

[ ] Filters (new for mobile)
    [ ] Filter by status (on_track, behind, overdue, completed)
    [ ] Filter by type (retirement, education, etc.)

[ ] Sorting (new for mobile)
    [ ] Sort by target date, progress %, name

[ ] Search (new for mobile)
    [ ] Search by goal name

[ ] Error Handling
    [ ] API error toasts
    [ ] Validation errors inline (required fields, numeric inputs)
    [ ] Network error state

[ ] Loading States
    [ ] Skeleton cards while loading
    [ ] Chart loading placeholder

[ ] Offline Handling
    [ ] Cache last response with TanStack Query
    [ ] Show stale-data indicator

[ ] State Persistence
    [ ] TanStack Query cache (invalidate on create/delete)
    [ ] AsyncStorage for view preference (cards/focus)

[ ] INR Formatting
    [ ] formatINR(paise: number): string — Indian grouping
    [ ] rupeesToPaise(rupees: number): number
    [ ] paiseToRupees(paise: number): number
```

---

# 12. Risks and Hidden Dependencies

## Implicit Assumptions

### 1. `goal.created_at` Is the Goal Start Date
The `expected` amount calculation uses `g.created_at` as the start date of the saving timeline. If a user creates a goal but their actual saving started earlier (e.g., they already had the linked asset before creating the goal), `expected_pct` will be inflated, potentially causing an incorrect "behind schedule" status immediately after creation.

**Mobile Risk:** Same calculation applies. No separate "start date" field exists.

### 2. Linear Savings Pace Assumed
`goal_timeline()` assumes linear accumulation (constant monthly contributions). In reality, asset values fluctuate with the market. A high-performing asset could make a goal appear "on track" even if the user hasn't contributed recently. A market downturn could make it appear "behind schedule" despite consistent contributions.

### 3. 30.44 Days Per Month
`required_monthly` uses 30.44 as the average days per month, derived from 365.25/12. This is a reasonable approximation but may show slight variance month-to-month.

### 4. Allocation Is 100% Per Asset by Default
`GoalAssetLink.allocation_pct` defaults to 100.0, meaning 100% of each linked asset's value is attributed to the goal. Multiple goals can link the same asset, double-counting asset value across goals. The web UI has no UI to set allocation per link.

**Mobile Risk:** Critical. If the same asset is linked to two goals, its full value is counted in both. Total across all goals will exceed actual portfolio value. Mobile implementation should either prevent this or make it explicit.

### 5. No Goal Editing Route Exists
The web application has no edit route for goals. The model has fields (`priority`, `notes`, `icon`, `color_hex`, `is_completed`) that are never exposed to the user via the current routes.

**Mobile Risk:** Mobile should implement editing. The API needs to add a PATCH/PUT endpoint.

### 6. No Notification Integration for Goals
The `scheduler.py` only handles SIP reminders and notification cleanup. There are **no scheduled goal status checks or goal-related notifications**. The `Notification` model exists but is never populated for goals.

### 7. Goal Icons Are Static Files
Goal type icons are PNG files served from `/static/img/logo-goals/`. The `onerror` fallback on all `<img>` tags loads `custom.png`. On mobile, these images need to be bundled as local assets or served from the API.

## Environment Variables

```python
# From config.py — goals are indirectly affected by:
FINVAULT_DATABASE_PATH  # path to SQLite file
FINVAULT_COOKIE_SECURE  # affects auth session (required for goals access)
FINVAULT_SESSION_MAX_HOURS  # auto-logout affects goal session
```

No goals-specific environment variables.

## Browser-Only APIs in Goals Feature

| API | Location | Usage | Mobile Equivalent |
|---|---|---|---|
| `conic-gradient()` CSS | goals/list.html:85 | Radial progress ring fill | `react-native-svg` Arc or `react-native-progress/Circle` |
| `Chart.js` (canvas) | goals/list.html:172–188 | Bar chart | `victory-native`, `react-native-chart-kit`, or `react-native-gifted-charts` |
| Alpine.js `x-data`/`x-show`/`x-model` | goals/list.html | View toggle, modal show/hide, reactive icon | React `useState()` |
| `onerror` img fallback | All `<img>` tags | Fallback PNG if type image not found | `onError` prop on `<Image>` component + require local fallback |
| CSS `var(--color)` custom properties | All color usage | Dynamic theming | React Native StyleSheet with theme context |

## Local Storage Usage

No `localStorage` is used by the Goals feature. View preference (cards/focus) is ephemeral Alpine.js state — not persisted across sessions.

## Desktop-Specific Code

- CSS `.grid.grid-2` and `.grid.grid-3` — CSS Grid layout. React Native uses Flexbox with `flexWrap`.
- `.summary-bar { grid-template-columns: repeat(4, 1fr) }` — 4-column grid collapses to 2-column on narrow screens (CSS media query at `.summary-bar { grid-template-columns: 1fr 1fr; }` around line 313 of main.css).
- Horizontal timeline (`.timeline`, `.tl-node`) — uses CSS flexbox. On mobile this should be a vertical timeline.

## Timezone Assumptions

- `scheduler.py` uses `timezone="Asia/Kolkata"` for background jobs.
- `services.py` uses `date.today()` which is local server time.
- Dates stored as ISO strings `YYYY-MM-DD` with no timezone.
- `datetime.now(timezone.utc).isoformat()` is used for `created_at` — UTC ISO datetime.

**Mobile Risk:** If the mobile app runs in a different timezone, `date.today()` on the server may differ from the user's local today. For a personal finance app where the user and server are in the same timezone (INR app for India), this is acceptable. A mobile API should use `date.today()` server-side (IST) consistently.

## Date Calculation Assumptions

- `_parse_iso_date(value)` uses `date.fromisoformat(value[:10])` — accepts full ISO datetime or date string, takes only the first 10 characters. This means `created_at` (which is UTC ISO datetime like `2024-01-15T10:30:00+00:00`) is parsed as `2024-01-15`, which is the UTC date — could be off by one day for users in IST (UTC+5:30) if the goal was created after 6:30 PM UTC.

**Mobile Risk:** Low for INR app. Consider using IST consistently if deploying for Indian users.

---

# 13. Performance Analysis

## Expensive Calculations

### 1. `goals_progress()` DB Query Pattern
```python
goals = list(db.scalars(select(FinancialGoal).where(FinancialGoal.user_id == user_id)))
# For each goal:
current = sum(
    round(l.asset.current_value * l.allocation_pct / 100)
    for l in g.links if l.asset
)
```
- This is a N+1 pattern — goals are loaded, then for each goal the `g.links` relationship is accessed (each link triggers a joined load on `asset`). The `GoalAssetLink` uses `lazy="joined"` on the `asset` relationship, which SQLAlchemy resolves with a JOIN, but the outer loop is still sequential.
- **At scale:** With 20 goals × 5 linked assets each = 100 asset reads. For SQLite local, this is negligible. For a REST API with N users, needs connection pooling and eager loading.

### 2. `goals_page()` Handler Loads ALL User Assets
```python
assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)))
```
- All assets are loaded just to populate the "Link Assets" checkbox list in the add modal. For users with many assets, this is wasteful on every page load — the modal is rarely opened.
- **Mobile optimization:** Lazy-load the assets list only when the user taps "+ Add Goal".

### 3. Chart.js Bar Chart
- Chart is rendered in `DOMContentLoaded` callback. On slow mobile-equivalent browsers this could delay paint.
- **Mobile optimization:** Render chart lazily after list is visible.

## Re-renders / Re-calculations

- No React re-renders (server-rendered). Alpine.js only re-renders the view toggle — negligible.
- All data is computed fresh on every GET request. No incremental updates.

## Memoization Usage

None. No memoization, no `useMemo`, no query result caching.

## Data Aggregation Logic

- `goals_progress()` aggregates across all goals in one pass (O(n) where n = goals × links per goal).
- `total_target`, `total_current`, `on_track` are summed in the same iteration.
- Chart labels/datasets are built in the template by iterating `progress.goals` — `map(attribute='name')`, `map(attribute='current')`, `map(attribute='target')` Jinja2 filters.

## Mobile Optimization Recommendations

### 1. Implement Server-Side Pagination / Limit
- Limit goal cards to 10–20 per request. Use `FlatList` with `onEndReached` for infinite scroll.
- Dashboard widget should request only top 3 goals (already done in web: `stats.goals.goals[:3]`).

### 2. Separate Asset List API for Link Picker
- Create `/api/assets?summary=true` returning only `id`, `name`, `current_value` — not all asset fields.
- Load this endpoint only when the add-goal modal/screen is opened.

### 3. Cache Goals Data with TanStack Query
```typescript
const { data: goals } = useQuery({
  queryKey: ['goals', userId],
  queryFn: fetchGoals,
  staleTime: 5 * 60 * 1000,  // 5 minutes
})
```
- Invalidate `['goals']` after create/delete mutations.
- Show stale data while refetching in background.

### 4. Use `FlashList` Instead of `FlatList`
- For goal card lists, `@shopify/flash-list` gives significantly better performance for fast-scrolling lists.

### 5. SVG-Based Radial Ring Performance
- Use `react-native-svg` with a `Path` arc for the conic gradient ring — pre-compute SVG arc path from progress %.
- Avoid `react-native-progress` for the ring if animating during list scroll (expensive).
- Animate ring only on screen entry (mount), not on every re-render.

### 6. Chart Library Choice
- `react-native-gifted-charts` offers good INR grouping support.
- `victory-native` is more customizable but heavier.
- Consider `react-native-chart-kit` as lightweight option if charts are simple.

### 7. Avoid Calculating Projection in Render
- Pre-calculate `required_monthly`, `expected_pct`, `focus_months` server-side. Mobile API should return all computed fields, not raw paise values that require client-side math.

### 8. Normalize Money in API Response
- Return money in two formats: `target_paise` (raw integer) and `target_formatted` (INR string). Avoids formatting in the render path.

---

# 14. Final Migration Blueprint

## Recommended Folder Structure

```
src/
├── screens/
│   ├── goals/
│   │   ├── GoalsDashboardScreen.tsx     ← Main goals list screen
│   │   ├── GoalDetailScreen.tsx         ← Goal detail (new for mobile)
│   │   ├── AddGoalScreen.tsx            ← Add goal form (modal or screen)
│   │   └── EditGoalScreen.tsx           ← Edit goal form (new for mobile)
│
├── components/
│   └── goals/
│       ├── GoalSummaryBar.tsx           ← 4-stat summary card
│       ├── GoalCard.tsx                 ← Single goal card (cards view)
│       ├── GoalRingCard.tsx             ← Radial ring card (focus view)
│       ├── GoalStatusBadge.tsx          ← Status chip with icon + label
│       ├── GoalProgressBar.tsx          ← Linear progress bar with color
│       ├── GoalTimeline.tsx             ← Horizontal/vertical timeline
│       ├── GoalFundsChart.tsx           ← Grouped bar chart (Achieved vs Target)
│       ├── MilestoneDots.tsx            ← 4 milestone dots (25/50/75/100%)
│       ├── GoalTypeIcon.tsx             ← Goal type image with fallback
│       ├── GoalEmptyState.tsx           ← Empty state illustration + CTA
│       └── AssetLinkPicker.tsx          ← Multi-select asset list for linking
│
├── hooks/
│   └── goals/
│       ├── useGoals.ts                  ← TanStack Query: fetch goals list
│       ├── useGoalDetail.ts             ← TanStack Query: single goal (if API supports)
│       ├── useCreateGoal.ts             ← Mutation: create goal
│       ├── useEditGoal.ts               ← Mutation: edit goal (new)
│       ├── useDeleteGoal.ts             ← Mutation: delete goal
│       └── useGoalCalculations.ts       ← Pure calculation functions (goal_timeline logic)
│
├── services/
│   └── goals/
│       ├── goalsApi.ts                  ← API client: all goals endpoints
│       └── goalsTransforms.ts           ← Response transformers (paise → display)
│
├── stores/
│   └── goalsStore.ts                    ← Zustand: UI state (view toggle, filters, sort)
│
├── utils/
│   ├── currency.ts                      ← formatINR, rupeesToPaise, paiseToRupees
│   ├── goalCalculations.ts              ← goal_timeline() logic (pure TS)
│   └── dateUtils.ts                     ← parseISODate, remainingMonths
│
└── types/
    └── goals.ts                         ← All TypeScript interfaces
```

## Recommended Component Structure

```typescript
// types/goals.ts
export type GoalType = 'retirement' | 'education' | 'travel' | 'emergency' | 'home' | 'wedding' | 'custom';
export type GoalStatus = 'completed' | 'on_track' | 'behind' | 'overdue';
export type GoalTone = 'good' | 'warn' | 'bad';

export interface GoalStatusMeta {
  label: string;
  icon: string;  // Unicode character
  tone: GoalTone;
}

export interface GoalItem {
  id: string;
  name: string;
  goal_type: GoalType;
  icon: string;            // emoji
  color: string;           // hex color
  target: number;          // paise
  current: number;         // paise (computed from linked assets)
  pct: number;             // 0..100, float
  target_date: string | null;  // YYYY-MM-DD
  monthly_needed: number;  // paise (user-entered)
  linked: number;          // count of linked assets
  on_track: boolean;
  status: GoalStatus;
  status_label: string;
  status_icon: string;
  status_tone: GoalTone;
  expected: number;        // paise
  expected_pct: number;    // float
  required_monthly: number;  // paise
}

export interface GoalsProgress {
  goals: GoalItem[];
  total_target: number;   // paise
  total_current: number;  // paise
  count: number;
  on_track: number;
  overall_pct: number;    // float
}

export interface CreateGoalPayload {
  name: string;
  goal_type: GoalType;
  target_amount: number;  // rupees (server converts to paise)
  monthly_needed: number; // rupees
  target_date?: string;   // YYYY-MM-DD
  priority: 'low' | 'medium' | 'high';
  linked_asset_ids: string[];
}
```

## Recommended Hooks

```typescript
// hooks/goals/useGoals.ts
import { useQuery } from '@tanstack/react-query';
import { fetchGoals } from '@/services/goals/goalsApi';

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: fetchGoals,
    staleTime: 5 * 60 * 1000,  // 5 min
    select: (data) => data,     // optionally transform here
  });
}

// hooks/goals/useCreateGoal.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createGoal } from '@/services/goals/goalsApi';

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createGoal,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

// hooks/goals/useDeleteGoal.ts
export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => deleteGoal(goalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
    onMutate: async (goalId) => {
      // Optimistic update: remove from list immediately
      await qc.cancelQueries({ queryKey: ['goals'] });
      const prev = qc.getQueryData<GoalsProgress>(['goals']);
      if (prev) {
        qc.setQueryData(['goals'], {
          ...prev,
          goals: prev.goals.filter(g => g.id !== goalId),
        });
      }
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) qc.setQueryData(['goals'], ctx.prev);
    },
  });
}

// hooks/goals/useGoalCalculations.ts
export function useGoalCalculations(goal: GoalItem) {
  const remaining = Math.max(goal.target - goal.current, 0);
  const focusMonths = goal.monthly_needed > 0
    ? Math.ceil(remaining / goal.monthly_needed)
    : 0;
  const isAchieved = goal.pct >= 100;

  return { remaining, focusMonths, isAchieved };
}
```

## API Layer Design

### Service Architecture

```typescript
// services/goals/goalsApi.ts
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
    ...options,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export const fetchGoals = (): Promise<GoalsProgress> =>
  apiFetch('/api/v1/goals');

export const createGoal = (payload: CreateGoalPayload): Promise<GoalItem> =>
  apiFetch('/api/v1/goals', { method: 'POST', body: JSON.stringify(payload) });

export const deleteGoal = (goalId: string): Promise<void> =>
  apiFetch(`/api/v1/goals/${goalId}`, { method: 'DELETE' });

export const updateGoal = (goalId: string, payload: Partial<CreateGoalPayload>): Promise<GoalItem> =>
  apiFetch(`/api/v1/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify(payload) });
```

### Request Flow
```
User Action → Component Event Handler → useXxxGoal() hook → goalsApi.ts fetch → FastAPI endpoint
           ↓
     Optimistic update (delete)  OR  Invalidate query (create/update)
           ↓
     TanStack Query re-fetches → Component re-renders with fresh data
```

### Error Handling
- Network errors: catch in mutation `onError`, show Toast with error message.
- Validation errors: 422 from FastAPI → parse error detail → show inline field errors.
- Auth errors: 401/403 → redirect to login screen via navigation.

### Retry Strategy
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
    mutations: {
      retry: 1,
    },
  },
});
```

### Caching Strategy
- `['goals']` query: staleTime = 5 minutes, gcTime = 30 minutes.
- Invalidate `['goals']` on create/delete/update.
- Dashboard uses the same `['goals']` query key — automatically stays in sync.

## State Management Design

### Zustand Store (UI state only)

```typescript
// stores/goalsStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GoalsStore {
  view: 'cards' | 'focus';
  filterStatus: GoalStatus | 'all';
  sortBy: 'target_date' | 'pct' | 'name';
  setView: (view: 'cards' | 'focus') => void;
  setFilterStatus: (s: GoalStatus | 'all') => void;
  setSortBy: (s: 'target_date' | 'pct' | 'name') => void;
}

export const useGoalsStore = create<GoalsStore>()(
  persist(
    (set) => ({
      view: 'cards',
      filterStatus: 'all',
      sortBy: 'target_date',
      setView: (view) => set({ view }),
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      setSortBy: (sortBy) => set({ sortBy }),
    }),
    { name: 'goals-ui', storage: createJSONStorage(() => AsyncStorage) }
  )
);
```

### TanStack Query (server state)
- All goals data (GoalsProgress, GoalItem[]) lives in TanStack Query cache.
- Never duplicate server state in Zustand.

### Persistence
- View preference (cards/focus), filters, sort order → AsyncStorage via Zustand persist.
- Goals data → TanStack Query with optional offline persistence via `@tanstack/query-async-storage-persister`.

### Offline Support
```typescript
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

const persister = createAsyncStoragePersister({ storage: AsyncStorage });

// In App.tsx:
<PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
  <App />
</PersistQueryClientProvider>
```

## Navigation Integration

### Screen Hierarchy
```
RootStack
└── AuthStack
    └── DrawerNavigator (or TabNavigator)
        └── Goals
            ├── GoalsDashboardScreen     (/goals)
            │   └── GoalDetailScreen     (/goals/:id)  — pushed on card tap
            ├── AddGoalScreen            (modal stack, or sheet)
            └── EditGoalScreen           (modal stack, or sheet)
```

### Route Parameters
```typescript
// Navigation types
type GoalsStackParamList = {
  GoalsDashboard: undefined;
  GoalDetail: { goalId: string; goalName: string };
  AddGoal: undefined;
  EditGoal: { goalId: string };
};
```

### Deep Linking
```javascript
// Expo Router deep links:
// finvault://goals              → GoalsDashboardScreen
// finvault://goals/add          → AddGoalScreen
// finvault://goals/:id          → GoalDetailScreen
// finvault://goals/:id/edit     → EditGoalScreen

// expo-router config:
const linking = {
  prefixes: ['finvault://'],
  config: {
    screens: {
      goals: {
        screens: {
          GoalsDashboard: '',
          AddGoal: 'add',
          GoalDetail: ':id',
          EditGoal: ':id/edit',
        },
      },
    },
  },
};
```

## Testing Strategy

### Unit Tests (Jest + Testing Library)

```typescript
// utils/__tests__/goalCalculations.test.ts
describe('goalTimeline', () => {
  it('returns completed when current >= target', () => {
    const result = goalTimeline(
      new Date('2024-01-01'), new Date('2025-01-01'),
      500000_00, 500000_00, new Date('2024-06-01')
    );
    expect(result.status).toBe('completed');
    expect(result.required_monthly).toBe(0);
  });

  it('returns on_track when current >= expected', () => { ... });
  it('returns behind when current < expected', () => { ... });
  it('returns overdue when today >= target_date', () => { ... });
  it('handles no target_date (frac = 0)', () => { ... });
  it('handles start == target_date (frac = 1)', () => { ... });
});

// utils/__tests__/currency.test.ts
describe('formatINR', () => {
  it('formats paise with Indian grouping', () => {
    expect(formatINR(123456789)).toBe('₹1,23,456.89');
  });
  it('handles zero', () => {
    expect(formatINR(0)).toBe('₹0.00');
  });
});
```

### Integration Tests (API layer)

```typescript
// services/goals/__tests__/goalsApi.test.ts
// Use msw (Mock Service Worker) to mock API:
const handlers = [
  rest.get('/api/v1/goals', (req, res, ctx) => res(ctx.json(mockGoalsProgress))),
  rest.post('/api/v1/goals', (req, res, ctx) => res(ctx.status(201), ctx.json(mockNewGoal))),
  rest.delete('/api/v1/goals/:id', (req, res, ctx) => res(ctx.status(204))),
];
```

### UI Tests (React Native Testing Library)

```typescript
// components/goals/__tests__/GoalCard.test.tsx
it('renders goal name and progress', () => {
  const { getByText } = render(<GoalCard goal={mockGoal} />);
  expect(getByText('Retirement Fund')).toBeTruthy();
  expect(getByText('₹5,00,000.00')).toBeTruthy();
});

it('shows "Save ~X/mo" when not completed', () => { ... });
it('does not show "Save ~X/mo" when completed', () => { ... });
it('calls onDelete when delete is confirmed', () => { ... });
```

### State Tests (Zustand)

```typescript
// stores/__tests__/goalsStore.test.ts
it('sets view correctly', () => {
  const { setView } = useGoalsStore.getState();
  setView('focus');
  expect(useGoalsStore.getState().view).toBe('focus');
});
```

### Calculation Tests (priority — business logic is pure functions)

```typescript
// Key test cases for goal_timeline:
// 1. Completed: current >= target
// 2. No target_date: status = on_track (expected = 0)
// 3. Start == target_date: expected = target (frac = 1.0)
// 4. Today before start: expected = 0 (elapsed clamped to 0)
// 5. Overdue: today >= target_date and not completed
// 6. Behind: current < expected and not overdue
// 7. Required_monthly when target_date > today
// 8. Required_monthly when target_date <= today (full shortfall)
// 9. required_monthly with 30.44 days/month average
// 10. Score color thresholds: 70, 40, <40
```

## Implementation Order (Foundation to Production-Ready)

### Phase 1: Foundation (Days 1–3)
1. **Define TypeScript types** in `types/goals.ts` — all interfaces, enums.
2. **Implement pure calculation utilities** in `utils/goalCalculations.ts` — port `goal_timeline()` logic exactly.
3. **Implement currency utilities** in `utils/currency.ts` — port `format_inr()`, `rupees_to_paise()`, `paise_to_rupees()` with Indian grouping.
4. **Write unit tests** for all calculation and currency functions (verify against web behavior before building UI).

### Phase 2: API Layer (Days 4–5)
5. **Implement FastAPI REST endpoints** on the backend:
   - `GET /api/v1/goals` → returns `GoalsProgress` JSON (all computed fields included).
   - `POST /api/v1/goals` → creates goal + links, returns `GoalItem`.
   - `DELETE /api/v1/goals/{id}` → deletes goal and links.
   - `PATCH /api/v1/goals/{id}` → updates goal (new for mobile).
6. **Implement goalsApi.ts** service functions with error handling.
7. **Configure TanStack Query** client with retry strategy.

### Phase 3: Core Components (Days 6–9)
8. **GoalStatusBadge** — simplest component, pure display from status props.
9. **GoalProgressBar** — linear progress with score_color thresholds.
10. **GoalTypeIcon** — image with fallback, 7 types + custom fallback.
11. **MilestoneDots** — 4 fixed milestone percentages (25/50/75/100).
12. **GoalCard** — full card with all fields, status badge, progress bar, meta grid, delete action.
13. **GoalSummaryBar** — 4-stat summary with overall progress bar.

### Phase 4: Screen Assembly (Days 10–13)
14. **GoalsDashboardScreen** — FlatList of GoalCard, view toggle (Zustand), summary bar, empty state.
15. **GoalEmptyState** — illustration + "+ Add Goal" CTA.
16. **GoalFundsChart** — grouped bar chart (Achieved vs Target). Use `react-native-gifted-charts` or `victory-native`.
17. **GoalTimeline** — vertical timeline (better UX than horizontal on mobile) with sorted goals.

### Phase 5: Goal Creation (Days 14–16)
18. **AssetLinkPicker** — multi-select list loaded from `/api/v1/assets` (summary only).
19. **AddGoalScreen** — form screen or modal with all creation fields, date picker, asset picker.
20. **useCreateGoal** mutation hook with query invalidation.
21. **Form validation** — required fields, numeric input, date >= today.

### Phase 6: Focus View (Days 17–19)
22. **GoalRingCard** — SVG-based radial ring using `react-native-svg`. Use a `Circle` or `Path` element for conic gradient effect.
23. **GoalRingCard milestone dots** — already built (MilestoneDots reuse).
24. **Focus view layout** — 2-column `FlatList` with `numColumns={2}`.

### Phase 7: Goal Detail & Editing (Days 20–23)
25. **GoalDetailScreen** — navigate on card tap; shows all details + linked asset list.
26. **EditGoalScreen** — pre-filled form for editing (requires PATCH API).
27. **useEditGoal** mutation hook.

### Phase 8: Polish & Edge Cases (Days 24–26)
28. **Loading skeleton cards** — placeholder GoalCard during initial fetch.
29. **Error states** — network error with retry button.
30. **Offline persistence** — configure TanStack Query async storage persister.
31. **Search/filter/sort** — Zustand state, client-side filtering of loaded goals.
32. **Dark mode** — ThemeContext with goal-specific colors matching web palette.

### Phase 9: QA & Testing (Days 27–30)
33. **Integration tests** with MSW mocked API.
34. **UI tests** for GoalCard, GoalSummaryBar, AddGoalScreen.
35. **Calculation regression tests** matching web behavior.
36. **Manual QA**: Create goal, delete goal, verify status badges, verify chart, verify focus view ring, verify milestone dots, verify timeline.

---

## Critical Implementation Details for Mobile Engineers

### Money Handling (MUST GET RIGHT)
All money is stored as **integer paise** (1 rupee = 100 paise) in the database. The web API returns paise.
- `₹50,000` → stored/returned as `5000000` (integer paise)
- `formatINR(5000000)` → `"₹50,000.00"`
- Never do floating-point arithmetic on money. Always use integer paise.

### Indian Number Formatting
The `format_inr()` function uses Indian grouping: `12,34,567.89` (last 3 digits, then groups of 2):
```typescript
function formatINR(paise: number): string {
  const rupees = paise / 100;
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

### SVG Ring for Focus View
```typescript
// GoalRingCard.tsx — SVG Arc approach
import Svg, { Circle } from 'react-native-svg';

function GoalRing({ pct, color, size = 120 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - Math.min(pct, 100) / 100);
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size/2} cy={size/2} r={r} stroke="#E7EEFE" strokeWidth={8} fill="none" />
      <Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={8} fill="none"
        strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
        strokeLinecap="round" />
    </Svg>
  );
}
```

### Goal Type → Icon Image Mapping
```typescript
// utils/goalAssets.ts
const GOAL_IMAGES: Record<string, any> = {
  retirement: require('@/assets/img/logo-goals/retirement.png'),
  education:  require('@/assets/img/logo-goals/education.png'),
  travel:     require('@/assets/img/logo-goals/travel.png'),
  emergency:  require('@/assets/img/logo-goals/emergency.png'),
  home:       require('@/assets/img/logo-goals/home.png'),
  wedding:    require('@/assets/img/logo-goals/wedding.png'),
  custom:     require('@/assets/img/logo-goals/custom.png'),  // fallback
};
export const getGoalImage = (type: string) => GOAL_IMAGES[type] ?? GOAL_IMAGES.custom;
```

### Score Color Logic
```typescript
// utils/goalCalculations.ts
export function scoreColor(pct: number, colors: { good: string; warn: string; danger: string }) {
  if (pct >= 70) return colors.good;
  if (pct >= 40) return colors.warn;
  return colors.danger;
}

// Usage with theme:
const colors = { good: '#2FA86B', warn: '#F0B429', danger: '#E05C5C' };
const barColor = scoreColor(goal.pct, colors);
```

### goal_timeline() Port to TypeScript
```typescript
// utils/goalCalculations.ts
export interface TimelineResult {
  status: 'completed' | 'on_track' | 'behind' | 'overdue';
  expected: number;          // paise
  expected_pct: number;      // float 0..100
  required_monthly: number;  // paise
}

export function goalTimeline(
  start: Date | null,
  targetDate: Date | null,
  targetAmount: number,
  current: number,
  today: Date = new Date()
): TimelineResult {
  if (current >= targetAmount && targetAmount > 0) {
    return { status: 'completed', expected: targetAmount, expected_pct: 100, required_monthly: 0 };
  }
  let frac = 0;
  if (start && targetDate) {
    const totalDays = Math.floor((targetDate.getTime() - start.getTime()) / 86400000);
    if (totalDays <= 0) {
      frac = 1;
    } else {
      const elapsed = Math.max(0, Math.min(
        Math.floor((today.getTime() - start.getTime()) / 86400000), totalDays
      ));
      frac = elapsed / totalDays;
    }
  }
  const expected = Math.round(frac * targetAmount);
  const remainingAmount = Math.max(targetAmount - current, 0);
  let required_monthly: number;
  if (targetDate && targetDate > today) {
    const remainingMs = targetDate.getTime() - today.getTime();
    const remainingMonths = Math.max(Math.round(remainingMs / (30.44 * 86400000)), 1);
    required_monthly = Math.round(remainingAmount / remainingMonths);
  } else {
    required_monthly = remainingAmount;
  }
  let status: TimelineResult['status'];
  if (targetDate && today >= targetDate) {
    status = 'overdue';
  } else if (current >= expected) {
    status = 'on_track';
  } else {
    status = 'behind';
  }
  return { status, expected, expected_pct: Math.round(frac * 1000) / 10, required_monthly };
}
```

---

*Report generated by reverse-engineering the FinVault web application source code. All file paths are relative to `E:/finvault_app/`. All calculations are exact ports of the Python logic in `services.py`. No code was modified during analysis.*
