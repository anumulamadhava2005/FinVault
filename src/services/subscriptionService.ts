import { all, insert, remove, run, update, newId } from '../db';
import { todayISO, parseISO, daysBetween } from '../utils/date';
import { formatINR } from '../utils/money';

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  amount: number; // paise
  billing_cycle: 'monthly' | 'yearly' | 'quarterly';
  next_billing_date: string; // YYYY-MM-DD
  category: string; // entertainment|music|cloud|utilities|fitness|other
  status: 'active' | 'paused';
  notes: string | null;
  created_at: string;
}

export interface DetectedSubscription {
  name: string;
  amount: number; // paise
  category: string;
  billing_cycle: 'monthly';
  detectedCount: number;
  lastPaidDate: string;
  suggestedNextDate: string;
}

// Predefined subscription keyword mapping
const KNOWN_MERCHANTS: { keywords: string[]; name: string; category: string }[] = [
  { keywords: ['netflix'], name: 'Netflix', category: 'entertainment' },
  { keywords: ['spotify'], name: 'Spotify', category: 'music' },
  { keywords: ['youtube', 'yt premium'], name: 'YouTube Premium', category: 'entertainment' },
  { keywords: ['apple.com/bill', 'icloud'], name: 'iCloud / Apple Services', category: 'cloud' },
  { keywords: ['google', 'google one', 'gsuite'], name: 'Google One', category: 'cloud' },
  { keywords: ['amazon prime', 'prime video'], name: 'Amazon Prime', category: 'entertainment' },
  { keywords: ['disney', 'hotstar'], name: 'Disney+ Hotstar', category: 'entertainment' },
  { keywords: ['microsoft', 'office 365'], name: 'Microsoft 365', category: 'cloud' },
  { keywords: ['adobe', 'creative cloud'], name: 'Adobe CC', category: 'cloud' },
  { keywords: ['zoom.us', 'zoom meeting'], name: 'Zoom', category: 'cloud' },
  { keywords: ['canva'], name: 'Canva', category: 'cloud' },
  { keywords: ['gym', 'fitness', 'cult.fit', 'gold\'s gym'], name: 'Gym Membership', category: 'fitness' },
  { keywords: ['broadband', 'act fibernet', 'jio fiber', 'airtel extreme'], name: 'Broadband Internet', category: 'utilities' },
  { keywords: ['tata play', 'tatasky', 'cable tv'], name: 'DTH / Cable TV', category: 'entertainment' },
];

export function getSubscriptions(userId: string): Subscription[] {
  return all<Subscription>(
    `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY next_billing_date ASC`,
    [userId]
  );
}

export function addSubscription(userId: string, sub: Omit<Subscription, 'id' | 'user_id' | 'created_at'>): string {
  const id = newId();
  insert('subscriptions', {
    id,
    user_id: userId,
    ...sub,
    created_at: todayISO(),
  });
  return id;
}

export function editSubscription(id: string, sub: Partial<Omit<Subscription, 'id' | 'user_id' | 'created_at'>>): void {
  update('subscriptions', id, sub);
}

export function deleteSubscription(id: string): void {
  remove('subscriptions', id);
}

export function toggleSubscriptionStatus(id: string, currentStatus: 'active' | 'paused'): void {
  const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
  run(`UPDATE subscriptions SET status = ? WHERE id = ?`, [nextStatus, id]);
}

export function getSubscriptionSummary(userId: string) {
  const subs = getSubscriptions(userId).filter((s) => s.status === 'active');
  
  let monthlyTotal = 0;
  let yearlyTotal = 0;

  subs.forEach((s) => {
    if (s.billing_cycle === 'monthly') {
      monthlyTotal += s.amount;
      yearlyTotal += s.amount * 12;
    } else if (s.billing_cycle === 'yearly') {
      monthlyTotal += Math.round(s.amount / 12);
      yearlyTotal += s.amount;
    } else if (s.billing_cycle === 'quarterly') {
      monthlyTotal += Math.round(s.amount / 3);
      yearlyTotal += s.amount * 4;
    }
  });

  return {
    monthlyTotal,
    yearlyTotal,
    count: subs.length,
  };
}

export function getUpcomingRenewals(userId: string, daysAhead = 30): (Subscription & { daysLeft: number })[] {
  const subs = getSubscriptions(userId).filter((s) => s.status === 'active');
  const today = new Date(todayISO() + 'T00:00:00');
  
  const renewals: (Subscription & { daysLeft: number })[] = [];

  subs.forEach((s) => {
    const nextDate = new Date(s.next_billing_date + 'T00:00:00');
    const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays >= 0 && diffDays <= daysAhead) {
      renewals.push({
        ...s,
        daysLeft: diffDays,
      });
    }
  });

  return renewals.sort((a, b) => a.daysLeft - b.daysLeft);
}

