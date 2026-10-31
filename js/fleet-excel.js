// ============================================================
// SSOT · FROTA EXCEL — v5.0 (FINAL · estável · testado)
// Integrado com utils.js / dialogs.js / history.js / main.js
// ============================================================

import { showNotification, escapeHtml } from './utils.js';
import { sstConfirm, sstAlert } from './dialogs.js';
import { addHistory } from './history.js';

// ---- Constantes ----
const STORAGE_KEY = 'ssot_fleet_excel_v1';
const COLS_KEY    = 'ssot_fleet_visible_cols_v1';
const PAGE_SIZE   = 100;

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
    checklist:      { label: 'Checklist',         icon: 'i-check-circle', sheetKey: 'checklist',      sheetName: 'Checklist' }
};

// ---- Estado interno ----
let _currentUser   = null;
let _data          = {};
let _visibleCols   = {};
let _activeAba     = 'importar';
let _initialized   = false;
let _searchTerm    = '';
let _page          = 0;
let _editingKey    = null;
let _editingIndex  = -1;
let _searchTimer   = null;

// ============================================================
// HELPERS DE MODAL (compatível com main.js + fallback)
// ============================================================
function openModalSafe(id) {
    const el = document.getElementById(id);
    if (!el) { console.warn('[FleetExcel] modal ausente:', id); return; }
    // Remove 'hidden' (a classe 'hidden' no seu CSS tem display:none !important)
    el.classList.remove('hidden');
    // Usa o openModal do main.js se existir
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

// ============================================================
// CONTEXTO + INIT
// ============================================================
export function setFleetExcelContext(db, currentUser) {
    _currentUser = currentUser || null;
}

export function initFleetExcel(target) {
    // Se ainda não há DOM, espera
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initFleetExcel(target), { once: true });
        return;
    }

    const container = findOrCreateMount(target);
    if (!container) {
        console.error('[FleetExcel] Nenhum container encontrado. Verifique se #admin-frota-tab contém <div id="frota-subtabs"></div> e <div id="frota-panels"></div>');
        return;
    }

    loadFromStorage();
    loadVisibleCols();

    if (!_initialized) {
        _initialized = true;
        bindGlobals();
    }

    renderSubTabs();
    renderActivePanel();
    updateStats();
}

function findOrCreateMount(target) {
    let container = null;

    if (target) {
        container = typeof target === 'string'
            ? document.querySelector(target)
            : target;
        if (!container) {
            console.error(`[FleetExcel] Container "${target}" não encontrado.`);
            return null;
        }
    }

    if (!container) {
        // Preferência: #admin-frota-tab (sua estrutura)
        container = document.getElementById('admin-frota-tab');
    }
    if (!container) {
        container = document.getElementById('frota-panels')?.parentElement;
    }

    if (!container) return null;

    // Cria os containers internos se ainda não existirem
    if (!document.getElementById('frota-subtabs')) {
        container.insertAdjacentHTML('afterbegin', '<div class="tabs-inner frota-subtabs" id="frota-subtabs"></div>');
    }
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
}

// ============================================================
// COLUNAS VISÍVEIS
// ============================================================
function loadVisibleCols() {
    try {
        const raw = localStorage.getItem(COLS_KEY);
        _visibleCols = raw ? JSON.parse(raw) : {};
    } catch (e) { _visibleCols = {}; }
}

function saveVisibleCols() {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(_visibleCols)); } catch (e) {}
}

function getVisibleIdx(sheetKey, headersLength) {
    if (!_visibleCols[sheetKey] || !Array.isArray(_visibleCols[sheetKey])) {
        return headersLength
            ? Array.from({ length: headersLength }, (_, i) => i)
            : [];
    }
    return _visibleCols[sheetKey].filter(i => i >= 0 && i < headersLength);
}

// ============================================================
// SUB-TABS + PAINEL ATIVO
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
    if (aba.render === 'import') {
        container.innerHTML = renderImportPanel();
    } else if (aba.sheetKey) {
        container.innerHTML = renderDataPanel(_activeAba, aba);
    }
}

// ============================================================
// PAINEL — IMPORTAR / EXPORTAR
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

