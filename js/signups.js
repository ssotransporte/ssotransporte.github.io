// ============================================================
// SSOT - SOLICITAÇÕES DE CADASTRO (v11.4)
// ============================================================

import {
    ref, set, remove, push, onValue, update, get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
    showNotification, escapeHtml, formatDateTime,
    getInitials, isValidEmail, isValidPassword
} from './utils.js';

import { addHistory } from './history.js';
import { createUserSafely, getAuthErrorMessage } from './auth.js';
import { sstConfirm, sstAlert, sstPrompt } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _signups = [];
let _unsub = null;
let _isAdmin = false;
let _isSubscribed = false;

export function setSignupsContext(db, currentUser, isAdmin) {
    _db = db;
    _currentUser = currentUser;
    _isAdmin = isAdmin;
}

export function getSignups() { return _signups; }

export function subscribeSignups() {
    if (!_isAdmin || !_db) return null;
    if (_isSubscribed && _unsub) return _unsub;
    _isSubscribed = true;

    _unsub = onValue(ref(_db, 'signups'), (snap) => {
        _signups = [];
        snap.forEach(child => {
            const val = child.val();
            if (val) _signups.push({ ...val, id: child.key });
        });
        _signups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        updateSignupsTables();
        updatePendingBadge();
    }, (error) => console.error('[Signups]', error));

    return _unsub;
}

export function unsubscribeSignups() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    _isSubscribed = false;
}

// ✅ BLINDADO: Tenta pegar o _db do contexto ou da window
export async function createSignup(data) {
    const db = _db || window._db;
    if (!db) throw new Error('Sistema não conectado. Recarregue a página.');
    if (!data.nome || !data.email || !data.senha) throw new Error('Preencha todos os campos.');
    if (!isValidEmail(data.email)) throw new Error('E-mail inválido.');
    if (!isValidPassword(data.senha)) throw new Error('Senha muito curta (mínimo 6 caracteres).');

    const emailLower = data.email.toLowerCase().trim();

    try {
        const usersSnap = await get(ref(db, 'users'));
        let jaExiste = false;
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                const u = child.val();
                if (u.email && u.email.toLowerCase() === emailLower) jaExiste = true;
            });
        }
        if (jaExiste) throw new Error('Este e-mail já está cadastrado.');
    } catch (err) {
        if (err.message.includes('cadastrado')) throw err;
    }

    try {
        const signupsSnap = await get(ref(db, 'signups'));
        let jaExiste = false;
        if (signupsSnap.exists()) {
            signupsSnap.forEach(child => {
                const s = child.val();
                if (s.email && s.email.toLowerCase() === emailLower && s.status === 'pendente') jaExiste = true;
            });
        }
        if (jaExiste) throw new Error('Você já tem uma solicitação pendente. Aguarde a análise.');
    } catch (err) {
        if (err.message.includes('pendente')) throw err;
    }

    const newRef = push(ref(db, 'signups'));
    await set(newRef, {
        nome: data.nome.trim(),
        email: emailLower,
        ramal: (data.ramal || '').trim(),
        setor: (data.setor || '').trim(),
        cargo: (data.cargo || '').trim(),
        justificativa: (data.justificativa || '').trim(),
        password: data.senha,
        status: 'pendente',
        origin: data.origin || 'form',
        timestamp: new Date().toISOString()
    });

    return newRef.key;
}

export async function approveSignup(signupId) {
    const s = _signups.find(x => x.id === signupId);
    if (!s) { showNotification('Erro', 'Solicitação não encontrada.', 'danger'); return; }
    if (s.status !== 'pendente') { showNotification('Aviso', 'Já foi processada.', 'warning'); return; }

    if (!s.password || !isValidPassword(s.password)) {
        await sstAlert('A senha do solicitante é inválida.', 'Erro', 'danger');
        return;
    }

    const ok = await sstConfirm(
        `Aprovar cadastro de "${s.nome}"?\n\n` +
        `E-mail: ${s.email}\n` +
        `Setor: ${s.setor || '—'}\n` +
        `Ramal: ${s.ramal || '—'}\n\n` +
        `A conta será criada com a senha escolhida.`,
        'Aprovar Cadastro',
        'info'
    );
    if (!ok) return;

    try {
        let uid;
        try {
            uid = await createUserSafely(s.email, s.password);
        } catch (err) {
            console.error('[Signups] Auth:', err);
            if (err.code === 'auth/email-already-in-use') {
                throw new Error('Este e-mail já existe no Firebase Auth.');
            }
            throw new Error(getAuthErrorMessage(err));
        }

        await set(ref(_db, 'users/' + uid), {
            name: s.nome,
            email: s.email,
            setor: s.setor || '',
            ramal: s.ramal || '',
            cargo: s.cargo || '',
            role: 'user',
            active: true,
            provider: s.origin === 'google' ? 'google' : 'password',
            createdAt: new Date().toISOString(),
            approvedBy: _currentUser?.name || 'Sistema',
            approvedAt: new Date().toISOString(),
            originSignupId: signupId
        });

        await update(ref(_db, 'signups/' + signupId), {
            status: 'aprovado',
            password: null,
            approvedBy: _currentUser?.name || 'Sistema',
            approvedAt: new Date().toISOString(),
            uid: uid
        });

        await addHistory('Cadastro Aprovado', s.nome,
            `E-mail: ${s.email} | Aprovado por: ${_currentUser?.name}`);

        showNotification('Aprovado', `Conta criada para ${s.nome}.`, 'success');
    } catch (err) {
        console.error('[Signups]', err);
        await sstAlert(err.message || 'Erro ao aprovar.', 'Erro', 'danger');
    }
}

