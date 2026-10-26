import React, { useState } from 'react';
import {
  DocumentAnalysisResult,
  DocType,
  computeDeterministicDeadline,
  parseDeterministicAmount,
  splitExplainerBlocks,
} from '../lib/schema';
import { SanitizedImagePayload } from '../lib/imageSanitizer';
import {
  SUPPORTED_CURRENCIES,
  CurrencyCode,
  detectSourceCurrency,
  convertCurrencyAmount,
  getCurrencyMetadata,
} from '../lib/currencyConverter';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Square,
  Eye,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Copy,
  Check,
  Share2,
  Printer,
  ArrowLeftRight,
} from 'lucide-react';

interface ResultCardProps {
  lang: 'ur' | 'en';
  result: DocumentAnalysisResult;
  imagePayload: SanitizedImagePayload;
  meta: {
    stage: number;
    stage1Supported: boolean;
    detectedMime: string;
    sanitizedBytes: number;
    modelUsed: string;
    zeroRetentionConfirmed: boolean;
  };
  onReset: () => void;
}

const DOC_TYPE_LABELS: Record<DocType, { ur: string; en: string }> = {
  utility_bill: { ur: 'بجلی یا گیس کا بل (Utility Bill)', en: 'Electricity or Gas Bill' },
  fee_challan: { ur: 'فیس چالان یا واؤچر (Fee Challan)', en: 'Fee Challan or Voucher' },
  legal_notice: { ur: 'عدالتی یا قانونی نوٹس (Legal Notice)', en: 'Court or Legal Notice' },
  medical_report: { ur: 'طبی یا لیب رپورٹ (Medical Report)', en: 'Medical or Lab Report' },
  bank_or_tax_letter: { ur: 'بینک یا ٹیکس خط (Bank / Tax Letter)', en: 'Bank or Tax Letter' },
  other: { ur: 'دیگر دستاویز (Other Document)', en: 'Other Document' },
};

const FIELD_LABELS: Record<string, { ur: string; en: string }> = {
  issuer: { ur: 'جاری کنندہ ادارہ (Issuer)', en: 'Issuing Utility / Authority' },
  reference_number: { ur: 'حوالہ / کسٹمر نمبر (Reference No.)', en: 'Reference / Consumer No.' },
  billing_period: { ur: 'بل کا مہینہ (Billing Period)', en: 'Billing Period' },
  amount_due: { ur: 'مقررہ تاریخ تک واجب الادا رقم (Amount Due)', en: 'Amount Payable Within Due Date' },
  due_date: { ur: 'جمع کروانے کی آخری تاریخ (Due Date)', en: 'Due Date' },
  amount_after_due_date: { ur: 'تاریخ گزرنے کے بعد رقم (After Due Date)', en: 'Amount After Due Date' },
  units_consumed: { ur: 'استعمال شدہ یونٹس (Units Consumed)', en: 'Units Billed / Consumed' },
  inspector_stamp_code: { ur: 'انسپکٹر اسٹیمپ / میٹر کوڈ (Stamp Code)', en: 'Inspector Stamp / Meter Serial' },
};

