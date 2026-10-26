export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB hard limit
export const MAX_IMAGE_DIMENSION = 4000; // 4000 px max width or height

export interface ValidationOutcome {
  valid: boolean;
  detectedMime: AllowedImageMime | null;
  errorCode?:
    | 'EMPTY_FILE'
    | 'FILE_TOO_LARGE'
    | 'INVALID_MAGIC_BYTES'
    | 'SVG_REJECTED'
    | 'PDF_REJECTED'
    | 'DIMENSIONS_TOO_LARGE'
    | 'INVALID_DIMENSIONS';
  errorUr?: string;
  errorEn?: string;
}

/**
 * Inspects raw magic bytes (first >= 12 bytes) to determine if a buffer is a genuine
 * JPEG, PNG, or WebP image. Never trusts file extensions or client Content-Type headers.
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): AllowedImageMime | null {
  if (!bytes || bytes.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" (52 49 46 46) at 0..3 and "WEBP" (57 45 42 50) at 8..11
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Checks whether the byte signature looks like an SVG/XML or PDF payload
 * (e.g., an attacker renaming malicious.svg to bill.jpg).
 */
function detectBannedSignature(bytes: Uint8Array): 'SVG' | 'PDF' | null {
  if (!bytes || bytes.length < 4) return null;

  // PDF: "%PDF" (25 50 44 46)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'PDF';
  }

  // Decode first 64 ASCII characters to spot "<svg", "<?xml", "<!DOCTYPE svg", "<html"
  const sliceLen = Math.min(bytes.length, 64);
  let ascii = '';
  for (let i = 0; i < sliceLen; i++) {
    ascii += String.fromCharCode(bytes[i]);
  }
  const trimmed = ascii.trimStart().toLowerCase();
  if (
    trimmed.startsWith('<svg') ||
    trimmed.startsWith('<?xml') ||
    trimmed.includes('<svg') ||
    trimmed.startsWith('<!doctype svg')
  ) {
    return 'SVG';
  }

  return null;
}

/**
 * Validates file size, magic bytes, and optional decoded pixel dimensions on client or server.
 */
export function validateImageUpload(params: {
  byteLength: number;
  headerBytes: Uint8Array;
  width?: number;
  height?: number;
}): ValidationOutcome {
  const { byteLength, headerBytes, width, height } = params;

  if (!byteLength || byteLength <= 0) {
    return {
      valid: false,
      detectedMime: null,
      errorCode: 'EMPTY_FILE',
      errorUr: 'فائل خالی ہے۔ براہِ کرم بل کی درست تصویر اپ لوڈ کریں۔',
      errorEn: 'The file is empty. Please upload a valid photo of your bill.',
    };
  }

  if (byteLength > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      detectedMime: null,
      errorCode: 'FILE_TOO_LARGE',
      errorUr: 'فائل کا سائز 8 MB سے زیادہ ہے۔ براہِ کرم چھوٹی تصویر اپ لوڈ کریں۔',
      errorEn: 'File size exceeds the 8 MB maximum limit. Please upload a smaller image.',
    };
  }

  const banned = detectBannedSignature(headerBytes);
  if (banned === 'SVG') {
    return {
      valid: false,
      detectedMime: null,
      errorCode: 'SVG_REJECTED',
      errorUr: 'سیکیورٹی اصولوں کے تحت SVG فائلیں ممنوع ہیں۔ صرف اصلی JPEG، PNG یا WebP تصویر اپ لوڈ کریں۔',
      errorEn: 'SVG files are rejected for security. Only genuine JPEG, PNG, or WebP images are accepted.',
    };
  }

  if (banned === 'PDF') {
    return {
      valid: false,
      detectedMime: null,
      errorCode: 'PDF_REJECTED',
      errorUr: 'اس مرحلے میں PDF سپورٹ شامل نہیں۔ براہِ کرم بل کی تصویر (JPEG، PNG یا WebP) اپ لوڈ کریں۔',
      errorEn: 'PDF files are out of scope in v1. Please upload a photo (JPEG, PNG, or WebP) of your bill.',
    };
  }

  const detectedMime = detectImageMimeFromBytes(headerBytes);
  if (!detectedMime) {
    return {
      valid: false,
      detectedMime: null,
      errorCode: 'INVALID_MAGIC_BYTES',
      errorUr: 'فائل کے اصلی بائٹس (Magic Bytes) درست تصویر سے مطابقت نہیں رکھتے۔ صرف JPEG، PNG یا WebP قابلِ قبول ہیں۔',
      errorEn: 'File magic bytes do not match a genuine JPEG, PNG, or WebP image. Spoofed file extensions are rejected.',
    };
  }

  if (width !== undefined && height !== undefined) {
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
      return {
        valid: false,
        detectedMime,
        errorCode: 'INVALID_DIMENSIONS',
        errorUr: 'تصویر کے ابعاد (Dimensions) پڑھے نہیں جا سکے۔',
        errorEn: 'Image dimensions could not be verified.',
      };
    }
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      return {
        valid: false,
        detectedMime,
        errorCode: 'DIMENSIONS_TOO_LARGE',
        errorUr: `تصویر کا سائز ${MAX_IMAGE_DIMENSION}px سے زیادہ ہے۔`,
        errorEn: `Image dimensions exceed the ${MAX_IMAGE_DIMENSION}px maximum limit.`,
      };
    }
  }

  return {
    valid: true,
    detectedMime,
  };
}

/**
 * Decodes base64 string on the server into a byte buffer to verify both exact size and magic bytes.
 */
export function validateBase64ImageServerSide(base64Data: string): {
  outcome: ValidationOutcome;
  buffer: Buffer | null;
} {
  if (!base64Data || typeof base64Data !== 'string') {
    return {
      outcome: validateImageUpload({ byteLength: 0, headerBytes: new Uint8Array(0) }),
      buffer: null,
    };
  }

  // Strip optional data URL prefix if present
  const cleanBase64 = base64Data.includes(',')
    ? base64Data.slice(base64Data.indexOf(',') + 1)
    : base64Data;

  // Reject obviously oversized base64 strings before allocating buffer
  const estimatedBytes = Math.floor((cleanBase64.length * 3) / 4);
  if (estimatedBytes > MAX_UPLOAD_BYTES) {
    return {
      outcome: validateImageUpload({
        byteLength: estimatedBytes,
        headerBytes: new Uint8Array(0),
      }),
      buffer: null,
    };
  }

  const buffer = Buffer.from(cleanBase64, 'base64');
  const headerBytes = new Uint8Array(buffer.buffer, buffer.byteOffset, Math.min(buffer.byteLength, 64));

  const outcome = validateImageUpload({
    byteLength: buffer.byteLength,
    headerBytes,
  });

  return {
    outcome,
    buffer: outcome.valid ? buffer : null,
  };
}
