import { useRef, useState, useCallback } from 'react';

// Gemeinsame Kamera-Logik für Check-in- und Check-out-Flow. Vorher war dieser
// komplette Block (Stream starten/stoppen, Foto aufnehmen, Video-/Canvas-Refs)
// in beiden Komponenten fast identisch dupliziert.
export function useCameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const startCamera = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
  }, []);

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    setPhotoDataUrl(c.toDataURL('image/jpeg', 0.85));
    stopCamera();
  }, [stopCamera]);

  const clearPhoto = useCallback(() => setPhotoDataUrl(null), []);

  return { videoRef, canvasRef, photoDataUrl, startCamera, stopCamera, takePhoto, clearPhoto };
}
