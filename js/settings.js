// ============================================================
// SSOT - CONFIGURAÇÕES E SERVIÇOS
// ============================================================

import { showNotification } from './utils.js';
import { THEME_STORAGE_KEY } from './config.js';

let _currentUser = null;

export function setSettingsContext(user) { _currentUser = user; }

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

export function setupServices() {
    loadTheme();
    setupThemeSelector();
}