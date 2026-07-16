// ============================================================================
// app.js - estado da aplicacao, renderizacao e interacoes.
// ============================================================================

const AREA_NAMES = ['DIRECT', 'CBB', 'PVP', 'CS', 'RFs'];
const MONTH_CYCLE = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const DEFAULT_KPI_CONFIG = {
  kpi1: {
    title: 'Crescimento Mensal da Automação',
    description: 'Percentual de testes automatizados realizados, com meta de crescimento contínuo de 1 ponto percentual ao mês.',
    type: 'Mensal',
  },
  kpi3: {
    title: 'Eficiência vs Planejamento Mensal',
    description: 'Percentual de eficiência (Realizado/Planejado) referente ao mês mais recente cadastrado.',
    type: 'Geral',
  },
  kpi5: {
    title: 'Taxa de Solução Mensal de Bugs',
    description: 'Percentual de bugs resolvidos comparado com os itens em aberto no último mês.',
    type: 'Mensal',
  },
  kpi7: {
    title: 'Taxa Automação Homologadas',
    description: 'Percentual de cenários automatizados homologados (validados e funcionando) em relação ao total realizado no último mês.',
    type: 'Mensal',
  },
  kpi8: {
    title: 'Bugs por Pontos Entregues',
    description: 'Relaciona os bugs abertos no mês de referência (mês da sprint mais recente) com os pontos entregues nas 2 últimas sprints concluídas.',
    type: 'Sprints',
  },
};

// Dados de exemplo, iguais aos da planilha original, usados apenas na primeira carga.
function defaultAutomationRows() {
  return [
    { month: 'Mar', flow: 3, planned: 30, realized: 10, homologated: 8, toAnalyze: 2 },
    { month: 'Abr', flow: 4, planned: 32, realized: 15, homologated: 11, toAnalyze: 3 },
    { month: 'Mai', flow: 4, planned: 35, realized: 16, homologated: 13, toAnalyze: 1 },
    { month: 'Jun', flow: '', planned: '', realized: '', homologated: '', toAnalyze: '' },
    { month: 'Jul', flow: '', planned: '', realized: '', homologated: '', toAnalyze: '' },
  ];
}

/** Gera um id estavel no navegador para linhas sem chave natural (ex: sprints da Tabela 3) */
function makeId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Dados de exemplo para a Tabela 3 - Volumetria Squad
function defaultSquadRows() {
  return [
    { id: makeId(), startDate: '2026-06-01', endDate: '2026-06-14', sprint: 'Sprint 23', pointsPlanned: 40, pointsDelivered: 34 },
    { id: makeId(), startDate: '2026-06-15', endDate: '2026-06-28', sprint: 'Sprint 24', pointsPlanned: 45, pointsDelivered: 42 },
  ];
}

const DEFAULT_BUGS_BY_AREA = {
  DIRECT: [ [1, 3], [0, 0], [2, 2], [9, 8] ],
  CBB:    [ [20, 28], [10, 15], [11, 8], [4, 8] ],
  PVP:    [ [0, 0], [3, 2], [6, 6], [13, 10] ],
  CS:     [ [0, 0], [3, 3], [6, 5], [6, 6] ],
  RFs:    [ [0, 0], [1, 1], [1, 1], [0, 0] ],
};

function defaultBugRows(areaName) {
  const months = ['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set'];
  const filled = DEFAULT_BUGS_BY_AREA[areaName] || [];
  return months.map((month, idx) => {
    const pair = filled[idx];
    return { month, opened: pair ? pair[0] : '', resolved: pair ? pair[1] : '' };
  });
}

function buildDefaultState() {
  const data = {};
  AREA_NAMES.forEach((name) => {
    data[name] = {
      automation: defaultAutomationRows(),
      bugs: defaultBugRows(name),
      squad: defaultSquadRows(),
      cycleTimeDays: 2,
      cycleTimeHours: 3,
      kpis: JSON.parse(JSON.stringify(DEFAULT_KPI_CONFIG)),
    };
  });
  return { currentArea: 'DIRECT', page: 'dashboard', data };
}

// ------------------------------- ESTADO GLOBAL ------------------------------
let state = buildDefaultState();
let areaIdByName = {}; // preenchido quando o Supabase esta configurado
let charts = { automation: null, bugs: null, homologation: null, agility: null };

// -------------------------------- HELPERS ------------------------------------
const { toNum, isNum } = window.KpiCalc;

function formatPercent(v, { signed = false, fallback = '—', decimals = 1 } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return fallback;
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
  return signed && v > 0 ? `+${formatted}` : formatted;
}

/** Formata uma diferenca em PONTOS PERCENTUAIS (o valor ja esta na escala 0-100, nao 0-1) */
function formatPP(v, { decimals = 2, fallback = '—' } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return fallback;
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(v));
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}${formatted} p.p.`;
}

/** Formata uma diferenca inteira com sinal (ex: +15, -3) */
function formatSignedInt(v, { fallback = '—' } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return fallback;
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}${formatInt(Math.abs(v))}`;
}

function formatInt(v) {
  return new Intl.NumberFormat('pt-BR').format(v || 0);
}

