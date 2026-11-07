// ============================================================
// SSOT - NOTIFICAÇÕES
// ============================================================

import {
    ref, set, remove, push, onValue, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { showNotification, escapeHtml, formatDateTime } from './utils.js';
import { addHistory } from './history.js';
import { sstConfirm } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _isAdmin = false;
let _notifications = [];
let _unsub = null;
let _isSubscribed = false;

export function setNotificationsContext(db, currentUser, isAdmin) {
    _db = db;
    _currentUser = currentUser;
    _isAdmin = isAdmin;
}

export function getNotifications() { return _notifications; }

export function subscribeNotifications() {
    if (!_db) return null;
    if (_unsub) { try { _unsub(); } catch (e) {} }
    _isSubscribed = true;

    _unsub = onValue(ref(_db, 'notifications'), (snap) => {
        _notifications = [];
        snap.forEach(child => {
            _notifications.push({ ...child.val(), id: child.key });
        });
        _notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (_isAdmin) {
            renderAdminNotificationsTable();
        }
        updateUserNotifBadge();
    }, (error) => console.error('[Notifications]', error));

    return _unsub;
}

export function unsubscribeNotifications() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    _isSubscribed = false;
}

// ============================================================
// ENVIAR (admin)
// ============================================================
export async function sendNotification(data) {
    if (!_db || !_currentUser) throw new Error('Não autenticado.');
    if (!_isAdmin) throw new Error('Apenas administradores podem enviar.');

    const title = (data.title || '').trim();
    const message = (data.message || '').trim();
    const type = data.type || 'info';
    const target = data.target || 'all';

    if (!title) throw new Error('Informe o título.');
    if (!message) throw new Error('Informe a mensagem.');

    const notif = {
        title, message, type, target,
        senderUid: _currentUser.uid,
        senderName: _currentUser.name,
        timestamp: new Date().toISOString(),
        readBy: {},
        active: true
    };

    const newRef = push(ref(_db, 'notifications'));
    await set(newRef, notif);

    await addHistory('Notificação Enviada', '-',
        `Para: ${target === 'all' ? 'Todos' : target} | Título: ${title}`);

    return { ...notif, id: newRef.key };
}

