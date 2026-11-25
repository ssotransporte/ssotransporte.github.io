// ============================================================
// SSOT - LIXEIRA
// ============================================================

import {
    ref, set, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
    showNotification, escapeHtml, formatDateTime, daysBetween
} from './utils.js';

import { addHistory } from './history.js';
import { verifyCurrentPassword } from './auth.js';
import { TRASH_RETENTION_DAYS } from './config.js';
import { sstConfirm } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _trash = [];
let _unsub = null;
let _isAdmin = false;
let _pendingPasswordCallback = null;

export function setTrashContext(db, currentUser, isAdmin) {
    _db = db;
    _currentUser = currentUser;
    _isAdmin = isAdmin;
}

export function getTrash() { return _trash; }

export function subscribeTrash() {
    if (!_isAdmin || !_db) return null;
    if (_unsub) { try { _unsub(); } catch (e) {} }

    _unsub = onValue(ref(_db, 'trash'), (snap) => {
        _trash = [];
        snap.forEach(child => {
            const val = child.val();
            if (val && val.request) _trash.push({ ...val, id: child.key });
        });
        _trash.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
        cleanExpired();
        updateTrashTable();
        updateSystemInfo();
    }, (error) => console.error('[Trash]', error));

    return _unsub;
}

export function unsubscribeTrash() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
}

async function cleanExpired() {
    const now = new Date();
    const expired = _trash.filter(t => daysBetween(t.deletedAt, now) > TRASH_RETENTION_DAYS);
    if (expired.length === 0) return;
    for (const t of expired) {
        try { await remove(ref(_db, 'trash/' + t.id)); } catch (e) {}
    }
}

