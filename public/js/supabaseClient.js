// ============================================================================
// supabaseClient.js - inicializa o Supabase e expoe funcoes de leitura/escrita.
// Se as credenciais nao estiverem configuradas, o app cai em modo local
// (localStorage) para que a demo funcione mesmo sem backend configurado.
// ============================================================================

const SUPABASE_CONFIG = window.__SUPABASE_CONFIG__ || { url: '', anonKey: '' };
const IS_SUPABASE_CONFIGURED = Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);

let supabaseClient = null;
if (IS_SUPABASE_CONFIGURED && window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

const LOCAL_KEY = 'kpi_dashboard_state_v1';

function localLoad() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Falha ao ler dados locais:', e);
    return null;
  }
}

function localSave(state) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Falha ao salvar dados locais:', e);
    return false;
  }
}

/** Busca todas as areas, metricas e configs de KPI do Supabase, ja agrupadas por area. */
async function fetchAllData() {
  if (!supabaseClient) return null;

  const { data: areas, error: areasErr } = await supabaseClient.from('areas').select('*');
  if (areasErr) throw areasErr;

  const { data: automation, error: autoErr } = await supabaseClient
    .from('automation_metrics')
    .select('*')
    .order('month_order', { ascending: true });
  if (autoErr) throw autoErr;

  const { data: bugs, error: bugsErr } = await supabaseClient
    .from('bug_metrics')
    .select('*')
    .order('month_order', { ascending: true });
  if (bugsErr) throw bugsErr;

  const { data: squad, error: squadErr } = await supabaseClient
    .from('squad_metrics')
    .select('*')
    .order('start_date', { ascending: true });
  if (squadErr) throw squadErr;

  const { data: kpiConfigs, error: kpiErr } = await supabaseClient
    .from('kpi_configs')
    .select('*');
  if (kpiErr) throw kpiErr;

  return { areas, automation, bugs, squad, kpiConfigs };
}

/**
 * Grava o estado completo de UMA area no Supabase.
 *
 * Ordem importante para nunca arriscar perder dados: primeiro grava (upsert)
 * os meses atuais, e só DEPOIS remove do banco os meses que não existem mais
 * na tela (ex: usuário excluiu um mês). Assim nunca existe um instante em
 * que a área fique com zero linhas no banco por causa de uma queda de rede.
 */
async function saveAreaData(areaId, areaName, automationRows, bugRows, squadRows, cycleTime, kpiConfigs) {
  if (!supabaseClient) throw new Error('Supabase nao configurado');

  const automationPayload = automationRows.map((r, idx) => ({
    area_id: areaId,
    month: r.month,
    month_order: idx,
    flow: r.flow === '' || r.flow === undefined ? null : r.flow,
    planned: r.planned === '' ? null : r.planned,
    realized: r.realized === '' ? null : r.realized,
    percentage: window.KpiCalc.automationPercentage(r.planned, r.realized),
    homologated: r.homologated === '' || r.homologated === undefined ? null : r.homologated,
    homologation_rate: window.KpiCalc.homologationRate(r.realized, r.homologated),
    to_analyze: r.toAnalyze === '' || r.toAnalyze === undefined ? null : r.toAnalyze,
  }));

  const bugPayload = bugRows.map((r, idx) => ({
    area_id: areaId,
    month: r.month,
    month_order: idx,
    opened: r.opened === '' ? null : r.opened,
    resolved: r.resolved === '' ? null : r.resolved,
    resolution_rate: window.KpiCalc.resolutionRate(r.opened, r.resolved),
  }));

  const squadPayload = (squadRows || []).map((r) => ({
    id: r.id,
    area_id: areaId,
    sprint: r.sprint === '' || r.sprint === undefined ? null : r.sprint,
    start_date: r.startDate === '' || r.startDate === undefined ? null : r.startDate,
    end_date: r.endDate === '' || r.endDate === undefined ? null : r.endDate,
    points_planned: r.pointsPlanned === '' || r.pointsPlanned === undefined ? null : r.pointsPlanned,
    points_delivered: r.pointsDelivered === '' || r.pointsDelivered === undefined ? null : r.pointsDelivered,
  }));

  const kpiPayload = Object.entries(kpiConfigs).map(([kpiKey, cfg]) => ({
    area_id: areaId,
    kpi_key: kpiKey,
    title: cfg.title,
    description: cfg.description,
    kpi_type: cfg.type,
  }));

  /** upsert os meses atuais, depois apaga do banco os meses que sumiram da tela */
  async function syncTable(table, payload, currentMonths) {
    if (payload.length) {
      const { error: upErr } = await supabaseClient.from(table).upsert(payload, { onConflict: 'area_id,month' });
      if (upErr) throw upErr;
    }

    let delQuery = supabaseClient.from(table).delete().eq('area_id', areaId);
    if (currentMonths.length) {
      const list = currentMonths.map((m) => `"${m.replace(/"/g, '')}"`).join(',');
      delQuery = delQuery.not('month', 'in', `(${list})`);
    }
    const { error: delErr } = await delQuery;
    if (delErr) throw delErr;
  }

  /** mesma logica upsert-depois-apaga-orfaos, mas usando o id gerado no navegador como chave */
  async function syncSquadTable(payload, currentIds) {
    if (payload.length) {
      const { error: upErr } = await supabaseClient.from('squad_metrics').upsert(payload, { onConflict: 'id' });
      if (upErr) throw upErr;
    }

    let delQuery = supabaseClient.from('squad_metrics').delete().eq('area_id', areaId);
    if (currentIds.length) {
      const list = currentIds.map((id) => `"${id}"`).join(',');
      delQuery = delQuery.not('id', 'in', `(${list})`);
    }
    const { error: delErr } = await delQuery;
    if (delErr) throw delErr;
  }

  await Promise.all([
    syncTable('automation_metrics', automationPayload, automationRows.map((r) => r.month)),
    syncTable('bug_metrics', bugPayload, bugRows.map((r) => r.month)),
    syncSquadTable(squadPayload, (squadRows || []).map((r) => r.id)),
    (async () => {
      if (!kpiPayload.length) return;
      const { error } = await supabaseClient.from('kpi_configs').upsert(kpiPayload, { onConflict: 'area_id,kpi_key' });
      if (error) throw error;
    })(),
    (async () => {
      const { error } = await supabaseClient
        .from('areas')
        .update({
          cycle_time_days: cycleTime && cycleTime.days !== '' && cycleTime.days !== undefined ? cycleTime.days : null,
          cycle_time_hours: cycleTime && cycleTime.hours !== '' && cycleTime.hours !== undefined ? cycleTime.hours : null,
        })
        .eq('id', areaId);
      if (error) throw error;
    })(),
  ]);
}

window.DataStore = {
  IS_SUPABASE_CONFIGURED,
  localLoad,
  localSave,
  fetchAllData,
  saveAreaData,
};
