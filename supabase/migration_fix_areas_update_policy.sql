-- ============================================================================
-- CORREÇÃO CRÍTICA: faltava policy de UPDATE na tabela "areas"
--
-- A tabela "areas" tinha RLS habilitado com policy SOMENTE de leitura
-- ("public read areas"). Isso significa que toda tentativa de salvar o
-- Cycle Time (dias/horas) - que faz um UPDATE direto em "areas" - era
-- bloqueada silenciosamente pelo banco, mesmo com o código 100% correto.
--
-- Já foi aplicada diretamente no banco "Kpis" via conector Supabase do Claude.
-- Mantida aqui apenas como referência / para replicar em outro ambiente.
-- ============================================================================

drop policy if exists "public update areas" on areas;
create policy "public update areas" on areas for update using (true) with check (true);
