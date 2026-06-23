# FinVault Visual Structure & Architecture

## 📱 App Navigation & Screen Layout

```
┌─────────────────────────────────────────────────────┐
│  FinVault App (Expo + React Native)                 │
│  Entry: src/app/_layout.tsx (Drawer Navigator)      │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
    [DRAWER]              [SCREENS]
        │                     │
    ┌───┼──────────┐         │
    │   │          │         │
 [Profile] [Menu] [Search]   │
    │      │                 │
    │  ┌───┴──────────────────┼────────────┐
    │  │  FINANCES            │  SECURITY  │
    │  │  ├─ Dashboard        │  ├─ Vault  │
    │  │  ├─ Assets  ─────────┼──┤ Protect │
    │  │  ├─ Expenses         │  │         │
    │  │  ├─ Loans      ❌    │  └─────────┘
    │  │  ├─ Goals  ──────────┤
    │  │  ├─ Reports         │
    │  └──┴─────────────────┘
    │
    └─ Settings, Lock App, Delete Profile
```

---

## 🎯 Button Placement by Screen

### AssetsScreen
```
┌─────────────────────────────────────────┐
│ Portfolio Summary                       │
├─────────────────────────────────────────┤
│ 🔍 Search | 🔄 Sort                     │
├─────────────────────────────────────────┤
│ Holdings       [📊 Select] [⬆️ Import]  │ ← Buttons
├─────────────────────────────────────────┤
│ • Stock ABC                    $100,000 │
│ • Mutual Fund XYZ              $50,000  │
│ • Gold ETF                     $25,000  │
├─────────────────────────────────────────┤
│                                         │
│              🔘 + Add Asset (FAB)       │ ← FAB Button
│                                         │ (Bottom-right)
└─────────────────────────────────────────┘
```

### GoalsDashboardScreen
```
┌─────────────────────────────────────────┐
│ Goal Funds Summary                      │
├─────────────────────────────────────────┤
│ 🔍 Search                               │
│ 🔽 Filter | 🔄 Sort                    │
├─────────────────────────────────────────┤
│ Goals       [Cards|Focus] View          │
├─────────────────────────────────────────┤
│ 🏠 Home Purchase     [████████░] 80%   │
│ 🎓 Education Fund    [██░░░░░░░] 20%   │
│ 🚗 Car Purchase      [███░░░░░░] 30%   │
├─────────────────────────────────────────┤
│                                         │
│              🔘 + Add Goal (FAB)        │ ← FAB Button
│                                         │ (Bottom-right)
└─────────────────────────────────────────┘
```

### ProtectScreen
```
┌─────────────────────────────────────────┐
│ Total Coverage: ₹50,00,000              │
├─────────────────────────────────────────┤
│ 🔍 Search                               │
│ Policies     [Add] [🔄 Sort] [🔽 Type] │ ← Header Buttons
├─────────────────────────────────────────┤
│ • Life Insurance - HDFC             ... │
│ • Health Insurance - Apollo         ... │
│ • Motor Insurance - Bajaj           ... │
├─────────────────────────────────────────┤
│                                         │
│           (No FAB - Uses Header)        │
│                                         │
└─────────────────────────────────────────┘
```

---

## 📂 Component Architecture

