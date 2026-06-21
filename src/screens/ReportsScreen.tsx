import React, { useState } from 'react';
import { Share, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  Dialog,
  Divider,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';

import { DistributionPie, TrendLine } from '../components/charts';
import { Kpi, ProgressBar, Row, Screen, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { all } from '../db';
import { useData } from '../hooks/useData';
import type { Asset, FinancialGoal, InsurancePolicy, Loan, SIPSchedule, VaultCredential } from '../models/types';
import { LOAN_TYPE_LABELS, POLICY_TYPE_LABELS, titleCase } from '../services/constants';
import {
  categoryBreakdown,
  goalsProgress,
  incomeExpenseSeries,
  loanStatus,
  netWorth,
  policyStatus,
  portfolioSummary,
  financialHealth,
  passwordHealth,
  benchmarkComparison,
} from '../services/finance';
import { chartColors, palette } from '../theme';
import { todayISO } from '../utils/date';
import { formatINR } from '../utils/money';

/** Selectable report modules. */
const MODULES: { key: string; label: string }[] = [
  { key: 'assets', label: 'Assets / Portfolio' },
  { key: 'loans', label: 'Loans & Liabilities' },
  { key: 'protect', label: 'Insurance / Protect' },
  { key: 'goals', label: 'Financial Goals' },
  { key: 'sip', label: 'SIP Schedules' },
  { key: 'health', label: 'Financial Health Audit' },
  { key: 'password', label: 'Password Health Audit' },
  { key: 'benchmark', label: 'Benchmark Allocation Audit' },
];

// Base64 helper tables and encoders/decoders for Hermes/React Native compatibility
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

function base64ToUint8Array(base64: string): Uint8Array {
  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === '=') {
    bufferLength--;
    if (base64[base64.length - 2] === '=') {
      bufferLength--;
    }
  }
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(arrayBuffer);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (p < bufferLength) {
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    }
    if (p < bufferLength) {
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    const e1 = b1 >> 2;
    const e2 = ((b1 & 3) << 4) | (b2 >> 4);
    const e3 = ((b2 & 15) << 2) | (b3 >> 6);
    const e4 = b3 & 63;
    result += chars.charAt(e1) + chars.charAt(e2);
    if (i + 1 < len) {
      result += chars.charAt(e3);
    } else {
      result += '=';
    }
    if (i + 2 < len) {
      result += chars.charAt(e4);
    } else {
      result += '=';
    }
  }
  return result;
}

/** Generates vector SVG donut chart for Assets allocation. */
const makeAssetPieSvg = (allocation: any[]): string => {
  const radius = 35;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

  let svgContent = `<svg width="340" height="120" viewBox="0 0 340 120" style="font-family: sans-serif;">`;
  svgContent += `<g transform="rotate(-90 ${cx} ${cy})">`;

  allocation.forEach((item, index) => {
    const pct = item.pct;
    const length = (pct / 100) * circumference;
    const color = colors[index % colors.length];

    svgContent += `
      <circle 
        cx="${cx}" 
        cy="${cy}" 
        r="${radius}" 
        fill="transparent" 
        stroke="${color}" 
        stroke-width="12" 
        stroke-dasharray="${length} ${circumference}" 
        stroke-dashoffset="${-offset}" 
      />
    `;
    offset += length;
  });

  svgContent += `<circle cx="${cx}" cy="${cy}" r="${radius - 6}" fill="#ffffff" />`;
  svgContent += `</g>`;

  svgContent += `<g transform="translate(120, 10)">`;
  allocation.forEach((item, index) => {
    const color = colors[index % colors.length];
    const y = index * 16;
    svgContent += `
      <rect x="0" y="${y}" width="8" height="8" fill="${color}" rx="1.5" />
      <text x="14" y="${y + 7}" font-size="10" fill="#4b5563" font-weight="600">
        ${item.type}
      </text>
      <text x="130" y="${y + 7}" font-size="10" fill="#111827" font-weight="700" text-anchor="end">
        ${formatINR(item.value)}
      </text>
      <text x="180" y="${y + 7}" font-size="10" fill="#6b7280" font-weight="600" text-anchor="end">
        (${item.pct.toFixed(1)}%)
      </text>
    `;
  });
  svgContent += `</g>`;
  svgContent += `</svg>`;
  return svgContent;
};

/** Generates vector SVG line chart for Income and Expense trends. */
const makeTrendLineSvg = (expSeries: { labels: string[]; income: number[]; expenses: number[] }): string => {
  const width = 500;
  const height = 180;
  const paddingLeft = 55;
  const paddingBottom = 25;
  const paddingTop = 15;
  const paddingRight = 15;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const incomesRupees = expSeries.income.map((v) => v / 100);
  const expensesRupees = expSeries.expenses.map((v) => v / 100);
  const allVals = [...incomesRupees, ...expensesRupees];
  const maxVal = Math.max(...allVals, 1000);
  const roundMaxVal = Math.ceil(maxVal / 10000) * 10000;

  const getX = (index: number) => paddingLeft + (index * chartWidth) / (expSeries.labels.length - 1);
  const getY = (val: number) => height - paddingBottom - (val * chartHeight) / roundMaxVal;

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #f9fafb; border-radius: 6px; font-family: sans-serif;">`;

  for (let i = 0; i <= 4; i++) {
    const val = (roundMaxVal * i) / 4;
    const y = getY(val);
    svg += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="3" />`;

    let label = '';
    if (val >= 100000) {
      label = `₹${(val / 100000).toFixed(1)}L`;
    } else if (val >= 1000) {
      label = `₹${(val / 1000).toFixed(0)}k`;
    } else {
      label = `₹${val}`;
    }
    svg += `<text x="${paddingLeft - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="#6b7280" font-weight="600">${label}</text>`;
  }

  expSeries.labels.forEach((label, i) => {
    const x = getX(i);
    svg += `
      <line x1="${x}" y1="${height - paddingBottom}" x2="${x}" y2="${height - paddingBottom + 4}" stroke="#d1d5db" />
      <text x="${x}" y="${height - 8}" text-anchor="middle" font-size="9" fill="#6b7280" font-weight="600">${label}</text>
    `;
  });

  if (incomesRupees.length > 0) {
    let incomePath = '';
    let incomeAreaPath = `M ${getX(0)} ${height - paddingBottom} `;
    incomesRupees.forEach((val, i) => {
      const x = getX(i);
      const y = getY(val);
      if (i === 0) {
        incomePath += `M ${x} ${y} `;
      } else {
        incomePath += `L ${x} ${y} `;
      }
      incomeAreaPath += `L ${x} ${y} `;
    });
    incomeAreaPath += `L ${getX(incomesRupees.length - 1)} ${height - paddingBottom} Z`;

    svg += `<path d="${incomeAreaPath}" fill="#d1fae5" opacity="0.35" />`;
    svg += `<path d="${incomePath}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    incomesRupees.forEach((val, i) => {
      svg += `<circle cx="${getX(i)}" cy="${getY(val)}" r="3.5" fill="#10b981" stroke="#ffffff" stroke-width="1" />`;
    });
  }

  if (expensesRupees.length > 0) {
    let expensePath = '';
    let expenseAreaPath = `M ${getX(0)} ${height - paddingBottom} `;
    expensesRupees.forEach((val, i) => {
      const x = getX(i);
      const y = getY(val);
      if (i === 0) {
        expensePath += `M ${x} ${y} `;
      } else {
        expensePath += `L ${x} ${y} `;
      }
      expenseAreaPath += `L ${x} ${y} `;
    });
    expenseAreaPath += `L ${getX(expensesRupees.length - 1)} ${height - paddingBottom} Z`;

    svg += `<path d="${expenseAreaPath}" fill="#fee2e2" opacity="0.35" />`;
    svg += `<path d="${expensePath}" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
    expensesRupees.forEach((val, i) => {
      svg += `<circle cx="${getX(i)}" cy="${getY(val)}" r="3.5" fill="#ef4444" stroke="#ffffff" stroke-width="1" />`;
    });
  }

  svg += `
    <g transform="translate(${width - 130}, 8)">
      <rect x="0" y="0" width="8" height="8" fill="#10b981" rx="1.5" />
      <text x="12" y="7" font-size="9" font-weight="600" fill="#4b5563">Income</text>
      <rect x="60" y="0" width="8" height="8" fill="#ef4444" rx="1.5" />
      <text x="72" y="7" font-size="9" font-weight="600" fill="#4b5563">Expense</text>
    </g>
  `;

  svg += `</svg>`;
  return svg;
};

/** Compiles HTML file containing report tables and charts. */
const buildHtmlReport = (
  userId: string,
  nw: any,
  pf: any,
  expMonth: any,
  expSeries: any,
  selected: Record<string, boolean>,
  includeVault: boolean,
  addWatermark: boolean,
  watermarkText: string,
): string => {
  const allocationSvg = selected.assets && pf.allocation && pf.allocation.length > 0
    ? makeAssetPieSvg(pf.allocation)
    : '';

  const trendSvg = expSeries && expSeries.labels && expSeries.labels.length > 0
    ? makeTrendLineSvg(expSeries)
    : '';

  let assetsHtml = '';
  if (selected.assets) {
    const assets = all<Asset & { tn: string }>(
      `SELECT a.*, t.name tn FROM assets a JOIN asset_types t ON t.id=a.asset_type_id WHERE a.user_id=?`,
      [userId]
    );
    assetsHtml = `
      <div class="section">
        <div class="section-title">Assets & Portfolio Summary</div>
        <div class="chart-row">
          <div class="chart-container" style="flex: 1.2;">
            ${allocationSvg}
          </div>
          <div style="flex: 0.8; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background-color: #f9fafb; font-size: 13px;">
            <div style="font-weight: 700; margin-bottom: 8px; color: #111827;">Portfolio KPI</div>
            <div><strong>Total Assets Value:</strong> ${formatINR(pf.total_value)}</div>
            <div style="margin-top: 4px;"><strong>Total Invested:</strong> ${formatINR(pf.total_invested)}</div>
            <div style="margin-top: 4px;"><strong>Total P&L:</strong> <span style="color: ${pf.total_pnl >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold;">${formatINR(pf.total_pnl)} (${pf.pnl_pct}%)</span></div>
            <div style="margin-top: 4px;"><strong>Total Asset Count:</strong> ${pf.asset_count}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Asset Name</th>
              <th>Type</th>
              <th class="text-right">Invested</th>
              <th class="text-right">Current Value</th>
              <th class="text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            ${assets.map(a => {
              const pnl = a.current_value - a.invested_amount;
              const pnlPct = a.invested_amount ? ((pnl / a.invested_amount) * 100).toFixed(2) : '0.00';
              const pnlTone = pnl >= 0 ? '#10b981' : '#ef4444';
              return `
                <tr>
                  <td><strong>${a.name}</strong></td>
                  <td>${a.tn}</td>
                  <td class="text-right">${formatINR(a.invested_amount)}</td>
                  <td class="text-right">${formatINR(a.current_value)}</td>
                  <td class="text-right" style="color: ${pnlTone}; font-weight: 600;">${formatINR(pnl)} (${pnlPct}%)</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  let healthHtml = '';
  if (selected.health) {
    const h = financialHealth(userId);
    healthHtml = `
      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Financial Health Audit</div>
        <div class="kpi-container" style="margin-bottom: 15px;">
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #3b82f6;">
            <div class="kpi-label">Health Score</div>
            <div class="kpi-value">${h.score}/100</div>
            <div class="kpi-sub">${h.rating}</div>
          </div>
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #10b981;">
            <div class="kpi-label">Savings Rate</div>
            <div class="kpi-value">${h.savings_rate}%</div>
            <div class="kpi-sub">Monthly savings fraction</div>
          </div>
        </div>
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; font-size: 12px;">
          <div style="font-weight: 700; margin-bottom: 6px; color: #111827;">Component Scores</div>
          <div style="display: flex; gap: 20px;">
            <div style="flex: 1;">Diversification: <strong>${h.components.diversification}/100</strong></div>
            <div style="flex: 1;">Risk Balance: <strong>${h.components.risk_balance}/100</strong></div>
            <div style="flex: 1;">Liquidity: <strong>${h.components.liquidity}/100</strong></div>
            <div style="flex: 1;">Insurance: <strong>${h.components.insurance}/100</strong></div>
          </div>
        </div>
        <div style="margin-top: 10px;">
          <div style="font-weight: 700; color: #374151; margin-bottom: 5px;">Health Score Insights:</div>
          <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
            ${h.insights.map(i => `<li style="margin-bottom: 4px;">${i}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  let passwordHtml = '';
  if (selected.password) {
    const p = passwordHealth(userId);
    passwordHtml = `
      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Vault Password Health</div>
        <div class="kpi-container" style="margin-bottom: 15px;">
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #10b981;">
            <div class="kpi-label">Vault Score</div>
            <div class="kpi-value">${p.score}%</div>
            <div class="kpi-sub">Average strength</div>
          </div>
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #6b7280;">
            <div class="kpi-label">Total Saved</div>
            <div class="kpi-value">${p.total}</div>
            <div class="kpi-sub">Credentials in Vault</div>
          </div>
        </div>
        <table style="max-width: 400px; margin-top: 5px;">
          <thead>
            <tr>
              <th>Metric</th>
              <th class="text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Strong Passwords (&ge;75%)</td>
              <td class="text-right" style="color: #065f46; font-weight: bold;">${p.strong}</td>
            </tr>
            <tr>
              <td>Weak Passwords (&lt;50%)</td>
              <td class="text-right" style="color: #991b1b; font-weight: bold;">${p.weak}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  let benchmarkHtml = '';
  if (selected.benchmark) {
    const b = benchmarkComparison(userId);
    benchmarkHtml = `
      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Benchmark Audit (${b.risk_profile} profile)</div>
        <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #111827;">Portfolio Drift: ${b.drift}%</div>
        <table>
          <thead>
            <tr>
              <th>Asset Class</th>
              <th class="text-right">Your Allocation</th>
              <th class="text-right">Recommended Target</th>
              <th class="text-right">Difference</th>
            </tr>
          </thead>
          <tbody>
            ${b.rows.map(r => {
              const diff = Number((r.actual - r.recommended).toFixed(1));
              const isOff = Math.abs(diff) > 10;
              return `
                <tr>
                  <td><strong>${r.type}</strong></td>
                  <td class="text-right">${r.actual}%</td>
                  <td class="text-right">${r.recommended}%</td>
                  <td class="text-right" style="font-weight: bold; color: ${isOff ? '#ef4444' : '#4b5563'};">
                    ${diff > 0 ? `+${diff}%` : `${diff}%`}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  let loansHtml = '';
  if (selected.loans) {
    const loans = all<Loan>('SELECT * FROM loans WHERE user_id=?', [userId]);
    loansHtml = `
      <div class="section">
        <div class="section-title">Loans & Liabilities</div>
        <table>
          <thead>
            <tr>
              <th>Provider / Type</th>
              <th class="text-right">Original Amount</th>
              <th class="text-right">Outstanding</th>
              <th class="text-right">EMI</th>
              <th>Rate</th>
              <th>Next Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${loans.map(l => {
              const status = loanStatus(l);
              const tone = status === 'closed' ? 'good' : status === 'overdue' ? 'bad' : 'muted';
              return `
                <tr>
                  <td><strong>${l.provider || LOAN_TYPE_LABELS[l.loan_type]}</strong><br/><span style="font-size: 10px; color: #6b7280;">${titleCase(l.loan_type)}</span></td>
                  <td class="text-right">${formatINR(l.original_amount)}</td>
                  <td class="text-right" style="font-weight: 600; color: #1f2937;">${formatINR(l.outstanding_amount)}</td>
                  <td class="text-right">${formatINR(l.emi_amount)}</td>
                  <td>${l.interest_rate}% (${l.interest_type || 'Fixed'})</td>
                  <td>${l.next_due_date || 'N/A'}</td>
                  <td><span class="badge badge-${tone}">${titleCase(status)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  let protectHtml = '';
  if (selected.protect) {
    const policies = all<InsurancePolicy>('SELECT * FROM insurance_policies WHERE user_id=?', [userId]);
    protectHtml = `
      <div class="section">
        <div class="section-title">Insurance & Protection Policies</div>
        <table>
          <thead>
            <tr>
              <th>Policy Name / Provider</th>
              <th>Type</th>
              <th class="text-right">Coverage Cover</th>
              <th class="text-right">Premium</th>
              <th>Frequency</th>
              <th>Expiry Date</th>
              <th>Next Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${policies.map(p => {
              const status = policyStatus(p);
              const tone = status === 'active' ? 'good' : status === 'lapsed' ? 'bad' : 'muted';
              return `
                <tr>
                  <td><strong>${p.policy_name}</strong><br/><span style="font-size: 10px; color: #6b7280;">${p.provider || 'N/A'}</span></td>
                  <td>${POLICY_TYPE_LABELS[p.policy_type]}</td>
                  <td class="text-right" style="font-weight: 600; color: #1f2937;">${formatINR(p.coverage_amount)}</td>
                  <td class="text-right">${formatINR(p.premium_amount)}</td>
                  <td><span style="text-transform: capitalize;">${p.premium_frequency}</span></td>
                  <td>${p.expiry_date || 'N/A'}</td>
                  <td>${p.next_due_date || 'N/A'}</td>
                  <td><span class="badge badge-${tone}">${titleCase(status)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  let goalsHtml = '';
  if (selected.goals) {
    const goals = goalsProgress(userId).goals;
    goalsHtml = `
      <div class="section">
        <div class="section-title">Financial Goals</div>
        <table>
          <thead>
            <tr>
              <th>Goal Name</th>
              <th class="text-right">Target Amount</th>
              <th class="text-right">Current Savings</th>
              <th>Progress</th>
              <th>Target Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${goals.map(g => {
              return `
                <tr>
                  <td><strong>${g.name}</strong></td>
                  <td class="text-right">${formatINR(g.target_amount)}</td>
                  <td class="text-right">${formatINR(g.current)}</td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <div style="flex: 1; background-color: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden; min-width: 80px;">
                        <div style="background-color: ${g.pct >= 70 ? '#10b981' : g.pct >= 40 ? '#f59e0b' : '#ef4444'}; width: ${g.pct}%; height: 100%;"></div>
                      </div>
                      <span style="font-size: 11px; font-weight: 600; color: #4b5563;">${g.pct}%</span>
                    </div>
                  </td>
                  <td>${g.target_date}</td>
                  <td><span class="badge badge-${g.status_tone}">${g.status_label}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  let sipHtml = '';
  if (selected.sip) {
    const sips = all<SIPSchedule & { asset_name: string }>(
      `SELECT s.*, a.name AS asset_name FROM sip_schedules s
       JOIN assets a ON a.id = s.asset_id WHERE s.user_id = ?`,
      [userId]
    );
    sipHtml = `
      <div class="section">
        <div class="section-title">SIP Investment Schedules</div>
        <table>
          <thead>
            <tr>
              <th>Linked Asset</th>
              <th class="text-right">SIP Amount</th>
              <th>Frequency</th>
              <th>Next Due Date</th>
            </tr>
          </thead>
          <tbody>
            ${sips.map(s => {
              return `
                <tr>
                  <td><strong>${s.asset_name}</strong></td>
                  <td class="text-right" style="font-weight: 600; color: #1f2937;">${formatINR(s.amount)}</td>
                  <td><span style="text-transform: capitalize;">${s.frequency}</span></td>
                  <td>${s.next_due_date || 'N/A'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  let vaultHtml = '';
  if (includeVault) {
    const creds = all<VaultCredential>('SELECT * FROM vault_credentials WHERE user_id = ? ORDER BY service', [userId]);
    vaultHtml = `
      <div class="section" style="page-break-before: always;">
        <div class="section-title" style="color: #991b1b; border-bottom: 2px solid #fee2e2;">Decrypted Vault Credentials</div>
        <div class="warning-banner">
          <div class="warning-title">SECURITY WARNING: SENSITIVE CREDENTIALS EXPORTED</div>
          This section contains decrypted passwords and sensitive credentials from your secure vault. Keep this PDF file in a safe location and delete it from public sharing folders when no longer needed.
        </div>
        <table>
          <thead>
            <tr>
              <th>Service / Site</th>
              <th>Username / Email</th>
              <th>Plaintext Password</th>
              <th>Strength</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            ${creds.map(c => {
              const tone = c.password_strength >= 70 ? 'good' : c.password_strength >= 40 ? 'warn' : 'bad';
              const label = c.password_strength >= 70 ? 'Strong' : c.password_strength >= 40 ? 'Medium' : 'Weak';
              return `
                <tr>
                  <td><strong>${c.service}</strong></td>
                  <td>${c.username || 'N/A'}</td>
                  <td style="font-family: monospace; font-size: 12px; color: #111827; background-color: #f9fafb; padding: 4px 8px; border-radius: 4px; border: 1px solid #e5e7eb; word-break: break-all;">${c.password_enc}</td>
                  <td><span class="badge badge-${tone}">${label} (${c.password_strength}%)</span></td>
                  <td><a href="${c.url || '#'}" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 11px; word-break: break-all;">${c.url || 'N/A'}</a></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>FinVault Financial Report</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #1f2937;
          margin: 0;
          padding: 30px;
          background-color: #ffffff;
          font-size: 12px;
          line-height: 1.5;
        }
        .header {
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 15px;
          margin-bottom: 25px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .header-title {
          font-size: 24px;
          font-weight: 800;
          color: #111827;
          letter-spacing: -0.025em;
          margin: 0;
        }
        .header-meta {
          font-size: 11px;
          color: #6b7280;
          margin-top: 4px;
        }
        .kpi-container {
          display: flex;
          justify-content: space-between;
          margin-bottom: 25px;
          gap: 12px;
        }
        .kpi-card {
          flex: 1;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 12px;
          background-color: #f9fafb;
        }
        .kpi-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          color: #6b7280;
          letter-spacing: 0.05em;
        }
        .kpi-value {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
          margin-top: 4px;
        }
        .kpi-sub {
          font-size: 10px;
          margin-top: 2px;
          color: #6b7280;
        }
        .section {
          margin-bottom: 30px;
          page-break-inside: avoid;
        }
        .section-title {
          font-size: 15px;
          font-weight: 700;
          color: #111827;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 6px;
          margin-bottom: 12px;
        }
        .chart-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 15px;
          gap: 15px;
        }
        .chart-container {
          display: flex;
          justify-content: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        th {
          background-color: #f3f4f6;
          text-align: left;
          font-weight: 600;
          color: #374151;
          font-size: 10px;
          text-transform: uppercase;
          padding: 8px 10px;
          border-bottom: 1px solid #e5e7eb;
        }
        td {
          padding: 8px 10px;
          border-bottom: 1px solid #f3f4f6;
          color: #4b5563;
          font-size: 11px;
        }
        .text-right {
          text-align: right;
        }
        .badge {
          display: inline-block;
          padding: 2px 5px;
          font-size: 9px;
          font-weight: 600;
          border-radius: 3px;
          text-transform: capitalize;
        }
        .badge-good { background-color: #d1fae5; color: #065f46; }
        .badge-warn { background-color: #fef3c7; color: #92400e; }
        .badge-bad { background-color: #fee2e2; color: #991b1b; }
        .badge-muted { background-color: #f3f4f6; color: #374151; }

        .warning-banner {
          background-color: #fffbeb;
          border: 1px solid #fef3c7;
          border-radius: 6px;
          padding: 12px;
          color: #92400e;
          margin-bottom: 20px;
          font-size: 11px;
        }
        .warning-title {
          font-weight: 700;
          margin-bottom: 3px;
          font-size: 12px;
        }
        ${addWatermark ? `
        .watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 70px;
          color: rgba(220, 220, 220, 0.2);
          font-weight: 800;
          z-index: -1000;
          pointer-events: none;
          white-space: nowrap;
          font-family: sans-serif;
          letter-spacing: 0.15em;
        }
        ` : ''}
      </style>
    </head>
    <body>
      ${addWatermark ? `<div class="watermark">${watermarkText}</div>` : ''}
      <div class="header">
        <div>
          <h1 class="header-title">FINVAULT FINANCIAL REPORT</h1>
          <div class="header-meta">Generated on ${todayISO()} for user Aarav Sharma</div>
        </div>
        <div style="font-size: 11px; color: #9ca3af; font-family: monospace;">CONFIDENTIAL &bull; SECURE PDF</div>
      </div>

      <div class="kpi-container">
        <div class="kpi-card">
          <div class="kpi-label">Net Worth</div>
          <div class="kpi-value">${formatINR(nw.net_worth)}</div>
          <div class="kpi-sub">Calculated Assets vs Liabilities</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Portfolio Value</div>
          <div class="kpi-value">${formatINR(pf.total_value)}</div>
          <div class="kpi-sub" style="color: ${pf.total_pnl >= 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">
            ${pf.total_pnl >= 0 ? '+' : ''}${formatINR(pf.total_pnl)} (${pf.pnl_pct}%)
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Monthly Expenses</div>
          <div class="kpi-value">${formatINR(expMonth.total)}</div>
          <div class="kpi-sub">${expMonth.categories.length} dynamic categories</div>
        </div>
      </div>

      ${trendSvg ? `
        <div class="section" style="page-break-inside: avoid;">
          <div class="section-title">Income & Expense Cashflow Trend (Past 6 Months)</div>
          <div class="chart-container" style="margin-top: 10px; margin-bottom: 15px;">
            ${trendSvg}
          </div>
        </div>
      ` : ''}

      ${healthHtml}
      ${benchmarkHtml}
      ${passwordHtml}
      ${assetsHtml}
      ${sipHtml}
      ${loansHtml}
      ${protectHtml}
      ${goalsHtml}
      ${vaultHtml}
    </body>
    </html>
  `;
};

const ReportsScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  
  // Data Queries
  const nw = useData(() => netWorth(userId));
  const pf = useData(() => portfolioSummary(userId));
  const expMonth = useData(() => categoryBreakdown(userId, new Date().getFullYear(), new Date().getMonth() + 1));
  const expSeries = useData(() => incomeExpenseSeries(userId, 6));
  const health = useData(() => financialHealth(userId));
  const pwdHealth = useData(() => passwordHealth(userId));
  const benchmark = useData(() => benchmarkComparison(userId));
  const goals = useData(() => goalsProgress(userId));

  const [selected, setSelected] = useState<Record<string, boolean>>({
    assets: true,
    loans: true,
    protect: true,
    goals: true,
    sip: true,
    health: true,
    password: true,
    benchmark: true,
  });
  const [snack, setSnack] = useState('');
  const allOn = MODULES.every((m) => selected[m.key]);

  // Secure PDF Dialog state
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [showPdfPassword, setShowPdfPassword] = useState(false);
  const [includeVault, setIncludeVault] = useState(false);
  const [addWatermark, setAddWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [isGenerating, setIsGenerating] = useState(false);

  const toggle = (k: string) => setSelected((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => {
    const next = !allOn;
    setSelected(Object.fromEntries(MODULES.map((m) => [m.key, next])));
  };

  const buildReport = (): string => {
    const lines: string[] = ['FinVault Report', todayISO(), '', `Net Worth: ${formatINR(nw.net_worth)}`, ''];
    
    if (selected.health) {
      lines.push('— Financial Health Audit —');
      lines.push(`Health Score: ${health.score}/100 (${health.rating})`);
      lines.push(`Savings Rate: ${health.savings_rate}%`);
      health.insights.forEach((ins) => lines.push(`  • ${ins}`));
      lines.push('');
    }
    
    if (selected.benchmark) {
      lines.push(`— Benchmark Audit (${benchmark.risk_profile} profile) —`);
      lines.push(`Portfolio Drift: ${benchmark.drift}%`);
      benchmark.rows.forEach((r) => {
        const diff = Number((r.actual - r.recommended).toFixed(1));
        lines.push(`  • ${r.type}: Actual ${r.actual}% vs Rec ${r.recommended}% (Diff: ${diff > 0 ? `+${diff}` : diff}%)`);
      });
      lines.push('');
    }

    if (selected.password) {
      lines.push('— Password Health Audit —');
      lines.push(`Vault Score: ${pwdHealth.score}% · Total Saved: ${pwdHealth.total}`);
      lines.push(`Strong: ${pwdHealth.strong} · Weak: ${pwdHealth.weak}`);
      lines.push('');
    }

    if (selected.assets) {
      lines.push('— Assets / Portfolio —');
      lines.push(`Total value ${formatINR(pf.total_value)} · P&L ${pf.pnl_pct}%`);
      all<Asset & { tn: string }>(
        `SELECT a.*, t.name tn FROM assets a JOIN asset_types t ON t.id=a.asset_type_id WHERE a.user_id=?`,
        [userId],
      ).forEach((a) => lines.push(`  • ${a.name} (${a.tn}): ${formatINR(a.current_value)}`));
      lines.push('');
    }
    if (selected.sip) {
      lines.push('— SIP Schedules —');
      all<SIPSchedule & { asset_name: string }>(
        `SELECT s.*, a.name AS asset_name FROM sip_schedules s
         JOIN assets a ON a.id = s.asset_id WHERE s.user_id = ?`,
        [userId],
      ).forEach((s) =>
        lines.push(`  • ${s.asset_name}: ${formatINR(s.amount)} (${titleCase(s.frequency)}) - Next due: ${s.next_due_date || 'N/A'}`),
      );
      lines.push('');
    }
    if (selected.loans) {
      lines.push('— Loans & Liabilities —');
      all<Loan>('SELECT * FROM loans WHERE user_id=?', [userId]).forEach((l) =>
        lines.push(`  • ${l.provider || LOAN_TYPE_LABELS[l.loan_type]}: ${formatINR(l.outstanding_amount)} outstanding (${titleCase(loanStatus(l))})`),
      );
      lines.push('');
    }
    if (selected.protect) {
      lines.push('— Insurance / Protect —');
      all<InsurancePolicy>('SELECT * FROM insurance_policies WHERE user_id=?', [userId]).forEach((p) =>
        lines.push(`  • ${p.policy_name} (${POLICY_TYPE_LABELS[p.policy_type]}): ${formatINR(p.coverage_amount)} cover (${titleCase(policyStatus(p))})`),
      );
      lines.push('');
    }
    if (selected.goals) {
      lines.push('— Financial Goals —');
      goals.goals.forEach((g) => lines.push(`  • ${g.name}: ${g.pct}% (${g.status_label})`));
      lines.push('');
    }
    return lines.join('\n');
  };

  const onExportText = async () => {
    const anyOn = MODULES.some((m) => selected[m.key]);
    if (!anyOn) {
      setSnack('Select at least one module to include.');
      return;
    }
    try {
      await Share.share({ title: 'FinVault Report', message: buildReport() });
    } catch {
      setSnack('Export cancelled.');
    }
  };

  const onExportPdf = async () => {
    const anyOn = MODULES.some((m) => selected[m.key]);
    if (!anyOn) {
      setSnack('Select at least one module to include.');
      return;
    }
    if (!pdfPassword.trim()) {
      setSnack('PDF Lock Password is required.');
      return;
    }

    setIsGenerating(true);
    try {
      // 1. Compile the detailed HTML layout with vector SVG graphics
      const htmlContent = buildHtmlReport(userId, nw, pf, expMonth, expSeries, selected, includeVault, addWatermark, watermarkText);

      // 2. Generate PDF file using expo-print
      const { uri } = await Print.printToFileAsync({ html: htmlContent });

      // 3. Read generated PDF file bytes as base64 string
      const base64Str = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 4. Convert Base64 back to Uint8Array
      const pdfBytes = base64ToUint8Array(base64Str);

      // 5. Encrypt PDF using the password
      const encryptedBytes = await encryptPDF(pdfBytes, pdfPassword);

      // 6. Convert encrypted Uint8Array back to Base64
      const encryptedBase64 = uint8ArrayToBase64(encryptedBytes);

      // 7. Write encrypted Base64 bytes back to file
      const secureUri = `${FileSystem.cacheDirectory}secure-finvault-report-${Date.now()}.pdf`;
      await FileSystem.writeAsStringAsync(secureUri, encryptedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 8. Open Native Share sheet
      await Sharing.shareAsync(secureUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Secure PDF Report',
        UTI: 'com.adobe.pdf',
      });

      setPdfDialogOpen(false);
      setPdfPassword('');
      setSnack('Secure PDF shared successfully.');
    } catch (err: any) {
      console.error(err);
      setSnack(`Failed to generate secure PDF: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Screen>
        <Row>
          <Kpi label="Portfolio Value" value={formatINR(pf.total_value)} />
          <Kpi label="Total Invested" value={formatINR(pf.total_invested)} />
        </Row>
        <Row style={{ marginTop: 8 }}>
          <Kpi
            label="Total P&L"
            value={formatINR(pf.total_pnl)}
            sub={`${pf.total_pnl >= 0 ? '+' : ''}${pf.pnl_pct}% P&L`}
            subTone={pf.total_pnl >= 0 ? 'good' : 'bad'}
          />
          <Kpi label="Health Score" value={`${health.score}/100`} sub={health.rating} subTone="good" />
        </Row>


        {/* 1. Financial Health Card */}
        <SectionCard title="Financial Health">
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.primaryContainer, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
              <Text variant="headlineSmall" style={{ fontWeight: '800', color: theme.colors.onPrimaryContainer }}>{health.score}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{health.rating} Rating</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Savings rate: {health.savings_rate}% · Income vs. Expenses
              </Text>
            </View>
          </View>
          <Divider style={{ marginVertical: 8 }} />
          {health.insights.map((insight, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginVertical: 4 }}>
              <MaterialCommunityIcons name="information-outline" size={16} color={theme.colors.primary} style={{ marginTop: 2, marginRight: 8 }} />
              <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>{insight}</Text>
            </View>
          ))}
        </SectionCard>

        {/* 2. Asset Allocation & Benchmark Card */}
        <SectionCard title={`Benchmark Audit (${benchmark.risk_profile} profile)`}>
          {pf.allocation.length > 0 ? (
            <View style={{ marginBottom: 12 }}>
              <DistributionPie data={pf.allocation.map((a, i) => ({ name: a.type, value: a.value / 100, color: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'][i % 7] }))} />
            </View>
          ) : (
            <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>No assets logged yet.</Text>
          )}
          <Divider style={{ marginVertical: 8 }} />
          <Text variant="titleSmall" style={{ fontWeight: '800', marginBottom: 6 }}>Portfolio Drift: {benchmark.drift}%</Text>
          {benchmark.rows.map((row, idx) => {
            const diff = Number((row.actual - row.recommended).toFixed(1));
            const isOff = Math.abs(diff) > 10;
            return (
              <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text style={{ flex: 2, color: theme.colors.onSurfaceVariant }}>{row.type}</Text>
                <Text style={{ flex: 1, textAlign: 'right', fontWeight: '600' }}>{row.actual}%</Text>
                <Text style={{ flex: 1.2, textAlign: 'right', color: theme.colors.onSurfaceVariant }}>Rec: {row.recommended}%</Text>
                <Text style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: isOff ? palette.danger : theme.colors.onSurfaceVariant }}>
                  {diff > 0 ? `+${diff}%` : `${diff}%`}
                </Text>
              </View>
            );
          })}
        </SectionCard>

        {/* 3. Password Health Card */}
        <SectionCard title="Password Health">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Vault Score</Text>
            <Text variant="titleLarge" style={{ fontWeight: '800', color: theme.colors.primary }}>{pwdHealth.score}%</Text>
          </View>
          <View style={{ marginBottom: 12 }}>
            <ProgressBar pct={pwdHealth.score} color={pwdHealth.score >= 70 ? palette.good : pwdHealth.score >= 40 ? palette.warn : palette.danger} height={8} />
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Total Saved</Text>
            <Text style={{ fontWeight: 'bold' }}>{pwdHealth.total}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Strong Passwords</Text>
            <Text style={{ fontWeight: 'bold', color: palette.good }}>{pwdHealth.strong}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Weak Passwords</Text>
            <Text style={{ fontWeight: 'bold', color: palette.danger }}>{pwdHealth.weak}</Text>
          </View>
        </SectionCard>

        {/* 4. Goals Progress Card */}
        <SectionCard title="Goal Progress">
          {goals.goals.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>No financial goals created yet.</Text>
          ) : (
            goals.goals.slice(0, 4).map((g) => (
              <View key={g.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontWeight: '600' }}>{g.name}</Text>
                  <Text style={{ fontWeight: '700', color: g.pct >= 70 ? palette.good : g.pct >= 40 ? palette.warn : palette.danger }}>{g.pct}%</Text>
                </View>
                <ProgressBar pct={g.pct} color={g.pct >= 70 ? palette.good : g.pct >= 40 ? palette.warn : palette.danger} />
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard title="Income vs Expense (6 mo)">
          {expSeries.labels.length > 0 ? (
            <TrendLine
              labels={expSeries.labels}
              legend={['Income', 'Expense']}
              datasets={[
                { data: expSeries.income.map((v) => v / 100), color: '#10b981' },
                { data: expSeries.expenses.map((v) => v / 100), color: chartColors.expense },
              ]}
            />
          ) : null}
        </SectionCard>

        <SectionCard title="Export Report" right={<Button compact onPress={toggleAll}>{allOn ? 'Clear all' : 'Select all'}</Button>}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            Choose the modules to include in the export.
          </Text>
          {MODULES.map((m) => (
            <Checkbox.Item
              key={m.key}
              label={m.label}
              status={selected[m.key] ? 'checked' : 'unchecked'}
              onPress={() => toggle(m.key)}
              position="leading"
              style={{ paddingVertical: 0 }}
            />
          ))}
          <Divider style={{ marginVertical: 8 }} />
          <View style={{ gap: 8 }}>
            <Button mode="contained" icon="share-variant" onPress={onExportText}>
              Share Plain Text Report
            </Button>
            <Button mode="contained-tonal" icon="file-lock" onPress={() => setPdfDialogOpen(true)}>
              Export Secure PDF
            </Button>
          </View>
        </SectionCard>
      </Screen>

      <Portal>
        <Dialog visible={pdfDialogOpen} onDismiss={() => !isGenerating && setPdfDialogOpen(false)}>
          <Dialog.Title>Export Secure PDF</Dialog.Title>
          <Dialog.Content>
            {isGenerating ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}>
                  Compiling and encrypting PDF...
                </Text>
              </View>
            ) : (
              <>
                <Text variant="bodyMedium" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}>
                  Generate a detailed PDF report of selected modules. Enter a password to encrypt and lock the PDF.
                </Text>
                
                <TextInput
                  label="PDF Lock Password"
                  value={pdfPassword}
                  onChangeText={setPdfPassword}
                  mode="outlined"
                  secureTextEntry={!showPdfPassword}
                  autoCapitalize="none"
                  right={
                    <TextInput.Icon
                      icon={showPdfPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPdfPassword(!showPdfPassword)}
                    />
                  }
                  style={{ marginBottom: 12 }}
                />
                
                <Checkbox.Item
                  label="Include Vault Credentials"
                  status={includeVault ? 'checked' : 'unchecked'}
                  onPress={() => setIncludeVault(!includeVault)}
                  position="leading"
                  style={{ paddingVertical: 0 }}
                />
                
                {includeVault && (
                  <Text
                    variant="bodySmall"
                    style={{ color: palette.danger, marginLeft: 16, marginTop: 4, fontWeight: '600', marginBottom: 8 }}
                  >
                    ⚠️ WARNING: This will export all passwords in plaintext inside the password-locked PDF.
                  </Text>
                )}
                
                <Checkbox.Item
                  label="Add Watermark"
                  status={addWatermark ? 'checked' : 'unchecked'}
                  onPress={() => setAddWatermark(!addWatermark)}
                  position="leading"
                  style={{ paddingVertical: 0 }}
                />
                
                {addWatermark && (
                  <TextInput
                    label="Watermark Text"
                    value={watermarkText}
                    onChangeText={setWatermarkText}
                    mode="outlined"
                    dense
                    style={{ marginBottom: 12, marginTop: 4, marginLeft: 16 }}
                  />
                )}
              </>
            )}
          </Dialog.Content>
          {!isGenerating && (
            <Dialog.Actions>
              <Button onPress={() => setPdfDialogOpen(false)}>Cancel</Button>
              <Button 
                mode="contained" 
                disabled={!pdfPassword.trim()} 
                onPress={onExportPdf}
              >
                Generate PDF
              </Button>
            </Dialog.Actions>
          )}
        </Dialog>
      </Portal>

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={2500}>
        {snack}
      </Snackbar>
    </>
  );
};

export default ReportsScreen;