function trendArrow(value) {
  const t = window.KpiCalc.trend(value);
  if (t === 'up') return { symbol: '▲', cls: 'up' };
  if (t === 'down') return { symbol: '▼', cls: 'down' };
  return { symbol: '■', cls: 'neutral' };
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.className = 'toast'; }, 3200);
}

function currentAreaData() {
  return state.data[state.currentArea];
}

function updateConnectionStatus(kind, text) {
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `connection-status ${kind}`;
}

// -------------------------------- PERSISTENCIA --------------------------------
async function loadInitialData() {
  if (window.DataStore.IS_SUPABASE_CONFIGURED) {
    try {
      const remote = await window.DataStore.fetchAllData();
      if (remote) {
        hydrateStateFromSupabase(remote);
        updateConnectionStatus('ok', 'Conectado ao Supabase');
        return;
      }
    } catch (err) {
      console.error(err);
      updateConnectionStatus('error', 'Falha ao conectar ao Supabase — usando dados locais');
      showToast('Não foi possível conectar ao Supabase. Usando dados salvos localmente. Suas próximas edições continuam seguras no navegador.', 'error');
    }
  } else {
    updateConnectionStatus('local', 'Supabase não configurado — modo local (localStorage)');
  }

  const local = window.DataStore.localLoad();
  if (local) state = local;
}

function hydrateStateFromSupabase(remote) {
  const { areas, automation, bugs, squad, kpiConfigs } = remote;
  areaIdByName = {};
  const cycleTimeByName = {};
  areas.forEach((a) => {
    areaIdByName[a.name] = a.id;
    cycleTimeByName[a.name] = { days: a.cycle_time_days ?? '', hours: a.cycle_time_hours ?? '' };
  });

  const data = {};
  AREA_NAMES.forEach((name) => {
    const areaId = areaIdByName[name];
    const autoRows = automation
      .filter((r) => r.area_id === areaId)
      .map((r) => ({
        month: r.month,
        flow: r.flow ?? '',
        planned: r.planned ?? '',
        realized: r.realized ?? '',
        homologated: r.homologated ?? '',
        toAnalyze: r.to_analyze ?? '',
      }));
    const bugRows = bugs
      .filter((r) => r.area_id === areaId)
      .map((r) => ({ month: r.month, opened: r.opened ?? '', resolved: r.resolved ?? '' }));
    const squadRows = (squad || [])
      .filter((r) => r.area_id === areaId)
      .map((r) => ({
        id: r.id,
        startDate: r.start_date ?? '',
        endDate: r.end_date ?? '',
        sprint: r.sprint ?? '',
        pointsPlanned: r.points_planned ?? '',
        pointsDelivered: r.points_delivered ?? '',
      }));

    const kpis = JSON.parse(JSON.stringify(DEFAULT_KPI_CONFIG));
    kpiConfigs
      // ignora KPIs trimestrais que possam ter ficado salvos no banco de uma versao anterior
      .filter((k) => k.area_id === areaId && DEFAULT_KPI_CONFIG[k.kpi_key])
      .forEach((k) => {
        kpis[k.kpi_key] = { title: k.title, description: k.description, type: k.kpi_type };
      });

    data[name] = {
      automation: autoRows.length ? autoRows : defaultAutomationRows(),
      bugs: bugRows.length ? bugRows : defaultBugRows(name),
      squad: squadRows.length ? squadRows : defaultSquadRows(),
      cycleTimeDays: cycleTimeByName[name] ? cycleTimeByName[name].days : '',
      cycleTimeHours: cycleTimeByName[name] ? cycleTimeByName[name].hours : '',
      kpis,
    };
  });

  state = { currentArea: state.currentArea || 'DIRECT', page: state.page || 'dashboard', data };
}

let autosaveTimer = null;
let autosaveInFlight = false;

/**
 * Chamada apos QUALQUER edicao (tabela, titulo/descricao de KPI, adicionar/
 * remover mes, duplicar estrutura). Salva no localStorage imediatamente
 * (rede de seguranca instantanea) e agenda uma gravacao no Supabase pouco
 * depois, para nao disparar uma chamada de rede a cada tecla digitada.
 */
function scheduleAutosave() {
  window.DataStore.localSave(state); // rede de seguranca imediata, sempre

  if (!window.DataStore.IS_SUPABASE_CONFIGURED) return;

  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (autosaveInFlight) { scheduleAutosave(); return; } // tenta de novo depois
    autosaveInFlight = true;
    try {
      await persistState({ silent: true });
    } finally {
      autosaveInFlight = false;
    }
  }, 1500);
}

/** Garante que temos o id de cada area antes de gravar; tenta buscar de novo se faltar. */
async function ensureAreaIds() {
  if (Object.keys(areaIdByName).length >= AREA_NAMES.length) return;
  const remote = await window.DataStore.fetchAllData();
  if (remote && remote.areas) {
    remote.areas.forEach((a) => { areaIdByName[a.name] = a.id; });
  }
}

