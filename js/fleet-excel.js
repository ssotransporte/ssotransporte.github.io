// ============================================================
// SSOT - FROTA EXCEL (Importar / Exportar / Zerar Drivvo)
// ============================================================

import { showNotification, escapeHtml } from './utils.js';
import { sstConfirm, sstAlert } from './dialogs.js';
import { addHistory } from './history.js';

const STORAGE_KEY = 'ssot_fleet_excel_v1';

const SHEETS_CONFIG = {
    'Veículos':       { key: 'veiculos',       titleRow: false },
    'Abastecimentos': { key: 'abastecimentos', titleRow: false },
    'Serviços':       { key: 'servicos',       titleRow: false },
    'Despesas':       { key: 'despesas',       titleRow: false },
    'Leituras':       { key: 'leituras',       titleRow: false },
    'Percursos':      { key: 'percursos',      titleRow: false },
    'Checklist':      { key: 'checklist',      titleRow: true  }
};

let _currentUser = null;
let _data = {};
let _activeSheet = 'veiculos';
let _initialized = false;

// ============================================================
// INICIALIZAÇÃO
// ============================================================
export function setFleetExcelContext(db, currentUser) {
    _currentUser = currentUser;
}

export function initFleetExcel() {
    if (_initialized) return;
    _initialized = true;
    loadFromStorage();
    renderTabs();
    renderTable();
    updateTotalBadge();
    bindButtons();
}

function bindButtons() {
    const imp = document.getElementById('btn-fleet-import');
    const exp = document.getElementById('btn-fleet-export');
    const rst = document.getElementById('btn-fleet-reset');
    const inp = document.getElementById('fleet-file-input');

    if (imp && !imp.dataset.bound) {
        imp.dataset.bound = 'true';
        imp.addEventListener('click', () => {
            if (!window.XLSX) {
                sstAlert('Biblioteca de Excel não carregada. Recarregue com Ctrl+F5.', 'Erro', 'danger');
                return;
            }
            inp?.click();
        });
    }

    if (exp && !exp.dataset.bound) {
        exp.dataset.bound = 'true';
        exp.addEventListener('click', exportFleetExcel);
    }

    if (rst && !rst.dataset.bound) {
        rst.dataset.bound = 'true';
        rst.addEventListener('click', resetFleetExcel);
    }

    if (inp && !inp.dataset.bound) {
        inp.dataset.bound = 'true';
        inp.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) await handleFleetExcelFile(file);
        });
    }
}

// ============================================================
// IMPORTAR
// ============================================================
async function handleFleetExcelFile(file) {
    if (!window.XLSX) {
        await sstAlert('Biblioteca de Excel não carregada.', 'Erro', 'danger');
        return;
    }

    const hasData = Object.values(_data).some(d => d.rows.length > 0);
    if (hasData) {
        const ok = await sstConfirm(
            'Já existem dados importados. Deseja SOBRESCREVER com o novo arquivo?',
            'Sobrescrever Dados',
            'warning'
        );
        if (!ok) return;
    }

    showLoading();

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

            let startIdx = 0;
            let titleRow = '';

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

        renderTabs();
        renderTable();
        updateTotalBadge();

        const total = Object.values(newData).reduce((s, d) => s + d.rows.length, 0);
        showNotification('Importado', `${total} registros em ${Object.keys(SHEETS_CONFIG).length} abas.`, 'success', 4500);

        if (missing.length > 0) {
            setTimeout(() => showNotification('Aviso', `Abas não encontradas: ${missing.join(', ')}`, 'warning', 6000), 800);
        }

        try { await addHistory('Frota Excel Importado', '-', `${total} registros`); } catch (e) {}
    } catch (err) {
        console.error('[FleetExcel] Erro:', err);
        await sstAlert('Erro ao ler o arquivo: ' + (err.message || ''), 'Erro', 'danger');
        renderTable();
    }
}

// ============================================================
// EXPORTAR
// ============================================================
async function exportFleetExcel() {
    if (!window.XLSX) {
        await sstAlert('Biblioteca de Excel não carregada.', 'Erro', 'danger');
        return;
    }

    const hasData = Object.values(_data).some(d => d.rows.length > 0);
    if (!hasData) {
        await sstAlert('Não há dados para exportar. Importe um arquivo primeiro.', 'Sem Dados', 'warning');
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

        showNotification('Exportado', 'Arquivo Excel gerado com sucesso!', 'success');
        try { await addHistory('Frota Excel Exportado', '-', `Arquivo em ${stamp}`); } catch (e) {}
    } catch (err) {
        console.error('[FleetExcel] Erro export:', err);
        await sstAlert('Erro ao gerar o arquivo: ' + (err.message || ''), 'Erro', 'danger');
    }
}

