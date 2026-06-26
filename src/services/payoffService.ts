import { all } from '../db';
import type { Loan } from '../models/types';
import { parseISO, todayISO } from '../utils/date';
import { loanStatus } from './finance';

export interface PayoffSimulationResult {
  baselineInterest: number; // paise
  baselineDuration: number; // months
  acceleratedInterest: number; // paise
  acceleratedDuration: number; // months
  interestSaved: number; // paise
  monthsSaved: number; // months
  newPayoffDate: string; // "MMM YYYY"
  baselineSeries: number[]; // paise, monthly outstanding balances
  acceleratedSeries: number[]; // paise, monthly outstanding balances
  labels: string[]; // ["Month 0", "Month 1", ...]
  loanDetails: {
    id: string;
    loanType: string;
    provider: string | null;
    outstanding: number; // paise
    interestRate: number;
    emi: number; // paise
    baselineMonths: number;
    acceleratedMonths: number;
    baselineInterestPaid: number; // paise
    acceleratedInterestPaid: number; // paise
    savings: number; // paise
  }[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Helper to format date relative to today
function getFutureMonthYear(monthsAhead: number): string {
  const date = new Date(todayISO() + 'T00:00:00');
  date.setMonth(date.getMonth() + monthsAhead);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function getActiveLoans(userId: string): (Loan & { isCc: boolean })[] {
  const rows = all<Loan>(
    `SELECT * FROM loans WHERE user_id = ? AND status != 'closed' AND outstanding_amount > 0`,
    [userId]
  );
  return rows.map((l) => ({
    ...l,
    isCc: l.loan_type === 'credit_card',
  }));
}

export function simulatePayoff(
  activeLoans: Loan[],
  extraPaymentPaise: number,
  strategy: 'avalanche' | 'snowball'
): PayoffSimulationResult {
  if (activeLoans.length === 0) {
    return {
      baselineInterest: 0,
      baselineDuration: 0,
      acceleratedInterest: 0,
      acceleratedDuration: 0,
      interestSaved: 0,
      monthsSaved: 0,
      newPayoffDate: getFutureMonthYear(0),
      baselineSeries: [],
      acceleratedSeries: [],
      labels: [],
      loanDetails: [],
    };
  }

  // 1. Run Baseline Simulation (extraPayment = 0)
  const baselineResult = runSimulation(activeLoans, 0, 'none');

  // 2. Run Accelerated Simulation
  const acceleratedResult = runSimulation(activeLoans, extraPaymentPaise, strategy);

  // 3. Construct detailed response
  const loanDetails = activeLoans.map((loan) => {
    const baseL = baselineResult.loansDetails.get(loan.id) || { months: 0, interestPaid: 0 };
    const accL = acceleratedResult.loansDetails.get(loan.id) || { months: 0, interestPaid: 0 };
    return {
      id: loan.id,
      loanType: loan.loan_type,
      provider: loan.provider,
      outstanding: loan.outstanding_amount,
      interestRate: loan.interest_rate,
      emi: loan.emi_amount,
      baselineMonths: baseL.months,
      acceleratedMonths: accL.months,
      baselineInterestPaid: baseL.interestPaid,
      acceleratedInterestPaid: accL.interestPaid,
      savings: Math.max(0, baseL.interestPaid - accL.interestPaid),
    };
  });

  const maxDuration = Math.max(baselineResult.duration, acceleratedResult.duration);
  const labels: string[] = [];
  
  // Downsample labels for chart readability if timeline is long
  const step = maxDuration > 36 ? Math.ceil(maxDuration / 12) : 1;
  for (let m = 0; m <= maxDuration; m++) {
    if (m % step === 0 || m === maxDuration) {
      labels.push(`M ${m}`);
    }
  }

  return {
    baselineInterest: baselineResult.totalInterest,
    baselineDuration: baselineResult.duration,
    acceleratedInterest: acceleratedResult.totalInterest,
    acceleratedDuration: acceleratedResult.duration,
    interestSaved: Math.max(0, baselineResult.totalInterest - acceleratedResult.totalInterest),
    monthsSaved: Math.max(0, baselineResult.duration - acceleratedResult.duration),
    newPayoffDate: getFutureMonthYear(acceleratedResult.duration),
    baselineSeries: baselineResult.series,
    acceleratedSeries: acceleratedResult.series,
    labels,
    loanDetails,
  };
}

interface SimStepResult {
  totalInterest: number;
  duration: number;
  series: number[];
  loansDetails: Map<string, { months: number; interestPaid: number }>;
}

function runSimulation(
  loans: Loan[],
  extraPayment: number,
  strategy: 'avalanche' | 'snowball' | 'none'
): SimStepResult {
  // Deep clone loan balances and metrics
  const activeSimLoans = loans.map((l) => ({
    id: l.id,
    outstanding: l.outstanding_amount,
    rate: l.interest_rate,
    emi: l.emi_amount,
    interestPaid: 0,
    monthsToPay: 0,
  }));

  const loansDetails = new Map<string, { months: number; interestPaid: number }>();
  activeSimLoans.forEach((l) => {
    loansDetails.set(l.id, { months: 0, interestPaid: 0 });
  });

  const series: number[] = [];
  let totalInterest = 0;
  let months = 0;
  const maxMonthsLimit = 600; // 50 years safety limit

  // Add month 0 starting point
  let currentTotalOutstanding = activeSimLoans.reduce((sum, l) => sum + l.outstanding, 0);
  series.push(currentTotalOutstanding);

  while (currentTotalOutstanding > 0 && months < maxMonthsLimit) {
    months++;

    // A. Accrue Interest
    activeSimLoans.forEach((l) => {
      if (l.outstanding > 0) {
        // monthly interest = principal * rate / 12 / 100
        const interest = Math.round(l.outstanding * (l.rate / 12 / 100));
        l.outstanding += interest;
        l.interestPaid += interest;
        totalInterest += interest;
      }
    });

    // B. Determine strategy sorting for the active loans
    let targetOrder = [...activeSimLoans].filter((l) => l.outstanding > 0);
    if (strategy === 'avalanche') {
      // Sort by highest interest rate first, then smallest balance to break ties
      targetOrder.sort((a, b) => b.rate - a.rate || a.outstanding - b.outstanding);
    } else if (strategy === 'snowball') {
      // Sort by smallest outstanding balance first, then highest interest rate to break ties
      targetOrder.sort((a, b) => a.outstanding - b.outstanding || b.rate - a.rate);
    }

    // C. Distribute Payments
    let freeCash = extraPayment;

    // First, pay the mandatory EMI for each active loan
    activeSimLoans.forEach((l) => {
      if (l.outstanding > 0) {
        const mandatoryPayment = Math.min(l.outstanding, l.emi);
        l.outstanding -= mandatoryPayment;
        
        // If loan is fully repaid, any leftover EMI becomes free cash
        if (l.outstanding === 0) {
          l.monthsToPay = months;
          freeCash += (l.emi - mandatoryPayment);
        }
      }
    });

    // Next, apply the free cash pool to the target loan(s) according to strategy
    if (freeCash > 0 && targetOrder.length > 0) {
      for (const target of targetOrder) {
        // Find the mutable loan object
        const l = activeSimLoans.find((x) => x.id === target.id)!;
        if (l.outstanding > 0) {
          const extraPaymentAmount = Math.min(l.outstanding, freeCash);
          l.outstanding -= extraPaymentAmount;
          freeCash -= extraPaymentAmount;

          if (l.outstanding === 0) {
            l.monthsToPay = months;
          }

          if (freeCash <= 0) break; // Extra cash fully spent for this month
        }
      }
    }

    // D. Update state
    currentTotalOutstanding = activeSimLoans.reduce((sum, l) => sum + l.outstanding, 0);
    series.push(currentTotalOutstanding);
  }

  // Populate details
  activeSimLoans.forEach((l) => {
    loansDetails.set(l.id, {
      months: l.monthsToPay || months,
      interestPaid: l.interestPaid,
    });
  });

  return {
    totalInterest,
    duration: months,
    series,
    loansDetails,
  };
}
