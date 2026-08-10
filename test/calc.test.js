const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./setup');

// ---------------------------------------------------------------------------
// Helpers basicos
// ---------------------------------------------------------------------------
test('isNum / toNum tratam vazio, null e undefined como "sem valor"', () => {
  assert.equal(C.isNum(''), false);
  assert.equal(C.isNum(null), false);
  assert.equal(C.isNum(undefined), false);
  assert.equal(C.isNum(0), true);
  assert.equal(C.isNum('5'), true);
  assert.equal(C.toNum(''), null);
  assert.equal(C.toNum('7'), 7);
});

test('automationPercentage evita divisao por zero quando Planejado esta vazio/zero', () => {
  assert.equal(C.automationPercentage(0, 10), 0);
  assert.equal(C.automationPercentage('', 10), 0);
  assert.equal(C.automationPercentage(10, 5), 0.5);
});

test('resolutionRate trata Abertos=0 sem quebrar', () => {
  assert.equal(C.resolutionRate(0, 0), 0); // nada aberto, nada resolvido -> 0%
  assert.equal(C.resolutionRate(0, 3), 1); // resolveu algo sem nada "aberto" registrado -> 100%
  assert.equal(C.resolutionRate(10, 5), 0.5);
});

test('homologationRate nunca passa de 100%, mesmo com Homologadas > Realizados', () => {
  assert.equal(C.homologationRate(10, 8), 0.8);
  assert.equal(C.homologationRate(6, 9), 1); // homologou mais do que o realizado do mes -> capped em 100%
});

test('isRowActive: linha sem o campo "active" continua contando (compatibilidade com dados antigos)', () => {
  assert.equal(C.isRowActive({}), true);
  assert.equal(C.isRowActive({ active: true }), true);
  assert.equal(C.isRowActive({ active: false }), false);
});

// ---------------------------------------------------------------------------
// KPI 1 - Crescimento Mensal (compara PRODUCAO do mes atual vs mes anterior)
// ---------------------------------------------------------------------------
test('kpi1MonthlyDelta bate com os 3 exemplos de referencia (comparacao direta mes atual x mes anterior)', () => {
  const up = C.kpi1MonthlyDelta([{ month: 'A', planned: 1, realized: 487, active: true }, { month: 'B', planned: 1, realized: 490, active: true }]);
  assert.equal(up.delta, 3);
  assert.ok(Math.abs(up.pct - 0.00616016) < 0.0001);

  const flat = C.kpi1MonthlyDelta([{ month: 'A', planned: 1, realized: 487, active: true }, { month: 'B', planned: 1, realized: 487, active: true }]);
  assert.equal(flat.delta, 0);
  assert.equal(flat.pct, 0);

  const down = C.kpi1MonthlyDelta([{ month: 'A', planned: 1, realized: 490, active: true }, { month: 'B', planned: 1, realized: 487, active: true }]);
  assert.equal(down.delta, -3);
  assert.ok(Math.abs(down.pct + 0.00612245) < 0.0001);
});

test('kpi1MonthlyDelta: ignora meses desmarcados (checkbox "Incluir")', () => {
  const rows = [
    { month: 'Jan', planned: 10, realized: 5, active: true },
    { month: 'Fev', planned: 12, realized: 20, active: false }, // desmarcado - deve ser ignorado
    { month: 'Mar', planned: 15, realized: 14, active: true },
  ];
  // sem Fev, compara direto Jan(5) x Mar(14) -> delta = 14-5 = 9
  const r = C.kpi1MonthlyDelta(rows);
  assert.equal(r.delta, 9);
});

test('kpi1MonthlyDelta: retorna null sem pelo menos 2 meses preenchidos', () => {
  assert.equal(C.kpi1MonthlyDelta([]), null);
  assert.equal(C.kpi1MonthlyDelta([{ month: 'Jan', planned: 10, realized: 5, active: true }]), null);
});

// ---------------------------------------------------------------------------
// KPI 3 - Eficiencia vs Planejamento (variacao % da eficiencia, nao p.p.)
// ---------------------------------------------------------------------------
test('kpi3EfficiencyVariation bate com o exemplo de referencia (Maio/Junho -> 14,10%)', () => {
  const rows = [
    { month: 'Mai', planned: 188, realized: 68, active: true },
    { month: 'Jun', planned: 189, realized: 78, active: true },
  ];
  const r = C.kpi3EfficiencyVariation(rows);
  // variation vem como fracao (0.1409... = 14,10%), nao multiplicada por 100
  assert.ok(Math.abs(r.variation - 0.1409897292250232) < 0.0001);
  assert.equal(r.status, 'Melhorou');
});

