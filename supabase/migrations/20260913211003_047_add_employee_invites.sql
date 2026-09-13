/*
  # Employee invites

  Ersetzt das bisherige Verfahren, bei dem der Chef E-Mail und ein
  Start-Passwort fuer jeden Mitarbeiter selbst eintippen musste. Stattdessen
  erzeugt der Chef einen kurzen Einladungscode, der Mitarbeiter oeffnet ihn
  unter /einladung/CODE und legt sein Konto (eigene E-Mail, eigenes
  Passwort) selbst an.

  1. Neue Tabelle employee_invites
     - code: kurzer, gut lesbarer Zufallscode (ohne verwechselbare Zeichen
       wie 0/O oder 1/I/L), wird in der Edge Function erzeugt
     - expires_at: 14 Tage nach Erstellung
     - used_at: gesetzt sobald der Code eingeloest wurde (Einmalnutzung)

  2. RLS
     - Owner duerfen Einladungen fuer Mitarbeiter ihrer eigenen Firma anlegen,
       einsehen und loeschen (z.B. um eine alte Einladung durch eine neue zu
       ersetzen).
     - Kein direkter anonymer Zugriff auf die Tabelle selbst - das Pruefen
       eines Codes vor dem Einloesen laeuft ueber die SECURITY DEFINER
       Funktion get_employee_invite_info(), die absichtlich nur das Minimum
       zurueckgibt (Firmenname, Vorname, Gueltigkeit), niemals IDs. Das
       tatsaechliche Einloesen (Konto anlegen) laeuft ueber die
       accept-employee-invite Edge Function mit Service Role, die RLS ohnehin
       umgeht.
*/

CREATE TABLE IF NOT EXISTS employee_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS employee_invites_employee_id_idx ON employee_invites(employee_id);
CREATE INDEX IF NOT EXISTS employee_invites_company_id_idx ON employee_invites(company_id);

ALTER TABLE employee_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage invites for their own employees"
  ON employee_invites
  FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.get_employee_invite_info(p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite record;
  v_company_name text;
  v_first_name text;
BEGIN
  SELECT * INTO v_invite FROM employee_invites WHERE code = p_code;

  IF v_invite.id IS NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'used');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'reason', 'expired');
  END IF;

  SELECT name INTO v_company_name FROM companies WHERE id = v_invite.company_id;
  SELECT first_name INTO v_first_name FROM employees WHERE id = v_invite.employee_id;

  RETURN json_build_object(
    'valid', true,
    'company_name', v_company_name,
    'first_name', v_first_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_invite_info(text) TO anon, authenticated;
