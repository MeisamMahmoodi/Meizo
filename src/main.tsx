import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setSwUpdateApplier, notifySwUpdateAvailable } from './lib/swUpdate';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Der Service Worker (vite-plugin-pwa, autoUpdate) uebernimmt neue Versionen
// im Hintergrund sofort (skipWaiting + clientsClaim), ohne die offene Seite
// neu zu laden. Damit ein Mitarbeiter nicht stundenlang mit veraltetem JS
// gegen ein neueres Backend-Schema laeuft, wird hier auf den Wechsel des
// aktiven Controllers gehoert und ein Reload ueber swUpdate.ts angestossen —
// der aber erst greift, sobald kein Check-in/-out mehr laeuft (siehe dort).
if ('serviceWorker' in navigator) {
  setSwUpdateApplier(() => {
    window.location.reload();
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    notifySwUpdateAvailable();
  });

  // Regelmaessig aktiv nach einer neuen Version fragen, falls die Seite
  // lange offen bleibt (z.B. eine ganze Schicht) und der Browser von sich
  // aus nicht bald genug nachschaut.
  const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {
          // Kein Netz o.ae. — beim naechsten Intervall erneut versuchen.
        });
      }, UPDATE_CHECK_INTERVAL_MS);

      // Auf iOS wird die als Home-Bildschirm-App installierte PWA im
      // Hintergrund komplett pausiert — kein Timer/Interval laeuft dann
      // weiter. Ein "Wiedereroeffnen" ist dort technisch oft kein echter
      // Seiten-Neuladen, sondern nur ein Fortsetzen des pausierten
      // Zustands, wodurch der obige Intervall-Check faktisch nie zum
      // Zug kommt und Mitarbeiter dauerhaft auf einer alten Version
      // haengen blieben (nur ein komplettes Loeschen + Neuinstallieren
      // der App erzwang einen echten Neuladen). visibilitychange feuert
      // beim Zurueckkehren aus dem Hintergrund dagegen zuverlaessig,
      // deshalb hier zusaetzlich direkt bei jedem Vordergrund-Wechsel
      // nach einem Update fragen.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {
            // Kein Netz o.ae. — naechster Vordergrund-Wechsel versucht es erneut.
          });
        }
      });
    });
  });
}
