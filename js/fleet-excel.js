// ============================================================
// SSOT - FROTA EXCEL (v3.0 — Dashboard + Relatórios específicos)
// ============================================================

import { showNotification, escapeHtml } from './utils.js';
import { sstConfirm, sstAlert } from './dialogs.js';
import { addHistory } from './history.js';

const STORAGE_KEY = 'ssot_fleet_excel_v1';
const PAGE_SIZE = 100;

const SHEETS_CONFIG = {
    'Veículos':       { key: 'veiculos',       titleRow: false, icon: 'i-car' },
    'Abastecimentos': { key: 'abastecimentos', titleRow: false, icon: 'i-truck' },
    'Serviços':       { key: 'servicos',       titleRow: false, icon: 'i-cog' },
    'Despesas':       { key: 'despesas',       titleRow: false, icon: 'i-file-text' },
    'Leituras':       { key: 'leituras',       titleRow: false, icon: 'i-clock' },
    'Percursos':      { key: 'percursos',      titleRow: false, icon: 'i-route' },
    'Checklist':      { key: 'checklist',      titleRow: true,  icon: 'i-check-circle' }
};

const ABAS = {
    dashboard:      { label: 'Dashboard',           icon: 'i-chart-pie',   render: 'dashboard' },
    importar:       { label: 'Importar/Exportar',   icon: 'i-upload',      render: 'import' },
    viagens:        { label: 'Viagens',             icon: 'i-route',       sheetKey: 'percursos',      sheetName: 'Percursos' },
    veiculos:       { label: 'Veículos',            icon: 'i-car',         sheetKey: 'veiculos',       sheetName: 'Veículos' },
    abastecimentos: { label: 'Abastecimentos',      icon: 'i-truck',       sheetKey: 'abastecimentos', sheetName: 'Abastecimentos' },
    servicos:       { label: 'Serviços',            icon: 'i-cog',         sheetKey: 'servicos',       sheetName: 'Serviços' },
    despesas:       { label: 'Despesas',            icon: 'i-file-text',   sheetKey: 'despesas',       sheetName: 'Despesas' },
    leituras:       { label: 'Leituras',            icon: 'i-clock',       sheetKey: 'leituras',       sheetName: 'Leituras' },
    checklist:      { label: 'Checklist',           icon: 'i-check-circle', sheetKey: 'checklist',     sheetName: 'Checklist' },
    relatorios:     { label: 'Relatórios',          icon: 'i-chart-bar',   render: 'reports' }
};

let _currentUser = null;
let _data = {};
let _activeAba = 'importar';
let _initialized = false;
let _searchTerm = '';
let _page = 0;
let _editingKey = null;
let _editingIndex = -1;
let _fleetCharts = {};

// Estado dos Relatórios
let _reportType = 'resumo';
let _reportStart = '';
let _reportEnd = '';
let _reportVehicle = '';
let _reportPreview = null;

// ============================================================
// INIT
// ============================================================
export function setFleetExcelContext(db, currentUser) {
    _currentUser = currentUser;
}

export function initFleetExcel() {
    loadFromStorage();
    if (!_initialized) {
        _initialized = true;
        bindGlobals();
    }
    const hasData = Object.values(_data).some(d => (d?.rows?.length || 0) > 0);
    if (hasData && _activeAba === 'importar') _activeAba = 'dashboard';
    renderSubTabs();
    renderActivePanel();
    updateStats();
    bindPanelActions();
}

function bindGlobals() {
    window.fleetExcelSwitchTab  = switchTab;
    window.fleetExcelSearch     = debounceSearch;
    window.fleetExcelPage       = changePage;
    window.fleetExcelView       = viewRow;
    window.fleetExcelEdit       = editRow;
    window.fleetExcelInsert     = insertRow;
    window.fleetExcelDelete     = deleteRow;
    window.fleetExcelImport     = triggerImport;
    window.fleetExcelExport     = exportFleetExcel;
    window.fleetExcelReset      = resetFleetExcel;

    // Dashboard
    window.fleetDashRefresh     = () => { renderActivePanel(); bindPanelActions(); };

    // Relatórios
    window.fleetReportSetType   = (v) => { _reportType = v; renderActivePanel(); bindPanelActions(); };
    window.fleetReportSetStart  = (v) => { _reportStart = v; };
    window.fleetReportSetEnd    = (v) => { _reportEnd = v; };
    window.fleetReportSetVehicle = (v) => { _reportVehicle = v; };
    window.fleetReportPreview   = runReportPreview;
    window.fleetReportExportXls = exportReportExcel;
    window.fleetReportExportPdf = exportReportPdf;
}

// ============================================================
// SUB-TABS
// ============================================================
function renderSubTabs() {
    const container = document.getElementById('frota-subtabs');
    if (!container) return;
    container.innerHTML = Object.entries(ABAS).map(([key, aba]) => {
        const count = aba.sheetKey ? (_data[aba.sheetKey]?.rows?.length || 0) : null;
        return `
            <button class="tab-inner ${_activeAba === key ? 'active' : ''}"
                    onclick="window.fleetExcelSwitchTab('${key}')">
                <svg class="si"><use href="#${aba.icon}"/></svg>
                ${escapeHtml(aba.label)}
                ${count !== null ? `<span class="tab-count">${count}</span>` : ''}
            </button>
        `;
    }).join('');
}

function renderActivePanel() {
    const container = document.getElementById('frota-panels');
    if (!container) return;
    const aba = ABAS[_activeAba];

    // Destrói gráficos anteriores
    destroyFleetCharts();

    if (aba.render === 'dashboard') {
        container.innerHTML = renderFleetDashboard();
    } else if (aba.render === 'reports') {
        container.innerHTML = renderFleetReports();
    } else if (aba.render === 'import') {
        container.innerHTML = renderImportPanel();
    } else if (aba.sheetKey) {
        container.innerHTML = renderDataPanel(_activeAba, aba);
    }
}

// ============================================================
// HELPERS DE ANÁLISE DE DADOS
// ============================================================
function findCol(headers, patterns) {
    const arr = Array.isArray(patterns) ? patterns : [patterns];
    for (const p of arr) {
        const idx = headers.findIndex(h =>
            String(h || '').toLowerCase().includes(p.toLowerCase())
        );
        if (idx >= 0) return idx;
    }
    return -1;
}

