# GOALS MIGRATION PLAN — FinVault Mobile
## Practical 3-Phase Implementation Plan

> **Context:** This plan is derived from `GOALS_FEATURE_ANALYSIS.md` (browser source of truth) and `GOALS_GAP_ANALYSIS.md` (gap analysis). The mobile app already has a working Goals foundation — calculations, DB schema, goal cards, creation, and deletion are all functional. This plan organizes the remaining work into three independently executable phases.

> **Architecture:** The mobile app is local-first SQLite (Expo SDK 56, React Native, TypeScript, react-native-paper). There is no REST API layer — all DB operations use `src/db/index.ts` primitives directly.

---

# Phase 1 — Core Goals Migration

**Objective:** Close all functional gaps that block a user from fully interacting with their goals. After Phase 1 completes, a user can create, view full details of, edit, and delete goals with correct visual feedback. The feature is shippable.

---

## Features Included

### P1-F01 — `scoreColor()` Utility (Bug Fix)

The browser's `score_color()` macro colors progress bars by raw percentage thresholds (≥70 green / ≥40 orange / <40 red), independent of goal status. The mobile currently colors bars by `status_tone` (derived from `on_track/behind/overdue`). This causes a behavioral mismatch: a goal at 5% progress with no target_date has status `on_track` (green tone) but should show a red bar (<40%).

**What to implement:** Add `scoreColor(pct: number): 'good' | 'warn' | 'bad'` to `src/utils/money.ts`. Apply it directly to the `ProgressBar` `tone` prop in `GoalsScreen.tsx`, replacing the current `g.status_tone`.

---

### P1-F02 — Bundle Goal Type PNG Images

Goal type icons (retirement, education, travel, emergency, home, wedding, custom) are served as static PNGs in the browser. No equivalent assets exist in the mobile project. Without these, `GoalTypeIcon` and the goal type preview in the add form cannot be built.

**What to implement:** Add 7 PNG files to `src/assets/img/logo-goals/`. The `custom.png` file serves as the fallback for unknown types.

---

### P1-F03 — `GoalTypeIcon` Component

Renders the correct PNG image for a given `goal_type` string. Falls back to `custom.png` using React Native `Image`'s `onError` prop. Used in goal cards, focus view, timeline, and add-goal form.

**What to implement:** Create `src/components/goals/GoalTypeIcon.tsx` with a `Record<string, ImageRequireSource>` lookup map.

---

### P1-F04 — Goal Type Icon in Goal Cards

Add `GoalTypeIcon` to the goal card header in `GoalsScreen.tsx` alongside the goal name, matching the browser's `.goal-ico-img` element in each card.

**What to implement:** Modify the card render section in `GoalsScreen.tsx` to include `<GoalTypeIcon type={g.goal_type} size={32} />`.

---

### P1-F05 — Overall Portfolio Progress Bar

The browser's summary bar has 4 metrics: Total Goal Value, Total Achieved, On Track count, and an overall progress bar at `progress.overall_pct`. The mobile only shows the first 3. The progress bar (Metric 4) is missing.

**What to implement:** Add a `ProgressBar` component below the 2 KPIs in `GoalsScreen.tsx` with `value={progress.overall_pct}` and a label "Overall Progress ({progress.overall_pct}%)".

---

### P1-F06 — Apply `scoreColor()` to All Progress Bars

Replace `tone={g.status_tone}` on all `ProgressBar` components in `GoalsScreen.tsx` with `tone={scoreColor(g.pct)}`. Also apply `scoreColor(progress.overall_pct)` to the overall progress bar.

**What to implement:** Modify the 2 `ProgressBar` usages in `GoalsScreen.tsx` and 1 in `DashboardScreen.tsx`.

---

### P1-F07 — Error Handling in Goals Screen

Currently, if `goalsProgress(userId)` throws a DB exception, the error propagates unhandled and the screen crashes silently. Similarly, `saveGoal()` has no try/catch.

**What to implement:**
- Replace `useData(() => goalsProgress(userId))` with `useDataSafe(() => goalsProgress(userId))` in `GoalsScreen.tsx`.
- Render an `EmptyState` with a "Retry" button when `error` is non-null.
- Wrap `saveGoal()` and `doDelete()` in try/catch with user-facing error alerts.

---

### P1-F08 — Goal Detail Screen

The browser shows all goal information inline in cards. Mobile needs a dedicated detail screen for linked asset breakdown, priority, notes, and creation date — data that exists in the DB but is never displayed.

**What to implement:**
- Create `src/screens/goals/GoalDetailScreen.tsx` — queries `financial_goals` by ID, queries `goal_asset_links` + joins `assets`, displays all fields.
- Create `src/app/goals/_layout.tsx` — Stack navigator for goals sub-routes.
- Create `src/app/goals/index.tsx` — re-exports `GoalsDashboardScreen` (rename of `GoalsScreen`).
- Create `src/app/goals/[id].tsx` — re-exports `GoalDetailScreen`.
- Delete `src/app/goals.tsx` (replaced by directory-based routing).
- Modify `GoalsScreen.tsx` — add `onPress` on each goal card to `router.push(\`/goals/${g.id}\`)`.

---

### P1-F09 — Edit Goal Screen

Neither browser nor mobile currently supports goal editing. This is the single biggest UX gap for mobile users. The `update()` primitive in `db/index.ts` already supports partial updates.

**What to implement:**
- Create `src/screens/goals/EditGoalScreen.tsx` — pre-populated form from `GoalDetailScreen` data. Saves via `update('financial_goals', id, {...})`. Manages linked assets by removing all existing `goal_asset_links` for the goal and re-inserting the new selection.
- Create `src/app/goals/[id]/edit.tsx` — re-exports `EditGoalScreen`.
- Modify `GoalDetailScreen.tsx` — add "Edit" button in header navigating to `/goals/${id}/edit`.

---

### P1-F10 — Goal Type Icon Preview in Add Form

The browser shows a live icon preview that updates as the user selects a goal type. Mobile's add form has a Menu picker but no image preview.

**What to implement:** Modify the add-goal Dialog in `GoalsScreen.tsx` to render `<GoalTypeIcon type={form.goal_type} />` above the goal type Menu selector. This requires P1-F03 (GoalTypeIcon) to be complete first.

---

### P1-F11 — Native Date Picker for Target Date

The browser uses `<input type="date">` which gives a native OS date picker. The mobile add-goal form uses a plain `TextInput` requiring manual `YYYY-MM-DD` entry. This is a UX liability.

**What to implement:** Replace the `target_date` `TextInput` in the add-goal Dialog (and `EditGoalScreen`) with `@react-native-community/datetimepicker` (or `expo-datetime-picker` if available in Expo SDK 56). Show the currently selected date as formatted text; tapping opens the picker. Minimum date = today.

---

## APIs Included (Local DB Operations)

| Operation | DB Call | File | Status |
|---|---|---|---|
| Read all goals with computed metrics | `goalsProgress(userId)` in `services/finance.ts` | `GoalsScreen.tsx` | Already implemented |
| Read single goal by ID | `first<FinancialGoal>('SELECT ... WHERE id=?', [id])` | `GoalDetailScreen.tsx` (new) | Missing |
| Read linked assets for a goal | `all<GoalAssetLink+Asset>('SELECT ... JOIN ... WHERE goal_id=?', [id])` | `GoalDetailScreen.tsx` (new) | Missing |
| Create goal + links | `insert('financial_goals', {...})` + `insert('goal_asset_links', {...})` | `GoalsScreen.tsx` | Already implemented |
| Update goal fields | `update('financial_goals', id, {...})` | `EditGoalScreen.tsx` (new) | Missing |
| Replace goal asset links (edit) | `remove('goal_asset_links', ...)` + `insert('goal_asset_links', {...})` | `EditGoalScreen.tsx` (new) | Missing |
| Delete goal | `remove('financial_goals', id)` | `GoalsScreen.tsx` | Already implemented |

---

## Files to Create

