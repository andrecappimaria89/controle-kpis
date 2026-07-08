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
  kpi2: {
    title: 'Crescimento Trimestral da Automação',
    description: 'Percentual de testes automatizados em relação ao volume realizado no trimestre, com meta de crescimento de 15%.',
    type: 'Trimestral',
  },
  kpi3: {
    title: 'Eficiência vs Planejamento Mensal',
    description: 'Compara a variação percentual do volume realizado com a variação percentual do volume planejado no mês.',
    type: 'Mensal',
  },
  kpi4: {
    title: 'Eficiência vs Planejamento Trimestral',
    description: 'Compara a variação percentual do volume realizado com a variação percentual do volume planejado no trimestre.',
    type: 'Trimestral',
  },
  kpi5: {
    title: 'Taxa de Solução Mensal de Bugs',
    description: 'Percentual de bugs resolvidos comparado com os itens em aberto no último mês.',
    type: 'Mensal',
  },
  kpi6: {
    title: 'Taxa de Solução Trimestral de Bugs',
    description: 'Percentual de bugs resolvidos comparado com os itens em aberto no trimestre, com indicação de backlog.',
    type: 'Trimestral',
  },
  kpi7: {
    title: 'Taxa Automação Homologadas',
    description: 'Percentual de cenários automatizados homologados (validados e funcionando) em relação ao total realizado no último mês.',
    type: 'Mensal',
  },
};

// Dados de exemplo, iguais aos da planilha original, usados apenas na primeira carga.
function defaultAutomationRows() {
  return [
    { month: 'Mar', planned: 30, realized: 10, homologated: 8 },
    { month: 'Abr', planned: 32, realized: 15, homologated: 11 },
    { month: 'Mai', planned: 35, realized: 16, homologated: 13 },
    { month: 'Jun', planned: '', realized: '', homologated: '' },
    { month: 'Jul', planned: '', realized: '', homologated: '' },
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
      kpis: JSON.parse(JSON.stringify(DEFAULT_KPI_CONFIG)),
    };
  });
  return { currentArea: 'DIRECT', mode: 'edicao', data };
}

// ------------------------------- ESTADO GLOBAL ------------------------------
let state = buildDefaultState();
let areaIdByName = {}; // preenchido quando o Supabase esta configurado
let charts = { automation: null, bugs: null, homologation: null };

// -------------------------------- HELPERS ------------------------------------
const { toNum, isNum } = window.KpiCalc;

