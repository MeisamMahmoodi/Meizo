import { useState } from 'react';
import { Check } from 'lucide-react';
import { BASE_FEE_EUR, PER_EMPLOYEE_EUR, calculateMonthlyPrice, isEnterpriseRange, ENTERPRISE_THRESHOLD } from '../lib/plans';

interface PricingProps {
  onContinue: () => void;
}

const FEATURES = [
  'Kern-Planung: Dashboard, Einsatzplan, Objektverwaltung',
  'Live-Status: GPS-Check-in und Zeitstempel-Überwachung mit Foto-Nachweis',
  'Krankheits-Management inkl. Smart-Ersatz-Dispatch',
  'Abrechnungs-Modul: automatische Verdienst- und Stundenübersicht',
  'DATEV-Export: fertiger CSV-Export für den Steuerberater',
  'Individuelle Stundensätze pro Mitarbeiter',
  'Mehrsprachige Mitarbeiter-App (8 Sprachen)',
];

// Blink-Preisformel laut deren eigener Preisseite (blink.de/preise, Stand
// Juli 2026): 149€ Paketpreis (Standard) + 4,90€ pro Nutzer. Exakte Formel,
// deshalb hier direkt nachrechenbar statt geschätzt.
const BLINK_BASE = 149;
const BLINK_PER_USER = 4.9;
function blinkPrice(employeeCount: number): number {
  return BLINK_BASE + Math.max(1, employeeCount) * BLINK_PER_USER;
}

export function Pricing({ onContinue }: PricingProps) {
  const [employeeCount, setEmployeeCount] = useState(15);
  const enterprise = isEnterpriseRange(employeeCount);
  const price = calculateMonthlyPrice(employeeCount);
  const blinkComparison = Math.round(blinkPrice(employeeCount));
  const savings = blinkComparison - price;

  const mailSubject = encodeURIComponent('Meizo Anfrage');
  const mailBody = encodeURIComponent(
    `Hallo,\n\nich interessiere mich für Meizo (ca. ${employeeCount} Mitarbeiter).\n\nViele Grüße`
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Header */}
      <header className="pt-10 pb-6 px-6 text-center">
        <img src="/meizoLogoMarkDark.png" alt="meizo" className="h-10 w-auto mx-auto mb-6" />
        <p className="text-xs font-bold uppercase tracking-widest text-[#16A34A] mb-3">
          Nutzen Sie schon Blink oder Crewmeister? Ein Wechsel lohnt sich.
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#0F172A] tracking-tight">
          Ein Preis. Alle Funktionen.
        </h1>
        <p className="text-[#64748B] mt-3 max-w-md mx-auto">
          Keine Pakete, keine versteckten Grenzen. {BASE_FEE_EUR}€ Grundgebühr + {PER_EMPLOYEE_EUR}€ pro Mitarbeiter im Monat.
        </p>
      </header>

      {/* Calculator */}
      <main className="flex-1 px-4 sm:px-6 pb-16">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-sm p-7 sm:p-9">
            <div className="text-center mb-8">
              <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">Ihr monatlicher Preis</p>
              {enterprise ? (
                <p className="text-3xl font-bold text-[#0F172A]">Auf Anfrage</p>
              ) : (
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-5xl font-bold tracking-tight text-[#0F172A]">{price} €</span>
                  <span className="text-[#94A3B8] font-medium">/ Monat</span>
                </div>
              )}
            </div>

            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="employees" className="text-sm font-semibold text-[#0F172A]">Mitarbeiteranzahl</label>
              <span className="text-sm font-bold text-[#0F172A]">{employeeCount}</span>
            </div>
            <input
              id="employees"
              type="range"
              min={1}
              max={80}
              value={employeeCount}
              onChange={e => setEmployeeCount(Number(e.target.value))}
              className="w-full accent-[#0F172A]"
            />
            <div className="flex justify-between text-xs text-[#94A3B8] mt-1 mb-8">
              <span>1</span>
              <span>{ENTERPRISE_THRESHOLD}+ (individuelles Angebot)</span>
            </div>

            {!enterprise && savings > 0 && (
              <div className="rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] px-5 py-4 mb-6 text-center">
                <p className="text-sm text-[#15803D] font-semibold">
                  Sie sparen {savings} €/Monat gegenüber Blink
                </p>
                <p className="text-xs text-[#4D7C61] mt-1">
                  Blink kostet bei {employeeCount} Mitarbeitern ca. {blinkComparison} €/Monat (149 € Paketpreis + 4,90 €/Nutzer, Stand blink.de/preise) — bei uns ist DATEV-Export und Ersatzsuche schon inklusive, keine Zusatzmodule wie bei Crewmeister.
                </p>
              </div>
            )}

            <div className="h-px bg-[#F1F5F9] mb-6" />

            <ul className="space-y-3 mb-8">
              {FEATURES.map((feature) => {
                const [bold, ...rest] = feature.split(':');
                const hasColon = feature.includes(':');
                return (
                  <li key={feature} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-[#F0FDF4]">
                      <Check size={11} className="text-[#16A34A]" strokeWidth={2.5} />
                    </div>
                    <span className="text-sm leading-snug text-[#475569]">
                      {hasColon ? (
                        <>
                          <span className="font-semibold text-[#0F172A]">{bold}:</span>
                          {rest.join(':')}
                        </>
                      ) : feature}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Vorher fuer beide Faelle ein mailto-Link mit dem Text
                "Jetzt anfragen" — auch fuer die normale Selbstbedienungs-
                Preisstufe, wo eigentlich niemand erst eine E-Mail schreiben
                soll, sondern sich direkt selbst ein Konto anlegen kann.
                Nur oberhalb von ENTERPRISE_THRESHOLD (siehe plans.ts) gibt es
                laut eigener Preislogik kein automatisches Self-Checkout,
                dort bleibt der mailto-Kontakt richtig. */}
            {enterprise ? (
              <a
                href={`mailto:meisam@meizo.de?subject=${mailSubject}&body=${mailBody}`}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-center transition-all duration-200 block bg-[#0F172A] text-white hover:bg-[#1E293B]"
              >
                Angebot anfragen
              </a>
            ) : (
              <a
                href="/register"
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-center transition-all duration-200 block bg-[#0F172A] text-white hover:bg-[#1E293B]"
              >
                Kostenloses Konto erstellen und testen
              </a>
            )}
          </div>

          {/* Wechsel-Garantie */}
          <div className="mt-6 flex flex-col items-center gap-1.5 text-center">
            <p className="text-xs text-[#64748B]">
              Schon bei Blink oder Crewmeister? Wir übernehmen Ihre Mitarbeiter- und Objektdaten kostenlos.
            </p>
            <p className="text-xs text-[#64748B]">
              Keine Vertragsbindung, jederzeit kündbar.
            </p>
          </div>

          {/* Already paid */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[#94A3B8]">
              Sie haben bereits ein Konto?{' '}
              <button
                onClick={onContinue}
                className="text-[#0F172A] font-semibold underline underline-offset-2 hover:no-underline transition-all"
              >
                Zum Login
              </button>
            </p>
          </div>
        </div>
      </main>

      <footer className="text-center pb-8">
        <div className="flex items-center justify-center gap-4 text-xs text-[#94A3B8]">
          <a href="/impressum" className="hover:text-[#0F172A] transition-colors">Impressum</a>
          <a href="/datenschutz" className="hover:text-[#0F172A] transition-colors">Datenschutz</a>
        </div>
      </footer>
    </div>
  );
}