export async function deleteNotification(id) {
    const n = _notifications.find(x => x.id === id);
    if (!n) return;

    const ok = await sstConfirm(`Excluir a notificação "${n.title}"?`, 'Excluir', 'danger');
    if (!ok) return;

    try {
        await remove(ref(_db, 'notifications/' + id));
        await addHistory('Notificação Excluída', '-', `Título: ${n.title}`);
        showNotification('Excluída', 'Notificação removida.', 'success');
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

export async function markNotificationAsRead(notifId) {
    if (!_currentUser) return;
    try {
        await update(ref(_db, `notifications/${notifId}/readBy/${_currentUser.uid}`), true);
    } catch (err) {
        console.warn('[Notifications]', err);
    }
}

// ============================================================
// FILTROS
// ============================================================
function getMyNotifications() {
    if (!_currentUser) return [];
    return _notifications.filter(n => {
        if (n.active === false) return false;
        return n.target === 'all' || n.target === _currentUser.uid;
    });
}

function getUnreadCount() {
    if (!_currentUser) return 0;
    return getMyNotifications().filter(n => !n.readBy || !n.readBy[_currentUser.uid]).length;
}

export function updateUserNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    const count = getUnreadCount();
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ============================================================
// MODAL VISUALIZAR (usuário)
// ============================================================
export function openNotifViewModal() {
    const modal = document.getElementById('notif-view-modal');
    const list = document.getElementById('notif-view-list');
    if (!modal || !list) return;

    const mine = getMyNotifications();

    if (mine.length === 0) {
        list.innerHTML = `
            <div class="widget-empty">
                <svg class="si si-2x" style="opacity:0.3;margin-bottom:10px;"><use href="#i-bell"/></svg>
                Nenhuma notificação.
            </div>
        `;
    } else {
        list.innerHTML = mine.map(n => {
            const isRead = n.readBy && n.readBy[_currentUser.uid];
            return `
                <div class="notif-card ${n.type}" style="${isRead ? 'opacity:0.7;' : ''}">
                    <div class="notif-header">
                        <div class="notif-title">${escapeHtml(n.title)}</div>
                        <span class="notif-type">${getTypeLabel(n.type)}</span>
                    </div>
                    <div class="notif-message">${escapeHtml(n.message)}</div>
                    <div class="notif-footer">
                        <span>Enviado por: <strong>${escapeHtml(n.senderName || 'Admin')}</strong></span>
                        <span>${formatDateTime(n.timestamp)}</span>
                    </div>
                </div>
            `;
        }).join('');

        mine.forEach(n => {
            if (!n.readBy || !n.readBy[_currentUser.uid]) {
                markNotificationAsRead(n.id);
            }
        });
    }

    modal.classList.add('active');
    setTimeout(() => updateUserNotifBadge(), 300);
}

export function closeNotifViewModal() {
    document.getElementById('notif-view-modal')?.classList.remove('active');
}

// ============================================================
// MODAL ADMIN (listar enviadas)
// ============================================================
export function openNotifAdminModal() {
    if (!_isAdmin) return;
    renderAdminNotificationsTable();
    document.getElementById('notif-admin-modal')?.classList.add('active');
}

export function closeNotifAdminModal() {
    document.getElementById('notif-admin-modal')?.classList.remove('active');
}

// ============================================================
// MODAL ENVIAR (admin)
// ============================================================
export function openNotifModal() {
    if (!_isAdmin) return;
    const modal = document.getElementById('notif-modal');
    if (!modal) return;

    const targetSelect = document.getElementById('notif-target');
    if (targetSelect) {
        const users = window._getUsersForNotif ? window._getUsersForNotif() : [];
        let options = '<option value="all">Todos os usuários</option>';
        users.forEach(u => {
            if (u.uid && u.active !== false) {
                options += `<option value="${u.uid}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`;
            }
        });
        targetSelect.innerHTML = options;
    }

    document.getElementById('notif-title').value = '';
    document.getElementById('notif-message').value = '';
    document.getElementById('notif-type').value = 'info';

    modal.classList.add('active');
    setTimeout(() => document.getElementById('notif-title')?.focus(), 100);
}

export function closeNotifModal() {
    document.getElementById('notif-modal')?.classList.remove('active');
}

// ============================================================
// TABELA ADMIN
// ============================================================
export function renderAdminNotificationsTable() {
    const tbody = document.getElementById('admin-notifs-table');
    if (!tbody) return;

    if (_notifications.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="5" class="table-empty">
                <svg class="si si-2x"><use href="#i-bell"/></svg>
                <p>Nenhuma notificação enviada.</p>
            </td></tr>
        `;
        return;
    }

    const users = window._getUsersForNotif ? window._getUsersForNotif() : [];
    const userNameByUid = {};
    users.forEach(u => { userNameByUid[u.uid] = u.name; });

    tbody.innerHTML = _notifications.map(n => {
        const targetName = n.target === 'all'
            ? '<span class="badge badge-info">Todos</span>'
            : escapeHtml(userNameByUid[n.target] || n.target);

        return `
            <tr>
                <td>${formatDateTime(n.timestamp)}</td>
                <td>${targetName}</td>
                <td>
                    <strong>${escapeHtml(n.title)}</strong><br>
                    <small style="color:#7f8c8d;">${escapeHtml(n.message).substring(0, 80)}${n.message.length > 80 ? '...' : ''}</small>
                </td>
                <td>${escapeHtml(n.senderName || 'Admin')}</td>
                <td class="table-actions-col">
                    <div class="action-buttons" style="justify-content:flex-end;">
                        <button onclick="deleteNotification('${n.id}')" class="btn btn-danger btn-sm">
                            <svg class="si"><use href="#i-trash"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getTypeLabel(type) {
    const labels = { 'info': 'Info', 'success': 'Sucesso', 'warning': 'Aviso', 'danger': 'Urgente' };
    return labels[type] || 'Info';
}

window.deleteNotification = deleteNotification;
window.openNotifModal = openNotifModal;
window.closeNotifModal = closeNotifModal;
window.openNotifViewModal = openNotifViewModal;
window.closeNotifViewModal = closeNotifViewModal;
window.openNotifAdminModal = openNotifAdminModal;
window.closeNotifAdminModal = closeNotifAdminModal;