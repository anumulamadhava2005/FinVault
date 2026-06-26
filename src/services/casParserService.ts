import { extractText } from 'expo-pdf-text-extract';
import { all, run, tx, newId } from '../db';
import { todayISO } from '../utils/date';

export interface CasTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // Rupees
  units: number;
  nav: number;
}

export interface CasMutualFund {
  name: string;
  isin: string;
  folio: string;
  units: number;
  transactions: CasTransaction[];
}

export interface CasStock {
  name: string;
  isin: string;
  units: number;
}

export interface ParsedCasData {
  investorName: string;
  email: string;
  mutualFunds: CasMutualFund[];
  stocks: CasStock[];
}

/** Parses the PDF text content with native decryption. */
export async function extractAndParseCas(pdfUri: string, password?: string): Promise<ParsedCasData> {
  try {
    const text = await extractText(pdfUri, password);
    return parseCasText(text);
  } catch (err: any) {
    console.error('[casParser] Text extraction/parsing failed:', err);
    const errMsg = err?.message ?? '';
    const errCode = err?.code ?? '';
    if (errCode === 'INCORRECT_PASSWORD' || errMsg.includes('password') || errMsg.includes('Password') || errMsg.includes('decrypt') || errMsg.includes('Incorrect')) {
      throw new Error('Incorrect password. Please verify your password and try again.');
    } else if (errCode === 'PASSWORD_REQUIRED') {
      throw new Error('This statement is password protected. Please enter the password.');
    }
    throw new Error(errMsg || 'Failed to extract text content from CAS statement.');
  }
}

