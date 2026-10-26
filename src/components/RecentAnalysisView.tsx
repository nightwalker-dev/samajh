import React, { useState } from 'react';
import {
  History,
  Trash2,
  ArrowLeftRight,
  Eye,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import {
  RecentAnalysisItem,
  extractComparisonSummary,
  MAX_RECENT_ANALYSES,
} from '../lib/recentHistory';

interface RecentAnalysisViewProps {
  lang: 'ur' | 'en';
  items: RecentAnalysisItem[];
  activeItemId: string | null;
  onSelectItem: (item: RecentAnalysisItem) => void;
  onClearHistory: () => void;
}

export const RecentAnalysisView: React.FC<RecentAnalysisViewProps> = ({
  lang,
  items,
  activeItemId,
  onSelectItem,
  onClearHistory,
}) => {
  const [showCompareTable, setShowCompareTable] = useState<boolean>(true);
  const isUr = lang === 'ur';

  if (items.length === 0) {
    return null;
  }

  const summaries = items.map((item) => ({
    item,
    summary: extractComparisonSummary(item),
  }));

  // Deterministic total & range across stored bills
  const numericAmounts = summaries
    .map((s) => s.summary.amountDueNumeric)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const totalCombinedPkr =
    numericAmounts.length > 0
      ? numericAmounts.reduce((acc, curr) => acc + curr, 0)
      : null;

  const minPkr = numericAmounts.length > 1 ? Math.min(...numericAmounts) : null;
  const maxPkr = numericAmounts.length > 1 ? Math.max(...numericAmounts) : null;
  const spreadPkr =
    minPkr !== null && maxPkr !== null ? Math.round(maxPkr - minPkr) : null;

  return (
    <section
      id="recent-analysis"
      data-testid="recent-analysis-section"
      aria-label={
        isUr
          ? 'حالیہ تجزیہ اور بلوں کا موازنہ (Recent Analysis)'
          : 'Recent Analysis & Bill Comparison'
      }
      className="no-print rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5"
    >
      {/* Header Row with Count, Compare Toggle, and Clear History Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900">
            <History className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {isUr
                  ? 'حالیہ تجزیہ اور بلوں کا موازنہ (Recent Analysis)'
                  : 'Recent Analysis & Bill Comparison'}
              </h2>
              <span
                data-testid="recent-history-count"
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900 font-mono-tabular"
              >
                {items.length}/{MAX_RECENT_ANALYSES} in sessionStorage
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {isUr
                ? 'آپ کے آخری 3 بل صرف اس ٹیب کے عارضی سیشن (sessionStorage) میں محفوظ ہیں تاکہ آپ دوبارہ اپ لوڈ کیے بغیر موازنہ کر سکیں۔ ٹیب بند کرنے یا نیچے بٹن دبانے سے یہ صاف ہو جاتے ہیں۔'
                : 'Stores your last 3 analyzed bills in tab-only sessionStorage so you can compare multiple bills without re-uploading.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            data-testid="btn-toggle-compare-table"
            onClick={() => setShowCompareTable((prev) => !prev)}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-800" />
            <span>
              {showCompareTable
                ? isUr
                  ? 'موازنہ جدول چھپائیں'
                  : 'Hide Comparison Table'
                : isUr
                  ? 'بلوں کا موازنہ کریں (Compare)'
                  : 'Compare Bills Table'}
            </span>
          </button>

          <button
            type="button"
            data-testid="btn-clear-recent-history"
            onClick={onClearHistory}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3.5 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-100 transition-colors whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-700" />
            <span>{isUr ? 'تاریخچہ صاف کریں (Clear History)' : 'Clear History'}</span>
          </button>
        </div>
      </div>

      {/* Quick-Switch Cards for Last 3 Results */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaries.map(({ item, summary }, idx) => {
          const isCurrent = activeItemId === item.id;
          return (
            <div
              key={item.id}
              data-testid={`recent-card-${idx}`}
              className={`rounded-xl border p-4 transition-colors flex flex-col justify-between gap-3 ${
                isCurrent
                  ? 'border-emerald-700 bg-emerald-50/40'
                  : 'border-slate-200 bg-stone-50/60 hover:border-slate-300'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-900 font-sans-ui">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      #{idx + 1} · {summary.billingMonth || 'Bill'}
                    </span>
                  </span>

                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-800 px-2 py-0.5 text-[11px] font-semibold text-white font-sans-ui">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{isUr ? 'فعال' : 'Active'}</span>
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
                  {summary.issuer}
                </h3>

                <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-200/70">
                  <span className="text-xs text-slate-600">
                    {isUr ? 'واجب الادا رقم:' : 'Amount Due:'}
                  </span>
                  <span
                    dir="ltr"
                    className="text-base font-bold text-slate-900 font-mono-tabular"
                  >
                    {summary.amountDueFormatted || summary.amountDueRaw || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span>{isUr ? 'آخری تاریخ:' : 'Due Date:'}</span>
                  <span dir="ltr" className="font-mono-tabular font-semibold text-slate-800">
                    {summary.dueDateRaw || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span>{isUr ? 'حوالہ نمبر:' : 'Ref No:'}</span>
                  <span
                    dir="ltr"
                    className="font-mono-tabular text-[11px] text-slate-700 truncate max-w-[160px]"
                  >
                    {summary.referenceNumber || '—'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                data-testid={`btn-view-recent-${idx}`}
                onClick={() => onSelectItem(item)}
                className={`mt-1 flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  isCurrent
                    ? 'bg-emerald-800 text-white hover:bg-emerald-900'
                    : 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>
                  {isCurrent
                    ? isUr
                      ? 'اس وقت کھلا ہے (Viewing)'
                      : 'Currently Viewing'
                    : isUr
                      ? 'یہ بل کھولیں (View Bill)'
                      : 'Switch to This Bill'}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Side-by-Side Comparison Matrix */}
      {showCompareTable && (
        <div
          data-testid="recent-comparison-table"
          className="rounded-xl border border-slate-200 bg-stone-50/50 p-4 space-y-3 overflow-x-auto"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900">
              {isUr
                ? 'بلوں کا آمنے سامنے موازنہ (Side-by-Side Comparison)'
                : 'Side-by-Side Bill Comparison Matrix'}
            </h3>

            {totalCombinedPkr !== null && (
              <div className="flex flex-wrap items-center gap-3 text-xs font-sans-ui">
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                  {isUr ? 'مجموعی واجب الادا رقم:' : 'Combined Total:'}{' '}
                  <strong className="font-mono-tabular text-slate-900">
                    Rs. {totalCombinedPkr.toLocaleString('en-US')}
                  </strong>
                </span>
                {spreadPkr !== null && (
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900">
                    {isUr ? 'رقوم میں فرق:' : 'Amount Difference:'}{' '}
                    <strong className="font-mono-tabular">
                      Rs. {spreadPkr.toLocaleString('en-US')}
                    </strong>
                  </span>
                )}
              </div>
            )}
          </div>

          <table className="w-full min-w-[540px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 text-start font-semibold">
                  {isUr ? 'تفصیل (Field)' : 'Metric / Field'}
                </th>
                {summaries.map(({ item, summary }, idx) => (
                  <th
                    key={item.id}
                    className="py-2.5 px-3 text-start font-bold text-slate-900"
                  >
                    #{idx + 1} · {summary.issuer.split('(')[0].trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              <tr>
                <td className="py-2.5 px-3 font-medium text-slate-700">
                  {isUr ? 'بل کا مہینہ (Billing Period)' : 'Billing Period'}
                </td>
                {summaries.map(({ item, summary }) => (
                  <td
                    key={item.id}
                    dir="ltr"
                    className="py-2.5 px-3 font-mono-tabular text-slate-900"
                  >
                    {summary.billingMonth || '—'}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-2.5 px-3 font-medium text-slate-700">
                  {isUr ? 'حوالہ نمبر (Reference No)' : 'Reference Number'}
                </td>
                {summaries.map(({ item, summary }) => (
                  <td
                    key={item.id}
                    dir="ltr"
                    className="py-2.5 px-3 font-mono-tabular text-slate-800"
                  >
                    {summary.referenceNumber || '—'}
                  </td>
                ))}
              </tr>

              <tr className="bg-emerald-50/40">
                <td className="py-2.5 px-3 font-bold text-slate-900">
                  {isUr ? 'مقررہ تاریخ تک رقم (Amount Due)' : 'Payable Within Due Date'}
                </td>
                {summaries.map(({ item, summary }) => (
                  <td
                    key={item.id}
                    dir="ltr"
                    className="py-2.5 px-3 font-mono-tabular font-bold text-emerald-950"
                  >
                    {summary.amountDueFormatted || summary.amountDueRaw || '—'}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-2.5 px-3 font-medium text-slate-700">
                  {isUr ? 'آخری تاریخ (Due Date)' : 'Due Date'}
                </td>
                {summaries.map(({ item, summary }) => (
                  <td
                    key={item.id}
                    dir="ltr"
                    className="py-2.5 px-3 font-mono-tabular text-slate-900"
                  >
                    {summary.dueDateRaw || '—'}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-2.5 px-3 font-medium text-slate-700">
                  {isUr ? 'تاریخ گزرنے کے بعد رقم (After Due Date)' : 'After Due Date'}
                </td>
                {summaries.map(({ item, summary }) => (
                  <td
                    key={item.id}
                    dir="ltr"
                    className="py-2.5 px-3 font-mono-tabular text-amber-900 font-semibold"
                  >
                    {summary.afterDueDateRaw || '—'}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-2.5 px-3 font-medium text-slate-700">
                  {isUr ? 'استعمال شدہ یونٹس (Units Consumed)' : 'Units Consumed'}
                </td>
                {summaries.map(({ item, summary }) => (
                  <td
                    key={item.id}
                    dir="ltr"
                    className="py-2.5 px-3 font-mono-tabular text-slate-800"
                  >
                    {summary.unitsConsumed || '—'}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-2.5 px-3 font-medium text-slate-700">
                  {isUr ? 'تجزیہ اعتماد (Confidence)' : 'Analysis Confidence'}
                </td>
                {summaries.map(({ item, summary }) => (
                  <td
                    key={item.id}
                    dir="ltr"
                    className="py-2.5 px-3 font-mono-tabular text-emerald-800 font-semibold"
                  >
                    {summary.confidencePercent}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
