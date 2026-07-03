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

  const { data: kpiConfigs, error: kpiErr } = await supabaseClient
    .from('kpi_configs')
    .select('*');
  if (kpiErr) throw kpiErr;

  return { areas, automation, bugs, kpiConfigs };
}

/** Grava (upsert) o estado completo de UMA area no Supabase. */
async function saveAreaData(areaId, areaName, automationRows, bugRows, kpiConfigs) {
  if (!supabaseClient) throw new Error('Supabase nao configurado');

  const automationPayload = automationRows.map((r, idx) => ({
    area_id: areaId,
    month: r.month,
    month_order: idx,
    planned: r.planned === '' ? null : r.planned,
    realized: r.realized === '' ? null : r.realized,
    percentage: window.KpiCalc.automationPercentage(r.planned, r.realized),
  }));

  const bugPayload = bugRows.map((r, idx) => ({
    area_id: areaId,
    month: r.month,
    month_order: idx,
    opened: r.opened === '' ? null : r.opened,
    resolved: r.resolved === '' ? null : r.resolved,
    resolution_rate: window.KpiCalc.resolutionRate(r.opened, r.resolved),
  }));

  const kpiPayload = Object.entries(kpiConfigs).map(([kpiKey, cfg]) => ({
    area_id: areaId,
    kpi_key: kpiKey,
    title: cfg.title,
    description: cfg.description,
    kpi_type: cfg.type,
  }));

  const [{ error: e1 }, { error: e2 }, { error: e3 }] = await Promise.all([
    supabaseClient.from('automation_metrics').upsert(automationPayload, { onConflict: 'area_id,month' }),
    supabaseClient.from('bug_metrics').upsert(bugPayload, { onConflict: 'area_id,month' }),
    supabaseClient.from('kpi_configs').upsert(kpiPayload, { onConflict: 'area_id,kpi_key' }),
  ]);

  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
}

window.DataStore = {
  IS_SUPABASE_CONFIGURED,
  localLoad,
  localSave,
  fetchAllData,
  saveAreaData,
};
