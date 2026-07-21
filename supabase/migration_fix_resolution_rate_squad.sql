-- ============================================================================
-- CORREÇÃO CRÍTICA: coluna "resolution_rate" faltante em squad_metrics
--
-- Bug real do desenvolvimento anterior: o código passou a enviar um campo
-- "resolution_rate" ao salvar a Tabela 3, mas essa coluna nunca foi criada
-- na tabela squad_metrics. Isso fazia TODA gravação na Tabela 3 falhar
-- silenciosamente com erro 400 (PGRST204 - "Could not find the
-- 'resolution_rate' column"), desde a migração que uniu bugs à Tabela 3.
--
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- Mantida aqui apenas como referência / para replicar em outro ambiente.
-- ============================================================================

alter table squad_metrics add column if not exists resolution_rate numeric;

-- Forca o PostgREST a recarregar o cache de schema imediatamente
notify pgrst, 'reload schema';
