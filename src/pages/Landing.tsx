import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Check, MapPin, Clock, Users, MessageCircle, Globe2, Shield, FileText } from 'lucide-react';
import { BASE_FEE_EUR, PER_EMPLOYEE_EUR, calculateMonthlyPrice } from '../lib/plans';

/* ---------- Shared building blocks ---------- */

function RevealOnScroll({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
    >
      {children}
    </div>
  );
}

function PhoneMockup({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#0B0B0F] rounded-[2rem] p-2.5 shadow-[0_20px_60px_-10px_rgba(15,23,42,0.25)] w-full max-w-[260px] mx-auto">
      <div className="bg-white rounded-[1.6rem] overflow-hidden relative min-h-[340px]">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-[#0B0B0F] rounded-full z-10" />
        <div className="pt-8">{children}</div>
      </div>
    </div>
  );
}

function BrowserMockup({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-[0_16px_48px_-12px_rgba(15,23,42,0.15)] overflow-hidden">
      <div className="bg-[#F3F4F6] px-4 py-2.5 flex items-center gap-2 border-b border-[#E5E7EB]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-2 text-[11px] text-[#6B7280] bg-white border border-[#E5E7EB] rounded px-2 py-0.5 flex-1 truncate">{url}</span>
      </div>
      {children}
    </div>
  );
}

/* ---------- Nav ---------- */

function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-[#F1F5F9]">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/apple-touch-icon.png" alt="meizo" className="w-8 h-8 rounded-lg" />
          <span className="font-bold text-lg text-[#0F172A] tracking-tight">meizo</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/login" className="text-sm font-semibold text-[#334155] px-4 py-2 rounded-lg hover:bg-[#F1F5F9] transition-colors">
            Anmelden
          </a>
          <a
            href="/register"
            className="text-sm font-bold text-white bg-[#16A34A] px-4 py-2 rounded-lg hover:bg-[#15803D] transition-colors shadow-sm"
          >
            Kostenloses Konto erstellen →
          </a>
        </div>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */

function HeroVisual() {
  const [solved, setSolved] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setSolved(s => !s), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_20px_60px_-10px_rgba(15,23,42,0.15)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] animate-pulse" />
        <span className="text-xs font-bold text-[#991B1B] uppercase tracking-wide">Krankmeldung · 06:47 Uhr</span>
      </div>
      <div className="bg-[#F8FAFC] rounded-xl p-4 mb-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#FEE2E2] text-[#DC2626] font-bold text-sm flex items-center justify-center shrink-0">AY</div>
        <div>
          <p className="text-sm font-semibold text-[#0F172A]">Anis Yildiz</p>
          <p className="text-xs text-[#64748B]">📍 Objekt Müller · 07:30 Uhr</p>
        </div>
      </div>
      <div className={`rounded-xl p-4 border transition-colors duration-500 ${solved ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-[#FFF7ED] border-[#FED7AA]'}`}>
        {!solved ? (
          <p className="text-sm font-semibold text-[#9A3412]">🔍 meizo sucht automatisch einen Ersatz …</p>
        ) : (
          <p className="text-sm font-bold text-[#15803D]">✓ Fatima übernimmt — 90 Sekunden später</p>
        )}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#DC2626] mb-4">Reinigungsfirmen kennen das</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-[#0F172A] tracking-tight leading-[1.05]">
          Es ist 06:47 Uhr.<br />Eine Krankmeldung kommt rein.
        </h1>
        <p className="text-lg text-[#475569] mt-5 leading-relaxed max-w-lg">
          Statt WhatsApp-Rundruf und Durchtelefonieren sucht meizo automatisch einen Ersatz per App-Benachrichtigung — während Sie noch Ihren Kaffee trinken.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/register" className="bg-[#0F172A] text-white font-bold px-6 py-3.5 rounded-2xl hover:bg-[#1E293B] transition-colors shadow-sm">
            Kostenloses Konto erstellen und testen →
          </a>
          <a href="/pricing" className="bg-white text-[#0F172A] font-bold px-6 py-3.5 rounded-2xl border border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors">
            Preis berechnen
          </a>
        </div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-[#64748B]">
          <span>🇩🇪 München</span>
          <span>Erster Monat kostenlos</span>
          <span>Keine Vertragsbindung</span>
        </div>
      </div>
      <HeroVisual />
    </section>
  );
}

/* ---------- Problem ---------- */

function ProblemSection() {
  const cards = [
    { title: 'Stundenzettel & WhatsApp-Chaos', text: 'Krankmeldungen, Ersatzsuche und Arbeitszeiten laufen über 3 verschiedene Kanäle, die nichts voneinander wissen.' },
    { title: 'Keine Übersicht bei Ausfällen', text: 'Wer ist krank, wer ist frei, wer könnte einspringen? Ohne System steckt das alles im Kopf des Chefs.' },
    { title: 'Nachweise fehlen beim Kunden', text: 'Wurde wirklich geputzt, wann, von wem? Ohne Foto- und GPS-Nachweis bleibt nur Ihr Wort gegen das des Kunden.' },
  ];
  return (
    <section className="bg-[#F8FAFC] py-16 border-y border-[#F1F5F9]">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <RevealOnScroll>
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">Das Problem</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight mb-10">Kommt Ihnen das bekannt vor?</h2>
        </RevealOnScroll>
        <div className="grid sm:grid-cols-3 gap-5">
          {cards.map(c => (
            <RevealOnScroll key={c.title}>
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 h-full">
                <h3 className="font-bold text-[#0F172A] mb-2">{c.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{c.text}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Stats (Vorher/Nachher) ---------- */

function StatsSection() {
  return (
    <RevealOnScroll className="max-w-4xl mx-auto px-5 sm:px-6 py-14">
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#991B1B] mb-2">Ohne meizo</p>
          <p className="text-5xl font-extrabold text-[#DC2626] tracking-tight">52 Min.</p>
          <p className="text-sm text-[#991B1B] mt-2">8 Nachrichten, kein Springer gefunden</p>
        </div>
        <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#15803D] mb-2">Mit meizo</p>
          <p className="text-5xl font-extrabold text-[#16A34A] tracking-tight">90 Sek.</p>
          <p className="text-sm text-[#15803D] mt-2">Ein Klick, Ersatz bestätigt</p>
        </div>
      </div>
    </RevealOnScroll>
  );
}

/* ---------- Feature demos ---------- */

function DispatchDemo() {
  const [phase, setPhase] = useState<'asking1' | 'asking2' | 'success'>('asking1');
  const [seconds, setSeconds] = useState(8);

  useEffect(() => {
    if (phase === 'success') {
      const t = setTimeout(() => { setPhase('asking1'); setSeconds(8); }, 3000);
      return () => clearTimeout(t);
    }
    if (seconds <= 0) {
      const t = setTimeout(() => {
        if (phase === 'asking1') { setPhase('asking2'); setSeconds(5); } else { setPhase('success'); }
      }, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSeconds(s => s - 1), 650);
    return () => clearTimeout(t);
  }, [phase, seconds]);

  const candidate = phase === 'asking1' ? 'Maximilian Schulz' : 'Fatima Al-Hassan';

  return (
    <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-2xl p-6 max-w-sm mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#FEE2E2] text-[#DC2626] font-bold text-sm flex items-center justify-center">AY</div>
        <div>
          <p className="font-bold text-sm text-[#0F172A]">Anis Yildiz</p>
          <span className="text-[11px] font-bold text-[#DC2626] bg-[#FEE2E2] px-2 py-0.5 rounded-full">Krankgemeldet</span>
        </div>
      </div>
      <div className="bg-white rounded-xl p-3.5 mb-3">
        <p className="text-sm font-bold text-[#0F172A]">📍 Objekt Müller</p>
        <p className="text-xs text-[#64748B] mt-0.5">07:30 – 09:30 Uhr</p>
      </div>
      {/* min-h + flex/justify-center: der "übernimmt"-Zustand hat nur eine
          Textzeile, der Warte-Zustand zwei. Ohne feste Mindesthöhe schrumpft
          die Box beim Wechsel und alles darunter rutscht mit hoch/runter. */}
      <div className={`rounded-xl p-3.5 border transition-colors duration-300 min-h-[70px] flex flex-col justify-center ${phase === 'success' ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-white border-[#FED7AA]'}`}>
        {phase !== 'success' ? (
          <>
            <p className="text-sm flex items-center gap-1.5"><MessageCircle size={13} className="text-[#16A34A]" /> <span className="font-bold text-[#0F172A]">{candidate}</span> <span className="text-[#6B7280]">wird per App-Push gefragt</span></p>
            <p className="text-xs text-[#94A3B8] mt-1.5">⏱ Antwort in 0:0{seconds} Min</p>
          </>
        ) : (
          <p className="text-sm font-bold text-[#15803D]">✓ {candidate} übernimmt · 30,00 €</p>
        )}
      </div>
    </div>
  );
}

function CheckInDemo() {
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setChecked(c => !c), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <PhoneMockup>
      <div className="px-5 pb-5">
        <p className="text-xs font-semibold text-[#94A3B8] mb-3">GPS-Check-in</p>
        <div
          className="relative h-32 rounded-xl overflow-hidden mb-4"
          style={{
            backgroundColor: '#EEF2F7',
            backgroundImage: 'linear-gradient(#E2E8F0 1px, transparent 1px), linear-gradient(90deg, #E2E8F0 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#16A34A] z-10 shadow-[0_0_0_4px_rgba(22,163,74,0.18)]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#16A34A] animate-ping" />
        </div>
        <div className={`rounded-xl p-3.5 text-center border transition-colors duration-300 ${checked ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-[#F8FAFC] border-[#E2E8F0]'}`}>
          {checked ? (
            <>
              <div className="w-9 h-9 rounded-full bg-[#16A34A] flex items-center justify-center mx-auto">
                <Check className="text-white" size={16} strokeWidth={3} />
              </div>
              <p className="text-xs font-bold text-[#15803D] mt-2">Standort bestätigt ✓</p>
            </>
          ) : (
            <p className="text-xs font-semibold text-[#64748B]">Wird geprüft …</p>
          )}
        </div>
      </div>
    </PhoneMockup>
  );
}

function ChecklistDemo() {
  const items = ['Böden gewischt', 'Mülleimer geleert', 'Fenster geputzt'];
  const [done, setDone] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDone(d => (d + 1) % (items.length + 1)), 850);
    return () => clearInterval(t);
  }, [items.length]);
  return (
    <PhoneMockup>
      <div className="px-5 pb-5">
        <p className="text-xs font-semibold text-[#94A3B8] mb-3">Checkliste vor dem Beweisfoto</p>
        <div className="space-y-2">
          {items.map((label, i) => {
            const isDone = i < done;
            return (
              <div key={label} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-colors duration-300 ${isDone ? 'bg-[#FFF7ED] border-[#FED7AA]' : 'bg-[#F8FAFC] border-[#E2E8F0]'}`}>
                <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors duration-300 ${isDone ? 'bg-[#F97316]' : 'bg-white border border-[#CBD5E1]'}`}>
                  {isDone && <Check size={12} className="text-white" strokeWidth={3} />}
                </span>
                <span className={`text-xs ${isDone ? 'text-[#0F172A] font-semibold' : 'text-[#64748B]'}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </PhoneMockup>
  );
}

function CustomerReportDemo() {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setSent(s => !s), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_16px_48px_-12px_rgba(15,23,42,0.15)] max-w-sm mx-auto overflow-hidden">
      <div className="bg-[#0F172A] px-5 py-3 flex items-center justify-between">
        <span className="text-xs font-bold text-white tracking-wide">LEISTUNGSNACHWEIS</span>
        <FileText size={14} className="text-white/70" />
      </div>
      <div className="p-5">
        <p className="text-sm font-bold text-[#0F172A]">Objekt Müller · 14.07.2026</p>
        <p className="text-xs text-[#64748B] mt-0.5">07:30 – 09:32 Uhr · Anis Yildiz</p>
        <span className="inline-block text-[11px] font-bold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-full mt-2">
          ✓ Vor Ort bestätigt (GPS)
        </span>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="h-14 rounded-lg bg-[#F1F5F9] flex items-center justify-center text-[10px] text-[#94A3B8] font-semibold">Vorher-Foto</div>
          <div className="h-14 rounded-lg bg-[#F1F5F9] flex items-center justify-center text-[10px] text-[#94A3B8] font-semibold">Nachher-Foto</div>
        </div>
        <div className="mt-4 space-y-1.5">
          {['Böden gewischt', 'Mülleimer geleert', 'Fenster geputzt'].map(l => (
            <div key={l} className="flex items-center gap-2 text-xs text-[#334155]">
              <Check size={11} className="text-[#16A34A]" strokeWidth={3} /> {l}
            </div>
          ))}
        </div>
        <div className={`mt-4 rounded-xl p-3 text-center border transition-colors duration-300 ${sent ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-[#F8FAFC] border-[#E2E8F0]'}`}>
          {sent ? (
            <p className="text-xs font-bold text-[#15803D]">✓ Als PDF an Hausverwaltung gesendet</p>
          ) : (
            <p className="text-xs font-semibold text-[#64748B]">PDF wird erstellt …</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BillingDemo() {
  const rows = [
    ['Ionut P.', 'Wohnung Müller', '0,50', '7,50 €'],
    ['Mustafa Y.', 'Büropark Schwabing', '2,50', '35,00 €'],
    ['Anna K.', 'Praxis Bogenhausen', '2,00', '30,00 €'],
  ];
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setVisible(v => (v + 1) % (rows.length + 1)), 750);
    return () => clearInterval(t);
  }, [rows.length]);
  return (
    <BrowserMockup url="meizo.de · Abrechnung_2026-05.csv">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[#64748B]">DATEV-Export</span>
          <span className="text-[11px] font-bold text-white bg-[#16A34A] px-2.5 py-1 rounded-md">↓ CSV</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[#94A3B8] border-b border-[#F1F5F9]">
              <th className="py-1.5 font-semibold">Name</th>
              <th className="font-semibold">Objekt</th>
              <th className="font-semibold">Std.</th>
              <th className="font-semibold">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {/* Alle Zeilen bleiben im DOM und werden nur ein-/ausgeblendet
                (statt gemountet/entmountet) — sonst ändert sich laufend die
                Tabellenhöhe, was auf dem Handy (eine Spalte statt zwei) den
                ganzen restlichen Seiteninhalt mit nach oben/unten zieht. */}
            {rows.map((r, i) => (
              <tr key={r[0]} className="border-b border-[#F8FAFC] transition-opacity duration-300" style={{ opacity: i < visible ? 1 : 0 }}>
                <td className="py-1.5 font-medium text-[#0F172A]">{r[0]}</td>
                <td className="text-[#64748B]">{r[1]}</td>
                <td className="text-[#64748B]">{r[2]}</td>
                <td className="font-semibold text-[#16A34A]">{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BrowserMockup>
  );
}

function ControllingDemo() {
  const properties = [
    { name: 'Büropark Schwabing', marge: 34, pct: 78 },
    { name: 'Praxis Bogenhausen', marge: 18, pct: 102 },
    { name: 'Supermarkt Ost', marge: 41, pct: 60 },
  ];
  const totalUmsatz = 2750;
  const avgMarge = Math.round(properties.reduce((s, p) => s + p.marge, 0) / properties.length);
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setVisible(v => (v + 1) % (properties.length + 1)), 750);
    return () => clearInterval(t);
  }, [properties.length]);

  const margeColor = (m: number) => (m < 10 ? '#DC2626' : m < 25 ? '#F97316' : '#16A34A');
  const ringCirc = 2 * Math.PI * 26;
  const ringOffset = ringCirc * (1 - avgMarge / 100);

  return (
    <BrowserMockup url="meizo.de · Controlling">
      <div className="p-4">
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-[#F1F5F9]">
          <div className="relative w-14 h-14 shrink-0">
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="26" fill="none" stroke="#F1F5F9" strokeWidth="5" />
              <circle
                cx="28" cy="28" r="26" fill="none" stroke={margeColor(avgMarge)} strokeWidth="5"
                strokeDasharray={ringCirc} strokeDashoffset={ringOffset} strokeLinecap="round"
                transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#0F172A]">{avgMarge}%</div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">Marge gesamt</p>
            <p className="text-lg font-bold text-[#0F172A]">{totalUmsatz.toLocaleString('de-DE')} € Umsatz</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {/* Alle Zeilen bleiben im DOM und werden nur ein-/ausgeblendet,
              nicht gemountet/entmountet — gleicher Fix wie bei BillingDemo,
              damit die Boxhöhe stabil bleibt und auf dem Handy nichts
              darunter mit hoch- und runterrutscht. */}
          {properties.map((p, i) => (
            <div key={p.name} className="text-xs transition-opacity duration-300" style={{ opacity: i < Math.max(visible, 1) ? 1 : 0 }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[#0F172A] truncate">{p.name}</span>
                <span
                  className="font-bold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ color: margeColor(p.marge), backgroundColor: `${margeColor(p.marge)}1A` }}
                >
                  {p.marge}% Marge
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, p.pct)}%`, backgroundColor: p.pct > 100 ? '#DC2626' : '#16A34A' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </BrowserMockup>
  );
}

function LanguageDemo() {
  const langs = [
    { flag: '🇩🇪', name: 'Deutsch', greet: 'Guten Morgen' },
    { flag: '🇷🇴', name: 'Română', greet: 'Bună ziua' },
    { flag: '🇹🇷', name: 'Türkçe', greet: 'Günaydın' },
    { flag: '🇵🇱', name: 'Polski', greet: 'Dzień dobry' },
    { flag: '🇸🇦', name: 'عربي', greet: 'RTL-Layout' },
    { flag: '🇧🇬', name: 'Български', greet: 'Добро утро' },
  ];
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % langs.length), 1000);
    return () => clearInterval(t);
  }, [langs.length]);
  return (
    <div className="grid grid-cols-3 gap-2.5 max-w-sm mx-auto">
      {langs.map((l, i) => (
        <div
          key={l.name}
          className={`rounded-xl border p-3 text-center transition-all duration-300 ${active === i ? 'border-[#16A34A] bg-[#F0FDF4] scale-105 shadow-sm' : 'border-[#E2E8F0] bg-white'}`}
        >
          <div className="text-2xl mb-1">{l.flag}</div>
          <div className="text-xs font-bold text-[#0F172A]">{l.name}</div>
          <div className="text-[10px] text-[#94A3B8]">{l.greet}</div>
        </div>
      ))}
    </div>
  );
}

function RecurringDemo() {
  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
  const [filled, setFilled] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFilled(f => (f + 1) % (days.length + 2)), 500);
    return () => clearInterval(t);
  }, [days.length]);
  return (
    <BrowserMockup url="meizo.de · Serientermin">
      <div className="p-5">
        <p className="text-xs font-semibold text-[#64748B] mb-3">Büropark Schwabing · Mo–Fr, 06:00–08:00</p>
        <div className="grid grid-cols-5 gap-2">
          {days.map((d, i) => (
            <div key={d} className="text-center">
              <div className="text-[10px] text-[#94A3B8] mb-1">{d}</div>
              <div className={`h-11 rounded-lg border flex items-center justify-center transition-colors duration-300 ${i < filled ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-[#F8FAFC] border-[#E2E8F0] border-dashed'}`}>
                {i < filled && <Check size={13} className="text-[#16A34A]" strokeWidth={3} />}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#94A3B8] mt-3">Einmal eingestellt — läuft automatisch jede Woche.</p>
      </div>
    </BrowserMockup>
  );
}

/* ---------- Modules ---------- */

interface ModuleProps {
  eyebrow: string;
  eyebrowColor: string;
  title: string;
  text: string;
  bullets: string[];
  visual: ReactNode;
  reverse?: boolean;
}

function Module({ eyebrow, eyebrowColor, title, text, bullets, visual, reverse }: ModuleProps) {
  return (
    <RevealOnScroll>
      <div className={`grid lg:grid-cols-2 gap-12 items-center py-14 ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: eyebrowColor }}>{eyebrow}</p>
          <h3 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight mb-4">{title}</h3>
          <p className="text-[#475569] leading-relaxed mb-5">{text}</p>
          <ul className="space-y-2.5">
            {bullets.map(b => (
              <li key={b} className="flex items-center gap-2.5 text-sm text-[#334155] font-medium">
                <span className="w-5 h-5 rounded-full bg-[#F0FDF4] flex items-center justify-center shrink-0">
                  <Check size={11} className="text-[#16A34A]" strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div>{visual}</div>
      </div>
    </RevealOnScroll>
  );
}

function ModulesSection() {
  return (
    <section className="max-w-6xl mx-auto px-5 sm:px-6 divide-y divide-[#F1F5F9]">
      <Module
        eyebrow="Das hat kein anderer"
        eyebrowColor="#7C3AED"
        title="Automatische Ersatzsuche bei Krankmeldung"
        text="Meldet sich jemand krank, fragt meizo selbst die passenden Kollegen per App-Benachrichtigung an — mit Kontext zu Ort und Uhrzeit. Sie sehen live, wer annimmt oder ablehnt, kein Rätselraten wie bei WhatsApp."
        bullets={['Läuft automatisch, ohne Ihr Zutun', 'Echte Zu-/Absage statt ungelesener Nachricht', 'Sie behalten jederzeit die manuelle Kontrolle']}
        visual={<DispatchDemo />}
      />
      <Module
        eyebrow="Nachweis & Vertrauen"
        eyebrowColor="#16A34A"
        title="GPS-Check-in mit Foto-Nachweis"
        text="Ihre Mitarbeiter checken vor Ort ein — mit Standortprüfung und Foto. Sie sehen live, wer wo ist, ohne nachzufragen."
        bullets={['Fälschungssicherer Nachweis fürs Kundengespräch', 'Live-Status ohne Anruf', 'Automatisch in der Abrechnung erfasst']}
        visual={<CheckInDemo />}
        reverse
      />
      <Module
        eyebrow="Qualität"
        eyebrowColor="#F97316"
        title="Checklisten machen Sie professioneller"
        text="Objekttyp-Checkliste vor jedem Beweisfoto — Sie sehen vor Ihrem Kunden aus wie ein Profi, nicht wie Zettelwirtschaft."
        bullets={['Pro Objekttyp individuell einstellbar', 'Automatisch im Kundenbericht', 'Weniger Reklamationen']}
        visual={<ChecklistDemo />}
      />
      <Module
        eyebrow="Das hat kein anderer"
        eyebrowColor="#3B82F6"
        title="Leistungsnachweis, den Ihr Kunde sofort glaubt"
        text="Statt 'wurde wirklich geputzt?' schicken Sie einen fertigen PDF-Nachweis — mit Uhrzeit, GPS-Bestätigung, Vorher/Nachher-Fotos und abgehakter Checkliste. Ein Klick, direkt an die Hausverwaltung."
        bullets={['Automatisch aus jedem Einsatz erstellt', 'GPS-, Foto- und Checklisten-Nachweis in einem Dokument', 'Weniger Diskussionen, weniger Reklamationen']}
        visual={<CustomerReportDemo />}
      />
      <Module
        eyebrow="Abrechnung"
        eyebrowColor="#0F172A"
        title="Zeiterfassung, die sich von selbst rechnet"
        text="Jeder Check-in und Check-out landet automatisch in der Abrechnung — mit GPS- und Foto-Nachweis, fertig für Steuerberater und Mitarbeiter."
        bullets={['DATEV-Export nach einmaliger Einrichtung mit dem Steuerberater', 'Lohnabrechnung als PDF pro Mitarbeiter', 'Keine abgetippten Stundenzettel mehr']}
        visual={<BillingDemo />}
        reverse
      />
      <Module
        eyebrow="Wirtschaftlichkeit"
        eyebrowColor="#0D9488"
        title="Welches Objekt sich wirklich lohnt, sehen Sie sofort"
        text="Umsatz, Personalkosten und Marge pro Objekt werden automatisch aus echten Check-in-/Check-out-Zeiten berechnet — kein Excel, keine Schätzung. Verlustobjekte fallen sofort auf, bevor sie zum Problem werden."
        bullets={['Marge pro Objekt in Echtzeit, ohne Excel', 'Soll-Ist-Stunden zeigen Über- und Unterbesetzung', 'Gute Grundlage für Preisgespräche mit dem Kunden']}
        visual={<ControllingDemo />}
      />
      <Module
        eyebrow="Wiederkehrende Aufträge"
        eyebrowColor="#2563EB"
        title="Einmal einstellen, läuft von selbst"
        text="Feste Objekte mit festen Zeiten müssen Sie nicht jede Woche neu einplanen — meizo trägt die Serie automatisch ein."
        bullets={['Einmal konfigurieren statt jede Woche neu', 'Änderungen wirken auf die ganze Serie', 'Weniger Klicks für den Alltag']}
        visual={<RecurringDemo />}
      />
      <Module
        eyebrow="8 Sprachen"
        eyebrowColor="#DC2626"
        title="Sie reden Deutsch. Ihr Team redet acht Sprachen."
        text="Die Mitarbeiter-App spricht automatisch Rumänisch, Türkisch, Polnisch, Arabisch, Bulgarisch und mehr — kein Missverständnis bei Krankmeldung oder Einsatzplan."
        bullets={['Automatische Übersetzung, kein Zusatzaufwand', 'Auch Rechts-nach-Links-Sprachen (Arabisch)', 'Senkt die Hemmschwelle für nicht-deutschsprachiges Personal']}
        visual={<LanguageDemo />}
        reverse
      />
    </section>
  );
}

/* ---------- Switch comparison ---------- */

function SwitchSection() {
  const groups = [
    {
      from: 'Excel & WhatsApp',
      points: [
        { bad: 'Stundenzettel auf Papier, abgetippt', good: 'Digital erfasst, direkt in der Abrechnung' },
        { bad: 'Ersatzsuche per Rundruf', good: 'Automatische Ersatzanfrage' },
        { bad: 'Keine Nachweise fürs Kundengespräch', good: 'GPS- & Foto-Nachweis pro Einsatz' },
      ],
    },
    {
      from: 'Blink oder Crewmeister',
      points: [
        { bad: 'DATEV-Export oft als Zusatzmodul', good: 'Im Grundpreis enthalten' },
        { bad: 'Reine Zeiterfassung, keine Ersatzsuche', good: 'Automatische Ersatzsuche inklusive' },
        { bad: 'Paketpreis + Gebühr pro Nutzer', good: `${BASE_FEE_EUR}€ + ${PER_EMPLOYEE_EUR}€/Mitarbeiter, ohne Zusatzmodule` },
      ],
    },
  ];
  return (
    <section className="bg-[#F8FAFC] py-16 border-y border-[#F1F5F9]">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <RevealOnScroll>
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">Warum wechseln</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight mb-10">Egal wo Sie herkommen — es lohnt sich.</h2>
        </RevealOnScroll>
        <div className="grid sm:grid-cols-2 gap-6">
          {groups.map(g => (
            <RevealOnScroll key={g.from}>
              <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 sm:p-7 h-full">
                <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-4">Schon bei {g.from}?</p>
                <div className="space-y-4">
                  {g.points.map(p => (
                    <div key={p.good} className="flex flex-col gap-1 pb-4 border-b border-[#F1F5F9] last:border-0 last:pb-0">
                      <span className="text-sm text-[#94A3B8] line-through">{p.bad}</span>
                      <span className="text-sm font-semibold text-[#15803D] flex items-center gap-1.5">
                        <Check size={13} strokeWidth={3} /> {p.good}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
        <p className="text-sm text-[#64748B] mt-8 text-center">
          Wir übernehmen Ihre Mitarbeiter- und Objektdaten kostenlos — kein Aufwand für Sie.
        </p>
      </div>
    </section>
  );
}

/* ---------- Price teaser ---------- */

function PriceTeaser() {
  const [count, setCount] = useState(10);
  const price = calculateMonthlyPrice(count);
  return (
    <RevealOnScroll className="max-w-3xl mx-auto px-5 sm:px-6 py-16 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">Preis</p>
      <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight mb-8">Ein Preis. Alle Funktionen.</h2>
      <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-sm p-8">
        <div className="flex items-baseline justify-center gap-1.5 mb-6">
          <span className="text-5xl font-bold tracking-tight text-[#0F172A]">{price} €</span>
          <span className="text-[#94A3B8] font-medium">/ Monat</span>
        </div>
        <div className="mb-2 flex items-center justify-between max-w-sm mx-auto">
          <label htmlFor="landing-count" className="text-sm font-semibold text-[#0F172A] flex items-center gap-1.5">
            <Users size={14} /> Mitarbeiteranzahl
          </label>
          <span className="text-sm font-bold text-[#0F172A]">{count}</span>
        </div>
        <input
          id="landing-count"
          type="range"
          min={1}
          max={60}
          value={count}
          onChange={e => setCount(Number(e.target.value))}
          className="w-full max-w-sm accent-[#0F172A]"
        />
        <p className="text-xs text-[#94A3B8] mt-3">{BASE_FEE_EUR}€ Grundgebühr + {PER_EMPLOYEE_EUR}€ pro Mitarbeiter, keine Zusatzmodule</p>
        <a href="/pricing" className="inline-block mt-6 bg-[#0F172A] text-white font-bold px-6 py-3 rounded-2xl hover:bg-[#1E293B] transition-colors">
          Preisrechner öffnen →
        </a>
      </div>
    </RevealOnScroll>
  );
}

/* ---------- FAQ ---------- */

const FAQS = [
  { q: 'Fallen Einrichtungsgebühren an?', a: 'Nein. Sie zahlen nur den monatlichen Preis. Einrichtung und Datenübernahme sind kostenlos.' },
  { q: 'Kann ich von Blink, Crewmeister oder Excel wechseln?', a: 'Ja. Wir übernehmen Ihre Mitarbeiter- und Objektdaten persönlich, ohne Aufwand für Sie.' },
  { q: 'Läuft meizo auch auf dem Handy?', a: 'Ja. Ihre Mitarbeiter nutzen die App für Check-in, Krankmeldung und Einsatzplan, Sie verwalten alles im Browser.' },
  { q: 'Was passiert nach der kostenlosen Testphase?', a: 'Sie entscheiden sich für die Fortsetzung oder hören einfach auf. Keine automatische Verlängerung, keine Kreditkarte nötig.' },
  { q: 'Wie erreiche ich Support?', a: 'Direkt bei Meisam, persönlich per Telefon oder E-Mail — kein Ticketsystem, keine Warteschleife.' },
];

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-[#F8FAFC] py-16 border-y border-[#F1F5F9]">
      <div className="max-w-3xl mx-auto px-5 sm:px-6">
        <RevealOnScroll>
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">Häufige Fragen</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight mb-8">Noch Fragen?</h2>
        </RevealOnScroll>
        <div className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : i)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-4">
                  <span className="font-semibold text-[#0F172A] text-sm">{f.q}</span>
                  <span className={`text-[#94A3B8] transition-transform ${isOpen ? 'rotate-45' : ''}`}>+</span>
                </button>
                {isOpen && <p className="px-5 pb-4 text-sm text-[#64748B] leading-relaxed">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- Final CTA & footer ---------- */

function FinalCta() {
  return (
    <RevealOnScroll className="max-w-4xl mx-auto px-5 sm:px-6 py-20 text-center">
      <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] tracking-tight mb-4">Nie wieder 06:47-Uhr-Panik.</h2>
      <p className="text-[#64748B] mb-8 max-w-md mx-auto">Erster Monat kostenlos, keine Kreditkarte, keine Vertragsbindung.</p>
      <div className="flex flex-wrap gap-3 justify-center">
        <a href="/register" className="bg-[#16A34A] text-white font-bold px-7 py-3.5 rounded-2xl hover:bg-[#15803D] transition-colors shadow-sm">
          Kostenloses Konto erstellen und testen →
        </a>
        <a href="mailto:meisam@meizo.de?subject=Meizo%20Anfrage" className="bg-white text-[#0F172A] font-bold px-7 py-3.5 rounded-2xl border border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors">
          meisam@meizo.de
        </a>
      </div>
    </RevealOnScroll>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#F1F5F9] py-8">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-[#64748B] mb-6">
          <span className="flex items-center gap-1.5">🇩🇪 Made in Germany</span>
          <span className="flex items-center gap-1.5"><Shield size={13} className="text-[#16A34A]" /> DSGVO-konform</span>
          <span className="flex items-center gap-1.5"><MapPin size={12} /> Server in der EU</span>
          <span className="flex items-center gap-1.5"><Globe2 size={12} /> 8 Sprachen</span>
          <span className="flex items-center gap-1.5"><Clock size={12} /> Erster Monat kostenlos</span>
          <span className="flex items-center gap-1.5"><MessageCircle size={12} /> Persönlicher Support</span>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#94A3B8] pt-6 border-t border-[#F1F5F9]">
          <span>© {new Date().getFullYear()} meizo · München</span>
          <div className="flex items-center gap-4">
            <a href="/impressum" className="hover:text-[#0F172A] transition-colors">Impressum</a>
            <a href="/datenschutz" className="hover:text-[#0F172A] transition-colors">Datenschutz</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="bg-white">
      <Nav />
      <Hero />
      <ProblemSection />
      <StatsSection />
      <ModulesSection />
      <SwitchSection />
      <PriceTeaser />
      <FaqSection />
      <FinalCta />
      <Footer />
    </div>
  );
}