// ============================================================
// ZERAR
// ============================================================
async function resetFleetExcel() {
    const hasData = Object.values(_data).some(d => d.rows.length > 0);
    if (!hasData) {
        await sstAlert('Não há dados para zerar.', 'Aviso', 'info');
        return;
    }

    const total = Object.values(_data).reduce((s, d) => s + d.rows.length, 0);

    const ok = await sstConfirm(
        `Zerar TODOS os dados importados do Excel?\n\n` +
        `Serão removidos ${total} registros de ${Object.keys(SHEETS_CONFIG).length} abas.\n\n` +
        `Viagens, veículos e motoristas cadastrados NÃO serão afetados.\n\n` +
        `Esta ação NÃO pode ser desfeita.`,
        'Zerar Dados do Excel',
        'danger'
    );
    if (!ok) return;

    try {
        Object.values(SHEETS_CONFIG).forEach(cfg => {
            _data[cfg.key] = { headers: [], rows: [], titleRow: '' };
        });
        saveToStorage();
        renderTabs();
        renderTable();
        updateTotalBadge();

        showNotification('Zerado', 'Todos os dados do Excel foram removidos.', 'success');
        try { await addHistory('Frota Excel Zerado', '-', `${total} registros removidos`); } catch (e) {}
    } catch (err) {
        console.error('[FleetExcel] Erro reset:', err);
        await sstAlert('Erro ao zerar: ' + (err.message || ''), 'Erro', 'danger');
    }
}

// ============================================================
// PERSISTÊNCIA (localStorage)
// ============================================================
function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
    } catch (err) {
        if (err.name === 'QuotaExceededError' || err.code === 22) {
            showNotification('Aviso', 'Dados grandes: não foi possível salvar no navegador. Os dados ficam apenas nesta sessão.', 'warning', 8000);
        } else {
            console.warn('[FleetExcel] Erro ao salvar no storage:', err);
        }
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
        console.warn('[FleetExcel] Erro ao carregar storage:', err);
    }
}

// ============================================================
// RENDER
// ============================================================
function renderTabs() {
    const container = document.getElementById('fleet-excel-tabs');
    if (!container) return;

    container.innerHTML = '';

    Object.entries(SHEETS_CONFIG).forEach(([sheetName, cfg]) => {
        const count = _data[cfg.key]?.rows?.length || 0;
        const btn = document.createElement('button');
        btn.className = 'frota-tab' + (_activeSheet === cfg.key ? ' active' : '');
        btn.innerHTML = `${escapeHtml(sheetName)} <span class="tab-count">${count}</span>`;
        btn.onclick = () => {
            _activeSheet = cfg.key;
            renderTabs();
            renderTable();
        };
        container.appendChild(btn);
    });
}

function renderTable() {
    const container = document.getElementById('fleet-excel-container');
    if (!container) return;

    const entry = Object.entries(SHEETS_CONFIG).find(([_, c]) => c.key === _activeSheet);
    if (!entry) return;
    const [sheetName, cfg] = entry;
    const d = _data[cfg.key];

    if (!d || d.rows.length === 0) {
        container.innerHTML = `
            <p class="notes-empty">
                <svg class="si si-2x" style="opacity:0.3;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto;"><use href="#i-file-excel"/></svg>
                Nenhum dado na aba <strong>${escapeHtml(sheetName)}</strong>.<br>
                Clique em <strong>"Importar Excel"</strong> para carregar.
            </p>
        `;
        return;
    }

    let html = `<div class="frota-table-container"><table class="frota-data-table"><thead><tr>`;
    d.headers.forEach(h => {
        html += `<th>${escapeHtml(h)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    d.rows.forEach(row => {
        html += '<tr>';
        for (let i = 0; i < d.headers.length; i++) {
            html += `<td>${escapeHtml(row[i] ?? '')}</td>`;
        }
        html += '</tr>';
    });

    html += `</tbody></table></div>`;
    html += `<div class="frota-row-count">Total: <strong>${d.rows.length}</strong> registro(s) · ${d.headers.length} coluna(s)</div>`;

    container.innerHTML = html;
}

function updateTotalBadge() {
    const el = document.getElementById('fleet-excel-total');
    if (!el) return;
    const total = Object.values(_data).reduce((s, d) => s + (d.rows?.length || 0), 0);
    el.textContent = total;
}

function showLoading() {
    const container = document.getElementById('fleet-excel-container');
    if (!container) return;
    container.innerHTML = `
        <div class="fleet-excel-loading">
            <div class="spinner"></div>
            <span>Processando arquivo...</span>
        </div>
    `;
    }
