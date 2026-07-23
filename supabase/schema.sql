-- ============================================================================
-- Controle de KPIs Automatizados - Supabase schema
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- ============================================================================

-- 1. AREAS -------------------------------------------------------------------
create table if not exists areas (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique,
  cycle_time_days  numeric,                  -- Cycle Time - dias (valor editavel, nao calculado)
  cycle_time_hours numeric                   -- Cycle Time - horas (valor editavel, nao calculado)
);

insert into areas (name)
values ('DIRECT'), ('CBB'), ('PVP'), ('CS'), ('RFs')
on conflict (name) do nothing;

-- 2. AUTOMATION_METRICS (Tabela 1 - Volumetria de testes automatizados) ------
create table if not exists automation_metrics (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references areas(id) on delete cascade,
  month      text not null,                 -- ex: 'Mar', 'Abr', ...
  month_order integer not null default 0,   -- ordem cronologica para ordenacao estavel
  flow       numeric,                       -- Qtd Fluxos (cenários/fluxos analisados no mês)
  planned    numeric,                       -- Planejados (pode ficar vazio)
  realized   numeric,                       -- Realizados (pode ficar vazio)
  percentage numeric,                       -- Realizados / Planejados (calculado no front-end)
  homologated numeric,                      -- Automações Homologadas (validadas e funcionando)
  homologation_rate numeric,                -- Homologadas / Realizados (calculado no front-end)
  to_analyze numeric,                       -- Automações a Analisar
  active     boolean not null default true, -- checkbox "Incluir" - se false, o mes fica de fora dos calculos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, month)
);

-- 2b. SQUAD_METRICS (Tabela 3 - Volumetria Squad, agora inclui os campos de bugs) --
create table if not exists squad_metrics (
  id               uuid primary key,         -- gerado no navegador (nao e auto-incremento)
  area_id          uuid not null references areas(id) on delete cascade,
  sprint           text,
  start_date       date,
  end_date         date,
  points_planned   numeric,
  points_delivered numeric,
  bugs_opened      numeric,                  -- Bugs Abertos na sprint
  bugs_resolved    numeric,                  -- Bugs Resolvidos na sprint
  resolution_rate  numeric,                  -- Resolvidos / Abertos (calculado no front-end)
  active           boolean not null default true, -- checkbox "Incluir" - se false, a sprint fica de fora dos calculos
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 4. KPI_CONFIGS (titulo/descricao editaveis de cada card de KPI) -----------
create table if not exists kpi_configs (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references areas(id) on delete cascade,
  kpi_key     text not null,                -- 'kpi1' .. 'kpi6'
  title       text not null,
  description text not null default '',
  kpi_type    text not null default 'Mensal', -- 'Mensal' | 'Trimestral'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (area_id, kpi_key)
);

-- 5. updated_at automatico -----------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_automation_updated_at on automation_metrics;
create trigger trg_automation_updated_at before update on automation_metrics
  for each row execute function set_updated_at();

drop trigger if exists trg_kpi_configs_updated_at on kpi_configs;
create trigger trg_kpi_configs_updated_at before update on kpi_configs
  for each row execute function set_updated_at();

drop trigger if exists trg_squad_updated_at on squad_metrics;
create trigger trg_squad_updated_at before update on squad_metrics
  for each row execute function set_updated_at();

-- 6. Seed dos KPIs mensais para cada area (KPIs trimestrais foram descontinuados) --
insert into kpi_configs (area_id, kpi_key, title, description, kpi_type)
select a.id, k.kpi_key, k.title, k.description, k.kpi_type
from areas a
cross join (
  values
    ('kpi1', 'Crescimento Mensal da Automação',
     'Percentual de testes automatizados realizados, com meta de crescimento contínuo de 1 ponto percentual ao mês.',
     'Mensal'),
    ('kpi3', 'Eficiência vs Planejamento Mensal',
     'Eficiência do mês (Realizado ÷ Planejado), calculada com a diferença entre o mês atual e o anterior.',
     'Geral'),
    ('kpi5', 'Taxa de Solução Mensal de Bugs',
     'Percentual de bugs resolvidos comparado com os itens em aberto na sprint mais recente.',
     'Mensal'),
    ('kpi7', 'Taxa Automação Homologadas',
     'Percentual de cenários automatizados homologados (validados e funcionando) em relação ao total realizado no último mês.',
     'Mensal'),
    ('kpi8', 'Taxa Geral de Resolução de Bugs',
     'Soma de todos os bugs abertos e todos os bugs resolvidos cadastrados na Tabela 3, de forma geral.',
     'Geral')
) as k(kpi_key, title, description, kpi_type)
on conflict (area_id, kpi_key) do nothing;

-- 7. Row Level Security --------------------------------------------------------
-- Este app usa a chave "anon" diretamente do navegador. As policies abaixo
-- liberam leitura/escrita publica para simplificar o setup inicial.
-- Se a aplicacao exigir login, troque estas policies por regras baseadas em
-- auth.uid() antes de ir para producao.
alter table areas enable row level security;
alter table automation_metrics enable row level security;
alter table kpi_configs enable row level security;
alter table squad_metrics enable row level security;

drop policy if exists "public read areas" on areas;
create policy "public read areas" on areas for select using (true);

drop policy if exists "public update areas" on areas;
create policy "public update areas" on areas for update using (true) with check (true);

drop policy if exists "public all automation_metrics" on automation_metrics;
create policy "public all automation_metrics" on automation_metrics
  for all using (true) with check (true);

drop policy if exists "public all kpi_configs" on kpi_configs;
create policy "public all kpi_configs" on kpi_configs
  for all using (true) with check (true);

drop policy if exists "public all squad_metrics" on squad_metrics;
create policy "public all squad_metrics" on squad_metrics
  for all using (true) with check (true);
