// ============================================================
// SSOT - CONFIGURAÇÕES E SERVIÇOS (v12.0)
// Novidades:
//  - Painel de configuração do Dashboard (visibilidade, tipo, ordem)
// ============================================================

import { showNotification } from './utils.js';
import {
    THEME_STORAGE_KEY, DASHBOARD_CHARTS, CHART_TYPES
} from './config.js';

import * as Dashboard from './dashboard.js';

let _currentUser = null;

export function setSettingsContext(user) { _currentUser = user; }

// ============================================================
// TEMA
// ============================================================
export function loadTheme() {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    if (t) {
        const sel = document.getElementById('theme-selector');
        if (sel) sel.value = t;
        document.body.className = '';
        if (t === 'dark') document.body.classList.add('dark-theme');
    }
}

export function setupThemeSelector() {
    const sel = document.getElementById('theme-selector');
    if (!sel || sel.dataset.bound === 'true') return;
    sel.dataset.bound = 'true';

    sel.addEventListener('change', function () {
        document.body.className = '';
        if (this.value === 'dark') document.body.classList.add('dark-theme');
        localStorage.setItem(THEME_STORAGE_KEY, this.value);
        showNotification('Tema Alterado', 'Aparência atualizada.', 'success', 2000);
    });
}

// ============================================================
// BACKUP
// ============================================================
export function setupBackupButtons(onRunBackup, onImportBackup) {
    const runBtn = document.getElementById('run-backup');
    if (runBtn && runBtn.dataset.bound !== 'true') {
        runBtn.dataset.bound = 'true';
        runBtn.addEventListener('click', () => {
            if (typeof onRunBackup === 'function') onRunBackup();
        });
    }

    const importBtn = document.getElementById('import-backup');
    const importInput = document.getElementById('backup-input');

    if (importBtn && importInput && importBtn.dataset.bound !== 'true') {
        importBtn.dataset.bound = 'true';
        importBtn.addEventListener('click', () => importInput.click());
    }

    if (importInput && importInput.dataset.bound !== 'true') {
        importInput.dataset.bound = 'true';
        importInput.addEventListener('change', function (e) {
            const file = e.target.files?.[0];
            if (file && typeof onImportBackup === 'function') onImportBackup(file);
            this.value = '';
        });
    }
}

// ============================================================
// DASHBOARD PERSONALIZÁVEL
// ============================================================
export function renderDashboardSettings() {
    const container = document.getElementById('dashboard-settings-container');
    if (!container) return;

    const cfg = Dashboard.getDashboardConfig();
    const charts = cfg.charts.slice().sort((a, b) => a.order - b.order);

    const typeOptions = Object.entries(CHART_TYPES).map(([key, meta]) =>
        `<option value="${key}">${meta.label}</option>`
    ).join('');

    container.innerHTML = `
        <div class="dashboard-settings-list">
            ${charts.map((c, idx) => {
                const meta = DASHBOARD_CHARTS[c.id];
                if (!meta) return '';

                return `
                    <div class="dashboard-settings-item ${c.visible ? '' : 'disabled'}" data-chart-id="${c.id}">
                        <div class="ds-item-left">
                            <label class="ds-toggle">
                                <input type="checkbox" ${c.visible ? 'checked' : ''} data-ds-visible="${c.id}">
                                <span class="ds-toggle-mark"></span>
                            </label>
                            <svg class="si si-fw ds-item-icon"><use href="#${meta.icon}"/></svg>
                            <span class="ds-item-label">${meta.label}</span>
                        </div>
                        <div class="ds-item-controls">
                            <select class="form-control ds-type-select" data-ds-type="${c.id}">
                                ${Object.entries(CHART_TYPES).map(([key, t]) =>
                                    `<option value="${key}" ${c.type === key ? 'selected' : ''}>${t.label}</option>`
                                ).join('')}
                            </select>
                            <div class="ds-order-buttons">
                                <button type="button" class="btn btn-secondary btn-sm" ${idx === 0 ? 'disabled' : ''} data-ds-up="${c.id}" title="Subir">
                                    <svg class="si"><use href="#i-chevron-up"/></svg>
                                </button>
                                <button type="button" class="btn btn-secondary btn-sm" ${idx === charts.length - 1 ? 'disabled' : ''} data-ds-down="${c.id}" title="Descer">
                                    <svg class="si"><use href="#i-chevron-down"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="ds-actions" style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.saveDashboardSettings()">
                <svg class="si"><use href="#i-save"/></svg> Salvar Configuração
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.resetDashboardSettings()">
                <svg class="si"><use href="#i-refresh"/></svg> Restaurar Padrão
            </button>
        </div>
        <p style="margin-top:12px;color:#7f8c8d;font-size:0.8rem;">
            As preferências são salvas no seu navegador e aplicadas apenas à sua conta.
            Gráficos 3D são renderizados com a biblioteca ECharts (carregada sob demanda).
        </p>
    `;

    // Bind de listeners
    container.querySelectorAll('[data-ds-up]').forEach(btn => {
        btn.addEventListener('click', () => moveDashboardChart(btn.getAttribute('data-ds-up'), -1));
    });
    container.querySelectorAll('[data-ds-down]').forEach(btn => {
        btn.addEventListener('click', () => moveDashboardChart(btn.getAttribute('data-ds-down'), +1));
    });
}

function moveDashboardChart(chartId, direction) {
    const cfg = Dashboard.getDashboardConfig();
    const sorted = cfg.charts.slice().sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(c => c.id === chartId);
    if (idx < 0) return;

    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;

    // Troca de posição
    const tmp = sorted[idx];
    sorted[idx] = sorted[newIdx];
    sorted[newIdx] = tmp;

    // Recalcula ordem (1..N)
    sorted.forEach((c, i) => { c.order = i + 1; });

    cfg.charts = sorted;
    Dashboard.saveDashboardConfig(cfg);
    renderDashboardSettings();
}

export function saveDashboardSettings() {
    const cfg = Dashboard.getDashboardConfig();

    // Lê os valores atuais do DOM
    document.querySelectorAll('[data-ds-visible]').forEach(input => {
        const id = input.getAttribute('data-ds-visible');
        const c = cfg.charts.find(x => x.id === id);
        if (c) c.visible = input.checked;
    });

    document.querySelectorAll('[data-ds-type]').forEach(sel => {
        const id = sel.getAttribute('data-ds-type');
        const c = cfg.charts.find(x => x.id === id);
        if (c) c.type = sel.value;
    });

    Dashboard.saveDashboardConfig(cfg);
    Dashboard.updateDashboardCharts();
    renderDashboardSettings();

    showNotification('Dashboard', 'Configuração salva com sucesso!', 'success');
}

export function resetDashboardSettings() {
    Dashboard.resetDashboardConfig();
    renderDashboardSettings();
    showNotification('Dashboard', 'Configuração restaurada para o padrão.', 'info');
}

// ============================================================
// SETUP GERAL
// ============================================================
export function setupServices() {
    loadTheme();
    setupThemeSelector();
}

// ============================================================
// EXPORTS GLOBAIS
// ============================================================
window.saveDashboardSettings = saveDashboardSettings;
window.resetDashboardSettings = resetDashboardSettings;