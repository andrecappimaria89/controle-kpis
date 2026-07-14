-- ============================================================================
-- MIGRAÇÃO: Tabela 3 (Volumetria Squad) + campo "Qtd Fluxos" numérico
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- Mantida aqui apenas como referência / para replicar em outro ambiente.
-- ============================================================================

-- 1. Campo "Fluxo" passa a ser numerico (Qtd Fluxos)
alter table automation_metrics alter column flow type numeric using (
  case when flow ~ '^[0-9]+(\.[0-9]+)?$' then flow::numeric else null end
);

-- 2. Nova tabela: Tabela 3 - Volumetria Squad
create table if not exists squad_metrics (
  id uuid primary key,
  area_id uuid not null references areas(id) on delete cascade,
  sprint text,
  start_date date,
  end_date date,
  points_planned numeric,
  points_delivered numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table squad_metrics enable row level security;

drop policy if exists "public all squad_metrics" on squad_metrics;
create policy "public all squad_metrics" on squad_metrics for all using (true) with check (true);

drop trigger if exists trg_squad_updated_at on squad_metrics;
create trigger trg_squad_updated_at before update on squad_metrics
  for each row execute function set_updated_at();
