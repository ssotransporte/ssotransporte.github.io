// ============================================================
// SSOT - SOLICITAÇÕES DE TRANSPORTE (v14.1 corrigido)
// Novidades v14.1:
//  - FEAT: Botão "Registro" com filtro por período (7d, 30d, Custom)
//  - Mantido v14.0 (Paginação admin + PDF inline)
//  - FIX: renderPagination completa + exports para onclick inline
// ============================================================

import {
    ref, set, remove, update, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
    showNotification, showAlert, formatDateTime, escapeHtml, debounce,
    getStatusText, getStatusBadgeClass, getPrioridadeBadgeClass,
    getVeiculoText, truncate
} from './utils.js';

import { addHistory } from './history.js';
import { sstConfirm, sstPrompt } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _requests = [];
let _nextNumber = 1;
let _unsub = null;
let _highlightedId = null;

// Paginação admin
let _adminPage = 0;
const ADMIN_PAGE_SIZE = 5;

export function setRequestsContext(db, currentUser) {
    _db = db;
    _currentUser = currentUser;
}

export function getRequests() { return _requests; }
export function setRequestsHighlight(id) { _highlightedId = id; }

export function subscribeRequests(callback) {
    if (!_db) return null;
    if (_unsub) { try { _unsub(); } catch (e) {} }

    _unsub = onValue(ref(_db, 'requests'), (snap) => {
        _requests = [];
        snap.forEach(child => {
            _requests.push({ ...child.val(), id: child.key });
        });
        _nextNumber = computeNextNumber();
        if (callback) callback(_requests);
        updateAllTables();
        updateRequestsCount();
    }, (error) => console.error('[Requests]', error));

    return _unsub;
}

export function unsubscribeRequests() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
}

function computeNextNumber() {
    if (_requests.length === 0) return 1;
    let max = 0;
    _requests.forEach(r => {
        const n = parseInt(String(r.numero || '').replace(/\D/g, ''));
        if (!isNaN(n) && n > max) max = n;
    });
    return max + 1;
}

export function generateNextNumero() {
    return 'SSOT' + _nextNumber.toString().padStart(5, '0');
}

// ============================================================
// CRIAR
// ============================================================
export async function createRequest(formData) {
    if (!_currentUser) throw new Error('Usuário não autenticado.');

    const numero = generateNextNumero();
    const req = {
        numero,
        solicitante: formData.solicitante || _currentUser.name,
        email: formData.email || _currentUser.email,
        ramal: formData.ramal || '',
        setor: formData.setor || '',
        cargo: formData.cargo || '',
        destino: formData.destino,
        origem: formData.origem || '',
        finalidade: formData.finalidade,
        prioridade: formData.prioridade || 'normal',
        saida: formData.saida,
        retorno: formData.retorno || '',
        passageiros: formData.passageiros || '1',
        veiculo: formData.veiculo || 'carro',
        necessidades: formData.necessidades || '',
        nomesPassageiros: formData.nomesPassageiros || '',
        observacoes: formData.observacoes || '',
        solicitanteUid: _currentUser.uid,
        solicitanteEmail: _currentUser.email,
        dataSolicitacao: new Date().toISOString().slice(0, 10),
        status: 'pendente',
        timestamp: new Date().toISOString(),
        updatedBy: _currentUser.name
    };

    const newRef = push(ref(_db, 'requests'));
    await set(newRef, req);

    await addHistory('Solicitação Criada', numero,
        `Destino: ${formData.destino} | Solicitante: ${req.solicitante}`);

    return { ...req, id: newRef.key };
}