export async function rejectSignup(signupId) {
    const s = _signups.find(x => x.id === signupId);
    if (!s) return;
    if (s.status !== 'pendente') { showNotification('Aviso', 'Já foi processada.', 'warning'); return; }

    const motivo = await sstPrompt('Motivo da recusa (opcional):', '', 'Recusar Cadastro') || '';

    const ok = await sstConfirm(`Recusar cadastro de "${s.nome}"?`, 'Confirmar Recusa', 'warning');
    if (!ok) return;

    try {
        await update(ref(_db, 'signups/' + signupId), {
            status: 'recusado',
            password: null,
            rejectedBy: _currentUser?.name || 'Sistema',
            rejectedAt: new Date().toISOString(),
            motivo
        });

        await addHistory('Cadastro Recusado', s.nome,
            `E-mail: ${s.email} | Recusado por: ${_currentUser?.name}${motivo ? ' | Motivo: ' + motivo : ''}`);

        showNotification('Recusado', `Solicitação de ${s.nome} recusada.`, 'success');
    } catch (err) {
        console.error('[Signups]', err);
        showNotification('Erro', 'Não foi possível recusar.', 'danger');
    }
}

export async function deleteSignup(signupId) {
    const s = _signups.find(x => x.id === signupId);
    if (!s) return;

    const ok = await sstConfirm('Excluir esta solicitação permanentemente?', 'Excluir', 'danger');
    if (!ok) return;

    try {
        await remove(ref(_db, 'signups/' + signupId));
        await addHistory('Solicitação de Cadastro Excluída', s.nome || '', '');
        showNotification('Excluída', 'Solicitação removida.', 'success');
    } catch (err) {
        console.error('[Signups]', err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

export async function checkSignupByEmail(email) {
    const db = _db || window._db;
    if (!db) return { exists: false };
    const emailLower = email.toLowerCase().trim();

    try {
        const snap = await get(ref(db, 'signups'));
        let found = null;
        if (snap.exists()) {
            snap.forEach(child => {
                const s = child.val();
                if (s.email && s.email.toLowerCase() === emailLower) {
                    if (!found || new Date(s.timestamp) > new Date(found.timestamp)) {
                        found = { ...s, id: child.key };
                    }
                }
            });
        }
        return found
            ? { exists: true, status: found.status, signup: found }
            : { exists: false };
    } catch (err) {
        console.warn('[Signups] checkSignupByEmail:', err);
        return { exists: false };
    }
}

export function updateSignupsTables() {
    updatePendingTable();
    updateRejectedTable();
}

function updatePendingTable() {
    const tbody = document.getElementById('signups-table');
    if (!tbody) return;

    const pendentes = _signups.filter(s => s.status === 'pendente');

    if (pendentes.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="table-empty">
                <svg class="si si-2x"><use href="#i-user-check"/></svg>
                <p>Nenhuma solicitação pendente.</p>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = pendentes.map(s => `
        <tr>
            <td>${formatDateTime(s.timestamp)}</td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:30px;height:30px;border-radius:50%;
                                background:#2c3e50;color:#fff;
                                display:flex;align-items:center;
                                justify-content:center;font-size:0.7rem;font-weight:700;">
                        ${getInitials(s.nome || 'U')}
                    </div>
                    <span style="font-weight:600;">${escapeHtml(s.nome || '—')}</span>
                    ${s.origin === 'google' ? '<span style="color:#4285F4;margin-left:5px;font-weight:700;font-size:0.75rem;" title="Cadastro via Google">G</span>' : ''}
                </div>
            </td>
            <td>${escapeHtml(s.email || '—')}</td>
            <td>${escapeHtml(s.setor || '—')}</td>
            <td>${escapeHtml(s.ramal || '—')}</td>
            <td class="table-actions-col">
                <div class="action-buttons" style="justify-content:flex-end;">
                    <button onclick="approveSignup('${s.id}')" class="btn btn-success btn-sm">Aprovar</button>
                    <button onclick="rejectSignup('${s.id}')" class="btn btn-warning btn-sm">Recusar</button>
                    <button onclick="deleteSignup('${s.id}')" class="btn btn-danger btn-sm">
                        <svg class="si"><use href="#i-trash"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateRejectedTable() {
    const tbody = document.getElementById('signups-rejected-table');
    if (!tbody) return;

    const recusados = _signups.filter(s => s.status === 'recusado');

    if (recusados.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="table-empty">
                <svg class="si si-2x"><use href="#i-x-circle"/></svg>
                <p>Nenhuma solicitação recusada.</p>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = recusados.map(s => `
        <tr>
            <td>${formatDateTime(s.timestamp)}</td>
            <td>${escapeHtml(s.nome || '—')}</td>
            <td>${escapeHtml(s.email || '—')}</td>
            <td>${escapeHtml(s.setor || '—')}</td>
            <td>${escapeHtml(s.motivo || '—')}</td>
            <td class="table-actions-col">
                <div class="action-buttons" style="justify-content:flex-end;">
                    <button onclick="deleteSignup('${s.id}')" class="btn btn-danger btn-sm">
                        <svg class="si"><use href="#i-trash"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updatePendingBadge() {
    const badge = document.getElementById('signups-pending-badge');
    if (!badge) return;
    const count = _signups.filter(s => s.status === 'pendente').length;
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

window.approveSignup = approveSignup;
window.rejectSignup = rejectSignup;
window.deleteSignup = deleteSignup;
