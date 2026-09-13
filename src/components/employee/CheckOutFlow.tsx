import { useState, useCallback, useEffect } from 'react';
import { Camera, Check, X, RotateCcw, Loader2, Clock, CloudOff, ListChecks } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addPendingAction, isLikelyNetworkError, withTimeout } from '../../lib/offlineQueue';
import { t, type Lang } from '../../lib/i18n';
import { useCameraCapture } from '../../hooks/useCameraCapture';
import { CameraCaptureView } from '../shared/CameraCaptureView';
import type { ChecklistItem, Property } from '../../lib/types';

interface CheckOutFlowProps {
  assignmentId: string;
  propertyName: string;
  propertyType?: Property['type'];
  checkedInAt: string;
  onSuccess: () => void;
  onQueued: () => void;
  onCancel: () => void;
  rtl?: boolean;
  lang?: Lang;
}

type Step = 'intro' | 'checklist' | 'camera' | 'preview' | 'uploading' | 'done' | 'queued';

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export function CheckOutFlow({ assignmentId, propertyName, propertyType, checkedInAt, onSuccess, onQueued, onCancel, rtl, lang = 'de' }: CheckOutFlowProps) {
  const [step, setStep] = useState<Step>('intro');
  const [uploadError, setUploadError] = useState('');
  const [doneTime, setDoneTime] = useState<Date | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checkedLabels, setCheckedLabels] = useState<Set<string>>(new Set());
  // Punkte, die an diesem Tag nicht zutreffen (z.B. "Fenster geputzt", wenn
  // Fenster diesmal nicht dran waren) — ohne das musste man frueher jeden
  // Punkt abhaken, auch unehrlich, um ueberhaupt weiterzukommen.
  const [naLabels, setNaLabels] = useState<Set<string>>(new Set());
  const camera = useCameraCapture();

  useEffect(() => {
    if (!propertyType) return;
    supabase
      .from('checklist_items')
      .select('*')
      .eq('property_type', propertyType)
      .order('sort_order', { ascending: true })
      .then(({ data }) => setChecklistItems((data as ChecklistItem[]) || []));
  }, [propertyType]);

  const checkedInTime = new Date(checkedInAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const elapsedMs = now.getTime() - new Date(checkedInAt).getTime();
  const elapsedLabel = formatDuration(elapsedMs);

  const handleIntroContinue = useCallback(() => {
    if (checklistItems.length > 0) {
      setStep('checklist');
    } else {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistItems]);

  const toggleChecklistItem = (label: string) => {
    setCheckedLabels(prev => {
      const next = new Set(prev);
      if (next.has(label)) { next.delete(label); } else {
        next.add(label);
        setNaLabels(p => { if (!p.has(label)) return p; const n = new Set(p); n.delete(label); return n; });
      }
      return next;
    });
  };

  const toggleNotApplicable = (label: string) => {
    setNaLabels(prev => {
      const next = new Set(prev);
      if (next.has(label)) { next.delete(label); } else {
        next.add(label);
        setCheckedLabels(p => { if (!p.has(label)) return p; const n = new Set(p); n.delete(label); return n; });
      }
      return next;
    });
  };

  const startCamera = useCallback(async () => {
    setStep('camera');
    const ok = await camera.startCamera();
    if (!ok) {
      setUploadError(t(lang, 'cameraPermissionError'));
      setStep('intro');
    }
  }, [camera, lang]);

  const takePhoto = useCallback(() => {
    camera.takePhoto();
    setStep('preview');
  }, [camera]);

  const retakePhoto = useCallback(() => {
    camera.clearPhoto();
    startCamera();
  }, [camera, startCamera]);

  const getGPS = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

  const uploadAndCheckOut = useCallback(async () => {
    const photoDataUrl = camera.photoDataUrl;
    if (!photoDataUrl) return;
    setStep('uploading');
    setUploadError('');
    const completedAt = new Date();

    try {
      const [coords, blob] = await Promise.all([
        getGPS(),
        fetch(photoDataUrl).then(r => r.blob()),
      ]);

      // Timeout um Upload + DB-Update, siehe CheckInFlow.tsx: ohne das konnte
      // ein haengender Request bei schlechtem Netz den "Wird hochgeladen"-
      // Screen unbegrenzt anzeigen, ohne die Offline-Warteschlange auszuloesen.
      await withTimeout((async () => {
        const filename = `checkout/${assignmentId}_${Date.now()}.jpg`;
        const { error: storageErr } = await supabase.storage
          .from('assignment-photos')
          .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });
        if (storageErr) throw new Error(storageErr.message);

        const { data: urlData } = supabase.storage.from('assignment-photos').getPublicUrl(filename);

        const { error: dbErr } = await supabase.from('assignments').update({
          status: 'completed',
          completed_at: completedAt.toISOString(),
          checkout_photo_url: urlData.publicUrl,
          checkout_lat: coords?.lat ?? null,
          checkout_lng: coords?.lng ?? null,
        }).eq('id', assignmentId);
        if (dbErr) throw new Error(dbErr.message);

        if (checkedLabels.size > 0) {
          // Best-effort — the checkout itself already succeeded above.
          await supabase.from('checklist_completions').insert(
            Array.from(checkedLabels).map(label => ({ assignment_id: assignmentId, item_label: label }))
          );
        }
      })());

      setDoneTime(completedAt);
      setStep('done');
      setTimeout(onSuccess, 1800);
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        try {
          const blob = await (await fetch(photoDataUrl)).blob();
          const coords = await getGPS();
          await addPendingAction({
            id: `checkout-${assignmentId}-${Date.now()}`,
            type: 'checkout',
            assignmentId,
            photoBlob: blob,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            createdAt: completedAt.toISOString(),
            checklistItems: checkedLabels.size > 0 ? Array.from(checkedLabels) : undefined,
          });
          setDoneTime(completedAt);
          setStep('queued');
          setTimeout(onQueued, 2200);
          return;
        } catch {
          // IndexedDB unavailable too — fall through to the regular error below
        }
      }
      setUploadError(err instanceof Error ? err.message : t(lang, 'checkOutError'));
      setStep('preview');
    }
  }, [camera.photoDataUrl, assignmentId, onSuccess, onQueued, checkedLabels, lang]);

  const handleCancel = () => { camera.stopCamera(); onCancel(); };

  const finalDuration = doneTime
    ? formatDuration(doneTime.getTime() - new Date(checkedInAt).getTime())
    : elapsedLabel;

  const allItemsResolved = checkedLabels.size + naLabels.size >= checklistItems.length;

  return (
    <div className={`fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 ${rtl ? 'text-right' : 'text-left'}`}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl overflow-hidden" style={{ maxHeight: '95dvh' }}>

        {/* Intro */}
        {step === 'intro' && (
          <div className="p-7">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#0F172A]">{t(lang, 'checkOut')}</h2>
              <button onClick={handleCancel} aria-label={t(lang, 'ariaClose')} className="p-2 rounded-xl hover:bg-[#F1F5F9] transition-colors">
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>

            <div className="bg-[#F8FAFC] rounded-2xl p-4 mb-6">
              <p className="text-sm font-semibold text-[#0F172A]">{propertyName}</p>
              <div className="flex items-center gap-5 mt-3">
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide mb-0.5">{t(lang, 'checkedIn')}</p>
                  <p className="text-sm font-bold text-[#0F172A]">{checkedInTime} {t(lang, 'clock')}</p>
                </div>
                <div className="w-px h-8 bg-[#E2E8F0]" />
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide mb-0.5">{t(lang, 'nowLabel')}</p>
                  <p className="text-sm font-bold text-[#0F172A]">{now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} {t(lang, 'clock')}</p>
                </div>
                <div className="w-px h-8 bg-[#E2E8F0]" />
                <div>
                  <p className="text-[10px] text-[#94A3B8] uppercase tracking-wide mb-0.5">{t(lang, 'durationLabel')}</p>
                  <p className="text-sm font-bold text-[#22C55E]">{elapsedLabel}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center py-4 mb-4">
              <div className="w-20 h-20 rounded-3xl bg-[#FFF7ED] flex items-center justify-center mb-4">
                <Camera size={36} className="text-[#F97316]" />
              </div>
              <p className="text-sm font-semibold text-[#0F172A] text-center">{t(lang, 'proofPhotoTitle')}</p>
              <p className="text-sm text-[#64748B] text-center mt-1">
                {t(lang, 'photographCleanedArea')}
              </p>
            </div>

            {uploadError && <p className="text-xs text-[#EF4444] text-center mb-4">{uploadError}</p>}

            <button onClick={handleIntroContinue}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold bg-[#F97316] text-white hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2">
              <Camera size={16} /> {t(lang, 'photoAndCheckOutButton')}
            </button>
          </div>
        )}

        {/* Checklist — only shown when the property's type has items defined */}
        {step === 'checklist' && (
          <div className="p-7">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                <ListChecks size={19} className="text-[#F97316]" /> {t(lang, 'checklistTitle')}
              </h2>
              <button onClick={handleCancel} aria-label={t(lang, 'ariaClose')} className="p-2 rounded-xl hover:bg-[#F1F5F9] transition-colors">
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>
            <p className="text-sm text-[#64748B] mb-5">{t(lang, 'checklistSubtitle')}</p>

            <div className="space-y-2.5 mb-6">
              {checklistItems.map(item => {
                const checked = checkedLabels.has(item.label);
                const isNa = naLabels.has(item.label);
                return (
                  <div
                    key={item.id}
                    className={`w-full flex items-center gap-2 px-4 py-3.5 rounded-xl border transition-colors ${
                      checked ? 'bg-[#FFF7ED] border-[#FED7AA]' : isNa ? 'bg-[#F1F5F9] border-[#E2E8F0]' : 'bg-[#F8FAFC] border-[#E2E8F0] hover:bg-[#F1F5F9]'
                    }`}
                  >
                    <button onClick={() => toggleChecklistItem(item.label)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        checked ? 'bg-[#F97316] border-[#F97316]' : 'border-[#CBD5E1]'
                      }`}>
                        {checked && <Check size={13} className="text-white" strokeWidth={3} />}
                      </div>
                      <span className={`text-sm break-words ${checked ? 'text-[#0F172A] font-medium' : isNa ? 'text-[#94A3B8] line-through' : 'text-[#475569]'}`}>{item.label}</span>
                    </button>
                    <button
                      onClick={() => toggleNotApplicable(item.label)}
                      className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shrink-0 transition-colors ${isNa ? 'bg-[#94A3B8] text-white' : 'text-[#94A3B8] hover:bg-[#E2E8F0]'}`}
                    >
                      {t(lang, 'checklistNotApplicable')}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-[#94A3B8] text-center mb-3">
              {checkedLabels.size + naLabels.size}/{checklistItems.length} {t(lang, 'checklistItemsDone')}
            </p>

            <button
              onClick={startCamera}
              disabled={!allItemsResolved}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold bg-[#F97316] text-white hover:bg-[#EA580C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t(lang, 'checklistContinue')}
            </button>
          </div>
        )}

        {/* Camera */}
        {step === 'camera' && (
          <CameraCaptureView
            videoRef={camera.videoRef}
            canvasRef={camera.canvasRef}
            label={t(lang, 'photographCompletedArea')}
            onCancel={handleCancel}
            onCapture={takePhoto}
            cancelAriaLabel={t(lang, 'ariaClose')}
            captureAriaLabel={t(lang, 'ariaTakePhoto')}
          />
        )}

        {/* Preview */}
        {step === 'preview' && camera.photoDataUrl && (
          <div>
            <div className="relative">
              <img src={camera.photoDataUrl} alt={propertyName} className="w-full object-cover" style={{ maxHeight: '55dvh' }} />
            </div>
            <div className="p-6">
              <h3 className="text-base font-bold text-[#0F172A] mb-1">{t(lang, 'reviewPhotoTitle')}</h3>
              <p className="text-sm text-[#64748B] mb-5">{t(lang, 'isWorkRecognizable')}</p>
              {uploadError && <p className="text-xs text-[#EF4444] mb-4">{uploadError}</p>}
              <div className="flex gap-3">
                <button onClick={retakePhoto} className="flex-1 py-3.5 rounded-2xl text-sm font-semibold bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0] transition-colors flex items-center justify-center gap-2">
                  <RotateCcw size={15} /> {t(lang, 'retakeButton')}
                </button>
                <button onClick={uploadAndCheckOut} className="flex-1 py-3.5 rounded-2xl text-sm font-semibold bg-[#F97316] text-white hover:bg-[#EA580C] transition-colors flex items-center justify-center gap-2">
                  <Check size={15} /> {t(lang, 'doneButton')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Uploading */}
        {step === 'uploading' && (
          <div className="p-10 flex flex-col items-center justify-center" style={{ minHeight: '40dvh' }}>
            <Loader2 size={40} className="text-[#F97316] animate-spin mb-5" />
            <p className="text-sm font-semibold text-[#0F172A]">{t(lang, 'checkOut')}...</p>
            <p className="text-lg font-extrabold text-[#DC2626] text-center mt-5">{t(lang, 'dontCloseAppUploading')}</p>
            <button onClick={handleCancel} className="mt-6 text-xs font-semibold text-[#94A3B8] hover:text-[#64748B] transition-colors">
              {t(lang, 'cancelUploadButton')}
            </button>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="p-10 flex flex-col items-center justify-center" style={{ minHeight: '40dvh' }}>
            <div className="w-20 h-20 rounded-3xl bg-[#FFF7ED] flex items-center justify-center mb-5">
              <Check size={40} className="text-[#F97316]" />
            </div>
            <p className="text-lg font-bold text-[#0F172A]">{t(lang, 'doneExclaim')}</p>
            <div className="flex items-center gap-2 mt-2 bg-[#F8FAFC] rounded-xl px-4 py-2">
              <Clock size={14} className="text-[#94A3B8]" />
              <p className="text-sm text-[#64748B]">{t(lang, 'durationLabel')}: <span className="font-bold text-[#0F172A]">{finalDuration}</span></p>
            </div>
            <p className="text-xs text-[#94A3B8] mt-2">{t(lang, 'recordedInPayroll')}</p>
          </div>
        )}

        {/* Queued — no network, will sync automatically */}
        {step === 'queued' && (
          <div className="p-10 flex flex-col items-center justify-center text-center" style={{ minHeight: '40dvh' }}>
            <div className="w-20 h-20 rounded-3xl bg-[#FFF7ED] flex items-center justify-center mb-5">
              <CloudOff size={40} className="text-[#F97316]" />
            </div>
            <p className="text-lg font-bold text-[#0F172A]">{t(lang, 'doneExclaim')}</p>
            <div className="flex items-center gap-2 mt-2 bg-[#F8FAFC] rounded-xl px-4 py-2">
              <Clock size={14} className="text-[#94A3B8]" />
              <p className="text-sm text-[#64748B]">{t(lang, 'durationLabel')}: <span className="font-bold text-[#0F172A]">{finalDuration}</span></p>
            </div>
            <p className="text-xs text-[#94A3B8] mt-2 max-w-[240px]">
              {t(lang, 'noInternetCheckOutQueued')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