async function persistState(opts = {}) {
  const { silent = false } = opts;
  window.DataStore.localSave(state); // rede de seguranca local, sempre grava primeiro

  if (window.DataStore.IS_SUPABASE_CONFIGURED) {
    try {
      await ensureAreaIds();

      const missing = AREA_NAMES.filter((name) => !areaIdByName[name]);
      if (missing.length) {
        throw new Error(
          `Área(s) não encontrada(s) no Supabase: ${missing.join(', ')}. ` +
          'Confirme se o script supabase/schema.sql foi executado no seu projeto.'
        );
      }

      for (const name of AREA_NAMES) {
        const areaId = areaIdByName[name];
        const areaData = state.data[name];
        await window.DataStore.saveAreaData(areaId, name, areaData.automation, areaData.bugs, areaData.squad, { days: areaData.cycleTimeDays, hours: areaData.cycleTimeHours }, areaData.kpis);
      }

      updateConnectionStatus('ok', 'Conectado ao Supabase');
      if (!silent) showToast('Alterações salvas no Supabase com sucesso!', 'success');
      return true;
    } catch (err) {
      console.error(err);
      updateConnectionStatus('error', 'Falha ao salvar no Supabase — dados mantidos localmente');
      if (!silent) showToast('Erro ao salvar no Supabase. Alterações ficaram salvas localmente e serão reenviadas.', 'error');
      return false;
    }
  }

  if (!silent) showToast('Alterações salvas localmente (Supabase não configurado).', 'success');
  return true;
}

// -------------------------------- RENDER: TABS --------------------------------
function renderAreaTabs() {
  const nav = document.getElementById('areaTabs');
  nav.innerHTML = '';
  AREA_NAMES.forEach((name) => {
    const btn = document.createElement('button');
    btn.className = `area-tab${name === state.currentArea ? ' active' : ''}`;
    btn.textContent = name;
    btn.addEventListener('click', () => {
      state.currentArea = name;
      renderAreaTabs();
      renderAll();
    });
    nav.appendChild(btn);
  });
}

// ------------------------------ RENDER: METRIC CARDS --------------------------
function metricCard({ icon, iconCls, label, value, caption }) {
  return `
    <div class="metric-card">
      <div class="metric-icon ${iconCls}">${icon}</div>
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-caption">${caption}</div>
    </div>
  `;
}

function renderAutomationMetrics() {
  const { automation } = currentAreaData();
  const totalPlanned = automation.reduce((a, r) => a + (toNum(r.planned) || 0), 0);
  const totalRealized = automation.reduce((a, r) => a + (toNum(r.realized) || 0), 0);
  const overallPct = totalPlanned ? totalRealized / totalPlanned : 0;
  const homolog = window.KpiCalc.aggregateHomologation(automation);

  const cards = [
    metricCard({ icon: '📋', iconCls: 'blue', label: 'Total Planejado', value: formatInt(totalPlanned), caption: 'Automações planejadas' }),
    metricCard({ icon: '✅', iconCls: 'green', label: 'Total Realizado', value: formatInt(totalRealized), caption: 'Automações realizadas' }),
    metricCard({ icon: '🛡️', iconCls: 'green', label: 'Automações Homologadas', value: formatInt(homolog.totalHomologated), caption: 'Automações homologadas' }),
    metricCard({ icon: '%', iconCls: 'blue', label: '% Geral Automatizado', value: formatPercent(overallPct), caption: 'Percentual do planejado' }),
  ];
  document.getElementById('automationMetrics').innerHTML = cards.join('');
}

function renderBugsMetrics() {
  const { bugs } = currentAreaData();
  const totalOpened = bugs.reduce((a, r) => a + (toNum(r.opened) || 0), 0);
  const totalResolved = bugs.reduce((a, r) => a + (toNum(r.resolved) || 0), 0);
  const backlog = totalOpened - totalResolved;

  const cards = [
    metricCard({ icon: '🐛', iconCls: 'orange', label: 'Total de Bugs Abertos', value: formatInt(totalOpened), caption: 'Bugs em aberto' }),
    metricCard({ icon: '✅', iconCls: 'green', label: 'Total de Bugs Resolvidos', value: formatInt(totalResolved), caption: 'Bugs resolvidos' }),
    metricCard({ icon: '⚠️', iconCls: backlog > 0 ? 'red' : 'green', label: 'Backlog Atual', value: formatInt(backlog), caption: 'Bugs pendentes' }),
  ];
  document.getElementById('bugsMetrics').innerHTML = cards.join('');
}

/** Card de Cycle Time: dois campos editaveis lado a lado (dias e horas), ex: "2d 3h" */
function cycleTimeCard({ days, hours }) {
  return `
    <div class="metric-card">
      <div class="metric-icon orange">⏱️</div>
      <div class="metric-label">Cycle Time</div>
      <div class="cycle-time-row">
        <input type="number" min="0" step="1" class="metric-value-input cycle-time-input" data-metric-field="cycleTimeDays" value="${days ?? ''}" placeholder="0" />
        <span class="cycle-time-unit">d</span>
        <input type="number" min="0" step="1" class="metric-value-input cycle-time-input" data-metric-field="cycleTimeHours" value="${hours ?? ''}" placeholder="0" />
        <span class="cycle-time-unit">h</span>
      </div>
      <div class="metric-caption">Dias e horas (editável)</div>
    </div>
  `;
}