| File | Purpose |
|---|---|
| `src/assets/img/logo-goals/retirement.png` | Goal type icon (7 files total) |
| `src/assets/img/logo-goals/education.png` | Goal type icon |
| `src/assets/img/logo-goals/travel.png` | Goal type icon |
| `src/assets/img/logo-goals/emergency.png` | Goal type icon |
| `src/assets/img/logo-goals/home.png` | Goal type icon |
| `src/assets/img/logo-goals/wedding.png` | Goal type icon |
| `src/assets/img/logo-goals/custom.png` | Goal type icon (fallback) |
| `src/components/goals/GoalTypeIcon.tsx` | Goal type PNG renderer with fallback |
| `src/screens/goals/GoalDetailScreen.tsx` | Goal detail: all fields + linked assets |
| `src/screens/goals/EditGoalScreen.tsx` | Edit goal form (pre-populated) |
| `src/app/goals/_layout.tsx` | Stack navigator for goals sub-routes |
| `src/app/goals/index.tsx` | Re-exports GoalsDashboardScreen |
| `src/app/goals/[id].tsx` | Re-exports GoalDetailScreen |
| `src/app/goals/[id]/edit.tsx` | Re-exports EditGoalScreen |

**Total new files: 14** (7 image assets + 7 code files)

---

## Files to Modify

| File | Change |
|---|---|
| `src/utils/money.ts` | Add `scoreColor(pct)` function |
| `src/screens/GoalsScreen.tsx` | Add overall progress bar; apply scoreColor; add GoalTypeIcon to cards; add onPress navigation; add icon preview in form; replace TextInput with date picker; wrap in error handling; rename to GoalsDashboardScreen.tsx |
| `src/screens/DashboardScreen.tsx` | Apply `scoreColor()` to goal progress bars |
| `src/app/goals.tsx` | Delete (replaced by directory routing) |

**Total files modified: 4**

---

## Dependencies