export async function createAdminRequest(formData) {
    if (!_currentUser) throw new Error('Usuário não autenticado.');

    const numero = generateNextNumero();
    const req = {
        numero,
        solicitante: formData.solicitante,
        email: formData.email,
        ramal: formData.ramal,
        setor: formData.setor,
        cargo: formData.cargo,
        destino: formData.destino,
        origem: formData.origem,
        finalidade: formData.finalidade,
        prioridade: formData.prioridade,
        saida: formData.saida,
        retorno: formData.retorno,
        passageiros: formData.passageiros,
        veiculo: 'carro',
        necessidades: formData.necessidades,
        nomesPassageiros: formData.nomesPassageiros,
        observacoes: formData.observacoes,
        solicitanteUid: _currentUser.uid,
        solicitanteEmail: formData.email,
        dataSolicitacao: new Date().toISOString().slice(0, 10),
        status: 'pendente',
        timestamp: new Date().toISOString(),
        updatedBy: _currentUser.name
    };

    const newRef = push(ref(_db, 'requests'));
    await set(newRef, req);

    await addHistory('Solicitação Criada (Admin)', numero,
        `Destino: ${formData.destino} | Solicitante: ${req.solicitante}`);

    return { ...req, id: newRef.key };
}

// ============================================================
// STATUS
// ============================================================
export async function changeRequestStatus(id, newStatus) {
    const r = _requests.find(x => x.id === id);
    if (!r) return;
    const oldStatus = r.status;

    try {
        await update(ref(_db, 'requests/' + id), {
            status: newStatus,
            timestamp: new Date().toISOString(),
            updatedBy: _currentUser?.name || 'Sistema'
        });

        await addHistory('Status Alterado', r.numero,
            `De "${getStatusText(oldStatus)}" para "${getStatusText(newStatus)}" | Por: ${_currentUser?.name}`);

        showNotification('Atualizado',
            `Solicitação ${r.numero}: ${getStatusText(newStatus)}.`, 'success');
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível atualizar.', 'danger');
    }
}

// ============================================================
// SOLICITAR CANCELAMENTO
// ============================================================
export async function requestCancellation(id) {
    const r = _requests.find(x => x.id === id);
    if (!r) {
        showNotification('Erro', 'Solicitação não encontrada.', 'danger');
        return;
    }
    if (!_currentUser) {
        showNotification('Erro', 'Sessão expirada.', 'danger');
        return;
    }
    if (r.status !== 'aprovada' && r.status !== 'em-andamento') {
        showNotification('Não permitido',
            'Só é possível solicitar cancelamento de solicitações Aprovadas ou Em Andamento.',
            'warning');
        return;
    }

    const reason = await sstPrompt(
        `Motivo do cancelamento da solicitação ${r.numero} (opcional):`,
        '',
        'Solicitar Cancelamento'
    );
    if (reason === null) return;

    const ok = await sstConfirm(
        `Solicitar cancelamento da solicitação ${r.numero}?\n\n` +
        `Destino: ${r.destino}\n` +
        `Saída: ${formatDateTime(r.saida)}\n\n` +
        `O horário será liberado na agenda automaticamente.`,
        'Confirmar Cancelamento',
        'warning'
    );
    if (!ok) return;

    try {
        if (r.saida && r.saida.includes('T')) {
            const [date, time] = r.saida.split('T');
            if (date && time) {
                try {
                    const schedule = await import('./schedule.js');
                    await schedule.freeSlot(date, time.substring(0, 5));
                } catch (e) { console.warn('[Requests] freeSlot:', e); }
            }
        }

        const now = new Date().toISOString();
        await update(ref(_db, 'requests/' + id), {
            status: 'cancelada',
            cancellationRequest: {
                requestedAt: now,
                requestedBy: _currentUser?.name || 'Sistema',
                reason: (reason || '').trim(),
                status: 'aprovado'
            },
            cancelledAt: now,
            cancelledBy: _currentUser?.name || 'Sistema',
            updatedBy: _currentUser?.name || 'Sistema',
            timestamp: now
        });

        await addHistory('Cancelamento Solicitado', r.numero,
            `Motivo: ${(reason || '').trim() || '(não informado)'} | Por: ${_currentUser?.name}`);

        closeViewModal();
        showNotification('Cancelada', `Solicitação ${r.numero} cancelada.`, 'success');
    } catch (err) {
        console.error('[Requests] requestCancellation:', err);
        showNotification('Erro', 'Não foi possível cancelar.', 'danger');
    }
}

