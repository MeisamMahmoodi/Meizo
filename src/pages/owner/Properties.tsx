import { useState, useEffect, useMemo } from 'react';
import { Plus, MapPin, Pencil, Trash2, Building2, GraduationCap, ShoppingCart, HeartPulse, CalendarPlus, Euro, Link2, Search, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../../components/shared/Modal';
import { useToast } from '../../components/shared/Toast';
import { AddressAutocomplete } from '../../components/shared/AddressAutocomplete';
import { SortSelect } from '../../components/shared/SortSelect';
import { ActionMenu } from '../../components/shared/ActionMenu';
import type { ActionMenuItem } from '../../components/shared/ActionMenu';
import type { AddressValue } from '../../components/shared/AddressAutocomplete';
import { toLocalDateStr } from '../../lib/utils';
import type { Property, Company } from '../../lib/types';

interface PropertiesProps {
  company: Company;
  refreshKey: number;
  onRefresh: () => void;
  onNavigate?: (page: string) => void;
}

const typeOptions = [
  { value: 'office', label: 'Büro', icon: Building2 },
  { value: 'school', label: 'Schule', icon: GraduationCap },
  { value: 'supermarket', label: 'Supermarkt', icon: ShoppingCart },
  { value: 'doctor', label: 'Arztpraxis', icon: HeartPulse },
  { value: 'other', label: 'Sonstiges', icon: Building2 },
];

export function Properties({ company, refreshKey, onRefresh, onNavigate }: PropertiesProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  // Ohne das blitzte beim ersten Laden kurz "Keine Objekte gefunden" auf,
  // bevor die echten Daten da waren.
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Property | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Property | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<{ assignments: number; futureAssignments: number; employees: number } | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'newest'>('name');
  const { addToast } = useToast();

  // Zeigt in der Löschbestätigung die echte Anzahl betroffener Einsätze und
  // zugewiesener Mitarbeiter an, statt nur einem allgemeinen Warnsatz.
  useEffect(() => {
    if (!deleteConfirm) { setDeleteImpact(null); return; }
    setLoadingImpact(true);
    const today = toLocalDateStr(new Date());
    Promise.all([
      supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('property_id', deleteConfirm.id),
      supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('property_id', deleteConfirm.id).gte('date', today),
      supabase.from('employee_properties').select('id', { count: 'exact', head: true }).eq('property_id', deleteConfirm.id),
    ]).then(([totalRes, futureRes, empRes]) => {
      setDeleteImpact({ assignments: totalRes.count ?? 0, futureAssignments: futureRes.count ?? 0, employees: empRes.count ?? 0 });
      setLoadingImpact(false);
    });
  }, [deleteConfirm]);

  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState<AddressValue>({ formatted: '', lat: null, lng: null });
  const [newType, setNewType] = useState('office');
  const [newPrice, setNewPrice] = useState('');

  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState<AddressValue>({ formatted: '', lat: null, lng: null });
  const [editType, setEditType] = useState('office');
  const [editPrice, setEditPrice] = useState('');

  useEffect(() => { loadData(); }, [company.id, refreshKey]);

  // Vorher hatten nur Dashboard/Mitarbeiter/Einsätze Realtime — Änderungen an
  // Objekten (z.B. auf einem zweiten Gerät angelegt) blieben hier unsichtbar
  // bis zum manuellen Neuladen.
  useEffect(() => {
    const channel = supabase
      .channel(`properties-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company.id]);

  async function loadData() {
    try {
      const { data } = await supabase.from('properties').select('*').eq('company_id', company.id).order('name');
      setProperties(data || []);
    } catch {
      // Component renders with existing state
    } finally {
      setLoading(false);
    }
  }

  const openEditModal = (prop: Property) => {
    setEditName(prop.name);
    setEditAddress({ formatted: prop.address, lat: prop.lat ?? null, lng: prop.lng ?? null });
    setEditType(prop.type);
    setEditPrice(prop.monthly_price != null ? String(prop.monthly_price) : '');
    setEditModal(prop); setMenuOpen(null);
  };

  const handleAddProperty = async () => {
    if (!newName) return;
    // Objekte legen nur noch die Stammdaten fest (Name, Adresse, Typ, Preis).
    // Reinigungstage, Uhrzeiten und Mitarbeiterzuweisung passieren bewusst
    // getrennt im Einsätze-Bereich (Einzel- oder wiederkehrender Auftrag).
    const { error } = await supabase.from('properties').insert({
      company_id: company.id, name: newName, address: newAddress.formatted, type: newType,
      lat: newAddress.lat, lng: newAddress.lng,
      monthly_price: newPrice ? Number(newPrice) : null,
    });

    if (error) { addToast('Fehler beim Speichern', 'error'); return; }

    setAddModal(false); resetForm(); onRefresh(); addToast('Objekt hinzugefügt');
  };

  const handleEditProperty = async () => {
    // Guard against double-click, matching the same fix in Employees.tsx.
    if (!editModal || !editName || savingEdit) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase.from('properties').update({
        name: editName, address: editAddress.formatted, type: editType,
        lat: editAddress.lat, lng: editAddress.lng,
        monthly_price: editPrice ? Number(editPrice) : null,
      }).eq('id', editModal.id);

      if (error) { addToast('Fehler beim Speichern', 'error'); return; }

      setEditModal(null); onRefresh(); addToast('Objekt aktualisiert');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (prop: Property) => {
    // Every cascade step is checked now, matching the same fix in
    // Employees.tsx - previously a failed intermediate delete could leave
    // assignments gone while the property itself stayed.
    if (deleting) return;
    setDeleting(true);
    try {
      const r1 = await supabase.from('employee_properties').delete().eq('property_id', prop.id);
      if (r1.error) { addToast('Fehler beim Löschen der Mitarbeiterzuordnungen', 'error'); return; }
      const r2 = await supabase.from('assignments').delete().eq('property_id', prop.id);
      if (r2.error) { addToast('Fehler beim Löschen der Einsätze', 'error'); return; }
      const { error } = await supabase.from('properties').delete().eq('id', prop.id);
      if (error) { addToast('Fehler beim Löschen', 'error'); return; }
      setDeleteConfirm(null); setMenuOpen(null); onRefresh(); addToast('Objekt gelöscht');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyCustomerLink = async (prop: Property) => {
    const link = `${window.location.origin}/kunde/${prop.public_token}`;
    try {
      await navigator.clipboard.writeText(link);
      addToast('Kunden-Link kopiert — direkt an Facility Manager o.ä. weitergeben');
    } catch {
      addToast('Link konnte nicht kopiert werden', 'error');
    }
    setMenuOpen(null);
  };

  const resetForm = () => {
    setNewName(''); setNewAddress({ formatted: '', lat: null, lng: null }); setNewType('office'); setNewPrice('');
  };

  const filteredProperties = useMemo(() => {
    let list = properties;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || p.address.toLowerCase().includes(s));
    }
    if (typeFilter !== 'all') list = list.filter(p => p.type === typeFilter);

    list = list.slice().sort((a, b) => {
      if (sortBy === 'price') return (b.monthly_price ?? -1) - (a.monthly_price ?? -1);
      if (sortBy === 'newest') return b.created_at.localeCompare(a.created_at);
      return a.name.localeCompare(b.name, 'de');
    });

    return list;
  }, [properties, search, typeFilter, sortBy]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: properties.length };
    for (const opt of typeOptions) counts[opt.value] = properties.filter(p => p.type === opt.value).length;
    return counts;
  }, [properties]);

  const TypeIcon = ({ type }: { type: string }) => {
    const opt = typeOptions.find(o => o.value === type) || typeOptions[4];
    const Icon = opt.icon;
    return <Icon size={20} className="text-[#334155]" />;
  };

  const getPropertyMenuItems = (prop: Property): ActionMenuItem[] => [
    { label: 'Bearbeiten', icon: Pencil, onClick: () => openEditModal(prop) },
    { label: 'Einsatz erstellen', icon: CalendarPlus, tone: 'success', onClick: () => { setMenuOpen(null); onNavigate?.('assignments'); } },
    { label: 'Kunden-Link kopieren', icon: Link2, tone: 'info', onClick: () => handleCopyCustomerLink(prop) },
    { label: 'Löschen', icon: Trash2, tone: 'danger', dividerBefore: true, onClick: () => { setDeleteConfirm(prop); setMenuOpen(null); } },
  ];

  const renderTypePicker = (selectedType: string, setter: (v: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {typeOptions.map(opt => (
        <button key={opt.value} onClick={() => setter(opt.value)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${selectedType === opt.value ? 'bg-[#0F172A] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'}`}>
          <opt.icon size={14} /> {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Objekte</h1>
        <button onClick={() => setAddModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Objekt hinzufügen
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
        <input type="text" placeholder="Name oder Adresse..." value={search} onChange={e => setSearch(e.target.value)}
          className="input-field !pl-11" />
      </div>

      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ value: 'all', label: 'Alle' }, ...typeOptions].map(opt => (
            <button key={opt.value} onClick={() => setTypeFilter(opt.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${typeFilter === opt.value ? 'bg-[#0F172A] text-white shadow-sm' : 'bg-white text-[#64748B] hover:bg-[#F8FAFC] border border-[#E2E8F0]/60'}`}>
              {opt.label} {typeCounts[opt.value]}
            </button>
          ))}
        </div>
        <SortSelect
          value={sortBy}
          onChange={v => setSortBy(v as typeof sortBy)}
          options={[
            { value: 'name', label: 'Name (A-Z)' },
            { value: 'price', label: 'Preis' },
            { value: 'newest', label: 'Neueste zuerst' },
          ]}
        />
      </div>

      {loading ? (
        <div className="card p-10 text-center">
          <div className="w-6 h-6 border-2 border-[#CBD5E1] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredProperties.map(prop => {
            return (
              <div key={prop.id} className="card p-5 relative">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-[#F8FAFC] flex items-center justify-center shrink-0">
                    <TypeIcon type={prop.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A]">{prop.name}</p>
                    <p className="text-xs text-[#64748B] mt-1 flex items-center gap-1.5"><MapPin size={12} className="text-[#94A3B8]" /> {prop.address}</p>
                    {prop.monthly_price != null && (
                      <p className="text-xs text-[#16A34A] font-semibold mt-1 flex items-center gap-1.5"><Euro size={12} /> {prop.monthly_price.toLocaleString('de-DE')} €/Monat</p>
                    )}
                  </div>
                  <ActionMenu
                    items={getPropertyMenuItems(prop)}
                    isOpen={menuOpen === prop.id}
                    onOpenChange={open => setMenuOpen(open ? prop.id : null)}
                  />
                </div>
              </div>
            );
          })}
          {filteredProperties.length === 0 && (
            <div className="col-span-2 card p-10 text-center"><p className="text-sm text-[#94A3B8]">Keine Objekte gefunden</p></div>
          )}
        </div>
      )}

      {/* Add Property Modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); resetForm(); }} width="max-w-md">
        <div className="p-8">
          <h2 className="text-lg font-bold text-[#0F172A] mb-6">Objekt hinzufügen</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Objektname <span className="text-[#EF4444]">*</span></label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Adresse <span className="text-[#EF4444]">*</span></label>
              <AddressAutocomplete
                value={newAddress.formatted}
                onChange={setNewAddress}
              />
            </div>
            <div><label className="block text-sm font-medium text-[#0F172A] mb-1.5">Typ</label>{renderTypePicker(newType, setNewType)}</div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Monatspreis für den Kunden (optional)</label>
              <div className="relative">
                <Euro size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input type="number" min="0" step="1" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="z. B. 450" className="input-field pl-9" />
              </div>
              <p className="text-xs text-[#94A3B8] mt-1.5">Wird für die Umsatz- und Margenberechnung im Controlling genutzt.</p>
            </div>
          </div>
          <p className="text-xs text-[#94A3B8] mt-5">Reinigungstage, Uhrzeiten und Mitarbeiter legst du im Einsätze-Bereich fest, sobald du für dieses Objekt einen Einzel- oder wiederkehrenden Auftrag erstellst.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => { setAddModal(false); resetForm(); }} className="btn-ghost">Abbrechen</button>
            <button onClick={handleAddProperty} disabled={!newName || !newAddress.lat} className="btn-primary">Speichern</button>
          </div>
        </div>
      </Modal>

      {/* Edit Property Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} width="max-w-md">
        <div className="p-8">
          <h2 className="text-lg font-bold text-[#0F172A] mb-6">Objekt bearbeiten</h2>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-[#0F172A] mb-1.5">Objektname</label><input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="input-field" /></div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Adresse <span className="text-[#EF4444]">*</span></label>
              <AddressAutocomplete
                value={editAddress.formatted}
                onChange={setEditAddress}
              />
            </div>
            <div><label className="block text-sm font-medium text-[#0F172A] mb-1.5">Typ</label>{renderTypePicker(editType, setEditType)}</div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Monatspreis für den Kunden (optional)</label>
              <div className="relative">
                <Euro size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input type="number" min="0" step="1" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="z. B. 450" className="input-field pl-9" />
              </div>
              <p className="text-xs text-[#94A3B8] mt-1.5">Wird für die Umsatz- und Margenberechnung im Controlling genutzt.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <button onClick={() => setEditModal(null)} className="btn-ghost">Abbrechen</button>
            <button onClick={handleEditProperty} disabled={!editName || !editAddress.lat || savingEdit} className="btn-primary">{savingEdit ? 'Wird gespeichert...' : 'Speichern'}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} width="max-w-sm">
        <div className="p-8">
          <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] flex items-center justify-center mb-5">
            <Trash2 size={22} className="text-[#EF4444]" />
          </div>
          <h2 className="text-lg font-bold text-[#0F172A] mb-2">Objekt löschen?</h2>
          <p className="text-sm text-[#64748B] leading-relaxed mb-3">
            „{deleteConfirm?.name}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          {loadingImpact ? (
            <p className="text-xs text-[#94A3B8] mb-8">Prüfe verknüpfte Daten...</p>
          ) : deleteImpact && (deleteImpact.assignments > 0 || deleteImpact.employees > 0) ? (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3.5 mb-8 flex items-start gap-2.5">
              <AlertCircle size={15} className="text-[#EF4444] shrink-0 mt-0.5" />
              <p className="text-xs text-[#EF4444] leading-relaxed">
                Dabei werden auch{' '}
                {deleteImpact.assignments > 0 && (
                  <><strong>{deleteImpact.assignments} {deleteImpact.assignments === 1 ? 'Einsatz' : 'Einsätze'}</strong>{deleteImpact.futureAssignments > 0 && <> (davon {deleteImpact.futureAssignments} in der Zukunft)</>}</>
                )}
                {deleteImpact.assignments > 0 && deleteImpact.employees > 0 && ' sowie '}
                {deleteImpact.employees > 0 && (
                  <><strong>{deleteImpact.employees} Mitarbeiter-Zuweisung{deleteImpact.employees === 1 ? '' : 'en'}</strong></>
                )}
                {' '}entfernt.
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
