import { all } from '../db';
import type { Asset } from '../models/types';
import { formatINR } from '../utils/money';

// Directory mapping popular Indian stocks to their respective sectors
export const STOCK_SECTORS: Record<string, string> = {
  // Financial Services
  'HDFC Bank': 'Financial Services',
  'ICICI Bank': 'Financial Services',
  'Axis Bank': 'Financial Services',
  'State Bank of India': 'Financial Services',
  'Kotak Mahindra Bank': 'Financial Services',
  'Bajaj Finance': 'Financial Services',
  'Bajaj Holdings': 'Financial Services',
  'Cholamandalam Investment': 'Financial Services',
  'BSE Limited': 'Financial Services',
  'CDSL': 'Financial Services',
  'Multi Commodity Exchange': 'Financial Services',
  'Angel One': 'Financial Services',
  'IDFC': 'Financial Services',
  'Karur Vysya Bank': 'Financial Services',
  
  // IT & Technology
  'TCS': 'IT / Technology',
  'Infosys': 'IT / Technology',
  'Wipro': 'IT / Technology',
  'HCL Technologies': 'IT / Technology',
  'Tech Mahindra': 'IT / Technology',
  'Persistent Systems': 'IT / Technology',
  'KPIT Technologies': 'IT / Technology',
  'Cyient': 'IT / Technology',

  // Energy
  'Reliance Industries': 'Energy',
  'Tata Power': 'Utilities / Energy',
  'Adani Green Energy': 'Utilities / Energy',
  'NTPC': 'Utilities / Energy',
  'Power Grid': 'Utilities / Energy',

  // Chemicals & Materials
  'Pidilite Industries': 'Chemicals / Materials',

  // Consumer Goods & FMCG
  'Titan Company': 'Consumer Goods',
  'ITC': 'Consumer Goods',
  'Hindustan Unilever': 'Consumer Goods',
  'Nestle India': 'Consumer Goods',

  // Automobiles & Transport
  'Tata Motors': 'Automobiles / Transport',
  'Mahindra & Mahindra': 'Automobiles / Transport',
  'Maruti Suzuki': 'Automobiles / Transport',
  'Ashok Leyland': 'Automobiles / Transport',

  // Electronics & Industrial
  'Kaynes Technology': 'Industrial Electronics',

  // Healthcare
  'Narayana Hrudalaya': 'Healthcare / Pharmaceuticals',
  'Narayana Hrudayalaya': 'Healthcare / Pharmaceuticals',
  'Sun Pharmaceutical': 'Healthcare / Pharmaceuticals',
  'Cipla': 'Healthcare / Pharmaceuticals',
  'Dr. Reddy\'s': 'Healthcare / Pharmaceuticals',
  'Glenmark': 'Healthcare / Pharmaceuticals',

  // Capital Goods & Infrastructure
  'Larsen & Toubro': 'Capital Goods / Infrastructure',
  'Tube Investments': 'Capital Goods / Infrastructure',
  'Supreme Industries': 'Capital Goods / Infrastructure',
  'Cummins India': 'Capital Goods / Infrastructure',

  // Telecommunications
  'Bharti Airtel': 'Telecommunications',

  // Global Tech
  'Microsoft': 'Global Tech / Internet',
  'Alphabet': 'Global Tech / Internet',
  'Amazon': 'Global Tech / Internet',
  'NVIDIA': 'Global Tech / Internet',
  'Meta': 'Global Tech / Internet',
};

export interface FundDisclosure {
  sectors: Record<string, number>; // sector name -> weight % (0-100)
  holdings: { stock: string; weight: number }[]; // stock name -> weight % (0-100)
}