// ============================================================
// EDITAR HORÁRIOS
// ============================================================
export function openEditHoursModal(id) {
    const r = _requests.find(x => x.id === id);
    if (!r) {
        showNotification('Erro', 'Solicitação não encontrada.', 'danger');
        return;
    }
    if (r.status !== 'em-andamento' && r.status !== 'concluida') {
        showNotification('Não permitido',
            'Só é possível editar horários de solicitações Em Andamento ou Concluídas.',
            'warning');
        return;
    }

    const idEl = document.getElementById('edit-hours-request-id');
    const numEl = document.getElementById('edit-hours-numero');
    const statusEl = document.getElementById('edit-hours-status');
    const saidaEl = document.getElementById('edit-hours-saida');
    const retornoEl = document.getElementById('edit-hours-retorno');

    if (!idEl || !saidaEl || !retornoEl) return;

    idEl.value = id;
    if (numEl) numEl.textContent = r.numero;
    if (statusEl) statusEl.textContent = getStatusText(r.status);

    saidaEl.value = toDatetimeLocal(r.saida);
    retornoEl.value = toDatetimeLocal(r.retorno);

    const errBox = document.getElementById('edit-hours-error');
    if (errBox) { errBox.classList.add('hidden'); errBox.textContent = ''; }

    window.openModal('edit-hours-modal');
}

