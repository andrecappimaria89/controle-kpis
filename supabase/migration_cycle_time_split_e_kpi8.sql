-- ============================================================================
-- MIGRAÇÃO: Cycle Time em dias+horas (substitui o campo único anterior) + KPI 8
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- Mantida aqui apenas como referência / para replicar em outro ambiente.
-- ============================================================================

-- 1. Cycle Time passa a ter dois campos editáveis: dias e horas
alter table areas add column if not exists cycle_time_days numeric;
alter table areas add column if not exists cycle_time_hours numeric;
alter table areas drop column if exists cycle_time;

-- 2. Novo KPI 8 - Bugs por Pontos Entregues
insert into kpi_configs (area_id, kpi_key, title, description, kpi_type)
select a.id, 'kpi8', 'Bugs por Pontos Entregues',
       'Relaciona os bugs abertos no mês de referência (mês da sprint mais recente) com os pontos entregues nas 2 últimas sprints concluídas.',
       'Sprints'
from areas a
on conflict (area_id, kpi_key) do nothing;
