-- ============================================================================
-- MIGRAÇÃO: Automações Homologadas (rode isso se você JÁ tinha executado o
-- schema.sql antes desta funcionalidade existir). Se está criando o banco do
-- zero agora, não precisa rodar este arquivo — basta o schema.sql atualizado.
-- ============================================================================

-- 1. Novas colunas na tabela de automação
alter table automation_metrics add column if not exists homologated numeric;
alter table automation_metrics add column if not exists homologation_rate numeric;

-- 2. Cadastra o KPI 7 (Taxa Automação Homologadas) para todas as áreas que
--    ainda não o possuem
insert into kpi_configs (area_id, kpi_key, title, description, kpi_type)
select a.id, 'kpi7', 'Taxa Automação Homologadas',
       'Percentual de cenários automatizados homologados (validados e funcionando) em relação ao total realizado no último mês.',
       'Mensal'
from areas a
on conflict (area_id, kpi_key) do nothing;