function toDatetimeLocal(value) {
    if (!value) return '';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00`;
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function saveRequestHours() {
    const id = document.getElementById('edit-hours-request-id')?.value;
    if (!id) return;
    const r = _requests.find(x => x.id === id);
    if (!r) return;
    if (r.status !== 'em-andamento' && r.status !== 'concluida') {
        showNotification('Não permitido', 'Status não permite edição.', 'warning');
        return;
    }

    const newSaida = document.getElementById('edit-hours-saida')?.value || '';
    const newRetorno = document.getElementById('edit-hours-retorno')?.value || '';
    const errBox = document.getElementById('edit-hours-error');
    if (!newSaida) {
        if (errBox) { errBox.textContent = 'Data/hora de saída é obrigatória.'; errBox.classList.remove('hidden'); }
        return;
    }

    const oldSaida = r.saida || '';
    const btn = document.getElementById('edit-hours-save-btn');
    const originalHTML = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    if (errBox) errBox.classList.add('hidden');

    try {
        if (newSaida !== oldSaida) {
            if (oldSaida && oldSaida.includes('T')) {
                const [oldDate, oldTime] = oldSaida.split('T');
                if (oldDate && oldTime) {
                    try {
                        const schedule = await import('./schedule.js');
                        await schedule.freeSlot(oldDate, oldTime.substring(0, 5));
                    } catch (e) { console.warn(e); }
                }
            }
            if (newSaida.includes('T')) {
                const [newDate, newTime] = newSaida.split('T');
                if (newDate && newTime) {
                    try {
                        const schedule = await import('./schedule.js');
                        await schedule.reserveSlot(newDate, newTime.substring(0, 5), r.numero);
                    } catch (e) { console.warn(e); }
                }
            }
        }

        await update(ref(_db, 'requests/' + id), {
            saida: newSaida,
            retorno: newRetorno,
            updatedAt: new Date().toISOString(),
            updatedBy: _currentUser?.name || 'Sistema'
        });

        const oldSaidaFmt = oldSaida ? formatDateTime(oldSaida) : '—';
        const newSaidaFmt = formatDateTime(newSaida);
        await addHistory('Horários Editados', r.numero,
            `Saída: ${oldSaidaFmt} → ${newSaidaFmt} | Por: ${_currentUser?.name}`);

        window.closeModal('edit-hours-modal');
        showNotification('Atualizado', 'Horários atualizados.', 'success');
    } catch (err) {
        console.error('[Requests] saveRequestHours:', err);
        if (errBox) { errBox.textContent = 'Erro: ' + (err.message || ''); errBox.classList.remove('hidden'); }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}

// ============================================================
// LIXEIRA
// ============================================================
export async function moveToTrash(id) {
    const r = _requests.find(x => x.id === id);
    if (!r) return;

    const ok = await sstConfirm(
        `Excluir a solicitação ${r.numero}?\n\n` +
        `Destino: ${r.destino}\nSolicitante: ${r.solicitante}\n\n` +
        `Ela irá para a lixeira e o horário será liberado.`,
        'Excluir Solicitação',
        'warning'
    );
    if (!ok) return;

    try {
        if (r.saida && r.saida.includes('T')) {
            const [date, time] = r.saida.split('T');
            if (date && time) {
                try {
                    const schedule = await import('./schedule.js');
                    await schedule.freeSlot(date, time.substring(0, 5));
                } catch (e) { console.warn(e); }
            }
        }

        const trashRef = push(ref(_db, 'trash'));
        await set(trashRef, {
            request: r,
            deletedAt: new Date().toISOString(),
            deletedBy: _currentUser?.name || 'Sistema'
        });

        await remove(ref(_db, 'requests/' + id));
        await addHistory('Solicitação Excluída', r.numero,
            `Movida para lixeira por ${_currentUser?.name}`);
        showNotification('Excluída', `Solicitação ${r.numero} movida para lixeira.`, 'success');
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

// ============================================================
// REGISTRO (NOVO)
// ============================================================
export function openRegistroModal() {
    const modal = document.getElementById('registro-modal');
    if (modal) modal.classList.add('active');

    const periodSelect = document.getElementById('registro-periodo');
    if (periodSelect) periodSelect.value = '7';

    const customDates = document.getElementById('registro-custom-dates');
    if (customDates) customDates.style.display = 'none';

    calculateRegistros();
}

export function closeRegistroModal() {
    const modal = document.getElementById('registro-modal');
    if (modal) modal.classList.remove('active');
}

export function toggleRegistroCustomDates() {
    const val = document.getElementById('registro-periodo')?.value;
    const box = document.getElementById('registro-custom-dates');

    if (val === 'custom') {
        if (box) box.style.display = 'grid';
        const today = new Date();
        const past = new Date();
        past.setDate(today.getDate() - 7);

        const ini = document.getElementById('registro-data-ini');
        const fim = document.getElementById('registro-data-fim');
        if (ini) ini.value = past.toISOString().slice(0, 10);
        if (fim) fim.value = today.toISOString().slice(0, 10);
    } else {
        if (box) box.style.display = 'none';
    }
    calculateRegistros();
}

export function calculateRegistros() {
    const period = document.getElementById('registro-periodo')?.value;
    let count = 0;
    const now = new Date();

    if (period === '7' || period === '30') {
        const days = parseInt(period);
        const limitDate = new Date();
        limitDate.setDate(now.getDate() - days);
        limitDate.setHours(0, 0, 0, 0);

        count = _requests.filter(r => {
            if (!r.timestamp) return false;
            return new Date(r.timestamp) >= limitDate;
        }).length;
    } else if (period === 'custom') {
        const ini = document.getElementById('registro-data-ini')?.value;
        const fim = document.getElementById('registro-data-fim')?.value;
        if (!ini || !fim) {
            const totalEl = document.getElementById('registro-total');
            if (totalEl) totalEl.textContent = '0';
            return;
        }

        const dIni = new Date(ini + 'T00:00:00');
        const dFim = new Date(fim + 'T23:59:59');

        count = _requests.filter(r => {
            if (!r.timestamp) return false;
            const d = new Date(r.timestamp);
            return d >= dIni && d <= dFim;
        }).length;
    }

    const totalEl = document.getElementById('registro-total');
    if (totalEl) totalEl.textContent = count;
}

// ============================================================
// TABELAS
// ============================================================
export function updateUserTable() {
    const tbody = document.getElementById('user-requests-table');
    if (!tbody || !_currentUser) return;

    const search = (document.getElementById('user-search')?.value || '').toLowerCase();

    let mine = _requests.filter(r =>
        r.solicitanteUid === _currentUser.uid ||
        r.solicitanteEmail === _currentUser.email
    );

    if (search) {
        mine = mine.filter(r =>
            (r.numero && r.numero.toLowerCase().includes(search)) ||
            (r.destino && r.destino.toLowerCase().includes(search)) ||
            (r.finalidade && r.finalidade.toLowerCase().includes(search))
        );
    }

    if (mine.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="table-empty">
                <svg class="si si-2x"><use href="#i-clipboard"/></svg>
                <p>${search ? 'Nenhum resultado.' : 'Você ainda não fez solicitações.'}</p>
            </td></tr>
        `;
        return;
    }

    mine.sort((a, b) => {
        const na = parseInt(String(a.numero).replace(/\D/g, '')) || 0;
        const nb = parseInt(String(b.numero).replace(/\D/g, '')) || 0;
        return nb - na;
    });

    tbody.innerHTML = mine.map(r => {
        let actions = `
            <button onclick="viewRequest('${r.id}', false)" class="btn btn-primary btn-sm">
                <svg class="si"><use href="#i-eye"/></svg> Ver
            </button>
        `;
        if (r.status === 'aprovada' || r.status === 'em-andamento') {
            actions += `
                <button onclick="window.requestCancellation('${r.id}')" class="btn btn-warning btn-sm" style="margin-left:6px;" title="Solicitar cancelamento">
                    <svg class="si"><use href="#i-x-circle"/></svg> Solicitar Cancelamento
                </button>
            `;
        }

        return `
            <tr>
                <td><strong>${escapeHtml(r.numero)}</strong></td>
                <td>${escapeHtml(r.destino)}</td>
                <td>${r.saida ? formatDateTime(r.saida) : '—'}</td>
                <td>${r.retorno ? formatDateTime(r.retorno) : '—'}</td>
                <td><span class="badge ${getStatusBadgeClass(r.status)}">${getStatusText(r.status)}</span></td>
                <td>${actions}</td>
            </tr>
        `;
    }).join('');
}

