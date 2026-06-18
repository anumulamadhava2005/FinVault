/**
 * Seeds a single demo user with realistic data so every screen is populated on
 * first launch — mirrors the web app's sample data (and the goal figures from
 * the design). All money is paise. Returns the created user's id.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

const uid = () => Crypto.randomUUID();
const R = (rupees: number) => Math.round(rupees * 100); // rupees -> paise

export const seedDemoData = (db: SQLiteDatabase): string => {
  const userId = uid();
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
    ins('users', {
      id: userId,
      full_name: 'Aarav Sharma',
      email: 'demo@finvault.local',
      password_hash: '',
      date_of_birth: '1988-04-12',
      risk_profile: 'moderate',
      phone: '+91 98000 12345',
      currency: 'INR',
      monthly_income: R(180000),
      created_at: '2024-01-01',
    });
    ins('user_preferences', { user_id: userId, theme: 'system', sip_reminder_days: 3, auto_lock_minutes: 15 });

    // --- Asset types ---
    const types: Record<string, string> = {};
    [
      ['Mutual Funds', 'mutual_fund'],
      ['Equity', 'equity'],
      ['Fixed Deposit', 'fd'],
      ['Gold', 'gold'],
      ['Real Estate', 'real_estate'],
    ].forEach(([name, slug], i) => {
      const id = uid();
      types[slug] = id;
      ins('asset_types', { id, name, slug, sort_order: i });
    });

    // --- Assets (current_value drives goal progress, matching the design) ---
    const A = (
      type: string,
      name: string,
      invested: number,
      current: number,
      qty = 0,
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
        notes: null,
        created_at: '2024-01-01',
      });
      return id;
    };
    const aMidcap = A('mutual_fund', 'HDFC Mid Cap Fund', 800000, 1756000, 12000);
    const aEquity = A('equity', 'Reliance Industries', 500000, 763000, 250);
    const aGold = A('gold', 'SBI Gold ETF', 100000, 138000, 30);
    const aFd = A('fd', 'Emergency FD', 300000, 318000);
    A('mutual_fund', 'ICICI Bluechip Fund', 350000, 412000, 9000);

    // --- Goals (linked to assets; progress = sum of linked current values) ---
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
    G('Emergency Fund', 'emergency', 500000, '2025-12-31', aFd); // target date past -> Overdue

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

    // --- Expense categories + a month of expenses ---
    const cats: { id: string; name: string }[] = [];
    [
      ['Food & Dining', 25000, '#E0922B'],
      ['Transport', 8000, '#4A7C6F'],
      ['Utilities', 6000, '#7FB5A8'],
      ['Rent', 35000, '#2D3142'],
      ['Shopping', 12000, '#D4956A'],
      ['Health', 5000, '#52A77E'],
      ['Entertainment', 6000, '#9DD1C2'],
    ].forEach(([name, budget, color], i) => {
      const id = uid();
      cats.push({ id, name: name as string });
      ins('expense_categories', {
        id,
        user_id: userId,
        name,
        is_system: true,
        budget_amount: R(budget as number),
        sort_order: i,
        color_hex: color,
      });
    });
    const ym = new Date().toISOString().slice(0, 7);
    const E = (catIdx: number, amount: number, desc: string, day: string) =>
      ins('expenses', {
        id: uid(),
        user_id: userId,
        category_id: cats[catIdx].id,
        amount: R(amount),
        description: desc,
        expense_date: `${ym}-${day}`,
        spent_by_id: null,
        notes: null,
      });
    E(0, 1850, 'Groceries — BigBasket', '03');
    E(0, 640, 'Dinner', '08');
    E(1, 1200, 'Fuel', '05');
    E(2, 2400, 'Electricity bill', '10');
    E(3, 35000, 'Monthly rent', '01');
    E(4, 4500, 'Clothing', '12');
    E(5, 1800, 'Pharmacy', '14');
    E(6, 1200, 'Movie night', '15');

    // --- Income ---
    ins('income', { id: uid(), user_id: userId, amount: R(180000), source: 'Salary', income_date: `${ym}-01` });

    // --- Vault ---
    const vcat = uid();
    ins('vault_credential_categories', { id: vcat, user_id: userId, name: 'Banking', icon: 'bank' });
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
        password_enc: pwd, // standalone demo: stored as-is
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

  return userId;
};
