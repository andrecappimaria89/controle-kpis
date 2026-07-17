-- ============================================================================
-- MIGRAÇÃO: Bugs (antiga Tabela 2) incorporados na Tabela 3 (Volumetria Squad)
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- Mantida aqui apenas como referência / para replicar em outro ambiente.
--
-- IMPORTANTE: esta migração NÃO apaga a tabela bug_metrics nem seus dados
-- antigos (ficam preservados, apenas não são mais lidos pelo app). Se algumas
-- de suas sprints já tinham bugs cadastrados na Tabela 2 antiga, você precisa
-- digitá-los manualmente nas novas colunas "Bugs Abertos"/"Bugs Resolvidos"
-- da Tabela 3 (não há uma correspondência automática confiável entre "mês" e
-- "sprint").
-- ============================================================================

alter table squad_metrics add column if not exists bugs_opened numeric;
alter table squad_metrics add column if not exists bugs_resolved numeric;

-- Atualiza os textos do KPI 8, que deixou de ser "por pontos entregues" e
-- passou a ser a taxa geral de resolução de bugs (soma de tudo cadastrado)
update kpi_configs
set title = 'Taxa Geral de Resolução de Bugs',
    description = 'Soma de todos os bugs abertos e todos os bugs resolvidos cadastrados na Tabela 3, de forma geral.',
    kpi_type = 'Geral'
where kpi_key = 'kpi8';

update kpi_configs
set description = 'Eficiência do mês (Realizado ÷ Planejado), calculada com a diferença entre o mês atual e o anterior.'
where kpi_key = 'kpi3';

update kpi_configs
set description = 'Percentual de bugs resolvidos comparado com os itens em aberto na sprint mais recente.'
where kpi_key = 'kpi5';
