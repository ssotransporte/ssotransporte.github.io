// ============================================================
// SSOT - FROTA EXCEL (v2 — Sub-abas + CRUD completo)
// ============================================================

import { showNotification, escapeHtml } from './utils.js';
import { sstConfirm, sstAlert } from './dialogs.js';
import { addHistory } from './history.js';

const STORAGE_KEY = 'ssot_fleet_excel_v1';
const PAGE_SIZE = 100;

const SHEETS_CONFIG = {
    'Veículos':       { key: 'veiculos',       titleRow: false },
    'Abastecimentos': { key: 'abastecimentos', titleRow: false },
    'Serviços':       { key: 'servicos',       titleRow: false },
    'Despesas':       { key: 'despesas',       titleRow: false },
    'Leituras':       { key: 'leituras',       titleRow: false },
    'Percursos':      { key: 'percursos',      titleRow: false },
    'Checklist':      { key: 'checklist',      titleRow: true  }
};

const ABAS = {
    importar: {
        label: 'Importar / Exportar', icon: 'i-upload',
        sheetKey: null, sheetName: null
    },
    viagens: {
        label: 'Viagens', icon: 'i-route',
        sheetKey: 'percursos', sheetName: 'Percursos', primary: true
    },
    veiculos: {
        label: 'Veículos', icon: 'i-car',
        sheetKey: 'veiculos', sheetName: 'Veículos'
    },
    abastecimentos: {
        label: 'Abastecimentos', icon: 'i-truck',
        sheetKey: 'abastecimentos', sheetName: 'Abastecimentos'
    },
    servicos: {
        label: 'Serviços', icon: 'i-cog',
        sheetKey: 'servicos', sheetName: 'Serviços'
    },
    despesas: {
        label: 'Despesas', icon: 'i-file-text',
        sheetKey: 'despesas', sheetName: 'Despesas'
    },
    leituras: {
        label: 'Leituras', icon: 'i-clock',
        sheetKey: 'leituras', sheetName: 'Leituras'
    },
    checklist: {
        label: 'Checklist', icon: 'i-check-circle',
        sheetKey: 'checklist', sheetName: 'Checklist'
    }
};

let _currentUser = null;
let _data = {};
let _activeAba = 'viagens';
let _initialized = false;
let _searchTerm = '';
let _page = 0;
let _editingKey = null;
let _editingIndex = -1;

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
}

// ============================================================
// RENDER — sub-abas
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
    container.innerHTML = aba.sheetKey === null
        ? renderImportPanel()
        : renderDataPanel(_activeAba, aba);
}

