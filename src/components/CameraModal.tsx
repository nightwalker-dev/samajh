import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  lang: 'ur' | 'en';
  onClose: () => void;
  onCaptureFile: (file: File) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  lang,
  onClose,
  onCaptureFile,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const isUr = lang === 'ur';

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setErrorMsg(null);
    setIsReady(false);

    async function initCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg(
          isUr
            ? 'آپ کے براؤزر میں کیمرہ دستیاب نہیں ہے۔ براہِ کرم فائل اپ لوڈ کا بٹن استعمال کریں۔'
            : 'Camera access is not supported in this browser. Please use the file upload button instead.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch {
        setErrorMsg(
          isUr
            ? 'کیمرہ کھولنے کی اجازت نہیں ملی یا کیمرہ منسلک نہیں ہے۔ براہِ کرم تصویر اپ لوڈ کریں۔'
            : 'Camera permission was denied or no camera device was found. Please upload a photo from your device.'
        );
      }
    }

    initCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, isUr]);

  if (!isOpen) return null;

  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || !isReady) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 960;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const capturedFile = new File([blob], `camera-bill-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        onCaptureFile(capturedFile);
        onClose();
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isUr ? 'بل کی تصویر کھینچیں' : 'Capture Bill Photo'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h2 className="text-lg font-bold text-slate-900">
            {isUr ? 'کیمرے سے بل کی تصویر لیں' : 'Capture Utility Bill with Camera'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={isUr ? 'بند کریں' : 'Close camera'}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          {errorMsg ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <p>{errorMsg}</p>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 aspect-4/3 flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-contain"
              />
              {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-white text-sm gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>{isUr ? 'کیمرہ تیار ہو رہا ہے...' : 'Starting camera...'}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-600">
          {isUr
            ? 'تصویر لیتے ہی آپ کے فون یا کمپیوٹر پر ہی EXIF لوکیشن ڈیٹا صاف کر دیا جائے گا۔'
            : 'EXIF location metadata is automatically stripped on your device immediately upon capture.'}
        </p>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {isUr ? 'منسوخ کریں' : 'Cancel'}
          </button>
          {!errorMsg && (
            <button
              type="button"
              disabled={!isReady}
              onClick={handleSnap}
              className="flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-800 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Camera className="h-4 w-4" />
              <span>{isUr ? 'تصویر کھینچیں' : 'Take Photo'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
