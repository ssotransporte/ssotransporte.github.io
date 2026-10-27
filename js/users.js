// ============================================================
// SSOT - GERENCIAMENTO DE USUÁRIOS (v11.1)
// ============================================================

import {
    ref, set, get, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { createUserSafely, getAuthErrorMessage } from './auth.js';
import {
    showNotification, escapeHtml, debounce,
    isValidEmail, isValidPassword, getInitials, resizeImage
} from './utils.js';
import { addHistory } from './history.js';
import { sstConfirm, sstAlert } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _users = [];
let _unsub = null;
let _isSubscribed = false;
let _editingId = null;
let _searchTerm = '';
let _filterRole = '';
let _photoDataUrl = null;

export function setUsersContext(db, currentUser) {
    _db = db;
    _currentUser = currentUser;
}

export function getUsers() { return _users; }

export function subscribeUsers(callback) {
    if (!_db) return null;
    if (_unsub) { try { _unsub(); } catch (e) {} }
    _isSubscribed = true;

    _unsub = onValue(ref(_db, 'users'), (snap) => {
        _users = [];
        snap.forEach(child => {
            _users.push({ ...child.val(), uid: child.key });
        });
        if (callback) callback(_users);
        updateUsersTable();
        updateUsersCount();
        if (_currentUser) {
            const me = _users.find(u => u.uid === _currentUser.uid);
            if (me) {
                _currentUser.photo = me.photo || null;
                _currentUser.name = me.name || _currentUser.name;
                _currentUser.phone = me.phone || '';
                _currentUser.ramal = me.ramal || '';
                _currentUser.setor = me.setor || '';
                _currentUser.cargo = me.cargo || '';
                refreshHeaderAvatar();
            }
        }
    }, (error) => console.error('[Users] Erro:', error));

    return _unsub;
}

export function unsubscribeUsers() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    _isSubscribed = false;
}

