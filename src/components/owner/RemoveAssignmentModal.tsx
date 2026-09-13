import { AlertTriangle } from 'lucide-react';
import { Modal } from '../shared/Modal';
import type { Employee, Property, Assignment } from '../../lib/types';

interface AssignmentWithDetails extends Assignment {
  employee: Employee;
  property: Property;
}

interface RemoveAssignmentModalProps {
  assignment: AssignmentWithDetails | null;
  onClose: () => void;
  onConfirm: (assignment: AssignmentWithDetails) => void;
}

// Gemeinsamer "Zuweisung entfernen?"-Dialog für Assignments.tsx und
// Dashboard.tsx. Vorher gab es zwei fast identische Dialoge für dieselbe
// Aktion: in Assignments.tsx mit Name, Objekt und Datum in der Meldung, im
// Dashboard nur mit einem generischen Satz ohne Details - je nachdem, wo man
// geklickt hat, sah man eine andere Warnung für dieselbe Löschung.
export function RemoveAssignmentModal({ assignment, onClose, onConfirm }: RemoveAssignmentModalProps) {
  return (
    <Modal open={!!assignment} onClose={onClose} width="max-w-sm">
      <div className="p-8">
        <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] flex items-center justify-center mb-5">
          <AlertTriangle size={22} className="text-[#EF4444]" />
        </div>
        <h2 className="text-lg font-bold text-[#0F172A] mb-2">Zuweisung entfernen?</h2>
        <p className="text-sm text-[#64748B] leading-relaxed mb-8">
          {assignment && `${assignment.employee.first_name} ${assignment.employee.last_name} wird von ${assignment.property.name} am ${new Date(assignment.date).toLocaleDateString('de-DE')} entfernt.`}
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Abbrechen</button>
          <button onClick={() => assignment && onConfirm(assignment)} className="btn-danger">Entfernen</button>
        </div>
      </div>
    </Modal>
  );
}
