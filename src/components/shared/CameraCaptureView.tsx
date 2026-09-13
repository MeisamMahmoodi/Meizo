import type { RefObject } from 'react';
import { X } from 'lucide-react';

interface CameraCaptureViewProps {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  label: string;
  onCancel: () => void;
  onCapture: () => void;
  cancelAriaLabel: string;
  captureAriaLabel: string;
}

// Gemeinsame Kamera-Ansicht (Sucher, Rahmen, Auslöser) für Check-in und
// Check-out. War vorher zweimal fast identisch kopiert.
export function CameraCaptureView({
  videoRef, canvasRef, label, onCancel, onCapture, cancelAriaLabel, captureAriaLabel,
}: CameraCaptureViewProps) {
  return (
    <div className="relative bg-black" style={{ minHeight: '60dvh' }}>
      <video ref={videoRef} autoPlay playsInline muted className="w-full object-cover" style={{ maxHeight: '70dvh' }} />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-6 border-2 border-white/30 rounded-2xl" />
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
          <p className="text-white text-xs font-semibold text-center">{label}</p>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
        <button onClick={onCancel} aria-label={cancelAriaLabel} className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
          <X size={20} className="text-white" />
        </button>
        <button
          onClick={onCapture}
          aria-label={captureAriaLabel}
          className="rounded-full bg-white border-4 border-white/30 shadow-lg flex items-center justify-center transition-transform active:scale-95"
          style={{ width: 72, height: 72 }}
        >
          <div className="w-14 h-14 rounded-full bg-white" />
        </button>
        <div className="w-12 h-12" />
      </div>
    </div>
  );
}
