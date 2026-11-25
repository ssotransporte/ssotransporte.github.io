// ============================================================
// SSOT · FROTA — RELATÓRIOS DE OPERAÇÕES (v1.1)
// Alterações:
//  - Botão "Gráfico Dinâmico" movido para cá (estava em Import)
// ============================================================

import {
    showNotification, escapeHtml, parseDateSafe, downloadCSV
} from './utils.js';
import { addHistory } from './history.js';

let _activeReport = 'resumo';
let _filters = { start: '', end: '', veiculo: '' };
let _lastData = null;
let _lastReportName = '';

const REPORTS = {
    resumo:         { label: 'Resumo da Frota',      icon: 'i-chart-bar',    sheet: null },
    abastecimentos: { label: 'Abastecimentos',       icon: 'i-truck',        sheet: 'abastecimentos' },
    servicos:       { label: 'Serviços',             icon: 'i-cog',          sheet: 'servicos' },
    despesas:       { label: 'Despesas',             icon: 'i-file-text',    sheet: 'despesas' },
    percursos:      { label: 'Percursos',            icon: 'i-route',        sheet: 'percursos' },
    leituras:       { label: 'Leituras',             icon: 'i-clock',        sheet: 'leituras' },
    checklist:      { label: 'Checklist',            icon: 'i-check-circle', sheet: 'checklist' },
    consumo:        { label: 'Consumo Médio',        icon: 'i-chart-line',   sheet: 'abastecimentos' },
    custoVeiculo:   { label: 'Custo por Veículo',    icon: 'i-car',          sheet: null },
    ranking:        { label: 'Ranking de Veículos',  icon: 'i-flag',         sheet: null }
};

function getData() {
    return window._fleetDataForCharts || {};
}
function getSheetData(sheetKey) {
    const d = getData();
    return d[sheetKey] || { headers: [], rows: [] };
}

const DATE_PATTERNS    = ['data', 'date', 'dia', 'vencimento'];
const VALUE_PATTERNS   = ['valor', 'total', 'custo', 'preco', 'preço', 'amount'];
const VEHICLE_PATTERNS = ['placa', 'veiculo', 'veículo', 'vehicle', 'carro', 'frota'];
const FUEL_PATTERNS    = ['litro', 'litros', 'combustivel', 'combustível', 'fuel', 'qtde'];
const KM_PATTERNS      = ['km', 'odometro', 'odômetro', 'quilometragem', 'distance'];

function findColumn(headers, patterns) {
    if (!headers || !headers.length) return -1;
    const norm = headers.map(h => String(h || '').toLowerCase().trim());
    for (const p of patterns) {
        const pl = p.toLowerCase();
        const idx = norm.findIndex(h => h === pl);
        if (idx >= 0) return idx;
    }
    for (const p of patterns) {
        const pl = p.toLowerCase();
        const idx = norm.findIndex(h => h.includes(pl));
        if (idx >= 0) return idx;
    }
    return -1;
}

