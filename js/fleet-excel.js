// ============================================================
// SSOT - FROTA EXCEL (v2.1 — Layout reformulado + importação)
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
    importar:       { label: 'Importar / Exportar', icon: 'i-upload',       sheetKey: null,             sheetName: null },
    viagens:        { label: 'Viagens',             icon: 'i-route',        sheetKey: 'percursos',      sheetName: 'Percursos' },
    veiculos:       { label: 'Veículos',            icon: 'i-car',          sheetKey: 'veiculos',       sheetName: 'Veículos' },
    abastecimentos: { label: 'Abastecimentos',      icon: 'i-truck',        sheetKey: 'abastecimentos', sheetName: 'Abastecimentos' },
    servicos:       { label: 'Serviços',            icon: 'i-cog',          sheetKey: 'servicos',       sheetName: 'Serviços' },
    despesas:       { label: 'Despesas',            icon: 'i-file-text',    sheetKey: 'despesas',       sheetName: 'Despesas' },
    leituras:       { label: 'Leituras',            icon: 'i-clock',        sheetKey: 'leituras',       sheetName: 'Leituras' },
    checklist:      { label: 'Checklist',           icon: 'i-check-circle', sheetKey: 'checklist',      sheetName: 'Checklist' }
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
    container.innerHTML = aba.sheetKey === null
        ? renderImportPanel()
        : renderDataPanel(_activeAba, aba);
}

// ============================================================
// PAINEL: IMPORTAR/EXPORTAR (reformulado)
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
                            <div class="fleet-import-stat-label">Abas Carregadas</div>
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
// CRUD — VISUALIZAR
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
        const [d, m, y] = String(value).split('/');
        return `<input type="date" class="form-control" id="${id}" value="${y}-${m}-${d}">`;
    }
    if (type === 'time') {
        return `<input type="time" class="form-control" id="${id}" value="${String(value).substring(0, 5)}">`;
    }
    return `<input type="text" class="form-control" id="${id}" value="${escapeHtml(value)}">`;
}

// ============================================================
// CRUD — SUBMIT
// ============================================================
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

// ============================================================
// CRUD — EXCLUIR
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
    showNotification('Excluído', 'Registro removido com sucesso.', 'success');
    try { await addHistory('Frota Excel Exclusão', '-', `${aba.label} removido`); } catch (e) {}

    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
    updateStats();
}

// ============================================================
// IMPORTAÇÃO EXCEL
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

            // Busca tolerante (acentos, espaços, case)
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
                header: 1,
                defval: '',
                raw: false,
                blankrows: false
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
            rows = rows
                .map(r => headers.map((_, i) => String(r[i] ?? '').trim()))
                .filter(r => r.some(c => c !== ''));

            newData[cfg.key] = { headers, rows };
            totalRows += rows.length;
        }

        if (totalRows === 0) {
            sstAlert(
                'Nenhuma linha de dados encontrada no arquivo. Verifique se o arquivo é o export do Drivvo.',
                'Arquivo vazio',
                'warning'
            );
            return;
        }

        _data = newData;
        saveToStorage();

        showNotification(
            'Importado',
            `${totalRows} registro(s) importado(s) de ${file.name}.`,
            'success'
        );
        try { await addHistory('Frota Excel Importação', '-', `${totalRows} registros de ${file.name}`); } catch (e) {}

        if (notFound.length > 0) {
            sstAlert(
                `As seguintes abas não foram encontradas: ${notFound.join(', ')}`,
                'Aviso de importação',
                'warning'
            );
        }

        // Vai para a primeira aba com dados
        const firstWithData = Object.entries(ABAS).find(([k, a]) =>
            a.sheetKey && (newData[a.sheetKey]?.rows?.length || 0) > 0
        );
        if (firstWithData) _activeAba = firstWithData[0];

        renderSubTabs();
        renderActivePanel();
        bindPanelActions();
        updateStats();

    } catch (err) {
        console.error('Import error:', err);
        sstAlert(`Erro ao importar: ${err.message}`, 'Falha na importação', 'danger');
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

// ============================================================
// EXPORTAÇÃO EXCEL
// ============================================================
async function exportFleetExcel() {
    const total = Object.values(_data).reduce((s, d) => s + (d?.rows?.length || 0), 0);
    if (total === 0) {
        sstAlert('Não há dados para exportar.', 'Vazio', 'warning');
        return;
    }

    if (typeof XLSX === 'undefined') {
        sstAlert('Biblioteca XLSX não carregada. Recarregue a página.', 'Erro', 'danger');
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

        showNotification('Exportado', `Arquivo "${fileName}" gerado.`, 'success');
        try { await addHistory('Frota Excel Exportação', '-', fileName); } catch (e) {}
    } catch (err) {
        console.error('Export error:', err);
        sstAlert(`Erro ao exportar: ${err.message}`, 'Falha na exportação', 'danger');
    }
}

// ============================================================
// RESET
// ============================================================
async function resetFleetExcel() {
    const ok = await sstConfirm(
        'Tem certeza que deseja zerar TODOS os dados importados? Esta ação não pode ser desfeita.',
        'Zerar dados da frota',
        'danger'
    );
    if (!ok) return;

    _data = {};
    _activeAba = 'importar';
    _searchTerm = '';
    _page = 0;

    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}

    showNotification('Zerado', 'Todos os dados da frota foram removidos.', 'success');
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
        if (!raw) {
            _data = {};
            return;
        }
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
        // Provavelmente excedeu quota
        if (e.name === 'QuotaExceededError') {
            sstAlert(
                'Espaço de armazenamento local cheio. Considere exportar e depois zerar os dados.',
                'Armazenamento cheio',
                'warning'
            );
        }
    }
}

// ============================================================
// HELPERS
// ============================================================
function updateStats() {
    // Atualiza contadores de forma leve (se existirem elementos com classe .tab-count)
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
    // Rebind do input file caso a aba importar esteja ativa
    if (_activeAba === 'importar') {
        const input = document.getElementById('fleet-file-input');
        if (input) {
            input.onchange = handleFileImport;
        }
    }
}

// ============================================================
// EXPORTS AUXILIARES (opcional — para uso externo)
// ============================================================
export function getFleetExcelData() {
    return _data;
}

export function getFleetActiveTab() {
    return _activeAba;
}

export function reloadFleetExcel() {
    loadFromStorage();
    renderSubTabs();
    renderActivePanel();
    bindPanelActions();
    updateStats();
}
