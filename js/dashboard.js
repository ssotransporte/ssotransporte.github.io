// ============================================================
// SSOT - DASHBOARD PERSONALIZÁVEL (v12.1)
// Alterações:
//  - Removido badge do tipo de gráfico (aquele "Rosca (2D)" ao lado do nome)
// ============================================================

import {
    dateToKey, getVeiculoText, getChartColor,
    escapeHtml, truncate, parseDateSafe
} from './utils.js';

import {
    DASHBOARD_CONFIG_KEY, DASHBOARD_CHARTS, CHART_TYPES,
    DEFAULT_DASHBOARD_CONFIG
} from './config.js';

let _charts = {};
let _echartsInstances = {};
let _requests = [];
let _currentUser = null;
let _dashboardConfig = null;
let _echartsLoaded = false;
let _echartsLoading = null;

const _chartFilters = {
    status:     { mode: 'all', start: null, end: null },
    prioridade: { mode: 'all', start: null, end: null },
    timeline:   { mode: 'all', start: null, end: null },
    destinos:   { mode: 'all', start: null, end: null },
    veiculos:   { mode: 'all', start: null, end: null },
    setores:    { mode: 'all', start: null, end: null }
};

export function setDashboardContext(user) {
    _currentUser = user;
    _dashboardConfig = loadDashboardConfig();
}

export function setDashboardData(requests) {
    _requests = requests || [];
    const dashTab = document.getElementById('admin-dashboard-tab');
    if (dashTab && dashTab.classList.contains('active')) {
        setTimeout(updateDashboardCharts, 100);
    }
}

function loadDashboardConfig() {
    const key = DASHBOARD_CONFIG_KEY + '_' + (_currentUser?.uid || 'anon');
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_CONFIG));
        const parsed = JSON.parse(raw);
        return mergeConfig(parsed);
    } catch (e) {
        return JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_CONFIG));
    }
}

function mergeConfig(saved) {
    const base = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_CONFIG));
    if (!saved || !Array.isArray(saved.charts)) return base;

    const savedMap = {};
    saved.charts.forEach(c => { if (c && c.id) savedMap[c.id] = c; });

    base.charts.forEach((c, i) => {
        if (savedMap[c.id]) {
            c.type = savedMap[c.id].type || c.type;
            c.visible = savedMap[c.id].visible !== false;
            c.order = typeof savedMap[c.id].order === 'number' ? savedMap[c.id].order : i + 1;
        }
    });

    base.charts = base.charts.filter(c => DASHBOARD_CHARTS[c.id]);
    return base;
}

export function saveDashboardConfig(newConfig) {
    if (!newConfig) return;
    _dashboardConfig = mergeConfig(newConfig);
    const key = DASHBOARD_CONFIG_KEY + '_' + (_currentUser?.uid || 'anon');
    try {
        localStorage.setItem(key, JSON.stringify(_dashboardConfig));
    } catch (e) {
        console.warn('[Dashboard] Falha ao salvar config:', e);
    }
}

export function getDashboardConfig() {
    if (!_dashboardConfig) _dashboardConfig = loadDashboardConfig();
    return JSON.parse(JSON.stringify(_dashboardConfig));
}

export function resetDashboardConfig() {
    _dashboardConfig = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_CONFIG));
    const key = DASHBOARD_CONFIG_KEY + '_' + (_currentUser?.uid || 'anon');
    try { localStorage.removeItem(key); } catch (e) {}
    updateDashboardCharts();
    renderDashboardGrid();
}

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

