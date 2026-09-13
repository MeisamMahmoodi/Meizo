import { useState, useEffect } from 'react';
import { ListChecks, Plus, Trash2, ChevronUp, ChevronDown, Building2, GraduationCap, ShoppingCart, HeartPulse, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../shared/Toast';
import { Modal } from '../shared/Modal';
import type { ChecklistItem, Company, Property } from '../../lib/types';

interface ChecklistSettingsProps {
  company: Company;
}

const typeOptions: { value: Property['type']; label: string; icon: typeof Building2 }[] = [
  { value: 'office', label: 'Büro', icon: Building2 },
  { value: 'school', label: 'Schule', icon: GraduationCap },
  { value: 'supermarket', label: 'Supermarkt', icon: ShoppingCart },
  { value: 'doctor', label: 'Arztpraxis', icon: HeartPulse },
  { value: 'other', label: 'Sonstiges', icon: Building2 },
];

export function ChecklistSettings({ company }: ChecklistSettingsProps) {
  const [activeType, setActiveType] = useState<Property['type']>('office');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ChecklistItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { addToast } = useToast();

  useEffect(() => { loadItems(); }, [company.id]);

  async function loadItems() {
    const { data } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('company_id', company.id)
      .order('sort_order', { ascending: true });
    setItems((data as ChecklistItem[]) || []);
  }

  const itemsForType = items.filter(i => i.property_type === activeType);

  const handleAdd = async () => {
    // Guard against a fast double-Enter: React's state update from setSaving
    // is not immediate, so without this check two Enter presses in quick
    // succession could both slip through before the button even disabled
    // itself, creating the same checklist point twice.
    const label = newLabel.trim();
    if (!label || saving) return;
    setSaving(true);
    const maxSort = itemsForType.reduce((max, i) => Math.max(max, i.sort_order), -1);
    const { error } = await supabase.from('checklist_items').insert({
      company_id: company.id,
      property_type: activeType,
      label,
      sort_order: maxSort + 1,
    });
    setSaving(false);
    if (error) {
      addToast('Fehler beim Hinzufügen', 'error');
      return;
    }
    setNewLabel('');
    loadItems();
  };

  const handleDelete = async (item: ChecklistItem) => {
    // Löschen fragte vorher gar nicht nach - ein versehentlicher Klick hat
    // den Punkt sofort und ohne Rückfrage entfernt.
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('checklist_items').delete().eq('id', item.id);
      if (error) { addToast('Fehler beim Löschen', 'error'); return; }
      setDeleteConfirm(null);
      loadItems();
    } finally {
      setDeleting(false);
    }
  };

  const handleMove = async (item: ChecklistItem, direction: 'up' | 'down') => {
    // Guard against rapid double-clicking on the arrows: two overlapping
    // swaps used to be able to race and leave sort_order inconsistent.
    if (movingId) return;
    const sorted = itemsForType.slice().sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(i => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    setMovingId(item.id);
    try {
      await Promise.all([
        supabase.from('checklist_items').update({ sort_order: other.sort_order }).eq('id', item.id),
        supabase.from('checklist_items').update({ sort_order: item.sort_order }).eq('id', other.id),
      ]);
      loadItems();
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="card p-6 sm:p-8">
      <h2 className="text-base font-semibold text-ink-900 mb-1.5 flex items-center gap-2.5">
        <ListChecks size={18} className="text-ink-500" /> Checklisten
      </h2>
      <p className="text-sm text-ink-500 mb-5">
        Diese Punkte muss dein Team beim Auschecken abhaken — pro Objekttyp, gilt für alle Objekte dieses Typs.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {typeOptions.map(opt => {
          const Icon = opt.icon;
          const active = activeType === opt.value;
          const count = items.filter(i => i.property_type === opt.value).length;
          return (
            <button
              key={opt.value}
              onClick={() => setActiveType(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                active ? 'bg-ink-900 text-white' : 'bg-surface-100 text-ink-500 hover:bg-surface-200'
              }`}
            >
              <Icon size={13} /> {opt.label}
              {count > 0 && <span className={active ? 'text-white/70' : 'text-ink-300'}>· {count}</span>}
            </button>
          );
        })}
      </div>

      {itemsForType.length === 0 ? (
        <p className="text-sm text-ink-300 mb-4">Noch keine Checklisten-Punkte für "{typeOptions.find(o => o.value === activeType)?.label}".</p>
      ) : (
        <div className="space-y-2 mb-4">
          {itemsForType
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2 bg-surface-50 border border-surface-200 rounded-xl px-3.5 py-2.5">
                <span className="flex-1 text-sm text-ink-900">{item.label}</span>
                <button onClick={() => handleMove(item, 'up')} disabled={idx === 0 || !!movingId} aria-label="Nach oben verschieben" className="p-1 rounded-lg text-ink-300 hover:text-ink-700 hover:bg-surface-100 disabled:opacity-30 transition-colors">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => handleMove(item, 'down')} disabled={idx === itemsForType.length - 1 || !!movingId} aria-label="Nach unten verschieben" className="p-1 rounded-lg text-ink-300 hover:text-ink-700 hover:bg-surface-100 disabled:opacity-30 transition-colors">
                  <ChevronDown size={14} />
                </button>
                <button onClick={() => setDeleteConfirm(item)} aria-label="Löschen" className="p-1 rounded-lg text-danger-300 hover:text-danger-500 hover:bg-danger-50 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Neuer Punkt, z. B. Böden gewischt"
          className="input-field flex-1"
        />
        <button onClick={handleAdd} disabled={saving || !newLabel.trim()} className="btn-secondary shrink-0 px-4">
          <Plus size={16} />
        </button>
      </div>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} width="max-w-sm">
        <div className="p-8">
          <div className="w-12 h-12 rounded-2xl bg-danger-50 flex items-center justify-center mb-5">
            <AlertTriangle size={22} className="text-danger-500" />
          </div>
          <h2 className="text-lg font-bold text-ink-900 mb-2">Checklisten-Punkt löschen?</h2>
          <p className="text-sm text-ink-500 leading-relaxed mb-8">
            "{deleteConfirm?.label}" wird für alle Objekte vom Typ "{typeOptions.find(o => o.value === deleteConfirm?.property_type)?.label}" entfernt.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} disabled={deleting} className="btn-ghost">Abbrechen</button>
            <button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} disabled={deleting} className="btn-danger">{deleting ? 'Wird gelöscht...' : 'Löschen'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