export function updateTrashTable() {
    const tbody = document.getElementById('lixeira-table');
    if (!tbody) return;

    const now = new Date();
    const valid = _trash.filter(t => daysBetween(t.deletedAt, now) <= TRASH_RETENTION_DAYS);

    if (valid.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">
            <svg class="si si-2x"><use href="#i-trash"/></svg>
            <p>A lixeira está vazia.</p>
        </td></tr>`;
        updateTrashCount();
        return;
    }

    tbody.innerHTML = valid.map(t => {
        const diff = daysBetween(t.deletedAt, now);
        const remaining = TRASH_RETENTION_DAYS - diff;
        const remainingClass = remaining <= 10 ? 'badge-danger' : (remaining <= 30 ? 'badge-warning' : 'badge-info');
        const r = t.request;

        return `
            <tr>
                <td><strong>${escapeHtml(r.numero || '—')}</strong></td>
                <td>${escapeHtml(r.solicitante || '—')}</td>
                <td>${escapeHtml(r.destino || '—')}</td>
                <td>${formatDateTime(t.deletedAt)}<br>
                    <small style="color:#7f8c8d;font-size:0.75rem;">por ${escapeHtml(t.deletedBy || '—')}</small>
                </td>
                <td><span class="badge ${remainingClass}">${remaining} dia${remaining !== 1 ? 's' : ''}</span></td>
                <td class="table-actions-col">
                    <div class="action-buttons" style="justify-content:flex-end;">
                        <button onclick="restoreFromTrash('${t.id}')" class="btn btn-success btn-sm">
                            <svg class="si"><use href="#i-undo"/></svg> Restaurar
                        </button>
                        <button onclick="permanentlyDelete('${t.id}')" class="btn btn-danger btn-sm">
                            <svg class="si"><use href="#i-x"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    updateTrashCount();
}

function updateTrashCount() {
    const el = document.getElementById('trash-count');
    if (el) el.textContent = _trash.length;
}

export async function restoreFromTrash(trashId) {
    const item = _trash.find(t => t.id === trashId);
    if (!item) { showNotification('Erro', 'Item não encontrado.', 'danger'); return; }

    const r = item.request;

    const ok = await sstConfirm(
        `Restaurar a solicitação ${r.numero}?\n\nEla voltará para a lista ativa.`,
        'Restaurar Solicitação',
        'info'
    );
    if (!ok) return;

    try {
        const req = { ...r };
        delete req.id;
        await set(ref(_db, 'requests/' + r.id), req);
        await remove(ref(_db, 'trash/' + trashId));
        await addHistory('Solicitação Restaurada', r.numero, `Por: ${_currentUser?.name}`);
        showNotification('Restaurada', `Solicitação ${r.numero} restaurada!`, 'success');
    } catch (err) {
        console.error('[Trash]', err);
        showNotification('Erro', 'Não foi possível restaurar.', 'danger');
    }
}

export async function permanentlyDelete(trashId) {
    const item = _trash.find(t => t.id === trashId);
    if (!item) return;

    const r = item.request;

    const ok = await sstConfirm(
        `Excluir PERMANENTEMENTE a solicitação ${r.numero}?\n\nAção irreversível.`,
        'Exclusão Permanente',
        'danger'
    );
    if (!ok) return;

    try {
        await remove(ref(_db, 'trash/' + trashId));
        await addHistory('Solicitação Excluída Permanentemente', r.numero, `Por: ${_currentUser?.name}`);
        showNotification('Excluída', 'Item removido permanentemente.', 'success');
    } catch (err) {
        console.error('[Trash]', err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

export function emptyTrash() {
    if (_trash.length === 0) {
        showNotification('Lixeira', 'A lixeira já está vazia.', 'info');
        return;
    }

    _pendingPasswordCallback = async () => {
        try {
            await remove(ref(_db, 'trash'));
            await addHistory('Lixeira Esvaziada', '-', `${_trash.length} itens removidos`);
            showNotification('Lixeira', `${_trash.length} item(ns) removidos.`, 'success');
        } catch (err) {
            console.error('[Trash]', err);
            showNotification('Erro', 'Não foi possível esvaziar.', 'danger');
        }
    };

    openPasswordConfirm(async (password) => {
        const ok = await verifyCurrentPassword(password);
        if (!ok) return false;
        await _pendingPasswordCallback();
        return true;
    });
}

export function openPasswordConfirm(onConfirm) {
    const modal = document.getElementById('password-confirm-modal');
    const input = document.getElementById('confirm-password-input');
    const btn = document.getElementById('password-confirm-btn');
    const errBox = document.getElementById('password-confirm-error');

    if (!modal || !input || !btn) return;

    input.value = '';
    if (errBox) { errBox.classList.add('hidden'); errBox.textContent = ''; }

    modal.classList.add('active');
    setTimeout(() => input.focus(), 100);

    const handler = async () => {
        const pwd = input.value;
        if (!pwd) {
            if (errBox) { errBox.textContent = 'Digite sua senha.'; errBox.classList.remove('hidden'); }
            return;
        }

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Verificando...';

        try {
            const ok = await onConfirm(pwd);
            if (ok) {
                closePasswordConfirm();
            } else {
                if (errBox) {
                    errBox.textContent = 'Senha incorreta.';
                    errBox.classList.remove('hidden');
                }
                input.value = '';
                input.focus();
            }
        } catch (e) {
            console.error(e);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    btn.onclick = handler;
    input.onkeydown = (e) => { if (e.key === 'Enter') handler(); };
}

export function closePasswordConfirm() {
    const modal = document.getElementById('password-confirm-modal');
    const input = document.getElementById('confirm-password-input');
    const errBox = document.getElementById('password-confirm-error');

    if (modal) modal.classList.remove('active');
    if (input) input.value = '';
    if (errBox) { errBox.classList.add('hidden'); errBox.textContent = ''; }
    _pendingPasswordCallback = null;
}

function updateSystemInfo() {
    const el = document.getElementById('info-total-trash');
    if (el) el.textContent = _trash.length;
}

window.restoreFromTrash = restoreFromTrash;
window.permanentlyDelete = permanentlyDelete;
window.closePasswordConfirm = closePasswordConfirm;