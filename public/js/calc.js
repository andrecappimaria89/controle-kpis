// ============================================================================
// calc.js - Todas as regras de negocio / formulas do sistema.
// Nenhuma funcao aqui toca o DOM ou o Supabase, so numeros -> facil de testar.
// ============================================================================

(function () {
/** true se o valor pode ser tratado como numero "preenchido" (nao vazio, nao NaN) */
function isNum(v) {
  return v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
}

function toNum(v) {
  return isNum(v) ? Number(v) : null;
}

/** Tabela 1: Percentual = Realizados / Planejados (0 se Planejados vazio/zero) */
function automationPercentage(planned, realized) {
  const p = toNum(planned);
  const r = toNum(realized);
  if (!p) return 0; // planejado vazio ou zero -> evita divisao por zero
  if (r === null) return 0;
  return r / p;
}

/** Tabela 2: Indice de Resolucao = Resolvidos / Abertos */
function resolutionRate(opened, resolved) {
  const o = toNum(opened);
  const r = toNum(resolved);
  if (!o) {
    // Abertos vazio/zero: se Resolvidos tambem for zero (ou vazio) -> 0%
    // se houver resolvidos sem nada aberto, tratamos como 100% (nao ha erro de divisao)
    return r ? 1 : 0;
  }
  if (r === null) return 0;
  return r / o;
}

/** Tabela 1 (nova coluna): Taxa de Homologacao = Automacoes Homologadas / Realizados */
function homologationRate(realized, homologated) {
  const r = toNum(realized);
  const h = toNum(homologated);
  if (!r) return 0; // sem realizados -> evita divisao por zero
  if (h === null) return 0;
  return Math.min(h / r, 1); // nunca pode passar de 100%
}

/** true se a linha deve entrar nos calculos: precisa estar marcada como "incluir" (padrao: sim, para compatibilidade com dados antigos sem esse campo) */
function isRowActive(r) {
  return r.active !== false;
}

/** Retorna somente as linhas MARCADAS ("incluir no calculo") e com o campo "realized" preenchido */
function filledAutomationRows(rows, requirePlanned = false) {
  return rows.filter((r) => isRowActive(r) && isNum(r.realized) && (!requirePlanned || isNum(r.planned)));
}

/** Linhas da Tabela 3 (squad) que tem algum dado de bug preenchido, ordenadas por Data Fim */
function filledSquadBugRows(squadRows) {
  return (squadRows || [])
    .filter((r) => isRowActive(r) && r.endDate && (isNum(r.bugsOpened) || isNum(r.bugsResolved)))
    .slice()
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
}

// ---------------------------------------------------------------------------
// KPI 7 - Taxa Automacao Homologadas (mensal)
// Automacoes Homologadas / Realizados do ultimo mes preenchido
// ---------------------------------------------------------------------------
function kpi7MonthlyHomologationRate(automationRows) {
  const filled = filledAutomationRows(automationRows);
  if (filled.length === 0) return null;
  const last = filled[filled.length - 1];
  return homologationRate(last.realized, last.homologated);
}

/** Agregado (todos os meses preenchidos) para o card de resumo e o grafico de pizza */
function aggregateHomologation(automationRows) {
  const filled = filledAutomationRows(automationRows);
  const totalRealized = filled.reduce((acc, r) => acc + (toNum(r.realized) || 0), 0);
  const totalHomologated = filled.reduce((acc, r) => acc + (toNum(r.homologated) || 0), 0);
  const rate = totalRealized ? Math.min(totalHomologated / totalRealized, 1) : 0;
  return { totalRealized, totalHomologated, rate };
}

/**
 * Soma de Pontos Planejados e Entregues APENAS nas ultimas N sprints preenchidas
 * (padrao: 2). Substituiu o antigo "aggregateSquad" (que somava o periodo todo).
 * variation = quanto o entregue ficou acima/abaixo do planejado nessas sprints.
 */
function lastSprintsAggregate(squadRows, n = 2) {
  const filled = (squadRows || []).filter((r) => isRowActive(r) && (isNum(r.pointsPlanned) || isNum(r.pointsDelivered)));
  const lastN = filled.slice(Math.max(0, filled.length - n));
  const totalPlanned = lastN.reduce((acc, r) => acc + (toNum(r.pointsPlanned) || 0), 0);
  const totalDelivered = lastN.reduce((acc, r) => acc + (toNum(r.pointsDelivered) || 0), 0);
  const variation = totalPlanned ? (totalDelivered - totalPlanned) / totalPlanned : 0;
  return { totalPlanned, totalDelivered, variation };
}

/** Velocity: media de pontos entregues nas ultimas N sprints preenchidas (padrao: 2) */
function velocity(squadRows, n = 2) {
  const filled = (squadRows || []).filter((r) => isRowActive(r) && (isNum(r.pointsPlanned) || isNum(r.pointsDelivered)));
  const lastN = filled.slice(Math.max(0, filled.length - n));
  if (!lastN.length) return null;
  const sum = lastN.reduce((acc, r) => acc + (toNum(r.pointsDelivered) || 0), 0);
  return sum / lastN.length;
}

// ---------------------------------------------------------------------------
// KPI 5 - Taxa de solucao mensal de bugs
// Resolvidos / Abertos da sprint mais recente (por Data Fim) com dado de bug
// preenchido na Tabela 3 (max 100%)
// ---------------------------------------------------------------------------
/**
 * Taxa de Bugs Aberto por Sprint = (Bugs Abertos / Pontos Entregues) * 100,
 * usando a sprint mais recente (por Data Fim) que tenha Pontos Entregues.
 */
function bugsRatePerSprint(squadRows) {
  const filled = (squadRows || [])
    .filter((r) => isRowActive(r) && r.endDate && isNum(r.pointsDelivered))
    .slice()
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  if (!filled.length) return null;
  const last = filled[filled.length - 1];
  const pointsDelivered = toNum(last.pointsDelivered) || 0;
  const bugsOpened = toNum(last.bugsOpened) || 0;
  const rate = pointsDelivered ? (bugsOpened / pointsDelivered) * 100 : null;
  return { bugsOpened, pointsDelivered, rate };
}

// ---------------------------------------------------------------------------
// KPI 5 - Taxa de Abertura de Bugs por Sprint
// Quantidade de bugs abertos na sprint mais recente + variacao percentual
// (maior ou menor) em relacao a sprint anterior.
// ---------------------------------------------------------------------------
function kpi5BugsOpenedTrend(squadRows) {
  const filled = filledSquadBugRows(squadRows);
  if (filled.length === 0) return null;
  const last = filled[filled.length - 1];
  const opened = toNum(last.bugsOpened) || 0;
  if (filled.length < 2) return { opened, delta: null, pct: null };
  const prev = filled[filled.length - 2];
  const prevOpened = toNum(prev.bugsOpened) || 0;
  const delta = opened - prevOpened;
  const pct = prevOpened ? delta / prevOpened : null;
  return { opened, delta, pct };
}

// ---------------------------------------------------------------------------
// KPI 8 - Taxa Geral de Resolucao de Bugs
// Soma de TODOS os bugs abertos e TODOS os bugs resolvidos cadastrados na
// Tabela 3 (todas as sprints) - visao geral, nao apenas das ultimas sprints.
// ---------------------------------------------------------------------------
function bugsGeneralResolutionRate(squadRows) {
  const filled = filledSquadBugRows(squadRows);
  if (filled.length === 0) return null;
  const totalOpened = filled.reduce((acc, r) => acc + (toNum(r.bugsOpened) || 0), 0);
  const totalResolved = filled.reduce((acc, r) => acc + (toNum(r.bugsResolved) || 0), 0);
  const rate = totalOpened ? Math.min(totalResolved / totalOpened, 1) : (totalResolved ? 1 : 0);
  return { totalOpened, totalResolved, rate };
}

// ---------------------------------------------------------------------------
// KPI 1 - Crescimento mensal da automacao
// Retorna a diferenca absoluta (quantidade) E o percentual de crescimento
// referente ao mes anterior. Ex: Jan=5, Fev=20 -> delta=+15, pct=+300%
// ---------------------------------------------------------------------------
function kpi1MonthlyDelta(automationRows) {
  const filled = filledAutomationRows(automationRows);
  if (filled.length < 2) return null;

  // "Producao" de cada mes preenchido = quanto o acumulado cresceu naquele mes
  // (mesma logica do grafico). O primeiro mes preenchido nao tem mes anterior
  // para comparar, entao sua producao e o proprio valor (base 0).
  function producedAt(i) {
    const value = toNum(filled[i].realized);
    if (value === null) return null;
    if (i === 0) return value;
    const prevValue = toNum(filled[i - 1].realized);
    return prevValue === null ? null : value - prevValue;
  }

  const lastIdx = filled.length - 1;
  const currentOutput = producedAt(lastIdx);
  const previousOutput = producedAt(lastIdx - 1);
  if (currentOutput === null || previousOutput === null) return null;

  const delta = currentOutput - previousOutput;
  const pct = previousOutput ? delta / previousOutput : null; // fracao, ou null se producao do mes anterior for 0
  return { delta, pct, currentOutput, previousOutput };
}

// ---------------------------------------------------------------------------
// KPI 2 - Crescimento trimestral da automacao (crescimento composto por periodo)
// ((Ultimo Realizado / Primeiro Realizado) ^ (1 / (qtd periodos - 1))) - 1
// ---------------------------------------------------------------------------
function kpi2QuarterlyGrowth(automationRows) {
  const filled = filledAutomationRows(automationRows);
  if (filled.length < 2) return null;
  const first = toNum(filled[0].realized);
  const last = toNum(filled[filled.length - 1].realized);
  const periods = filled.length;
  if (!first || periods - 1 === 0) return null;
  return Math.pow(last / first, 1 / (periods - 1)) - 1;
}

/**
 * Totais "GERAIS": como Planejados/Realizados/Homologadas na Tabela 1 sao
 * valores ACUMULADOS (o numero ja inclui tudo até aquele mes), o total
 * verdadeiro e simplesmente o valor do MES MAIS RECENTE preenchido - nao a
 * soma de todos os meses (que contaria tudo em duplicidade).
 */
function lastCumulativeTotals(automationRows) {
  const filled = filledAutomationRows(automationRows);
  if (!filled.length) return { planned: 0, realized: 0, homologated: 0 };
  const last = filled[filled.length - 1];
  return {
    planned: toNum(last.planned) || 0,
    realized: toNum(last.realized) || 0,
    homologated: toNum(last.homologated) || 0,
  };
}

/**
 * Serie de DIFERENCAS mes a mes para um campo acumulado (planned/realized).
 * Ex: Jun=6 (primeiro mes, delta=6), Jul=13 (delta=13-6=7).
 * Meses inativos ou vazios retornam null (sem dado) e nao alteram a base de comparacao.
 */
function automationDeltaSeries(automationRows, field) {
  let baseline = 0;
  let baselineSet = false;
  return (automationRows || []).map((r) => {
    if (!isRowActive(r) || !isNum(r[field])) return null;
    const current = toNum(r[field]);
    const delta = baselineSet ? current - baseline : current;
    baseline = current;
    baselineSet = true;
    return delta;
  });
}

// ---------------------------------------------------------------------------
// KPI 3 - Eficiencia vs planejamento mensal (GERAL)
// Como Planejados/Realizados sao acumulados, a eficiencia do mes precisa ser
// calculada com a DIFERENCA entre o mes atual e o anterior, nao com os
// valores acumulados brutos.
// Ex: Planejado 6->13 (delta 7), Realizado 5->6 (delta 1) => eficiencia = 1/7
// ---------------------------------------------------------------------------
/**
 * KPI "Eficiencia vs Planejamento Mensal"
 * Regras:
 *  1) Eficiencia Atual = Realizado do mes atual / Planejado do mes atual
 *  2) Eficiencia Mes Anterior = Realizado do mes anterior / Planejado do mes anterior
 *  3) Variacao = (EficienciaAtual - EficienciaAnterior) / EficienciaAnterior
 * IMPORTANTE: "Variacao" e uma variacao percentual (quanto a eficiencia mudou
 * em termos relativos), NAO a diferenca em pontos percentuais, e NAO a razao
 * entre as diferencas brutas de Realizado/Planejado (essa ultima e o que
 * causava resultados absurdos como 1800%, explicado no changelog/README).
 */
function kpi3EfficiencyVariation(automationRows) {
  const filled = filledAutomationRows(automationRows, true);
  if (filled.length < 2) return null;
  const last = filled[filled.length - 1];
  const prev = filled[filled.length - 2];
  if (!toNum(last.planned) || !toNum(prev.planned)) return null; // planejado zero -> eficiencia indefinida

  const current = automationPercentage(last.planned, last.realized); // fracao, ex: 0.4127
  const previous = automationPercentage(prev.planned, prev.realized); // fracao, ex: 0.3617
  if (!previous) return null; // eficiencia do mes anterior era zero -> variacao indefinida (divisao por zero)

  const variation = (current - previous) / previous;
  const status = variation > 0.0005 ? 'Melhorou' : variation < -0.0005 ? 'Piorou' : 'Sem alteração';
  return { current, previous, variation, status };
}

/** Homologacao apenas do ultimo mes preenchido (usado no grafico de pizza "mensal") */
function lastMonthHomologation(automationRows) {
  const filled = filledAutomationRows(automationRows);
  if (filled.length === 0) return null;
  const last = filled[filled.length - 1];
  const realized = toNum(last.realized) || 0;
  const homologated = toNum(last.homologated) || 0;
  const rate = homologationRate(last.realized, last.homologated);
  return { realized, homologated, rate };
}

// ---------------------------------------------------------------------------
// KPI 4 - Eficiencia vs planejamento trimestral
// Compara o ultimo mes preenchido com o mes preenchido "3 posicoes antes"
// (se nao houver 3 meses preenchidos antes, usa o primeiro mes preenchido)
// ---------------------------------------------------------------------------
function kpi4QuarterlyEfficiency(automationRows) {
  const filled = filledAutomationRows(automationRows, true);
  if (filled.length < 2) return null;
  const lastIdx = filled.length - 1;
  const beforeIdx = Math.max(0, lastIdx - 3);
  const last = filled[lastIdx];
  const before = filled[beforeIdx];
  const beforeRealized = toNum(before.realized);
  const beforePlanned = toNum(before.planned);
  if (!beforeRealized || !beforePlanned) return null;
  const varRealized = (toNum(last.realized) - beforeRealized) / beforeRealized;
  const varPlanned = (toNum(last.planned) - beforePlanned) / beforePlanned;
  return varRealized - varPlanned;
}

function kpi4Phrase(result) {
  if (result === null) return 'Dados insuficientes';
  const points = Math.round(result * 100);
  if (points > 0) return `Crescemos ${points} pontos percentuais acima do planejado`;
  if (points < 0) return `Ficamos ${Math.abs(points)} pontos percentuais abaixo do planejado`;
  return 'Crescimento alinhado ao planejamento';
}

// ---------------------------------------------------------------------------

/** Seta de tendencia a partir de um resultado numerico (positivo/negativo/neutro) */
function trend(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'neutral';
  if (value > 0.0005) return 'up';
  if (value < -0.0005) return 'down';
  return 'neutral';
}

// Exporta tudo em um unico objeto global simples (sem bundler / modulos ES)
window.KpiCalc = {
  isNum,
  toNum,
  isRowActive,
  automationPercentage,
  resolutionRate,
  homologationRate,
  filledAutomationRows,
  filledSquadBugRows,
  kpi1MonthlyDelta,
  kpi2QuarterlyGrowth,
  kpi3EfficiencyVariation,
  kpi4QuarterlyEfficiency,
  kpi4Phrase,
  kpi5BugsOpenedTrend,
  kpi7MonthlyHomologationRate,
  lastCumulativeTotals,
  automationDeltaSeries,
  lastMonthHomologation,
  lastSprintsAggregate,
  velocity,
  bugsGeneralResolutionRate,
  bugsRatePerSprint,
  trend,
};
})();