function fmtCurrency(n) {
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtNumber(n, digits = 2) {
    if (typeof n !== 'number' || isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function parseNum(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

function filterRows(rows, headers) {
    const dateCol = findColumn(headers, DATE_PATTERNS);
    const vehCol = findColumn(headers, VEHICLE_PATTERNS);

    let startD = null, endD = null;
    if (_filters.start) startD = parseDateSafe(_filters.start);
    if (_filters.end) {
        endD = parseDateSafe(_filters.end);
        if (endD) endD.setHours(23, 59, 59, 999);
    }

    return rows.filter(row => {
        if (dateCol >= 0 && (startD || endD)) {
            const d = parseDateSafe(row[dateCol]);
            if (!d) return false;
            if (startD && d < startD) return false;
            if (endD && d > endD) return false;
        }
        if (_filters.veiculo && vehCol >= 0) {
            const v = String(row[vehCol] || '').toLowerCase().trim();
            if (v !== _filters.veiculo.toLowerCase().trim()) return false;
        }
        return true;
    });
}

function collectVehicles() {
    const set = new Set();
    const d = getData();
    ['veiculos', 'abastecimentos', 'servicos', 'despesas', 'percursos', 'leituras', 'checklist'].forEach(k => {
        const s = d[k];
        if (!s || !s.headers) return;
        const vc = findColumn(s.headers, VEHICLE_PATTERNS);
        if (vc < 0) return;
        s.rows.forEach(r => {
            const v = String(r[vc] || '').trim();
            if (v) set.add(v);
        });
    });
    return Array.from(set).sort();
}

// ============================================================
// PAINEL PRINCIPAL
// ============================================================
export function initFleetReports(container) {
    const el = typeof container === 'string'
        ? document.querySelector(container)
        : container || document.getElementById('frota-panels');
    if (!el) return;

    const veiculos = collectVehicles();

    el.innerHTML = `
        <div class="card card-elevated">
            <div class="card-header">
                <div class="card-header-title">
                    <svg class="si si-fw"><use href="#i-chart-bar"/></svg>
                    <h2>Relatórios de Operações</h2>
                </div>
                <div class="action-buttons">
                    <!-- ⬇️ NOVO: Gráfico Dinâmico (movido do Import) -->
                    <button class="btn btn-info btn-sm" onclick="window.openChartBuilder('fleet')">
                        <svg class="si"><use href="#i-chart-bar"/></svg> Gráfico Dinâmico
                    </button>
                    <button class="btn btn-success btn-sm" onclick="window.fleetReportExportCSV()">
                        <svg class="si"><use href="#i-file-excel"/></svg> CSV
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.fleetReportExportPDF()">
                        <svg class="si"><use href="#i-file-pdf"/></svg> PDF
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="frota-subtabs" id="fleet-report-tabs" style="margin-bottom:16px;">
                    ${Object.entries(REPORTS).map(([key, r]) => `
                        <button class="tab-inner ${key === _activeReport ? 'active' : ''}" data-report="${key}">
                            <svg class="si"><use href="#${r.icon}"/></svg>
                            ${escapeHtml(r.label)}
                        </button>
                    `).join('')}
                </div>

                <div class="fleet-report-filters">
                    <div class="form-group">
                        <label for="fr-start">De</label>
                        <input type="date" id="fr-start" class="form-control" value="${escapeHtml(_filters.start)}">
                    </div>
                    <div class="form-group">
                        <label for="fr-end">Até</label>
                        <input type="date" id="fr-end" class="form-control" value="${escapeHtml(_filters.end)}">
                    </div>
                    <div class="form-group">
                        <label for="fr-veiculo">Veículo</label>
                        <select id="fr-veiculo" class="form-control">
                            <option value="">Todos</option>
                            ${veiculos.map(v => `<option value="${escapeHtml(v)}" ${_filters.veiculo === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>&nbsp;</label>
                        <button class="btn btn-primary" onclick="window.fleetReportApply()">
                            <svg class="si"><use href="#i-filter"/></svg> Aplicar
                        </button>
                    </div>
                    <div class="form-group">
                        <label>&nbsp;</label>
                        <button class="btn btn-secondary" onclick="window.fleetReportClear()">
                            <svg class="si"><use href="#i-broom"/></svg> Limpar
                        </button>
                    </div>
                </div>

                <div id="fleet-report-results">
                    ${renderReportBody(_activeReport)}
                </div>
            </div>
        </div>
    `;

    el.querySelectorAll('[data-report]').forEach(btn => {
        btn.addEventListener('click', () => {
            _activeReport = btn.getAttribute('data-report');
            el.querySelectorAll('[data-report]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('fleet-report-results').innerHTML = renderReportBody(_activeReport);
        });
    });
}

function renderReportBody(key) {
    switch (key) {
        case 'resumo':         return renderResumo();
        case 'abastecimentos': return renderPorPeriodo('abastecimentos');
        case 'servicos':       return renderPorPeriodo('servicos');
        case 'despesas':       return renderPorPeriodo('despesas');
        case 'percursos':      return renderPorPeriodo('percursos');
        case 'leituras':       return renderPorPeriodo('leituras');
        case 'checklist':      return renderPorPeriodo('checklist');
        case 'consumo':        return renderConsumo();
        case 'custoVeiculo':   return renderCustoVeiculo();
        case 'ranking':        return renderRanking();
        default:               return '<div class="table-empty"><p>Relatório não encontrado.</p></div>';
    }
}

function renderResumo() {
    const d = getData();
    const stats = [
        { key: 'veiculos',       label: 'Veículos',       color: 'blue' },
        { key: 'abastecimentos', label: 'Abastecimentos', color: 'orange' },
        { key: 'servicos',       label: 'Serviços',       color: 'green' },
        { key: 'despesas',       label: 'Despesas',       color: 'purple' },
        { key: 'percursos',      label: 'Percursos',      color: 'teal' },
        { key: 'leituras',       label: 'Leituras',       color: 'blue' },
        { key: 'checklist',      label: 'Checklist',      color: 'green' }
    ];

    _lastData = null;
    _lastReportName = 'resumo';

    const cards = stats.map(s => {
        const count = d[s.key]?.rows?.length || 0;
        const headers = d[s.key]?.headers || [];
        const valueCol = findColumn(headers, VALUE_PATTERNS);
        let total = 0;
        if (valueCol >= 0) {
            total = d[s.key].rows.reduce((acc, r) => acc + parseNum(r[valueCol]), 0);
        }
        return `
            <div class="fleet-kpi-card fleet-kpi-${s.color}">
                <div class="fleet-kpi-label">${escapeHtml(s.label)}</div>
                <div class="fleet-kpi-value">${count}</div>
                ${valueCol >= 0 ? `<div class="fleet-kpi-sub">${fmtCurrency(total)}</div>` : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="fleet-kpi-grid">${cards}</div>
        <div class="alert alert-info" style="margin-top:16px;font-size:0.85rem;display:flex;gap:8px;align-items:flex-start;">
            <svg class="si" style="flex-shrink:0;margin-top:2px;"><use href="#i-info"/></svg>
            <span>Os dados são sincronizados em tempo real. Para importar planilhas, use o <strong>ícone de upload</strong> no topo.</span>
        </div>
    `;
}

function renderPorPeriodo(sheetKey) {
    const sheet = getSheetData(sheetKey);
    const headers = sheet.headers || [];
    const rows = sheet.rows || [];

    if (headers.length === 0) {
        return `<div class="fleet-empty-state">
            <svg class="si si-3x"><use href="#i-file-excel"/></svg>
            <h3>Sem dados em "${escapeHtml(sheetKey)}"</h3>
            <p>Importe um arquivo Excel primeiro.</p>
        </div>`;
    }

    const filtered = filterRows(rows, headers);
    _lastReportName = sheetKey;

    if (filtered.length === 0) {
        _lastData = null;
        return `<div class="fleet-empty-state">
            <svg class="si si-3x"><use href="#i-search"/></svg>
            <h3>Nenhum resultado</h3>
            <p>Ajuste os filtros ou importe dados.</p>
        </div>`;
    }

    const valueCol = findColumn(headers, VALUE_PATTERNS);
    const total = valueCol >= 0 ? filtered.reduce((a, r) => a + parseNum(r[valueCol]), 0) : 0;

    const maxCols = Math.min(headers.length, 10);
    const shownHeaders = headers.slice(0, maxCols);

    _lastData = {
        headers: shownHeaders,
        rows: filtered.slice(0, 500).map(r => shownHeaders.map((_, i) => r[i] ?? ''))
    };

    return `
        <div class="fleet-kpi-grid" style="margin-bottom:16px;">
            <div class="fleet-kpi-card fleet-kpi-blue">
                <div class="fleet-kpi-label">Registros</div>
                <div class="fleet-kpi-value">${filtered.length}</div>
            </div>
            ${valueCol >= 0 ? `
                <div class="fleet-kpi-card fleet-kpi-green">
                    <div class="fleet-kpi-label">Total</div>
                    <div class="fleet-kpi-value">${fmtCurrency(total)}</div>
                </div>
                <div class="fleet-kpi-card fleet-kpi-orange">
                    <div class="fleet-kpi-label">Média</div>
                    <div class="fleet-kpi-value">${fmtCurrency(total / filtered.length)}</div>
                </div>
            ` : ''}
        </div>
        <div class="frota-table-container" style="max-height:520px;">
            <table class="frota-data-table">
                <thead>
                    <tr>${shownHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${filtered.slice(0, 200).map(row => `
                        <tr>
                            ${shownHeaders.map((_, i) => {
                                const v = row[i] ?? '';
                                const s = String(v);
                                return `<td title="${escapeHtml(s)}">${escapeHtml(s.length > 60 ? s.slice(0, 60) + '…' : s)}</td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${filtered.length > 200 ? `<p style="margin-top:10px;color:#7f8c8d;font-size:0.85rem;">Exibindo 200 de ${filtered.length} registros.</p>` : ''}
    `;
}

function renderConsumo() {
    const sheet = getSheetData('abastecimentos');
    const headers = sheet.headers || [];
    const rows = sheet.rows || [];

    if (headers.length === 0) {
        return `<div class="fleet-empty-state">
            <svg class="si si-3x"><use href="#i-truck"/></svg>
            <h3>Sem dados de abastecimentos</h3>
            <p>Importe um arquivo Excel com a aba "Abastecimentos".</p>
        </div>`;
    }

    const vehCol = findColumn(headers, VEHICLE_PATTERNS);
    const kmCol = findColumn(headers, KM_PATTERNS);
    const fuelCol = findColumn(headers, FUEL_PATTERNS);

    if (vehCol < 0 || kmCol < 0 || fuelCol < 0) {
        return `<div class="alert alert-warning" style="display:flex;gap:10px;align-items:flex-start;">
            <svg class="si" style="flex-shrink:0;margin-top:2px;"><use href="#i-alert"/></svg>
            <div>
                <strong>Colunas não detectadas</strong>
                <p style="margin-top:4px;font-size:0.85rem;">
                    Para o cálculo de consumo, a aba "Abastecimentos" precisa ter colunas com nomes contendo:<br>
                    • <strong>Veículo</strong> ou "Placa"<br>
                    • <strong>KM</strong> ou "Odômetro"<br>
                    • <strong>Litros</strong> ou "Combustível"
                </p>
            </div>
        </div>`;
    }

    const filtered = filterRows(rows, headers);
    const byVehicle = {};

    filtered.forEach(r => {
        const v = String(r[vehCol] || '').trim();
        if (!v) return;
        if (!byVehicle[v]) byVehicle[v] = { km: [], litros: [], count: 0 };
        byVehicle[v].km.push(parseNum(r[kmCol]));
        byVehicle[v].litros.push(parseNum(r[fuelCol]));
        byVehicle[v].count++;
    });

    const results = Object.entries(byVehicle).map(([veh, d]) => {
        const kmMin = Math.min(...d.km);
        const kmMax = Math.max(...d.km);
        const totalLitros = d.litros.reduce((a, b) => a + b, 0);
        const kmTotal = kmMax - kmMin;
        const consumo = totalLitros > 0 && kmTotal > 0 ? kmTotal / totalLitros : 0;
        return { veh, count: d.count, kmTotal, totalLitros, consumo };
    }).filter(r => r.consumo > 0)
      .sort((a, b) => b.consumo - a.consumo);

    if (results.length === 0) {
        return `<div class="fleet-empty-state">
            <svg class="si si-3x"><use href="#i-chart-line"/></svg>
            <h3>Sem dados suficientes</h3>
            <p>É necessário pelo menos 2 abastecimentos por veículo.</p>
        </div>`;
    }

    const best = results[0];
    const worst = results[results.length - 1];
    const avgAll = results.reduce((a, r) => a + r.consumo, 0) / results.length;

    _lastData = {
        headers: ['Veículo', 'Abastecimentos', 'KM Rodados', 'Litros', 'Consumo (km/L)'],
        rows: results.map(r => [r.veh, r.count, fmtNumber(r.kmTotal, 0), fmtNumber(r.totalLitros), fmtNumber(r.consumo)])
    };
    _lastReportName = 'consumo_medio';

    return `
        <div class="fleet-kpi-grid" style="margin-bottom:16px;">
            <div class="fleet-kpi-card fleet-kpi-green">
                <div class="fleet-kpi-label">Melhor Consumo</div>
                <div class="fleet-kpi-value">${fmtNumber(best.consumo)} km/L</div>
                <div class="fleet-kpi-sub">${escapeHtml(best.veh)}</div>
            </div>
            <div class="fleet-kpi-card fleet-kpi-blue">
                <div class="fleet-kpi-label">Média Geral</div>
                <div class="fleet-kpi-value">${fmtNumber(avgAll)} km/L</div>
            </div>
            <div class="fleet-kpi-card fleet-kpi-red">
                <div class="fleet-kpi-label">Pior Consumo</div>
                <div class="fleet-kpi-value">${fmtNumber(worst.consumo)} km/L</div>
                <div class="fleet-kpi-sub">${escapeHtml(worst.veh)}</div>
            </div>
        </div>
        <div class="frota-table-container" style="max-height:520px;">
            <table class="frota-data-table">
                <thead>
                    <tr>
                        <th>Veículo</th>
                        <th>Abastecimentos</th>
                        <th>KM Rodados</th>
                        <th>Litros</th>
                        <th>Consumo (km/L)</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map(r => `
                        <tr>
                            <td><strong>${escapeHtml(r.veh)}</strong></td>
                            <td>${r.count}</td>
                            <td>${fmtNumber(r.kmTotal, 0)}</td>
                            <td>${fmtNumber(r.totalLitros)}</td>
                            <td><strong style="color:${r.consumo >= avgAll ? '#27ae60' : '#c0392b'};">${fmtNumber(r.consumo)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderCustoVeiculo() {
    const d = getData();
    const sheets = ['abastecimentos', 'servicos', 'despesas'];
    const byVehicle = {};
    let anyData = false;

    sheets.forEach(sheetKey => {
        const s = d[sheetKey];
        if (!s || !s.headers?.length) return;
        const vehCol = findColumn(s.headers, VEHICLE_PATTERNS);
        const valCol = findColumn(s.headers, VALUE_PATTERNS);
        if (vehCol < 0 || valCol < 0) return;
        anyData = true;
        s.rows.forEach(r => {
            const v = String(r[vehCol] || '').trim();
            if (!v) return;
            if (!byVehicle[v]) byVehicle[v] = { abastecimentos: 0, servicos: 0, despesas: 0, total: 0 };
            const val = parseNum(r[valCol]);
            byVehicle[v][sheetKey] += val;
            byVehicle[v].total += val;
        });
    });

    if (!anyData) {
        return `<div class="fleet-empty-state">
            <svg class="si si-3x"><use href="#i-car"/></svg>
            <h3>Sem dados suficientes</h3>
            <p>É necessário ter abas com coluna de veículo e coluna de valor.</p>
        </div>`;
    }

    const rows = Object.entries(byVehicle)
        .map(([v, c]) => ({ veh: v, ...c }))
        .sort((a, b) => b.total - a.total);

    const totalGeral = rows.reduce((a, r) => a + r.total, 0);

    _lastData = {
        headers: ['Veículo', 'Abastecimentos', 'Serviços', 'Despesas', 'Total'],
        rows: rows.map(r => [r.veh, fmtCurrency(r.abastecimentos), fmtCurrency(r.servicos), fmtCurrency(r.despesas), fmtCurrency(r.total)])
    };
    _lastReportName = 'custo_por_veiculo';

    return `
        <div class="fleet-kpi-grid" style="margin-bottom:16px;">
            <div class="fleet-kpi-card fleet-kpi-purple">
                <div class="fleet-kpi-label">Veículos</div>
                <div class="fleet-kpi-value">${rows.length}</div>
            </div>
            <div class="fleet-kpi-card fleet-kpi-green">
                <div class="fleet-kpi-label">Custo Total</div>
                <div class="fleet-kpi-value">${fmtCurrency(totalGeral)}</div>
            </div>
            <div class="fleet-kpi-card fleet-kpi-orange">
                <div class="fleet-kpi-label">Média / Veículo</div>
                <div class="fleet-kpi-value">${fmtCurrency(totalGeral / rows.length)}</div>
            </div>
        </div>
        <div class="frota-table-container" style="max-height:520px;">
            <table class="frota-data-table">
                <thead>
                    <tr>
                        <th>Veículo</th>
                        <th>Abastecimentos</th>
                        <th>Serviços</th>
                        <th>Despesas</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td><strong>${escapeHtml(r.veh)}</strong></td>
                            <td>${fmtCurrency(r.abastecimentos)}</td>
                            <td>${fmtCurrency(r.servicos)}</td>
                            <td>${fmtCurrency(r.despesas)}</td>
                            <td><strong style="color:#2c3e50;">${fmtCurrency(r.total)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderRanking() {
    const d = getData();
    const byVehicle = {};

    const ensure = (v) => {
        if (!byVehicle[v]) byVehicle[v] = { percursos: 0, abastecimentos: 0, servicos: 0, total: 0 };
        return byVehicle[v];
    };

    const perc = d.percursos;
    if (perc?.headers?.length) {
        const vc = findColumn(perc.headers, VEHICLE_PATTERNS);
        if (vc >= 0) {
            perc.rows.forEach(r => {
                const v = String(r[vc] || '').trim();
                if (!v) return;
                ensure(v).percursos++;
            });
        }
    }

    const ab = d.abastecimentos;
    if (ab?.headers?.length) {
        const vc = findColumn(ab.headers, VEHICLE_PATTERNS);
        const valc = findColumn(ab.headers, VALUE_PATTERNS);
        if (vc >= 0) {
            ab.rows.forEach(r => {
                const v = String(r[vc] || '').trim();
                if (!v) return;
                const obj = ensure(v);
                obj.abastecimentos++;
                if (valc >= 0) obj.total += parseNum(r[valc]);
            });
        }
    }

    const sv = d.servicos;
    if (sv?.headers?.length) {
        const vc = findColumn(sv.headers, VEHICLE_PATTERNS);
        const valc = findColumn(sv.headers, VALUE_PATTERNS);
        if (vc >= 0) {
            sv.rows.forEach(r => {
                const v = String(r[vc] || '').trim();
                if (!v) return;
                const obj = ensure(v);
                obj.servicos++;
                if (valc >= 0) obj.total += parseNum(r[valc]);
            });
        }
    }

    const rows = Object.entries(byVehicle)
        .map(([v, c]) => ({ veh: v, ...c }))
        .sort((a, b) => (b.percursos + b.abastecimentos + b.servicos) - (a.percursos + a.abastecimentos + a.servicos));

    if (rows.length === 0) {
        return `<div class="fleet-empty-state">
            <svg class="si si-3x"><use href="#i-flag"/></svg>
            <h3>Sem dados para ranking</h3>
            <p>Importe dados de Percursos, Abastecimentos ou Serviços.</p>
        </div>`;
    }

    _lastData = {
        headers: ['Veículo', 'Percursos', 'Abastecimentos', 'Serviços', 'Total Gasto'],
        rows: rows.map(r => [r.veh, r.percursos, r.abastecimentos, r.servicos, fmtCurrency(r.total)])
    };
    _lastReportName = 'ranking_veiculos';

    return `
        <div class="frota-table-container" style="max-height:520px;">
            <table class="frota-data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Veículo</th>
                        <th>Percursos</th>
                        <th>Abastecimentos</th>
                        <th>Serviços</th>
                        <th>Total Gasto</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((r, i) => `
                        <tr>
                            <td><strong>${i + 1}º</strong></td>
                            <td><strong>${escapeHtml(r.veh)}</strong></td>
                            <td>${r.percursos}</td>
                            <td>${r.abastecimentos}</td>
                            <td>${r.servicos}</td>
                            <td>${fmtCurrency(r.total)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export function fleetReportExportCSV() {
    if (!_lastData || !_lastData.rows?.length) {
        showNotification('Exportação', 'Gere um relatório com dados primeiro.', 'warning');
        return;
    }
    const csvData = _lastData.rows.map(row => {
        const obj = {};
        _lastData.headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
    });
    downloadCSV(csvData, `frota_${_lastReportName || 'relatorio'}`);
    addHistory('Relatório de Frota', '-', `CSV: ${_lastReportName}`).catch(() => {});
}

export function fleetReportExportPDF() {
    showNotification(
        'PDF',
        'Use Ctrl+P (Imprimir → Salvar como PDF) para exportar o relatório com a formatação atual.',
        'info',
        6000
    );
}

export function fleetReportApply() {
    _filters.start = document.getElementById('fr-start')?.value || '';
    _filters.end = document.getElementById('fr-end')?.value || '';
    _filters.veiculo = document.getElementById('fr-veiculo')?.value || '';
    document.getElementById('fleet-report-results').innerHTML = renderReportBody(_activeReport);
}

export function fleetReportClear() {
    _filters = { start: '', end: '', veiculo: '' };
    const s = document.getElementById('fr-start'); if (s) s.value = '';
    const e = document.getElementById('fr-end'); if (e) e.value = '';
    const v = document.getElementById('fr-veiculo'); if (v) v.value = '';
    document.getElementById('fleet-report-results').innerHTML = renderReportBody(_activeReport);
}

window.initFleetReports = initFleetReports;
window.fleetReportApply = fleetReportApply;
window.fleetReportClear = fleetReportClear;
window.fleetReportExportCSV = fleetReportExportCSV;
window.fleetReportExportPDF = fleetReportExportPDF;