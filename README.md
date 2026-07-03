# Controle de KPIs Automatizados

Dashboard web responsivo para gestão e acompanhamento dos KPIs de automação de
testes e de bugs das áreas **DIRECT, CBB, PVP, CS e RFs** — reproduzindo e
melhorando a planilha `Controle_KPIS_Automatizados.xlsx`.

Stack: **HTML + CSS + JavaScript puro** (sem framework/bundler) + **Supabase**
(banco de dados) + **Chart.js** (gráficos) + deploy estático no **Netlify**.

## Estrutura de arquivos

```
netlify.toml              -> config de build/deploy do Netlify
package.json              -> apenas o script de build (gera o config.js)
scripts/generate-config.js-> injeta as variáveis de ambiente do Supabase
supabase/schema.sql       -> schema completo do banco (tabelas + RLS + seed)
public/
  index.html              -> shell da aplicação
  css/style.css            -> estilos (cores, cards, layout responsivo)
  js/config.js             -> gerado automaticamente no build (não editar)
  js/calc.js               -> todas as fórmulas dos KPIs (puro, sem DOM)
  js/supabaseClient.js     -> leitura/escrita no Supabase + fallback local
  js/app.js                -> estado, renderização e interações da UI
```

## 1. Configurar o Supabase

1. Crie um projeto em https://supabase.com.
2. Abra **SQL Editor** e rode o conteúdo completo de `supabase/schema.sql`.
   Isso cria as tabelas `areas`, `automation_metrics`, `bug_metrics` e
   `kpi_configs`, já com as 5 áreas e os 6 KPIs padrão cadastrados.
3. Em **Project Settings > API**, copie:
   - `Project URL` → variável `SUPABASE_URL`
   - `anon public key` → variável `SUPABASE_ANON_KEY`

> As policies de RLS no schema liberam leitura/escrita pública com a chave
> `anon`, para simplificar o setup inicial (não há tela de login). Se o
> projeto evoluir para múltiplos usuários autenticados, troque essas
> policies por regras baseadas em `auth.uid()`.

## 2. Rodar localmente

Não é necessário nenhum build tool para testar localmente:

1. Abra `public/js/config.js` e preencha `url` e `anonKey` com os valores do
   seu projeto Supabase (apenas para teste local — não faça commit de chaves
   reais em repositórios públicos).
2. Sirva a pasta `public/` com qualquer servidor estático, por exemplo:
   ```bash
   npx serve public
   # ou
   python3 -m http.server --directory public 5500
   ```
3. Acesse `http://localhost:5500` (ou a porta indicada).

Se você não configurar o Supabase, o app funciona normalmente em **modo
local**, salvando os dados no `localStorage` do navegador — útil para uma
demonstração rápida.

## 3. Deploy no Netlify

1. Suba este projeto para um repositório Git (GitHub/GitLab/Bitbucket) ou
   arraste a pasta no painel do Netlify (“Deploy manually”).
2. No Netlify, crie um novo site a partir do repositório. As configurações de
   `netlify.toml` já definem:
   - **Build command:** `node scripts/generate-config.js`
   - **Publish directory:** `public`
3. Em **Site settings > Environment variables**, adicione:
   - `SUPABASE_URL` = URL do seu projeto Supabase
   - `SUPABASE_ANON_KEY` = chave anônima (anon/public) do Supabase
4. Faça o deploy (ou "Trigger deploy"). O build script lê essas variáveis e
   gera `public/js/config.js` automaticamente — as chaves nunca ficam
   hardcoded no repositório.

## Funcionalidades implementadas

- 5 áreas (DIRECT, CBB, PVP, CS, RFs) com a mesma estrutura de dados/dashboard.
- Tabela 1 (Volumetria de testes automatizados) e Tabela 2 (Volumetria de
  bugs), editáveis, com cálculo automático de percentual/índice de resolução
  e tratamento de divisão por zero.
- Gráficos de barras agrupadas (Chart.js) para as duas tabelas.
- Os 6 KPIs obrigatórios (crescimento mensal/trimestral da automação,
  eficiência vs planejamento mensal/trimestral, taxa de solução mensal e
  trimestral de bugs com backlog), com título/descrição editáveis e
  resultado sempre calculado (nunca editável manualmente).
- Setas de tendência (▲ / ▼ / neutro) nos KPIs de variação.
- Cards de resumo geral (planejado, realizado, % automatizado, bugs abertos,
  resolvidos e backlog atual).
- Modo **Edição** (mostra as tabelas de entrada) e modo **Executivo**
  (mostra apenas dashboards e KPIs).
- Botões: Salvar alterações, Adicionar novo mês, Duplicar estrutura para
  todas as áreas, Exportar CSV.
- Validação contra números negativos e mensagens de sucesso/erro ao salvar.
- Layout responsivo (desktop e tablet), com cabeçalho fixo, cards
  arredondados e paleta de cores: azul (planejado), verde
  (realizado/resolvido), laranja (bugs abertos), vermelho (alertas).

## Regras de cálculo (resumo)

Todas as fórmulas estão implementadas e comentadas em `public/js/calc.js`:

- **% Automação** = Realizados / Planejados (retorna 0 se Planejados vazio/zero).
- **Índice de Resolução** = Resolvidos / Abertos (retorna 0 se Abertos e
  Resolvidos forem zero; evita divisão por zero).
- **KPI 1** — variação de Realizados entre os dois últimos meses preenchidos.
- **KPI 2** — crescimento composto entre o primeiro e o último mês preenchido.
- **KPI 3** — variação de Realizados menos variação de Planejados (mês a mês).
- **KPI 4** — mesma lógica do KPI 3, comparando o último mês preenchido com o
  mês 3 posições antes (ou o primeiro mês preenchido, se não houver histórico
  suficiente), com frase automática de acima/abaixo/alinhado ao planejado.
- **KPI 5** — Resolvidos / Abertos do último mês preenchido, limitado a 100%.
- **KPI 6** — soma de Resolvidos / soma de Abertos dos últimos 3 meses
  preenchidos, com indicação de backlog (ou "Operação equilibrada" se zero).