function formatPercent(v, { signed = false, fallback = '—' } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return fallback;
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(v);
  return signed && v > 0 ? `+${formatted}` : formatted;
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
  const { areas, automation, bugs, kpiConfigs } = remote;
  areaIdByName = {};
  areas.forEach((a) => { areaIdByName[a.name] = a.id; });

  const data = {};
  AREA_NAMES.forEach((name) => {
    const areaId = areaIdByName[name];
    const autoRows = automation
      .filter((r) => r.area_id === areaId)
      .map((r) => ({ month: r.month, planned: r.planned ?? '', realized: r.realized ?? '', homologated: r.homologated ?? '' }));
    const bugRows = bugs
      .filter((r) => r.area_id === areaId)
      .map((r) => ({ month: r.month, opened: r.opened ?? '', resolved: r.resolved ?? '' }));

    const kpis = JSON.parse(JSON.stringify(DEFAULT_KPI_CONFIG));
    kpiConfigs
      .filter((k) => k.area_id === areaId)
      .forEach((k) => {
        kpis[k.kpi_key] = { title: k.title, description: k.description, type: k.kpi_type };
      });

    data[name] = {
      automation: autoRows.length ? autoRows : defaultAutomationRows(),
      bugs: bugRows.length ? bugRows : defaultBugRows(name),
      kpis,
    };
  });

  state = { currentArea: state.currentArea || 'DIRECT', mode: state.mode || 'edicao', data };
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
        await window.DataStore.saveAreaData(areaId, name, areaData.automation, areaData.bugs, areaData.kpis);
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

// ------------------------------ RENDER: SUMMARY -------------------------------
function renderSummary() {
  const { automation, bugs } = currentAreaData();
  const totalPlanned = automation.reduce((a, r) => a + (toNum(r.planned) || 0), 0);
  const totalRealized = automation.reduce((a, r) => a + (toNum(r.realized) || 0), 0);
  const totalOpened = bugs.reduce((a, r) => a + (toNum(r.opened) || 0), 0);
  const totalResolved = bugs.reduce((a, r) => a + (toNum(r.resolved) || 0), 0);
  const backlog = totalOpened - totalResolved;
  const overallPct = totalPlanned ? totalRealized / totalPlanned : 0;
  const homolog = window.KpiCalc.aggregateHomologation(automation);

  const cards = [
    { label: 'Total Planejado', value: formatInt(totalPlanned), dot: 'dot-blue' },
    { label: 'Total Realizado', value: formatInt(totalRealized), dot: 'dot-green' },
    { label: '% Geral Automatizado', value: formatPercent(overallPct), dot: 'dot-blue' },
    { label: 'Automações Homologadas', value: formatInt(homolog.totalHomologated), dot: 'dot-green' },
    { label: 'Taxa de Efetividade', value: formatPercent(homolog.rate), dot: 'dot-green' },
    { label: 'Bugs Abertos', value: formatInt(totalOpened), dot: 'dot-orange' },
    { label: 'Bugs Resolvidos', value: formatInt(totalResolved), dot: 'dot-green' },
    { label: 'Backlog Atual', value: formatInt(backlog), dot: backlog > 0 ? 'dot-red' : 'dot-green' },
  ];

  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = cards.map((c) => `
    <div class="summary-card">
      <div class="s-label"><i class="dot ${c.dot}"></i>${c.label}</div>
      <div class="s-value">${c.value}</div>
    </div>
  `).join('');
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
  const { automation, bugs } = currentAreaData();

  const autoWrap = document.getElementById('automationChart').parentElement;
  const bugsWrap = document.getElementById('bugsChart').parentElement;
  const homologWrap = document.getElementById('homologationChart').parentElement;

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
    return;
  }

  const autoCtx = document.getElementById('automationChart');
  const bugsCtx = document.getElementById('bugsChart');
  const homologCtx = document.getElementById('homologationChart');
  if (!autoCtx || !bugsCtx || !homologCtx) return; // canvas foi substituido pela mensagem de erro em uma tentativa anterior

  if (charts.automation) charts.automation.destroy();
  if (charts.bugs) charts.bugs.destroy();
  if (charts.homologation) charts.homologation.destroy();

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

  // ------ Gráfico de pizza (doughnut): Taxa de Efetividade da Automação ------
  const homolog = window.KpiCalc.aggregateHomologation(automation);
  const naoHomologadas = Math.max(homolog.totalRealized - homolog.totalHomologated, 0);
  const hasData = homolog.totalRealized > 0;

  const pieValues = hasData ? [homolog.totalHomologated, naoHomologadas] : [1];
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
              const total = homolog.totalHomologated + naoHomologadas;
              const pct = total ? (ctx.parsed / total) * 100 : 0;
              return ` ${ctx.label}: ${formatInt(ctx.parsed)} (${formatPercent(pct / 100)})`;
            },
          },
        },
        centerText: hasData
          ? { text: formatPercent(homolog.rate), subtext: 'Efetividade', color: '#131a2b' }
          : { text: '—', subtext: 'Sem dados', color: '#9aa1b2' },
      },
    },
  });
}

