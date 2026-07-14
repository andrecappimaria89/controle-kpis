-- ============================================================================
-- MIGRAÇÃO: Cadastro de Informações (Fluxo / Automações a Analisar) + remoção
-- dos KPIs trimestrais. Rode isso se você já tinha executado o schema.sql
-- antes desta atualização.
-- ============================================================================

-- 1. Novas colunas na tabela de automação
alter table automation_metrics add column if not exists flow text;
alter table automation_metrics add column if not exists to_analyze numeric;

-- 2. Remove os KPIs trimestrais descontinuados (KPI 2, 4 e 6) de todas as áreas
delete from kpi_configs where kpi_key in ('kpi2', 'kpi4', 'kpi6');