test('kpi3EfficiencyVariation retorna null quando a eficiencia do mes anterior e zero (evita divisao por zero)', () => {
  const rows = [
    { month: 'Mai', planned: 100, realized: 0, active: true },
    { month: 'Jun', planned: 100, realized: 10, active: true },
  ];
  assert.equal(C.kpi3EfficiencyVariation(rows), null);
});

// ---------------------------------------------------------------------------
// KPI 5 - Taxa de Abertura de Bugs por Sprint (diferenca absoluta + %)
// ---------------------------------------------------------------------------
test('kpi5BugsOpenedTrend calcula a diferenca de bugs abertos entre as 2 ultimas sprints', () => {
  const squad = [
    { endDate: '2026-06-01', bugsOpened: 5, active: true },
    { endDate: '2026-07-01', bugsOpened: 7, active: true },
  ];
  const r = C.kpi5BugsOpenedTrend(squad);
  assert.equal(r.delta, 2);
  assert.equal(r.pct, 0.4);
});

test('kpi5BugsOpenedTrend: com so 1 sprint, retorna a quantidade mas delta/pct nulos', () => {
  const r = C.kpi5BugsOpenedTrend([{ endDate: '2026-06-01', bugsOpened: 5, active: true }]);
  assert.equal(r.opened, 5);
  assert.equal(r.delta, null);
});

test('kpi5BugsOpenedTrend ordena por Data Fim real, nao pela ordem do array', () => {
  // SPRINT 33 aparece primeiro no array mas termina DEPOIS da SPRINT 32
  const squad = [
    { sprint: 'SPRINT 33', endDate: '2026-07-31', bugsOpened: 7, active: true },
    { sprint: 'SPRINT 32', endDate: '2026-06-15', bugsOpened: 2, active: true },
  ];
  const r = C.kpi5BugsOpenedTrend(squad);
  assert.equal(r.opened, 7); // a mais recente por DATA (SPRINT 33) e a atual
  assert.equal(r.delta, 5); // 7 - 2
});

// ---------------------------------------------------------------------------
// Agregados de Agilidade
// ---------------------------------------------------------------------------
test('lastSprintsAggregate soma somente as ultimas N sprints preenchidas', () => {
  const squad = [
    { pointsPlanned: 50, pointsDelivered: 40, active: true },
    { pointsPlanned: 45, pointsDelivered: 55, active: true },
  ];
  const agg = C.lastSprintsAggregate(squad, 2);
  assert.equal(agg.totalPlanned, 95);
  assert.equal(agg.totalDelivered, 95);
});

test('bugsRatePerSprint bate com o exemplo de referencia (74 pts, 6 bugs -> 8,11%)', () => {
  const r = C.bugsRatePerSprint([{ endDate: '2026-06-01', pointsDelivered: 74, bugsOpened: 6, active: true }]);
  assert.ok(Math.abs(r.rate - 8.108108108108109) < 0.0001);
});

// ---------------------------------------------------------------------------
// Resumo Executivo - nunca deve gerar NaN/Infinity, e trata dados insuficientes
// ---------------------------------------------------------------------------
test('buildExecutiveSummary informa dados insuficientes quando nao ha nenhum periodo', () => {
  const s = C.buildExecutiveSummary([], []);
  assert.equal(s.insufficientData, true);
});

test('buildExecutiveSummary avisa "sem periodo anterior" quando ha so 1 mes cadastrado', () => {
  const s = C.buildExecutiveSummary([{ month: 'Jul', planned: 13, realized: 6, homologated: 5, active: true }], []);
  assert.equal(s.insufficientData, false);
  assert.equal(s.noPreviousPeriod, true);
});

test('buildExecutiveSummary nunca retorna NaN/Infinity/undefined nos textos gerados', () => {
  const automation = [
    { month: 'Jun', planned: 6, realized: 5, homologated: 5, active: true },
    { month: 'Jul', planned: 13, realized: 6, homologated: 5, active: true },
  ];
  const squad = [
    { endDate: '2026-06-15', pointsPlanned: 53, pointsDelivered: 38, bugsOpened: 2, bugsResolved: 2, active: true },
    { endDate: '2026-07-13', pointsPlanned: 56, pointsDelivered: 62, bugsOpened: 5, bugsResolved: 4, active: true },
  ];
  const s = C.buildExecutiveSummary(automation, squad);
  const allText = JSON.stringify(s);
  assert.ok(!allText.includes('NaN'));
  assert.ok(!allText.includes('Infinity'));
  assert.ok(!allText.includes('undefined'));
  assert.ok(!allText.includes('null'));
  assert.ok(s.positives.length + s.attentions.length <= 6); // no maximo 3 + 3
  assert.ok(s.actions.length <= 3);
});
