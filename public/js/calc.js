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

/** Retorna somente as linhas cujo campo "realized" (e opcionalmente "planned") esta preenchido */
function filledAutomationRows(rows, requirePlanned = false) {
  return rows.filter((r) => isNum(r.realized) && (!requirePlanned || isNum(r.planned)));
}

function filledBugRows(rows) {
  return rows.filter((r) => isNum(r.opened) || isNum(r.resolved));
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
// Variacao Realizados - Variacao Planejados (usando os 2 ultimos meses preenchidos)
// ---------------------------------------------------------------------------
function kpi3MonthlyEfficiency(automationRows) {
  const filled = filledAutomationRows(automationRows, true);
  if (filled.length < 2) return null;
  const last = filled[filled.length - 1];
  const prev = filled[filled.length - 2];
  const prevRealized = toNum(prev.realized);
  const prevPlanned = toNum(prev.planned);
  if (!prevRealized || !prevPlanned) return null;
  const varRealized = (toNum(last.realized) - prevRealized) / prevRealized;
  const varPlanned = (toNum(last.planned) - prevPlanned) / prevPlanned;
  return varRealized - varPlanned;
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
  trend,
};
})();