// Crawls user expenses to identify potential recurring subscriptions
export function detectRecurringExpenses(userId: string): DetectedSubscription[] {
  // 1. Get all expenses in the last 180 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 180);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  interface ExpenseRow {
    description: string;
    amount: number;
    expense_date: string;
    category_name: string;
  }

  const expenses = all<ExpenseRow>(
    `SELECT e.description, e.amount, e.expense_date, c.name AS category_name
     FROM expenses e
     JOIN expense_categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.expense_date >= ?
     ORDER BY e.expense_date DESC`,
    [userId, cutoffStr]
  );

  // 2. Load already tracked subscription names (to exclude them from suggestions)
  const existingSubs = getSubscriptions(userId);
  const existingNamesLower = new Set(existingSubs.map((s) => s.name.toLowerCase().trim()));

  // 3. Group expenses by normalized description
  const groups = new Map<string, ExpenseRow[]>();

  expenses.forEach((e) => {
    const descNormalized = normalizeDescription(e.description);
    if (!descNormalized) return;
    
    // Skip if it's already explicitly tracked as a subscription
    if (existingNamesLower.has(descNormalized.toLowerCase())) return;

    const group = groups.get(descNormalized) || [];
    group.push(e);
    groups.set(descNormalized, group);
  });

  // 4. Analyze each group for recurring patterns
  const suggestions: DetectedSubscription[] = [];

  groups.forEach((items, name) => {
    if (items.length < 2) return;

    // Sort chronologically (oldest to newest)
    items.sort((a, b) => a.expense_date.localeCompare(b.expense_date));

    // Check if the group exhibits recurring characteristics:
    // Pattern A: Matches a known subscription brand keyword
    const knownMatch = findKnownMerchant(name);
    
    // Pattern B: Recurring interval logic (monthly spacing of payments)
    let hasRecurringIntervals = false;
    let averageIntervalDays = 0;
    
    if (items.length >= 2) {
      let intervalSum = 0;
      let count = 0;
      let amountVarianceOk = true;
      const baseAmount = items[0].amount;

      for (let i = 1; i < items.length; i++) {
        const datePrev = new Date(items[i-1].expense_date + 'T00:00:00');
        const dateCurr = new Date(items[i].expense_date + 'T00:00:00');
        const days = Math.ceil((dateCurr.getTime() - datePrev.getTime()) / (1000 * 60 * 60 * 24));
        
        intervalSum += days;
        count++;

        // Check if amount is within 5% variance of the first transaction
        const variance = Math.abs(items[i].amount - baseAmount) / baseAmount;
        if (variance > 0.08) {
          amountVarianceOk = false;
        }
      }

      averageIntervalDays = Math.round(intervalSum / count);
      // Monthly recurrence usually falls between 25 and 35 days
      if (amountVarianceOk && averageIntervalDays >= 25 && averageIntervalDays <= 35) {
        hasRecurringIntervals = true;
      }
    }

    // If it matches a known merchant OR has clear recurring monthly intervals, suggest it!
    if (knownMatch || hasRecurringIntervals) {
      const avgAmount = Math.round(items.reduce((sum, x) => sum + x.amount, 0) / items.length);
      const lastItem = items[items.length - 1];
      
      // Predict next billing date (last payment date + 30 days)
      const lastPayDate = new Date(lastItem.expense_date + 'T00:00:00');
      const nextBillingDate = new Date(lastPayDate.getTime());
      nextBillingDate.setDate(nextBillingDate.getDate() + 30);
      const nextBillingStr = nextBillingDate.toISOString().split('T')[0];

      suggestions.push({
        name: knownMatch ? knownMatch.name : titleCase(name),
        amount: avgAmount,
        category: knownMatch ? knownMatch.category : 'other',
        billing_cycle: 'monthly',
        detectedCount: items.length,
        lastPaidDate: lastItem.expense_date,
        suggestedNextDate: nextBillingStr,
      });
    }
  });

  return suggestions.sort((a, b) => b.detectedCount - a.detectedCount);
}

// Helper to normalize descriptions (e.g. "NETFLIX INDIA" -> "Netflix")
function normalizeDescription(desc: string): string {
  const d = desc.toLowerCase().trim();
  if (!d) return '';

  for (const merchant of KNOWN_MERCHANTS) {
    for (const kw of merchant.keywords) {
      if (d.includes(kw)) {
        return merchant.name;
      }
    }
  }

  // Return cleaned description if it doesn't match a known merchant
  return desc.trim()
    .replace(/\s+/g, ' ')
    .replace(/[0-9]/g, '') // remove numbers
    .replace(/[^a-zA-Z\s]/g, '') // remove special characters
    .trim();
}

function findKnownMerchant(name: string) {
  const nameLower = name.toLowerCase().trim();
  return KNOWN_MERCHANTS.find(m => 
    m.name.toLowerCase() === nameLower ||
    m.keywords.some(kw => nameLower.includes(kw))
  );
}

function titleCase(str: string): string {
  if (!str) return '';
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
