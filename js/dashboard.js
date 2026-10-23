// ============================================================
// SSOT - DASHBOARD (v10.3 - filtros por gráfico)
// ============================================================

import {
    dateToKey, getVeiculoText, getChartColor,
    escapeHtml, truncate, downloadCanvas, parseDateSafe
} from './utils.js';

let _charts = {};
let _requests = [];

// Filtro independente por gráfico
const _chartFilters = {
    status:     { mode: 'all', start: null, end: null },
    prioridade: { mode: 'all', start: null, end: null },
    timeline:   { mode: 'all', start: null, end: null },
    destinos:   { mode: 'all', start: null, end: null },
    veiculos:   { mode: 'all', start: null, end: null },
    setores:    { mode: 'all', start: null, end: null }
};

export function setDashboardData(requests) {
    _requests = requests || [];
    const dashTab = document.getElementById('admin-dashboard-tab');
    if (dashTab && dashTab.classList.contains('active')) {
        setTimeout(updateDashboardCharts, 100);
    }
}

// Aplica o filtro de UM gráfico
function filterForChart(chartName) {
    const cfg = _chartFilters[chartName] || { mode: 'all' };
    if (cfg.mode === 'all') return _requests;

    let start = null, end = null;

    if (cfg.mode === 'custom') {
        start = cfg.start ? parseDateSafe(cfg.start) : null;
        end = cfg.end ? parseDateSafe(cfg.end) : null;
        if (end) end.setHours(23, 59, 59, 999);
        if (!start && !end) return _requests;
    } else {
        const days = parseInt(cfg.mode);
        if (isNaN(days)) return _requests;
        end = new Date();
        end.setHours(23, 59, 59, 999);
        start = new Date();
        start.setDate(start.getDate() - days);
        start.setHours(0, 0, 0, 0);
    }

    return _requests.filter(r => {
        const dateStr = r.dataSolicitacao || (r.saida ? r.saida.slice(0, 10) : null);
        if (!dateStr) return false;
        const d = parseDateSafe(dateStr);
        if (!d) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
    });
}

export function updateDashboardCharts() {
    if (!window.Chart) return;

    renderChartByName('status');
    renderChartByName('prioridade');
    renderChartByName('timeline');
    renderChartByName('destinos');
    renderChartByName('veiculos');
    renderChartByName('setores');
}

function renderChartByName(name) {
    const list = filterForChart(name);
    switch (name) {
        case 'status':     renderStatusChart(list); break;
        case 'prioridade': renderPrioridadeChart(list); break;
        case 'timeline':   renderTimelineChart(list); break;
        case 'destinos':   renderDestinosChart(list); break;
        case 'veiculos':   renderVeiculosChart(list); break;
        case 'setores':    renderSetoresChart(list); break;
    }
}

function renderStatusChart(list) {
    const counts = { pendente: 0, aprovada: 0, recusada: 0, 'em-andamento': 0, concluida: 0, cancelada: 0 };
    list.forEach(r => { if (counts.hasOwnProperty(r.status)) counts[r.status]++; });

    const ctx = document.getElementById('chart-status');
    if (!ctx) return;
    if (_charts.status) { try { _charts.status.destroy(); } catch (e) {} }

    _charts.status = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pendente','Aprovada','Recusada','Em Andamento','Concluída','Cancelada'],
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#f39c12','#27ae60','#c0392b','#3498db','#1abc9c','#95a5a6'],
                borderWidth: 2, borderColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 }, usePointStyle: true } } }
        }
    });
}

function renderPrioridadeChart(list) {
    const counts = { baixa: 0, normal: 0, alta: 0, urgente: 0 };
    list.forEach(r => { if (counts.hasOwnProperty(r.prioridade)) counts[r.prioridade]++; });

    const ctx = document.getElementById('chart-prioridade');
    if (!ctx) return;
    if (_charts.prioridade) { try { _charts.prioridade.destroy(); } catch (e) {} }

    _charts.prioridade = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Baixa','Normal','Alta','Urgente'],
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#95a5a6','#3498db','#d68910','#c0392b'],
                borderRadius: 6, borderSkipped: false
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

function renderTimelineChart(list) {
    const cfg = _chartFilters.timeline;

    let days = 7;
    if (cfg.mode === 'custom' && cfg.start && cfg.end) {
        const s = parseDateSafe(cfg.start);
        const e = parseDateSafe(cfg.end);
        if (s && e) days = Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
    } else if (cfg.mode !== 'all' && cfg.mode !== 'custom') {
        days = parseInt(cfg.mode) || 7;
    }
    days = Math.min(days, 90); // limite visual

    const labels = [];
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dateToKey(d);
        data.push(list.filter(r => r.dataSolicitacao === key || (r.saida && r.saida.slice(0, 10) === key)).length);
        labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    }

    const ctx = document.getElementById('chart-timeline');
    if (!ctx) return;
    if (_charts.timeline) { try { _charts.timeline.destroy(); } catch (e) {} }

    _charts.timeline = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Solicitações', data,
                borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)',
                fill: true, tension: 0.4, borderWidth: 2,
                pointBackgroundColor: '#3498db', pointBorderColor: '#fff',
                pointBorderWidth: 2, pointRadius: 4
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

