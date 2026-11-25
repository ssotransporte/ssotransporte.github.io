// ============================================================
// SSOT - CONFIGURAÇÕES DO PRÓPRIO USUÁRIO (Minha Conta)
// ============================================================

import {
    ref, update, get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
    showNotification, escapeHtml, isValidPassword
} from './utils.js';

import { THEME_STORAGE_KEY } from './config.js';

import * as Auth from './auth.js';
import { addHistory } from './history.js';
import { sstConfirm, sstAlert } from './dialogs.js';

// ============================================================
// ESTADO
// ============================================================
let _db = null;
let _currentUser = null;

// ============================================================
// CONTEXTO
// ============================================================
export function setUserSettingsContext(db, currentUser) {
    _db = db;
    _currentUser = currentUser;
}

// ============================================================
// CARREGAR PERFIL
// ============================================================
export async function loadMyProfile() {
    if (!_currentUser || !_db) return;

    try {
        const snap = await get(ref(_db, 'users/' + _currentUser.uid));
        if (!snap.exists()) return;

        const data = snap.val();

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        setVal('my-nome', data.name);
        setVal('my-email', data.email);
        setVal('my-setor', data.setor);
        setVal('my-ramal', data.ramal);
        setVal('my-cargo', data.cargo);

        // Tema
        const theme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
        const themeSel = document.getElementById('my-theme');
        if (themeSel) themeSel.value = theme;
    } catch (err) {
        console.error('[UserSettings] Erro ao carregar perfil:', err);
    }
}

// ============================================================
// SALVAR DADOS BÁSICOS
// ============================================================
export async function saveMyProfile() {
    if (!_currentUser || !_db) return;

    const name = document.getElementById('my-nome')?.value.trim() || '';
    const setor = document.getElementById('my-setor')?.value.trim() || '';
    const ramal = document.getElementById('my-ramal')?.value.trim() || '';
    const cargo = document.getElementById('my-cargo')?.value.trim() || '';

    if (!name) {
        showNotification('Atenção', 'O nome não pode ficar em branco.', 'warning');
        return;
    }

    const btn = document.getElementById('save-my-profile');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        await update(ref(_db, 'users/' + _currentUser.uid), {
            name, setor, ramal, cargo,
            updatedAt: new Date().toISOString(),
            updatedBy: 'Próprio usuário'
        });

        // Atualiza objeto em memória
        _currentUser.name = name;
        _currentUser.setor = setor;
        _currentUser.ramal = ramal;
        _currentUser.cargo = cargo;

        // Atualiza header
        const userEl = document.getElementById('current-user');
        const avatarEl = document.getElementById('user-avatar');
        if (userEl) userEl.textContent = name;
        if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

        await addHistory('Perfil Atualizado', '-', `Usuário ${name} atualizou dados pessoais`);

        showNotification('Dados Salvos', 'Seus dados foram atualizados com sucesso.', 'success');
    } catch (err) {
        console.error('[UserSettings] Erro ao salvar:', err);
        showNotification('Erro', 'Não foi possível salvar os dados.', 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ============================================================
// ALTERAR SENHA
// ============================================================
export async function saveMyPassword() {
    if (!_currentUser) return;

    const currentPass = document.getElementById('my-current-pass')?.value || '';
    const newPass = document.getElementById('my-new-pass')?.value || '';
    const newPass2 = document.getElementById('my-new-pass2')?.value || '';

    if (!newPass || !isValidPassword(newPass)) {
        showNotification('Atenção', 'A nova senha deve ter no mínimo 6 caracteres.', 'warning');
        return;
    }

    if (newPass !== newPass2) {
        showNotification('Atenção', 'As senhas não coincidem.', 'warning');
        return;
    }

    if (newPass === currentPass) {
        showNotification('Atenção', 'A nova senha deve ser diferente da atual.', 'warning');
        return;
    }

    const ok = await sstConfirm(
        'Deseja realmente alterar sua senha? Você precisará usá-la no próximo login.',
        'Alterar Senha',
        'warning'
    );
    if (!ok) return;

    const btn = document.getElementById('save-my-password');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Alterando...';
    }

    try {
        await Auth.updateUserPassword(currentPass, newPass);

        await addHistory('Senha Alterada', '-', `Usuário ${_currentUser.name} alterou a senha`);

        // Limpa campos
        ['my-current-pass', 'my-new-pass', 'my-new-pass2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        showNotification('Senha Alterada', 'Sua senha foi atualizada com sucesso.', 'success');
    } catch (err) {
        console.error('[UserSettings] Erro ao alterar senha:', err);

        let msg = 'Não foi possível alterar a senha.';
        if (err.message === 'Senha atual incorreta.') {
            msg = 'A senha atual está incorreta.';
        } else if (err.code === 'auth/weak-password') {
            msg = 'A nova senha é muito fraca.';
        } else if (err.code === 'auth/requires-recent-login') {
            msg = 'Faça login novamente e tente outra vez.';
        } else if (err.message) {
            msg = err.message;
        }

        showNotification('Erro', msg, 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ============================================================
// CONFIGURAR LISTENERS
// ============================================================
export function setupUserSettings() {
    document.getElementById('save-my-profile')?.addEventListener('click', saveMyProfile);
    document.getElementById('save-my-password')?.addEventListener('click', saveMyPassword);

    const themeSel = document.getElementById('my-theme');
    if (themeSel && themeSel.dataset.bound !== 'true') {
        themeSel.dataset.bound = 'true';
        themeSel.addEventListener('change', function () {
            document.body.className = '';
            if (this.value === 'dark') document.body.classList.add('dark-theme');
            localStorage.setItem(THEME_STORAGE_KEY, this.value);
            showNotification('Tema', 'Aparência atualizada.', 'success', 2000);
        });
    }
}

// ============================================================
// EXPOR PARA O WINDOW
// ============================================================
window.loadMyProfile = loadMyProfile;
window.saveMyProfile = saveMyProfile;
window.saveMyPassword = saveMyPassword;