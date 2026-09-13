import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getPendingActions, removePendingAction, type PendingAction } from '../lib/offlineQueue';

// Retries queued check-in/check-out actions (see offlineQueue.ts) whenever the
// app loads and whenever the browser regains connectivity. Successfully
// synced actions are removed from the queue and `onSynced` is called so the
// caller can refresh its data from the server.
export function useOfflineSync(onSynced?: () => void) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  // Re-Entrancy-Schutz: Der Mount-Effekt und der 'online'-Event konnten sich
  // bei instabiler Verbindung ueberlappen (z.B. 'online' feuert mehrfach kurz
  // hintereinander) und denselben wartenden Eintrag doppelt verarbeiten — vor
  // allem bei Checklisten-Eintraegen ohne eigenen Duplikat-Schutz. Ein Ref
  // (statt State) wirkt sofort, ohne auf den naechsten Render zu warten.
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    const actions = await getPendingActions();
    setPendingCount(actions.length);
    return actions;
  }, []);

  const syncOne = useCallback(async (action: PendingAction): Promise<boolean> => {
    try {
      const folder = action.type === 'checkin' ? 'checkin' : 'checkout';
      const filename = `${folder}/${action.assignmentId}_${Date.now()}.jpg`;
      const { error: storageErr } = await supabase.storage
        .from('assignment-photos')
        .upload(filename, action.photoBlob, { contentType: 'image/jpeg', upsert: true });
      if (storageErr) return false;

      const { data: urlData } = supabase.storage.from('assignment-photos').getPublicUrl(filename);

      const update = action.type === 'checkin'
        ? {
            status: 'checked_in' as const,
            checked_in_at: action.createdAt,
            checkin_photo_url: urlData.publicUrl,
            checkin_lat: action.lat,
            checkin_lng: action.lng,
          }
        : {
            status: 'completed' as const,
            completed_at: action.createdAt,
            checkout_photo_url: urlData.publicUrl,
            checkout_lat: action.lat,
            checkout_lng: action.lng,
          };

      const { error: dbErr } = await supabase.from('assignments').update(update).eq('id', action.assignmentId);
      if (dbErr) return false;

      if (action.type === 'checkout' && action.checklistItems && action.checklistItems.length > 0) {
        // Best-effort: the checkout itself already succeeded above, so we
        // don't want a checklist-insert failure to re-queue the whole action.
        await supabase.from('checklist_completions').insert(
          action.checklistItems.map(label => ({ assignment_id: action.assignmentId, item_label: label }))
        );
      }

      await removePendingAction(action.id);
      return true;
    } catch {
      return false;
    }
  }, []);

  const syncAll = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const actions = await getPendingActions();
      let anySucceeded = false;
      for (const action of actions) {
        const ok = await syncOne(action);
        if (ok) anySucceeded = true;
      }
      await refresh();
      if (anySucceeded) onSynced?.();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncOne, refresh]);

  useEffect(() => {
    refresh();
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      syncAll();
    }
    const handleOnline = () => syncAll();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingCount, syncing, refresh, syncAll };
}
