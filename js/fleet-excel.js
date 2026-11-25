// ============================================================
// SSOT · FROTA — Cadastro Personalizado + Firebase (v11.0)
// Alterações v11.0:
//  - FEAT: Cards de Viagens com "Origem → Destino" em destaque
//  - FEAT: Cálculo de KM por odômetro (inicial → final)
//  - FEAT: Detecção automática de colunas (origem/destino/odômetros)
//  - FEAT: Campos extras aparecem no rodapé do card de viagem
//  - FIX:  Índice correto da linha com busca/ordenação ativas
//  - (herdado v10.0)
// ============================================================

import {
    ref, onValue, set, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { showNotification, escapeHtml } from './utils.js';
import { sstConfirm, sstAlert } from './dialogs.js';
import { addHistory } from './history.js';
import { initFleetReports } from './fleet-reports.js';

const FLEET_DB  = 'fleet';
const COLS_KEY  = 'ssot_fleet_visible_cols_v3';
const VIEW_KEY  = 'ssot_fleet_view_mode_v1';
const PAGE_SIZE = 50;

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
    importar:       { label: 'Importar/Exportar', icon: 'i-upload',       render: 'import' },
    viagens:        { label: 'Viagens',           icon: 'i-route',        sheetKey: 'percursos',      sheetName: 'Percursos' },
    veiculos:       { label: 'Veículos',          icon: 'i-car',          sheetKey: 'veiculos',       sheetName: 'Veículos' },
    abastecimentos: { label: 'Abastecimentos',    icon: 'i-truck',        sheetKey: 'abastecimentos', sheetName: 'Abastecimentos' },
    servicos:       { label: 'Serviços',          icon: 'i-cog',          sheetKey: 'servicos',       sheetName: 'Serviços' },
    despesas:       { label: 'Despesas',          icon: 'i-file-text',    sheetKey: 'despesas',       sheetName: 'Despesas' },
    leituras:       { label: 'Leituras',          icon: 'i-clock',        sheetKey: 'leituras',       sheetName: 'Leituras' },
    checklist:      { label: 'Checklist',         icon: 'i-check-circle', sheetKey: 'checklist',      sheetName: 'Checklist' },
    relatorios:     { label: 'Relatórios',        icon: 'i-chart-bar',    render: 'reports' }
};

// ============================================================
// ALIASES DE COLUNAS DE VIAGEM (v11.0)
// ============================================================
const VIAGEM_ALIASES = {
    origem:           ['origem', 'origem_viagem', 'partida', 'de', 'local_saida', 'local_de_saida', 'inicio', 'local_partida', 'saida', 'ponto_de_partida'],
    destino:          ['destino', 'destino_viagem', 'para', 'chegada', 'local_chegada', 'local_destino', 'ponto_de_chegada'],
    odometro_inicial: ['odometro_inicial', 'km_inicial', 'km_saida', 'odometro_saida', 'km_ini', 'odometro_de_saida', 'km_inicio', 'odometro_ini', 'km_ini_', 'km_inicial_saida'],
    odometro_final:   ['odometro_final', 'km_final', 'km_chegada', 'km_retorno', 'odometro_chegada', 'km_fim', 'km_termino', 'odometro_fim', 'km_fin', 'km_final_chegada'],
    distancia_km:     ['distancia', 'distancia_km', 'km_percorridos', 'km', 'kms', 'distancia_percorrida', 'km_percorrido'],
    data:             ['data', 'data_viagem', 'data_saida', 'data_de_saida', 'dt', 'data_partida', 'data_do_percurso', 'data_ini'],
    motorista:        ['motorista', 'condutor', 'driver', 'nome_motorista', 'motorista_nome'],
    veiculo:          ['veiculo', 'placa', 'viatura', 'carro', 'veiculo_placa', 'frota'],
    finalidade:       ['finalidade', 'motivo', 'objetivo', 'descricao', 'observacao', 'obs'],
    passageiros:      ['passageiros', 'passageiro', 'qtd_passageiros', 'quantidade_passageiros', 'num_passageiros'],
    setor:            ['setor', 'departamento', 'area', 'unidade', 'centro_custo'],
};

let _db = null;
let _currentUser = null;
let _data = {};
let _visibleCols = {};
let _activeAba = 'viagens';
let _initialized = false;
let _searchTerm = '';
let _page = 0;
let _editingKey = null;
let _editingIndex = -1;
let _searchTimer = null;
let _sortCol = -1;
let _sortDir = 1;
let _unsub = null;
let _firebaseReady = false;
let _viewMode = 'cards';

function openModalSafe(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    if (typeof window.openModal === 'function') {
        try { window.openModal(id); return; } catch (e) {}
    }
    el.classList.add('active');
    el.style.display = 'flex';
}
function closeModalSafe(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof window.closeModal === 'function') {
        try { window.closeModal(id); return; } catch (e) {}
    }
    el.classList.remove('active');
    el.style.display = 'none';
}

export function setFleetExcelContext(db, currentUser) {
    _db = db || null;
    _currentUser = currentUser || null;
}

export function initFleetExcel(target) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initFleetExcel(target), { once: true });
        return;
    }
    const container = findOrCreateMount(target);
    if (!container) { console.error('[FleetExcel] #admin-frota-tab não encontrado.'); return; }

    loadVisibleCols();
    loadViewMode();

    if (!_initialized) { _initialized = true; bindGlobals(); }

    if (!_firebaseReady && _db) {
        subscribeFleet();
        _firebaseReady = true;
    }

    renderActivePanel();
}

