import { DocumentAnalysisResult } from './schema';

export type SampleBillId = 'lesco_electricity' | 'sngpl_gas';

/**
 * Generates a realistic synthetic Pakistani utility bill (LESCO Electricity or SNGPL Gas)
 * on an HTML5 Canvas and returns a genuine PNG File so it passes through the exact same
 * client magic-byte check, EXIF-stripping re-encode, and server validation pipeline.
 */
export async function createSyntheticSampleBillFile(
  sampleId: SampleBillId = 'lesco_electricity'
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  const isGas = sampleId === 'sngpl_gas';

  // Paper background
  ctx.fillStyle = '#FCFBF7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer border
  ctx.strokeStyle = isGas ? '#1E3A8A' : '#065F46';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

  // Top Header Band
  ctx.fillStyle = isGas ? '#1E3A8A' : '#065F46';
  ctx.fillRect(28, 28, canvas.width - 56, 130);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 26px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    isGas
      ? 'SNGPL — SUI NORTHERN GAS PIPELINES LTD'
      : 'LESCO — LAHORE ELECTRIC SUPPLY COMPANY',
    56,
    74
  );

  ctx.font = '600 17px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillStyle = '#D1FAE5';
  ctx.fillText(
    isGas
      ? 'NATURAL GAS CONSUMER BILL (SYNTHETIC TEST SAMPLE)'
      : 'ELECTRICITY CONSUMER BILL (SYNTHETIC TEST SAMPLE)',
    56,
    122
  );

  ctx.font = 'bold 22px "Noto Naskh Arabic", "Noto Nastaliq Urdu", serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'right';
  ctx.fillText(
    isGas ? 'سوئی ناردرن گیس — گیس کا بل' : 'لاہور الیکٹرک سپلائی کمپنی — بجلی کا بل',
    canvas.width - 56,
    122
  );

  // Reset alignment
  ctx.textAlign = 'left';

  // Section 1: Reference & Consumer Metadata Row (Region y: 14% - 26%)
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 180, canvas.width - 96, 130);

  // Vertical dividers
  ctx.beginPath();
  ctx.moveTo(410, 180);
  ctx.lineTo(410, 310);
  ctx.moveTo(700, 180);
  ctx.lineTo(700, 310);
  ctx.stroke();

  // Reference Number Box
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 15px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText('REFERENCE NO / حوالہ نمبر', 66, 212);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  ctx.fillText(isGas ? '5498-2210-8831-4' : '24-11254-0981203 U', 66, 255);
  ctx.fillStyle = '#64748B';
  ctx.font = '15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Sub-Division: Gulberg-II Lahore', 66, 288);

  // Billing Month Box
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 15px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText('BILLING MONTH / بل کا مہینہ', 430, 212);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('OCTOBER 2026', 430, 255);
  ctx.fillStyle = '#065F46';
  ctx.font = '16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Reading Date: 12 Oct 2026', 430, 288);

  // Issue Date & Tariff Box
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 15px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText('ISSUE DATE / تاریخ اجرا', 720, 212);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText('14 Oct 2026', 720, 255);
  ctx.fillStyle = '#64748B';
  ctx.font = '15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(isGas ? 'Tariff: Domestic Gas D-1' : 'Tariff: A-1a(01) Residential', 720, 288);

  // Section 2: Consumer Details & Meter Details (Region y: 27% - 45%)
  ctx.strokeRect(48, 335, canvas.width - 96, 195);
  ctx.beginPath();
  ctx.moveTo(520, 335);
  ctx.lineTo(520, 530);
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('CONSUMER NAME & ADDRESS (SYNTHETIC)', 66, 368);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('MUHAMMAD ARHAM KHAN (TEST)', 66, 406);
  ctx.font = '18px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('House 42-B, Street 7, Gulberg II, Lahore', 66, 440);
  ctx.fillText('Consumer ID: 1098452100', 66, 475);
  ctx.fillStyle = '#065F46';
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Status: Regular Active Connection', 66, 508);

  // Right column: Consumption
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 15px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText('CONSUMPTION SUMMARY / استعمال شدہ یونٹس', 544, 368);
  ctx.fillStyle = '#0F172A';
  ctx.font = '18px "JetBrains Mono", monospace';
  ctx.fillText(isGas ? 'Previous Reading: 1,410 HM3' : 'Previous Reading: 14,210 kWh', 544, 408);
  ctx.fillText(isGas ? 'Present Reading:  1,495 HM3' : 'Present Reading:  14,552 kWh', 544, 440);
  ctx.fillStyle = '#065F46';
  ctx.font = 'bold 24px "JetBrains Mono", monospace';
  ctx.fillText(isGas ? 'Units Billed: 85 HM3 (2.41 MMBTU)' : 'Units Consumed: 342 kWh', 544, 485);

  // Section 3: Charges Breakdown & Payment Summary Box (Region y: 45% - 75%)
  ctx.strokeRect(48, 555, 472, 340);

  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(50, 557, 468, 44);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 17px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText('BILL CHARGES BREAKDOWN / بل کی تفصیل', 66, 585);

  const charges = isGas
    ? [
        ['Gas Charges', 'Rs. 6,420'],
        ['Meter Rent & Service', 'Rs. 120'],
        ['GST (18%)', 'Rs. 1,177'],
        ['Fuel / QTA Adjustment', 'Rs. 433'],
        ['Arrears / بقایا جات', 'Rs. 0'],
      ]
    : [
        ['Cost of Electricity (342 Units)', 'Rs. 10,944'],
        ['FPA (Fuel Price Adjustment)', 'Rs. 1,180'],
        ['Electricity Duty & TV Fee', 'Rs. 235'],
        ['GST / Sales Tax', 'Rs. 2,491'],
        ['Arrears / بقایا جات', 'Rs. 0'],
      ];

  ctx.font = '18px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  charges.forEach(([label, val], idx) => {
    const y = 640 + idx * 48;
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText(label, 66, y);
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val, 495, y);
    ctx.font = '18px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  });
  ctx.textAlign = 'left';

  // Prominent Due Date & Amount Due Box on Right (x: 54%, y: 43%, w: 41%, h: 27%)
  ctx.fillStyle = '#ECFDF5';
  ctx.fillRect(544, 555, 408, 210);
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 3;
  ctx.strokeRect(544, 555, 408, 210);

  ctx.fillStyle = '#065F46';
  ctx.font = 'bold 16px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText('PAYABLE WITHIN DUE DATE / مقررہ تاریخ تک بل', 566, 592);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 44px "JetBrains Mono", monospace';
  ctx.fillText(isGas ? 'Rs. 8,150' : 'Rs. 14,850', 566, 650);

  ctx.fillStyle = '#047857';
  ctx.font = 'bold 18px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText('DUE DATE / آخری تاریخ:', 566, 700);
  ctx.fillStyle = '#B91C1C';
  ctx.font = 'bold 28px "JetBrains Mono", monospace';
  ctx.fillText('28 Oct 2026', 566, 738);

  // Payable After Due Date Box
  ctx.fillStyle = '#FEF2F2';
  ctx.fillRect(544, 780, 408, 115);
  ctx.strokeStyle = '#DC2626';
  ctx.lineWidth = 2;
  ctx.strokeRect(544, 780, 408, 115);

  ctx.fillStyle = '#991B1B';
  ctx.font = 'bold 16px "Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  ctx.fillText('PAYABLE AFTER DUE DATE / مقررہ تاریخ کے بعد', 566, 814);
  ctx.fillStyle = '#7F1D1D';
  ctx.font = 'bold 30px "JetBrains Mono", monospace';
  ctx.fillText(isGas ? 'Rs. 8,965 (incl. Rs. 815 LPS)' : 'Rs. 16,120 (incl. Rs. 1,270 LPS)', 566, 862);

  // Payment Channels Box
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 920, canvas.width - 96, 145);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('OFFICIAL PAYMENT INSTRUCTIONS / بل جمع کروانے کا طریقہ:', 66, 956);
  ctx.font = '17px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(
    'Pay via 1LINK Bill Payment using your 14-digit Reference Number at any scheduled bank,',
    66,
    990
  );
  ctx.fillText(
    'RAAST, JazzCash, Easypaisa, or Post Office before 28 Oct 2026 to avoid late surcharge.',
    66,
    1020
  );
  ctx.fillStyle = '#065F46';
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Official Helpline: 118 (LESCO) / 1199 (SNGPL) — Never share OTP or PIN with anyone.', 66, 1050);

  // Deliberately smudged/illegible stamp area at bottom to test Honesty Rule (unreadable -> null + low confidence)
  ctx.strokeStyle = '#94A3B8';
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(48, 1090, canvas.width - 96, 125);
  ctx.setLineDash([]);
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('BATCH INSPECTOR STAMP & OLD METER SERIAL (FADED THERMAL PRINT):', 66, 1122);

  // Draw smudged/blurred lines simulating unreadable ink stamp
  ctx.save();
  ctx.fillStyle = '#CBD5E1';
  for (let i = 0; i < 18; i++) {
    ctx.fillRect(66 + i * 24, 1142 + (i % 3) * 4, 18, 22);
  }
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'italic 16px monospace';
  ctx.fillText('### [SMUDGED INK — UNREADABLE METER INSPECTOR CODE] ###', 66, 1195);
  ctx.restore();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to create sample PNG'))), 'image/png');
  });

  return new File(
    [blob],
    isGas ? 'synthetic-sngpl-gas-bill-oct2026.png' : 'synthetic-lesco-electricity-bill-oct2026.png',
    { type: 'image/png' }
  );
}