```
src/
├── 🎯 app/                    (Expo Router Routes)
│   ├── _layout.tsx            (Main navigator, drawer)
│   ├── index.tsx              → DashboardScreen
│   ├── assets/
│   │   ├── index.tsx          → AssetsScreen
│   │   ├── add.tsx            → AddAssetScreen
│   │   └── [id]/
│   ├── goals/
│   │   ├── index.tsx          → GoalsDashboardScreen
│   │   └── [id]/
│   ├── protect.tsx            → ProtectScreen
│   ├── liabilities/           ❌ EMPTY
│   └── loans.tsx              ❌ NOT IMPLEMENTED
│
├── 🖼️ screens/                (Screen Components)
│   ├── AssetsScreen.tsx
│   │   ├── ✅ FAB Button (Add Asset)
│   │   ├── ✅ Import Button
│   │   ├── Search/Filter/Sort
│   │   └── Asset List
│   │
│   ├── goals/
│   │   └── GoalsDashboardScreen.tsx
│   │       ├── ✅ FAB Button (Add Goal)
│   │       ├── 3-Step Dialog
│   │       ├── View Toggle
│   │       └── Goal List/Cards
│   │
│   ├── ProtectScreen.tsx
│   │   ├── ✅ Header Button (Add Insurance)
│   │   ├── Summary Card
│   │   ├── Search/Filter/Sort
│   │   └── Policy Cards
│   │
│   └── liabilities/           ❌ NOT CREATED YET
│       └── LiabilitiesScreen.tsx
│
├── 🧩 components/             (Reusable Components)
│   ├── BouncePressable.tsx    (Haptic wrapper)
│   ├── ui.tsx                 (Screen, Card, Button, etc.)
│   ├── charts.tsx             (Charts)
│   │
│   ├── assets/
│   │   ├── BulkImportModal.tsx
│   │   ├── AssetForm.tsx
│   │   ├── AssetRow.tsx
│   │   ├── AssetTypeTabs.tsx
│   │   ├── SIPModal.tsx
│   │   └── ...
│   │
│   └── goals/
│       ├── GoalRingCard.tsx
│       ├── GoalTimeline.tsx
│       └── ...
│
├── 🎨 theme/                  (Design Tokens)
│   └── index.ts
│
├── 🔄 context/                (State Management)
│   └── AppContext.tsx
│
├── 🪝 hooks/                  (Custom Hooks)
│   ├── useData.ts
│   ├── assets/
│   │   ├── useSIPConfig.ts
│   │   └── useRefreshPrices.ts
│   └── ...
│
├── 🗄️ db/                     (SQLite Database)
│   ├── index.ts               (CRUD operations)
│   ├── schema.ts              (Table definitions)
│   └── seed.ts                (Demo data)
│
└── 📚 utils/                  (Utilities)
    ├── money.ts               (Formatting, conversions)
    ├── date.ts                (Date handling)
    └── ...
```

---

## 🔄 Data Flow for Button Actions

### Asset Creation Flow
```
User Clicks FAB
    ↓
router.push('/assets/add')
    ↓
AddAssetScreen Component
    ↓
User fills form → Submit
    ↓
insert('assets', {...})
    ↓
DB: INSERT into assets table
    ↓
router.push('/assets')  [go back]
    ↓
AssetsScreen re-fetches data
    ↓
useData() → all<Asset>(...)
    ↓
Component re-renders with new asset
```

### Goal Creation Flow
```
User Clicks FAB
    ↓
setAddOpen(true), setStep(1)
    ↓
Dialog opens (Step 1: Details)
    ↓
User fills name, type, amount → "Next"
    ↓
Dialog shows Step 2: Schedule
    ↓
User fills target date, monthly → "Next"
    ↓
Dialog shows Step 3: Funding
    ↓
User links assets with allocations → "Create Goal"
    ↓
saveGoal() function
    ↓
insert('financial_goals', {...})
insert('goal_asset_links', {...})  [for each linked asset]
    ↓
DB: INSERT into goals & links tables
    ↓
setAddOpen(false), setStep(1)
    ↓
GoalsDashboardScreen re-fetches
    ↓
Component re-renders with new goal
```

### Insurance Creation Flow
```
User Clicks [Add] Header Button
    ↓
setAddOpen(true)
    ↓
Dialog opens with form
    ↓
User fills all fields (policy type, name, coverage, etc)
    ↓
User clicks "Add Policy" button
    ↓
save() function
    ↓
insert('insurance_policies', {...})
    ↓
DB: INSERT into insurance_policies table
    ↓
setAddOpen(false)
    ↓
ProtectScreen re-fetches data
    ↓
Component re-renders with new policy
```

### Asset Import Flow
```
User Clicks [Import] Text Button
    ↓
setImportOpen(true)
    ↓
BulkImportModal opens (Step: pick)
    ↓
User clicks [Pick CSV File]
    ↓
DocumentPicker opens → User selects CSV
    ↓
parseCSV(content) → Extract headers & rows
    ↓
Modal moves to Step: map
    ↓
Auto-map headers to fields
    ↓
User reviews mapping, clicks [Import]
    ↓
doImport() function
    ↓
for each row in CSV:
    validate required fields
    ↓
    tx((db) => {
      db.runSync('INSERT INTO assets ...')
    })
    ↓
Modal moves to Step: result
    ↓
Shows import summary (200 imported, 3 failed)
    ↓
User clicks [Done]
    ↓
setImportOpen(false)
    ↓
AssetsScreen re-fetches
    ↓
Component re-renders with imported assets
```

---

## 🎨 Theme & Styling Hierarchy

```
theme.colors
├── primary              (Main action color)
│   ├── Used by: FAB background, button filled
│   └── Example: ₹ Add Asset button
│
├── secondary            (Alternative color)
│   └── Used for: secondary actions
│
├── surface              (Background cards)
│   └── Used by: Card background, input fields
│
├── surfaceVariant       (Subtle background)
│   └── Used by: Hover states
│
├── onSurface            (Text on surface)
│   └── Default text color
│
├── onSurfaceVariant     (Secondary text)
│   └── Hints, subtitles, muted text
│
└── ...more colors

Button Modes:
├── "contained"          (Filled, primary color)
├── "contained-tonal"    (Filled, secondary color) ← Used for Add Insurance
├── "outlined"           (Border only)
└── "text"               (No background) ← Used for Import
```

