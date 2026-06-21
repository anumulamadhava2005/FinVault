# GOALS GAP ANALYSIS — FinVault Mobile Migration
## Complete Comparison: Browser Implementation vs. Expo React Native Implementation

> **Architecture Note:** The browser implementation is a Python/FastAPI server-rendered app (Jinja2 + Alpine.js + Chart.js + SQLite). The mobile implementation is a local-first Expo React Native app using SQLite directly (no REST API layer). All "API" comparisons below map browser HTTP routes to equivalent mobile SQLite operations.

---

# 1. Mobile Goals Architecture

## Existing Goals Files

### `src/app/goals.tsx`
- **Purpose:** Expo Router entry point for the `/goals` route.
- **Inputs:** None (route module).
- **Outputs:** Re-exports `GoalsScreen` as the default export.
- **Dependencies:** `src/screens/GoalsScreen.tsx`

### `src/screens/GoalsScreen.tsx`
- **Purpose:** Complete Goals dashboard — summary KPIs, bar chart, goal cards, add-goal dialog, delete confirmation.
- **Inputs:** `userId` from `AppContext`, `refreshKey` from `AppContext` (triggers re-query on change).
- **Outputs:** Rendered screen with all goal UI elements.
- **Dependencies:** `useData`, `useApp`, `db/index.ts` (`all`, `insert`, `newId`, `remove`), `services/finance.ts` (`goalsProgress`, `GOAL_TYPES`), `components/ui.tsx`, `components/charts.tsx`, `utils/money.ts`, `utils/date.ts`, `models/types.ts`.

### `src/services/finance.ts` (goals section, lines 244–330)
- **Purpose:** All goal calculation logic — goal timeline engine and aggregate progress computation.
- **Inputs:** `userId` (string), raw DB rows for goals and asset links.
- **Outputs:** `GoalsProgress` object with all computed fields per goal and aggregate totals.
- **Dependencies:** `db/index.ts`, `utils/money.ts`, `utils/date.ts`, `models/types.ts`.
- **Exports:** `goalTimeline()`, `goalsProgress()`, `GOAL_STATUS_META`.

### `src/services/constants.ts`
- **Purpose:** Application-wide constants including goal type definitions.
- **Inputs:** None.
- **Outputs:** `GOAL_TYPES` array of `[key, label]` tuples for the 7 goal types.
- **Dependencies:** None.

### `src/models/types.ts`
- **Purpose:** TypeScript interfaces for all data models.
- **Inputs:** None.
- **Outputs:** `FinancialGoal`, `GoalAssetLink` interfaces.
- **Dependencies:** None.
- **Interfaces defined:**
  - `FinancialGoal` (lines 117–131): `id`, `user_id`, `name`, `goal_type`, `target_amount` (paise), `monthly_needed` (paise), `target_date`, `priority`, `icon`, `color_hex`, `notes`, `is_completed`, `created_at`
  - `GoalAssetLink` (lines 133–138): `id`, `goal_id`, `asset_id`, `allocation_pct`

### `src/db/schema.ts`
- **Purpose:** SQLite DDL schema definitions.
- **Inputs:** None.
- **Outputs:** `financial_goals` table, `goal_asset_links` table DDL strings.
- **Dependencies:** None.
- **Tables:**
  - `financial_goals` (lines 120–134): All `FinancialGoal` fields; `FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE`
  - `goal_asset_links` (lines 136–142): `goal_id`, `asset_id`, `allocation_pct`; `UNIQUE(goal_id, asset_id)`; cascading foreign keys

### `src/db/index.ts`
- **Purpose:** Generic SQLite query helpers used by all features.
- **Inputs:** SQL strings, parameter arrays.
- **Outputs:** Typed result arrays or mutation confirmations.
- **Dependencies:** `expo-sqlite`.
- **Exports:** `all()`, `first()`, `run()`, `insert()`, `update()`, `remove()`, `newId()` — no goal-specific functions.

### `src/db/seed.ts`
- **Purpose:** Demo data seeding.
- **Inputs:** None.
- **Outputs:** 4 sample goals with linked assets inserted into DB.
- **Dependencies:** `db/index.ts`.
- **Goals seeded:** Retirement Fund (₹50L, 2045-12-31), Child Education (₹30L, 2035-06-30), Europe Trip (₹3L, 2026-12-31), Emergency Fund (₹5L, 2025-12-31 — already overdue)

### `src/hooks/useData.ts`
- **Purpose:** Generic synchronous data-fetch hook with focus-triggered re-execution.
- **Inputs:** Thunk function `() => T`.
- **Outputs:** `T` (current data value).
- **Dependencies:** `AppContext` (`refreshKey`), `useFocusEffect`.
- **Used in:** `GoalsScreen` — `useData(() => goalsProgress(userId))` and `useData(() => all<Asset>(...))`

### `src/components/ui.tsx`
- **Purpose:** Shared UI component library.
- **Inputs:** Per-component props.
- **Outputs:** React Native components.
- **Goal-relevant exports:** `Screen`, `SectionCard`, `Kpi`, `Row`, `StatusChip`, `ProgressBar`, `EmptyState`, `LineItem`, `Money`
- **Note:** `ProgressBar` accepts an `expectedMarker` prop that draws a tick line at the expected-by-today percentage — this is more informative than the browser tooltip.

### `src/components/charts.tsx`
- **Purpose:** Chart components wrapping a custom bar chart renderer.
- **Inputs:** `labels`, `series` (array of `{label, color, data}`), `formatValue`, `height`.
- **Outputs:** React Native `View` containing bar chart with legend.
- **Goal-relevant exports:** `GroupedBars` (side-by-side bars for Achieved vs Target).
- **Dependencies:** React Native `View`, `Text`, `Animated`.

### `src/context/AppContext.tsx`
- **Purpose:** Global app state — user identity, refresh signal, theme.
- **Inputs:** None (Provider wraps app).
- **Outputs:** `userId`, `refresh()`, `refreshKey`, `themeMode`, `isDark`.
- **Dependencies:** `db/index.ts`, `AsyncStorage`.

### `src/utils/money.ts`
- **Purpose:** Money formatting and conversion utilities.
- **Inputs:** Numeric paise or rupee values.
- **Outputs:** Formatted strings or converted numbers.
- **Exports:** `formatINR(paise)`, `formatINRCompact(paise)`, `rupeesToPaise(rupees)`, `paiseToRupees(paise)`, `pct(value, total, decimals)`

### `src/utils/date.ts`
- **Purpose:** Date parsing, comparison, and formatting utilities.
- **Inputs:** ISO date strings, Date objects.
- **Outputs:** Formatted strings, booleans, numbers.
- **Exports:** `todayISO()`, `parseISO()`, `isValidISODate()`, `daysBetween()`, `monthsBetween()`, `formatDisplayDate()`, `nowISO()`

## Existing State Management

| Layer | Implementation | Location |
|---|---|---|
| Screen-local UI state | React `useState` | `GoalsScreen.tsx` |
| Server data (goals) | `useData()` hook (synchronous SQLite) | `GoalsScreen.tsx` |
| Server data (assets for picker) | `useData()` hook | `GoalsScreen.tsx` |
| Cross-screen trigger | `refresh()` / `refreshKey` in AppContext | `AppContext.tsx` |
| No Zustand store | — | Missing |
| No TanStack Query | — | Missing |
| No AsyncStorage persistence for UI prefs | — | Missing |

## Existing Navigation Structure

```
DrawerNavigator (_layout.tsx)
└── goals (src/app/goals.tsx → GoalsScreen)
    └── [No nested screens]
```

- No `GoalDetailScreen` route
- No `AddGoalScreen` as separate route (inline Dialog)
- No `EditGoalScreen` route
- No deep linking configured for goal sub-routes

---

# 2. Feature Parity Matrix

## F01 — Goals Dashboard Screen

**Browser Implementation:** `templates/goals/list.html` — full-page render with summary bar, bar chart, view toggle (cards/focus), goal cards grid, timeline section, add-goal modal.

**Mobile Implementation:** `GoalsScreen.tsx` — ScrollView with SectionCard containers, 2 KPIs, bar chart, goal cards, add-goal Dialog, delete confirmation Dialog, FAB.

**Current Status:** Partially Implemented

**Classification:** Partially Implemented

**Why:** The screen exists and renders goals, but it is missing the Focus view, the Goal Timeline section, the view toggle between cards and focus, and the complete 4-metric summary bar. The core "cards view" is fully functional.

---

## F02 — Summary Bar (4 Metrics)

**Browser Implementation:** `.summary-bar` div with: (1) Total Goal Value `progress.total_target | inr`, (2) Total Achieved `progress.total_current | inr` + `(progress.overall_pct)%`, (3) On Track Status `progress.on_track` of `progress.count` goals, (4) Overall Progress Bar `.bar` at `progress.overall_pct` width.

**Mobile Implementation:** `SectionCard` with right text `{on_track}/{count} on track` + 2 `Kpi` components: "Total Target" and "Achieved" (with pct and good tone).

**Current Status:** Partially Implemented

**Classification:** Partially Implemented

**Why:** Metrics 1 (Total Goal Value), 2 (Total Achieved), and 3 (On Track Count) are all present on screen but in a different layout. Metric 4 (Overall Progress Bar) is completely missing. The browser's overall_pct drives a full-width visual bar showing aggregate portfolio progress — this has no mobile equivalent.

---

## F03 — Consolidated Bar Chart (Achieved vs Target)

**Browser Implementation:** `<canvas id="fundsChart">` in `goals/list.html:168–191` — Chart.js grouped bar chart, shown only when goals exist. Labels = full goal names. Achieved color `#2FA86B`, Target color `#C2E033`. Y-axis in thousands of rupees.

