/**
 * Per-asset-type field configurations.
 * Drives which extra fields appear in the Add/Edit form and Detail screen.
 */

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'numeric' | 'date' | 'select';
  required?: boolean;
  options?: { label: string; value: string }[];
  detailKey?: boolean; // stored in details_json instead of a top-level column
}

export interface AssetTypeConfig {
  slug: string;
  label: string;
  icon: string;
  showIsin?: boolean;
  showTicker?: boolean;
  showNav?: boolean;
  showPricePerUnit?: boolean;
  showMaturityDate?: boolean;
  showGuaranteedReturn?: boolean;
  showQuantity?: boolean;
  extraFields?: FieldConfig[];
  // Per-type label overrides
  assetNameLabel?: string;
  quantityLabel?: string;
  pricePerUnitLabel?: string;
  navLabel?: string;
  guaranteedReturnLabel?: string;
  investedLabel?: string;
  currentValueLabel?: string;
  investmentDateLabel?: string;
  sipCheckboxLabel?: string;
  sipMonthlyLabel?: string;
  // Section headings (undefined = no heading shown)
  identifiersSection?: string;      // heading above ISIN / ticker
  extraSection?: string;            // heading above type-specific extra fields
  investmentDetailsSection?: string; // heading above qty, price, invested, current
}

export const ASSET_TYPE_CONFIGS: Record<string, AssetTypeConfig> = {
  equity: {
    slug: 'equity',
    label: 'Equity',
    icon: 'chart-line',
    showIsin: true,
    showTicker: true,
    showPricePerUnit: true,
    showQuantity: true,
    assetNameLabel: 'Stock name',
    quantityLabel: 'Shares',
    pricePerUnitLabel: 'Avg. buy price (₹/share)',
    identifiersSection: 'IDENTIFIERS',
    investmentDetailsSection: 'INVESTMENT DETAILS',
    extraFields: [],
  },
  mutual_fund: {
    slug: 'mutual_fund',
    label: 'Mutual Fund',
    icon: 'chart-areaspline',
    showIsin: true,
    showTicker: true,
    showNav: true,
    showQuantity: true,
    assetNameLabel: 'Fund name',
    quantityLabel: 'Units',
    navLabel: 'NAV / purchase price (₹)',
    identifiersSection: 'IDENTIFIERS',
    investmentDetailsSection: 'INVESTMENT DETAILS',
    extraFields: [],
  },
  digital_gold: {
    slug: 'digital_gold',
    label: 'Digital Gold',
    icon: 'gold',
    showPricePerUnit: true,
    showQuantity: true,
    quantityLabel: 'Quantity (grams)',
    pricePerUnitLabel: 'Buy price (₹/gram)',
    investmentDetailsSection: 'INVESTMENT DETAILS',
    extraFields: [],
  },
  physical_gold: {
    slug: 'physical_gold',
    label: 'Gold',
    icon: 'ring',
    showPricePerUnit: true,
    showQuantity: true,
    quantityLabel: 'Weight (grams)',
    pricePerUnitLabel: 'Buy price (₹/gram)',
    investmentDateLabel: 'Purchase date',
    extraSection: 'ITEM DETAILS',
    investmentDetailsSection: 'FINANCIALS',
    extraFields: [
      {
        key: 'purity',
        label: 'Purity',
        type: 'select',
        required: true,
        options: [
          { label: '24K', value: '24K' },
          { label: '22K', value: '22K' },
          { label: '18K', value: '18K' },
          { label: '14K', value: '14K' },
        ],
        detailKey: true,
      },
    ],
  },
  sgb: {
    slug: 'sgb',
    label: 'Sovereign Gold Bond',
    icon: 'gold',
    showIsin: true,
    showTicker: true,
    showPricePerUnit: true,
    showQuantity: true,
    showMaturityDate: true,
    showGuaranteedReturn: true,
    assetNameLabel: 'Bond name',
    quantityLabel: 'Bonds (units)',
    pricePerUnitLabel: 'Issue price (₹/bond)',
    guaranteedReturnLabel: 'Coupon rate (%)',
    investmentDateLabel: 'Issue / purchase date',
    identifiersSection: 'IDENTIFIERS',
    investmentDetailsSection: 'INVESTMENT DETAILS',
    extraFields: [],
  },
  fd: {
    slug: 'fd',
    label: 'Fixed Deposit',
    icon: 'bank',
    showMaturityDate: true,
    showGuaranteedReturn: true,
    showQuantity: false,
    assetNameLabel: 'Bank name',
    investedLabel: 'Principal (₹)',
    currentValueLabel: 'Maturity value (₹)',
    guaranteedReturnLabel: 'Interest rate (%)',
    investmentDateLabel: 'Start date',
    extraSection: 'ACCOUNT DETAILS',
    investmentDetailsSection: 'FD TERMS',
    extraFields: [
      { key: 'account_no', label: 'FD account number', type: 'text', detailKey: true },
      { key: 'nominee', label: 'Nominee', type: 'text', detailKey: true },
    ],
  },
  ppf: {
    slug: 'ppf',
    label: 'PPF',
    icon: 'shield-account',
    showGuaranteedReturn: true,
    showQuantity: false,
    assetNameLabel: 'Account / bank name',
    investedLabel: 'Total invested (₹)',
    guaranteedReturnLabel: 'Current interest rate (%)',
    investmentDateLabel: 'Account opening date',
    sipCheckboxLabel: 'Regular monthly contribution active',
    sipMonthlyLabel: 'Monthly contribution (₹)',
    extraSection: 'ACCOUNT DETAILS',
    investmentDetailsSection: 'FINANCIALS',
    extraFields: [
      { key: 'nominee', label: 'Nominee', type: 'text', detailKey: true },
    ],
  },
  real_estate: {
    slug: 'real_estate',
    label: 'Real Estate',
    icon: 'home-city',
    showQuantity: false,
    assetNameLabel: 'Property name',
    investedLabel: 'Purchase price (₹)',
    investmentDateLabel: 'Purchase date',
    extraSection: 'PROPERTY DETAILS',
    investmentDetailsSection: 'FINANCIALS',
    extraFields: [
      { key: 'area_sqft', label: 'Area (sq. ft.)', type: 'numeric', required: true, detailKey: true },
      { key: 'location', label: 'Location / address', type: 'text', required: true, detailKey: true },
    ],
  },
};

export const getTypeConfig = (slug: string): AssetTypeConfig =>
  ASSET_TYPE_CONFIGS[slug] ?? {
    slug,
    label: slug,
    icon: 'help-circle',
    extraFields: [],
  };
