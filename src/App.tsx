import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  FileText,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  XCircle,
  Cpu,
  ChevronDown,
  ChevronUp,
  Terminal,
} from 'lucide-react';
import { validateAndStripExifOnClient, SanitizedImagePayload } from './lib/imageSanitizer';
import { DocumentAnalysisResult } from './lib/schema';
import { createSyntheticSampleBillFile, SampleBillId } from './lib/syntheticSampleBill';
import {
  RecentAnalysisItem,
  loadRecentAnalysesFromSession,
  saveRecentAnalysesToSession,
  clearRecentAnalysesFromSession,
  upsertRecentAnalysisList,
} from './lib/recentHistory';
import { CameraModal } from './components/CameraModal';
import { ResultCard } from './components/ResultCard';
import { RecentAnalysisView } from './components/RecentAnalysisView';

interface AnalysisMeta {
  stage: number;
  stage1Supported: boolean;
  detectedMime: string;
  sanitizedBytes: number;
  modelUsed: string;
  zeroRetentionConfirmed: boolean;
}

type ProviderId = 'gemini' | 'groq' | 'custom';

interface ModelPreset {
  id: string;
  provider: ProviderId;
  modelId: string;
  labelUr: string;
  labelEn: string;
  envVarName: string;
}

const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'gemini-flash',
    provider: 'gemini',
    modelId: 'gemini-3.8-flash',
    labelUr: 'Google Gemini 3.8 Flash (تیز رفتار — ڈیفالٹ)',
    labelEn: 'Google Gemini 3.8 Flash (Fast Default)',
    envVarName: 'GEMINI_API_KEY',
  },
  {
    id: 'gemini-argon',
    provider: 'gemini',
    modelId: 'gemini-4-argon',
    labelUr: 'Google Gemini 4 Argon (گہرا تجزیہ)',
    labelEn: 'Google Gemini 4 Argon (Deep Reasoning)',
    envVarName: 'GEMINI_API_KEY',
  },
  {
    id: 'groq-llama4-scout',
    provider: 'groq',
    modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
    labelUr: 'Groq — Llama 4 Scout Vision (gsk_... کلید)',
    labelEn: 'Groq — Llama 4 Scout 17B Vision (gsk_...)',
    envVarName: 'GROQ_API_KEY',
  },
  {
    id: 'groq-llama4-maverick',
    provider: 'groq',
    modelId: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    labelUr: 'Groq — Llama 4 Maverick Vision (gsk_... کلید)',
    labelEn: 'Groq — Llama 4 Maverick 17B Vision (gsk_...)',
    envVarName: 'GROQ_API_KEY',
  },
  {
    id: 'custom-openai',
    provider: 'custom',
    modelId: 'gpt-4o-mini',
    labelUr: 'OpenAI / Custom Vision Model (کسٹم ماڈل)',
    labelEn: 'OpenAI / Custom Vision Endpoint (gpt-4o-mini)',
    envVarName: 'CUSTOM_LLM_API_KEY',
  },
];

interface HealthProvidersState {
  gemini?: { configured: boolean; defaultModel: string; envVar: string };
  groq?: { configured: boolean; defaultModel: string; envVar: string };
  custom?: { configured: boolean; defaultModel: string; baseUrl: string; envVar: string };
}

type PipelineStep =
  | 'idle'
  | 'checking_magic_bytes'
  | 'stripping_exif'
  | 'analyzing_server'
  | 'done'
  | 'error';

