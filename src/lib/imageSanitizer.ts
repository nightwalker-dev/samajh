import {
  AllowedImageMime,
  MAX_IMAGE_DIMENSION,
  MAX_UPLOAD_BYTES,
  validateImageUpload,
  ValidationOutcome,
} from './magicBytes';

export interface SanitizedImagePayload {
  base64Data: string;
  dataUrl: string;
  mimeType: AllowedImageMime;
  originalBytes: number;
  sanitizedBytes: number;
  width: number;
  height: number;
  exifStripped: true;
  magicBytesVerified: true;
}

export interface SanitizeImageResult {
  ok: boolean;
  payload?: SanitizedImagePayload;
  validation: ValidationOutcome;
}

function loadImageElement(blob: Blob): Promise<{ img: HTMLImageElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      URL.revokeObjectURL(objectUrl);
      resolve({ img, width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image pixels.'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: AllowedImageMime, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas re-encoding failed.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function blobToBase64(blob: Blob): Promise<{ base64Data: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read re-encoded blob.'));
        return;
      }
      const dataUrl = reader.result;
      const commaIdx = dataUrl.indexOf(',');
      const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      resolve({ base64Data, dataUrl });
    };
    reader.onerror = () => reject(new Error('FileReader error during canvas export.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Validates file magic bytes, size (<= 8 MB), and pixel dimensions (<= 4000 px),
 * then re-encodes the image on a fresh HTML5 Canvas to deterministically strip all EXIF metadata
 * (including GPS location, camera serials, and embedded thumbnails).
 */
export async function validateAndStripExifOnClient(file: File): Promise<SanitizeImageResult> {
  const headerSlice = file.slice(0, 64);
  const headerBuffer = await headerSlice.arrayBuffer();
  const headerBytes = new Uint8Array(headerBuffer);

  // Step 1: Validate raw file size and magic bytes before decoding
  const initialValidation = validateImageUpload({
    byteLength: file.size,
    headerBytes,
  });

  if (!initialValidation.valid || !initialValidation.detectedMime) {
    return {
      ok: false,
      validation: initialValidation,
    };
  }

  // Step 2: Decode image to inspect pixel dimensions
  let decoded: { img: HTMLImageElement; width: number; height: number };
  try {
    decoded = await loadImageElement(file);
  } catch {
    return {
      ok: false,
      validation: {
        valid: false,
        detectedMime: initialValidation.detectedMime,
        errorCode: 'INVALID_DIMENSIONS',
        errorUr: 'تصویر کو پڑھا نہیں جا سکا۔ براہِ کرم صاف تصویر اپ لوڈ کریں۔',
        errorEn: 'Could not decode image pixels. Please upload a valid image file.',
      },
    };
  }

  // Step 3: Validate pixel dimensions (max 4000 px)
  const dimensionValidation = validateImageUpload({
    byteLength: file.size,
    headerBytes,
    width: decoded.width,
    height: decoded.height,
  });

  if (!dimensionValidation.valid) {
    return {
      ok: false,
      validation: dimensionValidation,
    };
  }

  // Step 4: Re-encode onto a clean HTML5 canvas to strip all EXIF metadata (GPS, camera info)
  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      ok: false,
      validation: {
        valid: false,
        detectedMime: initialValidation.detectedMime,
        errorCode: 'INVALID_DIMENSIONS',
        errorUr: 'براؤزر کینوس دستیاب نہیں ہے۔',
        errorEn: 'Browser canvas context is unavailable for EXIF stripping.',
      },
    };
  }

  // Fill white backdrop for JPEG re-encode safety, then draw raw pixels only
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(decoded.img, 0, 0, decoded.width, decoded.height);

  const outputMime: AllowedImageMime =
    initialValidation.detectedMime === 'image/png' ? 'image/png' : 'image/jpeg';

  const strippedBlob = await canvasToBlob(canvas, outputMime, 0.92);

  // Verify the stripped blob is still within the 8 MB limit and has valid magic bytes
  const strippedHeaderBytes = new Uint8Array(await strippedBlob.slice(0, 64).arrayBuffer());
  const finalValidation = validateImageUpload({
    byteLength: strippedBlob.size,
    headerBytes: strippedHeaderBytes,
    width: decoded.width,
    height: decoded.height,
  });

  if (!finalValidation.valid || !finalValidation.detectedMime || strippedBlob.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      validation: finalValidation,
    };
  }

  const { base64Data, dataUrl } = await blobToBase64(strippedBlob);

  return {
    ok: true,
    validation: finalValidation,
    payload: {
      base64Data,
      dataUrl,
      mimeType: finalValidation.detectedMime,
      originalBytes: file.size,
      sanitizedBytes: strippedBlob.size,
      width: decoded.width,
      height: decoded.height,
      exifStripped: true,
      magicBytesVerified: true,
    },
  };
}