export function updateAdminTable() {
    const tbody = document.getElementById('admin-requests-table');
    if (!tbody) return;

    const search = (document.getElementById('admin-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('admin-filter-status')?.value || '';
    const userFilter = document.getElementById('admin-filter-user')?.value || '';
    const priorityFilter = document.getElementById('admin-filter-priority')?.value || '';

    let list = _requests.slice();

    if (search) {
        list = list.filter(r =>
            (r.numero && r.numero.toLowerCase().includes(search)) ||
            (r.solicitante && r.solicitante.toLowerCase().includes(search)) ||
            (r.setor && r.setor.toLowerCase().includes(search)) ||
            (r.destino && r.destino.toLowerCase().includes(search))
        );
    }
    if (statusFilter) list = list.filter(r => r.status === statusFilter);
    if (userFilter) list = list.filter(r => r.solicitanteEmail === userFilter);
    if (priorityFilter) list = list.filter(r => r.prioridade === priorityFilter);

    list.sort((a, b) => {
        const na = parseInt(String(a.numero).replace(/\D/g, '')) || 0;
        const nb = parseInt(String(b.numero).replace(/\D/g, '')) || 0;
        return nb - na;
    });

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    if (_adminPage >= totalPages) _adminPage = 0;
    const start = _adminPage * ADMIN_PAGE_SIZE;
    const pageItems = list.slice(start, start + ADMIN_PAGE_SIZE);

    if (total === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8" class="table-empty">
                <svg class="si si-2x"><use href="#i-clipboard"/></svg>
                <p>Nenhuma solicitação encontrada.</p>
            </td></tr>
        `;
        renderPagination(0, 1, 0);
        return;
    }

    tbody.innerHTML = pageItems.map(r => {
        const hl = (_highlightedId && r.id === _highlightedId) ? 'highlight' : '';
        return `
            <tr class="${hl}">
                <td><strong>${escapeHtml(r.numero)}</strong></td>
                <td>${escapeHtml(r.solicitante)}</td>
                <td>${escapeHtml(r.setor || '—')}</td>
                <td>${escapeHtml(r.destino)}</td>
                <td>${r.saida ? formatDateTime(r.saida) : '—'}</td>
                <td><span class="badge ${getPrioridadeBadgeClass(r.prioridade)}">${r.prioridade || 'normal'}</span></td>
                <td><span class="badge ${getStatusBadgeClass(r.status)}">${getStatusText(r.status)}</span></td>
                <td class="table-actions-col">
                    <div class="action-buttons" style="justify-content:flex-end;">
                        <button onclick="viewRequest('${r.id}', true)" class="btn btn-primary btn-sm">
                            <svg class="si"><use href="#i-eye"/></svg>
                        </button>
                        <button onclick="deleteRequest('${r.id}')" class="btn btn-danger btn-sm">
                            <svg class="si"><use href="#i-trash"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (_highlightedId) {
        const el = tbody.querySelector('tr.highlight');
        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
        _highlightedId = null;
    }

    renderPagination(_adminPage, totalPages, total);
}

// ============================================================
// PAGINAÇÃO (CORRIGIDO)
// ============================================================
function renderPagination(currentPage, totalPages, total) {
    const paginationEl = document.getElementById('admin-requests-pagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    const buttons = [];

    // Botão Anterior
    buttons.push(
        `<button class="btn btn-secondary btn-sm" ${currentPage === 0 ? 'disabled' : ''} onclick="goToAdminPage(${currentPage - 1})" title="Anterior">
            <svg class="si"><use href="#i-chevron-l"/></svg>
        </button>`
    );

    // Números de páginas com reticências
    const range = 2;
    for (let i = 0; i < totalPages; i++) {
        const inRange = (i >= currentPage - range && i <= currentPage + range);
        if (i === 0 || i === totalPages - 1 || inRange) {
            const cls = i === currentPage ? 'btn-primary' : 'btn-secondary';
            buttons.push(`<button class="btn ${cls} btn-sm" onclick="goToAdminPage(${i})">${i + 1}</button>`);
        } else if (i === currentPage - range - 1 || i === currentPage + range + 1) {
            buttons.push(`<span style="padding:0 6px;color:#7f8c8d;">…</span>`);
        }
    }

    // Botão Próximo
    buttons.push(
        `<button class="btn btn-secondary btn-sm" ${currentPage === totalPages - 1 ? 'disabled' : ''} onclick="goToAdminPage(${currentPage + 1})" title="Próximo">
            <svg class="si"><use href="#i-chevron-r"/></svg>
        </button>`
    );

    paginationEl.innerHTML = `
        <div class="fleet-pagination" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;flex-wrap:wrap;">
            ${buttons.join('')}
            <span style="margin-left:12px;font-size:0.85rem;color:#7f8c8d;">
                ${total} registro(s) · página ${currentPage + 1}/${totalPages}
            </span>
        </div>
    `;
}

export function goToAdminPage(page) {
    _adminPage = page;
    updateAdminTable();
}

// ============================================================
// VIEW / DELETE (chamados por onclick inline)
// ============================================================
export function viewRequest(id, isAdmin = false) {
    const r = _requests.find(x => x.id === id);
    if (!r) {
        showNotification('Erro', 'Solicitação não encontrada.', 'danger');
        return;
    }

    const title = document.getElementById('view-request-title');
    const details = document.getElementById('request-details');
    const qr = document.getElementById('view-qr-code');
    const footer = document.getElementById('view-modal-footer');

    if (title) title.textContent = `Solicitação ${r.numero}`;

    if (details) {
        details.innerHTML = `
            <div class="detail-grid">
                <div class="detail-item"><span class="detail-label">Número</span><span class="detail-value">${escapeHtml(r.numero)}</span></div>
                <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value"><span class="badge ${getStatusBadgeClass(r.status)}">${getStatusText(r.status)}</span></span></div>
                <div class="detail-item"><span class="detail-label">Solicitante</span><span class="detail-value">${escapeHtml(r.solicitante || '—')}</span></div>
                <div class="detail-item"><span class="detail-label">E-mail</span><span class="detail-value">${escapeHtml(r.email || '—')}</span></div>
                <div class="detail-item"><span class="detail-label">Ramal</span><span class="detail-value">${escapeHtml(r.ramal || '—')}</span></div>
                <div class="detail-item"><span class="detail-label">Setor</span><span class="detail-value">${escapeHtml(r.setor || '—')}</span></div>
                <div class="detail-item"><span class="detail-label">Cargo</span><span class="detail-value">${escapeHtml(r.cargo || '—')}</span></div>
                <div class="detail-item"><span class="detail-label">Destino</span><span class="detail-value">${escapeHtml(r.destino || '—')}</span></div>
                <div class="detail-item"><span class="detail-label">Origem</span><span class="detail-value">${escapeHtml(r.origem || '—')}</span></div>
                <div class="detail-item"><span class="detail-label">Finalidade</span><span class="detail-value">${escapeHtml(r.finalidade || '—')}</span></div>
                <div class="detail-item"><span class="detail-label">Saída</span><span class="detail-value">${r.saida ? formatDateTime(r.saida) : '—'}</span></div>
                <div class="detail-item"><span class="detail-label">Retorno</span><span class="detail-value">${r.retorno ? formatDateTime(r.retorno) : '—'}</span></div>
                <div class="detail-item"><span class="detail-label">Passageiros</span><span class="detail-value">${escapeHtml(r.passageiros || '1')}</span></div>
                <div class="detail-item"><span class="detail-label">Veículo</span><span class="detail-value">${getVeiculoText(r.veiculo)}</span></div>
                <div class="detail-item"><span class="detail-label">Prioridade</span><span class="detail-value"><span class="badge ${getPrioridadeBadgeClass(r.prioridade)}">${r.prioridade || 'normal'}</span></span></div>
                ${r.necessidades ? `<div class="detail-item" style="grid-column:1/-1;"><span class="detail-label">Necessidades Especiais</span><span class="detail-value">${escapeHtml(r.necessidades)}</span></div>` : ''}
                ${r.nomesPassageiros ? `<div class="detail-item" style="grid-column:1/-1;"><span class="detail-label">Nomes dos Passageiros</span><span class="detail-value">${escapeHtml(r.nomesPassageiros).replace(/\n/g, '<br>')}</span></div>` : ''}
                ${r.observacoes ? `<div class="detail-item" style="grid-column:1/-1;"><span class="detail-label">Observações</span><span class="detail-value">${escapeHtml(r.observacoes).replace(/\n/g, '<br>')}</span></div>` : ''}
            </div>
        `;
    }

    if (qr) {
        const baseUrl = window.location.origin + window.location.pathname;
        const deepLink = `${baseUrl}?request=${encodeURIComponent(r.id)}`;
        qr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(deepLink)}" alt="QR Code" style="width:150px;height:150px;">`;
    }

    if (footer) {
        let buttons = '';
        if (isAdmin) {
            if (r.status === 'pendente') {
                buttons += `<button class="btn btn-success" onclick="changeRequestStatus('${r.id}', 'aprovada')"><svg class="si"><use href="#i-check"/></svg> Aprovar</button>`;
                buttons += `<button class="btn btn-danger" onclick="changeRequestStatus('${r.id}', 'recusada')"><svg class="si"><use href="#i-x"/></svg> Recusar</button>`;
            }
            if (r.status === 'aprovada') {
                buttons += `<button class="btn btn-primary" onclick="changeRequestStatus('${r.id}', 'em-andamento')"><svg class="si"><use href="#i-play"/></svg> Iniciar</button>`;
            }
            if (r.status === 'em-andamento') {
                buttons += `<button class="btn btn-success" onclick="changeRequestStatus('${r.id}', 'concluida')"><svg class="si"><use href="#i-check-circle"/></svg> Concluir</button>`;
            }
            if (r.status === 'em-andamento' || r.status === 'concluida') {
                buttons += `<button class="btn btn-warning" onclick="openEditHoursModal('${r.id}')"><svg class="si"><use href="#i-clock"/></svg> Editar Horários</button>`;
            }
            buttons += `<button class="btn btn-info" onclick="viewRequestPDF('${r.id}')"><svg class="si"><use href="#i-file-pdf"/></svg> PDF</button>`;
        } else {
            if (r.status === 'aprovada' || r.status === 'em-andamento') {
                buttons += `<button class="btn btn-warning" onclick="requestCancellation('${r.id}')"><svg class="si"><use href="#i-x-circle"/></svg> Solicitar Cancelamento</button>`;
            }
        }
        buttons += `<button class="btn btn-secondary" onclick="closeViewModal()">Fechar</button>`;
        footer.innerHTML = `<div class="action-buttons">${buttons}</div>`;
    }

    // Garante handler do botão "X" do modal
    const closeBtn = document.getElementById('close-view-modal');
    if (closeBtn) closeBtn.onclick = closeViewModal;

    const modal = document.getElementById('view-request-modal');
    if (modal) modal.classList.add('active');
}

export function closeViewModal() {
    const modal = document.getElementById('view-request-modal');
    if (modal) modal.classList.remove('active');
}

export function deleteRequest(id) {
    return moveToTrash(id);
}

export function viewRequestPDF(id) {
    const r = _requests.find(x => x.id === id);
    if (!r) return;
    if (window.generateRequestPDF) {
        window.generateRequestPDF(r);
    } else {
        showNotification('Erro', 'Gerador de PDF não disponível.', 'danger');
    }
}

// ============================================================
// CONTADORES
// ============================================================
function updateRequestsCount() {
    const el = document.getElementById('user-requests-count');
    if (el && _currentUser) {
        el.textContent = _requests.filter(r =>
            r.solicitanteUid === _currentUser.uid ||
            r.solicitanteEmail === _currentUser.email
        ).length;
    }
    const adminCountEl = document.getElementById('admin-requests-count');
    if (adminCountEl) adminCountEl.textContent = _requests.length;
}

function updateAllTables() {
    try { updateUserTable(); } catch (e) { console.error('[Requests] updateUserTable:', e); }
    try { updateAdminTable(); } catch (e) { console.error('[Requests] updateAdminTable:', e); }
}

// ============================================================
// EXPORTS GLOBAIS (para onclick inline no HTML)
// ============================================================
window.viewRequest = viewRequest;
window.closeViewModal = closeViewModal;
window.deleteRequest = deleteRequest;
window.viewRequestPDF = viewRequestPDF;
window.changeRequestStatus = changeRequestStatus;
window.requestCancellation = requestCancellation;
window.openEditHoursModal = openEditHoursModal;
window.saveRequestHours = saveRequestHours;
window.openRegistroModal = openRegistroModal;
window.closeRegistroModal = closeRegistroModal;
window.toggleRegistroCustomDates = toggleRegistroCustomDates;
window.calculateRegistros = calculateRegistros;
window.goToAdminPage = goToAdminPage;
window.updateAdminTable = updateAdminTable;
window.updateUserTable = updateUserTable;
window.getRequests = getRequests;
