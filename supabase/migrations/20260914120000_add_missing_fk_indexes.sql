-- Fehlende Indizes auf Foreign Keys (von Supabase Performance Advisor gemeldet)
CREATE INDEX IF NOT EXISTS idx_assignments_employee_id ON public.assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON public.companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_employee_properties_property_id ON public.employee_properties(property_id);
CREATE INDEX IF NOT EXISTS idx_replacement_requests_property_id ON public.replacement_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_replacement_requests_replacement_employee_id ON public.replacement_requests(replacement_employee_id);