function renderAgilityMetrics() {
  const { squad, cycleTimeDays, cycleTimeHours } = currentAreaData();
  const agg = window.KpiCalc.lastSprintsAggregate(squad, 2);
  const vel = window.KpiCalc.velocity(squad, 2);

  const ratio = agg.totalPlanned ? agg.totalDelivered / agg.totalPlanned : 0;
  let deliveryValue;
  let deliveryCaption;
  let deliveryIconCls;
  if (ratio > 1.0005) {
    deliveryValue = formatPercent(ratio - 1);
    deliveryCaption = 'acima do planejado';
    deliveryIconCls = 'green';
  } else {
    deliveryValue = formatPercent(ratio);
    deliveryCaption = 'entregue do planejado';
    deliveryIconCls = ratio >= 0.8 ? 'green' : ratio >= 0.5 ? 'orange' : 'red';
  }

  const cards = [
    metricCard({ icon: '📌', iconCls: 'blue', label: 'Pontos Planejados', value: formatInt(agg.totalPlanned), caption: '2 últimas sprints entregues' }),
    metricCard({ icon: '✅', iconCls: 'green', label: 'Pontos Entregues', value: formatInt(agg.totalDelivered), caption: '2 últimas sprints entregues' }),
    metricCard({
      icon: '🎯',
      iconCls: deliveryIconCls,
      label: '% de Entrega',
      value: deliveryValue,
      caption: deliveryCaption,
    }),
    metricCard({ icon: '⚡', iconCls: 'blue', label: 'Velocity', value: vel === null ? '—' : formatInt(Math.round(vel)), caption: '2 últimas sprints entregues' }),
    cycleTimeCard({ days: cycleTimeDays, hours: cycleTimeHours }),
  ];
  document.getElementById('agilityMetrics').innerHTML = cards.join('');

  document.querySelectorAll('.cycle-time-input').forEach((input) => {
    input.addEventListener('input', (e) => {
      let value = e.target.value;
      if (value !== '' && Number(value) < 0) {
        showToast('Não é permitido usar números negativos.', 'error');
        value = '0';
        e.target.value = '0';
      }
      currentAreaData()[e.target.dataset.metricField] = value;
      scheduleAutosave();
    });
  });
}

// ------------------------------- RENDER: CHARTS -------------------------------
let chartLibRetries = 0;

/** Plugin customizado: desenha o percentual no centro do doughnut (registrado uma unica vez) */
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.centerText;
    if (!opts || !opts.text) return;
    const { ctx, chartArea } = chart;
    const { left, right, top, bottom } = chartArea;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "800 24px Manrope, Inter, sans-serif";
    ctx.fillStyle = opts.color || '#131a2b';
    ctx.fillText(opts.text, (left + right) / 2, (top + bottom) / 2 - 6);
    if (opts.subtext) {
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillStyle = '#6b7385';
      ctx.fillText(opts.subtext, (left + right) / 2, (top + bottom) / 2 + 14);
    }
    ctx.restore();
  },
};

