# FinVault Codebase Exploration Report

## 1. Project Structure Overview

### Root Architecture
```
/FinVault
├── src/
│   ├── app/           # Expo Router navigation structure
│   ├── screens/       # Screen implementations
│   ├── components/    # Reusable UI components
│   ├── context/       # React context (AppContext)
│   ├── db/            # SQLite database setup
│   ├── hooks/         # Custom React hooks
│   ├── models/        # TypeScript types
│   ├── services/      # Business logic (finance calculations, constants)
│   ├── stores/        # State management (Zustand)
│   ├── theme/         # Design tokens and theme
│   ├── utils/         # Utility functions (date, money, crypto)
│   ├── api/           # API clients
│   └── screens/       # Additional screens directory
├── android/           # Native Android code
├── ios/               # Native iOS code
├── assets/            # Images and static assets
└── docs/              # Documentation
```

### App Navigation Structure (Drawer-based)
**Entry Point:** `src/app/_layout.tsx`

**Main Routes:**
- `index` → Dashboard
- `assets` → Assets Management
- `expenses` → Expenses Tracking
- `loans` → Loans/Liabilities *(empty - not implemented)*
- `goals` → Goals Management
- `reports` → Reports
- `vault` → Secure Vault
- `protect` → Insurance/Protection *(implemented as ProtectScreen)*
- `settings` → Settings

---

## 2. "+ Add Goal" Button Implementation

### Location: `src/screens/goals/GoalsDashboardScreen.tsx`

**FAB (Floating Action Button) Implementation:**
```tsx
// Line 657-668
<FAB
  icon="plus"
  label="Add Goal"
  style={{ 
    position: 'absolute', 
    right: 16, 
    bottom: Math.max(insets.bottom, 16) + 16 
  }}
  onPress={() => {
    setForm({ ...blank });
    setLinks({});
    setAllocPct({});
    setStep(1);
    setAddOpen(true);
  }}
/>
```

**Key Characteristics:**
- Uses react-native-paper `FAB` component
- **Positioning:** Absolute bottom-right with safe area insets (`Math.max(insets.bottom, 16) + 16`)
- **Styling:** Primary color with rounded corners, elevation 4
- Opens 3-step wizard dialog for creating goals
- Icon: "plus"
- Label: "Add Goal"

**Dialog Modal:**
- Lines 671-932: Multi-step goal creation dialog
- 3 steps: Details → Schedule → Funding
- Contains animations using `Animated` API

---

## 3. "+ Add Asset" Button Implementation

### Location: `src/screens/AssetsScreen.tsx`

**FAB (Floating Action Button) Implementation:**
```tsx
// Line 549-569
<BouncePressable
  onPress={() => router.push('/assets/add' as any)}
  style={{
    position: 'absolute',
    right: 16,
    bottom: selectMode ? 80 : 16,
    zIndex: 10,
  }}
>
  <FAB
    icon="plus"
    label="Add Asset"
    style={{
      backgroundColor: theme.colors.primary,
      borderRadius: 28,
      elevation: 4
    }}
    color={theme.colors.onPrimary}
    pointerEvents="none"
  />
</BouncePressable>
```

**Key Differences from Goals:**
- Wrapped in custom `BouncePressable` component for haptic feedback
- **Dynamic bottom position:** Moves up to `80px` when in select mode
- Routes to dedicated `/assets/add` screen instead of inline dialog
- Styling: Explicit `backgroundColor`, `borderRadius: 28`, `elevation: 4`

**Asset Addition Screen:**
- Route: `src/app/assets/add.tsx` 
- Referenced screen: `src/screens/assets/AddAssetScreen.tsx`

---

## 4. Import Functionality in Assets Page

### Location: `src/screens/AssetsScreen.tsx` (lines 671-680)

**Import Button:**
```tsx
// Line 497-499 in Holdings header
<Button 
  compact 
  mode="text" 
  icon="file-upload-outline" 
  onPress={() => setImportOpen(true)}
>
  Import
</Button>
```

**Import Modal Component:**
- `src/components/assets/BulkImportModal.tsx`
- Full implementation: Lines 105-472

**Import Workflow (3 Steps):**

1. **Pick Step** - File Selection
   - Opens file picker for CSV files
   - Detects headers and data rows
   - Auto-parses CSV format

2. **Map Step** - Column Mapping
   - Maps CSV columns to asset fields
   - Auto-detection using column header aliases
   - Preview of first 2 data rows
   - Required fields: `name`, `asset_type`, `invested_amount`

