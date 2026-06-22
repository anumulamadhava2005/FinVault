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
 * This is required even for non-demo (blank) users so drop-downs work.
 * Returns a mapping of asset type slugs to their created UUIDs.
 */
export const seedInitialMetadata = (db: SQLiteDatabase, userId: string): Record<string, string> => {
  const assetTypesMap: Record<string, string> = {};
  
  db.withTransactionSync(() => {
    // 1. Core Asset Types
    const types = [
      ['Mutual Funds', 'mutual_fund'],
      ['Equity', 'equity'],
      ['Fixed Deposit', 'fd'],
      ['Real Estate', 'real_estate'],
      ['Digital Gold', 'digital_gold'],
      ['Gold', 'physical_gold'],
      ['Sovereign Gold Bond', 'sgb'],
      ['PPF', 'ppf'],
    ];
    
    types.forEach(([name, slug], i) => {
      // Check if already exists
      const existing = db.getFirstSync<{ id: string }>('SELECT id FROM asset_types WHERE slug = ?', [slug]);
      if (existing) {
        assetTypesMap[slug] = existing.id;
      } else {
        const id = uid();
        assetTypesMap[slug] = id;
        db.runSync(
          'INSERT INTO asset_types (id, name, slug, sort_order) VALUES (?, ?, ?, ?)',
          [id, name, slug, i]
        );
      }
    });

    // 2. Core Expense Categories
    const categories = [
      ['Food & Dining', 25000, '#E0922B'],
      ['Transport', 8000, '#4A7C6F'],
      ['Utilities', 6000, '#7FB5A8'],
      ['Rent', 35000, '#2D3142'],
      ['Shopping', 12000, '#D4956A'],
      ['Health', 5000, '#52A77E'],
      ['Entertainment', 6000, '#9DD1C2'],
    ];

    categories.forEach(([name, budget, color], i) => {
      const existing = db.getFirstSync<{ id: string }>('SELECT id FROM expense_categories WHERE user_id = ? AND name = ?', [userId, name]);
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
 * Seeds a full portfolio of realistic demo data for the signed-up user.
 * Encrypts Vault passwords using the masterPassword.
 */
export const seedDemoData = (
  db: SQLiteDatabase,
  userId: string,
  masterPassword?: string
): void => {
  // Ensure metadata exists first
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
    // Clean slate for demo seeding (except metadata)
    db.runSync('DELETE FROM assets WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM loans WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM insurance_policies WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM financial_goals WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM expenses WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM income WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM vault_credentials WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM vault_credential_categories WHERE user_id = ?', [userId]);
    db.runSync('DELETE FROM notifications WHERE user_id = ?', [userId]);

    // --- Assets (current_value drives goal progress) ---
    const A = (
      type: string,
      name: string,
      invested: number,
      current: number,
      qty = 0,
      extra: Record<string, unknown> = {},
    ) => {
      const id = uid();
      ins('assets', {
        id,
        user_id: userId,
        asset_type_id: types[type],
        name,
        invested_amount: R(invested),
        current_value: R(current),
        quantity: qty,
        purchase_date: '2022-06-15',
        investment_date: '2022-06-15',
        is_sip: 0,
        sip_monthly_amount: 0,
        notes: null,
        created_at: '2024-01-01',
        ...extra,
      });
      return id;
    };

    const aMidcap = A('mutual_fund', 'HDFC Mid Cap Fund', 800000, 1756000, 12000, {
      isin: 'INF179K01AA4',
      is_sip: 1,
      sip_monthly_amount: R(5000),
      current_nav: 146.33,
    });
    const aEquity = A('equity', 'Reliance Industries', 500000, 763000, 250, {
      ticker: 'RELIANCE.NS',
      price_per_unit: 3052.0,
    });
    const aGold = A('digital_gold', 'SBI Gold ETF', 100000, 138000, 30);
    const aFd = A('fd', 'Emergency FD', 300000, 318000, 0, {
      maturity_date: '2027-06-15',
      guaranteed_return_pct: 7.25,
      details_json: JSON.stringify({ bank_name: 'SBI', account_no: 'FD-99001', nominee: 'Priya Sharma' }),
    });
    A('mutual_fund', 'ICICI Bluechip Fund', 350000, 412000, 9000, {
      isin: 'INF109K01014',
      is_sip: 1,
      sip_monthly_amount: R(3000),
      current_nav: 45.78,
    });
    A('digital_gold', 'PhonePe Digital Gold', 50000, 68000, 15.5, {
      price_per_unit: 7120.0,
      details_json: JSON.stringify({ purity: '24K' }),
    });
    A('sgb', 'SGB 2022-23 Series IV', 120000, 156000, 20, {
      isin: 'IN0020220120',
      maturity_date: '2030-11-28',
      guaranteed_return_pct: 2.5,
      price_per_unit: 7800.0,
    });
    A('ppf', 'PPF Account', 150000, 178000, 0, {
      maturity_date: '2036-04-01',
      guaranteed_return_pct: 7.1,
      details_json: JSON.stringify({ bank_name: 'Post Office', account_no: 'PPF-LKO-001', nominee: 'Aarav Sharma Jr' }),
    });
    A('real_estate', 'Lucknow Flat', 4500000, 5800000, 0, {
      details_json: JSON.stringify({ area_sqft: '1200', location: 'Gomti Nagar, Lucknow' }),
    });

    // --- SIP schedules ---
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextDue = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
    ins('sip_schedules', {
      id: uid(),
      user_id: userId,
      asset_id: aMidcap,
      amount: R(5000),
      frequency: 'monthly',
      next_due_date: nextDue,
      status: 'active',
      day_of_month: 1,
      annual_step_up_pct: 10,
      start_date: '2022-07-01',
      end_date: null,
      linked_bank: null,
    });

    // --- Goals ---
    const G = (
      name: string,
      goalType: string,
      target: number,
      targetDate: string,
      linkAsset: string,
      created = '2024-01-01',
    ) => {
      const id = uid();
      ins('financial_goals', {
        id,
        user_id: userId,
        name,
        goal_type: goalType,
        target_amount: R(target),
        monthly_needed: R(15000),
        target_date: targetDate,
        priority: 'high',
        icon: 'flag',
        color_hex: '#2F8F6F',
        notes: null,
        is_completed: false,
        created_at: created,
      });
      ins('goal_asset_links', { id: uid(), goal_id: id, asset_id: linkAsset, allocation_pct: 100 });
    };
    G('Retirement Fund', 'retirement', 5000000, '2045-12-31', aMidcap);
    G('Child Education', 'education', 3000000, '2035-06-30', aEquity);
    G('Europe Trip', 'travel', 300000, '2026-12-31', aGold);
    G('Emergency Fund', 'emergency', 500000, '2025-12-31', aFd);

    // --- Loans ---
    const L = (
      type: string,
      provider: string,
      acct: string,
      orig: number,
      out: number,
      rate: number,
      emi: number,
      start: string,
      end: string,
    ) => {
      ins('loans', {
        id: uid(),
        user_id: userId,
        loan_type: type,
        provider,
        account_number: acct,
        borrower_name: 'Aarav Sharma',
        original_amount: R(orig),
        outstanding_amount: R(out),
        interest_rate: rate,
        emi_amount: R(emi),
        start_date: start,
        end_date: end,
        next_due_date: '2026-07-05',
        prepayment_total: 0,
        notes: null,
        status: 'active',
        interest_type: 'floating',
        created_at: '2024-01-01',
      });
    };
    L('home', 'HDFC Bank', 'HL12345', 5000000, 4200000, 8.5, 42000, '2022-01-01', '2042-01-01');
    L('vehicle', 'ICICI Bank', 'VL99', 800000, 350000, 9.2, 15000, '2023-06-01', '2028-06-01');
    L('personal', 'Axis Bank', 'PL77', 300000, 120000, 13.0, 9000, '2024-03-01', '2027-03-01');

    // --- Insurance policies ---
    const P = (
      type: string,
      name: string,
      provider: string,
      coverage: number,
      premium: number,
      freq: string,
      expiry: string,
    ) => {
      ins('insurance_policies', {
        id: uid(),
        user_id: userId,
        policy_type: type,
        policy_name: name,
        provider,
        policy_number: 'POL-' + Math.floor(Math.random() * 1e6),
        holder_name: 'Aarav Sharma',
        coverage_amount: R(coverage),
        premium_amount: R(premium),
        premium_frequency: freq,
        start_date: '2023-04-01',
        expiry_date: expiry,
        next_due_date: '2026-09-01',
        nominee_name: 'Priya Sharma',
        nominee_relationship: 'Spouse',
        notes: null,
        status: 'active',
        claim_ratio: 98.5,
        riders: null,
        tax_benefit: '80C',
        created_at: '2024-01-01',
      });
    };
    P('life', 'HDFC Click 2 Protect', 'HDFC Life', 10000000, 18000, 'yearly', '2048-04-01');
    P('health', 'Optima Restore', 'Star Health', 1000000, 22000, 'yearly', '2027-03-31');
    P('vehicle', 'Car Comprehensive', 'ICICI Lombard', 800000, 12000, 'yearly', '2027-01-15');

    // --- Expenses (seeded category mapping) ---
    const cats = db.getAllSync<{ id: string; name: string }>(
      'SELECT id, name FROM expense_categories WHERE user_id = ? ORDER BY sort_order',
      [userId]
    );
    const findCatIdx = (name: string) => cats.findIndex((c) => c.name === name);

    const ym = new Date().toISOString().slice(0, 7);
    const E = (catName: string, amount: number, desc: string, day: string) => {
      const idx = findCatIdx(catName);
      if (idx !== -1) {
        ins('expenses', {
          id: uid(),
          user_id: userId,
          category_id: cats[idx].id,
          amount: R(amount),
          description: desc,
          expense_date: `${ym}-${day}`,
          spent_by_id: null,
          notes: null,
        });
      }
    };
    
    E('Food & Dining', 1850, 'Groceries — BigBasket', '03');
    E('Food & Dining', 640, 'Dinner', '08');
    E('Transport', 1200, 'Fuel', '05');
    E('Utilities', 2400, 'Electricity bill', '10');
    E('Rent', 35000, 'Monthly rent', '01');
    E('Shopping', 4500, 'Clothing', '12');
    E('Health', 1800, 'Pharmacy', '14');
    E('Entertainment', 1200, 'Movie night', '15');

    // --- Income ---
    ins('income', { id: uid(), user_id: userId, amount: R(180000), source: 'Salary', income_date: `${ym}-01` });

    // --- Vault ---
    const vcat = uid();
    ins('vault_credential_categories', { id: vcat, user_id: userId, name: 'Banking', icon: 'bank' });
    
    // Encrypt demo credentials using user's password if provided
    const encKey = masterPassword || 'defaultSecurePassword123';
    
    [
      ['HDFC NetBanking', 'aarav.s', 'Str0ng!Pass#22', 'https://netbanking.hdfcbank.com', 88],
      ['Zerodha Kite', 'AS1234', 'Tr@de2026Secure', 'https://kite.zerodha.com', 76],
    ].forEach(([service, username, pwd, url, strength]) =>
      ins('vault_credentials', {
        id: uid(),
        user_id: userId,
        category_id: vcat,
        service,
        username,
        password_enc: encryptText(pwd as string, encKey),
        url,
        notes: null,
        password_strength: strength,
        created_at: '2024-01-01',
      }),
    );

    ins('notifications', {
      id: uid(),
      user_id: userId,
      title: 'EMI due soon',
      body: 'Your HDFC home loan EMI is due on 5 Jul.',
      kind: 'reminder',
      is_read: false,
      created_at: new Date().toISOString(),
    });
  });
};