/**
 * Deterministic Zod-validated sample result for the synthetic bills.
 * Used as fallback if the server environment has no active paid API key configured,
 * ensuring the Stage 1 walking skeleton is always 100% testable while preserving strict Zod validation.
 */
export function getSyntheticSampleFallbackResult(
  sampleId: SampleBillId = 'lesco_electricity'
): DocumentAnalysisResult {
  if (sampleId === 'sngpl_gas') {
    return {
      doc_type: 'utility_bill',
      doc_type_confidence: 0.98,
      issuer: 'SNGPL (Sui Northern Gas Pipelines Limited)',
      fields: [
        {
          key: 'issuer',
          value: 'SNGPL (Sui Northern Gas Pipelines Limited)',
          confidence: 0.99,
          region: { x: 4, y: 3, w: 92, h: 10 },
        },
        {
          key: 'reference_number',
          value: '5498-2210-8831-4',
          confidence: 0.98,
          region: { x: 5, y: 14, w: 36, h: 10 },
        },
        {
          key: 'billing_period',
          value: 'October 2026',
          confidence: 0.98,
          region: { x: 41, y: 14, w: 28, h: 10 },
        },
        {
          key: 'amount_due',
          value: 'Rs. 8,150',
          confidence: 0.99,
          region: { x: 54, y: 43, w: 41, h: 16 },
        },
        {
          key: 'due_date',
          value: '28 Oct 2026',
          confidence: 0.99,
          region: { x: 54, y: 52, w: 41, h: 8 },
        },
        {
          key: 'amount_after_due_date',
          value: 'Rs. 8,965',
          confidence: 0.96,
          region: { x: 54, y: 61, w: 41, h: 9 },
        },
        {
          key: 'units_consumed',
          value: '85 HM3 (2.41 MMBTU)',
          confidence: 0.95,
          region: { x: 52, y: 26, w: 43, h: 15 },
        },
        {
          key: 'inspector_stamp_code',
          value: null,
          confidence: 0.12,
          region: { x: 5, y: 85, w: 90, h: 10 },
        },
      ],
      summary_ur:
        'یہ سوئی ناردرن گیس (SNGPL) کا اکتوبر 2026 کا ماہانہ گیس بل ہے۔ || اس بل کے مطابق مقررہ تاریخ 28 اکتوبر 2026 تک واجب الادا رقم 8,150 روپے ہے، جبکہ تاریخ گزرنے کے بعد لیٹ سرچارج سمیت 8,965 روپے دینے ہوں گے۔ || اضافی جرمانے (815 روپے) سے بچنے کے لیے 28 اکتوبر 2026 سے پہلے اپنے 1LINK بینک، جیز کیش، ایزی پیسہ یا قریبی بینک برانچ میں حوالہ نمبر 5498-2210-8831-4 پر بل جمع کروائیں۔',
      summary_en:
        'This is a monthly natural gas utility bill issued by SNGPL (Sui Northern Gas Pipelines Ltd) for October 2026. || The amount payable within the due date is Rs. 8,150 by 28 Oct 2026, increasing to Rs. 8,965 after the deadline due to a Rs. 815 late payment surcharge. || Pay Rs. 8,150 on or before 28 Oct 2026 using Reference No. 5498-2210-8831-4 via any 1LINK bank app, RAAST, or authorized counter, and verify the figures against the original bill image.',
      actions: [
        {
          text_ur: 'بل کی تصویر پر اپنا حوالہ نمبر (5498-2210-8831-4) اور رقم (8,150 روپے) خود چیک کریں۔',
          text_en: 'Verify Reference No. 5498-2210-8831-4 and amount Rs. 8,150 directly against the bill image.',
          deadline: '2026-10-28',
        },
        {
          text_ur: '28 اکتوبر 2026 تک بینک ایپ (1LINK)، جیز کیش، ایزی پیسہ یا بینک کاؤنٹر کے ذریعے 8,150 روپے ادا کریں۔',
          text_en: 'Pay Rs. 8,150 by 28 Oct 2026 via 1LINK bank bill payment, JazzCash, Easypaisa, or bank branch.',
          deadline: '2026-10-28',
        },
      ],
      red_flags: [],
      injection_suspected: false,
      unreadable_parts: [
        'نچلے حصے میں بیچ انسپکٹر اسٹیمپ اور پرانا میٹر سیریل نمبر مدھم ہونے کی وجہ سے پڑھا نہیں جا سکا (Batch inspector stamp & old meter serial smudged)',
      ],
    };
  }

  return {
    doc_type: 'utility_bill',
    doc_type_confidence: 0.98,
    issuer: 'LESCO (Lahore Electric Supply Company)',
    fields: [
      {
        key: 'issuer',
        value: 'LESCO (Lahore Electric Supply Company)',
        confidence: 0.99,
        region: { x: 4, y: 3, w: 92, h: 10 },
      },
      {
        key: 'reference_number',
        value: '24-11254-0981203 U',
        confidence: 0.99,
        region: { x: 5, y: 14, w: 36, h: 10 },
      },
      {
        key: 'billing_period',
        value: 'October 2026',
        confidence: 0.98,
        region: { x: 41, y: 14, w: 28, h: 10 },
      },
      {
        key: 'amount_due',
        value: 'Rs. 14,850',
        confidence: 0.99,
        region: { x: 54, y: 43, w: 41, h: 16 },
      },
      {
        key: 'due_date',
        value: '28 Oct 2026',
        confidence: 0.99,
        region: { x: 54, y: 52, w: 41, h: 8 },
      },
      {
        key: 'amount_after_due_date',
        value: 'Rs. 16,120',
        confidence: 0.97,
        region: { x: 54, y: 61, w: 41, h: 9 },
      },
      {
        key: 'units_consumed',
        value: '342 kWh',
        confidence: 0.97,
        region: { x: 52, y: 26, w: 43, h: 15 },
      },
      {
        key: 'inspector_stamp_code',
        value: null,
        confidence: 0.14,
        region: { x: 5, y: 85, w: 90, h: 10 },
      },
    ],
    summary_ur:
      'یہ لاہور الیکٹرک سپلائی کمپنی (LESCO) کا اکتوبر 2026 کا بجلی کا بل ہے۔ || اس بل میں 342 یونٹس استعمال ہوئے ہیں، مقررہ تاریخ 28 اکتوبر 2026 تک واجب الادا رقم 14,850 روپے ہے اور تاریخ گزرنے کے بعد 16,120 روپے ہو جائے گی۔ || لیٹ فیس (1,270 روپے) سے بچنے کے لیے 28 اکتوبر 2026 سے پہلے اپنے 14 ہندسوں کے حوالہ نمبر (24-11254-0981203 U) کے ذریعے منظور شدہ بینک، راست یا بل پیمنٹ ایپ سے ادائیگی کریں۔',
    summary_en:
      'This is a residential electricity bill from LESCO (Lahore Electric Supply Company) for October 2026. || It bills 342 kWh of electricity with Rs. 14,850 due on or before 28 Oct 2026, increasing to Rs. 16,120 after the deadline (Rs. 1,270 late surcharge). || Pay Rs. 14,850 before 28 Oct 2026 using Reference No. 24-11254-0981203 U via an official 1LINK bank channel, and always cross-check numbers against the original image.',
    actions: [
      {
        text_ur: 'ساتھ دی گئی اصلی بل کی تصویر سے اپنا حوالہ نمبر (24-11254-0981203 U) اور رقم (14,850 روپے) ملا کر تصدیق کریں۔',
        text_en: 'Cross-check Reference No. 24-11254-0981203 U and amount Rs. 14,850 against the original bill image.',
        deadline: '2026-10-28',
      },
      {
        text_ur: '28 اکتوبر 2026 تک کسی بھی شیڈولڈ بینک، 1LINK، جیز کیش یا ایزی پیسہ کے ذریعے 14,850 روپے جمع کروائیں۔',
        text_en: 'Pay Rs. 14,850 on or before 28 Oct 2026 via any scheduled bank, 1LINK bill payment, JazzCash, or Easypaisa.',
        deadline: '2026-10-28',
      },
    ],
    red_flags: [],
    injection_suspected: false,
    unreadable_parts: [
      'بل کے نچلے حصے میں انسپکٹر اسٹیمپ اور پرانا میٹر سیریل نمبر سیاہی پھیلنے کی وجہ سے ناقابلِ فہم ہے (Batch inspector stamp & old meter serial code smudged)',
    ],
  };
}
