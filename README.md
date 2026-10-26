# سمجھ · Samajh — Urdu-First, Privacy-First Document Helper

> **اپنے بجلی یا گیس کے بل کی تصویر اپ لوڈ کریں اور آسان اردو اور انگریزی میں سمجھیں۔**  
> **Understand complex everyday documents (starting with Pakistani Electricity & Gas Utility Bills) in plain Urdu and English — with zero data storage, client-side EXIF stripping, and strict schema validation.**

---

## ✨ Why Samajh (سمجھ)?

Millions of households across Pakistan receive utility bills (LESCO, IESCO, K-Electric, MEPCO, FESCO, SNGPL, SSGC), fee challans, and official notices printed in dense English jargon and tabular codes. **Samajh** translates these documents into clear, actionable Urdu (`نستعلیق`) and English without ever storing your personal documents or location data.

### Key Highlights
- **🇵🇰 Urdu-First RTL Design + 1-Click English Toggle**: Built from the ground up with `dir="rtl"`, `Noto Nastaliq Urdu` / `Noto Naskh Arabic` typography, generous Nastaliq line-heights (`2.35`), and tabular numerals (`JetBrains Mono`) so dates, PKR amounts, and reference numbers never scramble.
- **🔒 Privacy by Default (Zero Storage)**:
  - **Client-Side EXIF & GPS Stripping**: Every photo is re-encoded on an HTML5 `<canvas>` inside your browser to strip camera & GPS metadata *before* a single byte leaves your device.
  - **In-Memory Processing**: The Express server processes images strictly in RAM and immediately zeroes the memory buffer (`buffer.fill(0)`) in a `finally` block after responding.
- **🛡️ Defense-in-Depth Security Pipeline**:
  - **Magic-Byte Verification**: Inspects raw file header bytes (`0xFF 0xD8 0xFF` for JPEG, `0x89 PNG` for PNG, `RIFF...WEBP` for WebP) on both client and server. Spoofed extensions (e.g., a malicious `.svg` or `.pdf` renamed to `.jpg`) are deterministically rejected.
  - **Prompt Injection Defense**: Document text is treated strictly as untrusted passive data inside a tool-less vision call.
  - **Strict Zod Schema Validation**: Every model response is validated against `ResultSchema` (`z.strictObject`). Malformed JSON or extra properties are rejected—never rendered raw.
- **🤖 Multi-Provider Vision Engine**:
  - **Google Gemini Vision** (`gemini-3.8-flash` / `gemini-4-argon` via `@google/genai`)
  - **Groq Vision** (`meta-llama/llama-4-scout-17b-16e-instruct` / `llama-4-maverick-17b-128e-instruct` using `gsk_...` keys)
  - **Custom OpenAI-Compatible Vision Endpoints** (`gpt-4o-mini`, OpenRouter, etc.)
- **📊 Rich Verification & Utility Tools**:
  - **Side-by-Side Original Bill Viewer**: Click any extracted field to highlight its bounding region on the original bill photo.
  - **Visual Confidence Badges**: Color-coded confidence badges (`High ≥85%`, `Medium 60–84%`, `Low <60%`) and progress meters per extracted field. Unreadable/smudged fields return `null` rather than guessing.
  - **Deterministic Code Math & Dates**: Countdown to due date, late payment surcharge savings, and PKR parsing are computed in deterministic TypeScript code—never delegated to LLM arithmetic.
  - **Optional Multi-Currency Converter**: Convert extracted bill amounts between **PKR (`Rs.`)**, **USD (`$`)**, **AED (`د.إ`)**, **SAR (`ر.س`)**, **GBP (`£`)**, **EUR (`€`)**, and **CAD (`CA$`)** with custom exchange rate overrides.
  - **Recent Analysis & Multi-Bill Comparison (`sessionStorage`)**: Stores up to the last **3 analyzed bills** in tab-only `sessionStorage` with a side-by-side comparison matrix and a 1-click **Clear History** button.
  - **Print / Save as PDF**: Clean `@media print` stylesheet and 1-click print button (`window.print()`).

---

## 🚀 Getting Started / انسٹال کرنے کا مکمل طریقہ (Installation Guide)

Follow the steps below to run **Samajh** locally on your computer (Windows, macOS, or Linux).