function findOrCreateMount(target) {
    let container = target
        ? (typeof target === 'string' ? document.querySelector(target) : target)
        : document.getElementById('admin-frota-tab');
    if (!container) return null;
    if (!document.getElementById('frota-panels')) {
        container.insertAdjacentHTML('beforeend', '<div id="frota-panels"></div>');
    }
    return container;
}

function bindGlobals() {
    window.fleetExcelSwitchTab = switchTab;
    window.fleetExcelSearch    = debounceSearch;
    window.fleetExcelPage      = changePage;
    window.fleetExcelView      = viewRow;
    window.fleetExcelEdit      = editRow;
    window.fleetExcelInsert    = insertRow;
    window.fleetExcelDelete    = deleteRow;
    window.fleetExcelImport    = triggerImport;
    window.fleetExcelExport    = exportFleetExcel;
    window.fleetExcelReset     = resetFleetExcel;
    window.fleetColTogglePanel = toggleColsPanel;
    window.fleetColToggle      = toggleColumn;
    window.fleetColShowAll     = showAllColumns;
    window.fleetColHideAll     = hideAllColumns;
    window.fleetExcelFocusSearch = focusSearch;
    window.fleetExcelSort      = setSort;
    window.fleetExcelSortDir   = setSortDir;
    window.fleetExcelClearSort = clearSort;
    window.fleetExcelSetView   = setViewMode;
}

function subscribeFleet() {
    if (!_db) return;
    if (_unsub) { try { _unsub(); } catch (e) {} }

    _unsub = onValue(ref(_db, FLEET_DB), (snap) => {
        const val = snap.val() || {};
        const newData = {};
        Object.entries(SHEETS_CONFIG).forEach(([name, cfg]) => {
            const sheet = val[cfg.key] || {};
            newData[cfg.key] = {
                headers: toArray(sheet.headers),
                rows: toArray(sheet.rows).map(r => toArray(r))
            };
        });
        _data = newData;
        if (_initialized) renderActivePanel();
    }, (err) => {
        console.error('[FleetExcel] Firebase:', err);
        sstAlert('Não foi possível carregar os dados da frota.', 'Erro de conexão', 'danger');
    });
}

function toArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') {
        return Object.keys(v)
            .filter(k => /^\d+$/.test(k))
            .map(k => parseInt(k))
            .sort((a, b) => a - b)
            .map(k => v[k]);
    }
    return [];
}

function persistSheet(sheetKey) {
    if (!_db) return Promise.resolve();
    const sd = _data[sheetKey];
    if (!sd) return Promise.resolve();
    return set(ref(_db, `${FLEET_DB}/${sheetKey}`), {
        headers: sd.headers || [],
        rows: sd.rows || []
    }).catch(err => console.error('[FleetExcel] persist:', err));
}

function persistAll() {
    if (!_db) return Promise.resolve();
    const payload = {};
    Object.entries(SHEETS_CONFIG).forEach(([name, cfg]) => {
        const sd = _data[cfg.key];
        if (sd) payload[cfg.key] = { headers: sd.headers || [], rows: sd.rows || [] };
    });
    return set(ref(_db, FLEET_DB), payload).catch(err => console.error('[FleetExcel] persistAll:', err));
}

function loadVisibleCols() {
    try { const raw = localStorage.getItem(COLS_KEY); _visibleCols = raw ? JSON.parse(raw) : {}; }
    catch (e) { _visibleCols = {}; }
}
function saveVisibleCols() {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(_visibleCols)); } catch (e) {}
}
function getVisibleIdx(sheetKey, headersLength) {
    if (!_visibleCols[sheetKey] || !Array.isArray(_visibleCols[sheetKey])) {
        return headersLength ? Array.from({ length: headersLength }, (_, i) => i) : [];
    }
    return _visibleCols[sheetKey].filter(i => i >= 0 && i < headersLength);
}

function loadViewMode() {
    try {
        const v = localStorage.getItem(VIEW_KEY);
        if (v === 'cards' || v === 'table') _viewMode = v;
    } catch (e) {}
}
function saveViewMode() {
    try { localStorage.setItem(VIEW_KEY, _viewMode); } catch (e) {}
}
function setViewMode(mode) {
    if (mode !== 'cards' && mode !== 'table') return;
    _viewMode = mode;
    saveViewMode();
    renderActivePanel();
}

function switchTab(key) {
    if (!ABAS[key]) return;
    _activeAba = key;
    _searchTerm = '';
    _page = 0;
    _sortCol = -1;
    _sortDir = 1;
    renderActivePanel();
}

function renderActivePanel() {
    const container = document.getElementById('frota-panels');
    if (!container) return;
    const aba = ABAS[_activeAba];

    if (aba.render === 'import') {
        container.innerHTML = renderImportPanel();
    } else if (aba.render === 'reports') {
        container.innerHTML = '';
        try {
            initFleetReports(container);
        } catch (e) {
            console.error('[FleetExcel] initFleetReports:', e);
            container.innerHTML = `<div class="fleet-empty-state">
                <svg class="si si-3x"><use href="#i-alert"/></svg>
                <h3>Erro ao carregar relatórios</h3>
                <p>Recarregue a página com Ctrl+F5.</p>
            </div>`;
        }
    } else if (aba.sheetKey) {
        container.innerHTML = renderDataPanel(_activeAba, aba);
    }
}

