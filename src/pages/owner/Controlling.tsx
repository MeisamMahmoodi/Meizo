import { useState, useEffect, useMemo } from 'react';
import { Euro, TrendingUp, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Employee, Property, Assignment, Company } from '../../lib/types';

interface ControllingProps {
  company: Company;
  refreshKey: number;
  onRefresh: () => void;
}

interface AssignmentWithDetails extends Assignment {
  employee: Employee;
  property: Property;
}

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function Controlling({ company, refreshKey }: ControllingProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [monthAssignments, setMonthAssignments] = useState<AssignmentWithDetails[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => { loadData(); }, [company.id, refreshKey, selectedMonth]);

  async function loadData() {
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const [propRes, assignRes] = await Promise.all([
        supabase.from('properties').select('*').eq('company_id', company.id).order('name'),
        supabase.from('assignments').select('*, employee:employees(*), property:properties(*)').gte('date', monthStart).lte('date', monthEnd),
      ]);

      setProperties(propRes.data || []);
      setMonthAssignments((assignRes.data as unknown as AssignmentWithDetails[]) || []);
    } catch {
      // Component renders with existing state
    }
  }

  const [selYear, selMonth] = selectedMonth.split('-').map(Number);
  const today = new Date();
  const isCurrentMonth = selYear === today.getFullYear() && selMonth === today.getMonth() + 1;

  const changeMonth = (delta: number) => {
    const d = new Date(selYear, selMonth - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const perProperty = useMemo(() => {
    return properties.map(prop => {
      const propAssignments = monthAssignments.filter(a => a.property_id === prop.id);

      let istMinutes = 0;
      let sollMinutes = 0;
      let kosten = 0;

      for (const a of propAssignments) {
        const timeFrom = a.time_from ?? prop.time_from;
        const timeTo = a.time_to ?? prop.time_to;
        if (!timeFrom || !timeTo) continue;
        const [fromH, fromM] = timeFrom.split(':').map(Number);
        const [toH, toM] = timeTo.split(':').map(Number);
        const plannedMin = Math.max(0, (toH * 60 + toM) - (fromH * 60 + fromM));

        if (a.status === 'assigned' || a.status === 'checked_in' || a.status === 'completed') {
          sollMinutes += plannedMin;
        }

        let actualMin = plannedMin;
        if (a.status === 'completed' && a.checked_in_at && a.completed_at) {
          actualMin = Math.max(0, Math.round((new Date(a.completed_at).getTime() - new Date(a.checked_in_at).getTime()) / 60000));
        }
        if (a.status === 'completed' || a.status === 'checked_in') {
          istMinutes += actualMin;
          const wage = a.employee?.hourly_wage;
          if (wage != null) kosten += (actualMin / 60) * wage;
        }
      }

      const umsatz = prop.monthly_price ?? null;
      const marge = umsatz != null && umsatz > 0 ? ((umsatz - kosten) / umsatz) * 100 : null;

      return { property: prop, istMinutes, sollMinutes, kosten, umsatz, marge };
    }).sort((a, b) => (b.umsatz ?? 0) - (a.umsatz ?? 0));
  }, [properties, monthAssignments]);

  const totals = useMemo(() => {
    const umsatz = perProperty.reduce((sum, p) => sum + (p.umsatz ?? 0), 0);
    const kosten = perProperty.reduce((sum, p) => sum + p.kosten, 0);
    const marge = umsatz > 0 ? ((umsatz - kosten) / umsatz) * 100 : null;
    const propertiesWithoutPrice = perProperty.filter(p => p.umsatz == null).length;
    return { umsatz, kosten, marge, propertiesWithoutPrice };
  }, [perProperty]);

  const margeColor = (m: number | null) => {
    if (m == null) return '#94A3B8';
    if (m < 10) return '#DC2626';
    if (m < 25) return '#F97316';
    return '#16A34A';
  };

  const ringCircumference = 2 * Math.PI * 34;
  const ringOffset = totals.marge != null
    ? ringCircumference * (1 - Math.max(0, Math.min(100, totals.marge)) / 100)
    : ringCircumference;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Controlling</h1>
        <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-xl px-1.5 py-1.5">
          <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors">
            <ChevronLeft size={16} className="text-[#64748B]" />
          </button>
          <span className="text-sm font-semibold text-[#0F172A] px-2 min-w-[130px] text-center">
            {MONTH_NAMES[selMonth - 1]} {selYear}
          </span>
          <button onClick={() => changeMonth(1)} disabled={isCurrentMonth} className="p-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight size={16} className="text-[#64748B]" />
          </button>
        </div>
      </div>

      {totals.propertiesWithoutPrice > 0 && (
        <div className="mb-6 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] px-5 py-3.5 text-sm text-[#92400E]">
          {totals.propertiesWithoutPrice} {totals.propertiesWithoutPrice === 1 ? 'Objekt hat' : 'Objekte haben'} noch keinen Monatspreis hinterlegt — Umsatz und Marge sind dafür nicht berechenbar. Preis unter „Objekte" nachtragen.
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">Umsatz {isCurrentMonth ? '(bisher)' : ''}</p>
          <p className="text-3xl font-bold text-[#0F172A] tracking-tight">{totals.umsatz.toLocaleString('de-DE')} €</p>
          <p className="text-xs text-[#64748B] mt-1.5">Summe Monatspreise aller Objekte</p>
        </div>
        <div className="card p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-2">Personalkosten {isCurrentMonth ? '(bisher)' : ''}</p>
          <p className="text-3xl font-bold text-[#0F172A] tracking-tight">{totals.kosten.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €</p>
          <p className="text-xs text-[#64748B] mt-1.5">Aus geleisteten Stunden × Stundenlohn</p>
        </div>
        <div className="card p-6 flex items-center gap-5">
          <div className="relative w-[84px] h-[84px] shrink-0">
            <svg width="84" height="84" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r="34" fill="none" stroke="#F1F5F9" strokeWidth="8" />
              <circle
                cx="42" cy="42" r="34" fill="none" stroke={margeColor(totals.marge)} strokeWidth="8"
                strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} strokeLinecap="round"
                transform="rotate(-90 42 42)" style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-[#0F172A]">{totals.marge != null ? `${Math.round(totals.marge)}%` : '–'}</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] mb-1">Marge gesamt</p>
            <p className="text-xs text-[#64748B]">(Umsatz − Kosten) / Umsatz</p>
          </div>
        </div>
      </div>

      {/* Per-property breakdown */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F1F5F9]">
          <h2 className="text-sm font-bold text-[#0F172A]">Soll-Ist-Stunden & Marge pro Objekt</h2>
        </div>
        <div className="divide-y divide-[#F1F5F9]">
          {perProperty.map(p => {
            const pct = p.sollMinutes > 0 ? Math.min(150, (p.istMinutes / p.sollMinutes) * 100) : (p.istMinutes > 0 ? 100 : 0);
            const overBudget = p.sollMinutes > 0 && p.istMinutes > p.sollMinutes;
            return (
              <div key={p.property.id} className="px-6 py-5">
                <div className="flex items-center justify-between gap-4 mb-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Building2 size={15} className="text-[#94A3B8] shrink-0" />
                    <span className="text-sm font-semibold text-[#0F172A] truncate">{p.property.name}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {p.umsatz != null ? (
                      <span className="text-xs font-semibold text-[#0F172A] flex items-center gap-1"><Euro size={11} className="text-[#94A3B8]" /> {p.umsatz.toLocaleString('de-DE')}/Mon.</span>
                    ) : (
                      <span className="text-xs text-[#94A3B8]">Kein Preis hinterlegt</span>
                    )}
                    {p.marge != null && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: margeColor(p.marge), backgroundColor: `${margeColor(p.marge)}1A` }}
                      >
                        {Math.round(p.marge)}% Marge
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, pct)}%`, backgroundColor: overBudget ? '#DC2626' : '#16A34A' }}
                  />
                </div>
                <p className={`text-xs mt-1.5 ${overBudget ? 'text-[#DC2626] font-semibold' : 'text-[#94A3B8]'}`}>
                  {minutesToLabel(p.istMinutes)} / {minutesToLabel(p.sollMinutes)} Std. {overBudget ? '(überzogen)' : ''}
                </p>
              </div>
            );
          })}
          {perProperty.length === 0 && (
            <div className="px-6 py-10 text-center">
              <TrendingUp size={22} className="text-[#CBD5E1] mx-auto mb-2" />
              <p className="text-sm text-[#94A3B8]">Noch keine Objekte vorhanden</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-[#94A3B8] mt-4">
        Hinweis: Soll-Stunden basieren auf den geplanten Einsatzzeiten im ausgewählten Monat, Ist-Stunden auf tatsächlichem Check-in/Check-out.
      </p>
    </div>
  );
}