// Static database of top Indian mutual fund stock holdings and sector allocations
export const MUTUAL_FUND_HOLDINGS: Record<string, FundDisclosure> = {
  // Axis Bluechip Fund
  'INF846K01EW2': {
    sectors: {
      'Financial Services': 42.0,
      'IT / Technology': 18.0,
      'Energy': 12.0,
      'Consumer Goods': 10.0,
      'Capital Goods / Infrastructure': 8.0,
      'Others': 10.0
    },
    holdings: [
      { stock: 'HDFC Bank', weight: 9.5 },
      { stock: 'ICICI Bank', weight: 8.5 },
      { stock: 'Reliance Industries', weight: 7.5 },
      { stock: 'Infosys', weight: 6.5 },
      { stock: 'TCS', weight: 5.5 },
      { stock: 'Axis Bank', weight: 4.5 },
      { stock: 'Larsen & Toubro', weight: 4.0 },
      { stock: 'ITC', weight: 3.5 },
      { stock: 'Bajaj Finance', weight: 3.0 },
      { stock: 'Bharti Airtel', weight: 2.5 }
    ]
  },
  // PPFAS Flexi Cap Fund
  'INF879O01027': {
    sectors: {
      'Financial Services': 28.0,
      'IT / Technology': 22.0,
      'Global Tech / Internet': 15.0,
      'Consumer Goods': 12.0,
      'Energy': 8.0,
      'Others': 15.0
    },
    holdings: [
      { stock: 'HDFC Bank', weight: 8.5 },
      { stock: 'ICICI Bank', weight: 7.5 },
      { stock: 'Reliance Industries', weight: 6.5 },
      { stock: 'Infosys', weight: 5.5 },
      { stock: 'Microsoft', weight: 5.0 },
      { stock: 'Alphabet', weight: 5.0 },
      { stock: 'ITC', weight: 4.0 },
      { stock: 'Bajaj Holdings', weight: 3.0 },
      { stock: 'Tata Motors', weight: 3.0 },
      { stock: 'TCS', weight: 2.0 }
    ]
  },
  // Nippon India Mid Cap Fund
  'INF204K01A78': {
    sectors: {
      'Capital Goods / Infrastructure': 24.0,
      'Financial Services': 18.0,
      'Chemicals / Materials': 12.0,
      'IT / Technology': 10.0,
      'Consumer Goods': 8.0,
      'Automobiles / Transport': 8.0,
      'Others': 20.0
    },
    holdings: [
      { stock: 'Cholamandalam Investment', weight: 4.5 },
      { stock: 'Tube Investments', weight: 4.0 },
      { stock: 'Supreme Industries', weight: 3.5 },
      { stock: 'HDFC Bank', weight: 3.0 },
      { stock: 'Persistent Systems', weight: 3.0 },
      { stock: 'KPIT Technologies', weight: 2.5 },
      { stock: 'Tata Power', weight: 2.5 },
      { stock: 'Ashok Leyland', weight: 2.5 },
      { stock: 'Cummins India', weight: 2.0 },
      { stock: 'Pidilite Industries', weight: 2.0 }
    ]
  },
  // Mirae Asset ELSS Tax Saver
  'INF769K01EW1': {
    sectors: {
      'Financial Services': 34.0,
      'IT / Technology': 16.0,
      'Energy': 11.0,
      'Capital Goods / Infrastructure': 9.0,
      'Automobiles / Transport': 8.0,
      'Others': 22.0
    },
    holdings: [
      { stock: 'HDFC Bank', weight: 9.0 },
      { stock: 'ICICI Bank', weight: 7.5 },
      { stock: 'Reliance Industries', weight: 6.5 },
      { stock: 'Infosys', weight: 6.0 },
      { stock: 'Larsen & Toubro', weight: 4.5 },
      { stock: 'Axis Bank', weight: 3.8 },
      { stock: 'State Bank of India', weight: 3.2 },
      { stock: 'TCS', weight: 2.8 },
      { stock: 'Tata Motors', weight: 2.5 },
      { stock: 'Bharti Airtel', weight: 2.2 }
    ]
  },
  // Motilal Oswal Nifty Smallcap 250 Index
  'INF247L01792': {
    sectors: {
      'Financial Services': 16.0,
      'Capital Goods / Infrastructure': 14.0,
      'IT / Technology': 10.0,
      'Consumer Goods': 8.0,
      'Healthcare / Pharmaceuticals': 8.0,
      'Industrial Electronics': 6.0,
      'Others': 38.0
    },
    holdings: [
      { stock: 'Kaynes Technology', weight: 3.5 },
      { stock: 'Narayana Hrudayalaya', weight: 3.0 },
      { stock: 'BSE Limited', weight: 2.5 },
      { stock: 'CDSL', weight: 2.0 },
      { stock: 'Multi Commodity Exchange', weight: 1.8 },
      { stock: 'Cyient', weight: 1.8 },
      { stock: 'IDFC', weight: 1.5 },
      { stock: 'Glenmark', weight: 1.4 },
      { stock: 'Karur Vysya Bank', weight: 1.3 },
      { stock: 'Angel One', weight: 1.2 }
    ]
  }
};

export interface SectorExposure {
  sector: string;
  amount: number; // paise
  pct: number;
}

export interface StockExposure {
  stock: string;
  direct: number; // paise
  indirect: number; // paise
  total: number; // paise
  pct: number;
}

