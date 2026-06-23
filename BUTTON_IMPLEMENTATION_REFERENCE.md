# FinVault Button Implementation Quick Reference

## 📍 Three Button Patterns in FinVault

### Pattern 1: Floating Action Button (FAB) - PRIMARY ACTIONS
**Used for:** Asset & Goal Creation  
**Location:** Bottom-right corner, floating above content

#### Assets (+ Add Asset)
- **File:** `src/screens/AssetsScreen.tsx:549-569`
- **Component:** FAB wrapped in BouncePressable
- **Navigation:** Routes to `/assets/add` screen
- **Dynamic Behavior:** Bottom position changes with select mode
```tsx
<BouncePressable onPress={() => router.push('/assets/add')}>
  <FAB icon="plus" label="Add Asset" style={{
    backgroundColor: theme.colors.primary,
    borderRadius: 28,
    elevation: 4
  }} />
</BouncePressable>
```

#### Goals (+ Add Goal)
- **File:** `src/screens/goals/GoalsDashboardScreen.tsx:657-668`
- **Component:** FAB (direct, no wrapper)
- **Opens:** Inline 3-step wizard dialog
- **Position:** Adapts to insets: `Math.max(insets.bottom, 16) + 16`
```tsx
<FAB icon="plus" label="Add Goal" 
  style={{ position: 'absolute', right: 16, bottom: ... }}
  onPress={() => { setAddOpen(true); setStep(1); }} />
```

---

### Pattern 2: Compact Header Button (Secondary Actions)
**Used for:** Insurance/Protection Policy Creation  
**Location:** Top-right corner, inline with filters

#### Insurance (+ Add Insurance)
- **File:** `src/screens/ProtectScreen.tsx:546-558`
- **Component:** Button with mode="contained-tonal"
- **Opens:** Inline dialog form
- **Placement:** Header row with sort/filter controls
```tsx
<Button mode="contained-tonal" icon="plus" compact
  onPress={() => { setForm({...blank}); setAddOpen(true); }}
  style={{ borderRadius: theme.roundness, marginRight: 4 }}>
  Add
</Button>
```

---

### Pattern 3: Text Button in Content Area (Tertiary Actions)
**Used for:** Import & Utility Functions

#### Asset Import
- **File:** `src/screens/AssetsScreen.tsx:497-499`
- **Component:** Button with mode="text"
- **Opens:** BulkImportModal dialog
- **Placement:** Holdings header area
```tsx
<Button compact mode="text" icon="file-upload-outline"
  onPress={() => setImportOpen(true)}>
  Import
</Button>
```

---

## 🎯 Button Placement Strategy

| Action | Type | Position | Opens | Screen |
|--------|------|----------|-------|--------|
| + Add Asset | FAB | Bottom-right | /assets/add | AssetsScreen |
| + Add Goal | FAB | Bottom-right | Dialog | GoalsDashboardScreen |
| + Add Insurance | Button | Top-right | Dialog | ProtectScreen |
| Import Assets | Text Button | Header | Dialog | AssetsScreen |
| + Add Loan | ? | Top-right? | Dialog? | LiabilitiesScreen (TODO) |

---

## 🛠️ How to Implement "+ Add Loan"

### Step 1: Create Loans Screen
**File:** `src/screens/liabilities/LiabilitiesScreen.tsx`

Use ProtectScreen as template:
- Header with title "Loans"
- Top-right button group: [Add] [Sort] [Filter]
- Add button: `mode="contained-tonal"` with `icon="plus"`
- Dialog form with loan fields

### Step 2: Database Schema
Create loans table with fields:
```sql
id, user_id, lender_name, loan_type, principal_amount,
current_balance, interest_rate, frequency, 
start_date, end_date, next_due_date, 
monthly_payment, status, created_at
```

### Step 3: Export from Route
**File:** `src/app/liabilities/index.tsx`
```tsx
export { default } from '@/screens/liabilities/LiabilitiesScreen';
```

### Step 4: Add Button Code
```tsx
<Button
  mode="contained-tonal"
  icon="plus"
  compact
  onPress={() => {
    setForm({ ...blank });
    setEditLoanId(null);
    setAddOpen(true);
  }}
  style={{ borderRadius: theme.roundness, marginRight: 4 }}
>
  Add
</Button>
```

