import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectImageMimeFromBytes,
  validateImageUpload,
  validateBase64ImageServerSide,
  MAX_UPLOAD_BYTES,
} from './magicBytes';
import {
  validateModelOutput,
  computeDeterministicDeadline,
  parseDeterministicAmount,
  splitExplainerBlocks,
} from './schema';
import {
  upsertRecentAnalysisList,
  extractComparisonSummary,
  loadRecentAnalysesFromSession,
  saveRecentAnalysesToSession,
  clearRecentAnalysesFromSession,
  RecentAnalysisItem,
  StorageLike,
} from './recentHistory';
import { getSyntheticSampleFallbackResult } from './syntheticSampleBill';
import {
  detectSourceCurrency,
  convertCurrencyAmount,
  formatCurrencyValue,
} from './currencyConverter';

test('detectImageMimeFromBytes identifies genuine JPEG, PNG, and WebP magic bytes', () => {
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.equal(detectImageMimeFromBytes(jpegBytes), 'image/jpeg');

  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert.equal(detectImageMimeFromBytes(pngBytes), 'image/png');

  const webpBytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // size
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
  assert.equal(detectImageMimeFromBytes(webpBytes), 'image/webp');
});

test('validateImageUpload rejects spoofed SVG, PDF, oversized files, and oversized dimensions', () => {
  // Spoofed SVG renamed to bill.jpg
  const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const svgOutcome = validateImageUpload({ byteLength: svgBytes.byteLength, headerBytes: svgBytes });
  assert.equal(svgOutcome.valid, false);
  assert.equal(svgOutcome.errorCode, 'SVG_REJECTED');

  // Spoofed PDF renamed to bill.png
  const pdfBytes = new TextEncoder().encode('%PDF-1.7 fake content');
  const pdfOutcome = validateImageUpload({ byteLength: pdfBytes.byteLength, headerBytes: pdfBytes });
  assert.equal(pdfOutcome.valid, false);
  assert.equal(pdfOutcome.errorCode, 'PDF_REJECTED');

  // Spoofed text file renamed to bill.webp
  const txtBytes = new TextEncoder().encode('Hello world this is not an image at all');
  const txtOutcome = validateImageUpload({ byteLength: txtBytes.byteLength, headerBytes: txtBytes });
  assert.equal(txtOutcome.valid, false);
  assert.equal(txtOutcome.errorCode, 'INVALID_MAGIC_BYTES');

  // Oversized file (> 8 MB)
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const oversizeOutcome = validateImageUpload({
    byteLength: MAX_UPLOAD_BYTES + 1024,
    headerBytes: pngBytes,
  });
  assert.equal(oversizeOutcome.valid, false);
  assert.equal(oversizeOutcome.errorCode, 'FILE_TOO_LARGE');

  // Oversized dimensions (> 4000px)
  const dimOutcome = validateImageUpload({
    byteLength: 50000,
    headerBytes: pngBytes,
    width: 4500,
    height: 3000,
  });
  assert.equal(dimOutcome.valid, false);
  assert.equal(dimOutcome.errorCode, 'DIMENSIONS_TOO_LARGE');
});

test('validateBase64ImageServerSide validates genuine PNG base64 and rejects spoofed base64', () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const validRes = validateBase64ImageServerSide(pngBytes.toString('base64'));
  assert.equal(validRes.outcome.valid, true);
  assert.equal(validRes.outcome.detectedMime, 'image/png');

  const spoofSvgBase64 = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
  const invalidRes = validateBase64ImageServerSide(spoofSvgBase64);
  assert.equal(invalidRes.outcome.valid, false);
  assert.equal(invalidRes.outcome.errorCode, 'SVG_REJECTED');
  assert.equal(invalidRes.buffer, null);
});

test('validateModelOutput accepts valid ResultSchema and strictly rejects malformed or extra-property payloads', () => {
  const validPayload = {
    doc_type: 'utility_bill',
    doc_type_confidence: 0.96,
    issuer: 'LESCO (Lahore Electric Supply Company)',
    fields: [
      {
        key: 'reference_number',
        value: '24-11254-0981203 U',
        confidence: 0.98,
        region: { x: 8, y: 18, w: 38, h: 8 },
      },
      {
        key: 'amount_due',
        value: 'Rs. 14,850',
        confidence: 0.97,
      },
      {
        key: 'meter_serial',
        value: null,
        confidence: 0.2,
      },
    ],
    summary_ur: 'یہ لیسکو کا بجلی کا بل ہے۔ || اس میں واجب الادا رقم 14,850 روپے اور آخری تاریخ 28 اکتوبر 2026 ہے۔ || مقررہ تاریخ تک بل ادا کریں۔',
    summary_en: 'This is a LESCO electricity bill. || The amount payable within due date is Rs. 14,850 by 28 Oct 2026. || Pay before the deadline to avoid late surcharge.',
    actions: [
      {
        text_ur: '28 اکتوبر 2026 تک 14,850 روپے ادا کریں۔',
        text_en: 'Pay Rs. 14,850 on or before 28 Oct 2026.',
        deadline: '2026-10-28',
      },
    ],
    red_flags: [],
    injection_suspected: false,
    unreadable_parts: ['Meter reading date stamp is smudged'],
  };

  const parsed = validateModelOutput(JSON.stringify(validPayload));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data?.doc_type, 'utility_bill');
  assert.equal(parsed.data?.fields[2].value, null);

  // Reject unknown extra properties (strictObject)
  const withExtraProp = { ...validPayload, evil_script: '<script>alert(1)</script>' };
  const rejectedExtra = validateModelOutput(withExtraProp);
  assert.equal(rejectedExtra.ok, false);

  // Reject out-of-range confidence
  const invalidConfidence = { ...validPayload, doc_type_confidence: 1.5 };
  assert.equal(validateModelOutput(invalidConfidence).ok, false);
});

