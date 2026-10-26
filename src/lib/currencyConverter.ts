export type CurrencyCode = 'PKR' | 'USD' | 'AED' | 'SAR' | 'GBP' | 'EUR' | 'CAD';

export interface CurrencyMetadata {
  code: CurrencyCode;
  symbol: string;
  labelUr: string;
  labelEn: string;
  /**
   * Default reference rate: how many PKR equal 1 unit of this currency.
   * For PKR itself, defaultPkrPerUnit is 1.
   */
  defaultPkrPerUnit: number;
}

export const SUPPORTED_CURRENCIES: CurrencyMetadata[] = [
  {
    code: 'PKR',
    symbol: 'Rs.',
    labelUr: 'پاکستانی روپیہ (PKR — اصل بل)',
    labelEn: 'Pakistani Rupee (PKR — Default)',
    defaultPkrPerUnit: 1,
  },
  {
    code: 'USD',
    symbol: '$',
    labelUr: 'امریکی ڈالر (USD $)',
    labelEn: 'US Dollar (USD $)',
    defaultPkrPerUnit: 278.5,
  },
  {
    code: 'AED',
    symbol: 'AED',
    labelUr: 'اماراتی درہم (AED د.إ)',
    labelEn: 'UAE Dirham (AED)',
    defaultPkrPerUnit: 75.85,
  },
  {
    code: 'SAR',
    symbol: 'SAR',
    labelUr: 'سعودی ریال (SAR ر.س)',
    labelEn: 'Saudi Riyal (SAR)',
    defaultPkrPerUnit: 74.25,
  },
  {
    code: 'GBP',
    symbol: '£',
    labelUr: 'برطانوی پاؤنڈ (GBP £)',
    labelEn: 'British Pound (GBP £)',
    defaultPkrPerUnit: 359.0,
  },
  {
    code: 'EUR',
    symbol: '€',
    labelUr: 'یورو (EUR €)',
    labelEn: 'Euro (EUR €)',
    defaultPkrPerUnit: 301.5,
  },
  {
    code: 'CAD',
    symbol: 'CA$',
    labelUr: 'کینیڈین ڈالر (CAD CA$)',
    labelEn: 'Canadian Dollar (CAD CA$)',
    defaultPkrPerUnit: 199.5,
  },
];

const CURRENCY_MAP: Record<CurrencyCode, CurrencyMetadata> = SUPPORTED_CURRENCIES.reduce(
  (acc, item) => {
    acc[item.code] = item;
    return acc;
  },
  {} as Record<CurrencyCode, CurrencyMetadata>
);

export function getCurrencyMetadata(code: CurrencyCode): CurrencyMetadata {
  return CURRENCY_MAP[code] || CURRENCY_MAP.PKR;
}

/**
 * Detects the source currency from a raw extracted bill amount string.
 * Defaults to 'PKR' for Pakistani utility bills (Rs., PKR, روپے),
 * while recognizing $, AED, SAR, £, €, CA$ for bills from other sources.
 */
export function detectSourceCurrency(rawAmountStr: string | null | undefined): CurrencyCode {
  if (!rawAmountStr || typeof rawAmountStr !== 'string') {
    return 'PKR';
  }
  const upper = rawAmountStr.toUpperCase();
  if (upper.includes('AED') || rawAmountStr.includes('د.إ')) return 'AED';
  if (upper.includes('SAR') || rawAmountStr.includes('ر.س')) return 'SAR';
  if (upper.includes('CAD') || upper.includes('CA$')) return 'CAD';
  if (upper.includes('USD') || rawAmountStr.includes('$')) return 'USD';
  if (upper.includes('GBP') || rawAmountStr.includes('£')) return 'GBP';
  if (upper.includes('EUR') || rawAmountStr.includes('€')) return 'EUR';
  return 'PKR';
}