/** Layout-agnostic parser using regular expressions and self-correcting product verification. */
export function parseCasText(text: string): ParsedCasData {
  const lines = text.split('\n').map(l => l.trim());
  
  let investorName = '';
  let email = '';
  const mutualFunds: CasMutualFund[] = [];
  const stocks: CasStock[] = [];
  
  let currentMF: Partial<CasMutualFund> | null = null;
  
  const datePattern = /^(\d{1,2})[-/]([A-Za-z]{3}|\d{2})[-/](\d{2,4})/;
  
  const parseDateToISO = (day: string, monthStr: string, yearStr: string): string => {
    const d = day.padStart(2, '0');
    let m = '01';
    const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
    
    if (isNaN(Number(monthStr))) {
      const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      };
      m = months[monthStr.toLowerCase().slice(0, 3)] || '01';
    } else {
      m = monthStr.padStart(2, '0');
    }
    
    return `${year}-${m}-${d}`;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    // 1. Email extraction
    if (!email) {
      const emailMatch = line.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        email = emailMatch[0];
      }
    }
    
    // 2. Investor Name extraction
    if (!investorName && (line.startsWith('Name:') || line.startsWith('Investor Name:') || line.includes('Dear Mr') || line.includes('Dear Ms'))) {
      if (line.startsWith('Name:') || line.startsWith('Investor Name:')) {
        investorName = line.replace(/Name:|Investor Name:/, '').trim();
      } else {
        const nameMatch = line.match(/(Mr\.|Ms\.|Mrs\.)\s+([A-Za-z\s]+)/);
        if (nameMatch) {
          investorName = nameMatch[2].trim();
        }
      }
    }
    
    // 3. Scheme or Stock holding detection
    const folioMatch = line.match(/Folio No:\s*([\d\s/-]+)/i) || line.match(/Folio:\s*([\d\s/-]+)/i);
    const isinMatch = line.match(/ISIN:\s*([A-Z0-9]{12})/i) || line.match(/\b([A-Z0-9]{12})\b/i);
    
    const hasMFKeywords = /Fund|Growth|Dividend|Plan|Direct|Tax|Saver|Equity|Midcap|Bluechip|Largecap|Smallcap|Balanced|Hybrid|Debt/i.test(line);
    const isIsinMF = isinMatch && isinMatch[1].startsWith('INF');
    const isIsinStock = isinMatch && isinMatch[1].startsWith('INE');
    
    if (isIsinStock) {
      const isin = isinMatch[1];
      let name = line.replace(isin, '').replace(/ISIN:/i, '').trim();
      name = name.replace(/\b\d+\b/g, '').replace(/,/g, '').replace(/[-\s]+$/, '').trim();
      
      if (name.length < 3 && i > 0) {
        name = lines[i-1];
      }
      
      let quantity = 0;
      const numMatch = line.match(/\b\d+\b/g);
      if (numMatch && numMatch.length > 0) {
        const potentialQty = numMatch.map(Number).filter(n => n > 0 && n < 10000000);
        if (potentialQty.length > 0) {
          quantity = potentialQty[0];
        }
      }
      
      if (!quantity && i < lines.length - 1) {
        const nextLineNums = lines[i+1].match(/\b\d+\b/g);
        if (nextLineNums) {
          const potentialQty = nextLineNums.map(Number).filter(n => n > 0 && n < 10000000);
          if (potentialQty.length > 0) {
            quantity = potentialQty[0];
          }
        }
      }
      
      if (isin && !stocks.some(s => s.isin === isin)) {
        stocks.push({
          name: name || 'Unknown Stock',
          isin,
          units: quantity || 0,
        });
      }
    } else if (hasMFKeywords || isIsinMF || folioMatch) {
      if (currentMF && currentMF.name && currentMF.isin) {
        mutualFunds.push(currentMF as CasMutualFund);
      }
      
      let schemeName = line;
      let isin = isinMatch ? isinMatch[1] : '';
      let folio = folioMatch ? folioMatch[1].trim() : '';
      
      if (isin) schemeName = schemeName.replace(new RegExp(`ISIN:\\s*${isin}|${isin}`, 'i'), '');
      if (folio) schemeName = schemeName.replace(new RegExp(`Folio No:\\s*${folio}|Folio:\\s*${folio}|${folio}`, 'i'), '');
      schemeName = schemeName.replace(/[-\s]+$/, '').trim();
      
      // Lookforward scan for ISIN
      if (!isin) {
        for (let j = 1; j <= 3; j++) {
          if (i + j < lines.length) {
            const nextLine = lines[i + j];
            const nextIsinMatch = nextLine.match(/ISIN:\s*([A-Z0-9]{12})/i) || nextLine.match(/\b(INF[A-Z0-9]{9}\d)\b/i);
            if (nextIsinMatch) {
              isin = nextIsinMatch[1];
              break;
            }
          }
        }
      }
      
      // Lookforward scan for Folio
      if (!folio) {
        for (let j = 1; j <= 3; j++) {
          if (i + j < lines.length) {
            const nextLine = lines[i + j];
            const nextFolioMatch = nextLine.match(/Folio No:\s*([\d\s/-]+)/i) || nextLine.match(/Folio:\s*([\d\s/-]+)/i);
            if (nextFolioMatch) {
              folio = nextFolioMatch[1].trim();
              break;
            }
          }
        }
      }
      
      currentMF = {
        name: schemeName || 'Mutual Fund Scheme',
        isin: isin || '',
        folio: folio || 'Unknown Folio',
        units: 0,
        transactions: [],
      };
    }
    
    // 4. Parse transaction details
    if (currentMF) {
      const dateMatch = line.match(datePattern);
      if (dateMatch) {
        const day = dateMatch[1];
        const monthStr = dateMatch[2];
        const yearStr = dateMatch[3];
        const isoDate = parseDateToISO(day, monthStr, yearStr);
        
        const afterDate = line.replace(dateMatch[0], '').trim();
        const cleanAfterDate = afterDate.replace(/,/g, '');
        const numberMatches = cleanAfterDate.match(/(-?\d+\.\d+)|(-?\d+)/g);
        
        if (numberMatches && numberMatches.length >= 2) {
          const numbers = numberMatches.map(Number);
          
          let desc = afterDate;
          const firstNumIndex = afterDate.indexOf(numberMatches[0]);
          if (firstNumIndex !== -1) {
            desc = afterDate.slice(0, firstNumIndex).trim();
          }
          
          let amount = 0;
          let units = 0;
          let price = 0;
          let balance = 0;
          
          const len = numbers.length;
          
          if (len >= 3) {
            const n1 = numbers[0];
            const n2 = numbers[1];
            const n3 = numbers[2];
            if (len >= 4) balance = numbers[3];
            
            const tol = 0.05;
            const checkProduct = (a: number, b: number, c: number) => Math.abs(Math.abs(a) - Math.abs(b * c)) / Math.max(1, Math.abs(a)) < tol;
            
            if (checkProduct(n1, n2, n3)) {
              amount = n1;
              units = n2;
              price = n3;
            } else if (checkProduct(n2, n1, n3)) {
              amount = n2;
              units = n1;
              price = n3;
            } else if (checkProduct(n3, n1, n2)) {
              amount = n3;
              units = n1;
              price = n2;
            } else {
              // Standard CAMS layout: Amount, Units, Price
              amount = n1;
              units = n2;
              price = n3;
            }
          } else if (len === 2) {
            amount = numbers[0];
            price = numbers[1];
            units = price > 0 ? amount / price : 0;
          }
          
          const isRedemption = /Redemption|Switch Out|Payout|Sell/i.test(desc);
          if (isRedemption) {
            amount = -Math.abs(amount);
            units = -Math.abs(units);
          }
          
          currentMF.transactions!.push({
            date: isoDate,
            description: desc || 'Transaction',
            amount,
            units,
            nav: price,
          });
          
          if (balance > 0) {
            currentMF.units = balance;
          } else {
            currentMF.units = (currentMF.units || 0) + units;
          }
        }
      }
    }
  }
  
  if (currentMF && currentMF.name && currentMF.isin) {
    mutualFunds.push(currentMF as CasMutualFund);
  }
  
  const cleanMFs = mutualFunds.filter(mf => mf.isin && mf.name && mf.units > 0);
  const cleanStocks = stocks.filter(s => s.isin && s.name && s.units > 0);
  
  return {
    investorName: investorName || 'Valued Investor',
    email: email || '',
    mutualFunds: cleanMFs,
    stocks: cleanStocks,
  };
}