export interface OverlapAlert {
  type: 'sector' | 'stock';
  title: string;
  text: string;
  severity: 'warn' | 'info';
}

export interface SectorOverlapSummary {
  total_equity_value: number; // paise
  sector_allocation: SectorExposure[];
  stock_concentration: StockExposure[];
  alerts: OverlapAlert[];
}

export interface FundOverlapItem {
  stock: string;
  weight1: number;
  weight2: number;
  common_weight: number;
}

export interface FundOverlapResult {
  fund1_name: string;
  fund2_name: string;
  overlap_pct: number;
  common_holdings: FundOverlapItem[];
}

// Looks up a mutual fund disclosure based on ISIN or fund name matching
const findFundDisclosure = (isin: string | null, name: string): FundDisclosure | null => {
  if (isin && MUTUAL_FUND_HOLDINGS[isin]) {
    return MUTUAL_FUND_HOLDINGS[isin];
  }
  
  const n = name.toLowerCase();
  if (n.includes('axis bluechip')) return MUTUAL_FUND_HOLDINGS['INF846K01EW2'];
  if (n.includes('ppfas') || n.includes('parag parikh')) return MUTUAL_FUND_HOLDINGS['INF879O01027'];
  if (n.includes('nippon') && n.includes('mid')) return MUTUAL_FUND_HOLDINGS['INF204K01A78'];
  if (n.includes('mirae') && (n.includes('elss') || n.includes('tax'))) return MUTUAL_FUND_HOLDINGS['INF769K01EW1'];
  if (n.includes('motilal') && n.includes('small')) return MUTUAL_FUND_HOLDINGS['INF247L01792'];
  
  return null;
};

/**
 * Performs Sector Overlap and Stock Concentration calculations across user's portfolio
 */
export const getSectorOverlapAnalysis = (userId: string): SectorOverlapSummary => {
  // Query all active equity and mutual fund assets
  const activeAssets = all<Asset & { slug: string }>(
    `SELECT a.*, t.slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ? AND a.current_value > 0`,
    [userId]
  );

  const equityAssets = activeAssets.filter(
    (a) => a.slug === 'equity' || a.slug === 'mutual_fund'
  );

  let total_equity_value = 0;
  const sectorMap: Record<string, number> = {};
  const stockMap: Record<string, { direct: number; indirect: number }> = {};

  for (const a of equityAssets) {
    const value = a.current_value;
    total_equity_value += value;

    // A. DIRECT STOCKS (EQUITY)
    if (a.slug === 'equity') {
      const sector = STOCK_SECTORS[a.name] || 'Others';
      sectorMap[sector] = (sectorMap[sector] || 0) + value;

      if (!stockMap[a.name]) {
        stockMap[a.name] = { direct: 0, indirect: 0 };
      }
      stockMap[a.name].direct += value;
    } 
    // B. MUTUAL FUNDS
    else if (a.slug === 'mutual_fund') {
      const disclosure = findFundDisclosure(a.isin, a.name);

      if (disclosure) {
        // Allocate Sector Exposures
        Object.entries(disclosure.sectors).forEach(([sector, weight]) => {
          const sectorVal = Math.round((value * weight) / 100);
          sectorMap[sector] = (sectorMap[sector] || 0) + sectorVal;
        });

        // Allocate Underlying Stock Exposures
        let allocatedWeight = 0;
        disclosure.holdings.forEach((hold) => {
          const stockVal = Math.round((value * hold.weight) / 100);
          allocatedWeight += hold.weight;

          if (!stockMap[hold.stock]) {
            stockMap[hold.stock] = { direct: 0, indirect: 0 };
          }
          stockMap[hold.stock].indirect += stockVal;
        });

        // Remainder goes to "Other Stock Holdings"
        const remainderWeight = Math.max(0, 100 - allocatedWeight);
        if (remainderWeight > 0) {
          const remainderVal = Math.round((value * remainderWeight) / 100);
          const name = `Other Holdings (${a.name})`;
          if (!stockMap[name]) {
            stockMap[name] = { direct: 0, indirect: 0 };
          }
          stockMap[name].indirect += remainderVal;
        }
      } else {
        // Fallback for unsupported funds (diversified large-cap approximation)
        const defaultSectors = {
          'Financial Services': 30.0,
          'IT / Technology': 20.0,
          'Energy': 15.0,
          'Consumer Goods': 15.0,
          'Others': 20.0
        };

        Object.entries(defaultSectors).forEach(([sector, weight]) => {
          const sectorVal = Math.round((value * weight) / 100);
          sectorMap[sector] = (sectorMap[sector] || 0) + sectorVal;
        });

        const name = `Unclassified holdings (${a.name})`;
        if (!stockMap[name]) {
          stockMap[name] = { direct: 0, indirect: 0 };
        }
        stockMap[name].indirect += value;
      }
    }
  }

  // Calculate Sector allocations list sorted by value
  const sector_allocation: SectorExposure[] = Object.entries(sectorMap)
    .map(([sector, amount]) => {
      const pct = total_equity_value > 0 ? Number(((amount / total_equity_value) * 100).toFixed(1)) : 0;
      return { sector, amount, pct };
    })
    .sort((a, b) => b.amount - a.amount);

  // Calculate Consolidated Stock concentrations list sorted by total
  const stock_concentration: StockExposure[] = Object.entries(stockMap)
    .map(([stock, exposure]) => {
      const total = exposure.direct + exposure.indirect;
      const pct = total_equity_value > 0 ? Number(((total / total_equity_value) * 100).toFixed(1)) : 0;
      return {
        stock,
        direct: exposure.direct,
        indirect: exposure.indirect,
        total,
        pct
      };
    })
    .sort((a, b) => b.total - a.total);

  // Generate Exposure Concentration Risk Alerts
  const alerts: OverlapAlert[] = [];

  if (total_equity_value > 0) {
    // 1. Sector concentration checks (>35% limit)
    sector_allocation.forEach((s) => {
      if (s.pct > 35.0) {
        alerts.push({
          type: 'sector',
          title: `High Sector Exposure: ${s.sector}`,
          text: `Your portfolio has high exposure to the ${s.sector} sector at ${s.pct}% (exceeding recommended 35% limit). Financial sector over-exposure can increase systemic risk.`,
          severity: 'warn'
        });
      }
    });

    // 2. Stock concentration checks (>15% limit)
    stock_concentration.forEach((st) => {
      if (st.stock !== 'Other Holdings' && !st.stock.startsWith('Other Holdings (') && !st.stock.startsWith('Unclassified holdings (') && st.pct > 15.0) {
        alerts.push({
          type: 'stock',
          title: `High Stock Concentration: ${st.stock}`,
          text: `Consolidated holdings of ${st.stock} represent ${st.pct}% of your total equity portfolio across direct shares and indirect mutual funds. Consider trimming to reduce company-specific risk.`,
          severity: 'warn'
        });
      }
    });
  }

  return {
    total_equity_value,
    sector_allocation,
    stock_concentration: stock_concentration.slice(0, 10), // Return top 10 exposures
    alerts
  };
};

