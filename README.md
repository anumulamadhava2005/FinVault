# FinVault Mobile

A standalone React Native port of the FinVault personal-finance app, built with
**Expo (SDK 56) + expo-router** and **React Native Paper**. All data lives
locally on-device in **SQLite** (expo-sqlite) — there is no backend.

## Modules (full parity with the web app)

| Screen | What it does |
|---|---|
| Dashboard | Net worth, portfolio, financial-health score, income-vs-expense trend, allocation, goals overview |
| Assets | Holdings, allocation pie, allocation-vs-benchmark (Recommended-first), add/delete |
| Expenses | Monthly total vs budget, per-category bars, recent expenses, add/delete |
| Loans | Outstanding/EMI KPIs, Original-vs-Outstanding grouped bars, debt-health ratios, EMI/prepay/delete |
| Protect | Coverage KPIs, coverage-by-type pie, policy list, add/delete |
| Goals | Timeline status (On Track / Behind / Overdue) with status-coloured bar + "expected by today" pace marker, required-monthly, Target-vs-Achieved chart |
| Vault | Credential list, strength meter, show/hide, password generator, add/delete |
| Reports | Module-selectable export (Expenses excluded by design) via the native share sheet |
| Settings | Profile edit, theme (light/dark/auto), preferences |

## Architecture

```
src/
  app/            expo-router routes (Drawer) — each file re-exports a screen
  screens/        screen implementations
  components/     ui.tsx (cards, KPIs, progress bar, status chip), charts.tsx
  services/       finance.ts (logic ported from the web app's services.py), constants.ts
  db/             schema.ts, index.ts (sync expo-sqlite helpers), seed.ts (demo data)
  models/         TypeScript table models
  context/        AppContext (DB init, theme mode, refresh signal)
  theme/          Paper light/dark themes + shared chart colours
  utils/          money (paise) + date helpers
```

Money is stored as **integer paise** and dates as ISO `YYYY-MM-DD` strings, matching
the web backend. The finance calculations (portfolio, net worth, loan/debt health,
goal timeline, protection summary, benchmark, financial-health score) are direct
ports of `services.py`.

## Run

This is a **prebuilt** project (native `android/` and `ios/` already generated).

```bash
npm install            # if not already installed
npm run android        # build + run on an Android device/emulator
npm run ios            # build + run on iOS (macOS + Xcode)
npm start              # Metro only (e.g. with a dev client)
```

> Building the native app requires Android Studio (Android) or Xcode (iOS).
> On first launch the database is created and seeded with demo data so every
> screen is populated.

## Validate without a device

```bash
npx tsc --noEmit                                            # type-check
npx expo export --platform android --output-dir /tmp/out    # full Metro bundle
```