**Mobile Implementation:** `GroupedBars` component in `GoalsScreen.tsx:90–101`. Labels = first word of goal name. Achieved color = `chartColors.achieved` (#2FA86B), Target color = `chartColors.target` (#9DD1C2). Conditional on `progress.goals.length > 0`.

**Current Status:** Partially Implemented

**Classification:** Partially Implemented

**Why:** Chart is implemented and functionally equivalent. Gaps: (1) labels truncated to first word instead of full name; (2) target bar color differs (#C2E033 green-yellow in browser vs #9DD1C2 teal in mobile); (3) Y-axis formatting and tooltip format may differ. These are display fidelity gaps, not logic gaps.

---

## F04 — View Toggle (Cards / Focus)

**Browser Implementation:** `.seg` buttons with Alpine.js `x-data="{view:'cards'}"` — clicking sets `view` to `'cards'` or `'focus'`. Both grid sections are rendered in HTML and toggled with `x-show`.

**Mobile Implementation:** Not implemented. No toggle UI, no view state, no Focus view to toggle to.

**Current Status:** Missing

**Classification:** Missing

**Why:** The view toggle has no mobile equivalent. Since the Focus view itself is missing, the toggle cannot exist either. This is a compound gap.

---

## F05 — Goal Cards (Cards View)

**Browser Implementation:** Jinja2 `for g in progress.goals` loop rendering `.goal-card` elements in a `.grid.grid-2` layout.

**Mobile Implementation:** `GoalsScreen.tsx:103–133` — for each goal in `progress.goals`, renders a `SectionCard` with all elements.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

**Why:** All major card elements are present: goal name, status badge, current/target amounts, progress bar with expected marker, "X% complete" text, conditional "Save ~X/mo", meta grid (target date, monthly, linked count), delete button. Visual layout differs (list vs 2-col grid) which is appropriate for mobile.

---

## F06 — Goal Icon Image (per Type)

**Browser Implementation:** `<img class="goal-ico-img" src="/static/img/logo-goals/{g.goal_type}.png" onerror="this.src='/static/img/logo-goals/custom.png'">` — PNG images served as static files with fallback.

**Mobile Implementation:** No PNG images. The status badge uses react-native-paper icon names (`check-circle`, `circle-slice-8`, `alert`, `alert-circle`). Goal cards do not show type-specific images.

**Current Status:** Missing

**Classification:** Missing

**Why:** Goal type PNG images (`retirement.png`, `education.png`, etc.) are not bundled as local assets. No `GoalTypeIcon` component exists. Mobile cards do not show the goal type icon that is prominently displayed in the browser's cards and focus view.

---

## F07 — Status Badge

**Browser Implementation:** `goal_status_badge(g)` Jinja2 macro rendering a `.chip` `<span>` with `g.status_tone` class, `g.status_icon` Unicode character (✓, ●, ▲, !), and `g.status_label` text.

**Mobile Implementation:** `StatusChip` component from `components/ui.tsx` with tone and icon props. `GOAL_STATUS_META` maps status to `{ label, icon (react-native-paper icon name), tone }`.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

**Why:** Status badge renders correctly with equivalent colors and labels. Icon style differs (material icons vs Unicode chars) but is functionally equivalent and appropriate for React Native.

---

## F08 — Progress Bar (Linear, Score-Colored)

**Browser Implementation:** `.bar > <span>` with `width: {{ g.pct }}%; background: {{ score_color(g.pct) }}`. Score color: green ≥70%, orange ≥40%, red <40%.

**Mobile Implementation:** `ProgressBar` component with `value={g.pct}`, `tone={g.status_tone}`, and `expectedMarker={g.expected_pct}`. The expected marker shows a tick line at the "should be here by now" position — this goes beyond the browser implementation.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

**Why:** The mobile ProgressBar is feature-complete and adds value over the browser with the expected marker. The score_color thresholds (≥70 green, ≥40 orange, <40 red) are applied via the `tone` field from `goalsProgress()`.

---

## F09 — "X% complete" Text

**Browser Implementation:** `<span>{{ g.pct }}% complete</span>` in goal card.

**Mobile Implementation:** Rendered as `Text` in goal card: `{g.pct}% complete`.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

---

## F10 — Info Tooltip (Expected Pct)

**Browser Implementation:** `.fv-info` + `.fv-tip` elements showing "(X% expected so far)" on hover/focus of the "X% complete" text.

**Mobile Implementation:** Not implemented as a tooltip. The expected marker on the `ProgressBar` component visually shows the expected position, but there is no tap-to-reveal explanation tooltip showing the expected_pct value in text form.

**Current Status:** Partially Implemented

**Classification:** Partially Implemented

**Why:** The expected_pct data is computed and the ProgressBar renders a visual marker at that position. However, the browser's explicit tooltip text "(X% expected so far)" with a numeric value is not surfaced to the user.

---

## F11 — "Save ~X/mo to Finish on Time"

**Browser Implementation:** Conditional `<span>` shown when `g.status != 'completed'` and `g.required_monthly` is truthy. Shows `g.required_monthly | inr`.

**Mobile Implementation:** Implemented in `GoalsScreen.tsx` — conditional render when status is not `'completed'` and `required_monthly > 0`. Displays `formatINR(g.required_monthly)`.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

---

## F12 — Goal Meta Grid (3 Items)

**Browser Implementation:** `.goal-meta` grid with: Target Date, Monthly Needed (|inr), Linked Assets count.

**Mobile Implementation:** `Row` with 3 `LineItem` components: Target Date (or "—"), Monthly Needed (formatted INR), Linked Assets count.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

---

## F13 — Delete Action (with Confirmation)

**Browser Implementation:** `<button>×</button>` triggering `fvConfirmDelete(form, message, title)` → custom confirm modal → form POST to `/goals/{id}/delete`.

**Mobile Implementation:** Delete button in card → sets `confirmId` state → `Dialog` confirmation → `doDelete()` → `remove('financial_goals', id)` → `refresh()`.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

---

## F14 — Empty State

**Browser Implementation:** Jinja2 `{% else %}` on the goals loop — shows "No goals yet" `.card` div.

**Mobile Implementation:** `EmptyState` component rendered when `progress.goals.length === 0`.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

---

## F15 — Focus View (Radial Ring Card)

**Browser Implementation:** `.goal-card` with centered layout and `.goal-ring` using `conic-gradient` CSS at `g.pct`% fill. Shows status badge, delete button, radial ring with percentage inside, goal icon, name, current/target text, milestone dots, meta grid.

**Mobile Implementation:** Not implemented. No `GoalRingCard` component exists.

**Current Status:** Missing

**Classification:** Missing

**Why:** The entire Focus view is absent from the mobile implementation. This includes the radial progress ring (requires `react-native-svg`), the 2-column layout, the inline projection, and the milestone dots.

---

## F16 — Milestone Dots (25/50/75/100%)

**Browser Implementation:** `.ms-dot` elements in a `.milestones` row inside the Focus view card. Each dot gets `.hit` class when `g.pct >= milestone`.

**Mobile Implementation:** Not implemented. No `MilestoneDots` component exists.

**Current Status:** Missing

**Classification:** Missing

**Why:** Milestone dots are a sub-element of the Focus view which is entirely missing.

---

## F17 — Goal Timeline (Visual Chronological List)

**Browser Implementation:** `.timeline` section below cards view, visible when any goal has a `target_date`. Renders `.tl-node` per goal (sorted by target_date ascending) with colored dot, goal logo, name, target date, progress %.

**Mobile Implementation:** Not implemented. No `GoalTimeline` component or equivalent section exists.

**Current Status:** Missing

**Classification:** Missing

**Why:** The visual timeline showing all goals ordered by target date has no mobile equivalent. The data exists (target_date is fetched), but the UI rendering is absent.

---

## F18 — Add Goal Modal

**Browser Implementation:** `x-show="showAdd"` Alpine.js modal with form: name (required), goal_type select (7 options, with live icon preview), target_amount (required, rupees), monthly_needed (optional, default 0), target_date (optional, min=today), linked_assets checkboxes showing asset name + current_value.

**Mobile Implementation:** `Dialog` with `ScrollView` in `GoalsScreen.tsx:138–177`. Fields: name (TextInput), goal_type (Menu picker — 7 options), target (TextInput, numeric), target_date (TextInput with `isValidISODate` validation), monthly (TextInput, numeric), asset checkboxes (for each asset: Checkbox + name + current value).

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

**Why:** All required form fields are present. The goal type live icon preview (reactive image changing as user selects type) is not implemented (mobile uses a Menu picker without image preview), but this is a minor UX enhancement rather than a data gap. Validation on name (non-empty) and target (> 0) is implemented.

---

## F19 — Goal Type Icon Preview (Reactive in Form)

**Browser Implementation:** `<img class="goal-logo-sm" :src="'/static/img/logo-goals/'+gt+'.png'">` — Alpine.js reactive image that updates as user changes goal type select.

**Mobile Implementation:** Not implemented. The Menu picker shows text labels only; no image preview updates when the user selects a goal type.

**Current Status:** Missing

**Classification:** Missing

**Why:** No PNG goal type images are bundled, so the preview cannot render. This is a dependent gap on F06 (Goal Icon Images).

---

## F20 — Goal Editing

**Browser Implementation:** Does not exist. No edit route or UI.

**Mobile Implementation:** Does not exist. No `EditGoalScreen` or edit mutation.

**Current Status:** Missing

**Classification:** Missing

**Why:** Neither browser nor mobile supports goal editing. The browser analysis marks this as "Nice to Have" for mobile. The `FinancialGoal` model has fields (`priority`, `notes`, `color_hex`, `icon`) that are never exposed via any UI in either implementation.

---

## F21 — Goal Detail Screen

**Browser Implementation:** Does not exist as a separate page. All goal information is shown inline on the cards.

**Mobile Implementation:** Does not exist. No `GoalDetailScreen` exists. Tapping a goal card does nothing.

**Current Status:** Missing

**Classification:** Missing

**Why:** A dedicated detail screen is a mobile-native addition recommended in the browser analysis. On mobile, displaying all card metadata inline in a scrollable list is viable but sub-optimal. Linked asset breakdown per goal is not visible anywhere on mobile.

---

## F22 — Focus View Projection (Months to Completion)

**Browser Implementation:** Inline Jinja2 calculation in `templates/goals/list.html:78–79`: `remaining = g.target - g.current; months = ceil(remaining / g.monthly_needed) if g.monthly_needed else 0`. Renders "Achieved 🎉", "~{months} mo", or "Set monthly".

**Mobile Implementation:** Not implemented. No Focus view exists to show this projection.

**Current Status:** Missing

**Classification:** Missing

**Why:** This calculation is trivially derivable from existing data (`target`, `current`, `monthly_needed` are all available in `progress.goals[n]`), but it has no UI surface in mobile since the Focus view card doesn't exist.

---

## F23 — Goal Creation (API/DB Operation)

**Browser Implementation:** Form POST to `/goals` → `goals_create()` in `pages.py` → `rupees_to_paise()` conversion → `FinancialGoal` insert → `GoalAssetLink` inserts per linked asset → 303 redirect.

**Mobile Implementation:** `saveGoal()` in `GoalsScreen.tsx:44–70` → `insert('financial_goals', {...})` → for each checked asset: `insert('goal_asset_links', {...})` → `refresh()`.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

**Why:** Full parity including paise conversion, UUID generation, asset linking with 100% allocation, and data refresh after creation.

---

## F24 — Dashboard Widget (Top 3 Goals)

**Browser Implementation:** `templates/dashboard/index.html` embeds `stats.goals.goals[:3]` as a "Goal Progress" widget with name, pct, progress bar, and "VIEW ALL" link.

**Mobile Implementation:** `DashboardScreen.tsx` renders a "Goals" SectionCard showing `{on_track}/{count} on track`, and for each goal: name, pct, `ProgressBar` with expected marker. Uses same `goalsProgress(userId)` call.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

**Why:** Dashboard widget exists and shows goal progress. Mobile may show all goals rather than top 3 — this is a minor difference.

---

## F25 — INR/Paise Formatting

**Browser Implementation:** `currency.py` — `format_inr(paise)`, `rupees_to_paise(amount)`, `paise_to_rupees(paise)`.

**Mobile Implementation:** `utils/money.ts` — `formatINR(paise)`, `rupeesToPaise(rupees)`, `paiseToRupees(paise)`, plus `formatINRCompact(paise)` (not in browser).

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

**Why:** All three browser functions are ported. Mobile additionally has `formatINRCompact` for abbreviated display.

---

## F26 — Search / Filter / Sort

**Browser Implementation:** Does not exist.

**Mobile Implementation:** Does not exist.

**Current Status:** Missing

**Classification:** Missing

**Why:** Neither implementation has search/filter/sort for goals. The browser analysis recommends adding these for mobile. Not a regression — a mobile enhancement.

---

## F27 — Offline Handling / Caching

**Browser Implementation:** Not applicable — server-rendered, stateless.

**Mobile Implementation:** Not implemented. `useData()` runs synchronous SQLite queries on every screen focus. Since data is local SQLite (not a network call), "offline" is always available. However, there is no stale-data indicator, no background refresh, and no AsyncStorage persistence of computed values.

**Current Status:** Missing

**Classification:** Missing (not a regression; different architecture)

**Why:** The mobile app's local-first SQLite architecture means offline is inherently supported. However, there is no caching strategy, loading state handling, or query client — all data is synchronous and re-queried on every screen focus.

---

## F28 — Goal Status Logic (Complete)

**Browser Implementation:** `services.py` — `GOAL_STATUS` dict + `goal_timeline()` + `goals_progress()`.

**Mobile Implementation:** `services/finance.ts` — `GOAL_STATUS_META` + `goalTimeline()` + `goalsProgress()`.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

---

## F29 — Calculation Engine (goalTimeline)

**Browser Implementation:** `services.py goal_timeline()` — full linear interpolation status engine with 6 edge cases.

**Mobile Implementation:** `services/finance.ts goalTimeline()` — exact TypeScript port with identical logic.

**Current Status:** Fully Implemented

**Classification:** Fully Implemented

---

## F30 — Notifications / Background Jobs

**Browser Implementation:** Not implemented for goals. Scheduler handles SIP reminders only.

**Mobile Implementation:** Not implemented.

**Current Status:** Missing

**Classification:** Missing (not a regression)

---

# 3. UI Gap Analysis

## Goal Summary Cards

**Browser Source:** `.summary-bar` div — 4 columns: Total Goal Value | Total Achieved + % | On Track Status | Overall Progress Bar.

**Mobile Equivalent:** `SectionCard` with right text + 2 `Kpi` components.

**Gap:** (1) Overall Progress Bar missing entirely. (2) "On Track" count displayed as header right text rather than as a distinct KPI with label. (3) Browser shows "X of Y goals" on-track label inline with a count; mobile shows `{on_track}/{count} on track` in card title area.

**Recommended Implementation:** Add a third row below the 2 KPIs containing a full-width `ProgressBar` with `value={progress.overall_pct}` and label "Overall Portfolio Progress". Use `Row` + `Kpi` for "On Track: {on_track} / {count}".

---

## Goal Cards

**Browser Source:** `.goal-card` in `goals/list.html:44–71`.

**Mobile Equivalent:** `SectionCard` blocks in `GoalsScreen.tsx:103–133`.

**Gap:** Goal type PNG image (`goal-ico-img`) is absent. Mobile shows no visual icon for goal type. All other card elements are present.

**Recommended Implementation:** Add a `GoalTypeIcon` component using `require()` for bundled PNG assets. Place it alongside the goal name in the card header.

---

## Goal Detail Screen

**Browser Source:** N/A (all details inline in card).

**Mobile Equivalent:** None.

**Gap:** Tapping a goal card on mobile does nothing. A detail screen would show: linked assets list with individual values, full allocation breakdown, goal creation date, notes field, priority field.

**Recommended Implementation:** Create `src/screens/goals/GoalDetailScreen.tsx` with a `Stack.Screen` push navigator triggered by card tap. Show all `FinancialGoal` fields + `GoalAssetLink` breakdown queried from DB.

---

## Progress Indicators

**Browser Source:** `.bar > <span>` with dynamic width and `score_color()` background.

**Mobile Equivalent:** `ProgressBar` component with `value`, `tone`, and `expectedMarker` props.

**Gap:** None — mobile `ProgressBar` is functionally superior (adds expected marker).

**Recommended Implementation:** No changes needed.

---

## Circular Progress Components (Focus View Ring)

**Browser Source:** `.goal-ring` with `conic-gradient(${color} ${pct}%, var(--card-bg) 0)` CSS, `.goal-ring-in` for center label.

**Mobile Equivalent:** None.

**Gap:** Complete absence. No SVG ring component exists.

**Recommended Implementation:** Create `src/components/goals/GoalRingCard.tsx` using `react-native-svg` `<Circle>` elements with `strokeDasharray` / `strokeDashoffset` for arc rendering. Rotate -90deg to start at top. Inner label as absolutely positioned `<Text>`.

---

## Goal Status Indicators

**Browser Source:** `goal_status_badge(g)` macro — `.chip` with tone class, icon character, label text.

**Mobile Equivalent:** `StatusChip` from `components/ui.tsx`.

**Gap:** None functionally. Icon representation differs (material icons vs Unicode) but is appropriate for the platform.

---

## Forecast Widget / Projection Meta

**Browser Source:** Focus view `.goal-meta` cell showing "~{months} mo" or "Achieved 🎉" or "Set monthly".

**Mobile Equivalent:** None (Focus view missing).

**Gap:** Complete. The months-to-completion projection is not rendered anywhere on mobile.

**Recommended Implementation:** Implement as part of `GoalRingCard` / Focus view. Formula: `remaining = target - current; months = ceil(remaining / monthly_needed) if monthly_needed else 0`.

---

## Milestone Views

**Browser Source:** `.milestones` > `.ms-dot` elements in Focus view. 4 dots for 25%, 50%, 75%, 100%. `.hit` class when `goal.pct >= milestone`.

**Mobile Equivalent:** None.

**Gap:** Complete.

**Recommended Implementation:** Create `src/components/goals/MilestoneDots.tsx` — a `Row` of 4 `<View>` circles, filled/colored when `pct >= milestone`. Reuse in `GoalRingCard`.

---

## Goal Analytics

**Browser Source:** Summary bar aggregates (`total_target`, `total_current`, `overall_pct`, `on_track`, `count`).

**Mobile Equivalent:** Present in data layer (`goalsProgress()` returns all aggregates) but only partially rendered (missing `overall_pct` progress bar).

**Gap:** `overall_pct` not rendered as a visual progress bar.

---

## Goal Charts

**Browser Source:** Chart.js grouped bar (`'bar'` type), full goal names as labels, green (`#2FA86B`) + yellow-green (`#C2E033`) colors, Y-axis in rupees/1000.

**Mobile Equivalent:** `GroupedBars` component.

**Gap:** (1) Labels = first word only vs. full names; (2) target color = `#9DD1C2` (teal) vs. `#C2E033` (yellow-green); (3) Y-axis format not compared but may differ.

**Recommended Implementation:** Use full `g.name` as chart labels; align target color to `#C2E033` or define semantically equivalent theme color.

---

## Goal Tables / Filters / Search / Sorting

**Browser Source:** Not implemented in browser.

**Mobile Equivalent:** Not implemented.

**Gap:** Mobile-only enhancement. Not a regression.

**Recommended Implementation:** Add filter chips below summary bar (All / On Track / Behind / Overdue / Completed); sort dropdown (Target Date / Progress / Name); search TextInput in header.

---

## Buttons / Menus

**Browser Source:** `<button class="btn">` for create/cancel; `<button class="btn-danger btn-sm">×</button>` for delete; `<select>` for goal type; checkbox inputs for assets.

**Mobile Equivalent:** `Button` (react-native-paper) for create/cancel; delete `Button` with danger color; `Menu` + `MenuItem` for goal type; `Checkbox` for assets.

**Gap:** None — all button equivalents are present.

---

## Modals

**Browser Source:** `showAdd` Alpine.js modal (add goal); `fvConfirmDelete` JS modal (delete confirmation).

**Mobile Equivalent:** `Dialog` from react-native-paper for both add and delete confirmation.

**Gap:** None — both modals are implemented.

---

## Tooltips

**Browser Source:** `.fv-info + .fv-tip` hover/focus tooltip on "X% complete" text showing expected_pct.

**Mobile Equivalent:** No tooltip. Expected_pct is shown visually via `ProgressBar`'s `expectedMarker` prop.

**Gap:** The numeric expected_pct value (e.g., "47.3% expected so far") is not shown in text form. Visual marker conveys position but not the precise percentage.

**Recommended Implementation:** Add a long-press or `Pressable` wrapper that shows a brief `Snackbar` or inline `Text` revealing the expected_pct value on interaction.

---

## Loading States

**Browser Source:** None — server-rendered. Page is always complete on load.

**Mobile Equivalent:** None — `useData()` runs synchronously before render.

**Gap:** No skeleton screens. Since SQLite is synchronous and local, data is available immediately — loading states are less critical here than they would be in a network-based app. However, initial DB load can still produce a brief undefined state.

**Recommended Implementation:** Handle `undefined` return from `useData()` by showing a `ActivityIndicator` or skeleton placeholder.

---

## Error States

**Browser Source:** No explicit error state — all errors cause redirects. Empty state is handled by `{% else %}`.

**Mobile Equivalent:** Basic — no explicit error UI. `goalsProgress()` can throw on DB errors and this is unhandled.

**Gap:** DB errors in `goalsProgress()` or `saveGoal()` are not caught and displayed to the user.

**Recommended Implementation:** Wrap `useData()` calls in `useDataSafe()` (already available in `hooks/useData.ts`). Render error `Text` or `EmptyState` when `error` is non-null.

---

## Empty States

**Browser Source:** Jinja2 `{% else %}` on goals loop — static "No goals yet" card.

**Mobile Equivalent:** `EmptyState` component rendered when `progress.goals.length === 0`.

**Gap:** None.

---

# 4. Goal Calculation Migration Analysis

## C1 — Current Value (from Linked Assets)

**Formula:** `current = Σ( round(link.asset.current_value × link.allocation_pct / 100) )` for each `GoalAssetLink` where `link.asset` is not null.

**Browser Location:** `services.py`, `goals_progress()`, line ~629

**Mobile Location:** `services/finance.ts`, `goalsProgress()` — equivalent query joining `goal_asset_links` and `assets`, same formula.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## C2 — Progress Percentage

**Formula:** `pct = round(current / target_amount × 100, 1)` if `target_amount > 0` else `0.0`; `display_pct = min(pct, 100)`.

**Browser Location:** `services.py`, `goals_progress()`, line ~631

**Mobile Location:** `services/finance.ts`, `goalsProgress()` — identical formula.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## C3 — Expected Fraction (Linear Interpolation)

**Formula:** `total_days = (target_date - start).days`; if `total_days <= 0`, `frac = 1.0`; else `elapsed = max(0, min((today - start).days, total_days))`; `frac = elapsed / total_days`.

**Browser Location:** `services.py`, `goal_timeline()`, lines 593–601

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — port using `.getTime()` / 86400000 for day calculations.

**Current Status:** Fully Implemented

**Required Work:** None. The TypeScript port correctly handles all edge cases: inverted dates (`frac=1`), today before start (`elapsed=0`), today after target date (`elapsed=total_days`), missing start or target date (`frac=0`).

---

## C4 — Expected Amount

**Formula:** `expected = round(frac × target_amount)`

**Browser Location:** `services.py`, `goal_timeline()`, line ~601

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — `Math.round(frac * targetAmount)`.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## C5 — Expected Percentage

**Formula:** `expected_pct = round(frac × 100, 1)`

**Browser Location:** `services.py`, `goal_timeline()`, line 618

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — `Math.round(frac * 1000) / 10`.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## C6 — Required Monthly Contribution

**Formula:** `remaining_amount = max(target_amount - current, 0)`; if `target_date > today`: `remaining_months = max(round((target_date - today).days / 30.44), 1)`; `required_monthly = round(remaining_amount / remaining_months)`; else: `required_monthly = remaining_amount`.

**Browser Location:** `services.py`, `goal_timeline()`, lines 604–609

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — identical using `Math.round(remainingMs / (30.44 * 86400000))`.

**Current Status:** Fully Implemented

**Required Work:** None. The 30.44 days/month constant and the minimum-1-month guard are both implemented.

---

## C7 — Goal Status Determination

**Formula:** if `current >= target AND target > 0` → `"completed"`; elif `today >= target_date` → `"overdue"`; elif `current >= expected` → `"on_track"`; else → `"behind"`. If no `target_date`: defaults to `"on_track"` (expected = 0, current ≥ 0 always).

**Browser Location:** `services.py`, `goal_timeline()`, lines 612–618

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — exact same priority order.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## C8 — Overall Portfolio Progress

**Formula:** `total_target = Σ(g.target_amount)`; `total_current = Σ(current)`; `overall_pct = round(total_current / total_target × 100, 1)` if `total_target > 0` else `0.0`; `on_track = count where status ∈ {"completed", "on_track"}`.

**Browser Location:** `services.py`, `goals_progress()`, lines 623–651

**Mobile Location:** `services/finance.ts`, `goalsProgress()` — all four aggregates computed.

**Current Status:** Fully Implemented

**Required Work:** None. Data is computed correctly; gap is only in rendering (F02 — `overall_pct` not shown as a progress bar).

---

## C9 — Focus View Projection (Months)

**Formula:** `remaining = g.target - g.current`; `months = ceil(remaining / g.monthly_needed)` if `g.monthly_needed > 0` else `0`.

**Browser Location:** `templates/goals/list.html`, lines 78–79 (inline template calculation)

**Mobile Location:** Not computed or rendered anywhere. All input fields (`target`, `current`, `monthly_needed`) are available in `progress.goals[n]`.

**Current Status:** Missing

**Required Work:** Implement in `GoalRingCard` or as a utility function. No new data fetching required — derive from existing `GoalItem` fields.

---

## C10 — Score Color Thresholds

**Formula:** `pct >= 70` → green; `pct >= 40` → orange/warn; `< 40` → red/danger.

**Browser Location:** `templates/partials/_bars.html`, `score_color()` macro

**Mobile Location:** `ProgressBar` component uses `tone` from `GOAL_STATUS_META` + `statusColor()`. The `goalsProgress()` function sets `tone` based on status. Note: tone is derived from STATUS (completed/on_track → good; behind → warn; overdue → bad), NOT directly from the percentage thresholds.

**Current Status:** Partially Implemented

**Classification:** Partially Implemented

**Why:** The browser's `score_color()` maps the raw percentage (≥70/≥40/<40) to a color independent of status. Mobile maps color via STATUS tone which is logically related but not identical. Example: a goal at 15% pct but just created with no target date has status `on_track` (green) but the browser would show red (15% < 40). This is an edge case but represents a behavioral difference.

**Required Work:** Implement a `scoreColor(pct, palette)` utility function in `utils/money.ts` or `utils/goalCalculations.ts` and apply it directly to `ProgressBar`'s color prop independent of status tone.

---

# 5. API Migration Analysis

> **Architecture Note:** The mobile app has no REST API layer. Browser HTTP routes map to direct SQLite operations via `db/index.ts`.

## API-01 — Goals Page / Read All Goals

**API Name:** Goals Page / Read Goals

**Browser Endpoint:** `GET /goals`

**Purpose:** Fetch all user goals with computed progress, status, and aggregate metrics.

**Browser Status:** Implemented — `pages.py:3132` `goals_page()` → calls `goals_progress(db, user_id)` → renders template.

**Mobile Status:** Implemented — `useData(() => goalsProgress(userId))` in `GoalsScreen.tsx`. `goalsProgress()` in `services/finance.ts` queries `financial_goals` JOIN `goal_asset_links` JOIN `assets` directly.

**Migration Required:** No — fully operational.

**Classification:** Already Implemented

---

## API-02 — Create Goal

**API Name:** Create Goal

**Browser Endpoint:** `POST /goals`

**Purpose:** Create a new `FinancialGoal` record and associated `GoalAssetLink` records.

**Browser Status:** Implemented — `pages.py:3146` `goals_create()`. Converts rupees → paise via `rupees_to_paise()`. Validates asset ownership.

**Mobile Status:** Implemented — `saveGoal()` in `GoalsScreen.tsx:44–70`. Converts rupees → paise via `rupeesToPaise()`. Creates `FinancialGoal` and `GoalAssetLink` records via `insert()`.

**Migration Required:** No — functionally equivalent.

**Classification:** Already Implemented

**Note:** Mobile does not validate asset ownership (any asset can be linked), but since all assets shown are already filtered to `userId`, this is safe.

---

## API-03 — Delete Goal

**API Name:** Delete Goal

**Browser Endpoint:** `POST /goals/{goal_id}/delete`

**Purpose:** Hard-delete goal and cascade-delete `GoalAssetLink` records.

**Browser Status:** Implemented — `pages.py:3177` `goals_delete()`. Verifies `goal.user_id == user.id`.

**Mobile Status:** Implemented — `doDelete()` in `GoalsScreen.tsx:72–76` calls `remove('financial_goals', confirmId)`. Cascade is handled at DB level via `ON DELETE CASCADE` on `goal_asset_links`.

**Migration Required:** No.

**Classification:** Already Implemented

---

## API-04 — Edit Goal (PATCH)

**API Name:** Edit Goal

**Browser Endpoint:** N/A (does not exist)

**Purpose:** Update existing goal fields (name, target, monthly, target_date, priority, linked assets).

**Browser Status:** Not implemented.

**Mobile Status:** Not implemented.

**Migration Required:** Yes — mobile should add this as an enhancement.

**Classification:** Missing

---

## API-05 — Assets for Link Picker

**API Name:** Assets Summary for Goal Linking

**Browser Endpoint:** Assets loaded inline: `assets = db.scalars(select(Asset).where(Asset.user_id == user.id))` in `goals_page()`.

**Purpose:** Provide list of user's assets for selection in the add-goal form.

**Browser Status:** All asset fields loaded on every goals page GET (inefficient).

**Mobile Status:** `useData(() => all<Asset>('SELECT * FROM assets WHERE user_id=?', [userId]))` in `GoalsScreen.tsx`. Also loads all fields but only on component mount and focus.

**Migration Required:** No — implemented, but could be optimized to load only `id`, `name`, `current_value`.

**Classification:** Already Implemented

---

## API-06 — Keep-Alive / Session (Browser-Only)

**API Name:** Keep-Alive

**Browser Endpoint:** `GET /api/keep-alive`

**Purpose:** Session heartbeat to prevent timeout.

**Browser Status:** Implemented (shared, not goal-specific).

**Mobile Status:** Not applicable — no server session. Auth is local.

**Migration Required:** No.

**Classification:** Not Applicable

---

# 6. Business Logic Gap Analysis

## BL01 — Goal Progress Percentage

**Rule:** `pct = round(current / target_amount × 100, 1); display_pct = min(pct, 100)`. Display is capped at 100 but the actual ratio may exceed 100 (used for status).

**Browser Location:** `services.py`, `goals_progress()`, line ~631

**Mobile Location:** `services/finance.ts`, `goalsProgress()` — implemented identically.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## BL02 — Goal Completion

**Rule:** `is_complete = (current >= target_amount) AND (target_amount > 0)`. No separate DB flag is set — evaluated at query time.

**Browser Location:** `services.py`, `goal_timeline()`, lines 587–589

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — identical guard.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## BL03 — Required Monthly Contribution

**Rule:** `remaining_amount = max(target_amount - current, 0)`; if `target_date > today`: `remaining_months = max(round((target_date - today).days / 30.44), 1)`; `required_monthly = round(remaining_amount / remaining_months)`; else: `required_monthly = remaining_amount` (full shortfall due immediately).

**Browser Location:** `services.py`, `goal_timeline()`, lines 604–609

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — identical.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## BL04 — Remaining Amount (for Focus Projection)

**Rule:** `remaining = target - current` (in paise). Used as denominator for focus view projection.

**Browser Location:** `templates/goals/list.html`, line 78 — inline Jinja2 variable.

**Mobile Location:** Not computed as a named value. All source fields are available in `GoalItem` (`target`, `current`).

**Current Status:** Missing (UI layer only)

**Required Work:** Compute inline in `GoalRingCard` component: `const remaining = Math.max(goal.target - goal.current, 0)`.

---

## BL05 — Focus View Projection (Months)

**Rule:** `months = ceil(remaining / monthly_needed)` if `monthly_needed > 0` else `0`.

**Browser Location:** `templates/goals/list.html`, line 79

**Mobile Location:** Not implemented.

**Current Status:** Missing

**Required Work:** Implement in `GoalRingCard` component.

---

## BL06 — Expected Amount by Now

**Rule:** `frac = elapsed_days / total_days`; `expected = round(frac × target_amount)`.

**Browser Location:** `services.py`, `goal_timeline()`, lines 593–601

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — identical.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## BL07 — Goal Health (On-Track Classification)

**Rule:** `on_track = status ∈ {"completed", "on_track"}`. No numeric health score — binary.

**Browser Location:** `services.py`, `goals_progress()`, line ~635–636

**Mobile Location:** `services/finance.ts`, `goalsProgress()` — `on_track` boolean per goal, `on_track` count in aggregate.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## BL08 — Overall Portfolio Achievement

**Rule:** `overall_pct = round(total_current / total_target × 100, 1)` if `total_target > 0` else `0.0`.

**Browser Location:** `services.py`, `goals_progress()`, line ~649–650

**Mobile Location:** `services/finance.ts`, `goalsProgress()` — computed and returned.

**Current Status:** Partially Implemented

**Required Work:** `overall_pct` is computed correctly but not rendered as a progress bar in the mobile UI. Add overall progress bar to `GoalsScreen` summary section.

---

## BL09 — Score Color Thresholds

**Rule:** `pct >= 70` → green (good); `pct >= 40` → orange (warn); `pct < 40` → red (danger). Applied to progress bars and ring fill.

**Browser Location:** `templates/partials/_bars.html`, `score_color()` macro

**Mobile Location:** Color derived indirectly via `status_tone` (good/warn/bad). Not a direct pct-based lookup.

**Current Status:** Partially Implemented

**Required Work:** Implement `scoreColor(pct: number): 'good' | 'warn' | 'bad'` utility function applying the ≥70/≥40/<40 thresholds directly, independent of goal status. Apply to `ProgressBar`'s color/tone prop.

---

## BL10 — Goal Creation Validation

**Rule (browser):** HTML `required` attribute on `name` and `target_amount`. No server-side error message — just redirect on missing fields.

**Rule (mobile):** `saveGoal()` checks: `form.name.trim()` non-empty, `parseFloat(form.target) > 0`, `isValidISODate(form.target_date)` if target_date is provided.

**Browser Location:** `templates/goals/list.html`, required HTML attrs.

**Mobile Location:** `GoalsScreen.tsx:44–55`

**Current Status:** Fully Implemented (mobile is stricter — better)

**Required Work:** None.

---

## BL11 — Asset Ownership Validation on Link

**Rule:** Browser `goals_create()` validates `asset.user_id == user.id` before creating `GoalAssetLink`.

**Browser Location:** `pages.py`, `goals_create()`, line ~3155

**Mobile Location:** Not explicitly validated. Assets query is already filtered by `user_id`, so only user-owned assets appear in the checkbox list. Implicit validation.

**Current Status:** Partially Implemented (safe in current architecture but not explicit)

**Required Work:** Optional — add explicit check `if asset.user_id !== userId` in `saveGoal()` for defense-in-depth.

---

## BL12 — Goal Deletion with Cascade

**Rule:** Deleting a goal must delete all `GoalAssetLink` records for that goal.

**Browser Location:** `pages.py`, `goals_delete()` — SQLAlchemy cascade handles this.

**Mobile Location:** `schema.ts` — `FOREIGN KEY(goal_id) REFERENCES financial_goals(id) ON DELETE CASCADE` ensures DB-level cascade.

**Current Status:** Fully Implemented

**Required Work:** None.

---

# 7. State Management Gap Analysis

## Current Mobile Implementation

| State | Location | Mechanism | Persistence |
|---|---|---|---|
| Goals data | `GoalsScreen.tsx` | `useData()` → synchronous SQLite | None (re-queried on focus) |
| Assets data (for picker) | `GoalsScreen.tsx` | `useData()` | None |
| Add modal open/closed | `GoalsScreen.tsx` | `useState(addOpen)` | None |
| Add form fields | `GoalsScreen.tsx` | `useState(form)` | None |
| Goal type menu open/closed | `GoalsScreen.tsx` | `useState(typeMenu)` | None |
| Asset link selections | `GoalsScreen.tsx` | `useState(links)` object | None |
| Delete confirmation ID | `GoalsScreen.tsx` | `useState(confirmId)` | None |
| Global refresh signal | `AppContext.tsx` | `refreshKey` counter | None (in-memory) |
| User ID | `AppContext.tsx` | Context | AsyncStorage (persisted) |

## Missing Stores

### Missing: Zustand Goals UI Store

**Required implementation:**
```typescript
// src/stores/goalsStore.ts
interface GoalsStore {
  view: 'cards' | 'focus';
  filterStatus: 'all' | 'completed' | 'on_track' | 'behind' | 'overdue';
  sortBy: 'target_date' | 'pct' | 'name';
  searchQuery: string;
  setView(v: 'cards' | 'focus'): void;
  setFilterStatus(s: GoalsStore['filterStatus']): void;
  setSortBy(s: GoalsStore['sortBy']): void;
  setSearchQuery(q: string): void;
}
```

**Why needed:** View preference (cards/focus), filter state, and sort order should persist across navigation. Currently all state is lost when GoalsScreen unmounts.

**Migration effort:** Low — create store with `zustand/middleware`'s `persist` + `AsyncStorage`.

---

### Missing: View Toggle State

**Current implementation:** No view toggle state exists.

**Required implementation:** `view: 'cards' | 'focus'` in `goalsStore.ts`, persisted to `AsyncStorage` with key `'goals-ui-view'`.

**Migration effort:** Low.

---

### Missing: Filter / Search / Sort State

**Current implementation:** None.

**Required implementation:** Three fields in `goalsStore.ts` for filter, sort, and search query.

**Migration effort:** Low (state) + Medium (UI filter chips + search bar).

---

## Missing Cache Layers

**Current implementation:** `useData()` re-executes `goalsProgress(userId)` on every screen focus. This is a synchronous SQLite call so there is no network latency, but it does recalculate all goal metrics on every focus — O(n × linked assets).

**Required implementation (optional):** Since this is local SQLite, TanStack Query is not strictly necessary. However, if a REST API layer is added in the future, TanStack Query with `staleTime: 5 * 60 * 1000` would be appropriate.

**Migration effort:** Medium if adding TanStack Query.

---

## Missing Persistence Logic

**Current:** View toggle preference is lost on app restart. Filter and sort preferences are lost on navigation.

**Required:** `AsyncStorage` via Zustand `persist` middleware for `goalsStore`.

---

## Missing Synchronization Logic

**Current:** `refresh()` in `AppContext` increments `refreshKey`, causing `useData()` to re-run. This is a global signal — any mutation anywhere triggers re-query of ALL data that uses `useData()`.

**Required (improvement):** Scoped invalidation — only invalidate goals-related queries when a goal mutation occurs, not all queries. This is a performance optimization, not a functional gap.

---

# 8. Goal Status Engine Gap Analysis

## Status: `completed`

**Trigger Logic:** `current >= target_amount AND target_amount > 0`

**Browser Location:** `services.py`, `goal_timeline()`, lines 587–589

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — identical condition.

**Current Status:** Fully Implemented

**Required Work:** None.

**Status Transition:** Terminal — no exit from completed. If target_amount is increased, the next calculation would re-evaluate.

---

## Status: `on_track`

**Trigger Logic:** `NOT completed AND NOT overdue AND current >= expected`

**Browser Location:** `services.py`, `goal_timeline()`, line 616

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — after overdue check, `current >= expected` condition.

**Current Status:** Fully Implemented

**Required Work:** None.

**Special Case:** Goals with no `target_date` always get `on_track` because `expected = 0` (frac=0) and `current >= 0` is always true.

---

## Status: `behind`

**Trigger Logic:** `NOT completed AND NOT overdue AND current < expected`

**Browser Location:** `services.py`, `goal_timeline()`, line 618

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — `else` branch after on_track check.

**Current Status:** Fully Implemented

**Required Work:** None.

---

## Status: `overdue`

**Trigger Logic:** `today >= target_date AND NOT completed`

**Browser Location:** `services.py`, `goal_timeline()`, lines 612–614

**Mobile Location:** `services/finance.ts`, `goalTimeline()` — `targetDate && today >= targetDate` guard before on_track/behind checks.

**Current Status:** Fully Implemented

**Required Work:** None.

**Note:** `overdue` can transition to `completed` if user adds more assets that push `current >= target`. This is correctly modeled in both implementations.

---

## Status: Paused / Cancelled / Overachieved

**Trigger Logic:** Not defined in browser.

**Browser Location:** N/A

**Mobile Location:** N/A

**Current Status:** Missing (not in browser either)

**Required Work:** None unless mobile adds these statuses as enhancements.

---

## Complete Status Transition Diagram

```
Goal Created (no target_date)
    └→ on_track (always, because expected = 0)
           └→ completed (when current >= target)

Goal Created (with target_date, future)
    ├→ on_track (if current >= expected)
    │      ├→ behind (if asset value drops below expected)
    │      └→ completed (if current >= target)
    └→ behind (if current < expected)
           ├→ on_track (if asset value rises to >= expected)
           └→ completed (if current >= target)

Any non-completed status + target_date in past:
    └→ overdue
           └→ completed (if user adds more linked assets pushing current >= target)

completed: TERMINAL (no exit except if target_amount changes)
```

Mobile implementation correctly models all these transitions since status is recalculated on every query.

---

# 9. Missing Components Inventory

## MC01 — GoalRingCard (Radial Ring Card)

**Component:** `GoalRingCard`

**Browser File:** `templates/goals/list.html` (Focus view section, lines 74–107)

**Recommended Mobile File:** `src/components/goals/GoalRingCard.tsx`

**Dependencies:** `react-native-svg` (for SVG arc), `MilestoneDots`, `GoalStatusBadge`, `GoalTypeIcon`, `utils/money.ts`, `utils/goalCalculations.ts`

**Priority:** High

**Complexity:** High — requires SVG arc math and custom layout.

---

## MC02 — MilestoneDots

**Component:** `MilestoneDots`

**Browser File:** `templates/goals/list.html` (lines 92–96, `.milestones` > `.ms-dot`)

**Recommended Mobile File:** `src/components/goals/MilestoneDots.tsx`

**Dependencies:** React Native `View`, `StyleSheet`

**Priority:** Medium (required by GoalRingCard)

**Complexity:** Low — 4 `<View>` circles with conditional fill.

---

## MC03 — GoalTypeIcon

**Component:** `GoalTypeIcon`

**Browser File:** `<img class="goal-ico-img" src="/static/img/logo-goals/{type}.png">` throughout `list.html`

**Recommended Mobile File:** `src/components/goals/GoalTypeIcon.tsx`

**Dependencies:** Bundled PNG assets in `src/assets/img/logo-goals/` (7 files + custom fallback), React Native `Image`

**Priority:** Medium

**Complexity:** Low — `Record<string, ImageRequireSource>` lookup with fallback.

---

## MC04 — GoalTimeline

**Component:** `GoalTimeline`

**Browser File:** `templates/goals/list.html` (lines 109–128, `.timeline`)

**Recommended Mobile File:** `src/components/goals/GoalTimeline.tsx`

**Dependencies:** React Native `FlatList`, `View`, `Text`, `GoalTypeIcon`

**Priority:** Medium

**Complexity:** Medium — vertical timeline layout with connector lines, colored dots, sorted goals.

---

## MC05 — GoalSummaryProgressBar

**Component:** Overall portfolio progress bar in summary section

**Browser File:** `.summary-bar` `.bar` element in `list.html:31`

**Recommended Mobile File:** Add inline to `GoalsScreen.tsx` summary section (no separate component needed)

**Dependencies:** `ProgressBar` from `components/ui.tsx`

**Priority:** Low

**Complexity:** Low — one `ProgressBar` with `value={progress.overall_pct}`.

---

## MC06 — GoalDetailScreen

**Component:** `GoalDetailScreen`

**Browser File:** N/A (browser shows all info inline in cards)

**Recommended Mobile File:** `src/screens/goals/GoalDetailScreen.tsx`

**Dependencies:** `db/index.ts` (`all` for linked assets), `utils/money.ts`, `components/ui.tsx`

**Priority:** Medium

**Complexity:** Medium — DB query for linked assets, navigation parameter handling.

---

## MC07 — EditGoalScreen / EditGoalModal

**Component:** `EditGoalScreen`

**Browser File:** N/A (browser has no edit)

**Recommended Mobile File:** `src/screens/goals/EditGoalScreen.tsx`

**Dependencies:** `GoalDetailScreen` (reuses form layout), `db/index.ts` (`update`), `AppContext` (`refresh`)

**Priority:** Low

**Complexity:** Medium — pre-populated form, partial updates, asset link management (add/remove).

---

## MC08 — GoalFilterBar

**Component:** Filter chip row + sort dropdown

**Browser File:** N/A

**Recommended Mobile File:** Add inline to `GoalsScreen.tsx` or extract to `src/components/goals/GoalFilterBar.tsx`

**Dependencies:** `goalsStore.ts` (filter/sort state), react-native-paper `Chip`, `Menu`

**Priority:** Low

**Complexity:** Low.

---

## MC09 — ScoreColor Utility

**Component:** `scoreColor(pct)` pure function

**Browser File:** `templates/partials/_bars.html`, `score_color()` macro

**Recommended Mobile File:** Add to `src/utils/money.ts` or new `src/utils/goalCalculations.ts`

**Dependencies:** None

**Priority:** Medium

**Complexity:** Trivial — 3-line function.

---

## MC10 — GoalRingGoalTypeIconPreview (in Add Modal)

**Component:** Live goal type image preview in Add Goal form

**Browser File:** `templates/goals/list.html:136` — `<img :src="'/static/img/logo-goals/'+gt+'.png'">`

**Recommended Mobile File:** Inline in `GoalsScreen.tsx` Add Goal Dialog (or `AddGoalModal.tsx`)

**Dependencies:** `GoalTypeIcon` (MC03)

**Priority:** Low

**Complexity:** Low — once GoalTypeIcon exists.

---

# 10. Migration Task Breakdown

## T01 — Implement `scoreColor()` Utility

**Task ID:** T01

**Description:** Create a `scoreColor(pct: number): 'good' | 'warn' | 'bad'` function that maps pct thresholds (≥70/≥40/<40) to tone strings, independent of goal status.

**Files to Create:** None (add to existing `src/utils/money.ts`)

**Files to Modify:** `src/utils/money.ts`

**Dependencies:** None

**Complexity:** Trivial

**Classification:** Business Logic

---

## T02 — Bundle Goal Type Image Assets

**Task ID:** T02

**Description:** Add 7 PNG goal type images (retirement.png, education.png, travel.png, emergency.png, home.png, wedding.png, custom.png) to `src/assets/img/logo-goals/`. These are served from `/static/img/logo-goals/` in the browser.

**Files to Create:** `src/assets/img/logo-goals/*.png` (7 files)

**Files to Modify:** None

**Dependencies:** None

**Complexity:** Low (asset acquisition, no code)

**Classification:** Foundation

---

## T03 — Create `GoalTypeIcon` Component

**Task ID:** T03

**Description:** Component that maps `goal_type` string to a bundled PNG image with `custom.png` fallback on error. Use React Native `Image` with `onError` fallback.

**Files to Create:** `src/components/goals/GoalTypeIcon.tsx`

**Files to Modify:** None

**Dependencies:** T02

**Complexity:** Low

**Classification:** UI

---

## T04 — Create `MilestoneDots` Component

**Task ID:** T04

**Description:** Row of 4 circular `<View>` components at 25%, 50%, 75%, 100% milestones. Each is filled/colored when `pct >= milestone`. Uses theme colors.

**Files to Create:** `src/components/goals/MilestoneDots.tsx`

**Files to Modify:** None

**Dependencies:** None

**Complexity:** Low

**Classification:** UI

---

## T05 — Create `GoalRingCard` Component (Focus View)

**Task ID:** T05

**Description:** Radial ring card using `react-native-svg`. SVG arc with `strokeDashoffset` for progress fill. Center label with pct%. Below ring: goal name, icon, current/target text, MilestoneDots, meta grid with target date and projection. Install `react-native-svg` if not present.

**Files to Create:** `src/components/goals/GoalRingCard.tsx`

**Files to Modify:** `package.json` (add `react-native-svg` if not installed)

**Dependencies:** T03, T04, T01

**Complexity:** High

**Classification:** UI

---

## T06 — Create `GoalTimeline` Component

**Task ID:** T06

**Description:** Vertical `FlatList` of timeline nodes, each showing a colored dot (using `goal.color_hex`), `GoalTypeIcon`, goal name, target date, and progress %. Data is filtered to goals with `target_date` and sorted ascending by `target_date`. Connector lines between nodes.

**Files to Create:** `src/components/goals/GoalTimeline.tsx`

**Files to Modify:** None

**Dependencies:** T03

**Complexity:** Medium

**Classification:** UI

---

## T07 — Add View Toggle (Cards / Focus)

**Task ID:** T07

**Description:** Add a segmented control or tab-style toggle in `GoalsScreen` header to switch between cards and focus view. Store selection in `goalsStore.ts` (Zustand). Conditionally render list of `GoalCard` or list of `GoalRingCard`.

**Files to Create:** `src/stores/goalsStore.ts`

**Files to Modify:** `GoalsScreen.tsx`

**Dependencies:** T05, T08

**Complexity:** Medium

**Classification:** State Management + UI

---

## T08 — Create Zustand Goals Store

**Task ID:** T08

**Description:** Create `goalsStore.ts` with Zustand and `persist` middleware. Fields: `view`, `filterStatus`, `sortBy`, `searchQuery`. Persist to AsyncStorage under key `'goals-ui'`.

**Files to Create:** `src/stores/goalsStore.ts`

**Files to Modify:** None

**Dependencies:** None (ensure `zustand` is in `package.json`)

**Complexity:** Low

**Classification:** State Management

---

## T09 — Add Overall Progress Bar to Summary Section

**Task ID:** T09

**Description:** Below the 2 existing KPIs in `GoalsScreen`, add a full-width `ProgressBar` component with `value={progress.overall_pct}` and a label "Overall Portfolio Progress ({progress.overall_pct}%)".

**Files to Create:** None

**Files to Modify:** `GoalsScreen.tsx`

**Dependencies:** None

**Complexity:** Low

**Classification:** UI

---

## T10 — Add Goal Timeline Section to GoalsScreen

**Task ID:** T10

**Description:** Below the goal cards list in `GoalsScreen`, add conditional render of `GoalTimeline` when any goal has a `target_date`. Filter `progress.goals` to those with `target_date`, sort ascending, pass to `GoalTimeline`.

**Files to Create:** None

**Files to Modify:** `GoalsScreen.tsx`

**Dependencies:** T06

**Complexity:** Low

**Classification:** UI

---

## T11 — Add Goal Type Icon to Goal Cards

**Task ID:** T11

**Description:** In `GoalsScreen` goal card render, add `GoalTypeIcon` component alongside goal name in the card header.

**Files to Create:** None

**Files to Modify:** `GoalsScreen.tsx`

**Dependencies:** T03

**Complexity:** Low

**Classification:** UI

---

## T12 — Apply `scoreColor()` to Progress Bars

**Task ID:** T12

**Description:** Replace status-tone-based color on `ProgressBar` with direct `scoreColor(pct)` result. This ensures a 15%-progress goal with "on_track" status (no target date) shows red bar instead of green.

**Files to Create:** None

**Files to Modify:** `GoalsScreen.tsx`, `src/utils/money.ts` (add `scoreColor`)

**Dependencies:** T01

**Complexity:** Low

**Classification:** Business Logic

---

## T13 — Create `GoalDetailScreen`

**Task ID:** T13

**Description:** New screen showing all `FinancialGoal` fields + list of linked assets with individual current values and allocation_pct. Triggered by tapping a goal card. Add `Stack.Screen` push navigation.

**Files to Create:** `src/screens/goals/GoalDetailScreen.tsx`, `src/app/goals/[id].tsx` (Expo Router)

**Files to Modify:** `GoalsScreen.tsx` (add onPress to cards), `src/app/goals/_layout.tsx` (if needed)

**Dependencies:** None

**Complexity:** Medium

**Classification:** UI + Foundation

---

## T14 — Add Search / Filter / Sort to GoalsScreen

**Task ID:** T14

**Description:** Add search `TextInput` in screen header. Add filter chips (All/On Track/Behind/Overdue/Completed). Add sort menu (Target Date/Progress/Name). Apply client-side filtering and sorting to `progress.goals` before rendering.

**Files to Create:** None

**Files to Modify:** `GoalsScreen.tsx`, `src/stores/goalsStore.ts`

**Dependencies:** T08

**Complexity:** Medium

**Classification:** UI + State Management

---

## T15 — Add Goal Type Icon Preview to Add Goal Form

**Task ID:** T15

**Description:** In the Add Goal Dialog, show a `GoalTypeIcon` that updates reactively when the user selects a different goal type from the Menu.

**Files to Create:** None

**Files to Modify:** `GoalsScreen.tsx`

**Dependencies:** T03

**Complexity:** Low

**Classification:** UI

---

## T16 — Create Edit Goal Screen

**Task ID:** T16

**Description:** New screen or modal with pre-populated goal form (name, type, target, monthly, target_date). Add/remove linked assets. Save via `update('financial_goals', id, {...})`. Add delete + re-add of `goal_asset_links`.

**Files to Create:** `src/screens/goals/EditGoalScreen.tsx`, `src/app/goals/[id]/edit.tsx`

**Files to Modify:** `GoalDetailScreen.tsx` (add Edit button), `db/schema.ts` (no changes), `db/index.ts` (no changes — `update()` and `remove()` already exist)

**Dependencies:** T13

**Complexity:** Medium

**Classification:** UI + Business Logic

---

## T17 — Improve Error Handling

**Task ID:** T17

**Description:** Replace `useData(() => goalsProgress(userId))` with `useDataSafe(() => goalsProgress(userId))` in `GoalsScreen`. Render error `EmptyState` with retry button when `error` is non-null.

**Files to Create:** None

**Files to Modify:** `GoalsScreen.tsx`

**Dependencies:** None

**Complexity:** Low

**Classification:** Business Logic

---

# 11. Dependency Graph

```
T02 (Bundle Goal Type Images)
↓
T03 (GoalTypeIcon Component)
↓                    ↓
T04 (MilestoneDots)  T11 (Add Icon to Cards)   T15 (Icon Preview in Form)
↓
T01 (scoreColor Utility)
↓
T05 (GoalRingCard — Radial Ring)
↓
T08 (Zustand Goals Store)
↓
T07 (View Toggle: Cards / Focus)

T06 (GoalTimeline) ← depends on T03
↓
T10 (Timeline Section in GoalsScreen)

T09 (Overall Progress Bar) — independent
T12 (scoreColor on ProgressBars) ← depends on T01
T13 (GoalDetailScreen) — independent
↓
T16 (EditGoalScreen)

T14 (Search/Filter/Sort) ← depends on T08
T17 (Error Handling) — independent
```

**Why this order is required:**

1. **T02 before T03** — GoalTypeIcon cannot render without the PNG assets.
2. **T03 before T04, T11, T15** — GoalTypeIcon is a dependency of MilestoneDots context (Focus view), card icon, and form preview.
3. **T01 before T05, T12** — scoreColor utility needed by GoalRingCard (ring color) and updated progress bars.
4. **T04 before T05** — MilestoneDots are a sub-component of GoalRingCard.
5. **T05 before T07** — View toggle requires the Focus view (GoalRingCard) to exist before the toggle makes sense.
6. **T08 before T07, T14** — Zustand store must exist before view toggle state and filter state are wired up.
7. **T06 before T10** — Timeline component must exist before it's embedded in GoalsScreen.
8. **T13 before T16** — Edit screen is accessible from Goal Detail screen.

---

# 12. Migration Roadmap

## Phase 1 — Foundation

**Objectives:** Ensure all shared utilities and assets are in place before building any components.

**Tasks:** T01, T02

**Files Impacted:**
- `src/utils/money.ts` (add `scoreColor`)
- `src/assets/img/logo-goals/*.png` (7 image files added)

**Dependencies:** None

**Expected Outcomes:** `scoreColor()` function available; goal type PNG images bundled. All subsequent component tasks can proceed.

---

## Phase 2 — Core Missing Components

**Objectives:** Build the three missing atomic components: GoalTypeIcon, MilestoneDots, GoalTimeline.

**Tasks:** T03, T04, T06

**Files Impacted:**
- `src/components/goals/GoalTypeIcon.tsx` (new)
- `src/components/goals/MilestoneDots.tsx` (new)
- `src/components/goals/GoalTimeline.tsx` (new)

**Dependencies:** Phase 1 complete

**Expected Outcomes:** GoalTypeIcon renders correct PNG with fallback. MilestoneDots renders 4 dots with fill state. GoalTimeline renders vertical chronological list.

---

## Phase 3 — State Management

**Objectives:** Create Zustand store for persistent UI preferences.

**Tasks:** T08

**Files Impacted:**
- `src/stores/goalsStore.ts` (new)

**Dependencies:** Zustand installed in `package.json`

**Expected Outcomes:** View preference, filter state, and sort order persist across app restarts via AsyncStorage.

---

## Phase 4 — Focus View and View Toggle

**Objectives:** Build the radial ring card and wire up the cards/focus view toggle.

**Tasks:** T05, T07

**Files Impacted:**
- `src/components/goals/GoalRingCard.tsx` (new)
- `GoalsScreen.tsx` (modified — add toggle UI, conditional list rendering)
- `package.json` (add `react-native-svg` if not present)

**Dependencies:** Phase 1, 2, 3 complete

**Expected Outcomes:** Users can switch between Cards view (current) and Focus view (radial ring cards in 2-column layout). View preference persists.

---

## Phase 5 — UI Completions in GoalsScreen

**Objectives:** Fill remaining UI gaps in the existing GoalsScreen without adding new screens.

**Tasks:** T09, T10, T11, T12, T15, T17

**Files Impacted:**
- `GoalsScreen.tsx` (modified — overall progress bar, timeline section, icon in cards, scoreColor, icon preview in form, error handling)

**Dependencies:** Phase 1, 2 complete

**Expected Outcomes:** Summary bar shows all 4 browser metrics. Goal cards show type icons. Timeline section appears below cards. Progress bars use correct pct-based colors. Add form shows reactive icon preview. Errors are surfaced to the user.

---

## Phase 6 — Navigation and Detail Screens

**Objectives:** Add Goal Detail Screen and Edit Goal Screen with proper Expo Router navigation.

**Tasks:** T13, T16

**Files Impacted:**
- `src/screens/goals/GoalDetailScreen.tsx` (new)
- `src/screens/goals/EditGoalScreen.tsx` (new)
- `src/app/goals/[id].tsx` (new Expo Router dynamic route)
- `src/app/goals/[id]/edit.tsx` (new Expo Router route)
- `src/app/goals/_layout.tsx` (new — Stack layout for goals sub-routes)
- `GoalsScreen.tsx` (add `onPress` navigation to card)

**Dependencies:** Expo Router Stack navigator setup

**Expected Outcomes:** Tapping a goal card navigates to GoalDetailScreen. Detail screen has Edit button. Edit screen allows modifying all goal fields and linked assets.

---

## Phase 7 — Search, Filter, Sort

**Objectives:** Add client-side search, status filter chips, and sort controls.

**Tasks:** T14

**Files Impacted:**
- `GoalsScreen.tsx` (modified)
- `src/stores/goalsStore.ts` (modified — add searchQuery, filterStatus, sortBy)

**Dependencies:** Phase 3 complete

**Expected Outcomes:** Users can search goals by name, filter by status, and sort by target date / progress / name.

---

## Phase 8 — Testing

**Objectives:** Unit and integration tests for all calculation logic and key components.

**Files to Create:**
- `src/utils/__tests__/money.test.ts` — tests for `scoreColor`, `formatINR`, `rupeesToPaise`
- `src/services/__tests__/finance.test.ts` — tests for `goalTimeline` (all 8 edge cases), `goalsProgress`
- `src/components/goals/__tests__/GoalRingCard.test.tsx`
- `src/components/goals/__tests__/MilestoneDots.test.tsx`
- `src/screens/__tests__/GoalsScreen.test.tsx`

**Dependencies:** All phases complete

**Expected Outcomes:** 100% coverage of `goalTimeline()` edge cases. Regression tests for score color thresholds. Component render tests.

---

# 13. Final Goals Completion Checklist

```
[x] Goal Dashboard
[~] Goal Summary Cards (4 stats — 3/4 implemented; Overall Progress Bar missing)
[x] Goal Cards
[x] Goal Status Badge
[x] Goal Progress Bar (linear)
[ ] Goal Type Icons (PNG images — not bundled)
[ ] Goal Detail Screen
[ ] Goal Focus View (Radial Ring)
[ ] Milestone Dots (25/50/75/100%)
[ ] Goal Timeline (visual chronological)
[ ] View Toggle (Cards / Focus)
[x] Goal Creation
[ ] Goal Editing
[x] Goal Deletion
[x] Goal Progress Tracking (Calculations)
  [x] current = Σ(asset.current_value × allocation_pct / 100)
  [x] pct = current / target × 100 (capped at 100 for display)
  [x] expected = frac × target (linear interpolation)
  [x] required_monthly = remaining / remaining_months (30.44 days/month)
  [ ] focus_months = ceil(remaining / monthly_needed) [no Focus view yet]
[x] Forecasting Engine (goalTimeline)
  [x] status: completed / on_track / behind / overdue
  [x] expected, expected_pct, required_monthly
  [x] Edge: no target_date → on_track
  [x] Edge: start == target_date → frac = 1.0
  [x] Edge: today before start → frac = 0
  [x] Edge: today after target_date → frac = 1.0 (overdue)
[x] Goal Status Logic
  [x] GOAL_STATUS_META constants (label, icon, tone)
  [~] Score color thresholds (currently via status tone, not direct pct — partial)
  [x] On-track boolean per goal
  [x] Global on_track count + overall_pct
[x] Goal Analytics (aggregate data computed)
[~] Goal Analytics (UI — overall_pct progress bar missing)
[x] Goal Chart (GroupedBars — Achieved vs Target)
[ ] Goal Chart: Full goal names as labels (currently first word only)
[ ] Goal Chart: Browser-matching target color (#C2E033 vs current teal)
[ ] Goal Filters (by status, by type)
[ ] Goal Search (by name)
[ ] Goal Sorting (by target date, progress %, name)
[ ] Goal Type Icon Preview in Add Form
[~] Error Handling (basic only — DB errors not caught in goals)
[ ] Loading States (skeletons)
[ ] Offline Handling (N/A for local SQLite, but no stale indicator)
[ ] State Persistence (view preference, filters — no Zustand store)
[ ] Goal Notifications
[ ] Goal Detail: Linked assets breakdown
[ ] Goal Detail: Priority field visible
[ ] Goal Detail: Notes field visible
[ ] Goal Detail: Creation date visible
[x] INR Formatting (formatINR, rupeesToPaise, paiseToRupees)
[x] Empty State
[x] Delete Confirmation Dialog
[x] Dashboard Widget (Goals section in DashboardScreen)
[ ] Zustand Goals Store (view, filter, sort persistence)
[ ] GoalTypeIcon component
[ ] GoalRingCard component
[ ] MilestoneDots component
[ ] GoalTimeline component
[ ] GoalDetailScreen
[ ] EditGoalScreen
```

---

# 14. Migration Risk Assessment

## R01 — Goal Type PNG Images Not Bundled

**Risk:** The browser serves goal type icons from `/static/img/logo-goals/`. These files do not exist in the mobile project. Any component attempting to `require('@/assets/img/logo-goals/retirement.png')` will crash at build time.

**Severity:** High (build crash if images missing when GoalTypeIcon is added)

**Mitigation:** Acquire PNG files before implementing T03. Create `custom.png` as the fallback. Do not add `GoalTypeIcon` to the project until assets exist.

---

## R02 — `react-native-svg` Dependency

**Risk:** `GoalRingCard` requires `react-native-svg`. If not in `package.json`, install requires a new native build (can't update via EAS Update alone).

**Severity:** Medium

**Mitigation:** Check `package.json` before implementing T05. Run `npx expo install react-native-svg` early in Phase 1 to ensure it's included in the next native build.

---

## R03 — Score Color vs. Status Tone Behavioral Difference

**Risk:** Browser's `score_color()` colors progress bars by raw percentage (≥70/≥40/<40). Mobile colors by status tone (good/warn/bad). A goal at 5% progress with no target_date gets status `on_track` (green tone) and shows a GREEN bar — the browser would show RED (5% < 40%).

**Severity:** Medium (visual inconsistency; not a data error)

**Mitigation:** Implement T01 (`scoreColor()`) and T12 (apply to progress bars) before shipping.

---

## R04 — 100% Default Allocation Across Multiple Goals

**Risk:** If the same asset is linked to two goals with 100% allocation, its full current value is counted in BOTH goals. Total `total_current` across all goals will exceed actual portfolio value.

**Browser Behavior:** Same issue exists in browser. No UI to set allocation_pct.

**Mobile Behavior:** Same issue exists. No validation prevents double-linking.

**Severity:** Medium (data integrity, can mislead users)

**Mitigation:** Add a warning in the `GoalDetailScreen` when the same asset is linked to multiple goals. Long-term: add allocation_pct picker in the form.

---

## R05 — `created_at` UTC vs. IST for Expected Calculation

**Risk:** `goalTimeline()` uses `goal.created_at` (stored as UTC ISO datetime) as the start date for linear interpolation. `_parse_iso_date()` in browser takes `value[:10]` which gives the UTC date. For Indian users (UTC+5:30), a goal created after 6:30 PM IST would have a UTC date that is 1 day earlier than the user's local date.

**Mobile Behavior:** Same risk. `goalTimeline()` parses `created_at` and uses the date portion.

**Severity:** Low (1-day off at most; IST is UTC+5:30 and the browser analysis flags this as low-risk for an INR app)

**Mitigation:** None required for INR-only app. Note in code: parse `created_at` date in IST if cross-timezone support is added.

---

## R06 — No Goal Editing (Data Accumulation)

**Risk:** Users cannot edit goal names, types, or target amounts. If they set an incorrect target amount, they must delete and re-create the goal, losing goal creation date history (which affects `expected_pct` calculation from day 1).

**Mobile Behavior:** Same as browser — no edit.

**Severity:** Medium (UX friction)

**Mitigation:** Implement T16 (EditGoalScreen). Priority: Low for v1.

---

## R07 — Synchronous SQLite in Main Thread

**Risk:** `goalsProgress(userId)` runs synchronously and queries multiple tables with joins. For a user with many goals and many linked assets, this could cause a brief JS thread stall on focus.

**Severity:** Low (SQLite is typically fast enough for personal finance data volumes; demo seeds 4 goals)

**Mitigation:** No immediate action. Monitor with Expo performance tooling if user reports slowness. Future: move to `expo-sqlite`'s async API.

---

## R08 — Linear Savings Pace Assumption

**Risk:** `goalTimeline()` assumes linear accumulation. Market-linked assets (mutual funds, stocks) fluctuate. A market dip could make a well-funded goal appear "behind schedule" despite consistent contributions. A rally could mask a contribution gap.

**Browser Behavior:** Same assumption.

**Severity:** Low (by design; the browser analysis documents this explicitly)

**Mitigation:** Add tooltip/info text in `GoalDetailScreen` explaining that status is based on current asset values vs. expected linear pace, not on actual contribution history.

---

## R09 — No Notification Infrastructure for Goals

**Risk:** The browser has no goal notifications either. However, mobile users expect push notifications for "behind schedule" alerts. The `expo-notifications` API exists but no notification infrastructure is wired for goals.

**Severity:** Low (not a regression; a new capability)

**Mitigation:** Future enhancement. Requires background task scheduler + `expo-notifications` + user permission flow.

---

## R10 — Date Input Format in Add Goal Form

**Risk:** The `target_date` field in the mobile Add Goal Dialog is a plain `TextInput` requiring `YYYY-MM-DD` format. The browser uses an `<input type="date">` with a native date picker. Mobile users may enter invalid dates or wrong format.

**Mobile Behavior:** `isValidISODate()` validation exists but only triggers on form submit.

**Severity:** Medium (UX friction, potential invalid date submission)

**Mitigation:** Replace `TextInput` with `@react-native-community/datetimepicker` (or Expo's equivalent) for native date picking. Validate format on blur.

---

# 15. Final Implementation Blueprint

An engineer can implement the complete Goals feature migration using only this document and the existing mobile codebase, without access to the browser source code.

---

## Recommended Component Structure

```
src/
├── screens/
│   └── goals/
│       ├── GoalsDashboardScreen.tsx     [RENAME GoalsScreen.tsx]
│       ├── GoalDetailScreen.tsx         [NEW — T13]
│       ├── AddGoalScreen.tsx            [OPTIONAL EXTRACT from GoalsScreen]
│       └── EditGoalScreen.tsx           [NEW — T16]
│
├── components/
│   └── goals/
│       ├── GoalTypeIcon.tsx             [NEW — T03]
│       ├── MilestoneDots.tsx            [NEW — T04]
│       ├── GoalRingCard.tsx             [NEW — T05]
│       └── GoalTimeline.tsx             [NEW — T06]
│
├── stores/
│   └── goalsStore.ts                    [NEW — T08]
│
├── assets/
│   └── img/
│       └── logo-goals/
│           ├── retirement.png           [NEW — T02]
│           ├── education.png            [NEW — T02]
│           ├── travel.png               [NEW — T02]
│           ├── emergency.png            [NEW — T02]
│           ├── home.png                 [NEW — T02]
│           ├── wedding.png              [NEW — T02]
│           └── custom.png              [NEW — T02, fallback]
│
└── utils/
    └── money.ts                         [MODIFY — add scoreColor — T01]
```

---

## Recommended Hooks

The current `useData(() => goalsProgress(userId))` pattern is sufficient for local SQLite. No new hooks are required for the goals feature as long as the architecture stays local-first. If a REST API is added:

```typescript
// src/hooks/goals/useGoals.ts
export function useGoals() {
  return useQuery({ queryKey: ['goals'], queryFn: fetchGoals, staleTime: 300_000 });
}

// src/hooks/goals/useCreateGoal.ts
export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createGoal, onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }) });
}

// src/hooks/goals/useDeleteGoal.ts  (with optimistic update)
export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteGoal,
    onMutate: async (goalId) => {
      await qc.cancelQueries({ queryKey: ['goals'] });
      const prev = qc.getQueryData(['goals']);
      qc.setQueryData(['goals'], (old: GoalsProgress) => ({
        ...old, goals: old.goals.filter(g => g.id !== goalId)
      }));
      return { prev };
    },
    onError: (_, __, ctx) => { if (ctx?.prev) qc.setQueryData(['goals'], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}
```

---

## API Layer Design

The current mobile app uses local SQLite directly — no REST API layer exists or is needed for the local-first architecture. All operations are in `GoalsScreen.tsx` directly calling `db/index.ts` primitives.

If a REST API is later added, the endpoint contract should match:

```
GET    /api/v1/goals
       Response: GoalsProgress { goals: GoalItem[], total_target, total_current, count, on_track, overall_pct }

POST   /api/v1/goals
       Body: { name, goal_type, target_amount (rupees), monthly_needed (rupees), target_date?, priority, linked_asset_ids[] }
       Response: GoalItem (the created goal with all computed fields)

DELETE /api/v1/goals/:id
       Response: 204 No Content

PATCH  /api/v1/goals/:id                     [NEW — not in browser]
       Body: Partial<CreateGoalPayload> + { linked_asset_ids_add[], linked_asset_ids_remove[] }
       Response: GoalItem (updated)
```

---

## Goal Calculation Engine Design

All calculation logic is already implemented in `src/services/finance.ts`. The engine is a pure TypeScript port of the Python `goal_timeline()` and `goals_progress()` functions.

**Key invariants:**
- All money is integer paise throughout the calculation layer.
- `pct` is capped at 100 for display but the raw ratio can exceed 1.0.
- `required_monthly` is 0 when goal is completed.
- `expected` is 0 when no `target_date` or no `created_at`.
- 30.44 days/month is the constant for monthly calculations.
- `required_monthly = remaining_amount` (full shortfall) when `target_date <= today`.

**Add `scoreColor()` to `src/utils/money.ts`:**
```typescript
export function scoreColor(pct: number): 'good' | 'warn' | 'bad' {
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'warn';
  return 'bad';
}
```

**Add Focus View Projection to components (not service layer):**
```typescript
// In GoalRingCard.tsx
const remaining = Math.max(goal.target - goal.current, 0);
const focusMonths = goal.monthly_needed > 0 ? Math.ceil(remaining / goal.monthly_needed) : 0;
const projectionText = goal.pct >= 100 ? 'Achieved 🎉' : focusMonths > 0 ? `~${focusMonths} mo` : 'Set monthly';
```

---

## Goal Status Engine Design

All status logic is already implemented in `goalTimeline()`. No changes needed to the status engine.

**Status priority (highest to lowest):**
1. `completed` — checked first (current >= target AND target > 0)
2. `overdue` — checked second (today >= target_date AND not completed)
3. `on_track` — checked third (current >= expected AND not overdue AND not completed)
4. `behind` — fallback (none of the above)

**GOAL_STATUS_META mapping (already in `services/finance.ts`):**
```typescript
completed: { label: 'Completed',       icon: 'check-circle',   tone: 'good' }
on_track:  { label: 'On Track',        icon: 'circle-slice-8', tone: 'good' }
behind:    { label: 'Behind Schedule', icon: 'alert',          tone: 'warn' }
overdue:   { label: 'Overdue',         icon: 'alert-circle',   tone: 'bad'  }
```

---

## Forecasting Engine Design

The forecasting engine is already implemented. The only missing piece is the Focus View Projection (C9), which is a presentation-layer calculation:

```
remaining = max(goal.target - goal.current, 0)   [paise]
focusMonths = ceil(remaining / goal.monthly_needed) if goal.monthly_needed > 0 else 0
```

This is different from `required_monthly` (which uses calendar time to derive months). `focusMonths` uses the user-entered `monthly_needed` as the pace assumption. Both are complementary:
- `required_monthly` answers: "How much do I NEED to save monthly to finish on time?"
- `focusMonths` answers: "At my PLANNED monthly rate, how many months until completion?"

---

## State Management Design

**Two-layer approach:**

**Layer 1 — Server/DB State** (current architecture, no change needed):
- `useData(() => goalsProgress(userId))` — synchronous SQLite, re-runs on `refreshKey` change.
- Mutations (`saveGoal`, `doDelete`) call `refresh()` in AppContext to trigger re-query.

**Layer 2 — UI Preference State** (new, requires T08):
```typescript
// src/stores/goalsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type GoalView = 'cards' | 'focus';
type GoalFilter = 'all' | 'completed' | 'on_track' | 'behind' | 'overdue';
type GoalSort = 'target_date' | 'pct' | 'name';

interface GoalsStore {
  view: GoalView;
  filterStatus: GoalFilter;
  sortBy: GoalSort;
  searchQuery: string;
  setView(v: GoalView): void;
  setFilterStatus(f: GoalFilter): void;
  setSortBy(s: GoalSort): void;
  setSearchQuery(q: string): void;
}

export const useGoalsStore = create<GoalsStore>()(
  persist(
    (set) => ({
      view: 'cards',
      filterStatus: 'all',
      sortBy: 'target_date',
      searchQuery: '',
      setView: (view) => set({ view }),
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    { name: 'goals-ui', storage: createJSONStorage(() => AsyncStorage) }
  )
);
```

**Derived state (computed in GoalsScreen from `progress.goals` + `goalsStore`):**
```typescript
const filteredGoals = useMemo(() => {
  let goals = progress?.goals ?? [];
  if (filterStatus !== 'all') goals = goals.filter(g => g.status === filterStatus);
  if (searchQuery.trim()) goals = goals.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()));
  return [...goals].sort((a, b) => {
    if (sortBy === 'target_date') return (a.target_date ?? '9999') < (b.target_date ?? '9999') ? -1 : 1;
    if (sortBy === 'pct') return b.pct - a.pct;
    return a.name.localeCompare(b.name);
  });
}, [progress, filterStatus, searchQuery, sortBy]);
```

---

## Navigation Integration

**Current structure:**
```
DrawerNavigator
└── goals → GoalsScreen (single screen)
```

**Required structure after T13, T16:**
```
DrawerNavigator
└── goals (Stack) → src/app/goals/_layout.tsx
    ├── index → GoalsDashboardScreen (src/app/goals/index.tsx)
    ├── [id] → GoalDetailScreen (src/app/goals/[id].tsx)
    └── [id]/edit → EditGoalScreen (src/app/goals/[id]/edit.tsx)
```

**Files to create for navigation:**
- `src/app/goals/_layout.tsx` — Stack navigator wrapping goal sub-screens
- `src/app/goals/index.tsx` — re-export GoalsDashboardScreen
- `src/app/goals/[id].tsx` — re-export GoalDetailScreen
- `src/app/goals/[id]/edit.tsx` — re-export EditGoalScreen

**Remove:** `src/app/goals.tsx` (replaced by directory-based routing)

**Navigation call from GoalCard tap:**
```typescript
// In GoalsDashboardScreen.tsx
import { router } from 'expo-router';
// In card onPress:
router.push(`/goals/${goal.id}`);
```

---

## Testing Strategy

### Unit Tests

**File:** `src/utils/__tests__/money.test.ts`

Test cases for `scoreColor`:
- `scoreColor(100)` → `'good'`
- `scoreColor(70)` → `'good'`
- `scoreColor(69.9)` → `'warn'`
- `scoreColor(40)` → `'warn'`
- `scoreColor(39.9)` → `'bad'`
- `scoreColor(0)` → `'bad'`

Test cases for `formatINR`:
- `formatINR(5000000)` → `'₹50,000.00'` (₹50,000)
- `formatINR(123456789)` → `'₹1,23,456.89'`
- `formatINR(0)` → `'₹0.00'`
- `formatINR(100)` → `'₹1.00'`

**File:** `src/services/__tests__/finance.test.ts`

Test cases for `goalTimeline` (all 8 edge cases):
1. **Completed:** `current >= target AND target > 0` → `status: 'completed'`, `required_monthly: 0`
2. **No target_date:** `frac = 0`, `expected = 0`, `current >= 0` → `status: 'on_track'`
3. **Start == target_date:** `total_days = 0`, `frac = 1.0` → expected = target, `status: 'behind'` if current < target
4. **Today before start:** `elapsed = 0`, `frac = 0` → `expected = 0`, `status: 'on_track'`
5. **Overdue:** `today >= target_date AND NOT completed` → `status: 'overdue'`
6. **Behind:** `current < expected AND NOT overdue` → `status: 'behind'`
7. **Required_monthly when target_date > today:** `round(remaining / remaining_months)` with 30.44/day
8. **Required_monthly when target_date <= today:** `required_monthly = remaining_amount` (full shortfall)

### Integration Tests

**File:** `src/services/__tests__/goalsProgress.test.ts`

- Mock SQLite `all()` and `first()` to return test data.
- Verify `goalsProgress()` returns correct `total_target`, `total_current`, `overall_pct`, `on_track` count.
- Verify linked asset current values are summed correctly with allocation_pct.
- Verify status distribution across a mixed set of goals.

### UI Tests (React Native Testing Library)

**File:** `src/screens/__tests__/GoalsScreen.test.tsx`

- Renders summary KPIs with correct values from mock `goalsProgress()`.
- Renders goal card with name, status badge, progress bar.
- Shows "Save ~X/mo" when status is not "completed".
- Does NOT show "Save ~X/mo" when status is "completed".
- Tapping delete button shows confirmation dialog.
- Confirming delete calls `remove()` and `refresh()`.
- Shows EmptyState when `progress.goals` is empty.

**File:** `src/components/goals/__tests__/GoalRingCard.test.tsx`

- Renders SVG circle with correct stroke-dashoffset for given pct.
- Shows "Achieved 🎉" when pct >= 100.
- Shows "~{months} mo" when monthly_needed > 0.
- Shows "Set monthly" when monthly_needed === 0.
- MilestoneDots receive correct `hit` state at 25/50/75/100%.

### State Tests

**File:** `src/stores/__tests__/goalsStore.test.ts`

- `setView('focus')` updates `view` to `'focus'`.
- `setFilterStatus('behind')` updates `filterStatus`.
- Store persists to AsyncStorage (mock AsyncStorage in tests).

### Goal Status Tests

**File:** `src/services/__tests__/goalStatus.test.ts`

Priority order tests:
- Goal with `current >= target` → `completed` (even if today > target_date)
- Goal with `today >= target_date` and `current < target` → `overdue`
- Goal with `current >= expected` and future target_date → `on_track`
- Goal with `current < expected` and future target_date → `behind`
- Goal with no target_date → `on_track`

Status transition tests (state machine):
- `on_track` → `behind` when expected increases past current
- `behind` → `on_track` when asset value rises
- `on_track` → `overdue` when target_date passes
- `overdue` → `completed` when current reaches target

### Forecasting Tests

**File:** `src/services/__tests__/forecasting.test.ts`

- `required_monthly` uses 30.44 days/month (not 30 or 31)
- `required_monthly >= 1` (minimum 1 month guard)
- `focusMonths = ceil(remaining / monthly_needed)` (ceiling, not floor)
- `focusMonths = 0` when `monthly_needed = 0`
- `focusMonths` = 0 when already achieved (`pct >= 100`)

---

# Summary Statistics

| Metric | Count |
|---|---|
| **Total browser features discovered** | 30 |
| **Total mobile features fully implemented** | 17 |
| **Total features partially implemented** | 5 |
| **Total features missing** | 8 |
| **Total internal DB operations (APIs) to migrate** | 4 (GET, POST, DELETE implemented; PATCH missing) |
| **Total calculations to migrate** | 9 (all implemented; C9 Focus Projection has no UI surface) |
| **Total forecasting rules to migrate** | 4 edge cases (all implemented in goalTimeline) |
| **Total status rules to migrate** | 5 (completed, on_track, behind, overdue, default — all implemented) |
| **Estimated new files to create** | 12 |
| **Estimated existing files to modify** | 4 |
| **Total migration tasks** | 17 (T01–T17) |

---

*Analysis performed 2026-06-20. Source of truth: `GOALS_FEATURE_ANALYSIS.md`. Mobile codebase analyzed at current HEAD on branch `main`.*
