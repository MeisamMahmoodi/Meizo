// Steuert, wann ein neuer Service-Worker-Deploy die offene Seite tatsaechlich
// neu laedt. Vorher (autoUpdate + skipWaiting/clientsClaim) uebernahm ein
// neuer Service Worker zwar sofort im Hintergrund, aber die bereits offene
// Seite lief mit dem alten JS-Bundle weiter, bis sie irgendwann manuell neu
// geladen wurde — ein Mitarbeiter, der die App ueber eine ganze Schicht
// offen laesst, konnte so nach einem Deploy mit veraltetem Code gegen ein
// neues Backend-Schema laufen, ohne jeden Hinweis.
//
// Ein stilles window.location.reload() beim naechstbesten controllerchange
// waere aber selbst ein Risiko: mitten in einem Check-in/-out (GPS-Lock,
// Kamera, Upload) wuerde ein Reload den Vorgang abbrechen und z.B. ein
// gerade aufgenommenes Foto verwerfen — genau die Art Problem, die zu
// Beschwerden fuehrt. Deshalb wird ein anstehendes Update erst angewendet,
// sobald kein Check-in/-out-Vorgang mehr laeuft (siehe setBusy).

let updatePending = false;
let busy = false;
let applyFn: (() => void) | null = null;

export function setSwUpdateApplier(fn: (() => void) | null) {
  applyFn = fn;
}

export function notifySwUpdateAvailable() {
  updatePending = true;
  tryApply();
}

export function setSwUpdateBusy(value: boolean) {
  busy = value;
  if (!busy) tryApply();
}

function tryApply() {
  if (updatePending && !busy && applyFn) {
    updatePending = false;
    applyFn();
  }
}
