import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Phone, Pencil, Trash2, Mail, Shield, ShieldOff, AlertCircle, Euro, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../../components/shared/Avatar';
import { Modal } from '../../components/shared/Modal';
import { useToast } from '../../components/shared/Toast';
import { SortSelect } from '../../components/shared/SortSelect';
import { ActionMenu } from '../../components/shared/ActionMenu';
import type { ActionMenuItem } from '../../components/shared/ActionMenu';
import { calculateMonthlyPrice, PER_EMPLOYEE_EUR } from '../../lib/plans';
import { toLocalDateStr } from '../../lib/utils';
import type { Employee, Property, EmployeeProperty, EmployeeInvite, Company } from '../../lib/types';

interface EmployeesProps {
  company: Company;
  refreshKey: number;
  onRefresh: () => void;
}

export function Employees({ company, refreshKey, onRefresh }: EmployeesProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [employeeProperties, setEmployeeProperties] = useState<EmployeeProperty[]>([]);
  const [invites, setInvites] = useState<EmployeeInvite[]>([]);
  // Ohne das blitzte beim ersten Laden kurz "Keine Mitarbeiter gefunden" auf,
  // bevor die echten Daten da waren — wie bei Dashboard/Controlling schon
  // behoben.
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'sick'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'wage' | 'newest'>('name');
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Employee | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [invite, setInvite] = useState<{ employee: Employee; code: string } | null>(null);
  const [creatingInviteFor, setCreatingInviteFor] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Employee | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<{ assignments: number; futureAssignments: number } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { addToast } = useToast();

  // Zeigt in der Löschbestätigung die echte Anzahl betroffener Einsätze an,
  // statt nur einem allgemeinen Warnsatz — damit man vor dem Löschen sieht,
  // wie viel tatsächlich mit verschwindet (v.a. zukünftig geplante Einsätze).
  useEffect(() => {
    if (!deleteConfirm) { setDeleteImpact(null); return; }
    setLoadingImpact(true);
    const today = toLocalDateStr(new Date());
    Promise.all([
      supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('employee_id', deleteConfirm.id),
      supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('employee_id', deleteConfirm.id).gte('date', today),
    ]).then(([totalRes, futureRes]) => {
      setDeleteImpact({ assignments: totalRes.count ?? 0, futureAssignments: futureRes.count ?? 0 });
      setLoadingImpact(false);
    });
  }, [deleteConfirm]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_invites', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company.id]);

  async function loadData() {
    try {
      const [empRes, propRes, epRes, inviteRes] = await Promise.all([
        supabase.from('employees').select('*').eq('company_id', company.id).order('last_name'),
        supabase.from('properties').select('*').eq('company_id', company.id),
        supabase.from('employee_properties').select('*'),
        supabase.from('employee_invites').select('*').eq('company_id', company.id),
      ]);
      setEmployees(empRes.data || []);
      setProperties(propRes.data || []);
      setEmployeeProperties(epRes.data || []);
      setInvites(inviteRes.data || []);
    } catch {
      // Component renders with existing state
    } finally {
      setLoading(false);
    }
  }

  const getKnownProperties = (empId: string) =>
    employeeProperties.filter(ep => ep.employee_id === empId).map(ep => properties.find(p => p.id === ep.property_id)).filter(Boolean) as Property[];

  // Noch nicht abgelaufener, noch nicht eingeloester Einladungslink fuer
  // diesen Mitarbeiter, falls vorhanden — entscheidet ob das Menue
  // "einsehen" oder "erstellen" anbietet.
  const getActiveInvite = (empId: string) =>
    invites.find(inv => inv.employee_id === empId && !inv.used_at && new Date(inv.expires_at) > new Date());

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
      status: 'active',
      hourly_wage: newWage ? parseFloat(newWage) : null,
      datev_personalnummer: newPersonalnummer || null,
    }).select().maybeSingle();

    if (error) { addToast('Fehler beim Speichern', 'error'); setCreatingAccount(false); return; }

    if (data && newPropertyIds.length > 0) {
      await supabase.from('employee_properties').insert(newPropertyIds.map(pid => ({ employee_id: data.id, property_id: pid })));
    }

    setAddModal(false);
    setNewFirst(''); setNewLast(''); setNewPhone(''); setNewWage('');
    setNewPropertyIds([]); setNewPersonalnummer('');
    setCreatingAccount(false);
    onRefresh();
    syncSeats();

    addToast('Mitarbeiter hinzugefügt');

    // Gleich den Einladungslink miterzeugen und anzeigen, statt den Chef
    // dafuer extra nochmal in die Liste klicken zu lassen.
    if (data) await handleCreateInvite(data as Employee);
  };

  // Ersetzt das fruehere Verfahren, bei dem der Chef E-Mail und ein
  // Start-Passwort fuer den Mitarbeiter selbst eintippen musste
  // (create-employee-user). Stattdessen erzeugt der Chef hier nur noch
  // einen kurzen, 14 Tage gueltigen Einladungscode; der Mitarbeiter legt
  // sein Konto (eigene E-Mail, eigenes Passwort) danach selbst unter
  // /einladung/CODE an.
  const handleCreateInvite = async (emp: Employee) => {
    setCreatingInviteFor(emp.id);
    setMenuOpen(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee-invite`;
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: emp.id }),
      });
      const result = await res.json();
      if (!res.ok || result.error) {
        addToast(result.error || 'Einladungslink konnte nicht erstellt werden', 'error');
        return;
      }
      setInvite({ employee: emp, code: result.code });
    } catch {
      addToast('Einladungslink konnte nicht erstellt werden', 'error');
    } finally {
      setCreatingInviteFor(null);
    }
  };

  // Menue-Aktion aus der Mitarbeiterliste: gibt es schon einen gueltigen,
  // noch nicht eingeloesten Link, den einfach nochmal anzeigen statt ihn
  // durch einen neuen zu ersetzen. Erst wenn keiner (mehr) gueltig ist, wird
  // ein neuer erstellt.
  const openInviteModal = (emp: Employee) => {
    const active = getActiveInvite(emp.id);
    if (active) {
      setInvite({ employee: emp, code: active.code });
      setMenuOpen(null);
    } else {
      handleCreateInvite(emp);
    }
  };

  const openEditModal = (emp: Employee) => {
    setEditFirst(emp.first_name); setEditLast(emp.last_name); setEditPhone(emp.phone);
    setEditWage(emp.hourly_wage != null ? String(emp.hourly_wage) : '');
    setEditPropertyIds(employeeProperties.filter(ep => ep.employee_id === emp.id).map(ep => ep.property_id));
    setEditPersonalnummer(emp.datev_personalnummer || '');
    setEditModal(emp); setMenuOpen(null);
  };

  const handleEditEmployee = async () => {
    // Guard against double-click: two parallel saves used to compute the
    // same employee_properties diff from the same stale state, risking
    // duplicate/inconsistent assignments.
    if (!editModal || !editFirst || !editLast || savingEdit) return;
    setSavingEdit(true);
    try {
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
    } finally {
      setSavingEdit(false);
    }
  };

  const handleMarkSick = async (emp: Employee) => {
    const { error: e1 } = await supabase.from('employees').update({ status: 'sick' }).eq('id', emp.id);
    if (e1) { addToast('Fehler', 'error'); return; }
    const { data: existing, error: eCheck } = await supabase.from('sick_reports').select('id').eq('employee_id', emp.id).eq('date', todayStr).maybeSingle();
    // Vorher wurde der Fehler dieses Inserts nicht geprueft: schlug er fehl,
    // stand der Mitarbeiter in der Liste als "krank", aber im Dashboard
    // (das nur sick_reports liest) tauchte nichts auf. Bei einem Fehler den
    // Status wieder zuruecksetzen, statt die beiden Tabellen auseinanderlaufen
    // zu lassen.
    if (eCheck) {
      await supabase.from('employees').update({ status: 'active' }).eq('id', emp.id);
      addToast('Fehler beim Krankmelden', 'error');
      return;
    }
    if (!existing) {
      const { error: e2 } = await supabase.from('sick_reports').insert({ employee_id: emp.id, date: todayStr, reason: '' });
      if (e2) {
        await supabase.from('employees').update({ status: 'active' }).eq('id', emp.id);
        addToast('Fehler beim Krankmelden', 'error');
        return;
      }
    }
    setMenuOpen(null); onRefresh(); addToast(`${emp.first_name} ${emp.last_name} als krank markiert`);
  };

const handleMarkActive = async (emp: Employee) => {
  const { error } = await supabase.from('employees').update({ status: 'active' }).eq('id', emp.id);
  if (error) { addToast('Fehler', 'error'); return; }
  const todayStr = toLocalDateStr(new Date());
  const { error: e2 } = await supabase.from('sick_reports').delete()
    .eq('employee_id', emp.id)
    .lte('date', todayStr)
    .or(`date_to.gte.${todayStr},date_to.is.null`);
  // Der Mitarbeiter ist jetzt wieder aktiv (das Wichtigste ist erledigt),
  // aber wenn das Aufraeumen der Krankmeldung fehlschlaegt, soll das nicht
  // stillschweigend passieren — sonst taucht im Dashboard weiterhin eine
  // "erledigte" Krankmeldung auf.
  if (e2) {
    setMenuOpen(null); onRefresh();
    addToast(`${emp.first_name} ${emp.last_name} ist aktiv, aber die Krankmeldung konnte nicht entfernt werden`, 'error');
    return;
  }
  setMenuOpen(null); onRefresh(); addToast(`${emp.first_name} ${emp.last_name} als gesund markiert`);
};

const handleDelete = async (emp: Employee) => {
  // Every cascade step is checked now - previously only the final employees
  // delete was checked, so a failed intermediate step could silently leave
  // sick reports/assignments deleted while the employee record itself stayed.
  if (deleting) return;
  setDeleting(true);
  try {
    const r1 = await supabase.from('sick_reports').delete().eq('employee_id', emp.id);
    if (r1.error) { addToast('Fehler beim Löschen der Krankmeldungen', 'error'); return; }
    const r2 = await supabase.from('assignments').delete().eq('employee_id', emp.id);
    if (r2.error) { addToast('Fehler beim Löschen der Einsätze', 'error'); return; }
    const r3 = await supabase.from('replacement_requests').delete().eq('replacement_employee_id', emp.id);
    if (r3.error) { addToast('Fehler beim Löschen der Vertretungsanfragen', 'error'); return; }
    const r4 = await supabase.from('employee_properties').delete().eq('employee_id', emp.id);
    if (r4.error) { addToast('Fehler beim Löschen der Objektzuordnungen', 'error'); return; }
    const { error: e2 } = await supabase.from('employees').delete().eq('id', emp.id);
    if (e2) { addToast('Fehler beim Löschen', 'error'); return; }
    setDeleteConfirm(null); setMenuOpen(null); onRefresh(); addToast('Mitarbeiter gelöscht');
    syncSeats();
  } finally {
    setDeleting(false);
  }
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

  const getEmployeeMenuItems = (emp: Employee): ActionMenuItem[] => [
    { label: 'Bearbeiten', icon: Pencil, onClick: () => openEditModal(emp) },
    ...(!emp.user_id ? [{
      label: creatingInviteFor === emp.id
        ? 'Wird erstellt...'
        : (getActiveInvite(emp.id) ? 'Einladungslink einsehen' : 'Einladungslink erstellen'),
      icon: Shield,
      onClick: () => openInviteModal(emp),
    }] : []),
    emp.status === 'active'
      ? { label: 'Als krank melden', tone: 'danger', onClick: () => handleMarkSick(emp) }
      : { label: 'Krankmeldung beenden', tone: 'success', onClick: () => handleMarkActive(emp) },
    { label: 'Löschen', icon: Trash2, tone: 'danger', dividerBefore: true, onClick: () => { setDeleteConfirm(emp); setMenuOpen(null); } },
  ];

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
            <ActionMenu
              items={getEmployeeMenuItems(emp)}
              isOpen={menuOpen === emp.id}
              onOpenChange={open => setMenuOpen(open ? emp.id : null)}
            />
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
          <ActionMenu
            items={getEmployeeMenuItems(emp)}
            isOpen={menuOpen === emp.id}
            onOpenChange={open => setMenuOpen(open ? emp.id : null)}
          />
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

      {loading ? (
        <div className="card p-10 text-center">
          <div className="w-6 h-6 border-2 border-[#CBD5E1] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <>
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
        </>
      )}

      {/* Add Employee Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} width="max-w-md">
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
            <p className="text-xs text-[#94A3B8]">
              Nach dem Speichern bekommst du direkt einen Einladungslink zum Teilen.
              Der Mitarbeiter legt sein Konto damit selbst mit eigener E-Mail und eigenem Passwort an.
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <button onClick={() => setAddModal(false)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleAddEmployee} disabled={!newFirst || !newLast || !newPhone || creatingAccount} className="btn-primary">
              {creatingAccount ? 'Wird erstellt...' : 'Speichern'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Einladungslink-Ergebnis: Code zum Kopieren/Teilen, nachdem der Chef
          "Einladungslink erstellen" fuer einen Mitarbeiter geklickt hat. */}
      <Modal open={!!invite} onClose={() => setInvite(null)} width="max-w-sm" ariaLabel="Einladungslink">
        {invite && (() => {
          const link = `${window.location.origin}/einladung/${invite.code}`;
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
            `Hallo ${invite.employee.first_name}, hier ist dein Zugang zu ${company.name}: ${link}`
          )}`;
          return (
            <div className="p-8">
              <h2 className="text-lg font-bold text-[#0F172A] mb-1.5">Einladungslink</h2>
              <p className="text-sm text-[#64748B] mb-5">
                Für {invite.employee.first_name} {invite.employee.last_name}. Gültig 14 Tage ab Erstellung, nur einmal nutzbar.
              </p>
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 text-sm font-mono text-[#0F172A] break-all mb-4">
                {link}
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => { navigator.clipboard.writeText(link); addToast('Link kopiert'); }}
                  className="btn-primary w-full"
                >
                  Link kopieren
                </button>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-xl text-sm font-semibold text-center bg-[#25D366] text-white hover:opacity-90 transition-opacity"
                >
                  Per WhatsApp teilen
                </a>
                <button onClick={() => setInvite(null)} className="btn-ghost w-full">Schließen</button>
              </div>
            </div>
          );
        })()}
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
            <button onClick={handleEditEmployee} disabled={!editFirst || !editLast || savingEdit} className="btn-primary">{savingEdit ? 'Wird gespeichert...' : 'Speichern'}</button>
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
          <p className="text-sm text-[#64748B] leading-relaxed mb-3">
            {deleteConfirm?.first_name} {deleteConfirm?.last_name} wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          {loadingImpact ? (
            <p className="text-xs text-[#94A3B8] mb-8">Prüfe verknüpfte Einsätze...</p>
          ) : deleteImpact && deleteImpact.assignments > 0 ? (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3.5 mb-8 flex items-start gap-2.5">
              <AlertCircle size={15} className="text-[#EF4444] shrink-0 mt-0.5" />
              <p className="text-xs text-[#EF4444] leading-relaxed">
                Dabei werden auch <strong>{deleteImpact.assignments} {deleteImpact.assignments === 1 ? 'Einsatz' : 'Einsätze'}</strong> gelöscht
                {deleteImpact.futureAssignments > 0 && <> — davon <strong>{deleteImpact.futureAssignments} in der Zukunft</strong></>}.
              </p>
            </div>
          ) : (
            <div className="mb-8" />
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} disabled={deleting} className="btn-ghost">Abbrechen</button>
            <button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} disabled={deleting} className="btn-danger">{deleting ? 'Wird gelöscht...' : 'Löschen'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
