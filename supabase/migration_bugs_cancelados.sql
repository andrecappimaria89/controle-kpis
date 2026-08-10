-- ============================================================================
-- MIGRAÇÃO: Coluna "Bugs Cancelados" na Tabela 3 (Volumetria Squad)
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- ============================================================================

alter table squad_metrics add column if not exists bugs_cancelled numeric;
notify pgrst, 'reload schema';
