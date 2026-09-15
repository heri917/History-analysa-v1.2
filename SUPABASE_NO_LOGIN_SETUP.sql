-- ARN STORE • RIWAYAT & ANALISA
-- NO LOGIN / NO PASSWORD
-- Jalankan SEKALI setelah Foundation v1.0.
-- Ini memberi role anon hak yang memang diperlukan aplikasi.
-- Jangan pernah memasukkan service_role key ke aplikasi/browser.
BEGIN;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE ON public.service_history TO anon;
GRANT SELECT ON public.service_history_view, public.service_summary, public.phone_model_summary, public.damage_summary, public.part_summary, public.part_usage_by_model, public.v_service_history_status TO anon;
DROP POLICY IF EXISTS service_history_anon_select ON public.service_history;
CREATE POLICY service_history_anon_select ON public.service_history FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS service_history_anon_insert ON public.service_history;
CREATE POLICY service_history_anon_insert ON public.service_history FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS service_history_anon_update ON public.service_history;
CREATE POLICY service_history_anon_update ON public.service_history FOR UPDATE TO anon USING (true) WITH CHECK (true);
COMMIT;