function parseMoney(val) {
    if (val == null || val === '') return 0;
    const s = String(val).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

function parseNumber(val) {
    if (val == null || val === '') return 0;
    const s = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

function parseDateAny(val) {
    if (!val) return null;
    const s = String(val).trim();
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return new Date(parseInt(br[3]), parseInt(br[2]) - 1, parseInt(br[1]));
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function monthKey(date) {
    return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : null;
}

function formatMoney(n) {
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateShort(d) {
    if (!d) return '—';
    return d.toLocaleDateString('pt-BR');
}

function extractRows(sheetKey, dateCols, vehicleCols, moneyCols) {
    const sheet = _data[sheetKey];
    if (!sheet || !sheet.headers || !sheet.rows) return [];
    const headers = sheet.headers;

    const idxDate = findCol(headers, dateCols || ['data', 'date']);
    const idxVehicle = findCol(headers, vehicleCols || ['veiculo', 'veículo', 'placa', 'carro']);
    const idxMoney = findCol(headers, moneyCols || ['valor', 'total', 'custo', 'preço', 'preco']);

    return sheet.rows.map(row => ({
        date: idxDate >= 0 ? parseDateAny(row[idxDate]) : null,
        vehicle: idxVehicle >= 0 ? String(row[idxVehicle] || '').trim() : '',
        money: idxMoney >= 0 ? parseMoney(row[idxMoney]) : 0,
        raw: row
    }));
}

// ============================================================
// DASHBOARD DA FROTA
// ============================================================
function renderFleetDashboard() {
    const totalVehicles = _data.veiculos?.rows?.length || 0;
    const totalAbast = _data.abastecimentos?.rows?.length || 0;
    const totalServicos = _data.servicos?.rows?.length || 0;
    const totalDespesas = _data.despesas?.rows?.length || 0;
    const totalViagens = _data.percursos?.rows?.length || 0;

    if (totalVehicles === 0 && totalAbast === 0 && totalServicos === 0 &&
        totalDespesas === 0 && totalViagens === 0) {
        return `
            <div class="card card-elevated">
                <div class="fleet-empty-state">
                    <svg class="si si-3x"><use href="#i-chart-pie"/></svg>
                    <h3>Dashboard indisponível</h3>
                    <p>Importe uma planilha do Drivvo na aba <strong>Importar/Exportar</strong> para ver os indicadores.</p>
                </div>
            </div>
        `;
    }

    // Custos
    const abastRows = extractRows('abastecimentos');
    const servRows = extractRows('servicos');
    const despRows = extractRows('despesas');

    const custoAbast = abastRows.reduce((s, r) => s + r.money, 0);
    const custoServ = servRows.reduce((s, r) => s + r.money, 0);
    const custoDesp = despRows.reduce((s, r) => s + r.money, 0);
    const custoTotal = custoAbast + custoServ + custoDesp;

    return `
        <div class="card card-elevated">
            <div class="card-header">
                <div class="card-header-title">
                    <svg class="si si-fw"><use href="#i-chart-pie"/></svg>
                    <h2>Dashboard da Frota</h2>
                    <span class="card-header-count">${totalVehicles} veículos</span>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-sm" onclick="window.fleetDashRefresh()">
                        <svg class="si"><use href="#i-refresh"/></svg> Atualizar
                    </button>
                </div>
            </div>
            <div class="card-body">
                <!-- KPIs -->
                <div class="fleet-kpi-grid">
                    <div class="fleet-kpi-card fleet-kpi-blue">
                        <div class="fleet-kpi-label">Veículos</div>
                        <div class="fleet-kpi-value">${totalVehicles}</div>
                        <div class="fleet-kpi-sub">Cadastrados</div>
                    </div>
                    <div class="fleet-kpi-card fleet-kpi-green">
                        <div class="fleet-kpi-label">Viagens</div>
                        <div class="fleet-kpi-value">${totalViagens}</div>
                        <div class="fleet-kpi-sub">Percursos registrados</div>
                    </div>
                    <div class="fleet-kpi-card fleet-kpi-orange">
                        <div class="fleet-kpi-label">Abastecimentos</div>
                        <div class="fleet-kpi-value">${totalAbast}</div>
                        <div class="fleet-kpi-sub">${formatMoney(custoAbast)}</div>
                    </div>
                    <div class="fleet-kpi-card fleet-kpi-purple">
                        <div class="fleet-kpi-label">Serviços</div>
                        <div class="fleet-kpi-value">${totalServicos}</div>
                        <div class="fleet-kpi-sub">${formatMoney(custoServ)}</div>
                    </div>
                    <div class="fleet-kpi-card fleet-kpi-teal">
                        <div class="fleet-kpi-label">Despesas</div>
                        <div class="fleet-kpi-value">${totalDespesas}</div>
                        <div class="fleet-kpi-sub">${formatMoney(custoDesp)}</div>
                    </div>
                    <div class="fleet-kpi-card fleet-kpi-red">
                        <div class="fleet-kpi-label">Custo Total</div>
                        <div class="fleet-kpi-value">${formatMoney(custoTotal)}</div>
                        <div class="fleet-kpi-sub">Acumulado</div>
                    </div>
                </div>

                <!-- Gráficos -->
                <div class="fleet-dashboard-charts">
                    <div class="chart-card">
                        <div class="chart-header">
                            <h3><svg class="si si-fw"><use href="#i-chart-line"/></svg> Custos Mensais</h3>
                        </div>
                        <div class="chart-wrapper"><canvas id="fleet-chart-costs"></canvas></div>
                    </div>

                    <div class="chart-card">
                        <div class="chart-header">
                            <h3><svg class="si si-fw"><use href="#i-chart-pie"/></svg> Distribuição de Custos</h3>
                        </div>
                        <div class="chart-wrapper"><canvas id="fleet-chart-dist"></canvas></div>
                    </div>

                    <div class="chart-card">
                        <div class="chart-header">
                            <h3><svg class="si si-fw"><use href="#i-truck"/></svg> Top 5 — Abastecimentos</h3>
                        </div>
                        <div class="chart-wrapper"><canvas id="fleet-chart-top-veh"></canvas></div>
                    </div>

                    <div class="chart-card">
                        <div class="chart-header">
                            <h3><svg class="si si-fw"><use href="#i-route"/></svg> Viagens Mensais</h3>
                        </div>
                        <div class="chart-wrapper"><canvas id="fleet-chart-trips"></canvas></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function initFleetDashboardCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('[Fleet] Chart.js não carregado.');
        return;
    }

    const abastRows = extractRows('abastecimentos');
    const servRows = extractRows('servicos');
    const despRows = extractRows('despesas');
    const tripRows = extractRows('percursos');

    // ---- 1) Custos Mensais
    const monthsSet = new Set();
    const sumByMonth = (rows) => {
        const map = {};
        rows.forEach(r => {
            const mk = monthKey(r.date);
            if (!mk) return;
            monthsSet.add(mk);
            map[mk] = (map[mk] || 0) + r.money;
        });
        return map;
    };
    const abastByMonth = sumByMonth(abastRows);
    const servByMonth = sumByMonth(servRows);
    const despByMonth = sumByMonth(despRows);

    const months = Array.from(monthsSet).sort();
    const labels = months.map(m => {
        const [y, mm] = m.split('-');
        const d = new Date(parseInt(y), parseInt(mm) - 1, 1);
        return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    });

    const ctxCosts = document.getElementById('fleet-chart-costs');
    if (ctxCosts) {
        _fleetCharts.costs = new Chart(ctxCosts, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Abastecimentos',
                        data: months.map(m => abastByMonth[m] || 0),
                        borderColor: '#d68910', backgroundColor: 'rgba(214,137,16,0.15)',
                        fill: true, tension: 0.35, borderWidth: 2, pointRadius: 3
                    },
                    {
                        label: 'Serviços',
                        data: months.map(m => servByMonth[m] || 0),
                        borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.15)',
                        fill: true, tension: 0.35, borderWidth: 2, pointRadius: 3
                    },
                    {
                        label: 'Despesas',
                        data: months.map(m => despByMonth[m] || 0),
                        borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.15)',
                        fill: true, tension: 0.35, borderWidth: 2, pointRadius: 3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 10, font: { size: 11 }, usePointStyle: true } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#f1f1f1' }, ticks: { callback: v => formatMoney(v) } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // ---- 2) Distribuição de Custos
    const totalAbast = abastRows.reduce((s, r) => s + r.money, 0);
    const totalServ = servRows.reduce((s, r) => s + r.money, 0);
    const totalDesp = despRows.reduce((s, r) => s + r.money, 0);

    const ctxDist = document.getElementById('fleet-chart-dist');
    if (ctxDist) {
        _fleetCharts.dist = new Chart(ctxDist, {
            type: 'doughnut',
            data: {
                labels: ['Abastecimentos', 'Serviços', 'Despesas'],
                datasets: [{
                    data: [totalAbast, totalServ, totalDesp],
                    backgroundColor: ['#d68910', '#9b59b6', '#1abc9c'],
                    borderWidth: 2, borderColor: '#fff'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 10, font: { size: 11 }, usePointStyle: true } },
                    tooltip: {
                        callbacks: { label: (ctx) => `${ctx.label}: ${formatMoney(ctx.parsed)}` }
                    }
                }
            }
        });
    }

    // ---- 3) Top 5 veículos por abastecimentos
    const vehCount = {};
    abastRows.forEach(r => {
        if (r.vehicle) vehCount[r.vehicle] = (vehCount[r.vehicle] || 0) + 1;
    });
    const topVeh = Object.entries(vehCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const ctxTopVeh = document.getElementById('fleet-chart-top-veh');
    if (ctxTopVeh) {
        _fleetCharts.topVeh = new Chart(ctxTopVeh, {
            type: 'bar',
            data: {
                labels: topVeh.length ? topVeh.map(v => v[0]) : ['Sem dados'],
                datasets: [{
                    data: topVeh.length ? topVeh.map(v => v[1]) : [0],
                    backgroundColor: topVeh.map((_, i) => ['#3498db','#2980b9','#1abc9c','#16a085','#9b59b6'][i] || '#95a5a6'),
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: '#f1f1f1' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    // ---- 4) Viagens mensais
    const tripsByMonth = {};
    tripRows.forEach(r => {
        const mk = monthKey(r.date);
        if (mk) tripsByMonth[mk] = (tripsByMonth[mk] || 0) + 1;
    });
    const tripMonths = Object.keys(tripsByMonth).sort();
    const tripLabels = tripMonths.map(m => {
        const [y, mm] = m.split('-');
        const d = new Date(parseInt(y), parseInt(mm) - 1, 1);
        return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    });

    const ctxTrips = document.getElementById('fleet-chart-trips');
    if (ctxTrips) {
        _fleetCharts.trips = new Chart(ctxTrips, {
            type: 'bar',
            data: {
                labels: tripLabels.length ? tripLabels : ['Sem dados'],
                datasets: [{
                    data: tripLabels.length ? tripMonths.map(m => tripsByMonth[m]) : [0],
                    backgroundColor: '#3498db',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: '#f1f1f1' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function destroyFleetCharts() {
    Object.values(_fleetCharts).forEach(c => {
        try { c.destroy(); } catch (e) {}
    });
    _fleetCharts = {};
}

// ============================================================
// RELATÓRIOS DA FROTA
// ============================================================
function renderFleetReports() {
    const vehicles = (_data.veiculos?.rows || []).map(r => {
        const headers = _data.veiculos.headers || [];
        const idxPlaca = findCol(headers, ['placa', 'veiculo', 'veículo', 'modelo']);
        return idxPlaca >= 0 ? String(r[idxPlaca] || '').trim() : '';
    }).filter(v => v);

    const uniqVehicles = Array.from(new Set(vehicles));

    return `
        <div class="card card-elevated">
            <div class="card-header">
                <div class="card-header-title">
                    <svg class="si si-fw"><use href="#i-chart-bar"/></svg>
                    <h2>Relatórios da Frota</h2>
                </div>
            </div>
            <div class="card-body">
                <div class="fleet-report-filters">
                    <div class="form-group">
                        <label>Tipo de Relatório</label>
                        <select class="form-control" onchange="window.fleetReportSetType(this.value)">
                            <option value="resumo" ${_reportType === 'resumo' ? 'selected' : ''}>Resumo Geral</option>
                            <option value="abastecimentos" ${_reportType === 'abastecimentos' ? 'selected' : ''}>Abastecimentos</option>
                            <option value="servicos" ${_reportType === 'servicos' ? 'selected' : ''}>Serviços</option>
                            <option value="despesas" ${_reportType === 'despesas' ? 'selected' : ''}>Despesas</option>
                            <option value="viagens" ${_reportType === 'viagens' ? 'selected' : ''}>Viagens</option>
                            <option value="veiculos" ${_reportType === 'veiculos' ? 'selected' : ''}>Veículos</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Data Inicial</label>
                        <input type="date" class="form-control" value="${_reportStart}" onchange="window.fleetReportSetStart(this.value)">
                    </div>

                    <div class="form-group">
                        <label>Data Final</label>
                        <input type="date" class="form-control" value="${_reportEnd}" onchange="window.fleetReportSetEnd(this.value)">
                    </div>

                    <div class="form-group">
                        <label>Veículo</label>
                        <select class="form-control" onchange="window.fleetReportSetVehicle(this.value)">
                            <option value="">Todos</option>
                            ${uniqVehicles.map(v => `
                                <option value="${escapeHtml(v)}" ${_reportVehicle === v ? 'selected' : ''}>${escapeHtml(v)}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="flex:0 0 auto;">
                        <label>&nbsp;</label>
                        <button class="btn btn-primary" onclick="window.fleetReportPreview()">
                            <svg class="si"><use href="#i-search"/></svg> Gerar Relatório
                        </button>
                    </div>
                </div>

                <div id="fleet-report-preview">
                    ${_reportPreview ? renderReportPreviewHTML() : `
                        <div class="fleet-empty-state">
                            <svg class="si si-3x"><use href="#i-chart-bar"/></svg>
                            <h3>Pronto para gerar</h3>
                            <p>Escolha o tipo de relatório, filtros e clique em <strong>Gerar Relatório</strong>.</p>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

function runReportPreview() {
    try {
        _reportPreview = buildReportData();
        renderActivePanel();
        bindPanelActions();
        showNotification('Relatório Gerado', `${_reportPreview.rows.length} linha(s) no resultado.`, 'success');
    } catch (err) {
        console.error('[Fleet Reports]', err);
        sstAlert('Não foi possível gerar o relatório.', 'Erro', 'danger');
    }
}

function buildReportData() {
    const start = _reportStart ? new Date(_reportStart + 'T00:00:00') : null;
    const end = _reportEnd ? new Date(_reportEnd + 'T23:59:59') : null;
    const veh = _reportVehicle;

    const filterRows = (sheetKey, dateCols, vehicleCols) => {
        const sheet = _data[sheetKey];
        if (!sheet || !sheet.headers) return { headers: [], rows: [] };
        const headers = sheet.headers;
        const idxDate = findCol(headers, dateCols || ['data', 'date']);
        const idxVeh = findCol(headers, vehicleCols || ['veiculo', 'veículo', 'placa', 'carro']);

        const rows = (sheet.rows || []).filter(r => {
            if (start || end) {
                if (idxDate < 0) return true;
                const d = parseDateAny(r[idxDate]);
                if (!d) return false;
                if (start && d < start) return false;
                if (end && d > end) return false;
            }
            if (veh && idxVeh >= 0) {
                return String(r[idxVeh] || '').trim() === veh;
            }
            return true;
        });

        return { headers, rows };
    };

    let title = 'Relatório';
    let source;

    switch (_reportType) {
        case 'abastecimentos': title = 'Abastecimentos'; source = filterRows('abastecimentos'); break;
        case 'servicos': title = 'Serviços'; source = filterRows('servicos'); break;
        case 'despesas': title = 'Despesas'; source = filterRows('despesas'); break;
        case 'viagens': title = 'Viagens'; source = filterRows('percursos'); break;
        case 'veiculos': title = 'Veículos'; source = filterRows('veiculos'); break;
        case 'resumo':
        default: {
            title = 'Resumo Geral';
            const all = [];
            const abast = filterRows('abastecimentos');
            const serv = filterRows('servicos');
            const desp = filterRows('despesas');
            const trips = filterRows('percursos');

            const sumMoney = (src) => {
                const idxMoney = findCol(src.headers, ['valor', 'total', 'custo', 'preço', 'preco']);
                if (idxMoney < 0) return 0;
                return src.rows.reduce((s, r) => s + parseMoney(r[idxMoney]), 0);
            };

            const headers = ['Indicador', 'Quantidade', 'Valor Total'];
            all.push(['Veículos', (_data.veiculos?.rows || []).length, '—']);
            all.push(['Abastecimentos', abast.rows.length, formatMoney(sumMoney(abast))]);
            all.push(['Serviços', serv.rows.length, formatMoney(sumMoney(serv))]);
            all.push(['Despesas', desp.rows.length, formatMoney(sumMoney(desp))]);
            all.push(['Viagens', trips.rows.length, '—']);
            all.push(['CUSTO TOTAL', '—', formatMoney(sumMoney(abast) + sumMoney(serv) + sumMoney(desp))]);

            return {
                title,
                headers,
                rows: all,
                filterInfo: buildFilterInfo()
            };
        }
    }

    return {
        title,
        headers: source.headers,
        rows: source.rows,
        filterInfo: buildFilterInfo()
    };
}

function buildFilterInfo() {
    const parts = [];
    if (_reportStart) parts.push(`De: ${formatDateShort(new Date(_reportStart + 'T00:00:00'))}`);
    if (_reportEnd) parts.push(`Até: ${formatDateShort(new Date(_reportEnd + 'T00:00:00'))}`);
    if (_reportVehicle) parts.push(`Veículo: ${_reportVehicle}`);
    return parts.join(' · ') || 'Sem filtros';
}

function renderReportPreviewHTML() {
    const r = _reportPreview;
    if (!r) return '';

    if (!r.rows || r.rows.length === 0) {
        return `
            <div class="fleet-empty-state">
                <svg class="si si-3x"><use href="#i-info"/></svg>
                <h3>Nenhum resultado</h3>
                <p>Ajuste os filtros e tente novamente.</p>
            </div>
        `;
    }

    const headerHtml = r.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const bodyHtml = r.rows.slice(0, 200).map(row => {
        return `<tr>${r.headers.map((_, i) => {
            const v = row[i] ?? '';
            const s = String(v);
            return `<td title="${escapeHtml(s)}">${escapeHtml(s.length > 60 ? s.slice(0, 60) + '…' : s)}</td>`;
        }).join('')}</tr>`;
    }).join('');

    return `
        <div style="margin-top:20px;">
            <div class="fleet-report-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
                <div>
                    <h3 style="color:#2c3e50;font-size:1.05rem;margin:0 0 4px;">${escapeHtml(r.title)}</h3>
                    <p style="color:#7f8c8d;font-size:0.82rem;margin:0;">${escapeHtml(r.filterInfo)}</p>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-success btn-sm" onclick="window.fleetReportExportXls()">
                        <svg class="si"><use href="#i-file-excel"/></svg> Excel
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.fleetReportExportPdf()">
                        <svg class="si"><use href="#i-file-pdf"/></svg> PDF
                    </button>
                </div>
            </div>
            <div class="frota-table-container" style="max-height:520px;">
                <table class="frota-data-table">
                    <thead><tr>${headerHtml}</tr></thead>
                    <tbody>${bodyHtml}</tbody>
                </table>
            </div>
            <p style="text-align:center;color:#7f8c8d;font-size:0.82rem;margin-top:12px;">
                <strong>${r.rows.length}</strong> registro(s)${r.rows.length > 200 ? ' · exibindo os primeiros 200' : ''}
            </p>
        </div>
    `;
}

function exportReportExcel() {
    if (!_reportPreview || !_reportPreview.rows?.length) {
        sstAlert('Gere um relatório antes de exportar.', 'Vazio', 'warning');
        return;
    }
    if (typeof XLSX === 'undefined') {
        sstAlert('Biblioteca XLSX não carregada.', 'Erro', 'danger');
        return;
    }
    try {
        const aoa = [_reportPreview.headers, ..._reportPreview.rows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, _reportPreview.title.substring(0, 31) || 'Relatório');
        const fileName = `frota_relatorio_${_reportType}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showNotification('Excel gerado', fileName, 'success');
        addHistory('Relatório Frota Excel', '-', `${_reportPreview.rows.length} linhas`).catch(() => {});
    } catch (err) {
        console.error(err);
        sstAlert('Não foi possível gerar o Excel.', 'Erro', 'danger');
    }
}

async function exportReportPdf() {
    if (!_reportPreview || !_reportPreview.rows?.length) {
        sstAlert('Gere um relatório antes de exportar.', 'Vazio', 'warning');
        return;
    }
    if (typeof html2pdf === 'undefined') {
        sstAlert('Biblioteca PDF não carregada. Recarregue a página.', 'Erro', 'danger');
        return;
    }
    try {
        const tableRows = _reportPreview.rows.slice(0, 300).map(row =>
            `<tr>${_reportPreview.headers.map((_, i) => `<td>${escapeHtml(String(row[i] ?? ''))}</td>`).join('')}</tr>`
        ).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
            body { font-family: Arial, sans-serif; margin:0; padding:20px; color:#2c3e50; }
            h1 { color:#2c3e50; font-size:1.3rem; margin:0 0 4px; }
            h2 { color:#3498db; font-size:1rem; margin:0 0 16px; font-weight:normal; }
            .meta { color:#7f8c8d; font-size:0.82rem; margin-bottom:14px; }
            table { width:100%; border-collapse:collapse; font-size:0.78rem; }
            th { background:#3498db; color:#fff; padding:8px; text-align:left; }
            td { padding:6px 8px; border-bottom:1px solid #e9ecef; }
            tr:nth-child(even) { background:#f8f9fa; }
            .footer { text-align:center; margin-top:20px; color:#7f8c8d; font-size:0.75rem; }
        </style></head><body>
        <h1>SSOT — Relatório da Frota</h1>
        <h2>${escapeHtml(_reportPreview.title)}</h2>
        <p class="meta">${escapeHtml(_reportPreview.filterInfo)} · Gerado em ${new Date().toLocaleString('pt-BR')}</p>
        <table>
            <thead><tr>${_reportPreview.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
        ${_reportPreview.rows.length > 300 ? `<p class="meta">Exibindo 300 de ${_reportPreview.rows.length} registros.</p>` : ''}
        <div class="footer">Total: ${_reportPreview.rows.length} registro(s) · SSOT</div>
        </body></html>`;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99999;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.1rem;font-weight:600;';
        overlay.innerHTML = '<div>📄 Gerando PDF...</div>';
        document.body.appendChild(overlay);

        await html2pdf().set({
            margin: 10,
            filename: `frota_relatorio_${_reportType}_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(html).save();

        overlay.remove();
        showNotification('PDF gerado', 'Arquivo baixado com sucesso.', 'success');
        addHistory('Relatório Frota PDF', '-', `${_reportPreview.rows.length} linhas`).catch(() => {});
    } catch (err) {
        console.error(err);
        document.querySelectorAll('body > div').forEach(d => {
            if (d.style && d.style.zIndex === '99999') d.remove();
        });
        sstAlert('Não foi possível gerar o PDF.', 'Erro', 'danger');
    }
}

// ============================================================
// PAINEL: IMPORTAR/EXPORTAR
// ============================================================
function renderImportPanel() {
    const total = Object.values(_data).reduce((s, d) => s + (d?.rows?.length || 0), 0);
    const hasData = total > 0;

    const stats = Object.entries(SHEETS_CONFIG).map(([name, cfg]) => {
        const count = _data[cfg.key]?.rows?.length || 0;
        return `<tr>
            <td><svg class="si" style="color:#3498db;vertical-align:-2px;margin-right:6px;"><use href="#${cfg.icon}"/></svg>${escapeHtml(name)}</td>
            <td style="text-align:right;font-weight:700;color:${count > 0 ? '#27ae60' : '#adb5bd'};">${count}</td>
        </tr>`;
    }).join('');

    return `
        <div class="card card-elevated">
            <div class="card-header">
                <div class="card-header-title">
                    <svg class="si si-fw"><use href="#i-upload"/></svg>
                    <h2>Importar / Exportar Excel</h2>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-primary btn-sm" onclick="window.fleetExcelImport()">
                        <svg class="si"><use href="#i-upload"/></svg> Importar Excel
                    </button>
                    <button class="btn btn-success btn-sm" onclick="window.fleetExcelExport()" ${!hasData ? 'disabled' : ''}>
                        <svg class="si"><use href="#i-download"/></svg> Exportar Excel
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.fleetExcelReset()" ${!hasData ? 'disabled' : ''}>
                        <svg class="si"><use href="#i-broom"/></svg> Zerar Dados
                    </button>
                </div>
            </div>
            <div class="card-body">
                <input type="file" id="fleet-file-input" accept=".xlsx,.xls" hidden>

                ${hasData
                    ? `<div class="fleet-import-summary">
                        <div class="fleet-import-stat">
                            <div class="fleet-import-stat-value">${total}</div>
                            <div class="fleet-import-stat-label">Total de Registros</div>
                        </div>
                        <div class="fleet-import-stat">
                            <div class="fleet-import-stat-value">${Object.keys(SHEETS_CONFIG).length}</div>
                            <div class="fleet-import-stat-label">Abas Suportadas</div>
                        </div>
                        <div class="fleet-import-stat">
                            <div class="fleet-import-stat-value" style="color:#27ae60;">✓</div>
                            <div class="fleet-import-stat-label">Status: Pronto</div>
                        </div>
                       </div>`
                    : `<div class="fleet-empty-state">
                        <svg class="si si-3x"><use href="#i-file-excel"/></svg>
                        <h3>Nenhum arquivo importado</h3>
                        <p>Clique em <strong>"Importar Excel"</strong> para carregar o arquivo do Drivvo.<br>
                        Serão lidas ${Object.keys(SHEETS_CONFIG).length} abas automaticamente.</p>
                       </div>`}

                ${hasData ? `
                <div class="section-title">
                    <svg class="si si-fw"><use href="#i-file-excel"/></svg> Registros por Aba
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr><th>Aba</th><th style="text-align:right;">Registros</th></tr></thead>
                        <tbody>${stats}</tbody>
                    </table>
                </div>` : ''}
            </div>
        </div>
    `;
}

// ============================================================
// PAINEL: DADOS
// ============================================================
function renderDataPanel(key, aba) {
    const sheetData = _data[aba.sheetKey] || { headers: [], rows: [] };
    const headers = sheetData.headers || [];
    const rows = sheetData.rows || [];

    let filtered = rows;
    if (_searchTerm.trim()) {
        const s = _searchTerm.toLowerCase();
        filtered = rows.filter(r => (r || []).some(c => String(c ?? '').toLowerCase().includes(s)));
    }
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (_page >= totalPages) _page = 0;
    const start = _page * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);

    return `
        <div class="card card-elevated">
            <div class="card-header">
                <div class="card-header-title">
                    <svg class="si si-fw"><use href="#${aba.icon}"/></svg>
                    <h2>${escapeHtml(aba.label)}</h2>
                    <span class="card-header-count">${total}</span>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-success btn-sm" onclick="window.fleetExcelInsert('${key}')">
                        <svg class="si"><use href="#i-plus-circle"/></svg> Incluir
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="filter-bar">
                    <div class="filter-search">
                        <svg class="si si-fw"><use href="#i-search"/></svg>
                        <input type="text" class="form-control" placeholder="Pesquisar em ${escapeHtml(aba.sheetName)}..."
                               value="${escapeHtml(_searchTerm)}"
                               oninput="window.fleetExcelSearch(this.value)">
                    </div>
                </div>
                ${total === 0
                    ? `<div class="fleet-empty-state">
                        <svg class="si si-3x"><use href="#${aba.icon}"/></svg>
                        <h3>Nenhum dado em "${escapeHtml(aba.sheetName)}"</h3>
                        <p>${_searchTerm ? 'Nenhum resultado para a busca.' : 'Importe um arquivo ou clique em <strong>Incluir</strong>.'}</p>
                       </div>`
                    : `
                <div class="frota-table-container">
                    <table class="frota-data-table">
                        <thead>
                            <tr>
                                ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
                                <th style="width:140px;text-align:right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageRows.map((row, i) => {
                                const realIndex = start + i;
                                return `
                                    <tr>
                                        ${headers.map((_, j) => {
                                            const raw = row[j] ?? '';
                                            const short = String(raw).length > 60
                                                ? String(raw).slice(0, 60) + '…'
                                                : raw;
                                            return `<td title="${escapeHtml(raw)}">${escapeHtml(short)}</td>`;
                                        }).join('')}
                                        <td style="text-align:right;white-space:nowrap;">
                                            <div class="action-buttons" style="justify-content:flex-end;gap:4px;">
                                                <button class="btn btn-primary btn-sm" title="Ver"
                                                        onclick="window.fleetExcelView('${key}', ${realIndex})">
                                                    <svg class="si"><use href="#i-eye"/></svg>
                                                </button>
                                                <button class="btn btn-warning btn-sm" title="Editar"
                                                        onclick="window.fleetExcelEdit('${key}', ${realIndex})">
                                                    <svg class="si"><use href="#i-edit"/></svg>
                                                </button>
                                                <button class="btn btn-danger btn-sm" title="Excluir"
                                                        onclick="window.fleetExcelDelete('${key}', ${realIndex})">
                                                    <svg class="si"><use href="#i-trash"/></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                ${totalPages > 1 ? `
                    <div class="fleet-pagination">
                        <button class="btn btn-secondary btn-sm"
                                ${_page === 0 ? 'disabled' : ''}
                                onclick="window.fleetExcelPage(${_page - 1})">‹ Anterior</button>
                        <span>Página <strong>${_page + 1}</strong> de ${totalPages} · ${total} registro(s)</span>
                        <button class="btn btn-secondary btn-sm"
                                ${_page >= totalPages - 1 ? 'disabled' : ''}
                                onclick="window.fleetExcelPage(${_page + 1})">Próxima ›</button>
                    </div>
                ` : ''}
                `}
            </div>
        </div>
    `;
}

// ============================================================
// NAVEGAÇÃO
// ============================================================
function switchTab(key) {
    if (!ABAS[key]) return;
    _activeAba = key;
    _searchTerm = '';
    _page = 0;
    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
}

let _searchTimer = null;
function debounceSearch(value) {
    _searchTerm = value || '';
    _page = 0;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
        renderActivePanel();
        bindPanelActions();
        const input = document.querySelector('#frota-panels .filter-search input');
        if (input) {
            input.focus();
            const len = input.value.length;
            try { input.setSelectionRange(len, len); } catch (e) {}
        }
    }, 400);
}

function changePage(p) {
    if (p < 0) return;
    _page = p;
    renderActivePanel();
    bindPanelActions();
}

// ============================================================
// CRUD
// ============================================================
function viewRow(abaKey, index) {
    const aba = ABAS[abaKey];
    const sheetData = _data[aba.sheetKey];
    const row = sheetData?.rows?.[index];
    if (!row) return;
    const headers = sheetData.headers || [];

    const title = document.getElementById('fleet-view-title');
    if (title) title.textContent = `Visualizar — ${aba.label}`;

    const content = document.getElementById('fleet-view-content');
    if (content) {
        content.innerHTML = `<div class="fleet-view-grid">` +
            headers.map((h, i) => `
                <div class="fleet-view-item">
                    <div class="fleet-view-label">${escapeHtml(h)}</div>
                    <div class="fleet-view-value">${escapeHtml(row[i] ?? '') || '—'}</div>
                </div>
            `).join('') + `</div>`;
    }
    window.openModal('fleet-view-modal');
}

function editRow(abaKey, index) {
    _editingKey = abaKey;
    _editingIndex = index;
    openCrudModal('editar', abaKey, index);
}

function insertRow(abaKey) {
    _editingKey = abaKey;
    _editingIndex = -1;
    openCrudModal('incluir', abaKey, -1);
}

function openCrudModal(mode, abaKey, index) {
    const aba = ABAS[abaKey];
    const sheetData = _data[aba.sheetKey];
    if (!sheetData) return;

    const headers = sheetData.headers || [];
    if (headers.length === 0) {
        sstAlert('Esta aba não tem colunas definidas. Importe um arquivo primeiro.', 'Aba vazia', 'warning');
        return;
    }
    const row = index >= 0 ? (sheetData.rows[index] || []) : [];

    const title = document.getElementById('fleet-crud-title');
    if (title) title.textContent = mode === 'incluir' ? `Incluir — ${aba.label}` : `Editar — ${aba.label}`;

    const fields = document.getElementById('fleet-crud-fields');
    if (!fields) return;

    fields.innerHTML = headers.map((h, i) => {
        const value = row[i] ?? '';
        const fieldId = `fleet-field-${i}`;
        const type = detectInputType(h, value);
        return `
            <div class="form-group">
                <label for="${fieldId}">${escapeHtml(h)}</label>
                ${buildInputHtml(fieldId, type, value)}
            </div>
        `;
    }).join('');

    const form = document.getElementById('fleet-crud-form');
    if (form && !form.dataset.bound) {
        form.dataset.bound = 'true';
        form.addEventListener('submit', handleCrudSubmit);
    }

    window.openModal('fleet-crud-modal');
}

function detectInputType(header, value) {
    const h = String(header || '').toLowerCase();
    const v = String(value || '').trim();
    if (h.includes('data') && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) return 'date';
    if (h.includes('hora') && /^\d{2}:\d{2}/.test(v)) return 'time';
    return 'text';
}

function buildInputHtml(id, type, value) {
    if (type === 'date') {
        const [d, m, y] = String(value).split('/');
        return `<input type="date" class="form-control" id="${id}" value="${y}-${m}-${d}">`;
    }
    if (type === 'time') {
        return `<input type="time" class="form-control" id="${id}" value="${String(value).substring(0, 5)}">`;
    }
    return `<input type="text" class="form-control" id="${id}" value="${escapeHtml(value)}">`;
}

async function handleCrudSubmit(e) {
    e.preventDefault();
    if (!_editingKey) return;

    const aba = ABAS[_editingKey];
    const sheetData = _data[aba.sheetKey];
    const headers = sheetData.headers || [];

    const newRow = headers.map((h, i) => {
        const input = document.getElementById(`fleet-field-${i}`);
        if (!input) return '';
        const type = detectInputType(h, '');
        if (type === 'date' && input.value) {
            const [y, m, d] = input.value.split('-');
            return `${d}/${m}/${y}`;
        }
        if (type === 'time' && input.value) return input.value.substring(0, 5);
        return input.value;
    });

    if (_editingIndex >= 0) {
        sheetData.rows[_editingIndex] = newRow;
        showNotification('Atualizado', 'Registro atualizado com sucesso.', 'success');
        try { await addHistory('Frota Excel Edição', '-', `${aba.label} editado`); } catch (e) {}
    } else {
        sheetData.rows.push(newRow);
        showNotification('Adicionado', 'Novo registro incluído.', 'success');
        try { await addHistory('Frota Excel Inclusão', '-', `${aba.label} incluído`); } catch (e) {}
    }

    saveToStorage();
    window.closeModal('fleet-crud-modal');

    _editingKey = null;
    _editingIndex = -1;

    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
}

async function deleteRow(abaKey, index) {
    const aba = ABAS[abaKey];
    const sheetData = _data[aba.sheetKey];
    const row = sheetData?.rows?.[index];
    if (!row) return;

    const firstCell = row[0] ?? 'registro';
    const ok = await sstConfirm(`Excluir o registro "${firstCell}" de ${aba.label}?`, 'Confirmar exclusão', 'danger');
    if (!ok) return;

    sheetData.rows.splice(index, 1);
    saveToStorage();
    showNotification('Excluído', 'Registro removido com sucesso.', 'success');
    try { await addHistory('Frota Excel Exclusão', '-', `${aba.label} removido`); } catch (e) {}

    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
    updateStats();
}

// ============================================================
// IMPORTAÇÃO
// ============================================================
function triggerImport() {
    let input = document.getElementById('fleet-file-input');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'fleet-file-input';
        input.accept = '.xlsx,.xls';
        input.hidden = true;
        document.body.appendChild(input);
    }
    input.value = '';
    input.onchange = handleFileImport;
    input.click();
}

async function handleFileImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        sstAlert('Biblioteca XLSX não carregada. Recarregue a página.', 'Erro', 'danger');
        return;
    }

    try {
        showNotification('Processando', `Lendo "${file.name}"...`, 'info');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

        const newData = {};
        let totalRows = 0;
        const notFound = [];

        for (const [sheetName, cfg] of Object.entries(SHEETS_CONFIG)) {
            let sheet = workbook.Sheets[sheetName];
            if (!sheet) {
                const norm = normalizeName(sheetName);
                const found = workbook.SheetNames.find(n => normalizeName(n) === norm);
                if (found) sheet = workbook.Sheets[found];
            }
            if (!sheet) {
                notFound.push(sheetName);
                newData[cfg.key] = { headers: [], rows: [] };
                continue;
            }

            const parsed = XLSX.utils.sheet_to_json(sheet, {
                header: 1, defval: '', raw: false, blankrows: false
            });

            if (parsed.length === 0) {
                newData[cfg.key] = { headers: [], rows: [] };
                continue;
            }

            let headers = parsed[0];
            let rows = parsed.slice(1);
            if (cfg.titleRow) {
                headers = parsed[1] || parsed[0];
                rows = parsed.slice(2);
            }
            headers = headers.map(h => String(h ?? '').trim()).filter(h => h.length > 0);
            rows = rows.map(r => headers.map((_, i) => String(r[i] ?? '').trim()))
                       .filter(r => r.some(c => c !== ''));

            newData[cfg.key] = { headers, rows };
            totalRows += rows.length;
        }

        if (totalRows === 0) {
            sstAlert('Nenhuma linha de dados encontrada.', 'Arquivo vazio', 'warning');
            return;
        }

        _data = newData;
        saveToStorage();

        showNotification('Importado', `${totalRows} registro(s) de ${file.name}.`, 'success');
        try { await addHistory('Frota Excel Importação', '-', `${totalRows} registros de ${file.name}`); } catch (e) {}

        if (notFound.length > 0) {
            sstAlert(`Abas não encontradas: ${notFound.join(', ')}`, 'Aviso', 'warning');
        }

        _activeAba = 'dashboard';

        renderSubTabs();
        renderActivePanel();
        bindPanelActions();
        updateStats();

    } catch (err) {
        console.error('Import error:', err);
        sstAlert(`Erro ao importar: ${err.message}`, 'Falha', 'danger');
    } finally {
        e.target.value = '';
    }
}

function normalizeName(name) {
    return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase();
}

// ============================================================
// EXPORTAÇÃO
// ============================================================
async function exportFleetExcel() {
    const total = Object.values(_data).reduce((s, d) => s + (d?.rows?.length || 0), 0);
    if (total === 0) {
        sstAlert('Não há dados para exportar.', 'Vazio', 'warning');
        return;
    }
    if (typeof XLSX === 'undefined') {
        sstAlert('Biblioteca XLSX não carregada.', 'Erro', 'danger');
        return;
    }
    try {
        const wb = XLSX.utils.book_new();
        for (const [sheetName, cfg] of Object.entries(SHEETS_CONFIG)) {
            const sd = _data[cfg.key];
            if (!sd || !sd.headers?.length) continue;
            const aoa = [sd.headers, ...sd.rows];
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
        }
        const fileName = `frota_ssot_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showNotification('Exportado', fileName, 'success');
        try { await addHistory('Frota Excel Exportação', '-', fileName); } catch (e) {}
    } catch (err) {
        console.error(err);
        sstAlert(`Erro ao exportar: ${err.message}`, 'Erro', 'danger');
    }
}

// ============================================================
// RESET
// ============================================================
async function resetFleetExcel() {
    const ok = await sstConfirm(
        'Zerar TODOS os dados importados? Esta ação não pode ser desfeita.',
        'Zerar dados da frota',
        'danger'
    );
    if (!ok) return;

    _data = {};
    _activeAba = 'importar';
    _searchTerm = '';
    _page = 0;
    _reportPreview = null;
    _reportStart = '';
    _reportEnd = '';
    _reportVehicle = '';
    _reportType = 'resumo';

    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}

    showNotification('Zerado', 'Dados da frota removidos.', 'success');
    try { await addHistory('Frota Excel Reset', '-', 'Dados zerados'); } catch (e) {}

    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
    updateStats();
}

// ============================================================
// STORAGE
// ============================================================
function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) { _data = {}; return; }
        const parsed = JSON.parse(raw);
        _data = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        console.warn('Falha ao ler storage da frota:', e);
        _data = {};
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch (e) {
        console.warn('Falha ao salvar storage da frota:', e);
        if (e.name === 'QuotaExceededError') {
            sstAlert('Armazenamento cheio. Exporte e zere os dados.', 'Armazenamento cheio', 'warning');
        }
    }
}

// ============================================================
// HELPERS
// ============================================================
function updateStats() {
    const tabs = document.querySelectorAll('#frota-subtabs .tab-inner');
    tabs.forEach(tab => {
        const onclick = tab.getAttribute('onclick') || '';
        const match = onclick.match(/'([^']+)'/);
        if (!match) return;
        const key = match[1];
        const aba = ABAS[key];
        if (!aba || !aba.sheetKey) return;
        const count = _data[aba.sheetKey]?.rows?.length || 0;
        let badge = tab.querySelector('.tab-count');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'tab-count';
            tab.appendChild(badge);
        }
        badge.textContent = count;
    });
}

function bindPanelActions() {
    if (_activeAba === 'importar') {
        const input = document.getElementById('fleet-file-input');
        if (input) input.onchange = handleFileImport;
    }

    if (_activeAba === 'dashboard') {
        // Inicializa os gráficos depois que o DOM estiver montado
        setTimeout(() => {
            try { initFleetDashboardCharts(); } catch (e) { console.warn(e); }
        }, 60);
    }
}

// ============================================================
// EXPORTS AUXILIARES
// ============================================================
export function getFleetExcelData() { return _data; }
export function getFleetActiveTab() { return _activeAba; }
export function reloadFleetExcel() {
    loadFromStorage();
    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
    updateStats();
}
