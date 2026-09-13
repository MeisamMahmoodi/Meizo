// Lightweight IndexedDB-backed queue for check-in/check-out actions that
// couldn't be uploaded immediately (e.g. no network on-site). Entries survive
// app/browser restarts and are retried automatically by useOfflineSync.

const DB_NAME = 'meizo-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending_actions';

export interface PendingCheckIn {
  id: string;
  type: 'checkin';
  assignmentId: string;
  photoBlob: Blob;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

export interface PendingCheckOut {
  id: string;
  type: 'checkout';
  assignmentId: string;
  photoBlob: Blob;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  // Labels of checklist items ticked off before checkout, if the property
  // type has a checklist defined. Recorded once the checkout actually syncs.
  checklistItems?: string[];
}

export type PendingAction = PendingCheckIn | PendingCheckOut;

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addPendingAction(action: PendingAction): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingActions(): Promise<PendingAction[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as PendingAction[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removePendingAction(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Heuristic: only queue actions that failed because of a network problem.
// Real errors (validation, permissions, etc.) should surface to the user
// immediately instead of silently retrying forever.
export function isLikelyNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes('fetch') || message.includes('network') || message.includes('failed to fetch') || message.includes('meizo_timeout');
}

// How long a check-in/check-out upload is allowed to hang before we treat it
// as failed. Without this, a stalled request on bad mobile network (elevator,
// basement, rural coverage) never resolves — the "Wird hochgeladen"-screen
// would spin forever with no way for the employee to know what happened.
export const UPLOAD_TIMEOUT_MS = 30000;

// Races a promise against a timeout so a hung Supabase call surfaces as a
// (network-classified) error instead of hanging indefinitely — the caller's
// existing catch/isLikelyNetworkError path then queues it for retry like any
// other connectivity failure.
export function withTimeout<T>(promise: PromiseLike<T>, ms: number = UPLOAD_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MEIZO_TIMEOUT: Keine Antwort vom Server')), ms);
    Promise.resolve(promise).then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}