export function renderDashboardGrid() {
    const grid = document.getElementById('dashboard-charts-grid');
    if (!grid) return;

    const cfg = getDashboardConfig();
    const visible = cfg.charts
        .filter(c => c.visible)
        .sort((a, b) => a.order - b.order);

    if (visible.length === 0) {
        grid.innerHTML = `
            <div class="dashboard-empty-state" style="grid-column: 1 / -1;">
                <svg class="si si-3x" style="opacity:0.3;margin-bottom:12px;"><use href="#i-chart-bar"/></svg>
                <h3>Nenhum gráfico ativo</h3>
                <p>Vá em <strong>Configurações → Dashboard</strong> para adicionar gráficos.</p>
                <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="window.gotoAdminTab('admin-servicos')">
                    <svg class="si"><use href="#i-cog"/></svg> Ir para Configurações
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = visible.map(c => {
        const meta = DASHBOARD_CHARTS[c.id];
        const typeMeta = CHART_TYPES[c.type] || CHART_TYPES.bar;
        const engine = typeMeta.engine;

        const chartElement = engine === 'chartjs'
            ? `<canvas id="chart-${c.id}"></canvas>`
            : `<div id="chart-${c.id}" class="echarts-container"></div>`;

        // ⬇️ Removido o <span class="chart-type-badge">…</span>
        return `
            <div class="chart-card" data-chart="${c.id}" data-type="${c.type}" data-engine="${engine}">
                <div class="chart-header">
                    <h3>
                        <svg class="si si-fw"><use href="#${meta.icon}"/></svg>
                        ${escapeHtml(meta.label)}
                    </h3>
                    <div class="chart-actions">
                        <select class="chart-filter" data-chart-filter="${c.id}">
                            <option value="all">Tudo</option>
                            <option value="7">7 dias</option>
                            <option value="30">30 dias</option>
                            <option value="90">90 dias</option>
                            <option value="custom">Personalizado</option>
                        </select>
                        <button class="chart-download-btn" title="Baixar" data-chart-download="${c.id}">
                            <svg class="si"><use href="#i-download"/></svg>
                        </button>
                    </div>
                </div>
                <div class="chart-custom-dates" data-chart-dates="${c.id}" style="display:none;">
                    <div class="chart-date-group"><label>De:</label><input type="date" class="chart-date-start" data-chart-start="${c.id}"></div>
                    <div class="chart-date-group"><label>Até:</label><input type="date" class="chart-date-end" data-chart-end="${c.id}"></div>
                </div>
                <div class="chart-wrapper">${chartElement}</div>
            </div>
        `;
    }).join('');

    bindChartFilters();
    bindChartDownloads();
}

export function updateDashboardCharts() {
    renderDashboardGrid();
    setTimeout(() => {
        const cfg = getDashboardConfig();
        const visible = cfg.charts.filter(c => c.visible);
        visible.forEach(c => {
            renderChartById(c.id, c.type);
        });
    }, 50);
}

async function renderChartById(chartId, chartType) {
    const typeMeta = CHART_TYPES[chartType] || CHART_TYPES.bar;
    const list = filterForChart(chartId);

    if (typeMeta.engine === 'chartjs') {
        return renderChartJS(chartId, typeMeta.kind, list);
    } else if (typeMeta.engine === 'echarts-gl') {
        return renderEChartsGL(chartId, typeMeta.kind, list);
    } else if (typeMeta.engine === 'echarts-style') {
        return renderEChartsStyle(chartId, typeMeta.kind, list);
    }
}

function destroyChart(chartId) {
    if (_charts[chartId]) {
        try { _charts[chartId].destroy(); } catch (e) {}
        delete _charts[chartId];
    }
    if (_echartsInstances[chartId]) {
        try { _echartsInstances[chartId].dispose(); } catch (e) {}
        delete _echartsInstances[chartId];
    }
}

function buildStatusData(list) {
    const counts = { pendente: 0, aprovada: 0, recusada: 0, 'em-andamento': 0, concluida: 0, cancelada: 0 };
    list.forEach(r => { if (counts.hasOwnProperty(r.status)) counts[r.status]++; });
    return {
        labels: ['Pendente','Aprovada','Recusada','Em Andamento','Concluída','Cancelada'],
        values: Object.values(counts),
        colors: ['#f39c12','#27ae60','#c0392b','#3498db','#1abc9c','#95a5a6']
    };
}

function buildPrioridadeData(list) {
    const counts = { baixa: 0, normal: 0, alta: 0, urgente: 0 };
    list.forEach(r => { if (counts.hasOwnProperty(r.prioridade)) counts[r.prioridade]++; });
    return {
        labels: ['Baixa','Normal','Alta','Urgente'],
        values: Object.values(counts),
        colors: ['#95a5a6','#3498db','#d68910','#c0392b']
    };
}

function buildTimelineData(list) {
    const cfg = _chartFilters.timeline;
    let days = 7;
    if (cfg.mode === 'custom' && cfg.start && cfg.end) {
        const s = parseDateSafe(cfg.start);
        const e = parseDateSafe(cfg.end);
        if (s && e) days = Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
    } else if (cfg.mode !== 'all' && cfg.mode !== 'custom') {
        days = parseInt(cfg.mode) || 7;
    }
    days = Math.min(days, 90);

    const labels = [];
    const values = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dateToKey(d);
        values.push(list.filter(r => r.dataSolicitacao === key || (r.saida && r.saida.slice(0, 10) === key)).length);
        labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    }
    return { labels, values };
}

function buildDestinosData(list) {
    const destCount = {};
    list.forEach(r => {
        if (r.destino && r.destino.trim()) {
            const d = r.destino.trim();
            destCount[d] = (destCount[d] || 0) + 1;
        }
    });
    const top = Object.entries(destCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
        labels: top.map(d => truncate(d[0], 18)),
        values: top.map(d => d[1]),
        colors: top.map((_, i) => getChartColor(i))
    };
}

function buildVeiculosData(list) {
    const veicCount = {};
    list.forEach(r => { if (r.veiculo) veicCount[r.veiculo] = (veicCount[r.veiculo] || 0) + 1; });
    const entries = Object.entries(veicCount);
    return {
        labels: entries.length ? entries.map(e => getVeiculoText(e[0])) : ['Sem dados'],
        values: entries.length ? entries.map(e => e[1]) : [1],
        colors: entries.length ? entries.map((_, i) => getChartColor(i)) : ['#e0e0e0']
    };
}

function buildSetoresData(list) {
    const setorCount = {};
    list.forEach(r => {
        if (r.setor && r.setor.trim()) {
            const s = r.setor.trim();
            setorCount[s] = (setorCount[s] || 0) + 1;
        }
    });
    const top = Object.entries(setorCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
        labels: top.map(d => truncate(d[0], 18)),
        values: top.map(d => d[1]),
        colors: top.map(() => '#9b59b6')
    };
}

function getDataForChart(chartId, list) {
    switch (chartId) {
        case 'status':     return buildStatusData(list);
        case 'prioridade': return buildPrioridadeData(list);
        case 'timeline':   return buildTimelineData(list);
        case 'destinos':   return buildDestinosData(list);
        case 'veiculos':   return buildVeiculosData(list);
        case 'setores':    return buildSetoresData(list);
        default:           return { labels: [], values: [], colors: [] };
    }
}

function renderChartJS(chartId, kind, list) {
    const canvas = document.getElementById('chart-' + chartId);
    if (!canvas || !window.Chart) return;

    destroyChart(chartId);
    const data = getDataForChart(chartId, list);
    const isCircular = ['doughnut', 'pie', 'polarArea'].includes(kind);
    const isHorizontalBar = (chartId === 'destinos' || chartId === 'setores') && kind === 'bar';

    _charts[chartId] = new Chart(canvas, {
        type: kind,
        data: {
            labels: data.labels,
            datasets: [{
                data: data.values,
                backgroundColor: data.colors || data.labels.map((_, i) => getChartColor(i)),
                borderWidth: 2,
                borderColor: '#fff',
                borderRadius: kind === 'bar' ? 6 : 0,
                borderSkipped: kind === 'bar' ? false : undefined
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            indexAxis: isHorizontalBar ? 'y' : 'x',
            plugins: {
                legend: {
                    display: isCircular,
                    position: 'bottom',
                    labels: { padding: 10, font: { size: 10 }, usePointStyle: true }
                }
            },
            scales: isCircular ? {} : {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: '#f1f1f1' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function ensureECharts() {
    if (_echartsLoaded) return true;
    if (_echartsLoading) return _echartsLoading;

    _echartsLoading = (async () => {
        try {
            await loadScriptOnce('https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js');
            await loadScriptOnce('https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js');
            _echartsLoaded = true;
            return true;
        } catch (err) {
            console.error('[Dashboard] Falha ao carregar ECharts:', err);
            _echartsLoading = null;
            return false;
        }
    })();

    return _echartsLoading;
}

async function renderEChartsGL(chartId, kind, list) {
    const container = document.getElementById('chart-' + chartId);
    if (!container) return;
    destroyChart(chartId);

    const ok = await ensureECharts();
    if (!ok) {
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#7f8c8d;">Falha ao carregar biblioteca 3D.</div>`;
        return;
    }
    if (!window.echarts) return;

    const data = getDataForChart(chartId, list);
    const inst = window.echarts.init(container, null, { renderer: 'canvas' });
    _echartsInstances[chartId] = inst;

    let option;
    if (kind === 'bar3D') {
        option = {
            tooltip: { trigger: 'item' },
            visualMap: { max: Math.max(...data.values, 1), inRange: { color: ['#a5c8e1', '#3498db', '#2c3e50'] }, show: false },
            xAxis3D: { type: 'category', data: data.labels, axisLabel: { interval: 0, rotate: data.labels.length > 6 ? 30 : 0, fontSize: 10 } },
            yAxis3D: { type: 'category', data: [''], show: false },
            zAxis3D: { type: 'value' },
            grid3D: {
                boxWidth: 120, boxDepth: 40, boxHeight: 60,
                viewControl: { alpha: 20, beta: 30, distance: 200 },
                light: { main: { intensity: 1.2, shadow: true }, ambient: { intensity: 0.3 } }
            },
            series: [{
                type: 'bar3D',
                data: data.values.map((v, i) => [i, 0, v]),
                shading: 'lambert',
                label: { show: true, fontSize: 10, color: '#fff', formatter: (p) => String(p.value[2]) },
                itemStyle: { color: '#3498db', opacity: 0.9 }
            }]
        };
    } else if (kind === 'line3D') {
        option = {
            tooltip: { trigger: 'item' },
            xAxis3D: { type: 'category', data: data.labels, axisLabel: { interval: 0, rotate: data.labels.length > 6 ? 30 : 0, fontSize: 10 } },
            yAxis3D: { type: 'category', data: [''], show: false },
            zAxis3D: { type: 'value' },
            grid3D: { boxWidth: 120, boxDepth: 40, boxHeight: 60, viewControl: { alpha: 20, beta: 30, distance: 200 }, light: { main: { intensity: 1.2, shadow: true }, ambient: { intensity: 0.3 } } },
            series: [{
                type: 'line3D',
                data: data.values.map((v, i) => [i, 0, v]),
                lineStyle: { width: 4, color: '#3498db' },
                itemStyle: { color: '#2980b9', borderWidth: 2 }
            }]
        };
    } else if (kind === 'scatter3D') {
        option = {
            tooltip: { trigger: 'item' },
            visualMap: { max: Math.max(...data.values, 1), inRange: { color: ['#27ae60', '#f39c12', '#c0392b'] }, show: false },
            xAxis3D: { type: 'category', data: data.labels, axisLabel: { interval: 0, rotate: data.labels.length > 6 ? 30 : 0, fontSize: 10 } },
            yAxis3D: { type: 'category', data: [''], show: false },
            zAxis3D: { type: 'value' },
            grid3D: { boxWidth: 120, boxDepth: 40, boxHeight: 60, viewControl: { alpha: 20, beta: 30, distance: 200 }, light: { main: { intensity: 1.2, shadow: true }, ambient: { intensity: 0.3 } } },
            series: [{ type: 'scatter3D', data: data.values.map((v, i) => [i, 0, v]), symbolSize: 16, itemStyle: { opacity: 0.85 } }]
        };
    } else {
        inst.dispose();
        delete _echartsInstances[chartId];
        return;
    }

    inst.setOption(option);
}