// ============================================================
// PAINEL — DADOS (tabela + colunas + paginação)
// ============================================================
function renderDataPanel(key, aba) {
    const sheetData = _data[aba.sheetKey] || { headers: [], rows: [] };
    const headers = sheetData.headers || [];
    const rows = sheetData.rows || [];

    if (headers.length === 0) {
        return `
            <div class="card card-elevated">
                <div class="card-header">
                    <div class="card-header-title">
                        <svg class="si si-fw"><use href="#${aba.icon}"/></svg>
                        <h2>${escapeHtml(aba.label)}</h2>
                    </div>
                </div>
                <div class="card-body">
                    <div class="fleet-empty-state">
                        <svg class="si si-3x"><use href="#${aba.icon}"/></svg>
                        <h3>Nenhum dado em "${escapeHtml(aba.sheetName)}"</h3>
                        <p>Importe um arquivo para começar.</p>
                    </div>
                </div>
            </div>
        `;
    }

    const visibleIdx = getVisibleIdx(aba.sheetKey, headers.length);
    const colsToShow = visibleIdx.length > 0 ? visibleIdx : headers.map((_, i) => i);

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

    const colsMenu = headers.map((h, i) => `
        <label class="fleet-col-check ${colsToShow.includes(i) ? 'checked' : ''}">
            <input type="checkbox" ${colsToShow.includes(i) ? 'checked' : ''}
                   onchange="window.fleetColToggle('${key}', ${i}, this.checked)">
            <span>${escapeHtml(h) || '(sem nome)'}</span>
        </label>
    `).join('');

    return `
        <div class="card card-elevated">
            <div class="card-header">
                <div class="card-header-title">
                    <svg class="si si-fw"><use href="#${aba.icon}"/></svg>
                    <h2>${escapeHtml(aba.label)}</h2>
                    <span class="card-header-count">${total}</span>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-sm" onclick="window.fleetColTogglePanel()">
                        <svg class="si"><use href="#i-filter"/></svg> Colunas
                    </button>
                    <button class="btn btn-success btn-sm" onclick="window.fleetExcelInsert('${key}')">
                        <svg class="si"><use href="#i-plus-circle"/></svg> Incluir
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="fleet-cols-panel hidden" id="fleet-cols-panel">
                    <div class="fleet-cols-header">
                        <strong>Colunas visíveis</strong>
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
                        <input type="text" class="form-control"
                               placeholder="Pesquisar em ${escapeHtml(aba.sheetName)}..."
                               value="${escapeHtml(_searchTerm)}"
                               oninput="window.fleetExcelSearch(this.value)">
                    </div>
                </div>

                ${total === 0
                    ? `<div class="fleet-empty-state">
                        <svg class="si si-3x"><use href="#${aba.icon}"/></svg>
                        <h3>Nenhum registro</h3>
                        <p>${_searchTerm ? 'Nenhum resultado para a busca.' : 'Clique em <strong>Incluir</strong> para adicionar.'}</p>
                       </div>`
                    : `
                <div class="frota-table-container">
                    <table class="frota-data-table">
                        <thead>
                            <tr>
                                ${colsToShow.map(i => `<th>${escapeHtml(headers[i])}</th>`).join('')}
                                <th class="fleet-actions-col">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageRows.map((row, i) => {
                                const realIndex = start + i;
                                return `
                                    <tr>
                                        ${colsToShow.map(j => {
                                            const raw = row[j] ?? '';
                                            const short = String(raw).length > 60
                                                ? String(raw).slice(0, 60) + '…'
                                                : raw;
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
// CONTROLE DE COLUNAS
// ============================================================
function toggleColsPanel() {
    document.getElementById('fleet-cols-panel')?.classList.toggle('hidden');
}

function toggleColumn(abaKey, idx, checked) {
    const aba = ABAS[abaKey];
    if (!aba || !aba.sheetKey) return;

    const headers = _data[aba.sheetKey]?.headers || [];
    const all = Array.from({ length: headers.length }, (_, i) => i);
    let cur = getVisibleIdx(aba.sheetKey, headers.length);
    if (cur.length === 0) cur = all.slice();

    if (checked) {
        if (!cur.includes(idx)) cur.push(idx);
    } else {
        cur = cur.filter(i => i !== idx);
    }
    cur.sort((a, b) => a - b);
    _visibleCols[aba.sheetKey] = cur;
    saveVisibleCols();

    renderActivePanel();
    document.getElementById('fleet-cols-panel')?.classList.remove('hidden');
}

function showAllColumns(abaKey) {
    const aba = ABAS[abaKey];
    if (!aba?.sheetKey) return;
    const headers = _data[aba.sheetKey]?.headers || [];
    _visibleCols[aba.sheetKey] = Array.from({ length: headers.length }, (_, i) => i);
    saveVisibleCols();
    renderActivePanel();
    document.getElementById('fleet-cols-panel')?.classList.remove('hidden');
}

function hideAllColumns(abaKey) {
    const aba = ABAS[abaKey];
    if (!aba?.sheetKey) return;
    _visibleCols[aba.sheetKey] = [0];
    saveVisibleCols();
    renderActivePanel();
    document.getElementById('fleet-cols-panel')?.classList.remove('hidden');
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
}

function debounceSearch(value) {
    _searchTerm = value || '';
    _page = 0;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
        renderActivePanel();
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
}

// ============================================================
// CRUD — Visualizar
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
    openModalSafe('fleet-view-modal');
}

// ============================================================
// CRUD — Editar / Incluir
// ============================================================
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
    openModalSafe('fleet-crud-modal');
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
        return `<input type="date" class="form-control" id="${id}" value="${y || ''}-${m || ''}-${d || ''}">`;
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
        showNotification('Atualizado', 'Registro atualizado.', 'success');
        try { await addHistory('Frota Excel Edição', '-', `${aba.label} editado`); } catch (err) {}
    } else {
        sheetData.rows.push(newRow);
        showNotification('Adicionado', 'Novo registro incluído.', 'success');
        try { await addHistory('Frota Excel Inclusão', '-', `${aba.label} incluído`); } catch (err) {}
    }

    saveToStorage();
    closeModalSafe('fleet-crud-modal');
    _editingKey = null;
    _editingIndex = -1;
    renderSubTabs();
    renderActivePanel();
}

// ============================================================
// CRUD — Excluir
// ============================================================
async function deleteRow(abaKey, index) {
    const aba = ABAS[abaKey];
    const sheetData = _data[aba.sheetKey];
    const row = sheetData?.rows?.[index];
    if (!row) return;

    const firstCell = row[0] ?? 'registro';
    const ok = await sstConfirm(
        `Excluir o registro "${firstCell}" de ${aba.label}?`,
        'Confirmar exclusão',
        'danger'
    );
    if (!ok) return;

    sheetData.rows.splice(index, 1);
    saveToStorage();

    showNotification('Excluído', 'Registro removido.', 'success');
    try { await addHistory('Frota Excel Exclusão', '-', `${aba.label} removido`); } catch (err) {}

    renderSubTabs();
    renderActivePanel();
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
        saveToStorage();
        saveVisibleCols();

        showNotification('Importado', `${totalRows} registro(s) de ${file.name}.`, 'success');
        try { await addHistory('Frota Excel Importação', '-', `${totalRows} registros de ${file.name}`); } catch (err) {}

        if (notFound.length > 0) {
            sstAlert(`Abas não encontradas: ${notFound.join(', ')}`, 'Aviso', 'warning');
        }

        const firstWithData = Object.entries(ABAS).find(([k, a]) =>
            a.sheetKey && (newData[a.sheetKey]?.rows?.length || 0) > 0
        );
        if (firstWithData) _activeAba = firstWithData[0];

        renderSubTabs();
        renderActivePanel();
        updateStats();

    } catch (err) {
        console.error('[FleetExcel] Import error:', err);
        sstAlert(`Erro ao importar: ${err.message}`, 'Falha', 'danger');
    } finally {
        e.target.value = '';
    }
}

function normalizeName(name) {
    return String(name)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '').toLowerCase();
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
        try { await addHistory('Frota Excel Exportação', '-', fileName); } catch (err) {}
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
    _visibleCols = {};
    _activeAba = 'importar';
    _searchTerm = '';
    _page = 0;

    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    try { localStorage.removeItem(COLS_KEY); } catch (e) {}

    showNotification('Zerado', 'Dados da frota removidos.', 'success');
    try { await addHistory('Frota Excel Reset', '-', 'Dados zerados'); } catch (err) {}

    renderSubTabs();
    renderActivePanel();
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
        console.warn('[FleetExcel] Falha ao ler storage:', e);
        _data = {};
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch (e) {
        console.warn('[FleetExcel] Falha ao salvar storage:', e);
        if (e.name === 'QuotaExceededError') {
            sstAlert('Armazenamento cheio. Exporte e zere os dados.', 'Armazenamento cheio', 'warning');
        }
    }
}

// ============================================================
// HELPERS — badges de contagem
// ============================================================
function updateStats() {
    const tabs = document.querySelectorAll('#frota-subtabs .tab-inner');
    tabs.forEach(tab => {
        const onclick = tab.getAttribute('onclick') || '';
        const match = onclick.match(/'([^']+)'/);
        if (!match) return;
        const aba = ABAS[match[1]];
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