/**
 * Calculates overlap percentage and common holdings between two mutual funds
 */
export const getMutualFundOverlap = (isin1: string, isin2: string, fund1Name = '', fund2Name = ''): FundOverlapResult => {
  const disc1 = findFundDisclosure(isin1, fund1Name);
  const disc2 = findFundDisclosure(isin2, fund2Name);

  const f1Name = fund1Name || (isin1 && Object.keys(MUTUAL_FUND_HOLDINGS).includes(isin1) ? 'Fund 1' : 'Fund 1');
  const f2Name = fund2Name || (isin2 && Object.keys(MUTUAL_FUND_HOLDINGS).includes(isin2) ? 'Fund 2' : 'Fund 2');

  if (!disc1 || !disc2) {
    return {
      fund1_name: f1Name,
      fund2_name: f2Name,
      overlap_pct: 0,
      common_holdings: []
    };
  }

  const map1 = new Map<string, number>();
  disc1.holdings.forEach((h) => map1.set(h.stock, h.weight));

  const common_holdings: FundOverlapItem[] = [];
  let overlap_pct = 0;

  disc2.holdings.forEach((h2) => {
    const w1 = map1.get(h2.stock) || 0;
    if (w1 > 0) {
      const common_weight = Math.min(w1, h2.weight);
      overlap_pct += common_weight;
      common_holdings.push({
        stock: h2.stock,
        weight1: w1,
        weight2: h2.weight,
        common_weight
      });
    }
  });

  // Round overlap percentage
  overlap_pct = Number(overlap_pct.toFixed(1));

  // Sort common holdings by common weight (highest overlap first)
  common_holdings.sort((a, b) => b.common_weight - a.common_weight);

  return {
    fund1_name: f1Name,
    fund2_name: f2Name,
    overlap_pct,
    common_holdings
  };
};