3. **Result Step** - Completion Summary
   - Shows count of imported assets
   - Shows count of failed rows
   - Transaction-based bulk insert

**Key Files:**
- CSV Parser: Custom parseCSV function (lines 78-103)
- Field Configuration: `ASSET_FIELDS` array (lines 21-36)
- Column Aliases: `ALIASES` mapping (lines 38-70)
- Import Logic: `doImport()` function (lines 193-255)

**Database Operations:**
- Uses transaction pattern: `tx((db) => { ... })`
- Inserts into `assets` table with all fields
- Validates asset types against `asset_types` table

---

## 5. Loans/Liabilities Page Location

### Status: **NOT YET IMPLEMENTED**

**File Structure:**
```
src/
├── app/liabilities/        # Empty directory
└── screens/liabilities/    # Empty directory (no screens)
```

**Navigation Entry:**
- Listed in drawer menu as "Loans" route (line 237 in _layout.tsx)
- Icon: 'bank'
- Route name: 'loans'

**Current Placeholder:**
- No component implemented
- Drawer shows route but will likely show blank/error screen

---

## 6. Insurance/Protection Page Implementation

### Location: `src/screens/ProtectScreen.tsx` (Complete Implementation)

**Page Entry:** `src/app/protect` → exports `ProtectScreen`

### Add Insurance Button
```tsx
// Line 546-558 in ProtectScreen
<Button
  mode="contained-tonal"
  icon="plus"
  compact
  onPress={() => {
    setForm({ ...blank });
    setEditPolicyId(null);
    setAddOpen(true);
  }}
  style={{ borderRadius: theme.roundness, marginRight: 4 }}
>
  Add
</Button>
```

**Key Characteristics:**
- **Style:** `contained-tonal` mode (secondary color)
- **Icon:** "plus"
- **Placement:** Top-right in policy header (line 544-679)
- **Size:** `compact`
- Opens dialog form inline (no navigation)
- Located with sort/filter controls

### Add Insurance Dialog
**Location:** Lines 872-1105

**Form Fields:**
```
Policy Type       (Menu selector, dropdown)
Policy Name       (Text input, required)
Provider/Insurer  (Text input)
Policy Number     (Text input)
Holder Name       (Text input)
Coverage Amount   (Numeric input, ₹)
Premium Amount    (Numeric input, ₹)
Premium Frequency (Menu: monthly/quarterly/half-yearly/yearly/one-time)
Start Date        (Date picker)
Expiry Date       (Date picker)
Next Due Date     (Date picker)
Nominee Name      (Text input)
Nominee Relationship (Text input)
Claim Ratio       (Numeric, %)
Tax Benefit       (Text input, e.g., "80D")
```

**Save Logic:**
- Create mode: INSERT into `insurance_policies`
- Edit mode: UPDATE existing policy
- All currency fields converted from INR string to paise (×100)
- Stores with timestamp: `created_at`

---

## 7. Button Styling Patterns

### Pattern 1: FAB (Floating Action Button) - Assets Style
```tsx
<BouncePressable>
  <FAB
    icon="plus"
    label="Add Asset"
    style={{
      backgroundColor: theme.colors.primary,
      borderRadius: 28,
      elevation: 4
    }}
    color={theme.colors.onPrimary}
  />
</BouncePressable>
```
- Used for: Asset creation
- Container: Absolute positioned with BouncePressable wrapper
- Animation: Custom bounce effect on press

### Pattern 2: FAB (Floating Action Button) - Goals Style
```tsx
<FAB
  icon="plus"
  label="Add Goal"
  style={{ 
    position: 'absolute', 
    right: 16, 
    bottom: Math.max(insets.bottom, 16) + 16 
  }}
  onPress={...}
/>
```
- Used for: Goal creation
- Container: Direct positioning
- Animation: Standard Material Design animation

### Pattern 3: Compact Button with Menu - Insurance Style
```tsx
<Button
  mode="contained-tonal"
  icon="plus"
  compact
  onPress={...}
  style={{ borderRadius: theme.roundness, marginRight: 4 }}
>
  Add
</Button>
```
- Used for: Insurance/Protection
- Style: `contained-tonal` (secondary)
- Size: `compact`
- Placement: Header inline with filters

---

## 8. Component File Locations