test('computeDeterministicDeadline and parseDeterministicAmount compute dates and PKR numbers in code', () => {
  const refNow = new Date(2026, 9, 25); // 25 Oct 2026
  const dueSoon = computeDeterministicDeadline('28 Oct 2026', refNow);
  assert.equal(dueSoon.parsedIsoDate, '2026-10-28');
  assert.equal(dueSoon.daysRemaining, 3);
  assert.equal(dueSoon.status, 'due_soon');

  const overdue = computeDeterministicDeadline('2026-10-20', refNow);
  assert.equal(overdue.daysRemaining, -5);
  assert.equal(overdue.status, 'overdue');

  const amt = parseDeterministicAmount('PKR 14,850.00');
  assert.equal(amt.numericAmount, 14850);
  assert.equal(amt.formattedPkr, 'Rs. 14,850');

  const urduDigitsAmt = parseDeterministicAmount('۱۴,۸۵۰ روپے');
  assert.equal(urduDigitsAmt.numericAmount, 14850);

  const blocks = splitExplainerBlocks('یہ بجلی کا بل ہے۔ || واجب الادا رقم 14850 ہے۔ || وقت پر جمع کروائیں۔');
  assert.equal(blocks.whatThisIs, 'یہ بجلی کا بل ہے۔');
  assert.equal(blocks.whatItSays, 'واجب الادا رقم 14850 ہے۔');
  assert.equal(blocks.whatItMeans, 'وقت پر جمع کروائیں۔');
});

test('Recent Analysis sessionStorage helpers cap at 3 items, deduplicate bills, and support Clear History', () => {
  const memoryMap = new Map<string, string>();
  const mockSessionStorage: StorageLike = {
    getItem: (key) => memoryMap.get(key) ?? null,
    setItem: (key, val) => {
      memoryMap.set(key, val);
    },
    removeItem: (key) => {
      memoryMap.delete(key);
    },
  };

  const makeItem = (id: string, refNo: string, amount: string): RecentAnalysisItem => {
    const baseResult = getSyntheticSampleFallbackResult('lesco_electricity');
    return {
      id,
      analyzedAtIso: '2026-10-26T08:00:00.000Z',
      result: {
        ...baseResult,
        fields: baseResult.fields.map((f) => {
          if (f.key === 'reference_number') return { ...f, value: refNo };
          if (f.key === 'amount_due') return { ...f, value: amount };
          return f;
        }),
      },
      meta: {
        stage: 1,
        stage1Supported: true,
        detectedMime: 'image/png',
        sanitizedBytes: 12000,
        modelUsed: 'gemini:gemini-3.8-flash',
        zeroRetentionConfirmed: true,
      },
    };
  };

  let list: RecentAnalysisItem[] = [];
  list = upsertRecentAnalysisList(list, makeItem('b1', 'REF-001', 'Rs. 5,000'));
  list = upsertRecentAnalysisList(list, makeItem('b2', 'REF-002', 'Rs. 8,150'));
  list = upsertRecentAnalysisList(list, makeItem('b3', 'REF-003', 'Rs. 14,850'));
  list = upsertRecentAnalysisList(list, makeItem('b4', 'REF-004', 'Rs. 21,200'));

  assert.equal(list.length, 3);
  assert.deepEqual(
    list.map((i) => i.id),
    ['b4', 'b3', 'b2']
  );

  saveRecentAnalysesToSession(list, mockSessionStorage);
  const loaded = loadRecentAnalysesFromSession(mockSessionStorage);
  assert.equal(loaded.length, 3);

  const summary0 = extractComparisonSummary(loaded[0]);
  assert.equal(summary0.referenceNumber, 'REF-004');
  assert.equal(summary0.amountDueNumeric, 21200);
  assert.equal(summary0.billingMonth, 'October 2026');

  clearRecentAnalysesFromSession(mockSessionStorage);
  assert.equal(loadRecentAnalysesFromSession(mockSessionStorage).length, 0);
});

test('convertCurrencyAmount deterministically converts bill amounts across PKR, USD, AED, SAR, GBP and supports custom rates', () => {
  assert.equal(detectSourceCurrency('Rs. 14,850'), 'PKR');
  assert.equal(detectSourceCurrency('$125.00'), 'USD');
  assert.equal(detectSourceCurrency('AED 450.50'), 'AED');

  // Convert Rs. 14,850 to USD at default rate (278.50 PKR/USD -> $53.32)
  const usdRes = convertCurrencyAmount({
    numericAmount: 14850,
    fromCurrency: 'PKR',
    toCurrency: 'USD',
  });
  assert.equal(usdRes.isConverted, true);
  assert.equal(usdRes.convertedNumeric, 53.32);
  assert.equal(usdRes.formattedConverted, '$53.32');

  // Custom rate override: 1 USD = 300 PKR -> Rs. 15,000 = $50.00
  const customRes = convertCurrencyAmount({
    numericAmount: 15000,
    fromCurrency: 'PKR',
    toCurrency: 'USD',
    customPkrPerTargetUnit: 300,
  });
  assert.equal(customRes.convertedNumeric, 50);
  assert.equal(customRes.formattedConverted, '$50.00');
  assert.equal(formatCurrencyValue(8150, 'PKR'), 'Rs. 8,150');
});