async function renderEChartsStyle(chartId, kind, list) {
    const container = document.getElementById('chart-' + chartId);
    if (!container) return;
    destroyChart(chartId);

    const ok = await ensureECharts();
    if (!ok) { container.innerHTML = `<div style="text-align:center;padding:20px;color:#7f8c8d;">Falha ao carregar biblioteca.</div>`; return; }

    const data = getDataForChart(chartId, list);
    const inst = window.echarts.init(container, null, { renderer: 'canvas' });
    _echartsInstances[chartId] = inst;

    inst.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'horizontal', bottom: 0, textStyle: { fontSize: 10 } },
        series: [{
            type: 'pie',
            radius: ['0%', '62%'],
            center: ['50%', '46%'],
            data: data.labels.map((l, i) => ({
                name: l,
                value: data.values[i],
                itemStyle: {
                    color: data.colors?.[i] || getChartColor(i),
                    shadowBlur: 20,
                    shadowColor: 'rgba(0,0,0,0.4)',
                    shadowOffsetX: 6,
                    shadowOffsetY: 8
                }
            })),
            label: { show: true, fontSize: 10 },
            emphasis: { itemStyle: { shadowBlur: 30, shadowOffsetX: 8, shadowOffsetY: 10 } }
        }]
    });
}

function bindChartFilters() {
    document.querySelectorAll('.chart-filter').forEach(sel => {
        if (sel.dataset.bound === 'true') return;
        sel.dataset.bound = 'true';
        sel.addEventListener('change', function () {
            const chartName = this.getAttribute('data-chart-filter');
            const value = this.value;
            if (!_chartFilters[chartName]) return;
            _chartFilters[chartName].mode = value;
            const dateBox = document.querySelector(`[data-chart-dates="${chartName}"]`);
            if (dateBox) dateBox.style.display = value === 'custom' ? 'flex' : 'none';
            if (value !== 'custom') {
                const cfg = getDashboardConfig();
                const c = cfg.charts.find(x => x.id === chartName);
                if (c) renderChartById(chartName, c.type);
            } else {
                const startInput = document.querySelector(`[data-chart-start="${chartName}"]`);
                const endInput = document.querySelector(`[data-chart-end="${chartName}"]`);
                if (startInput?.value || endInput?.value) {
                    const cfg = getDashboardConfig();
                    const c = cfg.charts.find(x => x.id === chartName);
                    if (c) renderChartById(chartName, c.type);
                }
            }
        });
    });

    document.querySelectorAll('[data-chart-start]').forEach(input => {
        if (input.dataset.bound === 'true') return;
        input.dataset.bound = 'true';
        input.addEventListener('change', function () {
            const chartName = this.getAttribute('data-chart-start');
            if (!_chartFilters[chartName]) return;
            _chartFilters[chartName].start = this.value || null;
            if (_chartFilters[chartName].mode === 'custom') {
                const cfg = getDashboardConfig();
                const c = cfg.charts.find(x => x.id === chartName);
                if (c) renderChartById(chartName, c.type);
            }
        });
    });

    document.querySelectorAll('[data-chart-end]').forEach(input => {
        if (input.dataset.bound === 'true') return;
        input.dataset.bound = 'true';
        input.addEventListener('change', function () {
            const chartName = this.getAttribute('data-chart-end');
            if (!_chartFilters[chartName]) return;
            _chartFilters[chartName].end = this.value || null;
            if (_chartFilters[chartName].mode === 'custom') {
                const cfg = getDashboardConfig();
                const c = cfg.charts.find(x => x.id === chartName);
                if (c) renderChartById(chartName, c.type);
            }
        });
    });
}

function bindChartDownloads() {
    document.querySelectorAll('[data-chart-download]').forEach(btn => {
        if (btn.dataset.bound === 'true') return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const chartId = this.getAttribute('data-chart-download');
            downloadChart(chartId);
        });
    });
}

function downloadChart(chartId) {
    if (_charts[chartId]) {
        try {
            const url = _charts[chartId].toBase64Image('image/png', 1.0);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ssot_${chartId}_${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        } catch (e) {}
    }
    if (_echartsInstances[chartId]) {
        try {
            const url = _echartsInstances[chartId].getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
            const a = document.createElement('a');
            a.href = url;
            a.download = `ssot_${chartId}_${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        } catch (e) {}
    }
}

export function destroyDashboardCharts() {
    Object.keys(_charts).forEach(id => { try { _charts[id].destroy(); } catch (e) {} });
    Object.keys(_echartsInstances).forEach(id => { try { _echartsInstances[id].dispose(); } catch (e) {} });
    _charts = {};
    _echartsInstances = {};
}

export function setupChartDownloads() {}
export function setupChartFilters() {}
export function setupGlobalFilter() {}