/** Executes a secure SQLite transaction to bulk import the parsed CAS holdings and transactions. */
export function importCasData(userId: string, parsedData: ParsedCasData): { importedAssets: number; importedTransactions: number } {
  let importedAssets = 0;
  let importedTransactions = 0;
  
  const mfTypeRow = all<{ id: string }>('SELECT id FROM asset_types WHERE slug = "mutual_fund"');
  const equityTypeRow = all<{ id: string }>('SELECT id FROM asset_types WHERE slug = "equity"');
  
  const mfTypeId = mfTypeRow[0]?.id || 'type_mf';
  const equityTypeId = equityTypeRow[0]?.id || 'type_equity';
  
  tx((db) => {
    // 1. Import Mutual Funds
    parsedData.mutualFunds.forEach((mf) => {
      const existing = db.getFirstSync<{ id: string; current_value: number; invested_amount: number; quantity: number }>(
        'SELECT id, current_value, invested_amount, quantity FROM assets WHERE user_id = ? AND isin = ?',
        [userId, mf.isin]
      );
      
      let assetId = '';
      const totalInvested = mf.transactions.reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0);
      const totalInvestedPaise = Math.round(totalInvested * 100);
      
      const latestTransaction = [...mf.transactions].sort((a, b) => b.date.localeCompare(a.date))[0];
      const latestNav = latestTransaction ? latestTransaction.nav : 0;
      const currentValuePaise = Math.round(mf.units * latestNav * 100);
      
      if (existing) {
        assetId = existing.id;
        db.runSync(
          `UPDATE assets 
           SET quantity = ?, invested_amount = ?, current_value = ?, current_nav = ?, price_per_unit = ?
           WHERE id = ?`,
          [mf.units, totalInvestedPaise, currentValuePaise, latestNav, latestNav, assetId]
        );
      } else {
        assetId = newId();
        db.runSync(
          `INSERT INTO assets (
            id, user_id, asset_type_id, name, invested_amount, current_value, quantity,
            purchase_date, isin, current_nav, price_per_unit, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            assetId,
            userId,
            mfTypeId,
            mf.name,
            totalInvestedPaise,
            currentValuePaise,
            mf.units,
            mf.transactions[mf.transactions.length - 1]?.date || todayISO(),
            mf.isin,
            latestNav,
            latestNav,
            todayISO(),
          ]
        );
        importedAssets++;
      }
      
      // Import Transactions into `sip_payments`
      mf.transactions.forEach((t) => {
        const amtPaise = Math.round(t.amount * 100);
        
        const tExists = db.getFirstSync<{ id: string }>(
          `SELECT id FROM sip_payments 
           WHERE asset_id = ? AND actual_date = ? AND amount = ?`,
          [assetId, t.date, amtPaise]
        );
        
        if (!tExists) {
          db.runSync(
            `INSERT INTO sip_payments (
              id, user_id, asset_id, scheduled_date, actual_date, amount, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'paid', ?)`,
            [newId(), userId, assetId, t.date, t.date, amtPaise, todayISO()]
          );
          importedTransactions++;
        }
      });
    });
    
    // 2. Import Stocks
    parsedData.stocks.forEach((stock) => {
      const existing = db.getFirstSync<{ id: string }>(
        'SELECT id FROM assets WHERE user_id = ? AND isin = ?',
        [userId, stock.isin]
      );
      
      if (existing) {
        db.runSync(
          'UPDATE assets SET quantity = ? WHERE id = ?',
          [stock.units, existing.id]
        );
      } else {
        db.runSync(
          `INSERT INTO assets (
            id, user_id, asset_type_id, name, invested_amount, current_value, quantity,
            purchase_date, isin, created_at
          ) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
          [
            newId(),
            userId,
            equityTypeId,
            stock.name,
            stock.units,
            todayISO(),
            stock.isin,
            todayISO(),
          ]
        );
        importedAssets++;
      }
    });
  });
  
  return { importedAssets, importedTransactions };
}
