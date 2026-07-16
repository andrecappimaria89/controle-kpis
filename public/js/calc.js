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

/** Retorna somente as linhas cujo campo "realized" esta preenchido (usado tambem para homologacao) */
function filledAutomationRows(rows, requirePlanned = false) {
  return rows.filter((r) => isNum(r.realized) && (!requirePlanned || isNum(r.planned)));
}

function filledBugRows(rows) {
  return rows.filter((r) => isNum(r.opened) || isNum(r.resolved));
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
  const filled = (squadRows || []).filter((r) => isNum(r.pointsPlanned) || isNum(r.pointsDelivered));
  const lastN = filled.slice(Math.max(0, filled.length - n));
  const totalPlanned = lastN.reduce((acc, r) => acc + (toNum(r.pointsPlanned) || 0), 0);
  const totalDelivered = lastN.reduce((acc, r) => acc + (toNum(r.pointsDelivered) || 0), 0);
  const variation = totalPlanned ? (totalDelivered - totalPlanned) / totalPlanned : 0;
  return { totalPlanned, totalDelivered, variation };
}

/** Velocity: media de pontos entregues nas ultimas N sprints preenchidas (padrao: 2) */
function velocity(squadRows, n = 2) {
  const filled = (squadRows || []).filter((r) => isNum(r.pointsPlanned) || isNum(r.pointsDelivered));
  const lastN = filled.slice(Math.max(0, filled.length - n));
  if (!lastN.length) return null;
  const sum = lastN.reduce((acc, r) => acc + (toNum(r.pointsDelivered) || 0), 0);
  return sum / lastN.length;
}

const MONTH_CYCLE = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Converte uma data (YYYY-MM-DD) na abreviacao de mes usada nas Tabelas 1/2 (ex: 'Jun') */
function monthAbbrevFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return MONTH_CYCLE[d.getMonth()];
}

// ---------------------------------------------------------------------------
// KPI 8 - Bugs por Pontos Entregues
// 1) Pega as 2 ultimas sprints concluidas (por data de fim)
// 2) Soma os pontos entregues dessas sprints
// 3) Mes de referencia = mes da data de fim da sprint mais recente
// 4) Bugs Abertos do mes de referencia / Soma dos pontos entregues
// ---------------------------------------------------------------------------
function bugsPerDeliveredPoints(squadRows, bugRows, n = 2) {
  const filledSquad = (squadRows || [])
    .filter((r) => r.endDate && (isNum(r.pointsPlanned) || isNum(r.pointsDelivered)))
    .slice()
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  if (!filledSquad.length) return null;

  const lastN = filledSquad.slice(Math.max(0, filledSquad.length - n));
  const totalPoints = lastN.reduce((acc, r) => acc + (toNum(r.pointsDelivered) || 0), 0);

  const mostRecent = filledSquad[filledSquad.length - 1];
  const refMonth = monthAbbrevFromDate(mostRecent.endDate);
  if (!refMonth) return null;

  const bugRow = (bugRows || []).find((r) => r.month === refMonth);
  const bugsOpened = bugRow ? (toNum(bugRow.opened) || 0) : 0;

  const perPoint = totalPoints ? bugsOpened / totalPoints : null;
  const per100 = perPoint === null ? null : perPoint * 100;

  return { refMonth, totalPoints, bugsOpened, perPoint, per100 };
}

// ---------------------------------------------------------------------------
// KPI 1 - Crescimento mensal da automacao
// ((Realizados ultimo mes preenchido - Realizados mes anterior) / Realizados mes anterior)
// ---------------------------------------------------------------------------
function kpi1MonthlyGrowth(automationRows) {
  const filled = filledAutomationRows(automationRows);
  if (filled.length < 2) return null;
  const last = filled[filled.length - 1];
  const prev = filled[filled.length - 2];
  const prevRealized = toNum(prev.realized);
  if (!prevRealized) return null;
  return (toNum(last.realized) - prevRealized) / prevRealized;
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

// ---------------------------------------------------------------------------
// KPI 3 - Eficiencia vs planejamento mensal
// Eficiencia = (Realizado / Planejado) * 100 para cada mes.
// Resultado = eficiencia atual + diferenca em PONTOS PERCENTUAIS vs mes anterior
// (NAO e crescimento percentual - e a diferenca direta entre as eficiencias).
// ---------------------------------------------------------------------------
function kpi3MonthlyEfficiency(automationRows) {
  const filled = filledAutomationRows(automationRows, true);
  if (filled.length < 2) return null;
  const last = filled[filled.length - 1];
  const prev = filled[filled.length - 2];
  if (!toNum(prev.planned) || !toNum(last.planned)) return null; // evita divisao por zero / eficiencia indefinida
  const effCurrent = automationPercentage(last.planned, last.realized); // fracao, ex: 0.6286
  const effPrevious = automationPercentage(prev.planned, prev.realized);
  return { current: effCurrent, diffPP: (effCurrent - effPrevious) * 100 };
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
// KPI 5 - Taxa de solucao mensal de bugs
// Resolvidos do ultimo mes preenchido / Abertos do ultimo mes preenchido (max 100%)
// ---------------------------------------------------------------------------
function kpi5MonthlyResolution(bugRows) {
  const filled = filledBugRows(bugRows);
  if (filled.length === 0) return null;
  const last = filled[filled.length - 1];
  const rate = resolutionRate(last.opened, last.resolved);
  return Math.min(rate, 1);
}

// ---------------------------------------------------------------------------
// KPI 6 - Taxa de solucao trimestral de bugs + backlog
// Soma Resolvidos (ultimos 3 meses preenchidos) / Soma Abertos (ultimos 3 meses)
// ---------------------------------------------------------------------------
function kpi6QuarterlyResolution(bugRows) {
  const filled = filledBugRows(bugRows);
  if (filled.length === 0) return null;
  const lastThree = filled.slice(Math.max(0, filled.length - 3));
  const sumOpened = lastThree.reduce((acc, r) => acc + (toNum(r.opened) || 0), 0);
  const sumResolved = lastThree.reduce((acc, r) => acc + (toNum(r.resolved) || 0), 0);
  const backlog = sumOpened - sumResolved;
  let rate;
  if (!sumOpened) {
    rate = sumResolved ? 1 : 0;
  } else {
    rate = Math.min(sumResolved / sumOpened, 1);
  }
  return { rate, backlog };
}

function kpi6Text(kpi6Result, formatPercent) {
  if (!kpi6Result) return 'Dados insuficientes';
  const pct = formatPercent(kpi6Result.rate);
  if (kpi6Result.backlog === 0) return `${pct} | Operação equilibrada`;
  return `${pct} | Backlog: ${kpi6Result.backlog}`;
}

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
  automationPercentage,
  resolutionRate,
  homologationRate,
  filledAutomationRows,
  filledBugRows,
  kpi1MonthlyGrowth,
  kpi2QuarterlyGrowth,
  kpi3MonthlyEfficiency,
  kpi4QuarterlyEfficiency,
  kpi4Phrase,
  kpi5MonthlyResolution,
  kpi6QuarterlyResolution,
  kpi6Text,
  kpi7MonthlyHomologationRate,
  aggregateHomologation,
  lastMonthHomologation,
  lastSprintsAggregate,
  velocity,
  bugsPerDeliveredPoints,
  monthAbbrevFromDate,
  trend,
};
})();