function setSort(abaKey, colIdx) {
    if (colIdx === '' || colIdx === null || colIdx === undefined) { clearSort(); return; }
    const idx = parseInt(colIdx);
    if (isNaN(idx)) return;
    if (_sortCol === idx) _sortDir *= -1;
    else { _sortCol = idx; _sortDir = 1; }
    renderActivePanel();
}
function setSortDir(abaKey, dir) {
    _sortDir = parseInt(dir) === -1 ? -1 : 1;
    renderActivePanel();
}
function clearSort() {
    _sortCol = -1;
    _sortDir = 1;
    renderActivePanel();
}

function detectFieldRole(header, value) {
    const h = String(header || '').toLowerCase();
    const v = String(value || '').trim();

    if (/placa|veiculo|veículo|veiculo\/placa/.test(h)) return 'primary';
    if (/nome|motorista|responsavel|responsável|colaborador/.test(h)) return 'primary';
    if (/data|date/.test(h)) return 'date';
    if (/valor|total|custo|preco|preço/.test(h)) return 'value';
    if (/km|odometro|odômetro|quilometragem/.test(h)) return 'km';
    if (/litro|combustivel|combustível/.test(h)) return 'fuel';

    if (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{2}\/\d{2}\/\d{4}/.test(v)) return 'date';
    if (/^R\$\s?[\d.,]+$/.test(v)) return 'value';

    return 'default';
}

