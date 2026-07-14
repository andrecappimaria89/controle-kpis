-- ============================================================================
-- MIGRAÇÃO: Cycle Time (campo editável no painel Agilidade)
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- Mantida aqui apenas como referência / para replicar em outro ambiente.
-- ============================================================================

alter table areas add column if not exists cycle_time numeric;
