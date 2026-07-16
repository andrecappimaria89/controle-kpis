-- ============================================================================
-- MIGRAÇÃO: Checkbox "Incluir" (active) nas Tabelas 1 e 2
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- Mantida aqui apenas como referência / para replicar em outro ambiente.
-- ============================================================================

alter table automation_metrics add column if not exists active boolean not null default true;
alter table bug_metrics add column if not exists active boolean not null default true;
