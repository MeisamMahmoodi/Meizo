/*
  Realtime war komplett aus - die Publication "supabase_realtime" enthielt
  keine einzige Tabelle, obwohl das Frontend ueberall (Dashboard, Mitarbeiter,
  Einsaetze, ...) auf postgres_changes fuer diese Tabellen lauscht. Dadurch
  kam nirgends eine Live-Aktualisierung an - z.B. eine Krankmeldung vom Handy
  tauchte im Chef-Dashboard erst nach manuellem Neuladen auf.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.assignments,
  public.companies,
  public.employee_invites,
  public.employees,
  public.notifications,
  public.properties,
  public.replacement_requests,
  public.sick_reports;
