import { useEffect, useRef } from 'react';
import { toastError } from '@/lib/toastHelpers';

type InputMode = 'search' | 'scanner' | 'camera';

export function useBarcodeCameraScanner(params: {
  inputMode: InputMode;
  open: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  onValue: (value: string) => void;
  onFallback: () => void;
}) {
  const { inputMode, open, videoRef, onValue, onFallback } = params;
  const streamRef = useRef<MediaStream | null>(null);
  const scanRafRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (scanRafRef.current) cancelAnimationFrame(scanRafRef.current);
    scanRafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (inputMode !== 'camera' || !open) { stopCamera(); return; }
    let cancelled = false;
    (async () => {
      try {
        const BD = (window as unknown as {
          BarcodeDetector?: new (options?: { formats?: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
          };
        }).BarcodeDetector;
        if (!BD) {
          toastError('Câmera de códigos não é suportada neste navegador. Use um leitor USB.');
          onFallback();
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new BD({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'],
        });
        let lastValue = '';
        let lastAt = 0;
        const tick = async () => {
          if (!videoRef.current || cancelled) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes[0]?.rawValue) {
              const v: string = codes[0].rawValue;
              const now = Date.now();
              if (v !== lastValue || now - lastAt > 1500) {
                lastValue = v; lastAt = now;
                onValue(v);
              }
            }
          } catch { /* transient */ }
          scanRafRef.current = requestAnimationFrame(tick);
        };
        scanRafRef.current = requestAnimationFrame(tick);
      } catch {
        toastError('Não foi possível acessar a câmera.');
        onFallback();
      }
    })();
    return () => { cancelled = true; stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, open]);

  useEffect(() => { if (!open) stopCamera(); }, [open]);

  return { stopCamera };
}
