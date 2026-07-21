-- ============================================================================
-- MIGRAÇÃO: Checkbox "Incluir" na Tabela 3 (mesma função da Tabela 1)
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- ============================================================================

alter table squad_metrics add column if not exists active boolean not null default true;
notify pgrst, 'reload schema';
