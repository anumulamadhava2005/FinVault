/**
 * Seed helpers to populate FinVault database.
 * Seeds either core metadata only (for fresh profiles) or full realistic portfolios
 * (for demo mode) using the custom signed-up user's information.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { encryptText } from '../utils/crypto';

const uid = () => Crypto.randomUUID();
const R = (rupees: number) => Math.round(rupees * 100); // rupees -> paise

/**
 * Seeds core lookup data (asset types and default expense categories) for a new user.
 * Returns a mapping of asset type slugs to their created UUIDs.
 */
export const seedInitialMetadata = (db: SQLiteDatabase, userId: string): Record<string, string> => {
  const assetTypesMap: Record<string, string> = {};

  db.withTransactionSync(() => {
    const types = [
      ['Mutual Funds', 'mutual_fund'],
      ['Equity', 'equity'],
      ['Fixed Deposit', 'fd'],
      ['Real Estate', 'real_estate'],
      ['Gold', 'digital_gold'],
      ['Physical Gold', 'physical_gold'],
      ['Sovereign Gold Bond', 'sgb'],
      ['PPF', 'ppf'],
      ['NPS', 'nps'],
      ['Bank Account', 'savings'],
    ];

    types.forEach(([name, slug], i) => {
      const existing = db.getFirstSync<{ id: string }>('SELECT id FROM asset_types WHERE slug = ?', [slug]);
      if (existing) {
        assetTypesMap[slug] = existing.id;
      } else {
        const id = uid();
        assetTypesMap[slug] = id;
        db.runSync('INSERT INTO asset_types (id, name, slug, sort_order) VALUES (?, ?, ?, ?)', [id, name, slug, i]);
      }
    });

    const categories = [
      ['Food & Dining',  25000, '#E0922B'],
      ['Transport',       8000, '#4A7C6F'],
      ['Utilities',       6000, '#7FB5A8'],
      ['Rent',           35000, '#2D3142'],
      ['Shopping',       12000, '#D4956A'],
      ['Health',          5000, '#52A77E'],
      ['Entertainment',   6000, '#9DD1C2'],
      ['Education',       8000, '#7B68EE'],
      ['Subscriptions',   3000, '#EC4899'],
      ['Investments',        0, '#4A7C6F'],
    ];

    categories.forEach(([name, budget, color], i) => {
      const existing = db.getFirstSync<{ id: string }>(
        'SELECT id FROM expense_categories WHERE user_id = ? AND name = ?', [userId, name]
      );
      if (!existing) {
        db.runSync(
          `INSERT INTO expense_categories (id, user_id, name, is_system, budget_amount, sort_order, color_hex)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uid(), userId, name, 1, R(budget as number), i, color]
        );
      }
    });
  });

  return assetTypesMap;
};

/**
 * Seeds a full portfolio of realistic demo data for Arjun Mehta — a Bengaluru-based
 * IT professional with an aggressive risk profile and diversified Indian portfolio.
 */
export const seedDemoData = (db: SQLiteDatabase, userId: string, masterPassword?: string): void => {
  const types = seedInitialMetadata(db, userId);

  const ins = (table: string, row: Record<string, unknown>) => {
    const keys = Object.keys(row);
    const vals = keys.map((k) => {
      const v = row[k];
      return v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v;
    });
    db.runSync(
      `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      vals as any[],
    );
  };

  db.withTransactionSync(() => {
    db.runSync('DELETE FROM sip_schedules WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM assets WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM loans WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM insurance_policies WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM financial_goals WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM expenses WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM income WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM vault_credentials WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM vault_credential_categories WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM notifications WHERE user_id = ?', [userId]);

    // extra can override purchase_date/investment_date for unique per-asset dates
    const A = (type: string, name: string, invested: number, current: number, qty = 0, extra: Record<string, unknown> = {}) => {
      const id = uid();
      ins('assets', {
        id, user_id: userId, asset_type_id: types[type], name,
        invested_amount: R(invested), current_value: R(current), quantity: qty,
        purchase_date: '2024-04-01', investment_date: '2024-04-01',
        is_sip: 0, sip_monthly_amount: 0, notes: null, created_at: '2024-04-01',
        ...extra,
      });
      return id;
    };

    // ── EQUITIES — Large Cap ──────────────────────────────────────────────
    A('equity','TCS',229200,257400,60,{ ticker:'TCS.NS', isin:'INE467B01029', price_per_unit:4290, purchase_date:'2024-04-02', investment_date:'2024-04-02' });
    const aHdfcBank = A('equity','HDFC Bank',215250,267000,150,{ ticker:'HDFCBANK.NS', isin:'INE040A01034', price_per_unit:1780, purchase_date:'2024-04-05', investment_date:'2024-04-05' });
    A('equity','Infosys',149000,168000,100,{ ticker:'INFY.NS', isin:'INE009A01021', price_per_unit:1680, purchase_date:'2024-04-09', investment_date:'2024-04-09' });
    A('equity','Reliance Industries',202650,222600,70,{ ticker:'RELIANCE.NS', isin:'INE002A01018', price_per_unit:3180, purchase_date:'2024-04-15', investment_date:'2024-04-15' });

    // ── EQUITIES — Mid Cap ────────────────────────────────────────────────
    A('equity','Pidilite Industries',122400,146250,45,{ ticker:'PIDILITIND.NS', isin:'INE318A01026', price_per_unit:3250, purchase_date:'2024-05-03', investment_date:'2024-05-03' });
    A('equity','Titan Company',115150,134400,35,{ ticker:'TITAN.NS', isin:'INE280A01028', price_per_unit:3840, purchase_date:'2024-05-10', investment_date:'2024-05-10' });
    A('equity','Bajaj Finance',143600,168400,20,{ ticker:'BAJFINANCE.NS', isin:'INE296A01024', price_per_unit:8420, purchase_date:'2024-05-20', investment_date:'2024-05-20' });
    A('equity','Tata Power',118500,147000,300,{ ticker:'TATAPOWER.NS', isin:'INE245A01021', price_per_unit:490, purchase_date:'2025-04-04', investment_date:'2025-04-04' });

    // ── EQUITIES — Small Cap ──────────────────────────────────────────────
    A('equity','Kaynes Technology',69600,102400,20,{ ticker:'KAYNES.NS', isin:'INE918Z01016', price_per_unit:5120, purchase_date:'2024-06-01', investment_date:'2024-06-01' });
    A('equity','Narayana Hrudalaya',71000,99000,50,{ ticker:'NH.NS', isin:'INE410P01011', price_per_unit:1980, purchase_date:'2024-06-10', investment_date:'2024-06-10' });

    // ── MUTUAL FUNDS ──────────────────────────────────────────────────────
    const aAxisBlue = A('mutual_fund','Axis Bluechip Fund - Direct Growth',46920,58183,850,{
      isin:'INF846K01EW2', ticker:'AXISC.NS', current_nav:68.45,
      is_sip:1, sip_monthly_amount:R(5000), purchase_date:'2024-04-03', investment_date:'2024-04-03',
    });
    const aNipponMid = A('mutual_fund','Nippon India Mid Cap Fund - Direct Growth',219000,298320,1200,{
      isin:'INF204K01A78', current_nav:248.60,
      is_sip:1, sip_monthly_amount:R(10000), purchase_date:'2024-04-12', investment_date:'2024-04-12',
    });
    const aPpfas = A('mutual_fund','PPFAS Flexi Cap Fund - Direct Growth',37680,50520,600,{
      isin:'INF879O01027', current_nav:84.20,
      is_sip:1, sip_monthly_amount:R(3000), purchase_date:'2024-07-01', investment_date:'2024-07-01',
    });
    const aMirae = A('mutual_fund','Mirae Asset ELSS Tax Saver - Direct Growth',21150,29050,500,{
      isin:'INF769K01EW1', current_nav:58.10,
      is_sip:1, sip_monthly_amount:R(2000), purchase_date:'2024-07-15', investment_date:'2024-07-15',
    });
    A('mutual_fund','Motilal Oswal Nifty Smallcap 250 Index - Direct Growth',10720,13800,400,{
      isin:'INF247L01792', current_nav:34.50, purchase_date:'2025-04-07', investment_date:'2025-04-07',
    });

    // ── DIGITAL GOLD ──────────────────────────────────────────────────────
    const aSbiGold = A('digital_gold','SBI Gold ETF',102750,124800,15,{
      ticker:'GOLDBEES.NS', price_per_unit:8320, purchase_date:'2024-04-22', investment_date:'2024-04-22',
    });
    A('digital_gold','Nippon Gold BeES',56800,66560,8,{
      ticker:'GOLDBEES.NS', price_per_unit:8320, purchase_date:'2025-04-14', investment_date:'2025-04-14',
    });

    // ── PHYSICAL GOLD ─────────────────────────────────────────────────────
    A('physical_gold','22K Gold Jewelry',261900,342000,45,{
      details_json:JSON.stringify({ purity:'22K', type:'jewelry' }),
      purchase_date:'2024-04-29', investment_date:'2024-04-29',
    });
    A('physical_gold','24K Gold Coins',610000,780000,100,{
      details_json:JSON.stringify({ purity:'24K', type:'coins' }),
      purchase_date:'2024-08-15', investment_date:'2024-08-15',
    });

    // ── FIXED DEPOSITS ────────────────────────────────────────────────────
    const aHdfcFd = A('fd','HDFC Bank FD',500000,623000,0,{
      maturity_date:'2027-04-01', guaranteed_return_pct:7.25,
      details_json:JSON.stringify({ account_no:'FD-HDFC-2024-001', nominee:'Priya Mehta' }),
      purchase_date:'2024-04-01', investment_date:'2024-04-01',
    });
    const aSbiFd = A('fd','SBI Fixed Deposit',200000,229000,0,{
      maturity_date:'2026-06-15', guaranteed_return_pct:7.0,
      details_json:JSON.stringify({ account_no:'FD-SBI-2024-002', nominee:'Priya Mehta' }),
      purchase_date:'2024-06-15', investment_date:'2024-06-15',
    });
    A('fd','Bajaj Finance FD',150000,175000,0,{
      maturity_date:'2027-04-01', guaranteed_return_pct:8.1,
      details_json:JSON.stringify({ account_no:'FD-BFL-2025-001', nominee:'Priya Mehta' }),
      purchase_date:'2025-04-01', investment_date:'2025-04-01',
    });

    // ── SOVEREIGN GOLD BONDS ──────────────────────────────────────────────
    A('sgb','SGB 2024-25 Series I',125260,162000,20,{
      isin:'IN0020240028', maturity_date:'2032-06-03', guaranteed_return_pct:2.5,
      price_per_unit:8100, details_json:JSON.stringify({ coupon_rate:2.5 }),
      purchase_date:'2024-06-03', investment_date:'2024-06-03',
    });
    A('sgb','SGB 2025-26 Series II',72180,81000,10,{
      isin:'IN0020250042', maturity_date:'2033-09-22', guaranteed_return_pct:2.5,
      price_per_unit:8100, details_json:JSON.stringify({ coupon_rate:2.5 }),
      purchase_date:'2025-09-22', investment_date:'2025-09-22',
    });

    // ── PPF ───────────────────────────────────────────────────────────────
    A('ppf','PPF Account - SBI',150000,161000,0,{
      maturity_date:'2038-04-05', guaranteed_return_pct:7.1,
      details_json:JSON.stringify({ account_no:'PPF-SBI-12345', nominee:'Priya Mehta' }),
      purchase_date:'2024-04-05', investment_date:'2024-04-05',
    });

    // ── NPS ───────────────────────────────────────────────────────────────
    const aNps = A('nps','NPS Tier I - HDFC Pension',240000,282000,0,{
      is_sip:1, sip_monthly_amount:R(5000),
      details_json:JSON.stringify({ pran:'110123456789', nps_scheme:'auto' }),
      purchase_date:'2024-04-10', investment_date:'2024-04-10',
    });

    // ── REAL ESTATE ───────────────────────────────────────────────────────
    const aPlot = A('real_estate','Residential Plot - Whitefield, Bengaluru',3500000,4400000,0,{
      details_json:JSON.stringify({ area_sqft:'2400', location:'Whitefield, Bengaluru - KIADB Layout, Plot 42' }),
      purchase_date:'2024-04-01', investment_date:'2024-04-01',
    });
    A('real_estate','2BHK Apartment - Electronic City, Bengaluru',7200000,7800000,0,{
      details_json:JSON.stringify({ area_sqft:'1050', location:'Electronic City Phase 1, Bengaluru' }),
      purchase_date:'2025-06-15', investment_date:'2025-06-15',
    });

    // ── SIP SCHEDULES ─────────────────────────────────────────────────────
    const nextDue = (day: number): string => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    ([
      [aAxisBlue,   R(5000),   5, 10, '2024-05-05'],
      [aNipponMid,  R(10000), 10, 15, '2024-05-10'],
      [aPpfas,      R(3000),   1, 10, '2024-08-01'],
      [aMirae,      R(2000),  15,  0, '2024-08-15'],
      [aNps,        R(5000),  10,  0, '2024-05-10'],
    ] as const).forEach(([assetId, amount, day, stepUp, startDate]) =>
      ins('sip_schedules', {
        id:uid(), user_id:userId, asset_id:assetId,
        amount, frequency:'monthly', next_due_date:nextDue(day),
        status:'active', day_of_month:day, annual_step_up_pct:stepUp,
        start_date:startDate, end_date:null, linked_bank:null,
      })
    );

    // ── GOALS ─────────────────────────────────────────────────────────────
    const G = (name: string, type: string, target: number, date: string) => {
      const id = uid();
      ins('financial_goals', {
        id, user_id:userId, name, goal_type:type,
        target_amount:R(target), monthly_needed:R(10000), target_date:date,
        priority:'high', icon:'flag', color_hex:'#2F8F6F',
        notes:null, is_completed:false, created_at:'2024-04-01',
      });
      return id;
    };
    const lnk = (gId: string, aId: string, pct: number) =>
      ins('goal_asset_links', { id:uid(), goal_id:gId, asset_id:aId, allocation_pct:pct });

    const gRetire   = G('Early Retirement',         'retirement', 50000000, '2045-04-01');
    lnk(gRetire, aNipponMid, 50); lnk(gRetire, aAxisBlue, 50);

    const gEdu      = G("Daughter's Education",     'education',   8000000, '2038-06-30');
    lnk(gEdu, aPpfas, 40); lnk(gEdu, aMirae, 60);

    const gTrip     = G('Europe + Japan Trip',       'travel',       800000, '2027-12-31');
    lnk(gTrip, aSbiGold, 100);

    const gEmerg    = G('Emergency Corpus',          'emergency',   1500000, '2027-03-31');
    lnk(gEmerg, aHdfcFd, 60); lnk(gEmerg, aSbiFd, 40);

    const gHome     = G('Dream Home Downpayment',    'home',        4000000, '2028-04-01');
    lnk(gHome, aPlot, 100);

    // ── LOANS ─────────────────────────────────────────────────────────────
    ([
      ['home',    'HDFC Bank',  'HL-HDFC-2023-001',  6500000, 5850000, 8.75, 55000, '2023-04-01', '2053-04-01', '2026-07-05', 'floating'],
      ['vehicle', 'ICICI Bank', 'VL-ICICI-2024-001', 1200000,  820000, 9.50, 22000, '2024-08-01', '2028-08-01', '2026-07-08', 'fixed'],
    ] as const).forEach(([type, provider, acct, orig, out, rate, emi, start, end, nextDue2, iType]) =>
      ins('loans', {
        id:uid(), user_id:userId, loan_type:type, provider, account_number:acct,
        borrower_name:'Arjun Mehta',
        original_amount:R(orig), outstanding_amount:R(out),
        interest_rate:rate, emi_amount:R(emi),
        start_date:start, end_date:end, next_due_date:nextDue2,
        prepayment_total:0, notes:null, status:'active',
        interest_type:iType, created_at:'2024-04-01',
      })
    );

    // ── INSURANCE POLICIES ────────────────────────────────────────────────
    ([
      ['life',     'Max Life Smart Term Plan',             'Max Life Insurance',  20000000,  22500, '2054-04-01'],
      ['health',   'Niva Bupa Health Companion',           'Niva Bupa',            2000000,  28500, '2027-03-31'],
      ['vehicle',  'Bajaj Allianz Vehicle Comprehensive',  'Bajaj Allianz',        1200000,  14200, '2027-03-15'],
      ['accident', 'HDFC Life Click 2 Protect',            'HDFC Life',            5000000,   8400, '2048-04-01'],
    ] as const).forEach(([type, name, provider, coverage, premium, expiry]) =>
      ins('insurance_policies', {
        id:uid(), user_id:userId, policy_type:type, policy_name:name, provider,
        policy_number:'POL-' + Math.floor(Math.random() * 1e6),
        holder_name:'Arjun Mehta',
        coverage_amount:R(coverage), premium_amount:R(premium),
        premium_frequency:'yearly', start_date:'2024-04-01', expiry_date:expiry,
        next_due_date:'2027-04-01', nominee_name:'Priya Mehta',
        nominee_relationship:'Spouse', notes:null, status:'active',
        claim_ratio:98.5, riders:null, tax_benefit:'80C', created_at:'2024-04-01',
      })
    );

    // ── EXPENSES + INCOME (12 months) ─────────────────────────────────────
    const cats = db.getAllSync<{ id: string; name: string }>(
      'SELECT id, name FROM expense_categories WHERE user_id = ? ORDER BY sort_order', [userId]
    );
    const findCat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;
    const monthStr = (ago: number): string => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - ago);
      return d.toISOString().slice(0, 7);
    };

    // [Food, Transport, Utilities, Rent, Shopping, Health, Entertainment, Education, Subscriptions]
    const templates = [
      [22000, 8500, 4200, 45000, 15000,  2500, 5500, 6000, 1999],
      [19500, 7800, 4500, 45000,  8000,  8000, 3500, 6000, 1999],
      [21000, 8200, 3800, 45000, 22000,  1500, 8000, 6000, 1999],
      [18500, 7500, 4600, 45000,  6500,  3200, 4000, 6000, 1999],
      [23000, 9000, 3500, 45000, 12000,  2000, 6500, 8000, 1999],
      [18000, 7200, 4800, 45000,  5500,  1800, 3000, 6000, 1999],
      [20000, 8000, 3900, 45000,  9500,  4500, 5000, 6000, 1999],
      [19000, 7600, 4200, 45000,  7000,  2200, 4500, 6000, 1999],
      [21500, 8800, 3600, 45000, 18000,  1800, 9000, 6000, 1999],
      [17800, 7100, 4900, 45000,  4800,  2800, 2800, 6000, 1999],
      [20500, 8300, 4100, 45000, 11000,  3500, 5500, 6000, 1999],
      [19200, 7900, 4300, 45000,  7800,  2100, 4200, 6000, 1999],
    ];
    const catNames = ['Food & Dining','Transport','Utilities','Rent','Shopping','Health','Entertainment','Education','Subscriptions'];
    const catDays  = ['03','05','10','01','12','14','15','20','22'];
    const catDescs = ['Groceries & dining','Fuel & commute','Electricity & gas','Monthly rent','Shopping','Healthcare','Entertainment','Education fee','Subscriptions'];

    for (let ago = 0; ago < 12; ago++) {
      const ym = monthStr(ago);
      const tmpl = templates[ago] ?? templates[0];
      catNames.forEach((cat, i) => {
        const catId = findCat(cat);
        if (catId) ins('expenses', {
          id:uid(), user_id:userId, category_id:catId,
          amount:R(tmpl[i]), description:catDescs[i],
          expense_date:`${ym}-${catDays[i]}`, spent_by_id:null, notes:null,
        });
      });
      ins('income', { id:uid(), user_id:userId, amount:R(220000), source:'Salary', income_date:`${ym}-01` });
      if (ago === 9) ins('income', { id:uid(), user_id:userId, amount:R(150000), source:'Annual Bonus',   income_date:`${ym}-15` });
      if (ago === 5) ins('income', { id:uid(), user_id:userId, amount:R(45000),  source:'Freelance Work', income_date:`${ym}-20` });
    }

    // ── NET WORTH SNAPSHOTS (14 months history) ───────────────────────────
    for (let ago = 1; ago <= 14; ago++) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - ago);
      const ym = d.toISOString().slice(0, 7);
      const baseAssets = R(11200000 + (14 - ago) * 180000);
      const baseLiabs  = R(6670000  - (14 - ago) * 65000);
      const fluc = 1 + Math.sin(ago * 1.3) * 0.02;
      const assets = Math.round(baseAssets * fluc);
      const liabs  = baseLiabs;
      try {
        db.runSync(
          `INSERT OR IGNORE INTO networth_snapshots (id, user_id, ym, net_worth, total_assets, total_liabilities, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uid(), userId, ym, assets - liabs, assets, liabs, `${ym}-01T00:00:00.000Z`],
        );
      } catch { /* ignore duplicates */ }
    }

    // ── VAULT ─────────────────────────────────────────────────────────────
    const encKey = masterPassword || 'defaultSecurePassword123';
    const vBanking = uid();
    ins('vault_credential_categories', { id:vBanking, user_id:userId, name:'Banking & Finance', icon:'bank' });
    const vWork = uid();
    ins('vault_credential_categories', { id:vWork, user_id:userId, name:'Work & Personal', icon:'account' });

    ([
      [vBanking, 'HDFC NetBanking', 'arjun.m@hdfcbank',     'Secure@HDFC2024!',  'https://netbanking.hdfcbank.com', 90],
      [vBanking, 'Zerodha Kite',    'AM-ZD9823',            'Kite#Trade2024',    'https://kite.zerodha.com',        85],
      [vBanking, 'Groww',           'arjun.mehta@gmail.com','Gr0ww@InvestNow',   'https://groww.in',                80],
      [vWork,    'Gmail',           'arjun.mehta@gmail.com','Gmail@Secure2024',  'https://mail.google.com',         88],
    ] as const).forEach(([catId, service, username, pwd, url, strength]) =>
      ins('vault_credentials', {
        id:uid(), user_id:userId, category_id:catId,
        service, username,
        password_enc: encryptText(pwd as string, encKey),
        url, notes:null, password_strength:strength, created_at:'2024-04-01',
      })
    );

    ins('notifications', {
      id:uid(), user_id:userId,
      title:'EMI due soon',
      body:'Your HDFC Home Loan EMI of ₹55,000 is due on July 5th.',
      kind:'reminder', is_read:false, created_at:new Date().toISOString(),
    });
  });
};