function getFieldLabel(key: string, lang: 'ur' | 'en'): string {
  const normalized = key.toLowerCase().trim();
  if (FIELD_LABELS[normalized]) {
    return FIELD_LABELS[normalized][lang];
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ResultCard: React.FC<ResultCardProps> = ({
  lang,
  result,
  imagePayload,
  meta,
  onReset,
}) => {
  const isUr = lang === 'ur';
  const [selectedDocType, setSelectedDocType] = useState<DocType>(result.doc_type);
  const [activeFieldIdx, setActiveFieldIdx] = useState<number | null>(1);
  const [checkedActions, setCheckedActions] = useState<Record<number, boolean>>({});
  const [zoomed, setZoomed] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const summaryText = isUr ? result.summary_ur : result.summary_en;
  const explainer = splitExplainerBlocks(summaryText);

  // Deterministic date, amount, and late surcharge calculation in code (Rule 7)
  const rawDueDateField =
    result.fields.find((f) => f.key.toLowerCase().includes('due_date') && !f.key.toLowerCase().includes('after'))?.value ??
    result.actions.find((a) => a.deadline)?.deadline ??
    null;

  const rawAmountField =
    result.fields.find(
      (f) =>
        f.key.toLowerCase() === 'amount_due' ||
        f.key.toLowerCase() === 'payable_within_due_date'
    )?.value ?? null;

  const rawAfterAmountField =
    result.fields.find((f) => f.key.toLowerCase().includes('after_due'))?.value ?? null;

  const referenceNumberValue =
    result.fields.find((f) => f.key.toLowerCase().includes('reference'))?.value ?? null;

  const sourceCurrency = detectSourceCurrency(rawAmountField);
  const [targetCurrency, setTargetCurrency] = useState<CurrencyCode>('PKR');
  const [customRateInput, setCustomRateInput] = useState<string>('');

  const parsedCustomRate =
    customRateInput.trim() !== '' && Number.isFinite(Number(customRateInput)) && Number(customRateInput) > 0
      ? Number(customRateInput)
      : null;

  const deadlineInfo = computeDeterministicDeadline(rawDueDateField);
  const parsedAmount = parseDeterministicAmount(rawAmountField);
  const parsedAfterAmount = parseDeterministicAmount(rawAfterAmountField);

  const lateSurchargeDelta =
    parsedAmount.numericAmount !== null &&
    parsedAfterAmount.numericAmount !== null &&
    parsedAfterAmount.numericAmount > parsedAmount.numericAmount
      ? parsedAfterAmount.numericAmount - parsedAmount.numericAmount
      : null;

  const convertedDue = convertCurrencyAmount({
    numericAmount: parsedAmount.numericAmount,
    fromCurrency: sourceCurrency,
    toCurrency: targetCurrency,
    customPkrPerTargetUnit: parsedCustomRate,
  });

  const convertedAfterDue = convertCurrencyAmount({
    numericAmount: parsedAfterAmount.numericAmount,
    fromCurrency: sourceCurrency,
    toCurrency: targetCurrency,
    customPkrPerTargetUnit: parsedCustomRate,
  });

  const convertedSurchargeDelta = convertCurrencyAmount({
    numericAmount: lateSurchargeDelta,
    fromCurrency: sourceCurrency,
    toCurrency: targetCurrency,
    customPkrPerTargetUnit: parsedCustomRate,
  });

  const activeField =
    activeFieldIdx !== null && result.fields[activeFieldIdx]
      ? result.fields[activeFieldIdx]
      : null;

  const toggleAction = (idx: number) => {
    setCheckedActions((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleCopyReference = async () => {
    if (!referenceNumberValue) return;
    try {
      await navigator.clipboard.writeText(referenceNumberValue);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  };

  const handleCopySummary = async () => {
    const plainExport = [
      `Samajh (سمجھ) — ${result.issuer || 'Utility Bill Summary'}`,
      referenceNumberValue ? `Reference No: ${referenceNumberValue}` : null,
      parsedAmount.formattedPkr
        ? convertedDue.isConverted && convertedDue.formattedConverted
          ? `Amount Due: ${parsedAmount.formattedPkr} (Converted: ${convertedDue.formattedConverted} @ ${convertedDue.rateDescriptionEn})`
          : `Amount Due: ${parsedAmount.formattedPkr}`
        : null,
      rawDueDateField ? `Due Date: ${rawDueDateField}` : null,
      '',
      summaryText.replace(/\s*\|\|\s*/g, '\n\n'),
      '',
      'Disclaimer: Explains document text only; not legal, medical, or financial advice. Verify with original bill before paying.',
    ]
      .filter((line) => line !== null)
      .join('\n');

    try {
      await navigator.clipboard.writeText(plainExport);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const completedActionsCount = Object.values(checkedActions).filter(Boolean).length;
  const isLowDocConfidence = result.doc_type_confidence < 0.8;
  const isNonStage1Type = selectedDocType !== 'utility_bill';

  return (
    <section
      aria-label={isUr ? 'دستاویز کے تجزیے کا نتیجہ' : 'Document Analysis Result'}
      className="space-y-6"
    >
      {/* Top Action & Document Classification Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-sans-ui">
              <span className="font-semibold text-emerald-900">
                {DOC_TYPE_LABELS[selectedDocType][lang]}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {isUr ? 'اعتماد (Confidence): ' : 'Confidence: '}
                {Math.round(result.doc_type_confidence * 100)}%
              </span>
              <span aria-hidden="true">·</span>
              <span>{isUr ? 'EXIF لوکیشن صاف شدہ' : 'EXIF Stripped'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">{meta.modelUsed}</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              {result.issuer || (isUr ? 'بجلی یا گیس کا بل' : 'Utility Bill Statement')}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {/* F2: "This might be X, change it" control */}
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <label
                htmlFor="doctype-override-select"
                className="text-xs font-medium text-slate-600"
              >
                {isUr ? 'دستاویز کی قسم تبدیل کریں:' : 'This might be another type, change it:'}
              </label>
              <select
                id="doctype-override-select"
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value as DocType)}
                className="min-h-[40px] max-w-full rounded-lg border border-slate-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-emerald-700 focus:outline-none"
              >
                {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((typeKey) => (
                  <option key={typeKey} value={typeKey}>
                    {DOC_TYPE_LABELS[typeKey][lang]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              aria-label={isUr ? 'نتیجہ پرنٹ کریں یا PDF محفوظ کریں' : 'Print or save result as PDF'}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{isUr ? 'پرنٹ / PDF' : 'Print / Save PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopySummary()}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedSummary ? (
                <Check className="h-3.5 w-3.5 text-emerald-700" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
              <span>
                {copiedSummary
                  ? isUr
                    ? 'کاپی ہو گیا!'
                    : 'Copied!'
                  : isUr
                    ? 'خلاصہ کاپی کریں'
                    : 'Copy Summary'}
              </span>
            </button>

            <button
              type="button"
              onClick={onReset}
              className="flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isUr ? 'نیا بل چیک کریں' : 'Scan Another Bill'}</span>
            </button>
          </div>
        </div>

        {/* Low confidence or Non-Stage-1 Document Type Notice */}
        {(isLowDocConfidence || isNonStage1Type) && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 flex items-start gap-2.5"
          >
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              {isNonStage1Type ? (
                <p>
                  {isUr
                    ? 'مرحلہ 1 (Stage 1) میں صرف بجلی اور گیس کے بلوں کی مکمل سپورٹ شامل ہے۔ دیگر دستاویزات (فیس چالان، قانونی نوٹس، میڈیکل رپورٹ، بینک خط) مرحلہ 3 میں شامل ہوں گے۔'
                    : 'Stage 1 supports electricity and gas utility bills only. Full templates for fee challans, legal notices, medical reports, and bank/tax letters arrive in Stage 3.'}
                </p>
              ) : (
                <p>
                  {isUr
                    ? 'اس دستاویز کی قسم پر ماڈل کا اعتماد کم ہے۔ براہِ کرم اوپر دیے گئے مینو سے درست قسم منتخب کریں۔'
                    : 'Document classification confidence is low. You can adjust the document type using the selector above.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Prompt Injection Suspected Warning */}
        {result.injection_suspected && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950 flex items-start gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {isUr
                  ? 'انتباہ: دستاویز کے اندر مشکوک ہدایات (Prompt Injection) پائی گئیں'
                  : 'Security Alert: Suspected Prompt Injection Detected in Document'}
              </p>
              <p className="mt-1 text-xs text-red-900">
                {isUr
                  ? 'اس تصویر کے متن میں سسٹم کو گمراہ کرنے کی کوشش نظر آئی ہے۔ سسٹم نے ان ہدایات پر عمل نہیں کیا۔ براہِ کرم اصل کاغذ سے ہر نمبر خود چیک کریں۔'
                  : 'Text inside this document attempted to instruct or override the AI. Samajh treated it strictly as passive data. Verify every figure carefully against the original image.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main Side-by-Side Split: Original Image Always Beside Extracted Fields */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Original Sanitized Bill Image Column (Sticky on Desktop) */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isUr ? 'اصلی بل کی تصویر (بغیر EXIF)' : 'Original Bill Image (EXIF Stripped)'}
              </h3>
              <p className="text-xs text-slate-500 font-sans-ui">
                {isUr
                  ? 'کسی بھی خانے پر کلک کریں تاکہ تصویر پر اس کی جگہ نمایاں ہو'
                  : 'Click any extracted field or box to verify against the paper bill'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              aria-label={
                zoomed
                  ? isUr
                    ? 'تصویر چھوٹی کریں'
                    : 'Zoom out image'
                  : isUr
                    ? 'تصویر بڑی کریں'
                    : 'Zoom in image'
              }
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
              <span>{zoomed ? (isUr ? 'نارمل سائز' : 'Fit View') : (isUr ? 'زوم 150%' : 'Zoom 150%')}</span>
            </button>
          </div>

          <div
            className={`relative overflow-auto rounded-xl border border-slate-200 bg-stone-100 ${
              zoomed ? 'max-h-[750px]' : 'max-h-[640px]'
            }`}
          >
            <div
              className="relative mx-auto"
              style={{ width: zoomed ? '150%' : '100%' }}
            >
              <img
                src={imagePayload.dataUrl}
                alt={isUr ? 'اپ لوڈ شدہ بل کی تصویر' : 'Uploaded utility bill document'}
                referrerPolicy="no-referrer"
                className="block w-full h-auto select-none"
              />

              {/* Interactive Evidence Regions on the Original Bill Image */}
              {result.fields.map((field, idx) => {
                if (!field.region) return null;
                const isSelected = activeFieldIdx === idx;
                return (
                  <button
                    key={`region-${field.key}-${idx}`}
                    type="button"
                    onClick={() => setActiveFieldIdx(idx)}
                    aria-label={`Highlight ${field.key} on bill image`}
                    style={{
                      left: `${field.region.x}%`,
                      top: `${field.region.y}%`,
                      width: `${field.region.w}%`,
                      height: `${field.region.h}%`,
                    }}
                    className={`absolute rounded-md transition-opacity duration-150 focus:outline-none ${
                      isSelected
                        ? 'border-2 border-emerald-600 bg-emerald-500/20 z-10'
                        : 'border border-emerald-700/30 bg-transparent hover:bg-emerald-500/10'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {activeField && (
            <div className="rounded-xl bg-stone-50 border border-slate-200 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700">
                {getFieldLabel(activeField.key, lang)}:
              </span>
              <span className="font-mono-tabular font-bold text-emerald-950">
                {activeField.value ?? (isUr ? 'ناقابلِ فہم (null)' : 'Unreadable (null)')}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500 font-sans-ui">
            <span className="font-mono-tabular">
              {imagePayload.width} × {imagePayload.height} px
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {(imagePayload.sanitizedBytes / 1024).toFixed(1)} KB
            </span>
            <span aria-hidden="true">·</span>
            <span>{isUr ? 'سرور پر کچھ محفوظ نہیں کیا گیا' : 'Zero server storage'}</span>
          </div>
        </div>

        {/* Extracted Evidence, Plain-Language Explainer & Actions Column */}
        <div className="lg:col-span-7 space-y-6">
          {/* Code-Computed Key Figures Strip (Rule 7: Parsed & Computed by Code) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Amount Due & Late Fee Delta (with Optional Currency Conversion) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">
                {isUr
                  ? 'واجب الادا رقم (کوڈ سے تصدیق شدہ)'
                  : 'Payable Amount (Code-Parsed)'}
              </p>
              <p
                data-testid="primary-payable-amount"
                dir="ltr"
                className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular text-start"
              >
                {convertedDue.isConverted && convertedDue.formattedConverted
                  ? convertedDue.formattedConverted
                  : parsedAmount.formattedPkr ||
                    rawAmountField ||
                    (isUr ? 'نامعلوم (null)' : 'Unknown (null)')}
              </p>
              {convertedDue.isConverted && parsedAmount.formattedPkr && (
                <p
                  data-testid="original-payable-amount"
                  className="mt-0.5 text-xs font-semibold text-slate-600 font-sans-ui"
                >
                  {isUr ? 'اصل بل:' : 'Original:'}{' '}
                  <span dir="ltr" className="font-mono-tabular">
                    {parsedAmount.formattedPkr}
                  </span>
                </p>
              )}
              {lateSurchargeDelta !== null ? (
                <p className="mt-1 text-xs font-medium text-emerald-800">
                  {convertedSurchargeDelta.isConverted &&
                  convertedSurchargeDelta.formattedConverted
                    ? isUr
                      ? `وقت پر ادائیگی سے ${convertedSurchargeDelta.formattedConverted} (Rs. ${lateSurchargeDelta.toLocaleString('en-PK')}) کی بچت`
                      : `Save ${convertedSurchargeDelta.formattedConverted} (Rs. ${lateSurchargeDelta.toLocaleString('en-PK')}) before deadline`
                    : isUr
                      ? `وقت پر ادائیگی سے Rs. ${lateSurchargeDelta.toLocaleString('en-PK')} کی بچت`
                      : `Save Rs. ${lateSurchargeDelta.toLocaleString('en-PK')} before deadline`}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  {isUr ? 'تصویر سے تصدیق کریں' : 'Cross-check with bill image'}
                </p>
              )}
            </div>

            {/* Card 2: Deterministic Due Date & Countdown */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">
                {isUr
                  ? 'آخری تاریخ (کوڈ سے تصدیق شدہ)'
                  : 'Due Date (Code-Computed)'}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900 font-mono-tabular">
                {rawDueDateField || (isUr ? 'نامعلوم (null)' : 'Unknown (null)')}
              </p>
              <p
                className={`mt-1 text-xs font-semibold ${
                  deadlineInfo.status === 'overdue'
                    ? 'text-red-700'
                    : deadlineInfo.status === 'due_soon'
                      ? 'text-amber-800'
                      : 'text-emerald-800'
                }`}
              >
                {isUr ? deadlineInfo.labelUr : deadlineInfo.labelEn}
              </p>
            </div>

            {/* Card 3: Quick Reference Number Copy */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {isUr ? 'بل کا حوالہ نمبر (Reference No.)' : 'Reference / Consumer No.'}
                </p>
                <p className="mt-1 text-base font-bold text-slate-900 font-mono-tabular break-all">
                  {referenceNumberValue || (isUr ? 'نامعلوم (null)' : 'Unknown (null)')}
                </p>
              </div>
              {referenceNumberValue && (
                <button
                  type="button"
                  onClick={() => void handleCopyReference()}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950 font-sans-ui"
                >
                  {copiedRef ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>{isUr ? 'کاپی ہو گیا!' : 'Copied to clipboard'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{isUr ? 'حوالہ نمبر کاپی کریں' : 'Copy Reference No.'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Optional Multi-Currency Bill Converter (Code-Computed Arithmetic) */}
          <div
            data-testid="currency-converter-panel"
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 print:hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-900/10 text-emerald-900">
                  <ArrowLeftRight className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isUr
                      ? 'اختیاری کرنسی کنورٹر (Optional Currency Converter)'
                      : 'Optional Currency Converter (Multi-Source Bill Tracking)'}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {isUr
                      ? 'بیرونِ ملک مقیم افراد یا مختلف ذرائع سے بل ٹریک کرنے کے لیے واجب الادا رقم کو دوسری کرنسی میں تبدیل کریں (حساب کوڈ کے ذریعے)۔'
                      : 'Convert the extracted bill amount into USD, AED, SAR, GBP, EUR, or CAD with deterministic code math and optional custom exchange rates.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label
                  htmlFor="currency-converter-select"
                  className="text-xs font-semibold text-slate-700 whitespace-nowrap"
                >
                  {isUr ? 'کرنسی منتخب کریں:' : 'Target Currency:'}
                </label>
                <select
                  id="currency-converter-select"
                  data-testid="currency-select"
                  value={targetCurrency}
                  onChange={(e) => {
                    const nextCode = e.target.value as CurrencyCode;
                    setTargetCurrency(nextCode);
                    setCustomRateInput('');
                  }}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none font-sans-ui"
                >
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {isUr ? curr.labelUr : curr.labelEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {targetCurrency !== 'PKR' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium text-slate-500">
                      {isUr ? 'مقررہ تاریخ تک (Converted Due)' : 'Converted Amount Due'}
                    </p>
                    <p
                      data-testid="converted-amount-due"
                      dir="ltr"
                      className="mt-0.5 text-lg font-bold text-emerald-950 font-mono-tabular text-start"
                    >
                      {convertedDue.formattedConverted || '—'}
                    </p>
                    <p dir="ltr" className="text-[11px] text-slate-500 font-mono-tabular text-start">
                      {parsedAmount.formattedPkr || rawAmountField || '—'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium text-slate-500">
                      {isUr ? 'آخری تاریخ کے بعد (After Due Date)' : 'Converted After Due Date'}
                    </p>
                    <p
                      data-testid="converted-amount-after"
                      dir="ltr"
                      className="mt-0.5 text-lg font-bold text-amber-900 font-mono-tabular text-start"
                    >
                      {convertedAfterDue.formattedConverted || '—'}
                    </p>
                    <p dir="ltr" className="text-[11px] text-slate-500 font-mono-tabular text-start">
                      {parsedAfterAmount.formattedPkr || rawAfterAmountField || '—'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col justify-between">
                    <label
                      htmlFor="currency-custom-rate"
                      className="text-[11px] font-semibold text-slate-700"
                    >
                      {isUr
                        ? `اپنی شرحِ مبادلہ لکھیں (1 ${targetCurrency} = PKR):`
                        : `Custom Rate (1 ${targetCurrency} in PKR):`}
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        id="currency-custom-rate"
                        data-testid="currency-custom-rate-input"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={customRateInput}
                        onChange={(e) => setCustomRateInput(e.target.value)}
                        placeholder={String(getCurrencyMetadata(targetCurrency).defaultPkrPerUnit)}
                        className="min-h-[34px] w-full rounded-md border border-slate-300 bg-stone-50 px-2.5 py-1 text-xs font-mono-tabular text-slate-900 focus:border-emerald-700 focus:outline-none"
                      />
                      {customRateInput && (
                        <button
                          type="button"
                          onClick={() => setCustomRateInput('')}
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap"
                        >
                          {isUr ? 'ری سیٹ' : 'Reset'}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-900 font-sans-ui">
                      {isUr ? convertedDue.rateDescriptionUr : convertedDue.rateDescriptionEn}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* F4: Plain-Language 3-Block Explainer */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {isUr ? 'آسان الفاظ میں وضاحت (Plain-Language Explainer)' : 'Plain-Language Explanation'}
              </h3>
            </div>

            <div className="divide-y divide-slate-100 space-y-4">
              <div className="pt-1">
                <p className="text-xs font-bold text-emerald-900">
                  {isUr ? '1. یہ کیا دستاویز ہے؟ (What this is)' : '01. What this document is'}
                </p>
                <p className="mt-1 text-sm text-slate-800">{explainer.whatThisIs}</p>
              </div>

              {explainer.whatItSays && (
                <div className="pt-4">
                  <p className="text-xs font-bold text-emerald-900">
                    {isUr ? '2. اس میں کیا لکھا ہے؟ (What it says)' : '02. What it says'}
                  </p>
                  <p className="mt-1 text-sm text-slate-800">{explainer.whatItSays}</p>
                </div>
              )}

              {explainer.whatItMeans && (
                <div className="pt-4">
                  <p className="text-xs font-bold text-emerald-900">
                    {isUr ? '3. میرے لیے اس کا کیا مطلب ہے؟ (What it means for me)' : '03. What it means for me'}
                  </p>
                  <p className="mt-1 text-sm text-slate-800">{explainer.whatItMeans}</p>
                </div>
              )}
            </div>
          </div>

          {/* F3: Structured Extraction with Evidence & Confidence */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isUr
                    ? 'بل سے نکالی گئی تفصیلات (Structured Fields & Evidence)'
                    : 'Extracted Fields & Image Evidence'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isUr
                    ? 'جو حصہ صاف نہ پڑھا جا سکے اسے اندازے سے لکھنے کے بجائے نامعلوم (null) دکھایا جاتا ہے۔'
                    : 'Unreadable values are shown honestly as unknown (null) with low confidence — never guessed.'}
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {result.fields.map((field, idx) => {
                const isSelected = activeFieldIdx === idx;
                const isNullOrUnreadable = field.value === null || field.value.trim() === '';
                const pct = Math.round(field.confidence * 100);
                const lowerKey = field.key.toLowerCase();
                const isAmountDueKey =
                  lowerKey === 'amount_due' || lowerKey === 'payable_within_due_date';
                const isAfterDueKey = lowerKey.includes('after_due');

                // Tier classification: High (>= 85%), Medium (60-84%), Low (< 60%)
                const confidenceTier: 'high' | 'medium' | 'low' =
                  field.confidence >= 0.85
                    ? 'high'
                    : field.confidence >= 0.6
                      ? 'medium'
                      : 'low';

                const badgeStyles =
                  confidenceTier === 'high'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : confidenceTier === 'medium'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-rose-200 bg-rose-50 text-rose-900';

                const barFillClass =
                  confidenceTier === 'high'
                    ? 'bg-emerald-600'
                    : confidenceTier === 'medium'
                      ? 'bg-amber-500'
                      : 'bg-rose-600';

                const tierLabel =
                  confidenceTier === 'high'
                    ? isUr
                      ? 'اعلیٰ اعتماد'
                      : 'High'
                    : confidenceTier === 'medium'
                      ? isUr
                        ? 'درمیانہ اعتماد'
                        : 'Medium'
                      : isUr
                        ? 'کم اعتماد'
                        : 'Low';

                return (
                  <button
                    key={`${field.key}-${idx}`}
                    type="button"
                    onClick={() => setActiveFieldIdx(idx)}
                    className={`w-full text-start py-3.5 px-3 rounded-xl transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected ? 'bg-emerald-50/80' : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">
                          {getFieldLabel(field.key, lang)}
                        </span>
                        {field.region && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 font-sans-ui">
                            <Eye className="h-3 w-3" />
                            <span>{isUr ? 'تصویر پر دیکھیں' : 'Locate on image'}</span>
                          </span>
                        )}
                      </div>

                      {isNullOrUnreadable ? (
                        <p className="text-xs font-medium text-rose-800">
                          {isUr
                            ? 'ناقابلِ فہم / غیر واضح (null — اندازہ نہیں لگایا گیا)'
                            : 'Unreadable / Unknown (null — never guessed)'}
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-baseline gap-2">
                          <p className="text-sm font-bold text-slate-900 font-mono-tabular">
                            {field.value}
                          </p>
                          {convertedDue.isConverted &&
                            isAmountDueKey &&
                            convertedDue.formattedConverted && (
                              <span
                                dir="ltr"
                                className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-900 font-mono-tabular"
                              >
                                ≈ {convertedDue.formattedConverted}
                              </span>
                            )}
                          {convertedAfterDue.isConverted &&
                            isAfterDueKey &&
                            convertedAfterDue.formattedConverted && (
                              <span
                                dir="ltr"
                                className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900 font-mono-tabular"
                              >
                                ≈ {convertedAfterDue.formattedConverted}
                              </span>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Visual Confidence Indicator (Color-Coded Badge + Meter Bar) */}
                    <div className="flex items-center gap-2.5 shrink-0 font-sans-ui">
                      <div
                        data-testid={`confidence-badge-${field.key}`}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${badgeStyles}`}
                      >
                        {confidenceTier === 'high' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                        ) : confidenceTier === 'medium' ? (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-700 shrink-0" />
                        )}
                        <span>{tierLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{pct}%</span>
                      </div>

                      <div
                        aria-hidden="true"
                        className="hidden md:block w-14 h-1.5 rounded-full bg-slate-200 overflow-hidden"
                      >
                        <div
                          className={`h-full rounded-full ${barFillClass}`}
                          style={{ width: `${Math.max(pct, 8)}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* F5: Action Checklist */}
          {result.actions.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  {isUr ? 'اب آپ کو کیا کرنا چاہیے؟ (Action Checklist)' : 'Action Checklist'}
                </h3>
                <span className="text-xs font-mono-tabular text-slate-500">
                  {completedActionsCount}/{result.actions.length}{' '}
                  {isUr ? 'مکمل' : 'completed'}
                </span>
              </div>

              <div className="space-y-2.5">
                {result.actions.map((act, idx) => {
                  const checked = Boolean(checkedActions[idx]);
                  const actDeadline = act.deadline
                    ? computeDeterministicDeadline(act.deadline)
                    : null;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleAction(idx)}
                      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3.5 text-start hover:bg-stone-50 transition-colors"
                    >
                      <span className="mt-1 text-emerald-800 shrink-0">
                        {checked ? (
                          <CheckSquare className="h-5 w-5" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-400" />
                        )}
                      </span>
                      <div className="space-y-1 flex-1">
                        <p
                          className={`text-sm ${
                            checked ? 'line-through text-slate-400' : 'text-slate-900 font-medium'
                          }`}
                        >
                          {isUr ? act.text_ur : act.text_en}
                        </p>
                        {actDeadline && actDeadline.parsedIsoDate && (
                          <p className="text-xs text-slate-500 font-sans-ui">
                            <span className="font-mono-tabular">{actDeadline.parsedIsoDate}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{isUr ? actDeadline.labelUr : actDeadline.labelEn}</span>
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unreadable Parts & Red Flags Notice */}
          {(result.unreadable_parts.length > 0 || result.red_flags.length > 0) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 space-y-3">
              {result.unreadable_parts.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-amber-950">
                    {isUr
                      ? 'وہ حصے جو صاف پڑھے نہیں جا سکے (Unreadable Parts):'
                      : 'Parts that could not be clearly read:'}
                  </h4>
                  <ul className="mt-1.5 list-disc list-inside space-y-1 text-xs text-amber-900">
                    {result.unreadable_parts.map((part, idx) => (
                      <li key={idx}>{part}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.red_flags.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-red-900">
                    {isUr ? 'احتیاطی اشارے (Red Flags):' : 'Risk & Authenticity Signals:'}
                  </h4>
                  <ul className="mt-1.5 list-disc list-inside space-y-1 text-xs text-red-800">
                    {result.red_flags.map((flag, idx) => (
                      <li key={idx}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Mandatory Non-Advice Disclaimer (Honesty Rule) */}
          <div className="rounded-2xl border border-slate-200 bg-stone-100 p-4 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">
              {isUr
                ? 'اہم وضاحت (Disclaimer — Explain, Never Advise):'
                : 'Important Disclaimer (Explain, Never Advise):'}
            </p>
            <p className="mt-1">
              {isUr
                ? 'سمجھ (Samajh) صرف دستاویز میں لکھی عبارت کو آسان اردو اور انگریزی میں سمجھاتا ہے—یہ قانونی، طبی یا مالی مشورہ نہیں دیتا اور نہ ہی 100 فیصد درستگی کا دعویٰ کرتا ہے۔ رقم جمع کروانے یا کوئی قدم اٹھانے سے پہلے ساتھ دی گئی اصلی بل کی تصویر سے تمام نمبروں کی تصدیق ضرور کریں۔'
                : 'Samajh explains what a document says in plain Urdu and English — it does not provide legal, medical, or financial advice and never claims 100% accuracy. Always verify every figure against the original document image before paying or acting.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
