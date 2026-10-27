// ============================================================
// SSOT - PERFIL DO USUÁRIO (v10.3)
// ============================================================

import { ref, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { showNotification } from './utils.js';
import { getInitials, resizeImage } from './utils.js';
import { sstAlert } from './dialogs.js';
import { addHistory } from './history.js';

let _db = null;
let _currentUser = null;
let _isAdmin = false;
let _photoDataUrl = null;
let _prefix = 'up'; // 'up' para user, 'ap' para admin

export function setProfileContext(db, currentUser, isAdmin) {
    _db = db;
    _currentUser = currentUser;
    _isAdmin = isAdmin;
    _prefix = isAdmin ? 'ap' : 'up';
}

export function refreshProfileState() {
    _prefix = _isAdmin ? 'ap' : 'up';
}

export function populateProfileForm() {
    if (!_currentUser) return;
    _prefix = _isAdmin ? 'ap' : 'up';

    const set = (field, val) => {
        const el = document.getElementById(`${_prefix}-${field}`);
        if (el) el.value = val || '';
    };

    set('name', _currentUser.name);
    set('email', _currentUser.email);
    set('phone', _currentUser.phone);
    set('ramal', _currentUser.ramal);
    set('setor', _currentUser.setor);
    set('cargo', _currentUser.cargo);

    _photoDataUrl = _currentUser.photo || null;

    const preview = document.getElementById(`${_prefix}-photo-preview`);
    const removeBtn = document.getElementById(`${_prefix}-photo-remove`);
    if (preview) {
        if (_currentUser.photo) {
            preview.innerHTML = `<img src="${_currentUser.photo}" style="width:100%;height:100%;object-fit:cover;">`;
            if (removeBtn) removeBtn.style.display = 'inline-flex';
        } else {
            preview.innerHTML = '<svg class="si si-2x"><use href="#i-user"/></svg>';
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }
}

export async function handleProfilePhotoSelect(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
        await sstAlert('Imagem muito grande. Máximo 1MB.', 'Arquivo grande', 'warning');
        return;
    }
    try {
        const dataUrl = await resizeImage(file, 200);
        _photoDataUrl = dataUrl;
        const preview = document.getElementById(`${_prefix}-photo-preview`);
        const removeBtn = document.getElementById(`${_prefix}-photo-remove`);
        if (preview) preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    } catch (err) {
        console.error(err);
        await sstAlert('Não foi possível processar a imagem.', 'Erro', 'danger');
    }
}

export function handleProfilePhotoRemove() {
    _photoDataUrl = null;
    const preview = document.getElementById(`${_prefix}-photo-preview`);
    const removeBtn = document.getElementById(`${_prefix}-photo-remove`);
    const input = document.getElementById(`${_prefix}-photo-input`);
    if (preview) preview.innerHTML = '<svg class="si si-2x"><use href="#i-user"/></svg>';
    if (removeBtn) removeBtn.style.display = 'none';
    if (input) input.value = '';
}

export async function saveProfile() {
    if (!_currentUser || !_db) return;

    const get = (f) => document.getElementById(`${_prefix}-${f}`)?.value?.trim() || '';
    const name = get('name');
    const phone = get('phone');
    const ramal = get('ramal');
    const setor = get('setor');
    const cargo = get('cargo');

    if (!name) {
        await sstAlert('Informe seu nome completo.', 'Campo obrigatório', 'warning');
        return;
    }

    const btn = document.getElementById(`${_prefix}-save-btn`);
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
        const data = {
            name, phone, ramal, setor, cargo,
            photo: _photoDataUrl || null,
            updatedAt: new Date().toISOString(),
            updatedBy: _currentUser.name
        };

        await update(ref(_db, 'users/' + _currentUser.uid), data);

        // Atualiza estado local
        _currentUser.name = name;
        _currentUser.phone = phone;
        _currentUser.ramal = ramal;
        _currentUser.setor = setor;
        _currentUser.cargo = cargo;
        _currentUser.photo = _photoDataUrl || null;

        // Atualiza header
        const avatarEl = document.getElementById('user-avatar');
        if (avatarEl) {
            if (_photoDataUrl) {
                avatarEl.innerHTML = `<img src="${_photoDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                avatarEl.textContent = getInitials(name);
            }
        }
        const nameEl = document.getElementById('current-user');
        if (nameEl) nameEl.textContent = name;

        await addHistory('Perfil Atualizado', '-', `Nome: ${name}`);
        showNotification('Salvo', 'Perfil atualizado com sucesso!', 'success');
    } catch (err) {
        console.error(err);
        await sstAlert('Não foi possível salvar o perfil.', 'Erro', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}