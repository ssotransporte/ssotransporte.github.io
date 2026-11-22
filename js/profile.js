// ============================================================
// SSOT - PERFIL DO USUÁRIO (v11.0)
// Novidades v11.0:
//  - FEAT: Solicitação de exclusão de conta
//    (dupla confirmação + senha + aprovação admin)
//  - Bloqueio de nome/e-mail por 30 dias após exclusão
// ============================================================

import { ref, update, set, get, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { showNotification } from './utils.js';
import { getInitials, resizeImage } from './utils.js';
import { sstAlert, sstConfirm, sstPrompt } from './dialogs.js';
import { addHistory } from './history.js';

let _db = null;
let _currentUser = null;
let _isAdmin = false;
let _photoDataUrl = null;
let _prefix = 'up';

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

        _currentUser.name = name;
        _currentUser.phone = phone;
        _currentUser.ramal = ramal;
        _currentUser.setor = setor;
        _currentUser.cargo = cargo;
        _currentUser.photo = _photoDataUrl || null;

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

// ============================================================
// EXCLUIR CONTA (v11.0)
// ============================================================
export async function requestAccountDeletion() {
    if (!_currentUser || !_db) {
        showNotification('Erro', 'Sessão expirada.', 'danger');
        return;
    }

    // Já tem solicitação pendente?
    try {
        const existing = await get(ref(_db, 'account_deletions/' + _currentUser.uid));
        if (existing.exists()) {
            const data = existing.val();
            if (data.status === 'pendente') {
                await sstAlert(
                    `Você já tem uma solicitação de exclusão pendente.\n\n` +
                    `Solicitada em: ${new Date(data.requestedAt).toLocaleString('pt-BR')}\n\n` +
                    `Aguarde a análise do administrador.`,
                    'Já solicitado',
                    'warning'
                );
                return;
            }
        }
    } catch (e) { console.warn(e); }

    // 1ª confirmação — lista de consequências
    const ok1 = await sstConfirm(
        'ATENÇÃO — Exclusão de Conta\n\n' +
        '• Todos os seus dados serão removidos do sistema\n' +
        '• Você NÃO poderá mais acessar o sistema\n' +
        '• Seu nome e e-mail ficarão BLOQUEADOS por 30 dias\n' +
        '• A ação requer APROVAÇÃO de um administrador\n\n' +
        'Deseja continuar?',
        'Excluir Minha Conta',
        'danger'
    );
    if (!ok1) return;

    // Pedir senha
    const password = await sstPrompt(
        'Digite sua senha para confirmar a exclusão:',
        '',
        'Confirmação de Segurança'
    );
    if (password === null) return;
    if (!password) {
        showNotification('Cancelado', 'Senha não informada.', 'warning');
        return;
    }

    // Verificar senha
    const { verifyCurrentPassword } = await import('./auth.js');
    const valid = await verifyCurrentPassword(password);
    if (!valid) {
        await sstAlert('Senha incorreta. A solicitação foi cancelada por segurança.', 'Não autorizado', 'danger');
        return;
    }

    // Última confirmação
    const ok2 = await sstConfirm(
        'Última confirmação.\n\n' +
        'Sua conta será marcada para exclusão e você será desconectado após a aprovação do administrador.\n\n' +
        'Confirmar?',
        'Confirmar Exclusão',
        'danger'
    );
    if (!ok2) return;

    // Salvar solicitação
    try {
        await set(ref(_db, 'account_deletions/' + _currentUser.uid), {
            uid: _currentUser.uid,
            name: _currentUser.name,
            email: _currentUser.email,
            role: _currentUser.role || 'user',
            setor: _currentUser.setor || '',
            ramal: _currentUser.ramal || '',
            cargo: _currentUser.cargo || '',
            requestedAt: new Date().toISOString(),
            requestedBy: _currentUser.name,
            status: 'pendente',
            requestedFrom: 'profile-tab'
        });

        await addHistory(
            'Exclusão de Conta Solicitada',
            '-',
            `Nome: ${_currentUser.name} | E-mail: ${_currentUser.email}`
        );

        await sstAlert(
            'Sua solicitação de exclusão foi ENVIADA.\n\n' +
            'Um administrador irá analisar o pedido. Após aprovação:\n\n' +
            '• Você será desconectado automaticamente\n' +
            '• Seus dados serão removidos\n' +
            '• Nome e e-mail ficarão bloqueados por 30 dias\n\n' +
            'Você pode continuar usando o sistema enquanto aguarda.',
            'Solicitação Enviada',
            'info'
        );

        showNotification('Solicitação enviada', 'Aguarde aprovação do administrador.', 'info', 6000);
    } catch (err) {
        console.error('[Profile] requestAccountDeletion:', err);
        await sstAlert('Não foi possível solicitar a exclusão. Tente novamente.', 'Erro', 'danger');
    }
}

window.requestAccountDeletion = requestAccountDeletion;