// -------------------------------- RENDER: KPIs --------------------------------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function kpiCardShell(key, resultHtml, extraCls = '') {
  const cfg = currentAreaData().kpis[key];
  return `
    <div class="kpi-card ${extraCls}" data-kpi="${key}">
      <div class="kpi-top-row">
        <span class="kpi-type-badge">${escapeHtml(cfg.type)}</span>
      </div>
      <textarea class="kpi-title-input" rows="2" data-kpi-field="title" data-kpi="${key}">${escapeHtml(cfg.title)}</textarea>
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
  const { automation, bugs } = currentAreaData();
  const C = window.KpiCalc;

  const kpi1 = C.kpi1MonthlyGrowth(automation);
  const kpi2 = C.kpi2QuarterlyGrowth(automation);
  const kpi3 = C.kpi3MonthlyEfficiency(automation);
  const kpi4 = C.kpi4QuarterlyEfficiency(automation);
  const kpi5 = C.kpi5MonthlyResolution(bugs);
  const kpi6 = C.kpi6QuarterlyResolution(bugs);

  const automationBlocks = [];
  const bugBlocks = [];

  // KPI 1
  {
    const t = trendArrow(kpi1);
    const cls = kpi1 === null ? '' : kpi1 >= 0 ? 'positive' : 'negative';
    automationBlocks.push(kpiCardShell('kpi1', `
      <div class="kpi-result-row">
        <span class="kpi-result-value">${formatPercent(kpi1, { signed: true })}</span>
        <span class="kpi-trend ${t.cls}">${t.symbol}</span>
      </div>
    `, cls));
  }

  // KPI 2
  {
    const cls = kpi2 === null ? '' : kpi2 >= 0.15 ? 'positive' : kpi2 < 0 ? 'negative' : '';
    const t = trendArrow(kpi2);
    automationBlocks.push(kpiCardShell('kpi2', `
      <div class="kpi-result-row">
        <span class="kpi-result-value">${formatPercent(kpi2, { signed: true })}</span>
        <span class="kpi-trend ${t.cls}">${t.symbol}</span>
      </div>
      <div class="kpi-phrase">Meta: 15% de crescimento no trimestre</div>
    `, cls));
  }

  // KPI 3
  {
    const t = trendArrow(kpi3);
    const cls = kpi3 === null ? '' : kpi3 >= 0 ? 'positive' : 'negative';
    automationBlocks.push(kpiCardShell('kpi3', `
      <div class="kpi-result-row">
        <span class="kpi-result-value">${formatPercent(kpi3, { signed: true })}</span>
        <span class="kpi-trend ${t.cls}">${t.symbol}</span>
      </div>
    `, cls));
  }

  // KPI 4
  {
    const t = trendArrow(kpi4);
    const cls = kpi4 === null ? '' : kpi4 >= 0 ? 'positive' : 'negative';
    automationBlocks.push(kpiCardShell('kpi4', `
      <div class="kpi-result-row">
        <span class="kpi-result-value">${formatPercent(kpi4, { signed: true })}</span>
        <span class="kpi-trend ${t.cls}">${t.symbol}</span>
      </div>
      <div class="kpi-phrase">${C.kpi4Phrase(kpi4)}</div>
    `, cls));
  }

  // KPI 5 — taxa de solucao mensal: cor por faixa (0-50% vermelho / 51-80% laranja / 81-100% verde)
  {
    const cls = rateColorClass(kpi5);
    bugBlocks.push(kpiCardShell('kpi5', `
      <div class="kpi-result-row">
        <span class="kpi-result-value">${formatPercent(kpi5)}</span>
      </div>
    `, cls));
  }

  // KPI 6 — taxa de solucao trimestral: mesma logica de faixa de cor
  {
    const cls = kpi6 ? rateColorClass(kpi6.rate) : '';
    bugBlocks.push(kpiCardShell('kpi6', `
      <div class="kpi-result-row">
        <span class="kpi-result-value" style="font-size:19px;">${C.kpi6Text(kpi6, formatPercent)}</span>
      </div>
    `, cls));
  }

  // KPI 7 — taxa de automacoes homologadas (mensal): mesma faixa de cor 0-50/51-80/81-100
  {
    const kpi7 = C.kpi7MonthlyHomologationRate(automation);
    const cls = rateColorClass(kpi7);
    automationBlocks.push(kpiCardShell('kpi7', `
      <div class="kpi-result-row">
        <span class="kpi-result-value">${formatPercent(kpi7)}</span>
      </div>
    `, cls));
  }

  document.getElementById('kpiGridAutomation').innerHTML = automationBlocks.join('');
  document.getElementById('kpiGridBugs').innerHTML = bugBlocks.join('');

  // eventos de edicao de titulo/descricao (resultado nunca e editavel)
  document.querySelectorAll('[data-kpi-field]').forEach((el) => {
    autoGrowTextarea(el);
    el.disabled = state.mode !== 'edicao'; // so pode editar titulo/descricao no modo Edicao
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
        <td><input type="number" min="0" class="cell-input planned" data-table="automation" data-idx="${idx}" data-field="planned" value="${r.planned}" placeholder="—" /></td>
        <td><input type="number" min="0" class="cell-input realized" data-table="automation" data-idx="${idx}" data-field="realized" value="${r.realized}" placeholder="—" /></td>
        <td><input type="number" min="0" class="cell-input homologated" data-table="automation" data-idx="${idx}" data-field="homologated" value="${r.homologated ?? ''}" placeholder="—" title="Não pode ser maior que Realizados" /></td>
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

function bindTableEvents() {
  document.querySelectorAll('.cell-input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const { table, idx, field } = e.target.dataset;
      let value = e.target.value;

      if (value !== '' && Number(value) < 0) {
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
      renderSummary();
      renderKpis();
      renderCharts();
      // atualiza somente a celula de percentual da linha editada, sem redesenhar tudo (mantem o foco)
      const row = e.target.closest('tr');
      const pctCell = row.querySelector('.pct-readonly');
      const data = currentAreaData()[table][idx];
      pctCell.textContent = table === 'automation'
        ? formatPercent(window.KpiCalc.automationPercentage(data.planned, data.realized))
        : formatPercent(window.KpiCalc.resolutionRate(data.opened, data.resolved));
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
    areaData.automation.push({ month, planned: '', realized: '', homologated: '' });
  } else {
    areaData.bugs.push({ month, opened: '', resolved: '' });
  }
  scheduleAutosave();
  renderAll();
}

// -------------------------------- CSV EXPORT ----------------------------------
function exportCsv() {
  const { automation, bugs } = currentAreaData();
  const lines = [];
  lines.push(`Área;${state.currentArea}`);
  lines.push('');
  lines.push('Volumetria de Testes Automatizados');
  lines.push('Mês;Planejados;Realizados;Automações Homologadas;Percentual;Taxa de Homologação');
  automation.forEach((r) => {
    const pct = window.KpiCalc.automationPercentage(r.planned, r.realized);
    const homologRate = window.KpiCalc.homologationRate(r.realized, r.homologated);
    lines.push(`${r.month};${r.planned};${r.realized};${r.homologated ?? ''};${formatPercent(pct)};${formatPercent(homologRate)}`);
  });
  lines.push('');
  lines.push('Volumetria de Abertura de Bugs');
  lines.push('Mês;Abertos;Resolvidos;Índice de Resolução');
  bugs.forEach((r) => {
    const rate = window.KpiCalc.resolutionRate(r.opened, r.resolved);
    lines.push(`${r.month};${r.opened};${r.resolved};${formatPercent(rate)}`);
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
    state.data[name] = JSON.parse(JSON.stringify(source));
  });
  scheduleAutosave();
  showToast(`Estrutura de "${state.currentArea}" duplicada para todas as áreas.`, 'success');
  renderAll();
}

// ----------------------------------- MODE --------------------------------------
function bindModeToggle() {
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      document.body.className = `mode-${state.mode}`;
      renderKpis(); // aplica/remove o bloqueio de edicao de titulo/descricao
    });
  });
}

// ---------------------------------- RENDER ALL ----------------------------------
function renderAll() {
  renderSummary();
  renderCharts();
  renderKpis();
  renderAutomationTable();
  renderBugsTable();
  bindTableEvents();
}

// ------------------------------------ INIT ---------------------------------------
async function init() {
  renderAreaTabs();
  await loadInitialData();
  renderAreaTabs();
  renderAll();

  document.getElementById('saveBtn').addEventListener('click', persistState);
  document.getElementById('duplicateBtn').addEventListener('click', duplicateStructureToAllAreas);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addMonth(btn.dataset.add));
  });
  bindModeToggle();

  // rede de seguranca final: garante que a ultima versao fique no navegador
  // mesmo se a aba for fechada antes do autosave (1.5s) disparar.
  window.addEventListener('beforeunload', () => {
    window.DataStore.localSave(state);
  });
}

document.addEventListener('DOMContentLoaded', init);