// ============================================================
// PAINEL: IMPORTAR/EXPORTAR
// ============================================================
function renderImportPanel() {
    const total = Object.values(_data).reduce((s, d) => s + (d?.rows?.length || 0), 0);
    const stats = Object.entries(SHEETS_CONFIG).map(([name, cfg]) => {
        const count = _data[cfg.key]?.rows?.length || 0;
        return `<tr><td>${escapeHtml(name)}</td><td><strong>${count}</strong></td></tr>`;
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
                    <button class="btn btn-success btn-sm" onclick="window.fleetExcelExport()">
                        <svg class="si"><use href="#i-download"/></svg> Exportar Excel
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.fleetExcelReset()">
                        <svg class="si"><use href="#i-broom"/></svg> Zerar Dados
                    </button>
                </div>
            </div>
            <div class="card-body">
                <input type="file" id="fleet-file-input" accept=".xlsx,.xls" hidden>
                <div class="info-grid" style="margin-bottom:20px;">
                    <div class="info-item">
                        <div class="info-label">Total de Registros</div>
                        <div class="info-value">${total}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Status</div>
                        <div class="info-value">${total > 0 ? '✅ Carregado' : '— Sem dados'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Armazenamento</div>
                        <div class="info-value">Navegador</div>
                    </div>
                </div>
                <div class="section-title">
                    <svg class="si si-fw"><use href="#i-file-excel"/></svg> Registros por Aba
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr><th>Aba</th><th>Registros</th></tr></thead>
                        <tbody>${stats}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// PAINEL: DADOS (CRUD)
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
                <div class="table-responsive">
                    <table class="table fleet-crud-table">
                        <thead>
                            <tr>
                                ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
                                <th class="table-actions-col">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pageRows.map((row, i) => {
                                const realIndex = start + i;
                                return `
                                    <tr>
                                        ${headers.map((_, j) => {
                                            const raw = row[j] ?? '';
                                            const short = String(raw).length > 45
                                                ? String(raw).slice(0, 45) + '…'
                                                : raw;
                                            return `<td title="${escapeHtml(raw)}">${escapeHtml(short)}</td>`;
                                        }).join('')}
                                        <td class="table-actions-col">
                                            <div class="action-buttons" style="justify-content:flex-end;">
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
// CRUD — VER
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
            `).join('') +
            `</div>`;
    }
    window.openModal('fleet-view-modal');
}

// ============================================================
// CRUD — EDITAR / INCLUIR
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
        sstAlert('Esta aba não tem colunas definidas. Importe um arquivo primeiro.', 'Aba vazia', 'warning');
        return;
    }
    const row = index >= 0 ? (sheetData.rows[index] || []) : [];

    const title = document.getElementById('fleet-crud-title');
    if (title) title.textContent = mode === 'incluir'
        ? `Incluir — ${aba.label}`
        : `Editar — ${aba.label}`;

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
        const [d, m, y] = value.split('/');
        return `<input type="date" class="form-control" id="${id}" value="${y}-${m}-${d}">`;
    }
    if (type === 'time') {
        return `<input type="time" class="form-control" id="${id}" value="${value.substring(0, 5)}">`;
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

    _searchTerm = '';
    _page = Math.floor(Math.max(0, (sheetData.rows.length - 1)) / PAGE_SIZE);
    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
    updateStats();
}

// ============================================================
// CRUD — EXCLUIR
// ============================================================
async function deleteRow(abaKey, index) {
    const aba = ABAS[abaKey];
    const sheetData = _data[aba.sheetKey];
    const row = sheetData?.rows?.[index];
    if (!row) return;

    const preview = row.slice(0, 3).filter(Boolean).join(' · ') || '(linha sem dados)';

    const ok = await sstConfirm(
        `Excluir este registro de "${aba.label}"?\n\nPrévia: ${preview}\n\nEsta ação NÃO pode ser desfeita.`,
        'Excluir Registro',
        'danger'
    );
    if (!ok) return;

    sheetData.rows.splice(index, 1);
    saveToStorage();

    showNotification('Excluído', 'Registro removido.', 'success');
    try { await addHistory('Frota Excel Exclusão', '-', `${aba.label} linha ${index + 1}`); } catch (e) {}

    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
    updateStats();
}

// ============================================================
// IMPORTAR / EXPORTAR / ZERAR
// ============================================================
function triggerImport() {
    if (!window.XLSX) {
        sstAlert('Biblioteca Excel não carregada. Recarregue com Ctrl+F5.', 'Erro', 'danger');
        return;
    }
    const input = document.getElementById('fleet-file-input');
    if (input) input.click();
}

function bindPanelActions() {
    const input = document.getElementById('fleet-file-input');
    if (input && !input.dataset.bound) {
        input.dataset.bound = 'true';
        input.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) await handleFleetExcelFile(file);
        });
    }
}

async function handleFleetExcelFile(file) {
    if (!window.XLSX) {
        await sstAlert('Biblioteca Excel não carregada.', 'Erro', 'danger');
        return;
    }

    const hasData = Object.values(_data).some(d => (d?.rows?.length || 0) > 0);
    if (hasData) {
        const ok = await sstConfirm('Já existem dados importados. Deseja SOBRESCREVER?', 'Sobrescrever', 'warning');
        if (!ok) return;
    }

    try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const newData = {};
        const missing = [];

        Object.entries(SHEETS_CONFIG).forEach(([sheetName, cfg]) => {
            const ws = wb.Sheets[sheetName];
            if (!ws) {
                missing.push(sheetName);
                newData[cfg.key] = { headers: [], rows: [], titleRow: '' };
                return;
            }
            const raw = XLSX.utils.sheet_to_json(ws, {
                header: 1, defval: '', raw: false, blankrows: false
            });

            let startIdx = 0, titleRow = '';
            if (cfg.titleRow && raw.length > 0) {
                const first = raw[0].filter(c => String(c).trim() !== '');
                if (first.length === 1) {
                    titleRow = String(first[0]);
                    startIdx = 1;
                }
            }

            const headers = (raw[startIdx] || []).map(h => String(h ?? ''));
            const rows = [];
            for (let i = startIdx + 1; i < raw.length; i++) {
                const row = raw[i] || [];
                if (!row.some(c => String(c).trim() !== '')) continue;
                const normalized = [];
                for (let j = 0; j < headers.length; j++) {
                    normalized.push(row[j] != null ? String(row[j]) : '');
                }
                rows.push(normalized);
            }
            newData[cfg.key] = { headers, rows, titleRow };
        });

        _data = newData;
        saveToStorage();

        _activeAba = 'viagens';
        _searchTerm = '';
        _page = 0;

        renderSubTabs();
        renderActivePanel();
        bindPanelActions();
        updateStats();

        const total = Object.values(newData).reduce((s, d) => s + d.rows.length, 0);
        showNotification('Importado', `${total} registros em ${Object.keys(SHEETS_CONFIG).length} abas.`, 'success', 4500);

        if (missing.length > 0) {
            setTimeout(() => showNotification('Aviso',
                `Abas não encontradas: ${missing.join(', ')}`, 'warning', 6000), 800);
        }

        try { await addHistory('Frota Excel Importado', '-', `${total} registros`); } catch (e) {}
    } catch (err) {
        console.error('[FleetExcel]', err);
        await sstAlert('Erro ao ler o arquivo: ' + (err.message || ''), 'Erro', 'danger');
    }
}