export function formatCurrencyValue(amount: number, currency: CurrencyCode): string {
  const meta = getCurrencyMetadata(currency);
  if (!Number.isFinite(amount)) {
    return `${meta.symbol} 0.00`;
  }
  if (currency === 'PKR') {
    return `Rs. ${Math.round(amount).toLocaleString('en-US')}`;
  }
  const formattedNum = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (meta.symbol === '$' || meta.symbol === '£' || meta.symbol === '€' || meta.symbol === 'CA$') {
    return `${meta.symbol}${formattedNum}`;
  }
  return `${meta.symbol} ${formattedNum}`;
}

export interface CurrencyConversionResult {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  isConverted: boolean;
  sourceNumeric: number | null;
  convertedNumeric: number | null;
  formattedSource: string | null;
  formattedConverted: string | null;
  effectiveRatePkrPerTargetUnit: number;
  rateDescriptionEn: string;
  rateDescriptionUr: string;
}

/**
 * Deterministically converts a numeric bill amount from `fromCurrency` into `toCurrency`.
 * Users can optionally supply `customPkrPerTargetUnit` (how many PKR equal 1 unit of target currency)
 * to override the reference rate.
 */
export function convertCurrencyAmount(params: {
  numericAmount: number | null;
  fromCurrency?: CurrencyCode;
  toCurrency: CurrencyCode;
  customPkrPerTargetUnit?: number | null;
}): CurrencyConversionResult {
  const fromCurrency = params.fromCurrency ?? 'PKR';
  const toCurrency = params.toCurrency;
  const fromMeta = getCurrencyMetadata(fromCurrency);
  const toMeta = getCurrencyMetadata(toCurrency);

  const effectiveTargetPkrRate =
    params.customPkrPerTargetUnit &&
    Number.isFinite(params.customPkrPerTargetUnit) &&
    params.customPkrPerTargetUnit > 0
      ? params.customPkrPerTargetUnit
      : toMeta.defaultPkrPerUnit;

  if (params.numericAmount === null || !Number.isFinite(params.numericAmount) || params.numericAmount < 0) {
    return {
      fromCurrency,
      toCurrency,
      isConverted: fromCurrency !== toCurrency,
      sourceNumeric: null,
      convertedNumeric: null,
      formattedSource: null,
      formattedConverted: null,
      effectiveRatePkrPerTargetUnit: effectiveTargetPkrRate,
      rateDescriptionEn:
        toCurrency === 'PKR'
          ? '1 PKR = 1 PKR'
          : `1 ${toCurrency} = Rs. ${effectiveTargetPkrRate.toFixed(2)}`,
      rateDescriptionUr:
        toCurrency === 'PKR'
          ? '1 PKR = 1 PKR'
          : `1 ${toCurrency} = ${effectiveTargetPkrRate.toFixed(2)} روپے`,
    };
  }

  // Convert source amount into PKR base first, then into target currency
  const amountInPkr = params.numericAmount * fromMeta.defaultPkrPerUnit;
  const rawConverted =
    toCurrency === 'PKR' ? amountInPkr : amountInPkr / effectiveTargetPkrRate;
  const convertedNumeric = Math.round(rawConverted * 100) / 100;

  return {
    fromCurrency,
    toCurrency,
    isConverted: fromCurrency !== toCurrency,
    sourceNumeric: params.numericAmount,
    convertedNumeric,
    formattedSource: formatCurrencyValue(params.numericAmount, fromCurrency),
    formattedConverted: formatCurrencyValue(convertedNumeric, toCurrency),
    effectiveRatePkrPerTargetUnit: effectiveTargetPkrRate,
    rateDescriptionEn:
      toCurrency === 'PKR'
        ? 'Original Currency (PKR)'
        : `1 ${toCurrency} = Rs. ${effectiveTargetPkrRate.toFixed(2)} PKR`,
    rateDescriptionUr:
      toCurrency === 'PKR'
        ? 'اصل کرنسی (PKR)'
        : `شرحِ مبادلہ: 1 ${toCurrency} = ${effectiveTargetPkrRate.toFixed(2)} روپے`,
  };
}