- `react-native-paper` (already installed) — Dialog, Menu, Checkbox, Button
- `@react-native-community/datetimepicker` OR `expo-datetime-picker` — for P1-F11 (verify Expo SDK 56 compatibility at https://docs.expo.dev/versions/v56.0.0/)
- `expo-router` (already installed) — for Stack navigator and dynamic route `[id]`
- 7 PNG assets (must be acquired externally; browser serves from `/static/img/logo-goals/`)

---

## Estimated Complexity

| Task | Complexity | Effort |
|---|---|---|
| P1-F01 scoreColor utility | Trivial | 15 min |
| P1-F02 Bundle PNG images | Low | 30 min (asset acquisition) |
| P1-F03 GoalTypeIcon component | Low | 30 min |
| P1-F04 Icon in cards | Low | 15 min |
| P1-F05 Overall progress bar | Low | 20 min |
| P1-F06 Apply scoreColor to bars | Low | 20 min |
| P1-F07 Error handling | Low | 45 min |
| P1-F08 GoalDetailScreen + navigation | Medium | 3 hours |
| P1-F09 EditGoalScreen | Medium | 4 hours |
| P1-F10 Icon preview in form | Low | 20 min |
| P1-F11 Native date picker | Medium | 2 hours |

**Phase 1 Total Estimated Effort: 2–2.5 days**

---

# Phase 2 — Advanced Goals Features

**Objective:** Achieve near-complete feature parity with the browser's Goals page. After Phase 2, the mobile app has the Focus view (radial rings), goal timeline, Zustand-persisted UI preferences, search/filter/sort, and all chart improvements.

---

## Features Included

### P2-F01 — `MilestoneDots` Component

Four circular visual indicators at 25%, 50%, 75%, and 100% progress. Each dot is filled/colored when `goal.pct >= milestone`. Used exclusively inside the Focus view `GoalRingCard`.

**What to implement:** Create `src/components/goals/MilestoneDots.tsx` — a `Row` of 4 `<View>` circles. Filled circle color = `palette.good` (green); empty = theme border color.

---

### P2-F02 — `GoalRingCard` Component (Focus View)

The browser's Focus view shows each goal as a large radial progress ring using CSS `conic-gradient`. React Native has no `conic-gradient`; use `react-native-svg` SVG `<Circle>` elements with `strokeDasharray`/`strokeDashoffset` to replicate the arc.

**What to implement:** Create `src/components/goals/GoalRingCard.tsx` with:
- SVG ring: outer circle (background track) + inner arc (progress fill), rotated -90deg so fill starts at top.
- Percentage label centered inside ring.
- `GoalTypeIcon` below ring.
- Goal name, current/target formatted amounts.
- `MilestoneDots` row.
- Meta grid: target date + projection text (`~{months} mo` / `Achieved 🎉` / `Set monthly`).
- Status badge + delete button in top-right corner (same as card view).

**Formula for Focus View Projection:**
```
remaining = max(goal.target - goal.current, 0)
focusMonths = ceil(remaining / goal.monthly_needed) if goal.monthly_needed > 0 else 0
projection = pct >= 100 ? 'Achieved 🎉' : focusMonths > 0 ? `~${focusMonths} mo` : 'Set monthly'
```

---

### P2-F03 — Zustand Goals UI Store

Persistent UI preferences for the Goals screen: view mode (cards/focus), filter status, sort order, and search query. Persisted to AsyncStorage so preferences survive app restarts.

**What to implement:** Create `src/stores/goalsStore.ts` using `create` + `persist` + `createJSONStorage(() => AsyncStorage)`. Fields: `view ('cards'|'focus')`, `filterStatus ('all'|'completed'|'on_track'|'behind'|'overdue')`, `sortBy ('target_date'|'pct'|'name')`, `searchQuery (string)`. Expose setters for each field.

---

### P2-F04 — View Toggle (Cards / Focus)

Segmented control in the `GoalsDashboardScreen` header or below the summary bar to switch between Cards view (current) and Focus view (GoalRingCard 2-column layout). Selection stored in `goalsStore.view`.

**What to implement:**
- Modify `GoalsDashboardScreen.tsx` — add a `SegmentedButtons` (react-native-paper) or two `Button` components for "Cards" / "Focus" toggle.
- Conditionally render `FlatList` of `GoalCard` or 2-column `FlatList` of `GoalRingCard` based on `view` from `goalsStore`.

---

### P2-F05 — `GoalTimeline` Component

Chronological vertical list of goals with a `target_date`, sorted ascending. Each node shows a colored dot (using `goal.color_hex`), `GoalTypeIcon`, goal name, formatted target date, and progress %. Connector lines between nodes.

**What to implement:** Create `src/components/goals/GoalTimeline.tsx` — a `FlatList` where each item renders a timeline node with a left-side vertical connector line and a colored circular dot. The color of each dot uses `goal.color_hex` from the DB (default `#2F8F6F` set during creation).

---

### P2-F06 — Goal Timeline Section in GoalsDashboardScreen

Add the `GoalTimeline` component below the goal cards list, shown only when at least one goal has a `target_date`. Data is filtered from `progress.goals` and sorted ascending by `target_date`.

**What to implement:** Modify `GoalsDashboardScreen.tsx` — below the cards/focus list, add:
```
const timelineGoals = progress.goals
  .filter(g => g.target_date)
  .sort((a, b) => a.target_date! < b.target_date! ? -1 : 1);
{timelineGoals.length > 0 && <GoalTimeline goals={timelineGoals} />}
```

---

### P2-F07 — Goal Filter Chips

Status filter chips below the summary bar: All / On Track / Behind / Overdue / Completed. Selecting a chip filters the displayed goal cards/rings to matching status. Filter state stored in `goalsStore.filterStatus`.

**What to implement:** Modify `GoalsDashboardScreen.tsx` — add a horizontal `ScrollView` of `Chip` components (react-native-paper) below the summary section. On chip press, call `goalsStore.setFilterStatus(status)`. Apply filter to `filteredGoals` derived array before rendering.

---

### P2-F08 — Goal Search

Search input in the screen header or below filter chips. Filters goals by name (case-insensitive `includes`). Search query stored in `goalsStore.searchQuery`.

**What to implement:** Modify `GoalsDashboardScreen.tsx` — add a `Searchbar` (react-native-paper) component. On change, call `goalsStore.setSearchQuery(query)`. Apply to `filteredGoals` derived array.

---

### P2-F09 — Goal Sort Control

Sort menu or segmented control with options: Target Date (ascending), Progress % (descending), Name (A→Z). Sort preference stored in `goalsStore.sortBy`.

**What to implement:** Modify `GoalsDashboardScreen.tsx` — add a `Menu` component (react-native-paper) with 3 sort options. On selection, call `goalsStore.setSortBy(key)`. Apply sort to `filteredGoals` derived array after filter step.

---

### P2-F10 — Derived `filteredGoals` Computation

Wire up filter, search, and sort in `GoalsDashboardScreen.tsx` using a `useMemo` call that reads from both `progress.goals` and `goalsStore` state.

**What to implement:**
```typescript
const filteredGoals = useMemo(() => {
  let goals = progress?.goals ?? [];
  if (filterStatus !== 'all') goals = goals.filter(g => g.status === filterStatus);
  if (searchQuery.trim()) goals = goals.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  return [...goals].sort((a, b) => {
    if (sortBy === 'target_date') return (a.target_date ?? '9999') < (b.target_date ?? '9999') ? -1 : 1;
    if (sortBy === 'pct') return b.pct - a.pct;
    return a.name.localeCompare(b.name);
  });
}, [progress, filterStatus, searchQuery, sortBy]);
```

---

### P2-F11 — Chart Label and Color Alignment

The browser's bar chart uses full goal names as labels and `#C2E033` (yellow-green) for the Target series. The mobile `GroupedBars` uses only the first word of each name and `chartColors.target` (teal `#9DD1C2`).

**What to implement:** Modify `GoalsDashboardScreen.tsx` chart section:
- Change `labels` from `g.name.split(' ')[0]` to `g.name` (full name; truncate with ellipsis if too long).
- Change Target series color to `'#C2E033'` or define as `chartColors.goalTarget` in the theme.

---

### P2-F12 — Info Tooltip for Expected Percentage

The browser shows a hover tooltip on "X% complete" text revealing "(Y% expected so far)". Mobile has the expected marker on `ProgressBar` but no numeric text revealing the exact expected_pct value.

**What to implement:** Modify goal card render in `GoalsDashboardScreen.tsx` — wrap "X% complete" text in a `Pressable`. On long-press, show a `Snackbar` with text `"${g.expected_pct}% expected by today (linear pace)"`. Dismiss after 3 seconds.

---

## APIs Included (Local DB Operations)

No new DB operations required for Phase 2 — all data already returned by `goalsProgress()`. Phase 2 is entirely client-side UI and state management.

---

## Files to Create

| File | Purpose |
|---|---|
| `src/components/goals/MilestoneDots.tsx` | 4 milestone circles (25/50/75/100%) |
| `src/components/goals/GoalRingCard.tsx` | Radial SVG ring card for Focus view |
| `src/components/goals/GoalTimeline.tsx` | Vertical chronological goals timeline |
| `src/stores/goalsStore.ts` | Zustand store for view/filter/sort/search UI preferences |

**Total new files: 4**

---

## Files to Modify

| File | Change |
|---|---|
| `src/screens/goals/GoalsDashboardScreen.tsx` | Add view toggle; conditional cards/focus render; filter chips; search bar; sort menu; timeline section; filteredGoals derived state; chart label/color fix; expected_pct tooltip |
| `src/theme/index.ts` | Add `chartColors.goalTarget: '#C2E033'` |
| `package.json` | Add `react-native-svg` (required by GoalRingCard) |

**Total files modified: 3**

---

## Dependencies

- `react-native-svg` — **required** for `GoalRingCard`. Must be installed and included in a native build before this component can be used. Run `npx expo install react-native-svg` and verify against Expo SDK 56 compatibility at https://docs.expo.dev/versions/v56.0.0/.
- `zustand` — verify already in `package.json`; if not, `npx expo install zustand`.
- `@react-native-async-storage/async-storage` — required by `zustand/middleware` `persist`. Verify installed.
- Phase 1 must be complete (GoalTypeIcon needed by GoalRingCard; scoreColor needed by GoalRingCard ring color).

---

## Estimated Complexity

| Task | Complexity | Effort |
|---|---|---|
| P2-F01 MilestoneDots | Low | 30 min |
| P2-F02 GoalRingCard (SVG ring) | High | 5 hours |
| P2-F03 Zustand goals store | Low | 45 min |
| P2-F04 View toggle wiring | Medium | 1.5 hours |
| P2-F05 GoalTimeline | Medium | 2.5 hours |
| P2-F06 Timeline in screen | Low | 30 min |
| P2-F07 Filter chips | Low | 1 hour |
| P2-F08 Search bar | Low | 45 min |
| P2-F09 Sort control | Low | 45 min |
| P2-F10 filteredGoals derivation | Low | 30 min |
| P2-F11 Chart label/color fix | Trivial | 15 min |
| P2-F12 Expected_pct tooltip | Low | 30 min |

**Phase 2 Total Estimated Effort: 2–2.5 days**

---

# Phase 3 — Validation and Hardening

**Objective:** Make the Goals feature production-ready. Fix edge cases, add tests, improve performance, and ensure the feature is robust under all real-world conditions.

---

## Features Included

### P3-F01 — Unit Tests: Calculation Engine

Tests for all 9 goal calculations. These are pure functions and can be tested without any React Native setup.

**Tests for `goalTimeline()`:**
1. `current >= target AND target > 0` → `status: 'completed'`, `required_monthly: 0`
2. No `target_date` → `status: 'on_track'`, `expected: 0`, `expected_pct: 0`
3. `start === target_date` (`total_days = 0`) → `frac = 1.0`, `expected = target`
4. `today < start` → `elapsed = 0`, `frac = 0`, `expected = 0`
5. `today > target_date AND NOT completed` → `status: 'overdue'`
6. `current < expected AND NOT overdue` → `status: 'behind'`
7. `current >= expected AND NOT overdue` → `status: 'on_track'`
8. `target_date > today` → `required_monthly = round(remaining / remaining_months)` with 30.44 days/month, minimum 1 month
9. `target_date <= today AND NOT completed` → `required_monthly = remaining_amount` (full shortfall)

**Tests for `scoreColor()`:**
- `pct = 70` → `'good'`
- `pct = 69.9` → `'warn'`
- `pct = 40` → `'warn'`
- `pct = 39.9` → `'bad'`
- `pct = 0` → `'bad'`
- `pct = 100` → `'good'`

**Tests for `formatINR()`:**
- `formatINR(5000000)` → `'₹50,000.00'`
- `formatINR(123456789)` → `'₹1,23,456.89'`
- `formatINR(0)` → `'₹0.00'`
- `formatINR(100)` → `'₹1.00'`
- `formatINR(9999)` → `'₹99.99'`

**Tests for `goalsProgress()` (mocked SQLite):**
- Returns correct `total_target`, `total_current`, `overall_pct`, `on_track` count.
- Linked asset `current` correctly sums with `allocation_pct`.
- `on_track` count includes `completed` and `on_track` statuses only.

---

### P3-F02 — Unit Tests: Goal Status Engine

Status transition tests validating the priority order:
1. `completed` wins over `overdue` (current >= target even if target_date in past).
2. `overdue` wins over `on_track`/`behind` (target_date in past and not completed).
3. `on_track` and `behind` correctly computed when target_date is future.
4. No `target_date` → always `on_track`.

---

### P3-F03 — Unit Tests: Forecasting Engine

Tests for all 4 `goalTimeline()` edge cases (already listed in P3-F01) plus:
- `focusMonths` calculation: `ceil((target - current) / monthly_needed)` — ceiling behavior.
- `focusMonths = 0` when `monthly_needed = 0`.
- `focusMonths` text: "Achieved 🎉" when `pct >= 100`, "~X mo" when months > 0, "Set monthly" when months = 0.
- `required_monthly` uses 30.44 average days/month (not 30 or 31).
- Minimum 1 month guard in `required_monthly` calculation.

---

### P3-F04 — UI Tests: GoalsDashboardScreen

Tests using React Native Testing Library:
- Renders summary KPIs with correct values from mock `goalsProgress()`.
- Renders overall progress bar with correct `value`.
- Renders `GoalTypeIcon` for each goal card.
- Shows `EmptyState` when `progress.goals` is empty.
- Shows "Save ~X/mo" when `status !== 'completed'` and `required_monthly > 0`.
- Does NOT show "Save ~X/mo" when `status === 'completed'`.
- Tapping delete button shows confirmation dialog.
- Confirming delete calls `remove()` and `refresh()`.
- Error state renders retry UI when `goalsProgress()` throws.
- View toggle switches between cards and focus lists.
- Filter chip filters goal list correctly.
- Search input filters by name.

---

### P3-F05 — UI Tests: GoalRingCard

- Renders SVG `<Circle>` with correct `strokeDashoffset` for given pct.
- Shows "Achieved 🎉" when `pct >= 100`.
- Shows "~{months} mo" when `monthly_needed > 0` and pct < 100.
- Shows "Set monthly" when `monthly_needed === 0` and pct < 100.
- `MilestoneDots` shows correct `hit` state at each milestone.
- Status badge visible in top corner.

---

### P3-F06 — UI Tests: GoalDetailScreen

- Renders goal name, type, target amount, monthly needed, target date, priority.
- Renders linked assets list with name, current value, allocation %.
- Edit button navigates to `/goals/${id}/edit`.
- Back button returns to dashboard.

---

### P3-F07 — UI Tests: EditGoalScreen

- Form is pre-populated with current goal values.
- Changing name and saving updates the goal in DB.
- Asset link changes correctly remove old links and add new ones.
- Cancel does not save changes.

---

### P3-F08 — State Tests: Zustand Goals Store

- `setView('focus')` updates `view` to `'focus'`.
- `setFilterStatus('behind')` updates `filterStatus`.
- `setSortBy('name')` updates `sortBy`.
- `setSearchQuery('Retire')` updates `searchQuery`.
- State persists to AsyncStorage between renders (mock AsyncStorage).

---

### P3-F09 — Double-Allocation Warning

When the same asset is linked to multiple goals (all at 100% allocation), its full value is counted in each goal, inflating `total_current` beyond actual portfolio value. This is a data integrity risk documented in `GOALS_GAP_ANALYSIS.md` (R04).

**What to implement:** In `GoalDetailScreen.tsx`, query all `goal_asset_links` where `asset_id` is in the linked assets for this goal. If any asset appears in another goal, show an inline warning banner: "⚠ One or more linked assets are also counted in other goals. Total progress may exceed actual portfolio value."

---

### P3-F10 — Asset Ownership Validation in saveGoal

Currently, `saveGoal()` in `GoalsDashboardScreen.tsx` does not explicitly verify that the assets being linked belong to the current user. Although the assets list is filtered by `userId`, an explicit check provides defense-in-depth.

**What to implement:** In `saveGoal()`, before each `insert('goal_asset_links', {...})`, verify the asset's `user_id` matches `userId`. Skip linking and log a warning if it does not match.

---

### P3-F11 — Performance: Reduce Re-queries on Focus

`useData()` re-executes `goalsProgress(userId)` on every `useFocusEffect` trigger. When `AppContext.refresh()` is called by any other screen (e.g., an asset update), all `useData()` hooks across all screens re-run. This is a global invalidation.

**What to implement (low-code):** Verify that `goalsProgress()` completes within an acceptable time threshold (target: <50ms for up to 50 goals with 5 linked assets each). Add a `console.time`/`console.timeEnd` probe in development builds. If performance degrades, consider memoizing `goalsProgress()` output with a reference-equality check on the inputs.

---

### P3-F12 — Type Safety: Remove All `any` Types

Audit all new goal-related files created in Phases 1 and 2 for implicit `any` types. Add explicit TypeScript return types to all functions and component props. Ensure all DB query results are typed via the generic `all<T>()` and `first<T>()` helpers.

**What to implement:** Strict TypeScript audit of:
- `GoalTypeIcon.tsx`
- `GoalRingCard.tsx`
- `MilestoneDots.tsx`
- `GoalTimeline.tsx`
- `GoalDetailScreen.tsx`
- `EditGoalScreen.tsx`
- `goalsStore.ts`
- `scoreColor()` in `money.ts`

---

### P3-F13 — Edge Case: Goal with No Linked Assets

A goal can be created with no linked assets. In this case:
- `current = 0`
- `pct = 0`
- `status = 'on_track'` (if no target_date) or `'behind'` (if past expected pace)
- `required_monthly` = full target amount spread over remaining months

This is valid behavior, but the UI should make it clear that no assets are linked. The browser shows "Linked Assets: 0" in the meta grid — mobile already does this, but no call-to-action exists to prompt the user to link assets.

**What to implement:** In `GoalDetailScreen.tsx`, if `linkedAssets.length === 0`, show an inline prompt: "No linked assets. Tap Edit to link assets to this goal."

---

### P3-F14 — Edge Case: Goal Completed Beyond 100%

When `current > target_amount` (e.g., a linked asset has grown significantly), `pct` exceeds 100. The service layer caps `display_pct` at 100, but the actual `pct` value may be higher.

**What to implement:** Verify in `GoalsDashboardScreen.tsx` that the `ProgressBar` receives `Math.min(g.pct, 100)` and that status badge correctly shows "Completed" (not "Overachieved"). Since the browser has no "Overachieved" status, this should remain "Completed". Add a test case: `current = 2 × target` → `status: 'completed'`, `display_pct: 100`.

---

### P3-F15 — Edge Case: Target Date in the Past (Overdue)

When `today >= target_date AND current < target_amount`, status is `'overdue'`. The `required_monthly` equals the full remaining amount (shortfall due immediately). The UI should make this prominent.

**What to implement:** In goal cards for `overdue` goals, add a secondary line below the status badge showing the remaining shortfall: "Shortfall: {formatINR(g.target - g.current)}".

---

### P3-F16 — Code Cleanup: Remove `src/screens/GOALS_FEATURE_ANALYSIS.md` and Analysis Files

The `GOALS_FEATURE_ANALYSIS.md`, `GOALS_GAP_ANALYSIS.md`, `goa_gap_ana.md`, `goa_mgr_plan.md`, and `GOALS_MIGRATION_PLAN.md` files are analysis artifacts that should not live in `src/screens/`.

**What to implement:** Move:
- `GOALS_FEATURE_ANALYSIS.md` → `docs/goals/GOALS_FEATURE_ANALYSIS.md`
- `GOALS_GAP_ANALYSIS.md` → `docs/goals/GOALS_GAP_ANALYSIS.md`
- `GOALS_MIGRATION_PLAN.md` → `docs/goals/GOALS_MIGRATION_PLAN.md`
- Delete: `src/screens/goa_gap_ana.md`, `src/screens/goa_mgr_plan.md` (instruction files, not needed after execution)

---

### P3-F17 — Validate `color_hex` Field Usage

Goals are created with `color_hex: '#2F8F6F'` hardcoded. The `GoalTimeline` component (Phase 2) uses `goal.color_hex` for timeline dot colors. All seeded demo goals share the same hex color. Post-migration, goal creation should assign a unique color from a predefined palette based on `goal_type`.

**What to implement:** In `saveGoal()`, instead of hardcoding `color_hex: '#2F8F6F'`, map from `GOAL_TYPE_COLORS` constant (to be added to `src/services/constants.ts`):
```
retirement: '#4A90E2'   (blue)
education:  '#7B68EE'   (purple)
travel:     '#2FA86B'   (green)
emergency:  '#E05C5C'   (red)
home:       '#F0B429'   (amber)
wedding:    '#EC4899'   (pink)
custom:     '#2F8F6F'   (teal, existing)
```

---

## Files to Create

| File | Purpose |
|---|---|
| `src/utils/__tests__/money.test.ts` | Unit tests for scoreColor, formatINR, rupeesToPaise |
| `src/services/__tests__/finance.test.ts` | Unit tests for goalTimeline, goalsProgress |
| `src/components/goals/__tests__/GoalRingCard.test.tsx` | UI tests for radial ring card |
| `src/components/goals/__tests__/MilestoneDots.test.tsx` | Unit tests for milestone dots |
| `src/screens/goals/__tests__/GoalsDashboardScreen.test.tsx` | UI tests for main screen |
| `src/screens/goals/__tests__/GoalDetailScreen.test.tsx` | UI tests for detail screen |
| `src/screens/goals/__tests__/EditGoalScreen.test.tsx` | UI tests for edit screen |
| `src/stores/__tests__/goalsStore.test.ts` | State tests for Zustand store |
| `docs/goals/` | Directory for documentation artifacts |

**Total new files: 8** (test files + docs directory)

---

## Files to Modify

| File | Change |
|---|---|
| `src/screens/goals/GoalsDashboardScreen.tsx` | Asset ownership validation; overdue shortfall display |
| `src/screens/goals/GoalDetailScreen.tsx` | Double-allocation warning; no-linked-assets prompt |
| `src/screens/goals/EditGoalScreen.tsx` | Asset ownership validation |
| `src/services/constants.ts` | Add `GOAL_TYPE_COLORS` mapping |
| `src/screens/goals/GoalsDashboardScreen.tsx` (saveGoal) | Use `GOAL_TYPE_COLORS` for `color_hex` |
| `jest.config.js` (or equivalent) | Ensure test setup covers React Native + SQLite mocks |

**Total files modified: 5**

---

## Dependencies

- Jest + React Native Testing Library (verify in `package.json`; standard Expo setup includes these)
- AsyncStorage mock (`@react-native-async-storage/async-storage/jest/async-storage-mock`)
- SQLite mock (manual mock of `src/db/index.ts` or use Jest module mocking)
- Phase 1 and Phase 2 must be complete before testing those features

---

## Estimated Complexity

| Task | Complexity | Effort |
|---|---|---|
| P3-F01 Unit tests: calculations | Medium | 3 hours |
| P3-F02 Unit tests: status engine | Low | 1 hour |
| P3-F03 Unit tests: forecasting | Low | 1 hour |
| P3-F04 UI tests: dashboard | Medium | 2 hours |
| P3-F05 UI tests: GoalRingCard | Low | 1 hour |
| P3-F06 UI tests: GoalDetailScreen | Low | 1 hour |
| P3-F07 UI tests: EditGoalScreen | Low | 1 hour |
| P3-F08 State tests: Zustand | Low | 45 min |
| P3-F09 Double-allocation warning | Low | 1 hour |
| P3-F10 Asset ownership validation | Low | 30 min |
| P3-F11 Performance probe | Low | 30 min |
| P3-F12 Type safety audit | Low | 1 hour |
| P3-F13 Edge: no linked assets | Low | 30 min |
| P3-F14 Edge: >100% progress | Low | 30 min |
| P3-F15 Edge: overdue shortfall | Low | 45 min |
| P3-F16 Move analysis docs | Trivial | 15 min |
| P3-F17 Goal type colors | Low | 45 min |

**Phase 3 Total Estimated Effort: 2 days**

---

# Goal Calculation Migration Breakdown

## CALC-01 — Current Value (from Linked Assets)

**Formula:** `current = Σ( round(asset.current_value × link.allocation_pct / 100) )` for each `GoalAssetLink` where `link.asset` is not null.

**Browser Implementation Location:** `app/app/services.py`, `goals_progress()`, line ~629

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalsProgress()`, same formula with SQLite JOIN.

**Migration Phase:** Already done (Phase 0)

**Dependencies:** `goal_asset_links` table, `assets` table, `goalsProgress()` function

---

## CALC-02 — Progress Percentage

**Formula:** `pct = round(current / target_amount × 100, 1)` if `target_amount > 0` else `0.0`; `display_pct = min(pct, 100)`.

**Browser Implementation Location:** `services.py`, `goals_progress()`, line ~631

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalsProgress()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-01

---

## CALC-03 — Expected Fraction (Linear Interpolation)

**Formula:** `total_days = (target_date - start).days`; if `total_days <= 0`, `frac = 1.0`; else `elapsed = max(0, min((today - start).days, total_days))`; `frac = elapsed / total_days`.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, lines 593–601

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`, using `.getTime() / 86400000`.

**Migration Phase:** Already done (Phase 0)

**Dependencies:** `FinancialGoal.created_at`, `FinancialGoal.target_date`

---

## CALC-04 — Expected Amount by Now

**Formula:** `expected = Math.round(frac × target_amount)`

**Browser Implementation Location:** `services.py`, `goal_timeline()`, line ~601

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-03

---

## CALC-05 — Expected Percentage

**Formula:** `expected_pct = round(frac × 100, 1)` (i.e., `Math.round(frac * 1000) / 10`)

**Browser Implementation Location:** `services.py`, `goal_timeline()`, line 618

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-03

---

## CALC-06 — Required Monthly Contribution

**Formula:** `remaining_amount = max(target_amount - current, 0)`; if `target_date > today`: `remaining_months = max(round(remainingMs / (30.44 × 86400000)), 1)`; `required_monthly = round(remaining_amount / remaining_months)`; else: `required_monthly = remaining_amount`.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, lines 604–609

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-01, `FinancialGoal.target_date`

---

## CALC-07 — Goal Status Determination

**Formula:** Priority order: `completed` → `overdue` → `on_track` → `behind`. See Goal Status Engine section for full logic.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, lines 612–618

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-01, CALC-03, CALC-04

---

## CALC-08 — Overall Portfolio Progress

**Formula:** `total_target = Σ(g.target_amount)`; `total_current = Σ(current)`; `overall_pct = round(total_current / total_target × 100, 1)` if `total_target > 0` else `0.0`; `on_track = count where status ∈ {"completed", "on_track"}`.

**Browser Implementation Location:** `services.py`, `goals_progress()`, lines 623–651

**Mobile Implementation Status:** ✅ Computed by `goalsProgress()`. ⚠ Partially Rendered — `overall_pct` progress bar is missing from UI.

**Migration Phase:** Phase 1 (P1-F05 — add overall progress bar)

**Dependencies:** CALC-01, CALC-07

---

## CALC-09 — Focus View Projection (Months to Completion)

**Formula:** `remaining = max(target - current, 0)`; `focusMonths = ceil(remaining / monthly_needed)` if `monthly_needed > 0` else `0`. Display: `pct >= 100` → "Achieved 🎉"; `focusMonths > 0` → `~{focusMonths} mo`; else → "Set monthly".

**Browser Implementation Location:** `templates/goals/list.html`, lines 78–79 (inline Jinja2 in Focus view)

**Mobile Implementation Status:** ❌ Missing — no Focus view exists.

**Migration Phase:** Phase 2 (P2-F02 — GoalRingCard implementation)

**Dependencies:** `GoalItem.target`, `GoalItem.current`, `GoalItem.monthly_needed`, `GoalItem.pct`

---

## CALC-10 — Score Color Thresholds

**Formula:** `pct >= 70` → green (`'good'`); `pct >= 40` → orange (`'warn'`); `< 40` → red (`'bad'`).

**Browser Implementation Location:** `templates/partials/_bars.html`, `score_color()` macro

**Mobile Implementation Status:** ⚠ Partially Implemented — color currently derived from `status_tone`, not direct pct threshold. Behavioral difference for goals with no target_date.

**Migration Phase:** Phase 1 (P1-F01 — add `scoreColor()` utility; P1-F06 — apply to progress bars)

**Dependencies:** None

---

## CALC-11 — Remaining Amount

**Formula:** `remaining = max(target - current, 0)` (in paise)

**Browser Implementation Location:** `templates/goals/list.html`, line 78 (Jinja2 inline variable in Focus view)

**Mobile Implementation Status:** ❌ Not computed as a named value. Source fields available in `GoalItem`.

**Migration Phase:** Phase 2 (computed inline in `GoalRingCard`)

**Dependencies:** `GoalItem.target`, `GoalItem.current`

---

# Goal Status Engine Migration Breakdown

## STATUS-01 — `completed`

**Trigger Logic:** `current >= target_amount AND target_amount > 0`. Terminal state — computed at query time, never stored.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, lines 587–589. First check in priority order.

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`, line checking `current >= targetAmount && targetAmount > 0`.

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-01, `FinancialGoal.target_amount`

---

## STATUS-02 — `on_track`

**Trigger Logic:** `NOT completed AND NOT overdue AND current >= expected`. If no `target_date`, expected = 0 so always on_track.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, line 616

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-03, CALC-04, STATUS-01, STATUS-04

---

## STATUS-03 — `behind`

**Trigger Logic:** `NOT completed AND NOT overdue AND current < expected`. Fallback after all other checks.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, line 618

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-03, CALC-04, STATUS-01, STATUS-04

---

## STATUS-04 — `overdue`

**Trigger Logic:** `today >= target_date AND NOT completed`. Checked before on_track/behind.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, lines 612–614

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** `FinancialGoal.target_date`, STATUS-01

---

## STATUS-05 — Default (No Target Date)

**Trigger Logic:** When `target_date` is null, `frac = 0`, `expected = 0`. Since `current >= 0 >= expected = 0`, status defaults to `on_track`.

**Browser Implementation Location:** `services.py`, `goal_timeline()` — implicit via frac=0 path

**Mobile Implementation Status:** ✅ Fully Implemented — `goalTimeline()` correctly handles null `targetDate`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** `FinancialGoal.target_date = null`

---

## STATUS-06 — `paused` (Not Implemented)

**Trigger Logic:** Not defined in browser. Not implemented anywhere.

**Browser Implementation Location:** N/A

**Mobile Implementation Status:** ❌ Not implemented; not in scope.

**Migration Phase:** Not planned

**Dependencies:** Would require a new `is_paused` field in DB schema

---

## STATUS-07 — `cancelled` (Not Implemented)

**Trigger Logic:** Not defined in browser. Not implemented anywhere.

**Browser Implementation Location:** N/A

**Mobile Implementation Status:** ❌ Not implemented; not in scope.

**Migration Phase:** Not planned

**Dependencies:** Would require a new `is_cancelled` field or soft-delete pattern

---

## STATUS-08 — `overachieved` (Not Implemented)

**Trigger Logic:** Not defined in browser. `pct > 100` but browser displays as "Completed" with pct capped at 100.

**Browser Implementation Location:** N/A — browser treats any `current >= target` as `completed`

**Mobile Implementation Status:** ❌ Not implemented; aligned with browser behavior.

**Migration Phase:** Not planned (by design — match browser behavior)

**Dependencies:** N/A

---

# Forecasting Engine Migration Breakdown

## FORECAST-01 — Linear Savings Pace (Expected Fraction)

**Description:** Projects what fraction of the target should have been saved by today, assuming a constant monthly savings rate from goal creation date to target date.

**Formula:** `frac = max(0, min(elapsed_days, total_days)) / total_days` where `elapsed = today - created_at`, `total = target_date - created_at`.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, lines 593–601

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** `FinancialGoal.created_at`, `FinancialGoal.target_date`

---

## FORECAST-02 — Expected Amount by Today

**Description:** The amount in paise that should have been accumulated by today under the linear pace assumption.

**Formula:** `expected = round(frac × target_amount)`

**Browser Implementation Location:** `services.py`, `goal_timeline()`, line ~601

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** FORECAST-01, `FinancialGoal.target_amount`

---

## FORECAST-03 — Expected Percentage by Today

**Description:** Same as FORECAST-01 but as a display percentage (0–100+).

**Formula:** `expected_pct = round(frac × 100, 1)` (mobile: `Math.round(frac * 1000) / 10`)

**Browser Implementation Location:** `services.py`, `goal_timeline()`, line 618

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** FORECAST-01

---

## FORECAST-04 — Required Monthly Contribution

**Description:** How much the user must save per month from today to reach the target on time. If target date has already passed, equals the full remaining amount (shortfall due immediately).

**Formula:** `remaining_amount = max(target_amount - current, 0)`; if `target_date > today`: `remaining_months = max(round(remainingMs / (30.44 × 86400000)), 1)`; `required_monthly = round(remaining_amount / remaining_months)`; else: `required_monthly = remaining_amount`.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, lines 604–609

**Mobile Implementation Status:** ✅ Fully Implemented — `src/services/finance.ts`, `goalTimeline()`

**Migration Phase:** Already done (Phase 0)

**Dependencies:** CALC-01, `FinancialGoal.target_date`

---

## FORECAST-05 — Focus View Months Projection

**Description:** How many months until completion at the user's planned monthly rate. Uses `monthly_needed` (user-entered) as the pace denominator, not the derived `required_monthly`.

**Formula:** `remaining = max(target - current, 0)`; `focusMonths = ceil(remaining / monthly_needed)` if `monthly_needed > 0` else `0`.

**Browser Implementation Location:** `templates/goals/list.html`, lines 78–79 (inline template variable in Focus view)

**Mobile Implementation Status:** ❌ Missing — no Focus view or `GoalRingCard` exists.

**Migration Phase:** Phase 2 (P2-F02 — GoalRingCard)

**Dependencies:** `GoalItem.target`, `GoalItem.current`, `GoalItem.monthly_needed`

---

## FORECAST-06 — Projection Display Text

**Description:** Human-readable text for the Focus view projection cell. Three possible outputs based on goal state.

**Formula:**
- `pct >= 100` → `"Achieved 🎉"`
- `focusMonths > 0` → `"~{focusMonths} mo"`
- else → `"Set monthly"`

**Browser Implementation Location:** `templates/goals/list.html`, lines 81–85 (Jinja2 conditional block)

**Mobile Implementation Status:** ❌ Missing — no Focus view.

**Migration Phase:** Phase 2 (P2-F02 — GoalRingCard)

**Dependencies:** FORECAST-05, `GoalItem.pct`

---

## FORECAST-07 — Edge Case: Start == Target Date (`frac = 1.0`)

**Description:** When `created_at` date equals `target_date`, `total_days = 0`. The formula sets `frac = 1.0` (already fully expected), which correctly marks the goal as "behind" if current < target_amount or "completed" if current >= target.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, lines 595–596

**Mobile Implementation Status:** ✅ Fully Implemented — `goalTimeline()` checks `totalDays <= 0` → `frac = 1`.

**Migration Phase:** Already done (Phase 0). Validated in P3-F01 unit tests.

**Dependencies:** FORECAST-01

---

## FORECAST-08 — Edge Case: Today Before Start Date (`elapsed = 0`)

**Description:** If `today < created_at` (theoretically impossible for new goals, but can occur with data migration), `elapsed` is clamped to 0 and `frac = 0`. This means expected = 0, and the goal will always be `on_track`.

**Browser Implementation Location:** `services.py`, `goal_timeline()`, line 598 — `elapsed = max(0, ...)`

**Mobile Implementation Status:** ✅ Fully Implemented — `Math.max(0, ...)` in `goalTimeline()`.

**Migration Phase:** Already done (Phase 0). Validated in P3-F01 unit tests.

**Dependencies:** FORECAST-01

---

## FORECAST-09 — Edge Case: Today After Target Date (`elapsed = total_days`)

**Description:** When `today > target_date` and the goal is not completed, `elapsed` is clamped to `total_days` so `frac = 1.0`, `expected = target_amount`. Since `current < target_amount`, the goal is `overdue`. The `required_monthly` becomes the full remaining amount (shortfall due immediately).

**Browser Implementation Location:** `services.py`, `goal_timeline()`, line 599 — `min(..., total_days)`

**Mobile Implementation Status:** ✅ Fully Implemented — `Math.min(..., totalDays)` in `goalTimeline()`.

**Migration Phase:** Already done (Phase 0). Validated in P3-F01 and P3-F03 unit tests.

**Dependencies:** FORECAST-01, STATUS-04

---

## FORECAST-10 — Edge Case: No Target Date

**Description:** When `target_date` is null, `frac = 0`, `expected = 0`, `expected_pct = 0`. Status defaults to `on_track` (since `current >= 0 >= expected = 0`). `required_monthly = 0` (no deadline). Focus view shows "Set monthly".

**Browser Implementation Location:** `services.py`, `goal_timeline()` — implicit when `start` or `target_date` is None

**Mobile Implementation Status:** ✅ Fully Implemented — `goalTimeline()` handles null `targetDate`.

**Migration Phase:** Already done (Phase 0). Validated in P3-F01 unit tests.

**Dependencies:** FORECAST-01

---

---

# Migration Summary

| Metric | Count |
|---|---|
| **Total browser features discovered** | 30 |
| **Total mobile features already fully implemented** | 17 |
| **Total features partially implemented** | 5 |
| **Total features to migrate (missing)** | 8 |
| **Total DB operations (APIs) to migrate** | 4 (GET✅ POST✅ DELETE✅ PATCH❌) |
| **Total goal calculations** | 11 (9 fully done; CALC-08 partially done; CALC-09/11 missing) |
| **Total forecasting rules** | 10 (8 done; FORECAST-05/06 missing; edge cases all done) |
| **Total goal status rules** | 8 (5 implemented; 3 not in scope: paused/cancelled/overachieved) |
| **Total files to create (all phases)** | 26 (14 Phase 1 + 4 Phase 2 + 8 Phase 3) |
| **Total files to modify (all phases)** | 12 (4 Phase 1 + 3 Phase 2 + 5 Phase 3) |
| **Total migration tasks** | 34 (11 Phase 1 + 12 Phase 2 + 17 Phase 3) |

---

# Dependency Roadmap

```
Foundation (Phase 1 — P1-F01, P1-F02)
│  Add scoreColor() utility to money.ts
│  Bundle 7 PNG goal type images
│  WHY: All subsequent components depend on these. scoreColor is used by every
│       progress bar. PNG assets are required by GoalTypeIcon.
↓
Data Layer (Phase 1 — P1-F08 navigation setup)
│  Create Expo Router Stack layout for goals sub-routes
│  WHY: GoalDetailScreen and EditGoalScreen cannot be navigated to without
│       the _layout.tsx Stack navigator and dynamic [id] routes.
↓
State Management (Phase 2 — P2-F03)
│  Create Zustand goals store (view/filter/sort/search)
│  WHY: View toggle (P2-F04) and search/filter/sort (P2-F07/08/09) all read
│       from this store. Must exist before those features are wired.
↓
Goal Calculation Engine (Phase 1 — already complete; P1-F06 cleanup)
│  Apply scoreColor() to all progress bars (replaces status_tone)
│  WHY: Correct color behavior must be in place before testing calculations.
│       scoreColor is the mobile equivalent of the browser's score_color() macro.
↓
Goal Status Engine (already complete in Phase 0)
│  All 5 status rules implemented in goalTimeline()
│  WHY: Status determines badge color, on_track count, and filter behavior.
│       Already functional; Phase 3 adds validation tests.
↓
Forecasting Engine (Phase 1 partially; Phase 2 — FORECAST-05/06)
│  required_monthly: already done
│  Focus view projection (FORECAST-05/06): requires GoalRingCard (Phase 2)
│  WHY: Forecasting output is consumed by GoalRingCard which depends on
│       GoalTypeIcon (Phase 1) and react-native-svg (Phase 2 dependency).
↓
Core UI (Phase 1 — P1-F03 through P1-F11)
│  GoalTypeIcon component
│  Goal type icon in cards
│  Overall progress bar in summary
│  Error handling
│  Goal Detail Screen
│  Edit Goal Screen
│  Native date picker
│  WHY: These are the functional gaps that block a user from fully interacting
│       with goals. GoalTypeIcon must be built before GoalRingCard (Phase 2)
│       because it is a dependency of GoalRingCard.
↓
Advanced UI (Phase 2 — P2-F01 through P2-F12)
│  MilestoneDots (P2-F01)
│  GoalRingCard — radial ring (P2-F02) [depends on MilestoneDots, GoalTypeIcon]
│  View toggle (P2-F04) [depends on GoalRingCard, goalsStore]
│  GoalTimeline (P2-F05) [depends on GoalTypeIcon]
│  Timeline in screen (P2-F06) [depends on GoalTimeline]
│  Filter chips (P2-F07) [depends on goalsStore]
│  Search (P2-F08) [depends on goalsStore]
│  Sort (P2-F09) [depends on goalsStore]
│  filteredGoals derivation (P2-F10) [depends on goalsStore, filter/sort/search]
│  Chart fixes (P2-F11) — independent
│  Tooltip (P2-F12) — independent
│  WHY: Focus view requires GoalRingCard which requires MilestoneDots and
│       GoalTypeIcon. View toggle requires Focus view to exist. Filter/search/sort
│       all require the Zustand store and the filteredGoals derivation logic.
↓
Testing (Phase 3 — P3-F01 through P3-F08)
│  Unit tests: calculations, status, forecasting
│  UI tests: all new screens and components
│  State tests: Zustand store
│  WHY: Tests validate that Phase 1 and 2 implementations match the browser
│       specification. Must run after implementation is complete.
↓
Production Hardening (Phase 3 — P3-F09 through P3-F17)
│  Double-allocation warning
│  Asset ownership validation
│  Performance probing
│  Type safety audit
│  Edge case UI (no assets, >100%, overdue shortfall)
│  Goal type color mapping
│  Documentation cleanup
│  WHY: Hardening requires a complete, tested implementation to harden.
│       These tasks improve robustness and UX without changing core logic.
```

---

# Final Implementation Checklist

```
PHASE 1 — Core

[x] Goal Dashboard (basic, Cards view only)
[~] Goal Dashboard (complete — missing overall progress bar)
[ ] → Add overall progress bar to summary (P1-F05)

[x] Goal Cards (all primary elements)
[~] Goal Cards (complete — missing goal type icon)
[ ] → Add GoalTypeIcon to each card (P1-F04)

[ ] Goal Detail Screen (P1-F08)
    [ ] All FinancialGoal fields displayed
    [ ] Linked assets list with name, current value, allocation %
    [ ] Edit button in header
    [ ] Back navigation to dashboard

[x] Goal Creation (form, validation, DB insert)
[~] Goal Creation (complete — missing icon preview, missing native date picker)
[ ] → Add goal type icon preview in add form (P1-F10)
[ ] → Replace TextInput with native date picker (P1-F11)

[ ] Goal Editing (P1-F09)
    [ ] Pre-populated form from DB
    [ ] Save updates all editable fields
    [ ] Replaces goal asset links on save
    [ ] Cancel does not persist changes

[x] Goal Deletion (confirmation + DB delete + cascade)

[x] Goal Progress Tracking
    [x] current = Σ(asset.current_value × allocation_pct / 100)
    [x] pct = current / target × 100 (capped at 100 for display)
    [x] expected = frac × target (linear interpolation)
    [x] required_monthly = remaining / remaining_months (30.44 days/month)
    [ ] focus_months = ceil(remaining / monthly_needed) [requires Phase 2 Focus view]

[x] Goal Calculation Engine
    [x] goalTimeline() — all 6 outputs: status, expected, expected_pct, required_monthly
    [x] goalsProgress() — all aggregates: total_target, total_current, overall_pct, on_track
    [~] scoreColor() — partial (color via status_tone, not direct pct threshold)
    [ ] → Implement scoreColor() utility (P1-F01)
    [ ] → Apply scoreColor() to all progress bars (P1-F06)

[x] Goal Status Engine
    [x] completed — current >= target AND target > 0
    [x] on_track — current >= expected AND NOT overdue AND NOT completed
    [x] behind — current < expected AND NOT overdue AND NOT completed
    [x] overdue — today >= target_date AND NOT completed
    [x] default (no target_date) — on_track

[x] Goal Forecasting Engine
    [x] Linear interpolation (frac = elapsed / total_days)
    [x] Expected amount and percentage by today
    [x] Required monthly contribution (30.44 days/month, minimum 1 month)
    [x] Edge: no target_date → frac = 0
    [x] Edge: start == target_date → frac = 1.0
    [x] Edge: today before start → elapsed = 0
    [x] Edge: today after target_date → elapsed = total_days, required_monthly = shortfall

[ ] Goal Type PNG Images (P1-F02)
    [ ] retirement.png
    [ ] education.png
    [ ] travel.png
    [ ] emergency.png
    [ ] home.png
    [ ] wedding.png
    [ ] custom.png (fallback)

[ ] GoalTypeIcon Component (P1-F03)

[~] Error Handling
    [x] Validation in saveGoal() (name, target, date format)
    [ ] → DB error handling in goalsProgress() (P1-F07)
    [ ] → DB error handling in saveGoal() and doDelete() (P1-F07)
    [ ] → Error state UI in GoalsScreen (P1-F07)

[x] Loading States (synchronous SQLite — immediate; basic undefined handling)
[x] Empty States (EmptyState component renders when goals list is empty)

---

PHASE 2 — Advanced

[ ] Goal Milestones (P2-F01)
    [ ] MilestoneDots component
    [ ] 4 dots at 25%, 50%, 75%, 100%
    [ ] Filled/colored when pct >= milestone

[ ] Goal Focus View / Radial Ring (P2-F02)
    [ ] GoalRingCard component
    [ ] SVG arc ring with strokeDashoffset
    [ ] Percentage label centered inside ring
    [ ] Goal type icon below ring
    [ ] Current / Target amounts
    [ ] MilestoneDots row
    [ ] Meta grid: target date + projection text
    [ ] Status badge + delete button
    [ ] Projection: "Achieved 🎉" / "~X mo" / "Set monthly"

[ ] Goal Timeline (P2-F05, P2-F06)
    [ ] GoalTimeline component
    [ ] Vertical list sorted by target_date ascending
    [ ] Only goals with target_date shown
    [ ] Each node: colored dot, GoalTypeIcon, name, date, progress %
    [ ] Connector lines between nodes
    [ ] Embedded in GoalsDashboardScreen below cards

[ ] View Toggle Cards / Focus (P2-F03, P2-F04)
    [ ] Zustand goals store (view state)
    [ ] Segmented control UI in dashboard screen
    [ ] Conditional render: FlatList of GoalCard OR 2-column FlatList of GoalRingCard
    [ ] View preference persists via AsyncStorage

[ ] Goal Filters (P2-F07)
    [ ] Filter chip row: All / On Track / Behind / Overdue / Completed
    [ ] Chips filter displayed goals by status
    [ ] Filter state in Zustand store
    [ ] Filter persists across navigation

[ ] Goal Search (P2-F08)
    [ ] Searchbar component in screen header
    [ ] Case-insensitive name search
    [ ] Search query in Zustand store
    [ ] Query persists across navigation

[ ] Goal Sorting (P2-F09, P2-F10)
    [ ] Sort menu: Target Date / Progress % / Name
    [ ] Applied to filteredGoals after filter + search
    [ ] Sort preference in Zustand store

[ ] Goal Analytics (chart fixes — P2-F11)
    [ ] Full goal names as chart labels (not first word only)
    [ ] Target series color aligned to browser (#C2E033 or equivalent)

[ ] Goal Status Indicator — Expected Pct Tooltip (P2-F12)
    [ ] Long-press on "X% complete" shows Snackbar
    [ ] Snackbar text: "Y% expected by today (linear pace)"

[ ] State Persistence (P2-F03)
    [ ] Zustand store persisted to AsyncStorage
    [ ] View, filter, sort, search survive app restart

---

PHASE 3 — Hardening

[ ] Testing
    [ ] Unit: scoreColor() thresholds
    [ ] Unit: formatINR() Indian grouping
    [ ] Unit: goalTimeline() — all 9 edge cases
    [ ] Unit: goalsProgress() — aggregates with mocked SQLite
    [ ] Unit: Focus view projection (focusMonths, projection text)
    [ ] Unit: Status priority order (completed > overdue > on_track > behind)
    [ ] UI: GoalsDashboardScreen — summary, cards, empty state, error state
    [ ] UI: GoalRingCard — ring, milestone dots, projection text
    [ ] UI: GoalDetailScreen — all fields, linked assets, edit navigation
    [ ] UI: EditGoalScreen — pre-populated, save, cancel
    [ ] State: goalsStore — all setters, AsyncStorage persistence

[ ] Data Persistence Validation
    [ ] Verify goal_asset_links cascade delete on goal delete
    [ ] Verify EditGoalScreen replaces links correctly (delete all + re-insert)
    [ ] Verify seed data loads correctly (4 demo goals)

[ ] Offline Handling
    [ ] Local SQLite is inherently offline-capable — no network dependency
    [ ] Verify app functions correctly in airplane mode
    [ ] Add stale-data indicator if background refresh is added in future

[ ] Edge Cases
    [ ] Goal with no linked assets — prompt to link in GoalDetailScreen
    [ ] Goal with pct > 100 — display capped at 100%, status = completed
    [ ] Overdue goal — show shortfall amount prominently
    [ ] Goal created today with same-day target_date — frac = 1.0
    [ ] Goal with target_date in past but completed — status = completed (not overdue)
    [ ] Double-allocation warning when same asset linked to multiple goals

[ ] Error Recovery
    [ ] DB error in goalsProgress() → EmptyState with retry button
    [ ] DB error in saveGoal() → Alert with error message, form stays open
    [ ] DB error in doDelete() → Alert with error message, goal remains
    [ ] DB error in GoalDetailScreen query → EmptyState

[ ] Type Safety
    [ ] No implicit `any` types in all new goal files
    [ ] All component props typed explicitly
    [ ] All DB query results typed via generic helpers

[ ] Code Cleanup
    [ ] Move analysis docs to docs/goals/
    [ ] Remove instruction files from src/screens/
    [ ] Apply GOAL_TYPE_COLORS for dynamic color_hex on goal creation
    [ ] Verify no console.log left in production paths

[ ] Performance
    [ ] Profile goalsProgress() for 50-goal dataset
    [ ] Verify no JS thread stalls on GoalsDashboardScreen focus

[ ] Production Hardening (Final Validation)
    [ ] Manual QA: Create goal → view in dashboard → view detail → edit → delete
    [ ] Manual QA: Focus view ring fills correctly for various pct values
    [ ] Manual QA: Timeline sorts correctly by date
    [ ] Manual QA: Filter chips filter correctly
    [ ] Manual QA: Search filters by name
    [ ] Manual QA: Sort changes card order
    [ ] Manual QA: Overdue goal shows shortfall
    [ ] Manual QA: Completed goal hides "Save ~X/mo"
    [ ] Manual QA: Dark mode renders correctly across all goal screens
```

---

# Final Estimates

| Phase | Estimated Effort | Tasks |
|---|---|---|
| **Phase 1 — Core Goals Migration** | 2–2.5 days | 11 tasks (P1-F01 to P1-F11) |
| **Phase 2 — Advanced Goals Features** | 2–2.5 days | 12 tasks (P2-F01 to P2-F12) |
| **Phase 3 — Validation and Hardening** | 2 days | 17 tasks (P3-F01 to P3-F17) |
| **Total Migration Effort** | **6–7 days** | **40 total tasks across 3 phases** |

---

# Highest-Risk Migration Areas

1. **`react-native-svg` native dependency** (GoalRingCard — Phase 2) — Requires a new native build. Cannot be shipped via EAS Update alone. Must be scheduled into the next build cycle. Risk: MEDIUM. Mitigation: Install early in Phase 1 so it's included in the first native build after Phase 1.

2. **Goal type PNG images** (Phase 1) — External assets that must be acquired from the browser app's static files. If the original files are unavailable, alternatives (vector icons or emoji) must substitute. Risk: MEDIUM. Mitigation: Acquire assets as the very first action of Phase 1.

3. **EditGoalScreen asset link management** (Phase 1) — Replacing goal asset links requires deleting all existing `goal_asset_links` for a goal and re-inserting the new selection. If a partial failure occurs (delete succeeds, insert fails), the goal loses all linked assets. Risk: MEDIUM. Mitigation: Wrap delete + insert in a SQLite transaction using `db.run('BEGIN')` / `db.run('COMMIT')` / `db.run('ROLLBACK')`.

4. **Score color behavioral difference** (Phase 1) — The current `status_tone`-based color produces visible color differences from the browser for goals with no target_date (green bars for low-progress goals). If not fixed before shipping Phase 1, it creates a confusing user experience. Risk: LOW (easy fix) but HIGH VISIBILITY. Mitigation: Fix in the first Phase 1 commit (P1-F01 and P1-F06).

5. **Double-allocation inflating portfolio metrics** (Phase 3) — If the same asset is linked to multiple goals at 100% allocation, `total_current` overstates actual portfolio value. This is silent and visually misleading. Risk: HIGH (data integrity) but LOW LIKELIHOOD (requires user to deliberately link same asset twice). Mitigation: Add warning in GoalDetailScreen (P3-F09).

---

# Recommended Implementation Order

Execute tasks in this exact sequence within each phase:

**Phase 1 execution order:**
1. P1-F01 — `scoreColor()` utility (no deps, 15 min, unblocks P1-F06 and Phase 2)
2. P1-F02 — Bundle PNG images (no code, unblocks P1-F03)
3. P1-F03 — `GoalTypeIcon` component (unblocks P1-F04, P1-F10, and Phase 2 GoalRingCard)
4. P1-F04 — Add icon to cards (quick win, visible improvement)
5. P1-F05 — Overall progress bar (quick win, closes Summary Bar gap)
6. P1-F06 — Apply `scoreColor()` to progress bars (completes the score color fix)
7. P1-F07 — Error handling (safety net before adding more complex screens)
8. P1-F08 — Navigation structure + GoalDetailScreen (longest task; unblocks P1-F09)
9. P1-F09 — EditGoalScreen (depends on P1-F08 navigation)
10. P1-F10 — Icon preview in add form (depends on P1-F03; quick win)
11. P1-F11 — Native date picker (last; UX improvement, lower priority than functional gaps)

**Phase 2 execution order:**
1. P2-F03 — Zustand goals store (foundation for all Phase 2 UI state)
2. P2-F01 — MilestoneDots (simple; unblocks P2-F02)
3. P2-F02 — GoalRingCard with SVG ring (longest task; core of Focus view)
4. P2-F04 — View toggle (depends on P2-F02 and P2-F03)
5. P2-F05 — GoalTimeline (parallel to P2-F04; depends on P1-F03)
6. P2-F06 — Add timeline to screen (depends on P2-F05)
7. P2-F10 — filteredGoals derivation (foundation for filter/search/sort rendering)
8. P2-F07 — Filter chips (depends on P2-F03, P2-F10)
9. P2-F08 — Search bar (depends on P2-F03, P2-F10)
10. P2-F09 — Sort control (depends on P2-F03, P2-F10)
11. P2-F11 — Chart label/color fix (independent, quick win)
12. P2-F12 — Expected_pct tooltip (independent, quick win)

**Phase 3 execution order:**
1. P3-F01 to P3-F08 — All tests (write tests top-to-bottom; fix any bugs discovered)
2. P3-F09 — Double-allocation warning (data integrity)
3. P3-F10 — Asset ownership validation (security)
4. P3-F17 — Goal type color mapping (data quality improvement)
5. P3-F13, P3-F14, P3-F15 — Edge case UI (polish)
6. P3-F11 — Performance probe (measure, only optimize if needed)
7. P3-F12 — Type safety audit (cleanup pass)
8. P3-F16 — Move analysis docs (final cleanup)

---

*Plan generated 2026-06-20. Based on `GOALS_FEATURE_ANALYSIS.md` (browser source) and `GOALS_GAP_ANALYSIS.md` (gap analysis). Another engineer can execute this plan without access to the browser codebase or prior context.*
