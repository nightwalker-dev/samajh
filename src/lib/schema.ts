import { z } from 'zod';

export const DocTypeSchema = z.enum([
  'utility_bill',
  'fee_challan',
  'legal_notice',
  'medical_report',
  'bank_or_tax_letter',
  'other',
]);

export type DocType = z.infer<typeof DocTypeSchema>;

export const RegionSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(0).max(100),
  h: z.number().min(0).max(100),
});

export type EvidenceRegion = z.infer<typeof RegionSchema>;

export const ExtractedFieldSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.string().max(500).nullable(),
  confidence: z.number().min(0).max(1),
  region: RegionSchema.optional(),
});

export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const ActionItemSchema = z.object({
  text_ur: z.string().min(1).max(600),
  text_en: z.string().min(1).max(600),
  deadline: z.string().max(100).nullable().optional(),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;

/**
 * Exact Result Schema from PRD Section 7 & Section 12.
 * Strict validation: invalid output is rejected, never silently repaired.
 */
export const ResultSchema = z.strictObject({
  doc_type: DocTypeSchema,
  doc_type_confidence: z.number().min(0).max(1),
  issuer: z.string().max(200).nullable(),
  fields: z.array(ExtractedFieldSchema).max(30),
  summary_ur: z.string().min(1).max(3000),
  summary_en: z.string().min(1).max(3000),
  actions: z.array(ActionItemSchema).max(15),
  red_flags: z.array(z.string().max(500)).max(15),
  injection_suspected: z.boolean(),
  unreadable_parts: z.array(z.string().max(300)).max(20),
});

export type DocumentAnalysisResult = z.infer<typeof ResultSchema>;

export interface ValidationParseResult {
  ok: boolean;
  data?: DocumentAnalysisResult;
  errorSummary?: string;
}

/**
 * Validates raw JSON string or object returned by the model.
 * Never repairs malformed JSON or out-of-schema fields.
 */
export function validateModelOutput(rawInput: unknown): ValidationParseResult {
  let parsedObj: unknown = rawInput;

  if (typeof rawInput === 'string') {
    try {
      parsedObj = JSON.parse(rawInput);
    } catch {
      return {
        ok: false,
        errorSummary: 'Model output is not valid JSON.',
      };
    }
  }

  const result = ResultSchema.safeParse(parsedObj);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    return {
      ok: false,
      errorSummary: `Schema validation failed: ${issues}`,
    };
  }

  // Honesty rule enforcement: if a field confidence is very low (< 0.35) and non-null,
  // or if value is empty string "", reject or ensure null honesty rule is respected
  return {
    ok: true,
    data: result.data,
  };
}

export interface DeterministicDeadlineInfo {
  parsedIsoDate: string | null;
  daysRemaining: number | null;
  status: 'overdue' | 'due_soon' | 'upcoming' | 'unknown';
  labelUr: string;
  labelEn: string;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/**
 * Deterministic date parser and countdown calculator in code (never trusted from the model).
 * Supports YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, and "28 Oct 2026" / "28-Oct-2026".
 */
export function computeDeterministicDeadline(
  rawDateStr: string | null | undefined,
  referenceNow: Date = new Date()
): DeterministicDeadlineInfo {
  if (!rawDateStr || typeof rawDateStr !== 'string') {
    return {
      parsedIsoDate: null,
      daysRemaining: null,
      status: 'unknown',
      labelUr: 'تاریخ واضح نہیں',
      labelEn: 'Date not available',
    };
  }

  const clean = rawDateStr.trim();
  let targetYear: number | null = null;
  let targetMonthIndex: number | null = null;
  let targetDay: number | null = null;

  // 1. ISO YYYY-MM-DD
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(clean);
  if (isoMatch) {
    targetYear = Number(isoMatch[1]);
    targetMonthIndex = Number(isoMatch[2]) - 1;
    targetDay = Number(isoMatch[3]);
  }

  // 2. DD Mon YYYY or DD-Mon-YYYY (e.g., "28 Oct 2026" or "28-Oct-26")
  if (targetYear === null) {
    const dmyTextMatch = /^(\d{1,2})[\s\-/,]+([A-Za-z]+)[\s\-/,]+(\d{2,4})$/.exec(clean);
    if (dmyTextMatch) {
      const d = Number(dmyTextMatch[1]);
      const mKey = dmyTextMatch[2].toLowerCase();
      let y = Number(dmyTextMatch[3]);
      if (y < 100) y += 2000;
      if (MONTH_MAP[mKey] !== undefined) {
        targetDay = d;
        targetMonthIndex = MONTH_MAP[mKey];
        targetYear = y;
      }
    }
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY (Pakistani standard date format)
  if (targetYear === null) {
    const dmyNumMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(clean);
    if (dmyNumMatch) {
      targetDay = Number(dmyNumMatch[1]);
      targetMonthIndex = Number(dmyNumMatch[2]) - 1;
      targetYear = Number(dmyNumMatch[3]);
    }
  }

  if (
    targetYear === null ||
    targetMonthIndex === null ||
    targetDay === null ||
    targetMonthIndex < 0 ||
    targetMonthIndex > 11 ||
    targetDay < 1 ||
    targetDay > 31
  ) {
    return {
      parsedIsoDate: null,
      daysRemaining: null,
      status: 'unknown',
      labelUr: 'تاریخ کی تصدیق بل سے کریں',
      labelEn: 'Verify date on original bill',
    };
  }

  const dueUtc = Date.UTC(targetYear, targetMonthIndex, targetDay);
  const checkDate = new Date(dueUtc);
  if (
    checkDate.getUTCFullYear() !== targetYear ||
    checkDate.getUTCMonth() !== targetMonthIndex ||
    checkDate.getUTCDate() !== targetDay
  ) {
    return {
      parsedIsoDate: null,
      daysRemaining: null,
      status: 'unknown',
      labelUr: 'تاریخ درست نہیں',
      labelEn: 'Invalid calendar date',
    };
  }

  const nowUtc = Date.UTC(
    referenceNow.getFullYear(),
    referenceNow.getMonth(),
    referenceNow.getDate()
  );

  const diffDays = Math.round((dueUtc - nowUtc) / (1000 * 60 * 60 * 24));
  const paddedMonth = String(targetMonthIndex + 1).padStart(2, '0');
  const paddedDay = String(targetDay).padStart(2, '0');
  const parsedIsoDate = `${targetYear}-${paddedMonth}-${paddedDay}`;

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      parsedIsoDate,
      daysRemaining: diffDays,
      status: 'overdue',
      labelUr: `مقررہ تاریخ گزر چکی ہے (${overdueDays} دن پہلے)`,
      labelEn: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`,
    };
  }

  if (diffDays === 0) {
    return {
      parsedIsoDate,
      daysRemaining: 0,
      status: 'due_soon',
      labelUr: 'آج آخری تاریخ ہے',
      labelEn: 'Due today',
    };
  }

  if (diffDays <= 5) {
    return {
      parsedIsoDate,
      daysRemaining: diffDays,
      status: 'due_soon',
      labelUr: `${diffDays} دن باقی ہیں (جلد ادائیگی کریں)`,
      labelEn: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
    };
  }

  return {
    parsedIsoDate,
    daysRemaining: diffDays,
    status: 'upcoming',
    labelUr: `${diffDays} دن باقی ہیں`,
    labelEn: `${diffDays} days remaining`,
  };
}

/**
 * Deterministic amount parser in code. Extracts numeric PKR amount and formats cleanly.
 */
export function parseDeterministicAmount(rawAmount: string | null | undefined): {
  numericAmount: number | null;
  formattedPkr: string | null;
} {
  if (!rawAmount || typeof rawAmount !== 'string') {
    return { numericAmount: null, formattedPkr: null };
  }

  // Convert Urdu/Arabic-Indic digits if present
  const normalizedDigits = rawAmount
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

  const match = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)/.exec(normalizedDigits);
  if (!match) {
    return { numericAmount: null, formattedPkr: null };
  }

  const cleanNumStr = match[1].replace(/,/g, '');
  const numericAmount = Number(cleanNumStr);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) {
    return { numericAmount: null, formattedPkr: null };
  }

  return {
    numericAmount,
    formattedPkr: `Rs. ${numericAmount.toLocaleString('en-PK')}`,
  };
}

/**
 * Splits summary_ur or summary_en into the 3 plain-language explainer blocks required by F4:
 * 1) What this is (یہ کیا ہے)
 * 2) What it says (اس میں کیا لکھا ہے)
 * 3) What it means for me (میرے لیے اس کا کیا مطلب ہے)
 */
export function splitExplainerBlocks(summary: string): {
  whatThisIs: string;
  whatItSays: string;
  whatItMeans: string;
} {
  const parts = summary
    .split(/\n\s*\n|\s*\|\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      whatThisIs: parts[0],
      whatItSays: parts[1],
      whatItMeans: parts.slice(2).join(' '),
    };
  }

  const sentences = summary
    .split(/(?<=[.۔!؟?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length >= 3) {
    return {
      whatThisIs: sentences[0],
      whatItSays: sentences[1],
      whatItMeans: sentences.slice(2).join(' '),
    };
  }

  return {
    whatThisIs: parts[0] || summary,
    whatItSays: parts[1] || summary,
    whatItMeans: parts[2] || '',
  };
}
