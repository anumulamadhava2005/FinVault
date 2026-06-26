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
import { deriveEncryptionKey, decryptWithKey } from '../utils/crypto';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { DistributionPie, TrendLine } from '../components/charts';
import { Kpi, ProgressBar, Row, Screen, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { all, first } from '../db';
import { useData } from '../hooks/useData';
import type { Asset, AssetImage, FinancialGoal, InsurancePolicy, Loan, SIPSchedule, VaultCredential } from '../models/types';
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
import { capitalGains } from '../services/taxService';
import { getBenchmarkComparison } from '../services/benchmarkService';
import { getPassiveIncomeSummary } from '../services/passiveIncomeService';
import { getSectorOverlapAnalysis } from '../services/sectorService';
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
  { key: 'benchmark_nifty', label: 'Benchmark vs Nifty Audit' },
  { key: 'tax', label: 'Capital Gains Audit' },
  { key: 'passive_income', label: 'Passive Income & Forecast' },
  { key: 'sector', label: 'Sector Overlap Analysis' },
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
const buildHtmlReport = async (
  userId: string,
  userName: string,
  masterPassword: string | null,
  nw: any,
  pf: any,
  expMonth: any,
  expSeries: any,
  selected: Record<string, boolean>,
  includeVault: boolean,
  addWatermark: boolean,
  watermarkText: string,
): Promise<string> => {
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
      [userId!]
    );

    // Fetch all attachments for these assets
    const allAttachments = all<AssetImage>(
      `SELECT * FROM asset_images WHERE user_id=? ORDER BY created_at DESC`,
      [userId!]
    );

    // Read base64 content for each attachment asynchronously
    const attachmentsWithBase64 = await Promise.all(
      allAttachments.map(async (img) => {
        try {
          const exists = await FileSystem.getInfoAsync(img.uri);
          if (!exists.exists) return { ...img, base64: null, tooLarge: false, size: 0 };
          const isPdf = img.label?.startsWith('pdf:');

          if (isPdf) {
            // Check file size for PDF to avoid OutOfMemoryError
            const sizeLimit = 1.5 * 1024 * 1024; // 1.5 MB
            if (exists.size && exists.size > sizeLimit) {
              return { ...img, base64: null, tooLarge: true, size: exists.size };
            }
            const base64 = await FileSystem.readAsStringAsync(img.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            return { ...img, base64, tooLarge: false, size: exists.size };
          } else {
            // It's an image. Resize and compress using expo-image-manipulator to prevent WebView OOM
            const manipResult = await manipulateAsync(
              img.uri,
              [{ resize: { width: 800 } }],
              { compress: 0.6, format: SaveFormat.JPEG, base64: true }
            );
            return { ...img, base64: manipResult.base64 || null, tooLarge: false, size: exists.size };
          }
        } catch (err) {
          console.warn(`Failed to read file for PDF export: ${img.uri}`, err);
          return { ...img, base64: null, tooLarge: false, size: 0 };
        }
      })
    );

    // Build attachments preview HTML
    let attachmentsPreviewHtml = '';
    const assetsWithAttachments = assets.filter(a =>
      attachmentsWithBase64.some(img => img.asset_id === a.id)
    );

    if (assetsWithAttachments.length > 0) {
      const attachmentsHtmlList = await Promise.all(assetsWithAttachments.map(async (a) => {
        const assetImgs = attachmentsWithBase64.filter(img => img.asset_id === a.id);
        const imagesHtmlList = assetImgs.map(img => {
          const isPdf = img.label?.startsWith('pdf:');
          const filename = img.label?.replace('pdf:', '') ?? (isPdf ? 'document.pdf' : 'image.jpg');
          const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';

          let previewContent = '';
          if (img.base64) {
            if (isPdf) {
              previewContent = `
                <div style="text-align: center; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; background-color: #fff; height: 500px;">
                  <object data="data:application/pdf;base64,${img.base64}" type="application/pdf" style="width: 100%; height: 100%;">
                    <embed src="data:application/pdf;base64,${img.base64}" type="application/pdf" style="width: 100%; height: 100%;" />
                  </object>
                </div>
              `;
            } else {
              previewContent = `
                <div style="text-align: center; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; background-color: #fff;">
                  <img src="data:image/jpeg;base64,${img.base64}" style="max-width: 100%; max-height: 450px; object-fit: contain; border-radius: 4px;" />
                </div>
              `;
            }
          } else if ((img as any).tooLarge) {
            const sizeMb = (((img as any).size || 0) / (1024 * 1024)).toFixed(2);
            previewContent = `
              <div style="padding: 16px; border: 1px dashed #eab308; border-radius: 6px; color: #854d0e; background-color: #fef9c3; font-size: 11px; text-align: center; page-break-inside: avoid;">
                <strong>Preview Omitted:</strong> This document file is too large to embed directly (${sizeMb} MB). 
                To maintain a stable export and prevent memory issues, please view this file directly within the application.
              </div>
            `;
          } else {
            previewContent = `
              <div style="padding: 12px; border: 1px dashed #ef4444; border-radius: 6px; color: #ef4444; background-color: #fef2f2; font-size: 11px; text-align: center;">
                Preview unavailable (Original file not found or inaccessible).
              </div>
            `;
          }

          return `
            <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 12px; page-break-inside: avoid;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-weight: 600; color: #374151; font-size: 12px;">${filename}</span>
                <span style="font-size: 10px; color: #9ca3af; font-family: monospace;">${mimeType}</span>
              </div>
              ${img.local_path ? `
                <div style="font-size: 10px; color: #6b7280; font-family: monospace; margin-bottom: 8px; word-break: break-all;">
                  Path: ${img.local_path}
                </div>
              ` : ''}
              ${previewContent}
            </div>
          `;
        }).join('');

        return `
          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; background-color: #f9fafb; margin-top: 15px; page-break-inside: avoid;">
            <div style="font-weight: 700; color: #111827; font-size: 14px; margin-bottom: 4px;">
              ${a.name} <span style="font-weight: normal; color: #6b7280; font-size: 11px;">(${a.tn})</span>
            </div>
            <div style="font-size: 11px; color: #4b5563; margin-bottom: 12px;">
              Value: ${formatINR(a.current_value)} &bull; Invested: ${formatINR(a.invested_amount)}
            </div>
            <div style="display: flex; flex-direction: column;">
              ${imagesHtmlList}
            </div>
          </div>
        `;
      }));

      attachmentsPreviewHtml = `
        <div style="page-break-before: always; margin-top: 30px;">
          <div class="section-title" style="color: #0f766e; border-bottom: 2px solid #ccfbf1; margin-bottom: 15px;">Asset Documents & Image Previews</div>
          <div style="display: flex; flex-direction: column; gap: 20px;">
            ${attachmentsHtmlList.join('')}
          </div>
        </div>
      `;
    }

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
        ${attachmentsPreviewHtml}
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

  let benchmarkNiftyHtml = '';
  if (selected.benchmark_nifty) {
    const bn = getBenchmarkComparison(userId, 'nifty');
    const pAll = bn.periods.find((p) => p.period === 'All') || bn.periods[2];
    const p3Y = bn.periods.find((p) => p.period === '3Y') || bn.periods[1];
    const p1Y = bn.periods.find((p) => p.period === '1Y') || bn.periods[0];
    
    const alphaTone = (val: number | null) => (val != null && val >= 0) ? '#10b981' : '#ef4444';
    
    benchmarkNiftyHtml = `
      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Benchmark vs Nifty Audit</div>
        <div class="kpi-container" style="margin-bottom: 15px;">
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #10b981;">
            <div class="kpi-label">Portfolio XIRR</div>
            <div class="kpi-value">${pAll.portfolio_return != null ? `${pAll.portfolio_return}%` : '—'}</div>
            <div class="kpi-sub">All-Time Annualized</div>
          </div>
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #3b82f6;">
            <div class="kpi-label">Nifty 50 Return</div>
            <div class="kpi-value">${pAll.benchmark_return}%</div>
            <div class="kpi-sub">Index All-Time Return</div>
          </div>
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #8b5cf6;">
            <div class="kpi-label">Generated Alpha</div>
            <div class="kpi-value" style="color: ${alphaTone(pAll.alpha)};">${pAll.alpha != null ? `${pAll.alpha > 0 ? '+' : ''}${pAll.alpha}%` : '—'}</div>
            <div class="kpi-sub">${(pAll.alpha != null && pAll.alpha >= 0) ? 'Outperforming' : 'Underperforming'}</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Horizon</th>
              <th class="text-right">Portfolio Return</th>
              <th class="text-right">Equity-Only Return</th>
              <th class="text-right">Nifty 50 Return</th>
              <th class="text-right">Portfolio Alpha</th>
              <th class="text-right">Equity Alpha</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>1 Year Horizon</strong></td>
              <td class="text-right">${p1Y.portfolio_return != null ? `${p1Y.portfolio_return}%` : '—'}</td>
              <td class="text-right">${p1Y.equity_return != null ? `${p1Y.equity_return}%` : '—'}</td>
              <td class="text-right">${p1Y.benchmark_return}%</td>
              <td class="text-right" style="color: ${alphaTone(p1Y.alpha)}; font-weight: bold;">${p1Y.alpha != null ? `${p1Y.alpha > 0 ? '+' : ''}${p1Y.alpha}%` : '—'}</td>
              <td class="text-right" style="color: ${alphaTone(p1Y.equity_alpha)}; font-weight: bold;">${p1Y.equity_alpha != null ? `${p1Y.equity_alpha > 0 ? '+' : ''}${p1Y.equity_alpha}%` : '—'}</td>
            </tr>
            <tr>
              <td><strong>3 Years Horizon</strong></td>
              <td class="text-right">${p3Y.portfolio_return != null ? `${p3Y.portfolio_return}%` : '—'}</td>
              <td class="text-right">${p3Y.equity_return != null ? `${p3Y.equity_return}%` : '—'}</td>
              <td class="text-right">${p3Y.benchmark_return}%</td>
              <td class="text-right" style="color: ${alphaTone(p3Y.alpha)}; font-weight: bold;">${p3Y.alpha != null ? `${p3Y.alpha > 0 ? '+' : ''}${p3Y.alpha}%` : '—'}</td>
              <td class="text-right" style="color: ${alphaTone(p3Y.equity_alpha)}; font-weight: bold;">${p3Y.equity_alpha != null ? `${p3Y.equity_alpha > 0 ? '+' : ''}${p3Y.equity_alpha}%` : '—'}</td>
            </tr>
            <tr>
              <td><strong>All Time Horizon</strong></td>
              <td class="text-right">${pAll.portfolio_return != null ? `${pAll.portfolio_return}%` : '—'}</td>
              <td class="text-right">${pAll.equity_return != null ? `${pAll.equity_return}%` : '—'}</td>
              <td class="text-right">${pAll.benchmark_return}%</td>
              <td class="text-right" style="color: ${alphaTone(pAll.alpha)}; font-weight: bold;">${pAll.alpha != null ? `${pAll.alpha > 0 ? '+' : ''}${pAll.alpha}%` : '—'}</td>
              <td class="text-right" style="color: ${alphaTone(pAll.equity_alpha)}; font-weight: bold;">${pAll.equity_alpha != null ? `${pAll.equity_alpha > 0 ? '+' : ''}${pAll.equity_alpha}%` : '—'}</td>
            </tr>
          </tbody>
        </table>
        
        <div style="margin-top: 15px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; background-color: #f9fafb; font-size: 11px; line-height: 16px;">
          <strong>Market Comparison Insight:</strong> 
          ${(pAll.alpha != null && pAll.alpha >= 0)
            ? `Your portfolio is successfully outperforming the index with a positive alpha of <strong>${pAll.alpha}%</strong>. This demonstrates strong asset selection and effective risk balancing.`
            : `Your portfolio is currently lagging the index by <strong>${Math.abs(pAll.alpha || 0)}%</strong>. Consider auditing your underperforming mutual funds or individual stock holdings to optimize returns.`
          }
        </div>
      </div>
    `;
  }

  let loansHtml = '';
  if (selected.loans) {
    const loans = all<Loan>('SELECT * FROM loans WHERE user_id=?', [userId!]);
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
    const policies = all<InsurancePolicy>('SELECT * FROM insurance_policies WHERE user_id=?', [userId!]);
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
      [userId!]
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
    const creds = all<VaultCredential>('SELECT * FROM vault_credentials WHERE user_id = ? ORDER BY service', [userId!]);
    // Derive AES key to decrypt each credential
    let vaultKey: Uint8Array | null = null;
    if (masterPassword) {
      try { vaultKey = await deriveEncryptionKey(masterPassword, userId); } catch { /* fallback to no decryption */ }
    }
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
              let plaintext = '[Locked — vault password required]';
              if (vaultKey) {
                try { plaintext = decryptWithKey(c.password_enc, vaultKey); } catch { plaintext = '[Decryption Error]'; }
              }
              return `
                <tr>
                  <td><strong>${c.service}</strong></td>
                  <td>${c.username || 'N/A'}</td>
                  <td style="font-family: monospace; font-size: 12px; color: #111827; background-color: #f9fafb; padding: 4px 8px; border-radius: 4px; border: 1px solid #e5e7eb; word-break: break-all;">${plaintext}</td>
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

  let taxHtml = '';
  if (selected.tax) {
    const t = capitalGains(userId);
    taxHtml = `
      <div class="section">
        <div class="section-title">Capital Gains Audit</div>
        <div class="kpi-container" style="margin-bottom: 15px;">
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #10b981;">
            <div class="kpi-label">Realized Capital Gains</div>
            <div class="kpi-value" style="font-size: 14px; font-weight: 800; margin-top: 5px; line-height: 18px;">
              STCG: ${formatINR(t.realized_stcg)}<br/>
              LTCG: ${formatINR(t.realized_ltcg)}
            </div>
            <div class="kpi-sub" style="margin-top: 4px;">Total: <strong>${formatINR(t.realized_total)}</strong></div>
          </div>
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #3b82f6;">
            <div class="kpi-label">Unrealized Capital Gains</div>
            <div class="kpi-value" style="font-size: 14px; font-weight: 800; margin-top: 5px; line-height: 18px;">
              STCG: ${formatINR(t.unrealized_stcg)}<br/>
              LTCG: ${formatINR(t.unrealized_ltcg)}
            </div>
            <div class="kpi-sub" style="margin-top: 4px;">Total: <strong>${formatINR(t.unrealized_total)}</strong></div>
          </div>
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #8b5cf6;">
            <div class="kpi-label">Combined Gains</div>
            <div class="kpi-value" style="font-size: 14px; font-weight: 800; margin-top: 5px; line-height: 18px;">
              STCG: ${formatINR(t.stcg_total)}<br/>
              LTCG: ${formatINR(t.ltcg_total)}
            </div>
            <div class="kpi-sub" style="margin-top: 4px;">Grand Total: <strong>${formatINR(t.grand_total)}</strong></div>
          </div>
        </div>

        ${t.realized_rows.length > 0 ? `
          <div style="font-weight: 700; margin-bottom: 6px; color: #111827; font-size: 12px; margin-top: 10px;">Realized Capital Gains (Taxable Sales)</div>
          <table>
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Type</th>
                <th>Purchase Date</th>
                <th>Sale Date</th>
                <th class="text-right">Holding Days</th>
                <th class="text-right">Sale Value</th>
                <th class="text-right">Gain / Loss</th>
                <th>Tax Class</th>
              </tr>
            </thead>
            <tbody>
              ${t.realized_rows.map(r => `
                <tr>
                  <td><strong>${r.name}</strong></td>
                  <td>${r.type_name}</td>
                  <td>${r.purchase_date}</td>
                  <td>${r.sale_date}</td>
                  <td class="text-right">${r.holding_period_days === -1 ? 'Unknown' : `${r.holding_period_days}d`}</td>
                  <td class="text-right">${formatINR(r.sale_value)}</td>
                  <td class="text-right" style="color: ${r.pnl >= 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">${formatINR(r.pnl)}</td>
                  <td><span class="badge badge-${r.is_long_term ? 'good' : 'warn'}">${r.is_long_term ? 'LTCG' : 'STCG'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        ${t.unrealized_rows.length > 0 ? `
          <div style="font-weight: 700; margin-bottom: 6px; color: #111827; font-size: 12px; margin-top: 15px;">Unrealized Capital Gains (Active Holdings)</div>
          <table>
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Type</th>
                <th>Purchase Date</th>
                <th class="text-right">Holding Days</th>
                <th class="text-right">Invested</th>
                <th class="text-right">Current Value</th>
                <th class="text-right">Unrealized Gain</th>
                <th>Tax Class</th>
              </tr>
            </thead>
            <tbody>
              ${t.unrealized_rows.map(r => `
                <tr>
                  <td><strong>${r.name}</strong></td>
                  <td>${r.type_name}</td>
                  <td>${r.purchase_date}</td>
                  <td class="text-right">${r.holding_period_days}d</td>
                  <td class="text-right">${formatINR(r.invested_amount)}</td>
                  <td class="text-right">${formatINR(r.current_value)}</td>
                  <td class="text-right" style="color: ${r.unrealized_gain >= 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">${formatINR(r.unrealized_gain)}</td>
                  <td><span class="badge badge-${r.is_long_term ? 'good' : 'warn'}">${r.is_long_term ? 'LTCG' : 'STCG'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
        ${t.harvest_alert.alert_text ? `
          <div style="margin-top: 15px; padding: 12px; border: 1px solid #a7f3d0; border-radius: 6px; background-color: #ecfdf5; color: #065f46; font-size: 11.5px; line-height: 17px; page-break-inside: avoid;">
            <strong>Tax-Saving Recommendation:</strong> ${t.harvest_alert.alert_text}
          </div>
        ` : ''}
      </div>
    `;
  }

  let passiveIncomeHtml = '';
  if (selected.passive_income) {
    const pi = getPassiveIncomeSummary(userId);
    let receivedRows = '';
    if (pi.received_list.length > 0) {
      receivedRows = `
        <div style="font-weight: 700; margin-bottom: 6px; color: #111827; font-size: 12px; margin-top: 10px;">Logged Income Receipts</div>
        <table>
          <thead>
            <tr>
              <th>Asset / Source</th>
              <th>Type</th>
              <th>Date Received</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${pi.received_list.map(r => `
              <tr>
                <td><strong>${r.name}</strong></td>
                <td>${r.type_label}</td>
                <td>${r.date}</td>
                <td class="text-right" style="font-weight: 600; color: #10b981;">${formatINR(r.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    let forecastRows = '';
    if (pi.forecast_timeline.length > 0) {
      forecastRows = `
        <div style="font-weight: 700; margin-bottom: 6px; color: #111827; font-size: 12px; margin-top: 15px;">Upcoming Payout Forecast (Next 12 Months)</div>
        <table>
          <thead>
            <tr>
              <th>Asset / Source</th>
              <th>Payout Type</th>
              <th>Expected Date</th>
              <th class="text-right">Expected Amount</th>
            </tr>
          </thead>
          <tbody>
            ${pi.forecast_timeline.map(f => `
              <tr>
                <td><strong>${f.asset_name}</strong></td>
                <td>${f.type_label}</td>
                <td>${f.date}</td>
                <td class="text-right" style="font-weight: 600; color: #3b82f6;">${formatINR(f.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    passiveIncomeHtml = `
      <div class="section">
        <div class="section-title">Passive Income & Forecast</div>
        <div class="kpi-container" style="margin-bottom: 15px;">
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #10b981;">
            <div class="kpi-label">Received (Current FY)</div>
            <div class="kpi-value">${formatINR(pi.received_this_year)}</div>
            <div class="kpi-sub">Total passive cashflow</div>
          </div>
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #3b82f6;">
            <div class="kpi-label">Projected (Next 12M)</div>
            <div class="kpi-value">${formatINR(pi.forecasted_12m)}</div>
            <div class="kpi-sub">Auto-forecasted upcoming cashflow</div>
          </div>
        </div>
        ${receivedRows}
        ${forecastRows}
      </div>
    `;
  }

  let sectorHtml = '';
  if (selected.sector) {
    const s = getSectorOverlapAnalysis(userId);
    let sectorRows = '';
    if (s.sector_allocation.length > 0) {
      sectorRows = `
        <div style="font-weight: 700; margin-bottom: 6px; color: #111827; font-size: 12px; margin-top: 10px;">True Sector Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Sector Name</th>
              <th class="text-right">Exposure Value</th>
              <th class="text-right">Allocation</th>
            </tr>
          </thead>
          <tbody>
            ${s.sector_allocation.map(item => `
              <tr>
                <td><strong>${item.sector}</strong></td>
                <td class="text-right">${formatINR(item.amount)}</td>
                <td class="text-right" style="font-weight: 600; color: #111827;">${item.pct}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    let stockRows = '';
    if (s.stock_concentration.length > 0) {
      stockRows = `
        <div style="font-weight: 700; margin-bottom: 6px; color: #111827; font-size: 12px; margin-top: 15px;">Top Consolidated Company Exposures</div>
        <table>
          <thead>
            <tr>
              <th>Stock / Holding</th>
              <th class="text-right">Direct Exposure</th>
              <th class="text-right">Indirect Exposure</th>
              <th class="text-right">Total Exposure</th>
              <th class="text-right">Allocation</th>
            </tr>
          </thead>
          <tbody>
            ${s.stock_concentration.map(item => `
              <tr>
                <td><strong>${item.stock}</strong></td>
                <td class="text-right">${item.direct > 0 ? formatINR(item.direct) : '—'}</td>
                <td class="text-right">${item.indirect > 0 ? formatINR(item.indirect) : '—'}</td>
                <td class="text-right" style="font-weight: 600; color: #1f2937;">${formatINR(item.total)}</td>
                <td class="text-right" style="font-weight: 700; color: #3b82f6;">${item.pct}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    let alertHtml = '';
    if (s.alerts.length > 0) {
      alertHtml = `
        <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 8px;">
          ${s.alerts.map(alert => `
            <div style="padding: 10px 12px; border: 1px solid #fca5a5; border-radius: 6px; background-color: #fef2f2; color: #991b1b; font-size: 11px; line-height: 16px; page-break-inside: avoid;">
              <strong>Concentration Warning:</strong> ${alert.title} &bull; ${alert.text}
            </div>
          `).join('')}
        </div>
      `;
    }

    sectorHtml = `
      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Sector Overlap & Concentration Audit</div>
        <div class="kpi-container" style="margin-bottom: 15px;">
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #3b82f6;">
            <div class="kpi-label">Equity Portfolio Value</div>
            <div class="kpi-value">${formatINR(s.total_equity_value)}</div>
            <div class="kpi-sub">Total Stocks & Mutual Funds</div>
          </div>
          <div class="kpi-card" style="text-align: center; border-left: 4px solid #10b981;">
            <div class="kpi-label">Sectors Covered</div>
            <div class="kpi-value">${s.sector_allocation.length} Sectors</div>
            <div class="kpi-sub">Equity Diversification</div>
          </div>
        </div>
        ${sectorRows}
        ${stockRows}
        ${alertHtml}
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
          <div class="header-meta">Generated on ${todayISO()} for ${userName}</div>
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
      ${benchmarkNiftyHtml}
      ${passwordHtml}
      ${assetsHtml}
      ${sipHtml}
      ${loansHtml}
      ${protectHtml}
      ${goalsHtml}
      ${taxHtml}
      ${passiveIncomeHtml}
      ${sectorHtml}
      ${vaultHtml}
    </body>
    </html>
  `;
};

const ReportsScreen: React.FC = () => {
  const { userId, masterPassword } = useApp();
  const theme = useTheme();
  const userName = useData(() =>
    first<{ full_name: string }>('SELECT full_name FROM users WHERE id = ?', [userId!])?.full_name ?? 'User',
  );
  
  // Data Queries
  const nw = useData(() => netWorth(userId!));
  const pf = useData(() => portfolioSummary(userId!));
  const expMonth = useData(() => categoryBreakdown(userId!, new Date().getFullYear(), new Date().getMonth() + 1));
  const expSeries = useData(() => incomeExpenseSeries(userId!, 6));
  const health = useData(() => financialHealth(userId!));
  const pwdHealth = useData(() => passwordHealth(userId!));
  const benchmark = useData(() => benchmarkComparison(userId!));
  const goals = useData(() => goalsProgress(userId!));
  const tax = useData(() => capitalGains(userId!));
  const benchmarkNifty = useData(() => getBenchmarkComparison(userId!, 'nifty'));
  const passiveIncome = useData(() => getPassiveIncomeSummary(userId!));
  const sectorAnalysis = useData(() => getSectorOverlapAnalysis(userId!));
 
  const [selected, setSelected] = useState<Record<string, boolean>>({
    assets: true,
    loans: true,
    protect: true,
    goals: true,
    sip: true,
    health: true,
    password: true,
    benchmark: true,
    benchmark_nifty: true,
    tax: true,
    passive_income: true,
    sector: true,
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
    
    if (selected.benchmark_nifty) {
      lines.push('— Benchmark vs Nifty Audit —');
      const activeAll = benchmarkNifty.periods.find((p) => p.period === 'All') || benchmarkNifty.periods[2];
      const active1Y = benchmarkNifty.periods.find((p) => p.period === '1Y') || benchmarkNifty.periods[0];
      lines.push(`Portfolio XIRR (All Time): ${activeAll.portfolio_return != null ? `${activeAll.portfolio_return}%` : '—'} vs Nifty 50: ${activeAll.benchmark_return}% (Alpha: ${activeAll.alpha != null ? `${activeAll.alpha > 0 ? '+' : ''}${activeAll.alpha}%` : '—'})`);
      lines.push(`Equity-Only XIRR (All Time): ${activeAll.equity_return != null ? `${activeAll.equity_return}%` : '—'} (Alpha: ${activeAll.equity_alpha != null ? `${activeAll.equity_alpha > 0 ? '+' : ''}${activeAll.equity_alpha}%` : '—'})`);
      lines.push(`Portfolio XIRR (1 Year): ${active1Y.portfolio_return != null ? `${active1Y.portfolio_return}%` : '—'} vs Nifty 50: ${active1Y.benchmark_return}% (Alpha: ${active1Y.alpha != null ? `${active1Y.alpha > 0 ? '+' : ''}${active1Y.alpha}%` : '—'})`);
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
        [userId!],
      ).forEach((a) => lines.push(`  • ${a.name} (${a.tn}): ${formatINR(a.current_value)}`));
      lines.push('');
    }
    if (selected.sip) {
      lines.push('— SIP Schedules —');
      all<SIPSchedule & { asset_name: string }>(
        `SELECT s.*, a.name AS asset_name FROM sip_schedules s
         JOIN assets a ON a.id = s.asset_id WHERE s.user_id = ?`,
        [userId!],
      ).forEach((s) =>
        lines.push(`  • ${s.asset_name}: ${formatINR(s.amount)} (${titleCase(s.frequency)}) - Next due: ${s.next_due_date || 'N/A'}`),
      );
      lines.push('');
    }
    if (selected.loans) {
      lines.push('— Loans & Liabilities —');
      all<Loan>('SELECT * FROM loans WHERE user_id=?', [userId!]).forEach((l) =>
        lines.push(`  • ${l.provider || LOAN_TYPE_LABELS[l.loan_type]}: ${formatINR(l.outstanding_amount)} outstanding (${titleCase(loanStatus(l))})`),
      );
      lines.push('');
    }
    if (selected.protect) {
      lines.push('— Insurance / Protect —');
      all<InsurancePolicy>('SELECT * FROM insurance_policies WHERE user_id=?', [userId!]).forEach((p) =>
        lines.push(`  • ${p.policy_name} (${POLICY_TYPE_LABELS[p.policy_type]}): ${formatINR(p.coverage_amount)} cover (${titleCase(policyStatus(p))})`),
      );
      lines.push('');
    }
    if (selected.goals) {
      lines.push('— Financial Goals —');
      goals.goals.forEach((g) => lines.push(`  • ${g.name}: ${g.pct}% (${g.status_label})`));
      lines.push('');
    }
    if (selected.tax) {
      lines.push('— Capital Gains Audit —');
      lines.push(`Realized STCG: ${formatINR(tax.realized_stcg)} · Realized LTCG: ${formatINR(tax.realized_ltcg)} (Total: ${formatINR(tax.realized_total)})`);
      lines.push(`Unrealized STCG: ${formatINR(tax.unrealized_stcg)} · Unrealized LTCG: ${formatINR(tax.unrealized_ltcg)} (Total: ${formatINR(tax.unrealized_total)})`);
      lines.push(`Combined Total Gains: ${formatINR(tax.grand_total)}`);
      if (tax.harvest_alert.alert_text) {
        lines.push(`Recommendation: ${tax.harvest_alert.alert_text}`);
      }
      lines.push('');
    }
    if (selected.passive_income) {
      lines.push('— Passive Income & Forecast —');
      lines.push(`Received (Current FY): ${formatINR(passiveIncome.received_this_year)}`);
      lines.push(`Projected (Next 12M): ${formatINR(passiveIncome.forecasted_12m)}`);
      if (passiveIncome.next_payout) {
        lines.push(`Next Expected: ${formatINR(passiveIncome.next_payout.amount)} on ${passiveIncome.next_payout.date} (${passiveIncome.next_payout.type_label})`);
      }
      lines.push('');
    }
    if (selected.sector) {
      lines.push('— Sector Overlap & Concentration —');
      lines.push(`Total Equity Value: ${formatINR(sectorAnalysis.total_equity_value)}`);
      if (sectorAnalysis.sector_allocation.length > 0) {
        lines.push('Sector Allocation:');
        sectorAnalysis.sector_allocation.forEach((s) => lines.push(`  • ${s.sector}: ${s.pct}% (${formatINR(s.amount)})`));
      }
      if (sectorAnalysis.stock_concentration.length > 0) {
        lines.push('Top Consolidated Stock Exposures:');
        sectorAnalysis.stock_concentration.forEach((st) => lines.push(`  • ${st.stock}: ${st.pct}% (${formatINR(st.total)})`));
      }
      if (sectorAnalysis.alerts.length > 0) {
        lines.push('Concentration Warnings:');
        sectorAnalysis.alerts.forEach((alert) => lines.push(`  • ${alert.title}: ${alert.text}`));
      }
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
      const htmlContent = await buildHtmlReport(userId!, userName, masterPassword, nw, pf, expMonth, expSeries, selected, includeVault, addWatermark, watermarkText);

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
        <SectionCard title="Financial Health" style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.primaryContainer, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
              <Text variant="headlineSmall" style={{ fontWeight: '700', color: theme.colors.onPrimaryContainer }}>{health.score}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>{health.rating} Rating</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                Savings rate: {health.savings_rate}% · Income vs. Expenses
              </Text>
            </View>
          </View>
          <Divider style={{ marginVertical: 12 }} />
          <View style={{ gap: 8 }}>
            {health.insights.map((insight, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <MaterialCommunityIcons name="information-outline" size={16} color={theme.colors.primary} style={{ marginTop: 2, marginRight: 8 }} />
                <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>{insight}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        {/* 2. Asset Allocation & Benchmark Card */}
        <SectionCard title={`Benchmark Audit (${benchmark.risk_profile} profile)`} style={{ marginBottom: 12 }}>
          {pf.allocation.length > 0 ? (
            <View style={{ marginBottom: 16 }}>
              <DistributionPie
                data={pf.allocation.map((a, i) => ({
                  name: a.type,
                  value: a.value / 100,
                  color: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'][i % 7],
                }))}
              />
            </View>
          ) : (
            <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>No assets logged yet.</Text>
          )}
          <Divider style={{ marginVertical: 12 }} />
          <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 12 }}>Portfolio Drift: {benchmark.drift}%</Text>
          <View style={{ gap: 4 }}>
            {benchmark.rows.map((row, idx) => {
              const diff = Number((row.actual - row.recommended).toFixed(1));
              const isOff = Math.abs(diff) > 10;
              return (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Text style={{ flex: 2, color: theme.colors.onSurfaceVariant }}>{row.type}</Text>
                  <Text style={{ flex: 1, textAlign: 'right', fontWeight: '600' }}>{row.actual}%</Text>
                  <Text style={{ flex: 1.2, textAlign: 'right', color: theme.colors.onSurfaceVariant }}>Rec: {row.recommended}%</Text>
                  <Text style={{ flex: 1, textAlign: 'right', fontWeight: '700', color: isOff ? palette.danger : theme.colors.onSurfaceVariant }}>
                    {diff > 0 ? `+${diff}%` : `${diff}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        </SectionCard>

        {/* 3. Capital Gains Audit Card */}
        <SectionCard title="Capital Gains Audit" style={{ marginBottom: 12 }}>
          <View style={{ gap: 12 }}>
            <Row>
              <Kpi
                flex
                label="Realized Gains"
                value={formatINR(tax.realized_total)}
                sub={`STCG: ${formatINR(tax.realized_stcg)}\nLTCG: ${formatINR(tax.realized_ltcg)}`}
                subTone={tax.realized_total >= 0 ? 'good' : 'bad'}
              />
              <Kpi
                flex
                label="Unrealized Gains"
                value={formatINR(tax.unrealized_total)}
                sub={`STCG: ${formatINR(tax.unrealized_stcg)}\nLTCG: ${formatINR(tax.unrealized_ltcg)}`}
                subTone={tax.unrealized_total >= 0 ? 'good' : 'bad'}
              />
            </Row>

            <Divider style={{ marginVertical: 4 }} />
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="titleSmall" style={{ fontWeight: '700' }}>Combined Total Gains</Text>
              <Text variant="titleSmall" style={{ fontWeight: '800', color: tax.grand_total >= 0 ? palette.good : palette.danger }}>
                {formatINR(tax.grand_total)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Combined STCG / LTCG</Text>
              <Text variant="bodySmall" style={{ fontWeight: '600', color: theme.colors.onSurfaceVariant }}>
                {formatINR(tax.stcg_total)} / {formatINR(tax.ltcg_total)}
              </Text>
            </View>
            {tax.harvest_alert.alert_text && (
              <View style={{
                flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 12, padding: 12,
                borderRadius: theme.roundness, borderWidth: 1,
                backgroundColor: 'rgba(82, 167, 126, 0.12)', borderColor: 'rgba(82, 167, 126, 0.3)'
              }}>
                <MaterialCommunityIcons name="piggy-bank" size={18} color={palette.good} style={{ marginTop: 1 }} />
                <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '600', lineHeight: 18 }}>
                  {tax.harvest_alert.alert_text}
                </Text>
              </View>
            )}
          </View>
        </SectionCard>

        {/* 4. Password Health Card */}
        <SectionCard title="Password Health" style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>Vault Score</Text>
            <Text variant="titleLarge" style={{ fontWeight: '700', color: theme.colors.primary }}>{pwdHealth.score}%</Text>
          </View>
          <View style={{ marginBottom: 16 }}>
            <ProgressBar pct={pwdHealth.score} color={pwdHealth.score >= 70 ? palette.good : pwdHealth.score >= 40 ? palette.warn : palette.danger} height={8} />
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Total Saved</Text>
            <Text style={{ fontWeight: '700' }}>{pwdHealth.total}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Strong Passwords</Text>
            <Text style={{ fontWeight: '700', color: palette.good }}>{pwdHealth.strong}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Weak Passwords</Text>
            <Text style={{ fontWeight: '700', color: palette.danger }}>{pwdHealth.weak}</Text>
          </View>
        </SectionCard>

        {/* 4. Goals Progress Card */}
        <SectionCard title="Goal Progress" style={{ marginBottom: 12 }}>
          {goals.goals.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>No financial goals created yet.</Text>
          ) : (
            <View style={{ gap: 14 }}>
              {goals.goals.slice(0, 4).map((g) => (
                <View key={g.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontWeight: '600' }}>{g.name}</Text>
                    <Text style={{ fontWeight: '700', color: g.pct >= 70 ? palette.good : g.pct >= 40 ? palette.warn : palette.danger }}>{g.pct}%</Text>
                  </View>
                  <ProgressBar pct={g.pct} color={g.pct >= 70 ? palette.good : g.pct >= 40 ? palette.warn : palette.danger} />
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        <SectionCard title="Income vs Expense (6 mo)" style={{ marginBottom: 12 }}>
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

        <SectionCard title="Export Report" right={<Button mode="text" compact onPress={toggleAll} style={{ margin: 0 }}>{allOn ? 'Clear all' : 'Select all'}</Button>} style={{ marginBottom: 12 }}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 10 }}>
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
          <Divider style={{ marginVertical: 12 }} />
          <View style={{ gap: 10 }}>
            <Button mode="contained" icon="share-variant" onPress={onExportText} style={{ borderRadius: theme.roundness }}>
              Share Plain Text Report
            </Button>
            <Button mode="contained-tonal" icon="file-lock" onPress={() => setPdfDialogOpen(true)} style={{ borderRadius: theme.roundness }}>
              Export Secure PDF
            </Button>
          </View>
        </SectionCard>
      </Screen>

      <Portal>
        <Dialog visible={pdfDialogOpen} onDismiss={() => !isGenerating && setPdfDialogOpen(false)} style={{ borderRadius: theme.roundness }}>
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