### Assets Components
```
src/components/assets/
├── AssetForm.tsx            # Form for adding/editing assets
├── AssetRow.tsx             # Individual asset list item
├── AssetTypeFieldConfig.ts  # Dynamic field configuration by type
├── AssetTypeTabs.tsx        # Filter tabs by asset type
├── BulkImportModal.tsx      # 3-step CSV import dialog
├── DatePickerField.tsx      # Date picker component
├── PerformanceChart.tsx     # Asset performance visualization
└── SIPModal.tsx             # SIP configuration dialog
```

### Goals Components
```
src/components/goals/
├── GoalRingCard.tsx         # Circular progress card view
├── GoalTimeline.tsx         # Timeline visualization
├── GoalTypeIcon.tsx         # Icon selector by goal type
└── MilestoneDots.tsx        # Progress indicator dots
```

### UI Components
```
src/components/
├── BouncePressable.tsx      # Haptic feedback wrapper
├── NotificationBell.tsx     # Notification icon
├── charts.tsx               # Chart components (DistributionPie, GroupedBars)
└── ui.tsx                   # Base components (Screen, SectionCard, Kpi, etc.)
```

---

## 9. Database Schema Context

### Relevant Tables for Button Implementation

**insurance_policies**
```sql
id, user_id, policy_type, policy_name, provider,
policy_number, holder_name, coverage_amount,
premium_amount, premium_frequency, start_date,
expiry_date, next_due_date, nominee_name,
nominee_relationship, claim_ratio, tax_benefit,
notes, status, riders, created_at
```

**financial_goals**
```sql
id, user_id, name, goal_type, target_amount,
monthly_needed, target_date, priority, icon,
color_hex, notes, is_completed, created_at
```

**assets**
```sql
id, user_id, asset_type_id, name, invested_amount,
current_value, quantity, investment_date,
purchase_date, maturity_date, isin, ticker,
current_nav, price_per_unit, guaranteed_return_pct,
notes, details_json, is_sip, sip_monthly_amount,
created_at
```

---

## 10. Key Design Patterns Observed

### State Management
- **useState** for local component state (forms, dialogs)
- **Zustand** for global state (goals store)
- **React Context** for app-wide state (AppContext)

### Data Fetching
- Custom **useData** hook for database queries
- Re-renders trigger on data changes
- Query memoization with dependencies

### Form Patterns
- Blank object initialization: `const blank = {...}`
- State updater: `const set = (k, v) => setForm(f => ({...f, [k]: v}))`
- Validation on save, not on input
- Dialog-based or screen-based forms

### Currency Handling
- All monetary values stored as **paise** (multiply by 100)
- Display using **formatINR()** utility
- Input from user as rupees (string), converted on save

### Animations
- **Animated API** for stagger, timing, spring effects
- Used extensively in dialogs and transitions
- Custom **BouncePressable** for haptic feedback

---

## 11. Key Insights for New Features

### For "+ Add Loan" Button
- Pattern: Should mirror Insurance/Protection style (compact button in header)
- Location: Would be in `src/screens/LiabilitiesScreen.tsx` (to be created)
- Styling: Use `mode="contained-tonal"` with icon="plus"
- Dialog: Would follow same pattern as ProtectScreen

### For Loans Screen Creation
1. Create `src/screens/liabilities/LiabilitiesScreen.tsx`
2. Create form components similar to insurance
3. Create database schema for loans table
4. Export from `src/app/liabilities/index.tsx`

### Button Positioning Strategy
- **FAB style** (floating): Use for primary creation actions (Assets, Goals)
- **Header button** (compact): Use for secondary creation actions (Insurance, Loans)

### Import Functionality Reuse
- BulkImportModal can be adapted for:
  - Insurance policies
  - Loans/Liabilities
  - Expenses
- Would require parameterized field configuration

---

## Summary of Key Files

| Feature | Primary File | Supporting Files |
|---------|--------------|------------------|
| + Add Goal | `goals/GoalsDashboardScreen.tsx:657` | Goal creation dialog, animations |
| + Add Asset | `AssetsScreen.tsx:549` | AddAssetScreen, AssetForm, BouncePressable |
| Import Assets | `AssetsScreen.tsx:497` | BulkImportModal, CSV parser |
| + Add Insurance | `ProtectScreen.tsx:546` | Insurance form, date pickers |
| Loans Page | *(Not implemented)* | Planned: LiabilitiesScreen |
| App Navigation | `app/_layout.tsx` | CustomDrawer, route configuration |