async function exportFleetExcel() {
    if (!window.XLSX) {
        await sstAlert('Biblioteca Excel não carregada.', 'Erro', 'danger');
        return;
    }
    const hasData = Object.values(_data).some(d => (d?.rows?.length || 0) > 0);
    if (!hasData) {
        await sstAlert('Não há dados para exportar.', 'Sem Dados', 'warning');
        return;
    }
    try {
        const wb = XLSX.utils.book_new();
        Object.entries(SHEETS_CONFIG).forEach(([sheetName, cfg]) => {
            const d = _data[cfg.key];
            if (!d || (d.headers.length === 0 && d.rows.length === 0)) return;
            const aoa = [];
            if (d.titleRow) aoa.push([d.titleRow]);
            aoa.push(d.headers);
            d.rows.forEach(r => aoa.push(r));
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        const stamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `drivvo_frota_${stamp}.xlsx`);
        showNotification('Exportado', 'Arquivo Excel gerado!', 'success');
        try { await addHistory('Frota Excel Exportado', '-', `Arquivo em ${stamp}`); } catch (e) {}
    } catch (err) {
        console.error('[FleetExcel]', err);
        await sstAlert('Erro ao gerar o arquivo: ' + (err.message || ''), 'Erro', 'danger');
    }
}

async function resetFleetExcel() {
    const total = Object.values(_data).reduce((s, d) => s + (d?.rows?.length || 0), 0);
    if (total === 0) {
        await sstAlert('Não há dados para zerar.', 'Aviso', 'info');
        return;
    }
    const ok = await sstConfirm(
        `Zerar TODOS os dados importados?\n\nSerão removidos ${total} registros.\n\nEsta ação NÃO pode ser desfeita.`,
        'Zerar Dados', 'danger'
    );
    if (!ok) return;

    Object.values(SHEETS_CONFIG).forEach(cfg => {
        _data[cfg.key] = { headers: [], rows: [], titleRow: '' };
    });
    saveToStorage();

    _searchTerm = '';
    _page = 0;
    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
    updateStats();

    showNotification('Zerado', 'Todos os dados foram removidos.', 'success');
    try { await addHistory('Frota Excel Zerado', '-', `${total} registros removidos`); } catch (e) {}
}

// ============================================================
// STORAGE
// ============================================================
function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch (err) {
        if (err.name === 'QuotaExceededError' || err.code === 22) {
            showNotification('Aviso', 'Arquivo grande: não foi possível salvar. Os dados ficam só nesta sessão.', 'warning', 8000);
        } else console.warn('[FleetExcel]', err);
    }
}

function loadFromStorage() {
    _data = {};
    Object.values(SHEETS_CONFIG).forEach(cfg => {
        _data[cfg.key] = { headers: [], rows: [], titleRow: '' };
    });
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        Object.values(SHEETS_CONFIG).forEach(cfg => {
            if (parsed[cfg.key]) {
                _data[cfg.key] = {
                    headers: parsed[cfg.key].headers || [],
                    rows: parsed[cfg.key].rows || [],
                    titleRow: parsed[cfg.key].titleRow || ''
                };
            }
        });
    } catch (err) {
        console.warn('[FleetExcel]', err);
    }
}

// ============================================================
// STATS
// ============================================================
function updateStats() {
    const total = Object.values(_data).reduce((s, d) => s + (d?.rows?.length || 0), 0);
    const viagens = _data.percursos?.rows?.length || 0;
    const abast = _data.abastecimentos?.rows?.length || 0;
    const veiculos = _data.veiculos?.rows?.length || 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('fleet-stat-total', total);
    set('fleet-stat-viagens', viagens);
    set('fleet-stat-abastecimentos', abast);
    set('fleet-stat-veiculos', veiculos);
    set('fleet-excel-total', total);
}