function refreshHeaderAvatar() {
    if (!_currentUser) return;
    const avatarEl = document.getElementById('user-avatar');
    if (!avatarEl) return;

    if (_currentUser.photo) {
        avatarEl.innerHTML = `<img src="${_currentUser.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
        avatarEl.textContent = getInitials(_currentUser.name);
    }
}

export function updateUsersTable() {
    const tbody = document.getElementById('users-table');
    if (!tbody) return;

    let filtered = _users.slice();

    if (_searchTerm) {
        const s = _searchTerm.toLowerCase();
        filtered = filtered.filter(u =>
            (u.name && u.name.toLowerCase().includes(s)) ||
            (u.email && u.email.toLowerCase().includes(s)) ||
            (u.setor && u.setor.toLowerCase().includes(s))
        );
    }

    if (_filterRole) filtered = filtered.filter(u => u.role === _filterRole);

    // ✅ ORDENAÇÃO: 1º Admin, 2º Setor, 3º Usuário, depois por nome.
    const roleWeight = { 'admin': 1, 'setor': 2, 'user': 3 };
    filtered.sort((a, b) => {
        const weightA = roleWeight[a.role] || 4;
        const weightB = roleWeight[b.role] || 4;
        if (weightA !== weightB) return weightA - weightB;
        return (a.name || '').localeCompare(b.name || '');
    });

    if (filtered.length === 0) {
        const isEmpty = _users.length === 0;
        tbody.innerHTML = `
            <tr><td colspan="6" class="table-empty">
                <svg class="si si-2x"><use href="#i-users-cog"/></svg>
                <p>${isEmpty ? 'Nenhum usuário cadastrado.' : 'Nenhum resultado.'}</p>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const roleBadge = u.role === 'admin'
            ? '<span class="role-admin">Administrador</span>'
            : u.role === 'setor'
                ? '<span class="role-setor">Setor</span>'
                : '<span class="role-user">Usuário</span>';

        const statusBadge = u.active === false
            ? '<span class="badge badge-danger">Inativo</span>'
            : '<span class="badge badge-success">Ativo</span>';

        const isMe = u.uid === _currentUser?.uid;
        const meTag = isMe ? '<span class="badge badge-info" style="font-size:0.6rem;margin-left:4px;">Você</span>' : '';
        const googleTag = u.provider === 'google'
            ? '<span style="color:#4285F4;margin-left:5px;font-weight:700;font-size:0.75rem;" title="Conta Google">G</span>'
            : '';

        const photoHtml = u.photo
            ? `<img src="${u.photo}" alt="${escapeHtml(u.name || '')}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #e9ecef;">`
            : `<div style="width:36px;height:36px;border-radius:50%;background:#2c3e50;color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;">${getInitials(u.name || u.email || 'U')}</div>`;

        return `
            <tr>
                <td style="width:60px;">${photoHtml}</td>
                <td><div style="font-weight:600;color:#2c3e50;">${escapeHtml(u.name || '—')}${meTag}${googleTag}</div></td>
                <td>${escapeHtml(u.email || '—')}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
                <td class="table-actions-col">
                    <div class="action-buttons" style="justify-content:flex-end;">
                        <button onclick="editUser('${u.uid}')" class="btn btn-secondary btn-sm" title="Editar">
                            <svg class="si"><use href="#i-edit"/></svg>
                        </button>
                        ${!isMe ? `
                            <button onclick="deleteUser('${u.uid}')" class="btn btn-danger btn-sm" title="Excluir">
                                <svg class="si"><use href="#i-trash"/></svg>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateUsersCount() {
    const el = document.getElementById('users-count');
    if (el) el.textContent = _users.length;
}

export function setupUserFilters() {
    const searchEl = document.getElementById('users-search');
    const roleEl = document.getElementById('users-filter-role');

    if (searchEl) {
        searchEl.addEventListener('input', debounce((e) => {
            _searchTerm = e.target.value.trim();
            updateUsersTable();
        }, 300));
    }
    if (roleEl) {
        roleEl.addEventListener('change', (e) => {
            _filterRole = e.target.value;
            updateUsersTable();
        });
    }
}

// ============================================================
// MODAL
// ============================================================
export function openUserModal(userUid = null) {
    _editingId = userUid;
    _photoDataUrl = null;

    const modal = document.getElementById('user-modal');
    const title = document.getElementById('user-modal-title');
    const pwdGroup = document.getElementById('user-password-group');
    const photoPreview = document.getElementById('user-photo-preview');
    const photoRemoveBtn = document.getElementById('user-photo-remove');
    const photoInput = document.getElementById('user-photo-input');

    if (!modal || !title) return;

    if (photoInput) photoInput.value = '';
    if (photoPreview) photoPreview.innerHTML = '<svg class="si si-2x"><use href="#i-user"/></svg>';
    if (photoRemoveBtn) photoRemoveBtn.style.display = 'none';

    if (userUid) {
        const u = _users.find(x => x.uid === userUid);
        if (!u) return;

        title.innerHTML = 'Editar Usuário';
        document.getElementById('user-name').value = u.name || '';
        document.getElementById('user-email').value = u.email || '';
        document.getElementById('user-phone').value = u.phone || '';
        document.getElementById('user-setor').value = u.setor || '';
        document.getElementById('user-ramal').value = u.ramal || '';
        document.getElementById('user-cargo').value = u.cargo || '';
        document.getElementById('user-role').value = u.role || 'user';
        document.getElementById('user-active').checked = u.active !== false;

        if (u.photo && photoPreview) {
            photoPreview.innerHTML = `<img src="${u.photo}" style="width:100%;height:100%;object-fit:cover;">`;
            _photoDataUrl = u.photo;
            if (photoRemoveBtn) photoRemoveBtn.style.display = 'inline-flex';
        }

        if (pwdGroup) pwdGroup.classList.add('hidden');
    } else {
        title.innerHTML = 'Novo Usuário';
        ['user-name','user-email','user-phone','user-setor','user-ramal','user-cargo','user-password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('user-role').value = 'user';
        document.getElementById('user-active').checked = true;
        if (pwdGroup) pwdGroup.classList.remove('hidden');
    }

    modal.classList.add('active');
    setTimeout(() => document.getElementById('user-name')?.focus(), 100);
}

export function closeUserModal() {
    document.getElementById('user-modal')?.classList.remove('active');
    _editingId = null;
    _photoDataUrl = null;
    const input = document.getElementById('user-photo-input');
    if (input) input.value = '';
}

export function editUser(uid) { openUserModal(uid); }

export async function handlePhotoSelect(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
        await sstAlert('Imagem muito grande. Máximo 1MB.', 'Arquivo grande', 'warning');
        return;
    }
    try {
        const dataUrl = await resizeImage(file, 200);
        _photoDataUrl = dataUrl;
        const preview = document.getElementById('user-photo-preview');
        const removeBtn = document.getElementById('user-photo-remove');
        if (preview) preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    } catch (err) {
        console.error(err);
        await sstAlert('Não foi possível processar a imagem.', 'Erro', 'danger');
    }
}

export function handlePhotoRemove() {
    _photoDataUrl = null;
    const preview = document.getElementById('user-photo-preview');
    const removeBtn = document.getElementById('user-photo-remove');
    const input = document.getElementById('user-photo-input');
    if (preview) preview.innerHTML = '<svg class="si si-2x"><use href="#i-user"/></svg>';
    if (removeBtn) removeBtn.style.display = 'none';
    if (input) input.value = '';
}

export async function saveUser() {
    const name = document.getElementById('user-name')?.value.trim() || '';
    const email = document.getElementById('user-email')?.value.trim().toLowerCase() || '';
    const phone = document.getElementById('user-phone')?.value.trim() || '';
    const setor = document.getElementById('user-setor')?.value.trim() || '';
    const ramal = document.getElementById('user-ramal')?.value.trim() || '';
    const cargo = document.getElementById('user-cargo')?.value.trim() || '';
    const password = document.getElementById('user-password')?.value || '';
    const role = document.getElementById('user-role')?.value || 'user';
    const active = document.getElementById('user-active')?.checked !== false;

    if (!name) { await sstAlert('Informe o nome completo.', 'Obrigatório', 'warning'); return; }
    if (!email) { await sstAlert('Informe o e-mail.', 'Obrigatório', 'warning'); return; }
    if (!isValidEmail(email)) { await sstAlert('E-mail inválido.', 'Verifique', 'warning'); return; }

    const existing = _users.find(u => u.email === email && u.uid !== _editingId);
    if (existing) {
        await sstAlert(`E-mail já em uso por ${existing.name || 'outro usuário'}.`, 'E-mail duplicado', 'warning');
        return;
    }

    const btn = document.getElementById('save-user-btn');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
        if (_editingId) {
            const updateData = {
                name, email, phone, setor, ramal, cargo, role, active,
                updatedAt: new Date().toISOString(),
                updatedBy: _currentUser?.name || 'Sistema'
            };
            if (_photoDataUrl) updateData.photo = _photoDataUrl;
            else updateData.photo = null;

            await update(ref(_db, 'users/' + _editingId), updateData);
            await addHistory('Usuário Editado', _editingId,
                `Nome: ${name} | Perfil: ${role} | Por: ${_currentUser?.name}`);
            showNotification('Atualizado', `${name} atualizado!`, 'success');
        } else {
            if (!isValidPassword(password)) {
                await sstAlert('A senha deve ter no mínimo 6 caracteres.', 'Senha inválida', 'warning');
                return;
            }
            const dupCheck = _users.find(u => u.email === email);
            if (dupCheck) {
                await sstAlert('Este e-mail já está cadastrado.', 'E-mail duplicado', 'warning');
                return;
            }

            let uid;
            try {
                uid = await createUserSafely(email, password);
            } catch (err) {
                console.error('[Users] Auth:', err);
                if (err.code === 'auth/email-already-in-use') {
                    throw new Error('Este e-mail já existe no Firebase Auth.');
                }
                throw new Error(getAuthErrorMessage(err));
            }

            const userData = {
                name, email, phone, setor, ramal, cargo, role, active,
                provider: 'password',
                createdAt: new Date().toISOString(),
                createdBy: _currentUser?.name || 'Sistema'
            };
            if (_photoDataUrl) userData.photo = _photoDataUrl;

            await set(ref(_db, 'users/' + uid), userData);
            const verify = await get(ref(_db, 'users/' + uid));
            if (!verify.exists()) throw new Error('Falha ao salvar perfil.');

            await addHistory('Usuário Criado', uid,
                `Nome: ${name} | Perfil: ${role} | Por: ${_currentUser?.name}`);

            const labels = { admin: 'Administrador', setor: 'Setor', user: 'Usuário Comum' };
            showNotification('Usuário Criado', `${name} criado como ${labels[role] || role}!`, 'success');
        }

        closeUserModal();
    } catch (err) {
        console.error('[Users]', err);
        await sstAlert(err.message || 'Erro ao salvar usuário.', 'Erro', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

export async function deleteUser(uid) {
    const u = _users.find(x => x.uid === uid);
    if (!u) return;
    if (u.uid === _currentUser?.uid) {
        await sstAlert('Você não pode excluir sua própria conta.', 'Não permitido', 'warning');
        return;
    }

    const ok = await sstConfirm(
        `Excluir o usuário "${u.name}"?\n\nE-mail: ${u.email}\n\nA conta perderá o acesso imediatamente.`,
        'Excluir Usuário',
        'danger'
    );
    if (!ok) return;

    try {
        await remove(ref(_db, 'users/' + uid));
        await set(ref(_db, 'deleted_users/' + uid), {
            name: u.name || '', email: u.email || '', role: u.role || 'user',
            setor: u.setor || '',
            deletedAt: new Date().toISOString(),
            deletedBy: _currentUser?.name || 'Sistema'
        });
        await addHistory('Usuário Excluído', uid,
            `Nome: ${u.name} | E-mail: ${u.email} | Por: ${_currentUser?.name}`);
        showNotification('Excluído', `${u.name} foi removido.`, 'success');
    } catch (err) {
        console.error('[Users]', err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;
window.editUser = editUser;
window.deleteUser = deleteUser;