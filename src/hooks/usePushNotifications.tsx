import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Wartet auf navigator.serviceWorker.ready, aber nicht ewig. Vorher: ohne
// aktiven/registrierten Service Worker (z.B. normaler Browser-Tab statt
// installierter PWA, oder eine fehlgeschlagene SW-Registrierung) haengte
// dieses Promise fuer immer, der "Aktivieren"-Button blieb dauerhaft im
// Ladezustand haengen, ohne jede Rueckmeldung fuer den Mitarbeiter.
function serviceWorkerReadyWithTimeout(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Service Worker nicht bereit (Timeout)')), timeoutMs);
    }),
  ]);
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications(employeeId: string | null) {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  // Grund fuer ein fehlgeschlagenes subscribe() — vorher gab es dafuer keine
  // sichtbare Rueckmeldung, der Button schien einfach nichts zu tun.
  const [error, setError] = useState<string | null>(null);

  // Check current state on mount and sync browser subscription to DB
  useEffect(() => {
    if (!employeeId) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported');
      return;
    }
    const currentPermission = Notification.permission as PushPermission;
    setPermission(currentPermission);

    // If permission already granted, re-sync the browser's current subscription to DB
    // This handles stale/expired endpoints by always keeping DB up to date
    if (currentPermission === 'granted' && VAPID_PUBLIC_KEY) {
      (async () => {
        try {
          const reg = await navigator.serviceWorker.ready;
          const pushSub = await reg.pushManager.getSubscription();
          if (pushSub) {
            const json = pushSub.toJSON();
            await supabase.from('push_subscriptions').upsert(
              { employee_id: employeeId, endpoint: json.endpoint!, p256dh: json.keys!.p256dh!, auth: json.keys!.auth!, updated_at: new Date().toISOString() },
              { onConflict: 'employee_id' }
            );
            setSubscribed(true);
          } else {
            // Browser has no subscription despite permission granted — check DB
            const { data } = await supabase.from('push_subscriptions').select('id').eq('employee_id', employeeId).maybeSingle();
            setSubscribed(!!data);
          }
        } catch {
          const { data } = await supabase.from('push_subscriptions').select('id').eq('employee_id', employeeId).maybeSingle();
          setSubscribed(!!data);
        }
      })();
    } else {
      // Check if already subscribed in DB
      supabase
        .from('push_subscriptions')
        .select('id')
        .eq('employee_id', employeeId)
        .maybeSingle()
        .then(({ data, error: dbError }) => {
          if (dbError) console.error('Push subscription check failed:', dbError);
          setSubscribed(!!data);
        });
    }
  }, [employeeId]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!employeeId) return false;
    setError(null);

    // Vorher: dieser Fall gab direkt "false" zurueck, ohne setLoading(true)
    // je aufzurufen und ohne jede Fehlermeldung — der Button reagierte nach
    // aussen so, als waere gar nichts passiert.
    if (!VAPID_PUBLIC_KEY) {
      console.error('Push-Benachrichtigungen: VITE_VAPID_PUBLIC_KEY ist nicht gesetzt.');
      setError('Benachrichtigungen sind auf diesem Server aktuell nicht eingerichtet.');
      return false;
    }

    setLoading(true);
    try {
      const reg = await serviceWorkerReadyWithTimeout();

      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') { setLoading(false); return false; }

      // Subscribe to push
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = pushSub.toJSON();
      const endpoint = json.endpoint!;
      const p256dh = json.keys!.p256dh!;
      const auth = json.keys!.auth!;

      // Save to DB (upsert — handles re-subscription)
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({ employee_id: employeeId, endpoint, p256dh, auth, updated_at: new Date().toISOString() },
          { onConflict: 'employee_id' });

      if (dbError) throw dbError;
      setSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('Push subscribe failed:', err);
      setError('Benachrichtigungen konnten nicht aktiviert werden. Bitte versuche es erneut.');
      setLoading(false);
      return false;
    }
  }, [employeeId]);

  const unsubscribe = useCallback(async () => {
    if (!employeeId) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const pushSub = await reg.pushManager.getSubscription();
      await pushSub?.unsubscribe();
      await supabase.from('push_subscriptions').delete().eq('employee_id', employeeId);
      setSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }
  }, [employeeId]);

  return { permission, subscribed, loading, error, subscribe, unsubscribe };
}

// Utility: send a push notification from the owner side (calls edge function)
export async function sendPushToEmployee(
  employeeId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return false;

    const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ employee_id: employeeId, title, body, data }),
    });
    const json = await res.json();
    return json.ok === true;
  } catch {
    return false;
  }
}
