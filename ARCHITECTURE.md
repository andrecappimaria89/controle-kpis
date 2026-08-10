# Arquitetura do Projeto

Este documento explica **como o código está organizado hoje** (em camadas
bem definidas) e **como cada peça poderia ser trocada no futuro**, caso a
empresa decida migrar para o stack de referência corporativo (Angular,
Java/Spring Boot, MongoDB, Kafka, Docker/Kubernetes, Azure DevOps,
SonarQube, Veracode, JFrog Artifactory).

**Nada da stack atual foi alterado para gerar este documento.** O objetivo
aqui é só deixar os "pontos de troca" (swap points) claros, para que uma
migração futura — se um dia for necessária — seja incremental (troca peça
por peça) em vez de uma reescrita completa de uma vez.

## 1. Stack em uso hoje

| Camada | Tecnologia atual |
|---|---|
| Front-end | HTML5 + CSS3 + JavaScript puro (sem framework) |
| Gráficos | Chart.js (CDN) |
| Acesso a dados | `@supabase/supabase-js` (CDN), direto do navegador |
| Banco de dados | Supabase (Postgres gerenciado) |
| Hospedagem/Build | Netlify |
| Versionamento | Git / GitHub |
| Testes | `node:test` (nativo do Node, sem dependência nova) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

É um modelo **JAMstack**: o navegador conversa diretamente com o Supabase.
Não existe um backend próprio (Java, Node/Express, etc.) rodando entre o
front-end e o banco.

## 2. As 3 camadas do código (já existiam, agora documentadas formalmente)

```
public/js/
├── calc.js            <- CAMADA DE DOMÍNIO (regras de negócio / fórmulas)
├── supabaseClient.js  <- CAMADA DE ACESSO A DADOS (única que fala com o Supabase)
└── app.js             <- CAMADA DE APRESENTAÇÃO (tela, eventos, DOM)
```

### `calc.js` — Camada de Domínio
- Contém **todas** as fórmulas dos KPIs (crescimento, eficiência, taxa de
  bugs, resumo executivo, etc.).
- **Não sabe que o Supabase existe.** Não toca em `document`, `fetch` nem
  em nenhuma API de navegador. Só recebe números/objetos e devolve números/
  objetos.
- Por ser uma camada "pura", dá pra testar automaticamente sem precisar de
  navegador nem de banco — é exatamente o que a suíte em `test/calc.test.js`
  faz (18 casos, cobrindo os cálculos e os casos de borda como divisão por
  zero).

### `supabaseClient.js` — Camada de Acesso a Dados
- É o **único arquivo** que sabe que existe um Supabase.
- Expõe funções simples (`fetchAllData`, `saveAreaData`, `localSave`,
  `localLoad`) — o resto do app não sabe (nem precisa saber) que por trás
  disso tem uma tabela Postgres.
- **Se um dia a empresa precisar trocar de banco** (ex: um backend Java
  com MongoDB), essa é a **única camada que precisaria mudar**. `calc.js`
  e `app.js` continuam exatamente iguais, porque eles só conhecem essas
  funções genéricas, nunca o Supabase diretamente.

### `app.js` — Camada de Apresentação
- Cuida da tela: renderiza os cards, gráficos, tabelas, modais, eventos de
  clique/digitação.
- Chama `calc.js` para os cálculos e `supabaseClient.js` para persistência
  — nunca faz cálculo de KPI nem chamada ao banco diretamente.

## 3. "Pontos de troca" (onde cada peça do stack corporativo entraria)

Esta tabela mostra, **hipoteticamente**, onde cada tecnologia da imagem de
referência se encaixaria, SE um dia a migração for decidida — hoje nada
disso está implementado, é só o mapeamento para planejamento futuro.

| Peça do stack de referência | Onde entraria | Impacto no código atual |
|---|---|---|
| Angular + Node (front-end) | Substituiria `app.js` (camada de apresentação) | `calc.js` seria reaproveitado quase sem alteração (é JS puro); só a forma de renderizar a tela mudaria |
| Java + Spring Boot (back-end) | Entraria **entre** o front-end e o banco, expondo uma API REST própria | `supabaseClient.js` seria substituído por um cliente HTTP falando com essa API, em vez de falar direto com o Supabase |
| MongoDB / Kafka / Redis | Substituiriam o Supabase como armazenamento/mensageria | Ficariam "escondidos" atrás da API Java; o front-end continuaria sem saber a diferença |
| Docker + Kubernetes + Helm | Empacotariam e orquestrariam o backend Java + banco + Kafka | Não afeta o front-end; substituiria o Netlify **só na parte de backend** (o front-end estático ainda poderia continuar no Netlify, se desejado) |
| Azure DevOps | Substituiria o GitHub Actions atual (`.github/workflows/ci.yml`) | O pipeline já é modular — troca o executor, mantém os mesmos passos (checar sintaxe + rodar testes) |
| SonarQube / Veracode | Adicionar como passo extra dentro do pipeline de CI, depois dos testes | Não exige nenhuma mudança de código, só configuração do pipeline |
| JFrog Artifactory | Guardaria os artefatos de build (ex: `.jar` do Spring Boot, imagens Docker) | Não se aplica hoje, porque não há artefato binário a versionar (o front-end estático é publicado direto) |
| Maven | Ferramenta de build do futuro backend Java | Não se aplica à parte front-end |

## 4. Por que a migração completa não é feita "de uma vez"

O Netlify hospeda sites estáticos e funções serverless leves — ele não
executa containers Docker, Kafka, MongoDB, Redis nem uma aplicação Java
persistente. Se um backend Java (com Kafka/MongoDB) for adotado no futuro,
ele precisaria rodar em outra infraestrutura (ex: Azure App Service/AKS),
com o Netlify continuando a servir **apenas** o front-end estático (ou
sendo substituído, se o front-end também migrar para dentro do mesmo
cluster). Por isso a tabela acima trata isso como uma migração
**incremental**, peça por peça, e não como uma troca simultânea de tudo.

## 5. Como rodar os testes localmente

```bash
npm test
```

Isso executa a suíte em `test/calc.test.js` usando o test runner nativo do
Node (não precisa instalar Jest, Mocha nem nenhuma dependência nova).
