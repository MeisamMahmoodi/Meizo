export interface Profile {
  id: string;
  role: 'owner' | 'employee' | 'admin';
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  owner_name: string;
  owner_email: string;
  owner_id: string | null;
  // Historisches Feld aus der Zeit fester Pläne (Starter/Business/Premium).
  // Wird seit der Umstellung auf Preis-pro-Mitarbeiter nirgends mehr zur
  // Funktionsfreischaltung genutzt, bleibt aber in der DB bestehen.
  contract: string;
  created_at: string;
  trial_ends_at: string | null;
  paid_until: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  // DATEV Lohn und Gehalt: Beraternummer/Mandantennummer sind pro Steuerberater-
  // Mandat fest vergeben, die Lohnart-Nummer für den Stundenlohn wird beim
  // Steuerberater individuell im ASCII-Import-Assistenten konfiguriert — daher
  // müssen alle drei einmalig mit dem Steuerberater abgestimmt werden, bevor
  // der DATEV-Export nutzbar ist.
  datev_beraternummer: string | null;
  datev_mandantennummer: string | null;
  datev_lohnart_stunden: string | null;
  // Owner opt-in: wenn true, fragt die replacement-dispatch Cron-Funktion bei
  // Krankmeldungen automatisch verfügbare Mitarbeiter an. Default false.
  auto_dispatch_enabled: boolean;
}

export interface Employee {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  status: 'active' | 'sick';
  user_id: string | null;
  email: string | null;
  hourly_wage: number | null;
  created_at: string;
  // Personalnummer, wie sie beim Steuerberater in DATEV Lohn und Gehalt
  // hinterlegt ist — ohne Übereinstimmung kann der Steuerberater die
  // exportierte Zeile keinem bestehenden Mitarbeiter zuordnen.
  datev_personalnummer: string | null;
}

export interface Property {
  id: string;
  company_id: string;
  name: string;
  address: string;
  type: 'office' | 'school' | 'supermarket' | 'doctor' | 'other';
  cleaning_days: string[];
  time_from: string;
  time_to: string;
  created_at: string;
  lat?: number | null;
  lng?: number | null;
  gps_radius_m?: number | null;
  // Was der Kunde monatlich für dieses Objekt zahlt — Basis für Umsatz-
  // und Margenberechnung im Controlling. Optional, da bestehende Objekte
  // das Feld noch nicht gepflegt haben.
  monthly_price?: number | null;
  // Unrateter Token für den öffentlichen Kunden-Link (/kunde/:token) — wird
  // per DB-Default automatisch vergeben, nie manuell gesetzt.
  public_token: string;
}

export interface EmployeeProperty {
  id: string;
  employee_id: string;
  property_id: string;
}

export interface Assignment {
  id: string;
  property_id: string;
  employee_id: string;
  date: string;
  status: 'assigned' | 'checked_in' | 'completed' | 'cancelled';
  created_at: string;
  time_from: string | null;
  time_to: string | null;
  checked_in_at?: string | null;
  completed_at?: string | null;
  checkin_photo_url?: string | null;
  checkout_photo_url?: string | null;
  checkin_lat?: number | null;
  checkin_lng?: number | null;
  checkout_lat?: number | null;
  checkout_lng?: number | null;
  recurring_order_id?: string | null;
}

export interface RecurringOrder {
  id: string;
  company_id: string;
  property_id: string;
  employee_ids: string[];
  weekdays: string[];
  time_from: string | null;
  time_to: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface SickReport {
  id: string;
  employee_id: string;
  date: string;
  date_to: string | null;
  reason: string;
  created_at: string;
}

export interface ReplacementRequest {
  id: string;
  sick_report_id: string;
  property_id: string;
  replacement_employee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  message: string;
  channel: 'whatsapp' | 'sms' | 'app';
  created_at: string;
  expires_at?: string | null;
}

export interface EmployeeWithDetails extends Employee {
  known_properties: Property[];
}

export interface AssignmentWithDetails extends Assignment {
  property: Property;
  employee: Employee;
}

export interface SickReportWithDetails extends SickReport {
  employee: Employee;
  assignments: AssignmentWithDetails[];
}

export interface ChecklistItem {
  id: string;
  company_id: string;
  property_type: Property['type'];
  label: string;
  sort_order: number;
  created_at: string;
}

export interface ChecklistCompletion {
  id: string;
  assignment_id: string;
  item_label: string;
  checked_at: string;
}

export interface Notification {
  id: string;
  employee_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}