function renderCharts() {
  const { automation, bugs, squad } = currentAreaData();

  const autoWrap = document.getElementById('automationChart').parentElement;
  const bugsWrap = document.getElementById('bugsChart').parentElement;
  const homologWrap = document.getElementById('homologationChart').parentElement;
  const agilityWrap = document.getElementById('agilityChart').parentElement;

  if (!window.Chart) {
    // Biblioteca de graficos ainda nao carregou (rede lenta) ou foi bloqueada
    // (ex: extensao/adblocker). Tenta novamente por alguns segundos antes de
    // desistir e avisar o usuario claramente, em vez de deixar em branco.
    if (chartLibRetries < 10) {
      chartLibRetries += 1;
      setTimeout(renderCharts, 400);
      return;
    }
    const msg = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;color:#dc2626;font-size:13px;padding:0 20px;">
        Não foi possível carregar a biblioteca de gráficos (Chart.js).<br />
        Verifique se algum bloqueador de anúncios/extensão está bloqueando scripts externos e recarregue a página.
      </div>`;
    autoWrap.innerHTML = msg;
    bugsWrap.innerHTML = msg;
    homologWrap.innerHTML = msg;
    agilityWrap.innerHTML = msg;
    return;
  }

  const autoCtx = document.getElementById('automationChart');
  const bugsCtx = document.getElementById('bugsChart');
  const homologCtx = document.getElementById('homologationChart');
  const agilityCtx = document.getElementById('agilityChart');
  if (!autoCtx || !bugsCtx || !homologCtx || !agilityCtx) return; // canvas foi substituido pela mensagem de erro em uma tentativa anterior

  if (charts.automation) charts.automation.destroy();
  if (charts.bugs) charts.bugs.destroy();
  if (charts.homologation) charts.homologation.destroy();
  if (charts.agility) charts.agility.destroy();

  // registra os plugins (uma unica vez) se carregaram
  if (window.ChartDataLabels && !window.__datalabelsRegistered) {
    Chart.register(window.ChartDataLabels);
    window.__datalabelsRegistered = true;
  }
  if (!window.__centerTextRegistered) {
    Chart.register(centerTextPlugin);
    window.__centerTextRegistered = true;
  }

  const dataLabelOptions = {
    anchor: 'end',
    align: 'top',
    offset: 2,
    color: '#374151',
    font: { weight: '700', size: 11 },
    formatter: (value) => formatInt(value),
  };

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 18 } },
    plugins: {
      legend: { display: false },
      datalabels: dataLabelOptions,
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: '#eef0f6' } },
    },
  };

  charts.automation = new Chart(autoCtx, {
    type: 'bar',
    data: {
      labels: automation.map((r) => r.month),
      datasets: [
        { label: 'Planejados', data: automation.map((r) => toNum(r.planned) ?? 0), backgroundColor: '#2563eb', borderRadius: 6 },
        { label: 'Realizados', data: automation.map((r) => toNum(r.realized) ?? 0), backgroundColor: '#16a34a', borderRadius: 6 },
      ],
    },
    options: commonOptions,
  });

  charts.bugs = new Chart(bugsCtx, {
    type: 'bar',
    data: {
      labels: bugs.map((r) => r.month),
      datasets: [
        { label: 'Abertos', data: bugs.map((r) => toNum(r.opened) ?? 0), backgroundColor: '#f97316', borderRadius: 6 },
        { label: 'Resolvidos', data: bugs.map((r) => toNum(r.resolved) ?? 0), backgroundColor: '#16a34a', borderRadius: 6 },
      ],
    },
    options: commonOptions,
  });

  // ------ Gráfico de pizza (doughnut): Taxa Mensal de Efetividade Automatizado ------
  // Usa somente o ultimo mes preenchido (nao o acumulado)
  const monthly = window.KpiCalc.lastMonthHomologation(automation);
  const naoHomologadas = monthly ? Math.max(monthly.realized - monthly.homologated, 0) : 0;
  const hasData = Boolean(monthly && monthly.realized > 0);

  const pieValues = hasData ? [monthly.homologated, naoHomologadas] : [1];
  const pieColors = hasData ? ['#16a34a', '#f97316'] : ['#e6e9f2'];
  const pieLabels = hasData ? ['Homologadas', 'Não Homologadas'] : ['Sem dados'];

  charts.homologation = new Chart(homologCtx, {
    type: 'doughnut',
    data: {
      labels: pieLabels,
      datasets: [{
        data: pieValues,
        backgroundColor: pieColors,
        borderWidth: 2,
        borderColor: '#ffffff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          display: hasData,
          position: 'bottom',
          labels: { boxWidth: 10, font: { size: 11 }, color: '#6b7385' },
        },
        datalabels: { display: false }, // evita duplicar com o texto central
        tooltip: {
          enabled: hasData,
          callbacks: {
            label: (ctx) => {
              const total = hasData ? monthly.homologated + naoHomologadas : 0;
              const pct = total ? (ctx.parsed / total) * 100 : 0;
              return ` ${ctx.label}: ${formatInt(ctx.parsed)} (${formatPercent(pct / 100)})`;
            },
          },
        },
        centerText: hasData
          ? { text: formatPercent(monthly.rate), subtext: 'Efetividade', color: '#131a2b' }
          : { text: '—', subtext: 'Sem dados', color: '#9aa1b2' },
      },
    },
  });

  // ------ Gráfico de barras: Pontos Planejados x Pontos Entregues (Agilidade) ------
  const squadLabels = (squad || []).map((r) => r.sprint || '—');
  charts.agility = new Chart(agilityCtx, {
    type: 'bar',
    data: {
      labels: squadLabels,
      datasets: [
        { label: 'Planejados', data: (squad || []).map((r) => toNum(r.pointsPlanned) ?? 0), backgroundColor: '#2563eb', borderRadius: 6 },
        { label: 'Entregues', data: (squad || []).map((r) => toNum(r.pointsDelivered) ?? 0), backgroundColor: '#16a34a', borderRadius: 6 },
      ],
    },
    options: commonOptions,
  });
}

// -------------------------------- RENDER: KPIs --------------------------------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function kpiListItem(key, resultHtml) {
  const cfg = currentAreaData().kpis[key];
  return `
    <div class="kpi-list-item" data-kpi="${key}">
      <div class="kpi-list-header">
        <textarea class="kpi-title-input" rows="1" data-kpi-field="title" data-kpi="${key}">${escapeHtml(cfg.title)}</textarea>
        <span class="kpi-type-badge">${escapeHtml(cfg.type)}</span>
      </div>
      <textarea class="kpi-desc-input" rows="2" data-kpi-field="description" data-kpi="${key}">${escapeHtml(cfg.description)}</textarea>
      ${resultHtml}
    </div>
  `;
}

/** Faixa de cor para KPIs de taxa (0-100%): 0-50% vermelho, 51-80% laranja, 81-100% verde. */
function rateColorClass(rate) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '';
  const pct = rate * 100;
  if (pct <= 50) return 'rate-red';
  if (pct <= 80) return 'rate-orange';
  return 'rate-green';
}

function renderKpis() {
  const { automation, bugs, squad } = currentAreaData();
  const C = window.KpiCalc;

  const kpi1 = C.kpi1MonthlyDelta(automation);
  const kpi3 = C.kpi3LastEfficiency(automation);
  const kpi5 = C.kpi5MonthlyResolution(bugs);
  const kpi7 = C.kpi7MonthlyHomologationRate(automation);
  const kpi8 = C.bugsPerDeliveredPoints(squad, bugs, 2);

  const automationBlocks = [];
  const bugBlocks = [];

  // KPI 1 — quantidade + percentual de crescimento vs mes anterior (ex: +1 | +20,0%)
  {
    const delta = kpi1 ? kpi1.delta : null;
    const t = trendArrow(delta);
    const cls = delta === null ? '' : delta >= 0 ? 'positive' : 'negative';
    const pctText = kpi1 && kpi1.pct !== null ? ` | ${formatPercent(kpi1.pct, { signed: true })}` : '';
    automationBlocks.push(kpiListItem('kpi1', `
      <div class="kpi-list-value ${cls}">
        ${formatSignedInt(delta)}${pctText}
        <span class="kpi-trend ${t.cls}">${t.symbol}</span>
      </div>
      <div class="kpi-phrase">vs mês anterior</div>
    `));
  }

  // KPI 3 (Geral) — sempre o ultimo valor preenchido da coluna "%" da Tabela 1
  {
    automationBlocks.push(kpiListItem('kpi3', `
      <div class="kpi-list-value">${formatPercent(kpi3)}</div>
    `));
  }

  // KPI 7 — taxa de automacoes homologadas (mensal): faixa de cor 0-50/51-80/81-100
  {
    const cls = rateColorClass(kpi7);
    automationBlocks.push(kpiListItem('kpi7', `
      <div class="kpi-list-value ${cls}">${formatPercent(kpi7)}</div>
    `));
  }

  // KPI 5 — taxa de solucao mensal: cor por faixa (0-50% vermelho / 51-80% laranja / 81-100% verde)
  {
    const cls = rateColorClass(kpi5);
    bugBlocks.push(kpiListItem('kpi5', `
      <div class="kpi-list-value ${cls}">${formatPercent(kpi5)}</div>
    `));
  }

  // KPI 8 — Bugs por Pontos Entregues (bugs abertos no mes de referencia / pontos das 2 ultimas sprints)
  {
    if (!kpi8) {
      bugBlocks.push(kpiListItem('kpi8', '<div class="kpi-list-value">—</div><div class="kpi-phrase">Dados insuficientes (cadastre sprints com data de fim na Tabela 3)</div>'));
    } else {
      const per100Cls = kpi8.per100 === null ? '' : kpi8.per100 <= 10 ? 'rate-green' : kpi8.per100 <= 20 ? 'rate-orange' : 'rate-red';
      const pctText = kpi8.perPoint === null ? '—' : formatPercent(kpi8.perPoint, { decimals: 1 });
      bugBlocks.push(kpiListItem('kpi8', `
        <div class="kpi-list-value ${per100Cls}">${pctText} <span class="kpi-list-value-unit">/ ${formatInt(kpi8.totalPoints)} pts</span></div>
        <div class="kpi-phrase">Pontos entregues (2 últimas sprints): ${formatInt(kpi8.totalPoints)} · Bugs abertos (${kpi8.refMonth}): ${formatInt(kpi8.bugsOpened)}</div>
      `));
    }
  }

  document.getElementById('kpiListAutomation').innerHTML = automationBlocks.join('');
  document.getElementById('kpiListBugs').innerHTML = bugBlocks.join('');

  // eventos de edicao de titulo/descricao (resultado nunca e editavel)
  document.querySelectorAll('[data-kpi-field]').forEach((el) => {
    autoGrowTextarea(el);
    el.addEventListener('input', (e) => {
      const key = e.target.dataset.kpi;
      const field = e.target.dataset.kpiField;
      currentAreaData().kpis[key][field] = e.target.value;
      autoGrowTextarea(e.target);
      scheduleAutosave();
    });
  });
}

/** Ajusta a altura do textarea ao conteudo, garantindo que o texto do titulo/descricao apareca por inteiro. */
function autoGrowTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// ------------------------------- RENDER: TABLES -------------------------------
function renderAutomationTable() {
  const rows = currentAreaData().automation;
  const tbody = document.querySelector('#automationTable tbody');
  tbody.innerHTML = rows.map((r, idx) => {
    const pct = window.KpiCalc.automationPercentage(r.planned, r.realized);
    return `
      <tr data-idx="${idx}">
        <td class="month-label">${r.month}</td>
        <td><input type="number" min="0" class="cell-input flow" data-table="automation" data-idx="${idx}" data-field="flow" value="${r.flow ?? ''}" placeholder="—" /></td>
        <td><input type="number" min="0" class="cell-input planned" data-table="automation" data-idx="${idx}" data-field="planned" value="${r.planned}" placeholder="—" /></td>
        <td><input type="number" min="0" class="cell-input realized" data-table="automation" data-idx="${idx}" data-field="realized" value="${r.realized}" placeholder="—" /></td>
        <td><input type="number" min="0" class="cell-input homologated" data-table="automation" data-idx="${idx}" data-field="homologated" value="${r.homologated ?? ''}" placeholder="—" title="Não pode ser maior que Realizados" /></td>
        <td><input type="number" min="0" class="cell-input to-analyze" data-table="automation" data-idx="${idx}" data-field="toAnalyze" value="${r.toAnalyze ?? ''}" placeholder="—" /></td>
        <td class="pct-readonly">${formatPercent(pct)}</td>
        <td><button class="row-delete" data-remove="automation" data-idx="${idx}" title="Remover mês">✕</button></td>
      </tr>
    `;
  }).join('');
}

function renderBugsTable() {
  const rows = currentAreaData().bugs;
  const tbody = document.querySelector('#bugsTable tbody');
  tbody.innerHTML = rows.map((r, idx) => {
    const rate = window.KpiCalc.resolutionRate(r.opened, r.resolved);
    return `
      <tr data-idx="${idx}">
        <td class="month-label">${r.month}</td>
        <td><input type="number" min="0" class="cell-input opened" data-table="bugs" data-idx="${idx}" data-field="opened" value="${r.opened}" placeholder="—" /></td>
        <td><input type="number" min="0" class="cell-input resolved" data-table="bugs" data-idx="${idx}" data-field="resolved" value="${r.resolved}" placeholder="—" /></td>
        <td class="pct-readonly">${formatPercent(rate)}</td>
        <td><button class="row-delete" data-remove="bugs" data-idx="${idx}" title="Remover mês">✕</button></td>
      </tr>
    `;
  }).join('');
}

function renderSquadTable() {
  const rows = currentAreaData().squad || [];
  const tbody = document.querySelector('#squadTable tbody');
  tbody.innerHTML = rows.map((r, idx) => `
    <tr data-idx="${idx}">
      <td><input type="date" class="cell-input date" data-table="squad" data-idx="${idx}" data-field="startDate" value="${r.startDate || ''}" /></td>
      <td><input type="date" class="cell-input date" data-table="squad" data-idx="${idx}" data-field="endDate" value="${r.endDate || ''}" /></td>
      <td><input type="text" maxlength="40" class="cell-input sprint" data-table="squad" data-idx="${idx}" data-field="sprint" value="${escapeHtml(r.sprint || '')}" placeholder="Sprint" /></td>
      <td><input type="number" min="0" class="cell-input planned" data-table="squad" data-idx="${idx}" data-field="pointsPlanned" value="${r.pointsPlanned}" placeholder="—" /></td>
      <td><input type="number" min="0" class="cell-input resolved" data-table="squad" data-idx="${idx}" data-field="pointsDelivered" value="${r.pointsDelivered}" placeholder="—" /></td>
      <td><button class="row-delete" data-remove="squad" data-idx="${idx}" title="Remover sprint">✕</button></td>
    </tr>
  `).join('');
}

const NON_NUMERIC_FIELDS = ['sprint', 'startDate', 'endDate'];

function bindTableEvents() {
  document.querySelectorAll('.cell-input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { table, idx, field } = e.target.dataset;
      let value = e.target.value;

      if (!NON_NUMERIC_FIELDS.includes(field) && value !== '' && Number(value) < 0) {
        e.target.classList.add('invalid');
        showToast('Não é permitido usar números negativos.', 'error');
        value = '0';
        e.target.value = '0';
      } else {
        e.target.classList.remove('invalid');
      }

      if (table === 'automation' && field === 'homologated' && value !== '') {
        const realized = window.KpiCalc.toNum(currentAreaData().automation[idx].realized) || 0;
        if (Number(value) > realized) {
          e.target.classList.add('invalid');
          showToast('Automações Homologadas não pode ser maior que Realizados.', 'error');
          value = String(realized);
          e.target.value = value;
        }
      }

      currentAreaData()[table][idx][field] = value;
      scheduleAutosave();
      renderAutomationMetrics();
      renderBugsMetrics();
      renderAgilityMetrics();
      renderKpis();
      if (state.page === 'dashboard') renderCharts();

      // atualiza somente a celula de percentual da linha editada, sem redesenhar tudo (mantem o foco)
      const row = e.target.closest('tr');
      const pctCell = row.querySelector('.pct-readonly');
      if (pctCell) {
        const data = currentAreaData()[table][idx];
        pctCell.textContent = table === 'automation'
          ? formatPercent(window.KpiCalc.automationPercentage(data.planned, data.realized))
          : formatPercent(window.KpiCalc.resolutionRate(data.opened, data.resolved));
      }
    });
  });

  document.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const { remove, idx } = e.target.dataset;
      currentAreaData()[remove].splice(Number(idx), 1);
      scheduleAutosave();
      renderAll();
    });
  });
}

// --------------------------------- ADD MONTH ----------------------------------
function nextMonth(rows) {
  if (!rows.length) return MONTH_CYCLE[0];
  const last = rows[rows.length - 1].month;
  const cycleIdx = MONTH_CYCLE.indexOf(last);
  const nextIdx = cycleIdx === -1 ? 0 : (cycleIdx + 1) % MONTH_CYCLE.length;
  return MONTH_CYCLE[nextIdx];
}

function addMonth(table) {
  const areaData = currentAreaData();
  const month = nextMonth(areaData[table]);
  if (table === 'automation') {
    areaData.automation.push({ month, flow: '', planned: '', realized: '', homologated: '', toAnalyze: '' });
  } else {
    areaData.bugs.push({ month, opened: '', resolved: '' });
  }
  scheduleAutosave();
  renderAll();
}

function addSquadRow() {
  currentAreaData().squad.push({ id: makeId(), startDate: '', endDate: '', sprint: '', pointsPlanned: '', pointsDelivered: '' });
  scheduleAutosave();
  renderAll();
}

// -------------------------------- CSV EXPORT ----------------------------------
function exportCsv() {
  const { automation, bugs, squad } = currentAreaData();
  const lines = [];
  lines.push(`Área;${state.currentArea}`);
  lines.push('');
  lines.push('Volumetria de Testes Automatizados');
  lines.push('Mês;Qtd Fluxos;Planejados;Realizados;Automações Homologadas;Automações a Analisar;Percentual;Taxa de Homologação');
  automation.forEach((r) => {
    const pct = window.KpiCalc.automationPercentage(r.planned, r.realized);
    const homologRate = window.KpiCalc.homologationRate(r.realized, r.homologated);
    lines.push(`${r.month};${r.flow ?? ''};${r.planned};${r.realized};${r.homologated ?? ''};${r.toAnalyze ?? ''};${formatPercent(pct)};${formatPercent(homologRate)}`);
  });
  lines.push('');
  lines.push('Volumetria de Abertura de Bugs');
  lines.push('Mês;Abertos;Resolvidos;Índice de Resolução');
  bugs.forEach((r) => {
    const rate = window.KpiCalc.resolutionRate(r.opened, r.resolved);
    lines.push(`${r.month};${r.opened};${r.resolved};${formatPercent(rate)}`);
  });
  lines.push('');
  lines.push('Volumetria Squad');
  lines.push('Data Início;Data Fim;Sprint;Pontos Planejados;Pontos Entregues');
  (squad || []).forEach((r) => {
    lines.push(`${r.startDate ?? ''};${r.endDate ?? ''};${r.sprint ?? ''};${r.pointsPlanned ?? ''};${r.pointsDelivered ?? ''}`);
  });

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kpis_${state.currentArea}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------- DUPLICAR ESTRUTURA -----------------------------
function duplicateStructureToAllAreas() {
  const source = JSON.parse(JSON.stringify(currentAreaData()));
  AREA_NAMES.forEach((name) => {
    if (name === state.currentArea) return;
    const copy = JSON.parse(JSON.stringify(source));
    // cada linha da Tabela 3 precisa de um id proprio (chave primaria global no Supabase)
    copy.squad = (copy.squad || []).map((r) => ({ ...r, id: makeId() }));
    state.data[name] = copy;
  });
  scheduleAutosave();
  showToast(`Estrutura de "${state.currentArea}" duplicada para todas as áreas.`, 'success');
  renderAll();
}

// ----------------------------------- MODE --------------------------------------
function bindPageToggle() {
  document.querySelectorAll('.page-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.page = btn.dataset.page;
      document.querySelectorAll('.page-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      document.getElementById('pageDashboard').style.display = state.page === 'dashboard' ? '' : 'none';
      document.getElementById('pageCadastro').style.display = state.page === 'cadastro' ? '' : 'none';
      if (state.page === 'dashboard') {
        // ao reexibir o Dashboard, tanto os graficos quanto os textareas de
        // titulo/descricao dos KPIs precisam ser recalculados: enquanto a
        // pagina fica com display:none, scrollHeight = 0, entao o auto-grow
        // "esquece" a altura certa e o texto aparece cortado ao voltar.
        renderCharts();
        renderKpis();
      }
    });
  });
}

// ---------------------------------- RENDER ALL ----------------------------------
function renderAll() {
  renderAutomationMetrics();
  renderBugsMetrics();
  renderAgilityMetrics();
  if (state.page === 'dashboard') renderCharts();
  renderKpis();
  renderAutomationTable();
  renderBugsTable();
  renderSquadTable();
  bindTableEvents();
}

// ------------------------------------ INIT ---------------------------------------
async function init() {
  renderAreaTabs();
  await loadInitialData();
  renderAreaTabs();

  // aplica a tela inicial (Dashboard ou Cadastro) de acordo com o estado carregado
  document.querySelectorAll('.page-btn').forEach((b) => {
    const active = b.dataset.page === state.page;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.getElementById('pageDashboard').style.display = state.page === 'dashboard' ? '' : 'none';
  document.getElementById('pageCadastro').style.display = state.page === 'cadastro' ? '' : 'none';

  renderAll();

  document.getElementById('saveBtn').addEventListener('click', persistState);
  document.getElementById('duplicateBtn').addEventListener('click', duplicateStructureToAllAreas);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.add === 'squad') addSquadRow();
      else addMonth(btn.dataset.add);
    });
  });
  bindPageToggle();

  // rede de seguranca final: garante que a ultima versao fique no navegador
  // mesmo se a aba for fechada antes do autosave (1.5s) disparar.
  window.addEventListener('beforeunload', () => {
    window.DataStore.localSave(state);
  });
}

document.addEventListener('DOMContentLoaded', init);
