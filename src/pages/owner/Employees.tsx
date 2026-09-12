import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, MoreVertical, Phone, Pencil, Trash2, Mail, Shield, ShieldOff, AlertCircle, Euro, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../../components/shared/Avatar';
import { Modal } from '../../components/shared/Modal';
import { useToast } from '../../components/shared/Toast';
import { SortSelect } from '../../components/shared/SortSelect';
import { calculateMonthlyPrice, PER_EMPLOYEE_EUR } from '../../lib/plans';
import { toLocalDateStr } from '../../lib/utils';
import type { Employee, Property, EmployeeProperty, Company } from '../../lib/types';

interface EmployeesProps {
  company: Company;
  refreshKey: number;
  onRefresh: () => void;
}

export function Employees({ company, refreshKey, onRefresh }: EmployeesProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [employeeProperties, setEmployeeProperties] = useState<EmployeeProperty[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'sick'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'wage' | 'newest'>('name');
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Employee | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Employee | null>(null);
  const { addToast } = useToast();

  // Kein Plan-/Limit-Konzept mehr — jede Firma hat alle Funktionen, der
  // Preis skaliert automatisch mit der Mitarbeiterzahl (siehe lib/plans.ts).
  // syncSeats hält die Stripe-Subscription-Menge nach jeder Änderung aktuell.
  const syncSeats = async () => {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-subscription-seats`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company.id }),
      });
    } catch {
      // Best effort — falls das fehlschlägt, holt der nächste
      // Hinzufügen/Löschen-Vorgang den Sync automatisch nach.
    }
  };

  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newWage, setNewWage] = useState('');
  const [newPropertyIds, setNewPropertyIds] = useState<string[]>([]);
  const [newPersonalnummer, setNewPersonalnummer] = useState('');

  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWage, setEditWage] = useState('');
  const [editPropertyIds, setEditPropertyIds] = useState<string[]>([]);
  const [editPersonalnummer, setEditPersonalnummer] = useState('');

  useEffect(() => { loadData(); }, [company.id, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel(`employees-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees', filter: `company_id=eq.${company.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sick_reports' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company.id]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest('[data-menu]')) setMenuOpen(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  async function loadData() {
    try {
      const [empRes, propRes, epRes] = await Promise.all([
        supabase.from('employees').select('*').eq('company_id', company.id).order('last_name'),
        supabase.from('properties').select('*').eq('company_id', company.id),
        supabase.from('employee_properties').select('*'),
      ]);
      setEmployees(empRes.data || []);
      setProperties(propRes.data || []);
      setEmployeeProperties(epRes.data || []);
    } catch {
      // Component renders with existing state
    }
  }

  const getKnownProperties = (empId: string) =>
    employeeProperties.filter(ep => ep.employee_id === empId).map(ep => properties.find(p => p.id === ep.property_id)).filter(Boolean) as Property[];

  const todayStr = toLocalDateStr(new Date());

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(s) || e.phone.toLowerCase().includes(s) || (e.email || '').toLowerCase().includes(s));
    }
    if (filter === 'active') list = list.filter(e => e.status === 'active');
    if (filter === 'sick') list = list.filter(e => e.status === 'sick');

    list = list.slice().sort((a, b) => {
      if (sortBy === 'wage') return (b.hourly_wage ?? -1) - (a.hourly_wage ?? -1);
      if (sortBy === 'newest') return b.created_at.localeCompare(a.created_at);
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'de');
    });

    return list;
  }, [employees, search, filter, sortBy]);

  const handleAddEmployee = async () => {
    if (!newFirst || !newLast) return;
    setCreatingAccount(true);

    const { data, error } = await supabase.from('employees').insert({
      company_id: company.id, first_name: newFirst, last_name: newLast, phone: newPhone,
      email: loginEnabled ? (newEmail || null) : null,
      status: 'active',
      hourly_wage: newWage ? parseFloat(newWage) : null,
      datev_personalnummer: newPersonalnummer || null,
    }).select().maybeSingle();

    if (error) { addToast('Fehler beim Speichern', 'error'); setCreatingAccount(false); return; }

    if (data && newPropertyIds.length > 0) {
      await supabase.from('employee_properties').insert(newPropertyIds.map(pid => ({ employee_id: data.id, property_id: pid })));
    }

    if (data && loginEnabled && newEmail && newPassword) {
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee-user`;
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(apiUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail, password: newPassword, employeeId: data.id }) });
        const result = await res.json();
        if (result.error) { addToast(`Account-Fehler: ${result.error}`, 'error'); } else { addToast('Mitarbeiter mit Login erstellt'); }
      } catch { addToast('Account konnte nicht erstellt werden', 'error'); }
    } else {
      addToast('Mitarbeiter hinzugefügt');
    }

    setAddModal(false);
    setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail(''); setNewPassword(''); setNewWage('');
    setNewPropertyIds([]); setLoginEnabled(false); setNewPersonalnummer('');
    setCreatingAccount(false);
    onRefresh();
    syncSeats();
  };

  const openEditModal = (emp: Employee) => {
    setEditFirst(emp.first_name); setEditLast(emp.last_name); setEditPhone(emp.phone);
    setEditWage(emp.hourly_wage != null ? String(emp.hourly_wage) : '');
    setEditPropertyIds(employeeProperties.filter(ep => ep.employee_id === emp.id).map(ep => ep.property_id));
    setEditPersonalnummer(emp.datev_personalnummer || '');
    setEditModal(emp); setMenuOpen(null);
  };

  const handleEditEmployee = async () => {
    if (!editModal || !editFirst || !editLast) return;
    const updatePayload: Record<string, unknown> = {
      first_name: editFirst, last_name: editLast, phone: editPhone,
      hourly_wage: editWage ? parseFloat(editWage) : null,
      datev_personalnummer: editPersonalnummer || null,
    };
    const { error } = await supabase.from('employees').update(updatePayload).eq('id', editModal.id);
    if (error) { addToast('Fehler beim Speichern', 'error'); return; }

    const currentPropIds = employeeProperties.filter(ep => ep.employee_id === editModal.id).map(ep => ep.property_id);
    const toAdd = editPropertyIds.filter(id => !currentPropIds.includes(id));
    const toRemove = currentPropIds.filter(id => !editPropertyIds.includes(id));
    if (toRemove.length > 0) await supabase.from('employee_properties').delete().eq('employee_id', editModal.id).in('property_id', toRemove);
    if (toAdd.length > 0) await supabase.from('employee_properties').insert(toAdd.map(pid => ({ employee_id: editModal.id, property_id: pid })));

    setEditModal(null); onRefresh(); addToast('Mitarbeiter aktualisiert');
  };

  const handleMarkSick = async (emp: Employee) => {
    const { error: e1 } = await supabase.from('employees').update({ status: 'sick' }).eq('id', emp.id);
    if (e1) { addToast('Fehler', 'error'); return; }
    const { data: existing } = await supabase.from('sick_reports').select('id').eq('employee_id', emp.id).eq('date', todayStr).maybeSingle();
    if (!existing) {
      await supabase.from('sick_reports').insert({ employee_id: emp.id, date: todayStr, reason: '' });
    }
    setMenuOpen(null); onRefresh(); addToast(`${emp.first_name} ${emp.last_name} als krank markiert`);
  };

const handleMarkActive = async (emp: Employee) => {
  const { error } = await supabase.from('employees').update({ status: 'active' }).eq('id', emp.id);
  if (error) { addToast('Fehler', 'error'); return; }
  const todayStr = toLocalDateStr(new Date());
  await supabase.from('sick_reports').delete()
    .eq('employee_id', emp.id)
    .lte('date', todayStr)
    .or(`date_to.gte.${todayStr},date_to.is.null`);
  setMenuOpen(null); onRefresh(); addToast(`${emp.first_name} ${emp.last_name} als gesund markiert`);
};

const handleDelete = async (emp: Employee) => {
  await supabase.from('sick_reports').delete().eq('employee_id', emp.id);
  await supabase.from('assignments').delete().eq('employee_id', emp.id);
  await supabase.from('replacement_requests').delete().eq('replacement_employee_id', emp.id);
  await supabase.from('employee_properties').delete().eq('employee_id', emp.id);
  const { error: e2 } = await supabase.from('employees').delete().eq('id', emp.id);
  if (e2) { addToast('Fehler beim Löschen', 'error'); return; }
  setDeleteConfirm(null); setMenuOpen(null); onRefresh(); addToast('Mitarbeiter gelöscht');
  syncSeats();
};

  const toggleProperty = (pid: string, setter: typeof setNewPropertyIds) => {
    setter(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]);
  };

  const counts = useMemo(() => ({
    all: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    sick: employees.filter(e => e.status === 'sick').length,
  }), [employees]);

  const renderPropertyChips = (selectedIds: string[], setter: typeof setNewPropertyIds) => (
    <div className="flex flex-wrap gap-2">
      {properties.map(p => (
        <button key={p.id} onClick={() => toggleProperty(p.id, setter)}
          className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${selectedIds.includes(p.id) ? 'bg-[#22C55E] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>
          {p.name}
        </button>
      ))}
      {properties.length === 0 && <span className="text-sm text-[#94A3B8]">Keine Objekte vorhanden</span>}
    </div>
  );

  const renderPropertyChipsOverflow = (props: Property[]) => {
    const max = 3;
    const visible = props.slice(0, max);
    const extra = props.length - max;
    return (
      <div className="flex gap-1.5 flex-wrap">
        {visible.map(p => <span key={p.id} className="chip">{p.name}</span>)}
        {extra > 0 && <span className="chip !text-[#94A3B8]">+{extra} weitere</span>}
        {props.length === 0 && <span className="text-xs text-[#94A3B8]">—</span>}
      </div>
    );
  };

  const renderEmployeeCard = (emp: Employee) => {
    const knownProps = getKnownProperties(emp.id);
    return (
      <div key={emp.id} className={`card p-5 relative ${menuOpen === emp.id ? 'ring-2 ring-[#22C55E]/20 border-[#BBF7D0]' : ''}`}>
        <div className="flex items-start gap-3.5">
          <Avatar firstName={emp.first_name} lastName={emp.last_name} id={emp.id} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#0F172A]">{emp.first_name} {emp.last_name}</p>
            <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-1"><Phone size={12} className="text-[#94A3B8]" /> {emp.phone}</p>
            {emp.email && <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-0.5"><Mail size={12} className="text-[#94A3B8]" /> {emp.email}</p>}
            {emp.hourly_wage != null && <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-0.5"><Euro size={12} className="text-[#94A3B8]" /> {emp.hourly_wage.toFixed(2)} EUR/h</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {emp.status === 'sick' ? <span className="badge-danger">Krank</span> : <span className="badge-success">Aktiv</span>}
            {emp.user_id ? <Shield size={14} className="text-[#3B82F6]" /> : <ShieldOff size={14} className="text-[#CBD5E1]" />}
            <div className="relative" data-menu>
              <button onClick={() => setMenuOpen(menuOpen === emp.id ? null : emp.id)} className="p-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors">
                <MoreVertical size={16} className="text-[#94A3B8]" />
              </button>
              {menuOpen === emp.id && (
                <div className="absolute right-0 top-9 bg-white rounded-xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08),0_4px_6px_-4px_rgba(0,0,0,0.04)] border border-[#E2E8F0]/60 py-1.5 z-20 min-w-[180px] animate-scale-in">
                  <button onClick={() => openEditModal(emp)} className="w-full text-left px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors flex items-center gap-2.5"><Pencil size={14} className="text-[#94A3B8]" /> Bearbeiten</button>
                  {emp.status === 'active' ? (
                    <button onClick={() => handleMarkSick(emp)} className="w-full text-left px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#FEF2F2] transition-colors">Als krank melden</button>
                  ) : (
                    <button onClick={() => handleMarkActive(emp)} className="w-full text-left px-4 py-2.5 text-sm text-[#16A34A] hover:bg-[#F0FDF4] transition-colors">Krankmeldung beenden</button>
                  )}
                  <div className="mx-3 my-1 h-px bg-[#F1F5F9]" />
                  <button onClick={() => { setDeleteConfirm(emp); setMenuOpen(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#FEF2F2] transition-colors flex items-center gap-2.5"><Trash2 size={14} /> Löschen</button>
                </div>
              )}
            </div>
          </div>
        </div>
        {knownProps.length > 0 && <div className="mt-3">{renderPropertyChipsOverflow(knownProps)}</div>}
        {!emp.user_id && knownProps.length > 0 && (
          <p className="text-[11px] text-[#F97316] mt-2 flex items-center gap-1 font-medium"><AlertCircle size={10} /> Kein App-Zugang — kann Einsätze nicht bestätigen</p>
        )}
      </div>
    );
  };

  const renderEmployeeRow = (emp: Employee) => {
    const knownProps = getKnownProperties(emp.id);
    return (
      <tr key={emp.id} className={`border-b border-[#F1F5F9] ${menuOpen === emp.id ? 'bg-[#F0FDF4]/30' : 'hover:bg-[#F8FAFC]/50'} transition-colors`}>
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar firstName={emp.first_name} lastName={emp.last_name} id={emp.id} size="sm" />
            <span className="text-sm font-medium text-[#0F172A]">{emp.first_name} {emp.last_name}</span>
          </div>
        </td>
        <td className="px-5 py-4">
          <div className="space-y-1">
            <span className="text-xs text-[#64748B] flex items-center gap-1.5"><Phone size={13} className="text-[#94A3B8]" /> {emp.phone}</span>
            <span className="text-xs text-[#64748B] flex items-center gap-1.5"><Mail size={13} className="text-[#94A3B8]" /> {emp.email || '—'}</span>
          </div>
        </td>
        <td className="px-5 py-4">
          {emp.hourly_wage != null ? (
            <span className="text-sm font-medium text-[#0F172A]">{emp.hourly_wage.toFixed(2)} EUR</span>
          ) : (
            <span className="text-xs text-[#94A3B8]">—</span>
          )}
        </td>
        <td className="px-5 py-4">
          {emp.status === 'sick' ? <span className="badge-danger">Krank</span> : <span className="badge-success">Aktiv</span>}
        </td>
        <td className="px-5 py-4">
          {emp.user_id ? (
            <span className="badge-info"><Shield size={12} /> Aktiv</span>
          ) : (
            <span className="badge-neutral"><ShieldOff size={12} /> Kein Zugang</span>
          )}
        </td>
        <td className="px-5 py-4">{renderPropertyChipsOverflow(knownProps)}</td>
        <td className="px-5 py-4">
          <div className="relative" data-menu>
            <button onClick={() => setMenuOpen(menuOpen === emp.id ? null : emp.id)} className="p-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors">
              <MoreVertical size={16} className="text-[#94A3B8]" />
            </button>
            {menuOpen === emp.id && (
              <div className="absolute right-5 top-10 bg-white rounded-xl shadow-[0_10px_15px_-3px_rgba(0,0,0,0.08),0_4px_6px_-4px_rgba(0,0,0,0.04)] border border-[#E2E8F0]/60 py-1.5 z-20 min-w-[180px] animate-scale-in">
                <button onClick={() => openEditModal(emp)} className="w-full text-left px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors flex items-center gap-2.5"><Pencil size={14} className="text-[#94A3B8]" /> Bearbeiten</button>
                {emp.status === 'active' ? (
                  <button onClick={() => handleMarkSick(emp)} className="w-full text-left px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#FEF2F2] transition-colors">Als krank melden</button>
                ) : (
                  <button onClick={() => handleMarkActive(emp)} className="w-full text-left px-4 py-2.5 text-sm text-[#16A34A] hover:bg-[#F0FDF4] transition-colors">Krankmeldung beenden</button>
                )}
                <div className="mx-3 my-1 h-px bg-[#F1F5F9]" />
                <button onClick={() => { setDeleteConfirm(emp); setMenuOpen(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#EF4444] hover:bg-[#FEF2F2] transition-colors flex items-center gap-2.5"><Trash2 size={14} /> Löschen</button>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Mitarbeiter</h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            <Users size={12} className="inline mr-1" />
            {employees.length} Mitarbeiter · {calculateMonthlyPrice(employees.length)}€/Monat
          </p>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Mitarbeiter hinzufügen
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
        <input type="text" placeholder="Name, Telefon oder E-Mail..." value={search} onChange={e => setSearch(e.target.value)}
          className="input-field !pl-11" />
      </div>

      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: `Alle ${counts.all}` },
            { key: 'active', label: `Aktiv ${counts.active}` },
            { key: 'sick', label: `Krank ${counts.sick}` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key as typeof filter)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${filter === f.key ? 'bg-[#0F172A] text-white shadow-sm' : 'bg-white text-[#64748B] hover:bg-[#F8FAFC] border border-[#E2E8F0]/60'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <SortSelect
          value={sortBy}
          onChange={v => setSortBy(v as typeof sortBy)}
          options={[
            { value: 'name', label: 'Name (A-Z)' },
            { value: 'wage', label: 'Stundenlohn' },
            { value: 'newest', label: 'Neueste zuerst' },
          ]}
        />
      </div>

      <div className="lg:hidden space-y-3">
        {filteredEmployees.map(renderEmployeeCard)}
        {filteredEmployees.length === 0 && <div className="card p-10 text-center"><p className="text-sm text-[#94A3B8]">Keine Mitarbeiter gefunden</p></div>}
      </div>

      <div className="hidden lg:block card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#F1F5F9]">
              <th className="text-left px-5 py-3.5 section-label">Mitarbeiter</th>
              <th className="text-left px-5 py-3.5 section-label">Kontakt</th>
              <th className="text-left px-5 py-3.5 section-label">Stundenlohn</th>
              <th className="text-left px-5 py-3.5 section-label">Status</th>
              <th className="text-left px-5 py-3.5 section-label">Login</th>
              <th className="text-left px-5 py-3.5 section-label">Objekte</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map(renderEmployeeRow)}
            {filteredEmployees.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-[#94A3B8]">Keine Mitarbeiter gefunden</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Add Employee Modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setLoginEnabled(false); }} width="max-w-md">
        <div className="p-8">
          <h2 className="text-lg font-bold text-[#0F172A] mb-6">Mitarbeiter hinzufügen</h2>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Vorname <span className="text-[#EF4444]">*</span></label>
                <input type="text" value={newFirst} onChange={e => setNewFirst(e.target.value)} className="input-field" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Nachname <span className="text-[#EF4444]">*</span></label>
                <input type="text" value={newLast} onChange={e => setNewLast(e.target.value)} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Telefon <span className="text-[#EF4444]">*</span></label>
              <input type="text" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+49 171..." className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Stundenlohn (EUR)</label>
              <input type="number" step="0.01" min="0" value={newWage} onChange={e => setNewWage(e.target.value)} placeholder="z.B. 14.50" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Personalnummer beim Steuerberater (optional)</label>
              <input type="text" value={newPersonalnummer} onChange={e => setNewPersonalnummer(e.target.value)} placeholder="für DATEV-Export" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Bekannte Objekte</label>
              {renderPropertyChips(newPropertyIds, setNewPropertyIds)}
            </div>
            <div className="bg-[#F8FAFC] rounded-xl p-3 text-xs text-[#64748B] flex items-center gap-2">
              <Users size={13} className="text-[#94A3B8]" />
              Ein weiterer Mitarbeiter erhöht deine monatliche Rechnung um {PER_EMPLOYEE_EUR}€.
            </div>
            <div className="h-px bg-[#F1F5F9] my-1" />
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={loginEnabled} onChange={e => setLoginEnabled(e.target.checked)} className="w-4 h-4 rounded accent-[#22C55E]" />
                <span className="text-sm font-medium text-[#0F172A]">Login-Daten (optional)</span>
              </label>
              <p className="text-xs text-[#94A3B8] mt-1 ml-6.5">Mitarbeiter kann sich in der App anmelden und muss beim ersten Login ein Passwort setzen.</p>
              {loginEnabled && (
                <div className="space-y-4 mt-4 ml-6.5">
                  <div>
                    <label className="block text-sm font-medium text-[#0F172A] mb-1.5">E-Mail</label>
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="max@beispiel.de" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Initiales Passwort</label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mind. 6 Zeichen" className="input-field" />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <button onClick={() => { setAddModal(false); setLoginEnabled(false); }} className="btn-ghost">Abbrechen</button>
            <button onClick={handleAddEmployee} disabled={!newFirst || !newLast || !newPhone || creatingAccount} className="btn-primary">
              {creatingAccount ? 'Wird erstellt...' : 'Speichern'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} width="max-w-md">
        <div className="p-8">
          <h2 className="text-lg font-bold text-[#0F172A] mb-6">Mitarbeiter bearbeiten</h2>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Vorname</label>
                <input type="text" value={editFirst} onChange={e => setEditFirst(e.target.value)} className="input-field" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Nachname</label>
                <input type="text" value={editLast} onChange={e => setEditLast(e.target.value)} className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Telefon</label>
              <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+49 171..." className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Stundenlohn (EUR)</label>
              <input type="number" step="0.01" min="0" value={editWage} onChange={e => setEditWage(e.target.value)} placeholder="z.B. 14.50" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Personalnummer beim Steuerberater (optional)</label>
              <input type="text" value={editPersonalnummer} onChange={e => setEditPersonalnummer(e.target.value)} placeholder="für DATEV-Export" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Bekannte Objekte</label>
              {renderPropertyChips(editPropertyIds, setEditPropertyIds)}
            </div>
            {editModal?.email && (
              <div className="bg-[#F8FAFC] rounded-xl p-3.5">
                <p className="text-xs text-[#94A3B8]">Login: <span className="font-medium text-[#0F172A]">{editModal.email}</span></p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <button onClick={() => setEditModal(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleEditEmployee} disabled={!editFirst || !editLast} className="btn-primary">Speichern</button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} width="max-w-sm">
        <div className="p-8">
          <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] flex items-center justify-center mb-5">
            <Trash2 size={22} className="text-[#EF4444]" />
          </div>
          <h2 className="text-lg font-bold text-[#0F172A] mb-2">Mitarbeiter löschen?</h2>
          <p className="text-sm text-[#64748B] leading-relaxed mb-8">
            {deleteConfirm?.first_name} {deleteConfirm?.last_name} wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className="btn-danger">Löschen</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