---

## 📝 Form Dialog Patterns

### Insurance Dialog (ProtectScreen)
- **Lines:** 872-1105
- **Type:** Inline edit/create
- **Fields:** 14 input fields across 3 sections
- **Save Logic:** INSERT or UPDATE to `insurance_policies`
- **Validation:** Policy name required

### Goals Dialog (GoalsDashboardScreen)
- **Lines:** 671-932
- **Type:** 3-step wizard with transitions
- **Steps:** Details → Schedule → Funding
- **Animations:** Fade + slide transitions
- **Asset Linking:** Checkboxes with allocation percentages

### Recommended for Loans
- Simpler than goals (no multi-step)
- More fields than insurance (consider sections)
- Could use: Loan Details → Payment Schedule
- Or single-screen dialog like insurance

---

## 🎨 Styling Classes Used

### BouncePressable
- **Purpose:** Haptic feedback + scale animation
- **Usage:** Wrap any pressable component
- **File:** `src/components/BouncePressable.tsx`
- **Animation:** Scale to 0.96 on press, back to 1 on release

### Theme Colors
- **Primary:** theme.colors.primary (main action color)
- **Contained-Tonal:** Lighter version of primary
- **Text Mode:** No background, primary text color

---

## 🔄 State Management in Forms

### Standard Pattern
```tsx
const blank = { field1: '', field2: '', ... };
const [form, setForm] = useState({ ...blank });
const [editId, setEditId] = useState<string | null>(null);

const set = (k: keyof typeof form, v: string) => 
  setForm(f => ({ ...f, [k]: v }));

const save = () => {
  // Validate form
  if (editId) {
    // UPDATE
  } else {
    // INSERT
  }
};
```

### Currency Handling
```tsx
import { rupeesToPaise, formatINR } from '@/utils/money';

// Input to DB: Convert ₹ to paise
const paise = rupeesToPaise(form.amount || '0');
db.runSync('INSERT INTO table (amount) VALUES (?)', [paise]);

// DB to Display: Convert paise to ₹
const display = formatINR(row.amount); // Shows as "₹1,00,000"
```

---

## 📊 Data Flow Examples

### Creating an Insurance Policy
1. User clicks "+ Add" button
2. Dialog opens with blank form
3. User fills fields, clicks "Add Policy"
4. Form validates (policy_name required)
5. Data saved to `insurance_policies` table
6. Component re-renders, shows new policy in list

### Creating an Asset
1. User clicks "+ Add Asset" FAB
2. Routes to `/assets/add` screen
3. User fills AssetForm (multi-type support)
4. Submits, saves to `assets` table
5. Routes back to AssetsScreen
6. AssetsScreen re-fetches data

### Importing Assets
1. User clicks "Import" button
2. BulkImportModal opens (step: pick)
3. User picks CSV file
4. Modal moves to "map" step
5. User confirms column mapping
6. Modal moves to "result" step
7. Batch insert via transaction
8. Shows import summary

---

## 🚀 Component Import Examples

```tsx
// For Material Design Button/FAB
import { Button, FAB } from 'react-native-paper';

// For routing in screen
import { useRouter } from 'expo-router';

// For custom bounce animation
import BouncePressable from '@/components/BouncePressable';

// For database
import { insert, run, tx } from '@/db';
import { newId } from '@/db';

// For utilities
import { rupeesToPaise, formatINR } from '@/utils/money';
import { nowISO } from '@/utils/date';

// For app context
import { useApp } from '@/context/AppContext';

// For alerts
import { Alert } from 'react-native';
```

---

## ✅ Checklist for New Button/Feature

- [ ] Create screen component in `src/screens/[feature]/`
- [ ] Export from route in `src/app/[feature]/index.tsx`
- [ ] Implement "+ Add" button in header or FAB
- [ ] Create form dialog component (inline or separate)
- [ ] Implement save/create logic with validation
- [ ] Handle database INSERT/UPDATE transactions
- [ ] Add delete confirmation dialog
- [ ] Implement search/filter/sort if applicable
- [ ] Test with both light and dark themes
- [ ] Verify safe area insets on bottom elements