function formatFieldValue(role, value) {
    const s = String(value ?? '').trim();
    if (!s) return '—';
    if (role === 'date') {
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return s;
    }
    if (role === 'value') {
        if (/^R\$/.test(s)) return s;
        const n = parseFloat(s.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
        if (!isNaN(n)) return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return s;
    }
    return s;
}

function truncateValue(v, max = 80) {
    const s = String(v ?? '');
    return s.length > max ? s.slice(0, max) + '…' : s;
}

// ============================================================
// HELPERS DE VIAGEM (v11.0)
// ============================================================
function normalizeHeaderKey(h) {
    return String(h || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function findColIdx(headers, aliases) {
    if (!Array.isArray(headers)) return -1;
    for (let i = 0; i < headers.length; i++) {
        const key = normalizeHeaderKey(headers[i]);
        if (aliases.includes(key)) return i;
    }
    return -1;
}

function getViagemCols(headers) {
    return {
        origem:           findColIdx(headers, VIAGEM_ALIASES.origem),
        destino:          findColIdx(headers, VIAGEM_ALIASES.destino),
        odometro_inicial: findColIdx(headers, VIAGEM_ALIASES.odometro_inicial),
        odometro_final:   findColIdx(headers, VIAGEM_ALIASES.odometro_final),
        distancia_km:     findColIdx(headers, VIAGEM_ALIASES.distancia_km),
        data:             findColIdx(headers, VIAGEM_ALIASES.data),
        motorista:        findColIdx(headers, VIAGEM_ALIASES.motorista),
        veiculo:          findColIdx(headers, VIAGEM_ALIASES.veiculo),
        finalidade:       findColIdx(headers, VIAGEM_ALIASES.finalidade),
        passageiros:      findColIdx(headers, VIAGEM_ALIASES.passageiros),
        setor:            findColIdx(headers, VIAGEM_ALIASES.setor),
    };
}

function parseNumeric(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const s = String(v).trim();
    if (!s) return null;
    const cleaned = s.replace(/[^\d,.\-]/g, '');
    if (!cleaned) return null;
    let num;
    if (cleaned.includes(',')) {
        num = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
        num = cleaned;
    }
    const n = parseFloat(num);
    return isNaN(n) ? null : n;
}

function computeKm(cols, row) {
    const ini = cols.odometro_inicial >= 0 ? parseNumeric(row[cols.odometro_inicial]) : null;
    const fin = cols.odometro_final   >= 0 ? parseNumeric(row[cols.odometro_final])   : null;
    const dist = cols.distancia_km    >= 0 ? parseNumeric(row[cols.distancia_km])     : null;

    if (dist !== null && dist >= 0) {
        return { total: dist, inicial: ini, final: fin, source: 'distancia' };
    }
    if (ini !== null && fin !== null) {
        if (fin >= ini) return { total: fin - ini, inicial: ini, final: fin, source: 'odometro' };
        return { total: null, inicial: ini, final: fin, source: 'invalido' };
    }
    return { total: null, inicial: ini, final: fin, source: 'incompleto' };
}

function formatKmNumber(n) {
    if (n === null || n === undefined) return '—';
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function formatKm(n) {
    if (n === null || n === undefined) return '—';
    return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function isViagensSheet(aba) {
    return aba && (aba.sheetKey === 'percursos' || aba.label === 'Viagens');
}

// ============================================================
// PAINEL IMPORTAR / EXPORTAR
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
                    <h2>Importar / Exportar</h2>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-primary btn-sm" onclick="window.fleetExcelImport()">
                        <svg class="si"><use href="#i-upload"/></svg> Importar Excel
                    </button>
                    <button class="btn btn-success btn-sm" onclick="window.fleetExcelExport()" ${!hasData ? 'disabled' : ''}>
                        <svg class="si"><use href="#i-download"/></svg> Exportar
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.fleetExcelReset()" ${!hasData ? 'disabled' : ''}>
                        <svg class="si"><use href="#i-broom"/></svg> Zerar
                    </button>
                </div>
            </div>
            <div class="card-body">
                <input type="file" id="fleet-file-input" accept=".xlsx,.xls" hidden>
                <div class="alert alert-info" style="margin-bottom:14px;font-size:0.85rem;display:flex;gap:8px;align-items:flex-start;">
                    <svg class="si" style="flex-shrink:0;margin-top:2px;"><use href="#i-info"/></svg>
                    <span>Os dados são salvos automaticamente no banco e sincronizados em todos os dispositivos em tempo real.</span>
                </div>
                ${hasData
                    ? `<div class="fleet-import-summary">
                        <div class="fleet-import-stat">
                            <div class="fleet-import-stat-value">${total}</div>
                            <div class="fleet-import-stat-label">Registros</div>
                        </div>
                        <div class="fleet-import-stat">
                            <div class="fleet-import-stat-value">${Object.keys(SHEETS_CONFIG).length}</div>
                            <div class="fleet-import-stat-label">Abas</div>
                        </div>
                        <div class="fleet-import-stat">
                            <div class="fleet-import-stat-value" style="color:#27ae60;">✓</div>
                            <div class="fleet-import-stat-label">Sincronizado</div>
                        </div>
                       </div>`
                    : `<div class="fleet-empty-state">
                        <svg class="si si-3x"><use href="#i-file-excel"/></svg>
                        <h3>Nenhum arquivo importado</h3>
                        <p>Clique em <strong>"Importar Excel"</strong> para carregar o arquivo.<br>
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

function renderDataPanel(key, aba) {
    const sheetData = _data[aba.sheetKey] || { headers: [], rows: [] };
    const headers = sheetData.headers || [];
    const rows = sheetData.rows || [];
    const hasHeaders = headers.length > 0;

    // ⬇️ FIX v11.0: carrega cada linha com seu índice ORIGINAL,
    // para que editar/excluir/ver funcionem mesmo com filtros ativos.
    let filtered = rows.map((row, origIdx) => ({ row, origIdx }));

    if (_searchTerm.trim()) {
        const s = _searchTerm.toLowerCase();
        filtered = filtered.filter(item =>
            (item.row || []).some(c => String(c ?? '').toLowerCase().includes(s))
        );
    }

    if (_sortCol >= 0 && _sortCol < headers.length) {
        filtered.sort((a, b) => {
            const va = String(a.row[_sortCol] ?? '').toLowerCase();
            const vb = String(b.row[_sortCol] ?? '').toLowerCase();
            if (va < vb) return -_sortDir;
            if (va > vb) return _sortDir;
            return 0;
        });
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (_page >= totalPages) _page = 0;
    const start = _page * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    const visibleIdx = getVisibleIdx(aba.sheetKey, headers.length);
    const colsToShow = visibleIdx.length > 0 ? visibleIdx : headers.map((_, i) => i);

    const colsMenu = headers.map((h, i) => `
        <label class="fleet-col-check ${colsToShow.includes(i) ? 'checked' : ''}">
            <input type="checkbox" ${colsToShow.includes(i) ? 'checked' : ''}
                   onchange="window.fleetColToggle('${key}', ${i}, this.checked)">
            <span>${escapeHtml(h) || '(sem nome)'}</span>
        </label>
    `).join('');

    const sortOptions = headers.map((h, i) =>
        `<option value="${i}" ${_sortCol === i ? 'selected' : ''}>${escapeHtml(h) || '(sem nome)'}</option>`
    ).join('');

    const sortActive = _sortCol >= 0;
    const sortDirLabel = _sortDir === 1 ? '↑ Asc' : '↓ Desc';

    return `
        <div class="card card-elevated">
            <div class="card-header">
                <div class="card-header-title">
                    <svg class="si si-fw"><use href="#${aba.icon}"/></svg>
                    <h2>${escapeHtml(aba.label)}</h2>
                    <span class="card-header-count">${hasHeaders ? total : 0}</span>
                </div>
                <div class="action-buttons fleet-toolbar">
                    <div class="fleet-view-toggle">
                        <button class="btn btn-sm ${_viewMode === 'cards' ? 'btn-primary' : 'btn-secondary'}"
                                onclick="window.fleetExcelSetView('cards')" title="Cards">
                            <svg class="si"><use href="#i-image"/></svg> Cards
                        </button>
                        <button class="btn btn-sm ${_viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}"
                                onclick="window.fleetExcelSetView('table')" title="Tabela">
                            <svg class="si"><use href="#i-file-text"/></svg> Tabela
                        </button>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="window.fleetColTogglePanel()"
                            ${!hasHeaders ? 'disabled title="Importe dados primeiro"' : ''}>
                        <svg class="si"><use href="#i-filter"/></svg> Filtrar
                    </button>
                    <button class="btn btn-success btn-sm" onclick="window.fleetExcelInsert('${key}')"
                            ${!hasHeaders ? 'disabled title="Importe dados primeiro"' : ''}>
                        <svg class="si"><use href="#i-plus-circle"/></svg> Adicionar
                    </button>
                </div>
            </div>
            <div class="card-body">

                ${hasHeaders ? `
                <div class="fleet-cols-panel hidden" id="fleet-cols-panel">
                    <div class="fleet-cols-header">
                        <strong>Filtrar colunas visíveis</strong>
                        <div class="action-buttons">
                            <button class="btn btn-secondary btn-sm" onclick="window.fleetColShowAll('${key}')">Mostrar todas</button>
                            <button class="btn btn-secondary btn-sm" onclick="window.fleetColHideAll('${key}')">Ocultar todas</button>
                        </div>
                    </div>
                    <div class="fleet-cols-list">${colsMenu}</div>
                </div>

                <div class="filter-bar">
                    <div class="filter-search">
                        <svg class="si si-fw"><use href="#i-search"/></svg>
                        <input type="text" id="fleet-search-input" class="form-control"
                               placeholder="Pesquisar em ${escapeHtml(aba.sheetName)}..."
                               value="${escapeHtml(_searchTerm)}"
                               oninput="window.fleetExcelSearch(this.value)">
                    </div>
                    <select class="form-control filter-select" style="min-width:180px;" onchange="window.fleetExcelSort('${key}', this.value)">
                        <option value="">Ordenar por...</option>
                        ${sortOptions}
                    </select>
                    ${sortActive ? `
                        <button class="btn btn-primary btn-sm" onclick="window.fleetExcelSortDir('${key}', ${_sortDir === 1 ? -1 : 1})"
                                title="Alternar direção">
                            ${sortDirLabel}
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="window.fleetExcelClearSort('${key}')"
                                title="Limpar ordenação">
                            ✕
                        </button>
                    ` : ''}
                </div>
                ` : ''}

                ${!hasHeaders
                    ? `<div class="fleet-empty-state">
                        <svg class="si si-3x"><use href="#${aba.icon}"/></svg>
                        <h3>Nenhum dado em "${escapeHtml(aba.sheetName)}"</h3>
                        <p>Importe um arquivo Excel para começar.</p>
                       </div>`
                    : total === 0
                    ? `<div class="fleet-empty-state">
                        <svg class="si si-3x"><use href="#${aba.icon}"/></svg>
                        <h3>Nenhum registro</h3>
                        <p>${_searchTerm ? 'Nenhum resultado para a busca.' : 'Clique em <strong>Adicionar</strong> para incluir o primeiro registro.'}</p>
                       </div>`
                    : _viewMode === 'cards'
                        ? renderCardsView(key, aba, headers, pageItems, colsToShow)
                        : renderTableView(key, aba, headers, pageItems, colsToShow)
                }

                ${(totalPages > 1 && hasHeaders && total > 0) ? `
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
            </div>
        </div>
    `;
}

// ============================================================
// CARDS VIEW — dispatcher (detecta viagens e usa renderizador próprio)
// ============================================================
function renderCardsView(key, aba, headers, pageItems, colsToShow) {
    // v11.0: viagens tem card próprio com Origem → Destino + KM
    if (isViagensSheet(aba)) {
        const cols = getViagemCols(headers);
        if (cols.origem >= 0 || cols.destino >= 0 || cols.odometro_inicial >= 0 || cols.odometro_final >= 0) {
            return renderViagensGrid(key, headers, pageItems, colsToShow, cols);
        }
    }
    return renderGenericCards(key, headers, pageItems, colsToShow);
}

// ============================================================
// ✨ CARDS DE VIAGEM (v11.0)
// ============================================================
function renderViagensGrid(key, headers, pageItems, colsToShow, cols) {
    return `
        <div class="viagens-grid">
            ${pageItems.map(item => renderViagemCard(key, item.row, item.origIdx, headers, colsToShow, cols)).join('')}
        </div>
    `;
}

function renderViagemCard(key, row, realIndex, headers, colsToShow, cols) {
    const origem  = cols.origem  >= 0 ? String(row[cols.origem]  ?? '').trim() : '';
    const destino = cols.destino >= 0 ? String(row[cols.destino] ?? '').trim() : '';
    const km = computeKm(cols, row);

    const data       = cols.data       >= 0 ? formatFieldValue('date', row[cols.data])            : '';
    const motorista  = cols.motorista  >= 0 ? String(row[cols.motorista]  ?? '').trim()           : '';
    const veiculo    = cols.veiculo    >= 0 ? String(row[cols.veiculo]    ?? '').trim()           : '';
    const finalidade = cols.finalidade >= 0 ? String(row[cols.finalidade] ?? '').trim()           : '';
    const passageiros= cols.passageiros>= 0 ? String(row[cols.passageiros]?? '').trim()           : '';
    const setor      = cols.setor      >= 0 ? String(row[cols.setor]      ?? '').trim()           : '';

    // ---- Cabeçalho: Origem → Destino ----
    const rotaHtml = (origem || destino) ? `
        <div class="viagem-rota">
            <span class="viagem-origem" title="${escapeHtml(origem)}">${escapeHtml(origem || '—')}</span>
            <span class="viagem-arrow" aria-hidden="true">→</span>
            <span class="viagem-destino" title="${escapeHtml(destino)}">${escapeHtml(destino || '—')}</span>
        </div>
    ` : `<div class="viagem-rota viagem-rota-empty">Sem origem/destino informados</div>`;

    // ---- Bloco de KM ----
    let kmBlock = '';
    if (km.total !== null) {
        const odoHtml = (km.inicial !== null && km.final !== null) ? `
            <div class="viagem-km-odometro">
                <span>${formatKmNumber(km.inicial)}</span>
                <span class="viagem-km-arrow">→</span>
                <span>${formatKmNumber(km.final)}</span>
            </div>
        ` : '';
        kmBlock = `
            <div class="viagem-km-block">
                <div class="viagem-km-total">
                    <svg class="si"><use href="#i-route"/></svg>
                    <strong>${formatKm(km.total)}</strong>
                    <span class="viagem-km-label">percorridos</span>
                </div>
                ${odoHtml}
            </div>
        `;
    } else if (km.source === 'invalido') {
        kmBlock = `
            <div class="viagem-km-block viagem-km-incomplete" title="Odômetro final menor que inicial">
                <svg class="si"><use href="#i-alert"/></svg>
                <span>Odômetro inválido (final &lt; inicial)</span>
            </div>
        `;
    } else if (km.inicial !== null || km.final !== null) {
        kmBlock = `
            <div class="viagem-km-block viagem-km-incomplete">
                <svg class="si"><use href="#i-clock"/></svg>
                <span>Odômetro incompleto</span>
            </div>
        `;
    }

    // ---- Meta (data, motorista, veículo, passageiros, setor) ----
    const metaItems = [];
    if (data)        metaItems.push({ label: '📅', text: data });
    if (motorista)   metaItems.push({ label: '👤', text: motorista });
    if (veiculo)     metaItems.push({ label: '🚗', text: veiculo });
    if (passageiros) metaItems.push({ label: '👥', text: passageiros });
    if (setor)       metaItems.push({ label: '🏢', text: setor });

    const metaHtml = metaItems.length ? `
        <div class="viagem-meta">
            ${metaItems.map(m => `
                <span class="viagem-meta-item" title="${escapeHtml(m.text)}">
                    <span class="viagem-meta-emoji">${m.label}</span>
                    <span class="viagem-meta-text">${escapeHtml(m.text)}</span>
                </span>
            `).join('')}
        </div>
    ` : '';

    // ---- Finalidade ----
    const finalidadeHtml = finalidade ? `
        <div class="viagem-finalidade" title="${escapeHtml(finalidade)}">
            ${escapeHtml(truncateValue(finalidade, 120))}
        </div>
    ` : '';

    // ---- Campos extras (colunas não mapeadas) ----
    const usedCols = new Set([
        cols.origem, cols.destino, cols.odometro_inicial, cols.odometro_final,
        cols.distancia_km, cols.data, cols.motorista, cols.veiculo, cols.finalidade,
        cols.passageiros, cols.setor
    ].filter(i => i >= 0));

    const extraCols = colsToShow.filter(i => !usedCols.has(i));
    const extraHtml = extraCols.length ? `
        <div class="viagem-extra">
            ${extraCols.map(i => {
                const raw = String(row[i] ?? '').trim();
                if (!raw) return '';
                const role = detectFieldRole(headers[i], raw);
                return `
                    <div class="viagem-extra-item">
                        <div class="viagem-extra-label">${escapeHtml(headers[i])}</div>
                        <div class="viagem-extra-value">${escapeHtml(formatFieldValue(role, raw))}</div>
                    </div>
                `;
            }).filter(Boolean).join('')}
        </div>
    ` : '';

    return `
        <div class="viagem-card">
            <div class="viagem-card-header">
                <div class="viagem-card-header-left">
                    ${rotaHtml}
                </div>
                <div class="viagem-card-actions">
                    <button class="btn btn-primary btn-sm" title="Ver" onclick="window.fleetExcelView('${key}', ${realIndex})">
                        <svg class="si"><use href="#i-eye"/></svg>
                    </button>
                    <button class="btn btn-warning btn-sm" title="Editar" onclick="window.fleetExcelEdit('${key}', ${realIndex})">
                        <svg class="si"><use href="#i-edit"/></svg>
                    </button>
                    <button class="btn btn-danger btn-sm" title="Excluir" onclick="window.fleetExcelDelete('${key}', ${realIndex})">
                        <svg class="si"><use href="#i-trash"/></svg>
                    </button>
                </div>
            </div>
            ${kmBlock}
            ${metaHtml}
            ${finalidadeHtml}
            ${extraHtml}
        </div>
    `;
}

// ============================================================
// CARDS GENÉRICOS (demais abas)
// ============================================================
function renderGenericCards(key, headers, pageItems, colsToShow) {
    return `
        <div class="fleet-card-grid">
            ${pageItems.map((item) => {
                const row = item.row;
                const realIndex = item.origIdx;
                const fields = colsToShow.map(j => ({
                    idx: j,
                    header: headers[j],
                    value: row[j] ?? '',
                    role: detectFieldRole(headers[j], row[j])
                }));

                const primaries = fields.filter(f => f.role === 'primary').slice(0, 2);
                const metas = fields.filter(f => ['date', 'value'].includes(f.role)).slice(0, 3);
                const usedIdxs = new Set([...primaries.map(f => f.idx), ...metas.map(f => f.idx)]);
                const bodyFields = fields.filter(f => !usedIdxs.has(f.idx));

                const titleText = primaries.length > 0
                    ? primaries.map(f => formatFieldValue(f.role, f.value)).join(' · ')
                    : (fields[0] ? formatFieldValue(fields[0].role, fields[0].value) : '—');

                return `
                    <div class="fleet-card-item">
                        <div class="fleet-card-header">
                            <div class="fleet-card-title" title="${escapeHtml(titleText)}">
                                ${escapeHtml(truncateValue(titleText, 60))}
                            </div>
                            <div class="fleet-card-actions">
                                <button class="btn btn-primary btn-sm" title="Ver" onclick="window.fleetExcelView('${key}', ${realIndex})">
                                    <svg class="si"><use href="#i-eye"/></svg>
                                </button>
                                <button class="btn btn-warning btn-sm" title="Editar" onclick="window.fleetExcelEdit('${key}', ${realIndex})">
                                    <svg class="si"><use href="#i-edit"/></svg>
                                </button>
                                <button class="btn btn-danger btn-sm" title="Excluir" onclick="window.fleetExcelDelete('${key}', ${realIndex})">
                                    <svg class="si"><use href="#i-trash"/></svg>
                                </button>
                            </div>
                        </div>

                        ${metas.length > 0 ? `
                            <div class="fleet-card-meta">
                                ${metas.map(f => `
                                    <span class="fleet-card-meta-item">
                                        <span class="fleet-card-meta-label">${escapeHtml(f.header)}:</span>
                                        <span class="fleet-card-meta-value">${escapeHtml(formatFieldValue(f.role, f.value))}</span>
                                    </span>
                                `).join('')}
                            </div>
                        ` : ''}

                        ${bodyFields.length > 0 ? `
                            <div class="fleet-card-body">
                                ${bodyFields.map(f => `
                                    <div class="fleet-card-field">
                                        <div class="fleet-card-field-label">${escapeHtml(f.header)}</div>
                                        <div class="fleet-card-field-value">${escapeHtml(formatFieldValue(f.role, f.value)) || '—'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ============================================================
// TABLE VIEW
// ============================================================
function renderTableView(key, aba, headers, pageItems, colsToShow) {
    return `
        <div class="frota-table-container">
            <table class="frota-data-table">
                <thead>
                    <tr>
                        ${colsToShow.map(i => `<th>${escapeHtml(headers[i])}</th>`).join('')}
                        <th class="fleet-actions-col">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${pageItems.map(item => {
                        const row = item.row;
                        const realIndex = item.origIdx;
                        return `
                            <tr>
                                ${colsToShow.map(j => {
                                    const raw = row[j] ?? '';
                                    const role = detectFieldRole(headers[j], raw);
                                    const display = formatFieldValue(role, raw);
                                    const short = String(display).length > 60
                                        ? String(display).slice(0, 60) + '…'
                                        : display;
                                    return `<td title="${escapeHtml(raw)}">${escapeHtml(short)}</td>`;
                                }).join('')}
                                <td class="fleet-actions-col">
                                    <div class="fleet-row-actions">
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
    `;
}

function focusSearch() {
    const input = document.getElementById('fleet-search-input');
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        showNotification('Pesquisa', 'Importe dados primeiro para habilitar a busca.', 'warning');
    }
}

function toggleColsPanel() {
    document.getElementById('fleet-cols-panel')?.classList.toggle('hidden');
}

function toggleColumn(abaKey, idx, checked) {
    const aba = ABAS[abaKey]; if (!aba?.sheetKey) return;
    const headers = _data[aba.sheetKey]?.headers || [];
    const all = Array.from({ length: headers.length }, (_, i) => i);
    let cur = getVisibleIdx(aba.sheetKey, headers.length);
    if (cur.length === 0) cur = all.slice();
    if (checked) { if (!cur.includes(idx)) cur.push(idx); }
    else { cur = cur.filter(i => i !== idx); }
    cur.sort((a, b) => a - b);
    _visibleCols[aba.sheetKey] = cur;
    saveVisibleCols();
    renderActivePanel();
    document.getElementById('fleet-cols-panel')?.classList.remove('hidden');
}
function showAllColumns(abaKey) {
    const aba = ABAS[abaKey]; if (!aba?.sheetKey) return;
    const headers = _data[aba.sheetKey]?.headers || [];
    _visibleCols[aba.sheetKey] = Array.from({ length: headers.length }, (_, i) => i);
    saveVisibleCols();
    renderActivePanel();
    document.getElementById('fleet-cols-panel')?.classList.remove('hidden');
}
function hideAllColumns(abaKey) {
    const aba = ABAS[abaKey]; if (!aba?.sheetKey) return;
    _visibleCols[aba.sheetKey] = [0];
    saveVisibleCols();
    renderActivePanel();
    document.getElementById('fleet-cols-panel')?.classList.remove('hidden');
}

function debounceSearch(value) {
    _searchTerm = value || '';
    _page = 0;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
        renderActivePanel();
        const input = document.getElementById('fleet-search-input');
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
}

function viewRow(abaKey, index) {
    const aba = ABAS[abaKey];
    const sheetData = _data[aba.sheetKey];
    const row = sheetData?.rows?.[index]; if (!row) return;
    const headers = sheetData.headers || [];
    const title = document.getElementById('fleet-view-title');
    if (title) title.textContent = `Visualizar — ${aba.label}`;
    const content = document.getElementById('fleet-view-content');
    if (content) {
        content.innerHTML = `<div class="fleet-view-grid">` +
            headers.map((h, i) => {
                const role = detectFieldRole(h, row[i]);
                return `
                <div class="fleet-view-item">
                    <div class="fleet-view-label">${escapeHtml(h)}</div>
                    <div class="fleet-view-value">${escapeHtml(formatFieldValue(role, row[i])) || '—'}</div>
                </div>
            `; }).join('') + `</div>`;
    }
    openModalSafe('fleet-view-modal');
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
        sstAlert('Importe um arquivo primeiro.', 'Aba vazia', 'warning');
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
        const role = detectFieldRole(h, value);
        let inputType = 'text';
        if (role === 'date') inputType = 'date';
        if (role === 'km' || role === 'fuel') inputType = 'number';

        let inputValue = value;
        if (role === 'date') {
            const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) inputValue = `${m[1]}-${m[2]}-${m[3]}`;
            else {
                const dm = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
                if (dm) inputValue = `${dm[3]}-${dm[2]}-${dm[1]}`;
            }
        }

        return `<div class="form-group">
            <label for="${fieldId}">${escapeHtml(h)}</label>
            <input type="${inputType}" class="form-control" id="${fieldId}" value="${escapeHtml(inputValue)}">
        </div>`;
    }).join('');
    const form = document.getElementById('fleet-crud-form');
    if (form && !form.dataset.bound) {
        form.dataset.bound = 'true';
        form.addEventListener('submit', handleCrudSubmit);
    }
    openModalSafe('fleet-crud-modal');
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
        const role = detectFieldRole(h, input.value);
        if (role === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(input.value)) {
            const [y, m, d] = input.value.split('-');
            return `${d}/${m}/${y}`;
        }
        return input.value;
    });

    if (_editingIndex >= 0) {
        sheetData.rows[_editingIndex] = newRow;
        showNotification('Atualizado', 'Registro atualizado.', 'success');
        addHistory('Frota Edição', '-', `${aba.label} editado`).catch(() => {});
    } else {
        sheetData.rows.push(newRow);
        showNotification('Adicionado', 'Novo registro incluído.', 'success');
        addHistory('Frota Inclusão', '-', `${aba.label} incluído`).catch(() => {});
    }

    await persistSheet(aba.sheetKey);
    closeModalSafe('fleet-crud-modal');
    _editingKey = null;
    _editingIndex = -1;
    renderActivePanel();
}

async function deleteRow(abaKey, index) {
    const aba = ABAS[abaKey];
    const sheetData = _data[aba.sheetKey];
    const row = sheetData?.rows?.[index]; if (!row) return;
    const firstCell = row[0] ?? 'registro';
    const ok = await sstConfirm(`Excluir o registro "${firstCell}" de ${aba.label}?`, 'Confirmar exclusão', 'danger');
    if (!ok) return;

    sheetData.rows.splice(index, 1);
    await persistSheet(aba.sheetKey);
    showNotification('Excluído', 'Registro removido.', 'success');
    addHistory('Frota Exclusão', '-', `${aba.label} removido`).catch(() => {});
    renderActivePanel();
}

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
    const file = e.target.files?.[0]; if (!file) return;
    if (typeof window.XLSX === 'undefined') {
        sstAlert('Biblioteca XLSX não carregada. Recarregue a página.', 'Erro', 'danger');
        return;
    }
    try {
        showNotification('Processando', `Lendo "${file.name}"...`, 'info');
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: true });
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
            const parsed = window.XLSX.utils.sheet_to_json(sheet, {
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
        _visibleCols = {};
        saveVisibleCols();

        await persistAll();

        showNotification('Importado', `${totalRows} registro(s) salvos no banco.`, 'success');
        addHistory('Frota Importação', '-', `${totalRows} registros de ${file.name}`).catch(() => {});

        if (notFound.length > 0) {
            sstAlert(`Abas não encontradas: ${notFound.join(', ')}`, 'Aviso', 'warning');
        }

        const firstWithData = Object.entries(ABAS).find(
            ([k, a]) => a.sheetKey && (newData[a.sheetKey]?.rows?.length || 0) > 0
        );
        if (firstWithData) _activeAba = firstWithData[0];
        renderActivePanel();
    } catch (err) {
        console.error('[FleetExcel] Import error:', err);
        sstAlert(`Erro ao importar: ${err.message}`, 'Falha', 'danger');
    } finally {
        e.target.value = '';
    }
}

function normalizeName(name) {
    return String(name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();
}

async function exportFleetExcel() {
    const total = Object.values(_data).reduce((s, d) => s + (d?.rows?.length || 0), 0);
    if (total === 0) {
        sstAlert('Não há dados para exportar.', 'Vazio', 'warning');
        return;
    }
    if (typeof window.XLSX === 'undefined') {
        sstAlert('Biblioteca XLSX não carregada.', 'Erro', 'danger');
        return;
    }
    try {
        const wb = window.XLSX.utils.book_new();
        for (const [sheetName, cfg] of Object.entries(SHEETS_CONFIG)) {
            const sd = _data[cfg.key];
            if (!sd || !sd.headers?.length) continue;
            const aoa = [sd.headers, ...sd.rows];
            const ws = window.XLSX.utils.aoa_to_sheet(aoa);
            window.XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
        }
        const fileName = `frota_ssot_${new Date().toISOString().slice(0, 10)}.xlsx`;
        window.XLSX.writeFile(wb, fileName);
        showNotification('Exportado', fileName, 'success');
        addHistory('Frota Exportação', '-', fileName).catch(() => {});
    } catch (err) {
        sstAlert(`Erro ao exportar: ${err.message}`, 'Erro', 'danger');
    }
}

async function resetFleetExcel() {
    const ok = await sstConfirm(
        'Zerar TODOS os dados da frota NO BANCO? Esta ação é sincronizada com todos os dispositivos e não pode ser desfeita.',
        'Zerar dados da frota',
        'danger'
    );
    if (!ok) return;

    _data = {};
    _visibleCols = {};
    _activeAba = 'viagens';
    _searchTerm = '';
    _page = 0;
    _sortCol = -1;
    _sortDir = 1;
    try { localStorage.removeItem(COLS_KEY); } catch (e) {}

    if (_db) {
        try { await remove(ref(_db, FLEET_DB)); } catch (e) {}
    }

    showNotification('Zerado', 'Dados da frota removidos do banco.', 'success');
    addHistory('Frota Reset', '-', 'Dados zerados').catch(() => {});
    renderActivePanel();
}

Object.defineProperty(window, '_fleetDataForCharts', {
    get: () => _data,
    configurable: true
});
