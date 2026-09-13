import { useState, useCallback, useEffect } from 'react';
import { Camera, MapPin, Check, X, RotateCcw, Loader2, AlertTriangle, Navigation, CloudOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { addPendingAction, isLikelyNetworkError, withTimeout } from '../../lib/offlineQueue';
import { t, type Lang } from '../../lib/i18n';
import { useCameraCapture } from '../../hooks/useCameraCapture';
import { CameraCaptureView } from '../shared/CameraCaptureView';

interface CheckInFlowProps {
  assignmentId: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  propertyLat?: number | null;
  propertyLng?: number | null;
  propertyRadiusM?: number | null;
  onSuccess: () => void;
  onQueued: () => void;
  onCancel: () => void;
  rtl?: boolean;
  lang?: Lang;
}

type Step = 'gps' | 'camera' | 'preview' | 'uploading' | 'done' | 'queued';
// 'unverified' = die Objektadresse konnte nicht geocodet werden, der Abstand
// wurde also nicht wirklich geprüft. Check-in wird trotzdem erlaubt, aber mit
// eigenem (amber statt grün) Zustand, statt fälschlich "bestätigt" zu zeigen.
type GpsState = 'idle' | 'geocoding' | 'locating' | 'ok' | 'unverified' | 'too_far' | 'error';

// Haversine distance in meters
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Geocode address via Nominatim (OSM, no key required)
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
    const data = await res.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

export function CheckInFlow({
  assignmentId, propertyId, propertyName, propertyAddress,
  propertyLat, propertyLng, propertyRadiusM,
  onSuccess, onQueued, onCancel, rtl, lang = 'de',
}: CheckInFlowProps) {
  const [step, setStep] = useState<Step>('gps');
  const [gpsState, setGpsState] = useState<GpsState>('idle');
  const [employeeCoords, setEmployeeCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [targetCoords, setTargetCoords] = useState<{ lat: number; lng: number } | null>(
    propertyLat && propertyLng ? { lat: propertyLat, lng: propertyLng } : null
  );
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const camera = useCameraCapture();

  const radius = propertyRadiusM ?? 300;

  // Auto-start GPS check on mount
  useEffect(() => { checkProximity(); }, []);

  const checkProximity = useCallback(async () => {
    setGpsState('locating');
    setGpsError('');
    setDistanceM(null);

    // 1. Get employee location
    const empCoords = await new Promise<{ lat: number; lng: number } | null>(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => {
          if (err.code === 1) setGpsError(t(lang, 'gpsPermissionDenied'));
          else setGpsError(t(lang, 'gpsUnavailable'));
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });

    if (!empCoords) { setGpsState('error'); return; }
    setEmployeeCoords(empCoords);

    // 2. Get or geocode property coords
    let propCoords = targetCoords;
    if (!propCoords) {
      setGpsState('geocoding');
      propCoords = await geocodeAddress(propertyAddress);
      if (propCoords) {
        setTargetCoords(propCoords);
        // Cache coords in DB so next time is instant
        await supabase.from('properties').update({ lat: propCoords.lat, lng: propCoords.lng }).eq('id', propertyId);
      }
    }

    if (!propCoords) {
      // Could not geocode — the distance check is genuinely skipped, so this
      // must NOT look like a confirmed "ok". Treat it as its own honest state.
      setGpsState('unverified');
      setDistanceM(null);
      return;
    }

    // 3. Compare distance
    const dist = distanceMeters(empCoords.lat, empCoords.lng, propCoords.lat, propCoords.lng);
    setDistanceM(Math.round(dist));

    if (dist <= radius) {
      setGpsState('ok');
    } else {
      setGpsState('too_far');
    }
  }, [targetCoords, propertyAddress, propertyId, radius, lang]);

  const startCamera = useCallback(async () => {
    setStep('camera');
    const ok = await camera.startCamera();
    if (!ok) {
      setUploadError(t(lang, 'cameraPermissionError'));
      setStep('gps');
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

  const uploadAndCheckIn = useCallback(async () => {
    const photoDataUrl = camera.photoDataUrl;
    if (!photoDataUrl) return;
    setStep('uploading');
    setUploadError('');
    try {
      const blob = await (await fetch(photoDataUrl)).blob();
      // Timeout um Upload + DB-Update: ohne das konnte ein haengender Request
      // bei schlechtem Netz (Keller, Aufzug, Funkloch) den "Wird hochgeladen"-
      // Screen unbegrenzt anzeigen, ohne dass die Offline-Warteschlange
      // ausgeloest wurde. Nach Ablauf zaehlt der Fehler als Netzwerkfehler und
      // wird wie gewohnt weiter unten in die Warteschlange gelegt.
      await withTimeout((async () => {
        const filename = `checkin/${assignmentId}_${Date.now()}.jpg`;
        const { error: storageErr } = await supabase.storage
          .from('assignment-photos')
          .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });
        if (storageErr) throw new Error(storageErr.message);

        const { data: urlData } = supabase.storage.from('assignment-photos').getPublicUrl(filename);

        const { error: dbErr } = await supabase.from('assignments').update({
          status: 'checked_in',
          checked_in_at: new Date().toISOString(),
          checkin_photo_url: urlData.publicUrl,
          checkin_lat: employeeCoords?.lat ?? null,
          checkin_lng: employeeCoords?.lng ?? null,
        }).eq('id', assignmentId);
        if (dbErr) throw new Error(dbErr.message);
      })());

      setStep('done');
      setTimeout(onSuccess, 1200);
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        try {
          const blob = await (await fetch(photoDataUrl)).blob();
          await addPendingAction({
            id: `checkin-${assignmentId}-${Date.now()}`,
            type: 'checkin',
            assignmentId,
            photoBlob: blob,
            lat: employeeCoords?.lat ?? null,
            lng: employeeCoords?.lng ?? null,
            createdAt: new Date().toISOString(),
          });
          setStep('queued');
          setTimeout(onQueued, 1800);
          return;
        } catch {
          // IndexedDB unavailable too — fall through to the regular error below
        }
      }
      setUploadError(err instanceof Error ? err.message : t(lang, 'checkInError'));
      setStep('preview');
    }
  }, [camera.photoDataUrl, assignmentId, employeeCoords, onSuccess, onQueued, lang]);

  const handleCancel = () => { camera.stopCamera(); onCancel(); };

  const distLabel = distanceM != null
    ? distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`
    : null;

  return (
    <div className={`fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 ${rtl ? 'text-right' : 'text-left'}`}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl overflow-hidden" style={{ maxHeight: '95dvh' }}>

        {/* GPS Step */}
        {step === 'gps' && (
          <div className="p-7">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[#0F172A]">{t(lang, 'checkIn')}</h2>
              <button onClick={handleCancel} aria-label={t(lang, 'ariaClose')} className="p-2 rounded-xl hover:bg-[#F1F5F9] transition-colors">
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>

            {/* Property card */}
            <div className="bg-[#F8FAFC] rounded-2xl p-4 mb-6">
              <p className="text-sm font-semibold text-[#0F172A]">{propertyName}</p>
              <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1.5">
                <MapPin size={11} className="shrink-0" />{propertyAddress}
              </p>
            </div>

            {uploadError && <p className="text-xs text-[#EF4444] text-center mb-4">{uploadError}</p>}

            {/* GPS Status */}
            <div className="flex flex-col items-center py-5">
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-4 transition-all ${
                gpsState === 'ok' ? 'bg-[#DCFCE7]' :
                gpsState === 'unverified' ? 'bg-[#FFF7ED]' :
                gpsState === 'too_far' ? 'bg-[#FEF2F2]' :
                gpsState === 'error' ? 'bg-[#FFF7ED]' : 'bg-[#EFF6FF]'
              }`}>
                {(gpsState === 'locating' || gpsState === 'geocoding') ? (
                  <Loader2 size={36} className="text-[#3B82F6] animate-spin" />
                ) : gpsState === 'ok' ? (
                  <Check size={36} className="text-[#22C55E]" />
                ) : gpsState === 'unverified' ? (
                  <AlertTriangle size={36} className="text-[#F97316]" />
                ) : gpsState === 'too_far' ? (
                  <Navigation size={36} className="text-[#EF4444]" />
                ) : gpsState === 'error' ? (
                  <AlertTriangle size={36} className="text-[#F97316]" />
                ) : (
                  <MapPin size={36} className="text-[#3B82F6]" />
                )}
              </div>

              {gpsState === 'idle' && (
                <p className="text-sm text-[#64748B] text-center">{t(lang, 'gpsChecking')}</p>
              )}
              {gpsState === 'locating' && (
                <p className="text-sm text-[#64748B] text-center">{t(lang, 'gpsLocating')}</p>
              )}
              {gpsState === 'geocoding' && (
                <p className="text-sm text-[#64748B] text-center">{t(lang, 'gpsGeocoding')}</p>
              )}
              {gpsState === 'ok' && (
                <div className="text-center">
                  <p className="text-sm font-bold text-[#22C55E]">{t(lang, 'gpsConfirmed')}</p>
                  {distLabel && (
                    <p className="text-xs text-[#64748B] mt-1">{distLabel} {t(lang, 'gpsAwayFromProperty')}</p>
                  )}
                </div>
              )}
              {gpsState === 'unverified' && (
                <div className="text-center">
                  <p className="text-sm font-bold text-[#F97316]">{t(lang, 'gpsUnverifiedTitle')}</p>
                  <p className="text-xs text-[#64748B] mt-1 max-w-[260px]">{t(lang, 'gpsUnverifiedDesc')}</p>
                </div>
              )}
              {gpsState === 'too_far' && (
                <div className="text-center">
                  <p className="text-sm font-bold text-[#EF4444]">{t(lang, 'gpsTooFarTitle')}</p>
                  <p className="text-xs text-[#64748B] mt-1">
                    {t(lang, 'youAreDistance')} {distLabel} {t(lang, 'gpsAwayFromProperty')}.<br />
                    {t(lang, 'allowedUpTo')} {radius} m
                  </p>
                </div>
              )}
              {gpsState === 'error' && (
                <p className="text-xs text-[#F97316] text-center max-w-[260px]">{gpsError}</p>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {(gpsState === 'too_far' || gpsState === 'error') && (
                <button onClick={checkProximity}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0] transition-colors flex items-center justify-center gap-2">
                  <RotateCcw size={15} /> {t(lang, 'retryButton')}
                </button>
              )}
              {(gpsState === 'ok' || gpsState === 'unverified') && (
                <button onClick={startCamera}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold bg-[#22C55E] text-white hover:bg-[#16A34A] transition-colors flex items-center justify-center gap-2">
                  <Camera size={16} /> {t(lang, 'photographBuilding')}
                </button>
              )}
              {gpsState === 'error' && (
                // Vorher blockierte ein GPS-Fehler (Berechtigung verweigert,
                // Timeout — z.B. im Keller) den Check-in komplett, ohne jeden
                // Ausweg ausser endlosem "erneut versuchen". Genau wie beim
                // "unverified"-Fall (Adresse nicht geocodebar) soll der
                // Check-in trotzdem moeglich sein, nur ehrlich ungeprueft.
                <button onClick={startCamera}
                  className="w-full py-3 rounded-2xl text-xs font-semibold text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F8FAFC] transition-colors flex items-center justify-center gap-2">
                  {t(lang, 'gpsCheckInAnywayButton')}
                </button>
              )}
              {gpsState === 'too_far' && (
                <p className="text-xs text-center text-[#94A3B8]">
                  {t(lang, 'mustBeOnSiteToCheckIn')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Camera Step */}
        {step === 'camera' && (
          <CameraCaptureView
            videoRef={camera.videoRef}
            canvasRef={camera.canvasRef}
            label={t(lang, 'photographBuilding')}
            onCancel={handleCancel}
            onCapture={takePhoto}
            cancelAriaLabel={t(lang, 'ariaClose')}
            captureAriaLabel={t(lang, 'ariaTakePhoto')}
          />
        )}

        {/* Preview Step */}
        {step === 'preview' && camera.photoDataUrl && (
          <div>
            <div className="relative">
              <img src={camera.photoDataUrl} alt={propertyName} className="w-full object-cover" style={{ maxHeight: '55dvh' }} />
              {employeeCoords && (
                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <MapPin size={12} className="text-[#22C55E]" />
                  <span className="text-white text-[11px] font-medium">
                    GPS: {distLabel ? `${distLabel} ${t(lang, 'ofProperty')}` : t(lang, 'gpsVerifiedShort')}
                  </span>
                </div>
              )}
            </div>
            <div className="p-6">
              <h3 className="text-base font-bold text-[#0F172A] mb-1">{t(lang, 'reviewPhotoTitle')}</h3>
              <p className="text-sm text-[#64748B] mb-5">{t(lang, 'isBuildingRecognizable')}</p>
              {uploadError && <p className="text-xs text-[#EF4444] mb-4">{uploadError}</p>}
              <div className="flex gap-3">
                <button onClick={retakePhoto} className="flex-1 py-3.5 rounded-2xl text-sm font-semibold bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0] transition-colors flex items-center justify-center gap-2">
                  <RotateCcw size={15} /> {t(lang, 'retakeButton')}
                </button>
                <button onClick={uploadAndCheckIn} className="flex-1 py-3.5 rounded-2xl text-sm font-semibold bg-[#22C55E] text-white hover:bg-[#16A34A] transition-colors flex items-center justify-center gap-2">
                  <Check size={15} /> {t(lang, 'checkIn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Uploading */}
        {step === 'uploading' && (
          <div className="p-10 flex flex-col items-center justify-center" style={{ minHeight: '40dvh' }}>
            <Loader2 size={40} className="text-[#22C55E] animate-spin mb-5" />
            <p className="text-sm font-semibold text-[#0F172A]">{t(lang, 'checkIn')}...</p>
            <p className="text-lg font-extrabold text-[#DC2626] text-center mt-5">{t(lang, 'dontCloseAppUploading')}</p>
            {/* Ohne diesen Ausweg war der Mitarbeiter bei einem haengenden
                Request im Vollbild gefangen und musste die App gewaltsam
                schliessen, wodurch der Versuch spurlos verloren ging. */}
            <button onClick={handleCancel} className="mt-6 text-xs font-semibold text-[#94A3B8] hover:text-[#64748B] transition-colors">
              {t(lang, 'cancelUploadButton')}
            </button>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="p-10 flex flex-col items-center justify-center" style={{ minHeight: '40dvh' }}>
            <div className="w-20 h-20 rounded-3xl bg-[#DCFCE7] flex items-center justify-center mb-5">
              <Check size={40} className="text-[#22C55E]" />
            </div>
            <p className="text-lg font-bold text-[#0F172A]">{t(lang, 'checkedInExclaim')}</p>
            <p className="text-sm text-[#64748B] mt-1">{new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} {t(lang, 'clock')}</p>
          </div>
        )}

        {/* Queued — no network, will sync automatically */}
        {step === 'queued' && (
          <div className="p-10 flex flex-col items-center justify-center text-center" style={{ minHeight: '40dvh' }}>
            <div className="w-20 h-20 rounded-3xl bg-[#FFF7ED] flex items-center justify-center mb-5">
              <CloudOff size={40} className="text-[#F97316]" />
            </div>
            <p className="text-lg font-bold text-[#0F172A]">{t(lang, 'checkedInExclaim')}</p>
            <p className="text-sm text-[#64748B] mt-1 max-w-[240px]">
              {t(lang, 'noInternetCheckInQueued')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