### 1. Prerequisites (ضروری سافٹ ویئر)
Make sure you have the following installed:
- **Node.js** `v20+` or `v22+` ([Download Node.js](https://nodejs.org/))
- **npm** `v10+` (comes with Node.js)
- **Git** ([Download Git](https://git-scm.com/))

Check your versions in the terminal:
```bash
node -v
npm -v
```

---

### 2. Clone the Repository (گِٹ ہب سے کوڈ ڈاؤن لوڈ کریں)
```bash
git clone https://github.com/<your-username>/samajh.git
cd samajh
```

---

### 3. Install Dependencies (پیکجز انسٹال کریں)
```bash
npm install
```

---

### 4. Configure Environment Variables / API Keys (`.env` سیٹ اپ کریں)

Copy the example environment file `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` in your code editor and add **at least one** Vision AI provider key (API keys stay strictly on the server and are never exposed to the browser):

```dotenv
# ============================================================================
# OPTION 1: Google Gemini API Key (Default Provider)
# Get a key from: https://aistudio.google.com/apikey
# ============================================================================
GEMINI_API_KEY="AIzaSyYourGeminiKeyHere"
GEMINI_MODEL="gemini-3.8-flash"

# ============================================================================
# OPTION 2: Groq API Key (For keys starting with gsk_...)
# Get a key from: https://console.groq.com/keys
# ============================================================================
GROQ_API_KEY="gsk_your_groq_api_key_here"
GROQ_MODEL="meta-llama/llama-4-scout-17b-16e-instruct"

# ============================================================================
# OPTION 3: OpenAI / OpenRouter / Custom Vision Endpoint
# ============================================================================
CUSTOM_LLM_API_KEY="sk-your_custom_key_here"
CUSTOM_LLM_BASE_URL="https://api.openai.com/v1"
CUSTOM_LLM_MODEL="gpt-4o-mini"
```

> **💡 Tip (بغیر API Key کے ٹیسٹنگ):** Even before setting an API key, you can test the entire end-to-end security pipeline, UI, comparison matrix, and currency converter using the built-in **Synthetic Sample Bills (LESCO Electricity & SNGPL Gas)** included in the app!

---

### 5. Run the Development Server (ایپ چلائیں)

Start the full-stack Express + Vite development server on port `3000`:

```bash
npm run dev
```

Now open your browser at:
```text
http://localhost:3000
```

---

## 🧪 Running Automated Security & Unit Tests (ٹیسٹ رن کریں)

Samajh includes a built-in `node:test` suite (`src/lib/security.test.ts`) that verifies:
1. Genuine **JPEG, PNG, and WebP magic-byte detection**
2. Rejection of **spoofed SVGs (`.svg` renamed to `.jpg`)**, **PDFs**, oversized files (`> 8 MB`), and oversized dimensions (`> 4000×4000 px`)
3. Server-side base64 buffer verification
4. Strict **Zod `ResultSchema`** validation and rejection of unknown/extra properties
5. Deterministic **deadline countdowns** and **PKR / Urdu-numeral amount parsing**
6. **Recent Analysis `sessionStorage`** 3-item FIFO cap, deduplication, and `Clear History`
7. Deterministic **multi-currency conversion** (`PKR`, `USD`, `AED`, `SAR`, `GBP`, `EUR`, `CAD`) and custom rate overrides

Run the test suite with:
```bash
npm test
```

---

## 🏗️ Production Build & Deployment (پروڈکشن بلڈ)

To compile the TypeScript + Vite frontend bundle for production:

```bash
npm run build
```

To start the production Express server:

```bash
npm start
```

---

## 📂 Project Architecture (فائل اسٹرکچر)

```text
samajh/
├── .env.example                  # Server-side environment variable template (Gemini, Groq, Custom Vision)
├── index.html                    # RTL Urdu-first HTML entry point with Google Fonts (Nastaliq, Naskh, Sans, Mono)
├── metadata.json                 # App metadata and camera permissions
├── package.json                  # Exact pinned dependencies with justifications
├── server.ts                     # Express backend (/api/health, /api/analyze), rate-limiting, magic-byte check, RAM wiping
└── src/
    ├── App.tsx                   # Main RTL/LTR workspace, Model Provider selector, 4-step pipeline, sample triggers
    ├── index.css                 # Tailwind v4 setup, Urdu Nastaliq line-height rules, @media print styles
    ├── main.tsx                  # React root mount
    ├── components/
    │   ├── CameraModal.tsx       # Live WebRTC camera capture modal
    │   ├── RecentAnalysisView.tsx# Last 3 bills in sessionStorage + side-by-side comparison table + Clear History
    │   └── ResultCard.tsx        # Split-screen bill image + bounding boxes, confidence badges, currency converter, print
    └── lib/
        ├── currencyConverter.ts  # Deterministic multi-currency conversion (PKR, USD, AED, SAR, GBP, EUR, CAD)
        ├── imageSanitizer.ts     # Client-side magic-byte check + HTML5 Canvas EXIF/GPS metadata stripper
        ├── magicBytes.ts         # Pure magic-byte inspector (JPEG/PNG/WebP allowlist, SVG/PDF rejection)
        ├── recentHistory.ts      # Pure sessionStorage manager (3-item cap, schema re-validation on read)
        ├── schema.ts             # Strict Zod ResultSchema + deterministic date & PKR math parsers
        ├── security.test.ts      # Automated node:test suite for security, schema, history, and currency math
        └── syntheticSampleBill.ts# Canvas generator for synthetic LESCO Electricity & SNGPL Gas test bills
```

---

## 🛡️ Security, Privacy & Honesty Principles

1. **Zero Server Persistence**: No database, no cloud bucket, and no document logging. Uploaded image buffers are overwritten with zeros (`buffer.fill(0)`) immediately after analysis.
2. **Client-Side EXIF Stripping**: Location (GPS) and device metadata are stripped on an HTML5 `<canvas>` before upload.
3. **Never Guess Unreadable Text**: When a stamp or meter serial number is smudged or illegible, Samajh returns `null` with a red **Low Confidence** indicator and lists the unreadable section explicitly.
4. **Explain, Never Advise**: Samajh explains what a document says in plain Urdu and English. It does not provide legal, medical, or financial advice, and always keeps the original document image alongside extracted figures for verification.

---

## 📄 License

SPDX-License-Identifier: Apache-2.0