function renderDestinosChart(list) {
    const destCount = {};
    list.forEach(r => {
        if (r.destino && r.destino.trim()) {
            const d = r.destino.trim();
            destCount[d] = (destCount[d] || 0) + 1;
        }
    });
    const top = Object.entries(destCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const ctx = document.getElementById('chart-destinos');
    if (!ctx) return;
    if (_charts.destinos) { try { _charts.destinos.destroy(); } catch (e) {} }

    _charts.destinos = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top.map(d => truncate(d[0], 18)),
            datasets: [{ data: top.map(d => d[1]), backgroundColor: '#1abc9c', borderRadius: 6, borderSkipped: false }]
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

function renderVeiculosChart(list) {
    const veicCount = {};
    list.forEach(r => { if (r.veiculo) veicCount[r.veiculo] = (veicCount[r.veiculo] || 0) + 1; });
    const entries = Object.entries(veicCount);

    const ctx = document.getElementById('chart-veiculos');
    if (!ctx) return;
    if (_charts.veiculos) { try { _charts.veiculos.destroy(); } catch (e) {} }

    if (entries.length === 0) {
        _charts.veiculos = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Sem dados'], datasets: [{ data: [1], backgroundColor: ['#e0e0e0'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
        return;
    }

    _charts.veiculos = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: entries.map(e => getVeiculoText(e[0])),
            datasets: [{
                data: entries.map(e => e[1]),
                backgroundColor: entries.map((_, i) => getChartColor(i)),
                borderWidth: 2, borderColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { padding: 10, font: { size: 10 }, usePointStyle: true } } }
        }
    });
}

function renderSetoresChart(list) {
    const setorCount = {};
    list.forEach(r => {
        if (r.setor && r.setor.trim()) {
            const s = r.setor.trim();
            setorCount[s] = (setorCount[s] || 0) + 1;
        }
    });
    const top = Object.entries(setorCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const ctx = document.getElementById('chart-setores');
    if (!ctx) return;
    if (_charts.setores) { try { _charts.setores.destroy(); } catch (e) {} }

    _charts.setores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top.map(d => truncate(d[0], 18)),
            datasets: [{ data: top.map(d => d[1]), backgroundColor: '#9b59b6', borderRadius: 6, borderSkipped: false }]
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

export function destroyDashboardCharts() {
    Object.values(_charts).forEach(c => { try { c.destroy(); } catch (e) {} });
    _charts = {};
}

export function setupChartDownloads() {
    document.querySelectorAll('.chart-download-btn').forEach(btn => {
        if (btn.dataset.bound === 'true') return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const card = this.closest('.chart-card');
            if (!card) return;
            const canvas = card.querySelector('canvas');
            if (!canvas) return;
            const name = card.getAttribute('data-chart') || 'grafico';
            downloadCanvas(canvas.id, `ssot_${name}`);
        });
    });
}

export function setupChartFilters() {
    // Selects
    document.querySelectorAll('.chart-filter').forEach(sel => {
        if (sel.dataset.bound === 'true') return;
        sel.dataset.bound = 'true';

        sel.addEventListener('change', function () {
            const chartName = this.getAttribute('data-chart-filter');
            const value = this.value;
            if (!_chartFilters[chartName]) return;

            _chartFilters[chartName].mode = value;

            const dateBox = document.querySelector(`[data-chart-dates="${chartName}"]`);
            if (dateBox) {
                dateBox.style.display = value === 'custom' ? 'flex' : 'none';
            }

            if (value !== 'custom') {
                renderChartByName(chartName);
            } else {
                // Se já tem datas preenchidas, aplica
                const startInput = document.querySelector(`[data-chart-start="${chartName}"]`);
                const endInput = document.querySelector(`[data-chart-end="${chartName}"]`);
                if (startInput?.value || endInput?.value) {
                    renderChartByName(chartName);
                }
            }
        });
    });

    // Date inputs
    document.querySelectorAll('[data-chart-start]').forEach(input => {
        if (input.dataset.bound === 'true') return;
        input.dataset.bound = 'true';
        input.addEventListener('change', function () {
            const chartName = this.getAttribute('data-chart-start');
            if (!_chartFilters[chartName]) return;
            _chartFilters[chartName].start = this.value || null;
            if (_chartFilters[chartName].mode === 'custom') renderChartByName(chartName);
        });
    });

    document.querySelectorAll('[data-chart-end]').forEach(input => {
        if (input.dataset.bound === 'true') return;
        input.dataset.bound = 'true';
        input.addEventListener('change', function () {
            const chartName = this.getAttribute('data-chart-end');
            if (!_chartFilters[chartName]) return;
            _chartFilters[chartName].end = this.value || null;
            if (_chartFilters[chartName].mode === 'custom') renderChartByName(chartName);
        });
    });
}

// Mantido por compatibilidade (não é mais usado)
export function setupGlobalFilter() {}