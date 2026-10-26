import {
  DocumentAnalysisResult,
  validateModelOutput,
  parseDeterministicAmount,
  computeDeterministicDeadline,
} from './schema';

export const RECENT_ANALYSIS_STORAGE_KEY = 'samajh_recent_analyses_v1';
export const MAX_RECENT_ANALYSES = 3;

export interface RecentAnalysisMeta {
  stage: number;
  stage1Supported: boolean;
  detectedMime: string;
  sanitizedBytes: number;
  modelUsed: string;
  zeroRetentionConfirmed: boolean;
}

export interface RecentAnalysisItem {
  id: string;
  analyzedAtIso: string;
  result: DocumentAnalysisResult;
  meta: RecentAnalysisMeta;
  imagePreviewDataUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface BillComparisonSummary {
  id: string;
  analyzedAtIso: string;
  issuer: string;
  docType: string;
  referenceNumber: string | null;
  billingMonth: string | null;
  amountDueRaw: string | null;
  amountDueNumeric: number | null;
  amountDueFormatted: string | null;
  afterDueDateRaw: string | null;
  afterDueDateNumeric: number | null;
  dueDateRaw: string | null;
  dueDateStatus: 'overdue' | 'due_soon' | 'upcoming' | 'unknown';
  unitsConsumed: string | null;
  confidencePercent: number;
}

function findFieldValue(result: DocumentAnalysisResult, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const found = result.fields.find(
      (f) => f.key.toLowerCase() === candidate.toLowerCase() && f.value !== null
    );
    if (found && found.value) {
      return found.value;
    }
  }
  return null;
}

/**
 * Pure helper that extracts key comparison metrics from a RecentAnalysisItem.
 */
export function extractComparisonSummary(item: RecentAnalysisItem): BillComparisonSummary {
  const { result } = item;
  const referenceNumber = findFieldValue(result, [
    'reference_number',
    'consumer_number',
    'account_id',
    'reference_no',
  ]);
  const billingMonth = findFieldValue(result, [
    'billing_period',
    'billing_month',
    'month',
    'bill_month',
  ]);
  const amountDueRaw = findFieldValue(result, [
    'amount_due',
    'payable_within_due_date',
    'total_payable',
    'current_bill',
  ]);
  const afterDueDateRaw = findFieldValue(result, [
    'amount_after_due_date',
    'payable_after_due_date',
    'late_amount',
  ]);
  const dueDateRaw = findFieldValue(result, ['due_date', 'payment_deadline', 'last_date']);
  const unitsConsumed = findFieldValue(result, [
    'units_consumed',
    'units',
    'kwh_consumed',
    'hm3_consumed',
  ]);

  const parsedDue = parseDeterministicAmount(amountDueRaw);
  const parsedAfter = parseDeterministicAmount(afterDueDateRaw);
  const deadlineInfo = computeDeterministicDeadline(dueDateRaw);

  return {
    id: item.id,
    analyzedAtIso: item.analyzedAtIso,
    issuer: result.issuer || 'Unknown Utility',
    docType: result.doc_type,
    referenceNumber,
    billingMonth,
    amountDueRaw,
    amountDueNumeric: parsedDue.numericAmount,
    amountDueFormatted: parsedDue.formattedPkr,
    afterDueDateRaw,
    afterDueDateNumeric: parsedAfter.numericAmount,
    dueDateRaw,
    dueDateStatus: deadlineInfo.status,
    unitsConsumed,
    confidencePercent: Math.round(result.doc_type_confidence * 100),
  };
}

/**
 * Pure helper that inserts or updates an analysis item at the front of the list,
 * deduplicating by (issuer + reference_number + billing_month) when present,
 * and capping the list at MAX_RECENT_ANALYSES (3).
 */
export function upsertRecentAnalysisList(
  existing: RecentAnalysisItem[],
  nextItem: RecentAnalysisItem,
  maxItems: number = MAX_RECENT_ANALYSES
): RecentAnalysisItem[] {
  const nextSummary = extractComparisonSummary(nextItem);

  const filtered = existing.filter((item) => {
    if (item.id === nextItem.id) return false;
    const summary = extractComparisonSummary(item);
    if (
      nextSummary.referenceNumber &&
      summary.referenceNumber &&
      nextSummary.referenceNumber === summary.referenceNumber &&
      nextSummary.billingMonth === summary.billingMonth &&
      nextSummary.issuer === summary.issuer
    ) {
      return false;
    }
    return true;
  });

  return [nextItem, ...filtered].slice(0, Math.max(1, maxItems));
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultSessionStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // Ignore SecurityError in restricted environments
  }
  return null;
}

/**
 * Loads and validates up to 3 recent analysis items from sessionStorage.
 * Every stored result is re-validated through ResultSchema so tampered storage is rejected.
 */
export function loadRecentAnalysesFromSession(
  storage: StorageLike | null = getDefaultSessionStorage()
): RecentAnalysisItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_ANALYSIS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const validItems: RecentAnalysisItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.id !== 'string' || typeof candidate.analyzedAtIso !== 'string') {
        continue;
      }
      const schemaCheck = validateModelOutput(candidate.result);
      if (!schemaCheck.ok || !schemaCheck.data) {
        continue;
      }
      const rawMeta = (candidate.meta || {}) as Record<string, unknown>;
      validItems.push({
        id: candidate.id,
        analyzedAtIso: candidate.analyzedAtIso,
        result: schemaCheck.data,
        meta: {
          stage: typeof rawMeta.stage === 'number' ? rawMeta.stage : 1,
          stage1Supported:
            typeof rawMeta.stage1Supported === 'boolean' ? rawMeta.stage1Supported : true,
          detectedMime:
            typeof rawMeta.detectedMime === 'string' ? rawMeta.detectedMime : 'image/jpeg',
          sanitizedBytes:
            typeof rawMeta.sanitizedBytes === 'number' ? rawMeta.sanitizedBytes : 0,
          modelUsed:
            typeof rawMeta.modelUsed === 'string'
              ? rawMeta.modelUsed
              : 'gemini:gemini-3.8-flash',
          zeroRetentionConfirmed: true,
        },
        imagePreviewDataUrl:
          typeof candidate.imagePreviewDataUrl === 'string'
            ? candidate.imagePreviewDataUrl
            : undefined,
        imageWidth:
          typeof candidate.imageWidth === 'number' ? candidate.imageWidth : undefined,
        imageHeight:
          typeof candidate.imageHeight === 'number' ? candidate.imageHeight : undefined,
      });
      if (validItems.length >= MAX_RECENT_ANALYSES) break;
    }

    return validItems;
  } catch {
    return [];
  }
}

/**
 * Persists up to 3 recent analysis items into sessionStorage.
 * If storing with base64 image previews exceeds sessionStorage quota, falls back to storing
 * the structured results without image previews so comparison still works reliably.
 */
export function saveRecentAnalysesToSession(
  items: RecentAnalysisItem[],
  storage: StorageLike | null = getDefaultSessionStorage()
): void {
  if (!storage) return;
  const capped = items.slice(0, MAX_RECENT_ANALYSES);
  try {
    storage.setItem(RECENT_ANALYSIS_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    try {
      const lightweight = capped.map(({ imagePreviewDataUrl: _omit, ...rest }) => rest);
      storage.setItem(RECENT_ANALYSIS_STORAGE_KEY, JSON.stringify(lightweight));
    } catch {
      // Ignore storage quota failure
    }
  }
}

/**
 * Clears all stored analysis history from sessionStorage.
 */
export function clearRecentAnalysesFromSession(
  storage: StorageLike | null = getDefaultSessionStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(RECENT_ANALYSIS_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}