export default function App() {
  const [lang, setLang] = useState<'ur' | 'en'>('ur');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('gemini-flash');
  const [customModelId, setCustomModelId] = useState<string>('');
  const [showKeySetupGuide, setShowKeySetupGuide] = useState<boolean>(false);
  const [healthProviders, setHealthProviders] = useState<HealthProvidersState | null>(null);

  const [pipelineStep, setPipelineStep] = useState<PipelineStep>('idle');
  const [errorState, setErrorState] = useState<{
    code: string;
    messageUr: string;
    messageEn: string;
  } | null>(null);
  const [sanitizedImage, setSanitizedImage] = useState<SanitizedImagePayload | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DocumentAnalysisResult | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<AnalysisMeta | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysisItem[]>(() =>
    loadRecentAnalysesFromSession()
  );
  const [activeRecentId, setActiveRecentId] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isUr = lang === 'ur';

  const activePreset =
    MODEL_PRESETS.find((p) => p.id === selectedPresetId) || MODEL_PRESETS[0];
  const effectiveModelId = customModelId.trim() || activePreset.modelId;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data?.providers) {
          setHealthProviders(data.providers as HealthProvidersState);
        }
      })
      .catch(() => {
        // Ignore initial health check error
      });
  }, []);

  const toggleLanguage = () => {
    setLang((prev) => (prev === 'ur' ? 'en' : 'ur'));
  };

  const resetWorkspace = () => {
    setPipelineStep('idle');
    setErrorState(null);
    setSanitizedImage(null);
    setAnalysisResult(null);
    setAnalysisMeta(null);
    setActiveRecentId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectRecentItem = (item: RecentAnalysisItem) => {
    const fallbackDataUrl =
      item.imagePreviewDataUrl ||
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const base64Data = fallbackDataUrl.includes(',')
      ? fallbackDataUrl.split(',')[1]
      : fallbackDataUrl;

    setErrorState(null);
    setAnalysisResult(item.result);
    setAnalysisMeta(item.meta);
    setSanitizedImage({
      base64Data,
      previewDataUrl: fallbackDataUrl,
      mimeType: 'image/jpeg',
      width: item.imageWidth || 1000,
      height: item.imageHeight || 1280,
      originalByteLength: item.meta.sanitizedBytes,
      sanitizedByteLength: item.meta.sanitizedBytes,
    });
    setActiveRecentId(item.id);
    setPipelineStep('done');
  };

  const handleClearRecentHistory = () => {
    clearRecentAnalysesFromSession();
    setRecentAnalyses([]);
    setActiveRecentId(null);
  };

  const processBillFile = async (file: File, sampleId?: SampleBillId) => {
    setErrorState(null);
    setAnalysisResult(null);
    setAnalysisMeta(null);
    setPipelineStep('checking_magic_bytes');

    // Step 1 & 2: Client magic-byte verification + Canvas EXIF stripping
    setPipelineStep('stripping_exif');
    const sanitizeRes = await validateAndStripExifOnClient(file);

    if (!sanitizeRes.ok || !sanitizeRes.payload) {
      setPipelineStep('error');
      setErrorState({
        code: sanitizeRes.validation.errorCode || 'VALIDATION_FAILED',
        messageUr:
          sanitizeRes.validation.errorUr ||
          'فائل سیکیورٹی چیک میں ناکام رہی۔ صرف اصلی JPEG، PNG یا WebP تصویر اپ لوڈ کریں۔',
        messageEn:
          sanitizeRes.validation.errorEn ||
          'File failed client security validation. Only genuine JPEG, PNG, or WebP images are accepted.',
      });
      return;
    }

    setSanitizedImage(sanitizeRes.payload);
    setPipelineStep('analyzing_server');

    // Step 3: Send EXIF-stripped image to server route /api/analyze with selected provider & modelId
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: sanitizeRes.payload.base64Data,
          sampleId,
          provider: activePreset.provider,
          modelId: effectiveModelId,
        }),
      });

      const body = await response.json();

      if (!response.ok || !body.ok || !body.result) {
        setPipelineStep('error');
        setErrorState({
          code: body.errorCode || `HTTP_${response.status}`,
          messageUr:
            body.errorUr ||
            'سرور پر بل کے تجزیے کے دوران خرابی پیش آئی۔ براہِ کرم دوبارہ کوشش کریں۔',
          messageEn:
            body.errorEn ||
            'Server validation or model analysis failed. Please try again.',
        });
        return;
      }

      const validatedResult = body.result as DocumentAnalysisResult;
      const validatedMeta = body.meta as AnalysisMeta;

      const newRecentItem: RecentAnalysisItem = {
        id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        analyzedAtIso: new Date().toISOString(),
        result: validatedResult,
        meta: validatedMeta,
        imagePreviewDataUrl: sanitizeRes.payload.previewDataUrl,
        imageWidth: sanitizeRes.payload.width,
        imageHeight: sanitizeRes.payload.height,
      };

      setRecentAnalyses((prev) => {
        const updated = upsertRecentAnalysisList(prev, newRecentItem);
        saveRecentAnalysesToSession(updated);
        return updated;
      });
      setActiveRecentId(newRecentItem.id);
      setAnalysisResult(validatedResult);
      setAnalysisMeta(validatedMeta);
      setPipelineStep('done');
    } catch {
      setPipelineStep('error');
      setErrorState({
        code: 'NETWORK_ERROR',
        messageUr: 'سرور سے رابطہ ممکن نہیں ہو سکا۔ اپنا انٹرنیٹ کنکشن چیک کریں۔',
        messageEn: 'Could not reach the analysis server. Please check your connection.',
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processBillFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processBillFile(file);
    }
  };

  const handleLoadSampleBill = async (sampleId: SampleBillId) => {
    try {
      const sampleFile = await createSyntheticSampleBillFile(sampleId);
      await processBillFile(sampleFile, sampleId);
    } catch {
      setPipelineStep('error');
      setErrorState({
        code: 'SAMPLE_GENERATION_FAILED',
        messageUr: 'نمونہ بل تیار کرنے میں خرابی پیش آئی۔',
        messageEn: 'Failed to generate synthetic sample bill.',
      });
    }
  };

  const handleTestSpoofedSvgRejection = async () => {
    const maliciousSvgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"><text>Fake Bill</text></svg>';
    const spoofedFile = new File([maliciousSvgContent], 'spoofed-utility-bill.jpg', {
      type: 'image/jpeg',
    });
    await processBillFile(spoofedFile);
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-slate-900">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              resetWorkspace();
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {isUr ? 'سمجھ · Samajh' : 'Samajh · سمجھ'}
          </a>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label={isUr ? 'مرکزی نیویگیشن' : 'Main Navigation'}
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <a
              href="#upload-workspace"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              {isUr ? 'بل اپ لوڈ' : 'Scan Bill'}
            </a>
            <a
              href="#model-router"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              {isUr ? 'ماڈل اور انجن' : 'Model Engine'}
            </a>
            <a
              href="#sample-bills"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              {isUr ? 'نمونہ بل' : 'Sample Bills'}
            </a>
            <a
              href="#security-principles"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              {isUr ? 'پرائیویسی اصول' : 'Privacy & Security'}
            </a>
          </nav>

          {/* Zone 3: 1 primary action (Urdu / English Language Toggle) */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={
                isUr ? 'Switch language to English' : 'زبان اردو میں تبدیل کریں'
              }
              className="min-h-[40px] rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 font-sans-ui"
            >
              {isUr ? 'English (انگریزی)' : 'اردو (Urdu)'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main id="top" className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-8 space-y-8">
        {/* Hero & Mission Header */}
        <section className="space-y-3 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-sans-ui">
            <span>{isUr ? 'اردو اول (Urdu-First)' : 'Urdu-First'}</span>
            <span aria-hidden="true">·</span>
            <span>{isUr ? 'پرائیویسی اول (Zero Storage)' : 'Privacy by Default'}</span>
            <span aria-hidden="true">·</span>
            <span>{isUr ? 'مرحلہ 1: بجلی اور گیس کے بل' : 'Stage 1: Electricity & Gas Bills'}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            {isUr
              ? 'اپنے بجلی یا گیس کے بل کی تصویر اپ لوڈ کریں اور آسان اردو میں سمجھیں'
              : 'Understand your electricity or gas bill in plain Urdu and English'}
          </h1>

          <p className="text-sm sm:text-base text-slate-700">
            {isUr
              ? 'سمجھ (Samajh) آپ کے بل سے واجب الادا رقم، آخری تاریخ اور ضروری اقدامات نکال کر آسان زبان میں بتاتا ہے۔ آپ کی تصویر سے لوکیشن (EXIF) آپ کے فون پر ہی ہٹا دی جاتی ہے اور کوئی دستاویز کبھی محفوظ نہیں کی جاتی۔'
              : 'Samajh extracts the amount due, deadline, reference number, and next steps from your utility bill. EXIF location data is stripped on your device before upload, and no documents are ever stored or logged.'}
          </p>
        </section>

        {/* Multi-Provider AI Model Selector & Server Key Setup Guide */}
        <section
          id="model-router"
          aria-label={isUr ? 'ماڈل پرووائیڈر اور سرور کنفیگریشن' : 'AI Model Provider & Server Configuration'}
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  {isUr
                    ? 'اے آئی ماڈل اور پرووائیڈر منتخب کریں (Gemini / Groq / OpenAI Vision)'
                    : 'Select Vision Model Provider (Gemini / Groq / Custom OpenAI)'}
                </h2>
                <p className="text-xs text-slate-600">
                  {isUr
                    ? 'سیکیورٹی اصول نمبر 4 کے مطابق تمام API کلیدیں صرف سرور (.env یا Settings > Secrets) پر محفوظ رہتی ہیں—براؤزر میں کبھی نہیں۔'
                    : 'Per Security Rule 4, API keys live strictly on the server (.env or AI Studio Secrets) and never enter the browser bundle.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="model-preset-select"
                  className="text-xs font-semibold text-slate-700 whitespace-nowrap"
                >
                  {isUr ? 'ماڈل:' : 'Provider & Model:'}
                </label>
                <select
                  id="model-preset-select"
                  value={selectedPresetId}
                  onChange={(e) => {
                    setSelectedPresetId(e.target.value);
                    setCustomModelId('');
                  }}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-emerald-700 focus:outline-none font-sans-ui"
                >
                  {MODEL_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {isUr ? preset.labelUr : preset.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="custom-model-id-input"
                  className="sr-only"
                >
                  {isUr ? 'کسٹم ماڈل آئی ڈی' : 'Custom Model ID Override'}
                </label>
                <input
                  id="custom-model-id-input"
                  type="text"
                  value={customModelId}
                  onChange={(e) => setCustomModelId(e.target.value)}
                  placeholder={
                    isUr
                      ? `ماڈل آئی ڈی (${activePreset.modelId})`
                      : `Model ID override (${activePreset.modelId})`
                  }
                  className="min-h-[40px] w-52 rounded-lg border border-slate-300 bg-stone-50 px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none font-mono-tabular"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowKeySetupGuide((prev) => !prev)}
                aria-expanded={showKeySetupGuide}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Terminal className="h-3.5 w-3.5 text-emerald-800" />
                <span>
                  {isUr
                    ? 'API کلید کہاں لگائیں؟ (گائیڈ)'
                    : 'Where to Put API Key'}
                </span>
                {showKeySetupGuide ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Expandable Server API Key Configuration Guide */}
          {showKeySetupGuide && (
            <div className="rounded-xl border border-slate-200 bg-stone-50 p-4 sm:p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <p className="font-bold text-slate-900">
                  {isUr
                    ? 'سرور سائیڈ API کلید لگانے کا محفوظ طریقہ (Server-Side Key Placement)'
                    : 'How & Where to Configure Your API Key on the Server'}
                </p>
                {healthProviders && (
                  <div className="flex flex-wrap items-center gap-2 text-slate-600 font-sans-ui">
                    <span>
                      GEMINI_API_KEY:{' '}
                      <strong className={healthProviders.gemini?.configured ? 'text-emerald-800' : 'text-amber-700'}>
                        {healthProviders.gemini?.configured ? 'Ready' : 'Not Set'}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      GROQ_API_KEY:{' '}
                      <strong className={healthProviders.groq?.configured ? 'text-emerald-800' : 'text-amber-700'}>
                        {healthProviders.groq?.configured ? 'Ready' : 'Not Set'}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      CUSTOM_LLM_API_KEY:{' '}
                      <strong className={healthProviders.custom?.configured ? 'text-emerald-800' : 'text-amber-700'}>
                        {healthProviders.custom?.configured ? 'Ready' : 'Not Set'}
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              <div
                dir="ltr"
                className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans-ui text-left"
              >
                <div className="space-y-1.5">
                  <p className="font-semibold text-slate-900">
                    1. Google AI Studio (Settings &gt; Secrets) or Local <code>.env</code>
                  </p>
                  <p className="text-slate-600">
                    Add your provider key in the AI Studio <strong>Secrets</strong> panel or in a git-ignored <code>.env</code> file (copied from <code>.env.example</code>):
                  </p>
                  <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-emerald-300 font-mono-tabular">
{`# Option A: Google Gemini
GEMINI_API_KEY="AIza..."

# Option B: Groq Vision (for keys starting with gsk_...)
GROQ_API_KEY="gsk_your_groq_key_here"
GROQ_MODEL="meta-llama/llama-4-scout-17b-16e-instruct"

# Option C: OpenAI / OpenRouter / Custom Vision
CUSTOM_LLM_API_KEY="sk-..."
CUSTOM_LLM_BASE_URL="https://api.openai.com/v1"`}
                  </pre>
                </div>

                <div className="space-y-1.5">
                  <p className="font-semibold text-slate-900">
                    2. Where <code>server.ts</code> Reads &amp; Uses the Key
                  </p>
                  <p className="text-slate-600">
                    In <code>/server.ts</code> (lines 16–30 &amp; 320–395), the server reads <code>process.env.{activePreset.envVarName}</code> and calls either <code>callGeminiVisionModel()</code> or <code>callOpenAiCompatibleVisionModel()</code> before validating output with <code>ResultSchema</code>.
                  </p>
                  <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <strong>Security Note:</strong> If you ever paste an API key in a public chat or issue, rotate/revoke it in your provider dashboard and store the fresh key only in <strong>Settings &gt; Secrets</strong> or <code>.env</code>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Recent Analysis & Multi-Bill Comparison (sessionStorage, last 3 items) */}
        <RecentAnalysisView
          lang={lang}
          items={recentAnalyses}
          activeItemId={activeRecentId}
          onSelectItem={handleSelectRecentItem}
          onClearHistory={handleClearRecentHistory}
        />

        {/* Conditional Rendering: Result View vs Upload & Capture Workspace */}
        {pipelineStep === 'done' && analysisResult && sanitizedImage && analysisMeta ? (
          <ResultCard
            lang={lang}
            result={analysisResult}
            imagePayload={sanitizedImage}
            meta={analysisMeta}
            onReset={resetWorkspace}
          />
        ) : (
          <div id="upload-workspace" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Primary Mobile-First Upload & Camera Card (7 cols) */}
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    {isUr
                      ? 'بل کی تصویر لیں یا گیلری سے منتخب کریں'
                      : 'Upload or Capture a Utility Bill Photo'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isUr
                      ? 'صرف اصلی JPEG، PNG یا WebP تصاویر (زیادہ سے زیادہ 8 MB اور 4000px)۔ جعلی ایکسٹینشن اور SVG فائلیں خودکار طور پر مسترد کر دی جاتی ہیں۔'
                      : 'Accepts genuine JPEG, PNG, or WebP images only (max 8 MB, max 4000 px). Spoofed file extensions and SVGs are rejected by magic-byte inspection.'}
                  </p>
                </div>
              </div>

              {/* 4-Step Visual Security Pipeline Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-sans-ui">
                {[
                  {
                    step: '01',
                    titleUr: 'Magic Bytes چیک',
                    titleEn: 'Magic Bytes Check',
                    active:
                      pipelineStep === 'checking_magic_bytes' ||
                      pipelineStep === 'stripping_exif' ||
                      pipelineStep === 'analyzing_server',
                  },
                  {
                    step: '02',
                    titleUr: 'EXIF لوکیشن صاف',
                    titleEn: 'Canvas EXIF Strip',
                    active:
                      pipelineStep === 'stripping_exif' ||
                      pipelineStep === 'analyzing_server',
                  },
                  {
                    step: '03',
                    titleUr: 'محفوظ ماڈل تجزیہ',
                    titleEn: 'Locked Model Call',
                    active: pipelineStep === 'analyzing_server',
                  },
                  {
                    step: '04',
                    titleUr: 'Zod اسکیما تصدیق',
                    titleEn: 'Strict Zod Check',
                    active: pipelineStep === 'analyzing_server',
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                      item.active
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold'
                        : 'border-slate-200 bg-stone-50 text-slate-600'
                    }`}
                  >
                    <span className="font-mono-tabular text-[11px] text-emerald-800 font-bold">
                      {item.step}.
                    </span>{' '}
                    <span>{isUr ? item.titleUr : item.titleEn}</span>
                  </div>
                ))}
              </div>

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                id="bill-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="sr-only"
              />

              {/* Drag and Drop / Tap Upload Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-emerald-700 bg-emerald-50/60'
                    : 'border-slate-300 bg-stone-50/70'
                }`}
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-900/10 text-emerald-900">
                  <Upload className="h-6 w-6" />
                </div>

                <p className="mt-4 text-base font-bold text-slate-900">
                  {isUr
                    ? 'بل کی تصویر یہاں ڈراپ کریں یا نیچے بٹن دبائیں'
                    : 'Drop your bill photo here or choose an option below'}
                </p>
                <p className="mt-1 text-xs text-slate-600 font-sans-ui">
                  JPEG · PNG · WebP · Max 8 MB · Max 4000×4000 px · Active Engine:{' '}
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {activePreset.provider}:{effectiveModelId}
                  </span>
                </p>

                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={
                      pipelineStep === 'checking_magic_bytes' ||
                      pipelineStep === 'stripping_exif' ||
                      pipelineStep === 'analyzing_server'
                    }
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-emerald-800 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Upload className="h-4 w-4" />
                    <span>
                      {isUr ? 'فون / کمپیوٹر سے تصویر منتخب کریں' : 'Select Bill Photo'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      pipelineStep === 'checking_magic_bytes' ||
                      pipelineStep === 'stripping_exif' ||
                      pipelineStep === 'analyzing_server'
                    }
                    onClick={() => setCameraOpen(true)}
                    className="flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Camera className="h-4 w-4" />
                    <span>{isUr ? 'کیمرے سے تصویر کھینچیں' : 'Open Camera'}</span>
                  </button>
                </div>
              </div>

              {/* Active Security & Analysis Progress State */}
              {(pipelineStep === 'checking_magic_bytes' ||
                pipelineStep === 'stripping_exif' ||
                pipelineStep === 'analyzing_server') && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 space-y-3"
                >
                  <div className="flex items-center gap-3 text-emerald-950 font-semibold text-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-800 shrink-0" />
                    <span>
                      {pipelineStep === 'checking_magic_bytes' &&
                        (isUr
                          ? 'فائل کے اصلی بائٹس (Magic Bytes) چیک کیے جا رہے ہیں...'
                          : 'Verifying file magic bytes (JPEG/PNG/WebP)...')}
                      {pipelineStep === 'stripping_exif' &&
                        (isUr
                          ? 'براؤزر کینوس پر EXIF اور GPS لوکیشن ڈیٹا صاف کیا جا رہا ہے...'
                          : 'Stripping EXIF & GPS metadata on client canvas...')}
                      {pipelineStep === 'analyzing_server' &&
                        (isUr
                          ? `بل کی عبارت پڑھی جا رہی ہے (${activePreset.provider}:${effectiveModelId}) اور Zod اسکیما سے تصدیق ہو رہی ہے...`
                          : `Extracting bill fields via ${activePreset.provider}:${effectiveModelId} and validating with Zod schema...`)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-900 font-sans-ui">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>1. Magic Bytes Verified</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>2. EXIF Stripped on Client</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>3. Server Validation &amp; Structured Extraction</span>
                  </div>
                </div>
              )}

              {/* Validation or Security Rejection Error Banner */}
              {pipelineStep === 'error' && errorState && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-300 bg-red-50 p-5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-red-950 font-bold text-sm">
                      <XCircle className="h-5 w-5 text-red-700 shrink-0" />
                      <span>
                        {isUr
                          ? 'فائل مسترد کر دی گئی (Security & Validation Check)'
                          : 'Upload Rejected by Security Validator'}
                      </span>
                    </div>
                    <span className="text-xs font-mono-tabular text-red-800">
                      {errorState.code}
                    </span>
                  </div>

                  <p className="text-sm text-red-900">
                    {isUr ? errorState.messageUr : errorState.messageEn}
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Synthetic Sample Bills & Security Test Triggers (5 cols) */}
            <div
              id="sample-bills"
              className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
            >
              <div className="space-y-1 border-b border-slate-100 pb-4">
                <h2 className="text-base font-bold text-slate-900">
                  {isUr
                    ? 'فوری ٹیسٹنگ کے لیے مصنوعی نمونہ بل (Synthetic Sample Bills)'
                    : 'Synthetic Sample Bills for Instant Testing'}
                </h2>
                <p className="text-xs text-slate-600">
                  {isUr
                    ? 'کسی اصلی ذاتی بل کے بغیر ایپ کو ٹیسٹ کرنے کے لیے نیچے دیے گئے مصنوعی بل لوڈ کریں۔ یہ بالکل اصلی تصویر کی طرح کینوس اور سرور ویلیڈیشن سے گزرتے ہیں۔'
                    : 'Test the complete client-to-server pipeline immediately using synthetic utility bills with zero real personal data.'}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  data-testid="btn-sample-lesco"
                  onClick={() => void handleLoadSampleBill('lesco_electricity')}
                  disabled={
                    pipelineStep === 'checking_magic_bytes' ||
                    pipelineStep === 'stripping_exif' ||
                    pipelineStep === 'analyzing_server'
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-stone-50 p-4 text-start hover:border-emerald-700 hover:bg-emerald-50/40 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-emerald-800 shrink-0 mt-1" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {isUr
                          ? 'نمونہ 1: لیسکو بجلی کا بل (LESCO Electricity Bill)'
                          : 'Sample 1: LESCO Electricity Bill (Oct 2026)'}
                      </p>
                      <p className="text-xs text-slate-600 font-sans-ui">
                        Ref: 24-11254-0981203 U · Rs. 14,850 · Due 28 Oct 2026
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-900 whitespace-nowrap shrink-0">
                    {isUr ? 'ٹیسٹ کریں ←' : 'Load →'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="btn-sample-sngpl"
                  onClick={() => void handleLoadSampleBill('sngpl_gas')}
                  disabled={
                    pipelineStep === 'checking_magic_bytes' ||
                    pipelineStep === 'stripping_exif' ||
                    pipelineStep === 'analyzing_server'
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-stone-50 p-4 text-start hover:border-emerald-700 hover:bg-emerald-50/40 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-emerald-800 shrink-0 mt-1" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {isUr
                          ? 'نمونہ 2: سوئی ناردرن گیس کا بل (SNGPL Gas Bill)'
                          : 'Sample 2: SNGPL Natural Gas Bill (Oct 2026)'}
                      </p>
                      <p className="text-xs text-slate-600 font-sans-ui">
                        Ref: 5498-2210-8831-4 · Rs. 8,150 · Due 28 Oct 2026
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-emerald-900 whitespace-nowrap shrink-0">
                    {isUr ? 'ٹیسٹ کریں ←' : 'Load →'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="btn-sample-spoof-svg"
                  onClick={() => void handleTestSpoofedSvgRejection()}
                  disabled={
                    pipelineStep === 'checking_magic_bytes' ||
                    pipelineStep === 'stripping_exif' ||
                    pipelineStep === 'analyzing_server'
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-start hover:border-amber-400 hover:bg-amber-50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-amber-800 shrink-0 mt-1" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {isUr
                          ? 'سیکیورٹی ٹیسٹ: جعلی ایکسٹینشن (.jpg کے نام سے SVG)'
                          : 'Security Test: Spoofed Extension (SVG renamed to .jpg)'}
                      </p>
                      <p className="text-xs text-slate-600 font-sans-ui">
                        {isUr
                          ? 'تصدیق کریں کہ Magic Bytes چیک جعلی فائل کو فوراً روکتا ہے'
                          : 'Verify magic-byte validator rejects spoofed SVG payload'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-amber-900 whitespace-nowrap shrink-0">
                    {isUr ? 'جانچیں ←' : 'Test →'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Privacy, Security & Honesty Principles Section */}
        <section
          id="security-principles"
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6"
        >
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">
              {isUr
                ? 'پرائیویسی، سیکیورٹی اور ایمانداری کے اصول (Stage 1 Architecture)'
                : 'Privacy, Security & Honesty Architecture (Stage 1)'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                {isUr
                  ? '01. کوئی اکاؤنٹ نہیں، کوئی ڈیٹا محفوظ نہیں'
                  : '01. Zero Storage & Client EXIF Stripping'}
              </h3>
              <p className="text-xs text-slate-600">
                {isUr
                  ? 'آپ کی تصویر کینوس پر دوبارہ انکوڈ ہو کر GPS اور کیمرہ EXIF ڈیٹا سے پاک ہو جاتی ہے۔ سرور پر کوئی ڈیٹا بیس یا لاگ نہیں ہے اور جواب کے فوراً بعد میموری بفر صفر (Zero) کر دیا جاتا ہے۔'
                  : 'Photos are re-encoded on an HTML5 canvas to strip GPS and camera EXIF tags before upload. The server processes in memory with zero database, zero logs, and immediate buffer wiping.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                {isUr
                  ? '02. غیر معتبر اِن پٹ اور Zod ویلیڈیشن'
                  : '02. Untrusted Input & Strict Zod Schema'}
              </h3>
              <p className="text-xs text-slate-600">
                {isUr
                  ? 'بل کے اندر لکھے متن کو صرف ڈیٹا سمجھا جاتا ہے، ہدایات نہیں۔ ماڈل کو کوئی ٹول یا انٹرنیٹ رسائی حاصل نہیں اور ہر جواب کو سخت Zod اسکیما سے پرکھا جاتا ہے۔'
                  : 'Document text is treated strictly as untrusted data. The model runs with zero tools and no URL fetching, and its output is validated against a strict Zod schema.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                {isUr
                  ? '03. وضاحت، مشورہ ہرگز نہیں'
                  : '03. Explain, Never Advise (Honest Uncertainty)'}
              </h3>
              <p className="text-xs text-slate-600">
                {isUr
                  ? 'اگر کوئی نمبر دھندلا ہو تو اندازہ لگانے کے بجائے null دکھایا جاتا ہے۔ تاریخوں اور رقوم کا حساب کوڈ کے ذریعے لگایا جاتا ہے، اور اصلی تصویر ہمیشہ سامنے رہتی ہے۔'
                  : 'Unreadable fields return null with low confidence rather than a guess. Dates and amounts are parsed deterministically in code, with the original image always beside extracted fields.'}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-5 px-4 sm:px-6 text-xs text-slate-500 font-sans-ui">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-3">
          <p>
            Samajh (سمجھ) · Stage 1 Walking Skeleton · Active Mode: Multi-Provider Server-Side Key (/api/analyze)
          </p>
          <p>
            Not legal, medical, or financial advice · Always verify against your original document
          </p>
        </div>
      </footer>

      <CameraModal
        isOpen={cameraOpen}
        lang={lang}
        onClose={() => setCameraOpen(false)}
        onCaptureFile={(capturedFile) => void processBillFile(capturedFile)}
      />
    </div>
  );
}