---

## 📋 Forms & Dialogs Structure

### Simple Dialog (Insurance)
```
┌─────────────────────────────────────────┐
│ Add Policy                              │
├─────────────────────────────────────────┤
│ Policy Type [dropdown]                  │
│ Policy Name [text field]                │
│ Provider [text field]                   │
│ Coverage (₹) [number]                   │
│ Premium (₹) [number] [frequency]        │
│ Start Date [date picker]                │
│ Expiry Date [date picker]               │
│ ... more fields                         │
├─────────────────────────────────────────┤
│ [Cancel] [Add Policy]                   │
└─────────────────────────────────────────┘
```

### Multi-Step Dialog (Goals)
```
┌─────────────────────────────────────────┐
│ Add Goal — Step 1 of 3 (Details)        │
├─────────────────────────────────────────┤
│ Goal name [text]                        │
│ Goal Type [Selectable] 🎓               │
│ Target amount (₹) [number]              │
├─────────────────────────────────────────┤
│ [Cancel] [Next →]                       │
└─────────────────────────────────────────┘
        ↓ (User clicks Next)
┌─────────────────────────────────────────┐
│ Add Goal — Step 2 of 3 (Schedule)       │
├─────────────────────────────────────────┤
│ Target Date (optional) [date picker]    │
│ Monthly contribution (₹) [number]       │
├─────────────────────────────────────────┤
│ [← Back] [Next →]                       │
└─────────────────────────────────────────┘
        ↓ (User clicks Next)
┌─────────────────────────────────────────┐
│ Add Goal — Step 3 of 3 (Funding)        │
├─────────────────────────────────────────┤
│ Link assets to fund this goal           │
│                                         │
│ ☐ Stock ABC - ₹100k [Alloc: 100%]      │
│ ☑ Mutual Fund - ₹50k [Alloc: 50%]      │
│ ☐ Gold ETF - ₹25k                      │
├─────────────────────────────────────────┤
│ [← Back] [Create Goal]                  │
└─────────────────────────────────────────┘
```

---

## 🚀 Button State Machine

```
┌─────────────────────────────────────────┐
│  [Add] Button States                    │
└─────────────────────────────────────────┘

DEFAULT
  ├─ Color: theme.colors.primary
  ├─ Opacity: 1
  └─ onPress: opens dialog/screen

PRESSED
  ├─ Scale: 0.96 (via BouncePressable)
  ├─ Duration: 100ms out, 140ms back
  └─ Haptic feedback triggered

DISABLED (if applicable)
  ├─ Opacity: 0.5-0.6
  ├─ Color: grayed out
  └─ onPress: disabled
```

---

## 📊 Feature Completion Matrix

| Feature | Implementation | Status | Location |
|---------|---|--------|----------|
| Dashboard | Screen | ✅ Complete | `src/screens/index.tsx` |
| Assets | Full CRUD + Import | ✅ Complete | `src/screens/AssetsScreen.tsx` |
| Goals | Full CRUD + Linking | ✅ Complete | `src/screens/goals/GoalsDashboardScreen.tsx` |
| Insurance | Full CRUD | ✅ Complete | `src/screens/ProtectScreen.tsx` |
| Loans | Not Started | ❌ TODO | `src/screens/liabilities/` |
| Expenses | Basic Tracking | ⚠️ Partial | `src/screens/ExpensesScreen.tsx` |
| Vault | Encryption | ✅ Complete | `src/screens/VaultScreen.tsx` |
| Reports | Analytics | ✅ Complete | `src/screens/ReportsScreen.tsx` |

---

## 🔧 File Relationships for "+ Add Loan" Implementation

```
Create these files:

1. src/screens/liabilities/LiabilitiesScreen.tsx
   ├── Import: Button, FAB, Dialog, useApp, useData
   ├── State: form, editLoanId, addOpen
   ├── Functions: save(), doDelete(), openDialog()
   └── Render: Summary, List, Dialog

2. src/app/liabilities/index.tsx
   └── export { default } from '@/screens/liabilities/LiabilitiesScreen';

3. Update: src/db/schema.ts (if needed)
   └── Add: CREATE TABLE loans (...)

4. Update: src/app/_layout.tsx (if needed)
   └── Drawer.Screen name="liabilities" or "loans"

5. Optional: src/components/liabilities/LoanForm.tsx
   └── Separate form component for reusability
```

