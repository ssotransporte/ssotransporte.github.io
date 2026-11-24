// ============================================================
// SSOT - SOLICITAÇÕES DE TRANSPORTE (v14.1)
// Novidades v14.1:
//  - FEAT: Botão "Registro" com filtro por período (7d, 30d, Custom)
//  - Mantido v14.0 (Paginação admin + PDF inline)
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
// REGISTRO (NOVO - SOLICITADO)
// ============================================================
export function openRegistroModal() {
    const modal = document.getElementById('registro-modal');
    if (modal) modal.classList.add('active');
    
    // Reseta os valores ao abrir
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

function renderPagination(currentPage, totalPages, total) {
    const paginationEl = document.getElementById('admin-requests-pagination');
    if (!paginationEl) return;

    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    paginationEl.innerHTML = `
        <div class="fleet-pagination">
            <button class="btn btn-secondary btn-sm" ${currentPage === 0 ? 'disabled' : ''} onclick="window.changeAdminPage(${currentPage - 1})">
                <svg class="si"><use href="#i-chevron-l"/></svg> Anterior
            </button>
            <span>Página <strong>${currentPage + 1}</strong> de ${totalPages} · ${total} registro(s)</span>
            <button class="btn btn-secondary btn-sm" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="window.changeAdminPage(${currentPage + 1})">
                Próxima <svg class="si"><use href="#i-chevron-r"/></svg>
            </button>
        </div>
    `;
}

export function changeAdminPage(p) {
    if (p < 0) return;
    _adminPage = p;
    updateAdminTable();
}

export function updateAllTables() {
    updateUserTable();
    updateAdminTable();
    updateUserFilter();
}

export function updateUserFilter() {
    const sel = document.getElementById('admin-filter-user');
    if (!sel) return;
    const userMap = new Map();
    _requests.forEach(r => {
        if (r.solicitanteEmail && r.solicitante) userMap.set(r.solicitanteEmail, r.solicitante);
    });
    const current = sel.value;
    sel.innerHTML = '<option value="">Todos os Usuários</option>';
    Array.from(userMap.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .forEach(([email, name]) => {
            const opt = document.createElement('option');
            opt.value = email;
            opt.textContent = name;
            sel.appendChild(opt);
        });
    sel.value = current;
}

export function setupRequestFilters() {
    const us = document.getElementById('user-search');
    if (us) us.addEventListener('input', debounce(updateUserTable, 250));

    const as = document.getElementById('admin-search');
    if (as) as.addEventListener('input', debounce(() => { _adminPage = 0; updateAdminTable(); }, 250));

    const sf = document.getElementById('admin-filter-status');
    if (sf) sf.addEventListener('change', () => { _adminPage = 0; updateAdminTable(); });

    const uf = document.getElementById('admin-filter-user');
    if (uf) uf.addEventListener('change', () => { _adminPage = 0; updateAdminTable(); });

    const pf = document.getElementById('admin-filter-priority');
    if (pf) pf.addEventListener('change', () => { _adminPage = 0; updateAdminTable(); });
}

// ============================================================
// VIEW REQUEST (modal de detalhes)
// ============================================================
export function viewRequest(id, adminView) {
    const r = _requests.find(x => x.id === id);
    if (!r) return;

    document.getElementById('view-request-title').textContent = `Solicitação ${r.numero}`;

    document.getElementById('request-details').innerHTML = `
        <div class="detail-group"><div class="detail-label">Nº</div><div class="detail-value"><strong>${escapeHtml(r.numero)}</strong></div></div>
        <div class="detail-group"><div class="detail-label">Status</div><div class="detail-value"><span class="badge ${getStatusBadgeClass(r.status)}">${getStatusText(r.status)}</span></div></div>
        <div class="detail-group"><div class="detail-label">Prioridade</div><div class="detail-value"><span class="badge ${getPrioridadeBadgeClass(r.prioridade)}">${r.prioridade || 'normal'}</span></div></div>
        <div class="detail-group"><div class="detail-label">Solicitante</div><div class="detail-value">${escapeHtml(r.solicitante)}</div></div>
        <div class="detail-group"><div class="detail-label">E-mail</div><div class="detail-value">${escapeHtml(r.email || '—')}</div></div>
        <div class="detail-group"><div class="detail-label">Ramal</div><div class="detail-value">${escapeHtml(r.ramal || '—')}</div></div>
        <div class="detail-group"><div class="detail-label">Setor</div><div class="detail-value">${escapeHtml(r.setor || '—')}</div></div>
        ${r.cargo ? `<div class="detail-group"><div class="detail-label">Cargo</div><div class="detail-value">${escapeHtml(r.cargo)}</div></div>` : ''}
        <div class="detail-group"><div class="detail-label">Destino</div><div class="detail-value">${escapeHtml(r.destino)}</div></div>
        <div class="detail-group"><div class="detail-label">Origem</div><div class="detail-value">${escapeHtml(r.origem || '—')}</div></div>
        <div class="detail-group detail-full"><div class="detail-label">Finalidade</div><div class="detail-value">${escapeHtml(r.finalidade || '—')}</div></div>
        <div class="detail-group"><div class="detail-label">Saída</div><div class="detail-value">${r.saida ? formatDateTime(r.saida) : '—'}</div></div>
        <div class="detail-group"><div class="detail-label">Retorno</div><div class="detail-value">${r.retorno ? formatDateTime(r.retorno) : '—'}</div></div>
        <div class="detail-group"><div class="detail-label">Passageiros</div><div class="detail-value">${escapeHtml(String(r.passageiros || '—'))}</div></div>
        ${r.veiculo ? `<div class="detail-group"><div class="detail-label">Veículo</div><div class="detail-value">${getVeiculoText(r.veiculo)}</div></div>` : ''}
        ${r.necessidades ? `<div class="detail-group detail-full"><div class="detail-label">Necessidades</div><div class="detail-value">${escapeHtml(r.necessidades)}</div></div>` : ''}
        ${r.nomesPassageiros ? `<div class="detail-group detail-full"><div class="detail-label">Passageiros</div><div class="detail-value">${escapeHtml(r.nomesPassageiros).replace(/\n/g, '<br>')}</div></div>` : ''}
        ${r.observacoes ? `<div class="detail-group detail-full"><div class="detail-label">Observações</div><div class="detail-value">${escapeHtml(r.observacoes).replace(/\n/g, '<br>')}</div></div>` : ''}
        ${r.cancellationRequest?.reason ? `<div class="detail-group detail-full"><div class="detail-label">Cancelamento — Motivo</div><div class="detail-value">${escapeHtml(r.cancellationRequest.reason)}</div></div>` : ''}
        <div class="detail-group"><div class="detail-label">Criado em</div><div class="detail-value">${formatDateTime(r.timestamp)}</div></div>
    `;

    const qr = document.getElementById('view-qr-code');
    if (qr) {
        const baseUrl = window.location.origin + window.location.pathname;
        const deepLinkUrl = `${baseUrl}?request=${encodeURIComponent(r.id)}`;
        qr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(deepLinkUrl)}" style="width:100%;height:100%;" alt="QR Code">`;
    }

    const footer = document.getElementById('view-modal-footer');
    footer.innerHTML = '';

    if (adminView) {
        let buttons = '';
        if (r.status === 'pendente') {
            buttons += `
                <button class="btn btn-success" onclick="changeStatus('${r.id}', 'aprovada')"><svg class="si"><use href="#i-check"/></svg> Aprovar</button>
                <button class="btn btn-warning" onclick="changeStatus('${r.id}', 'recusada')"><svg class="si"><use href="#i-x"/></svg> Recusar</button>
            `;
        }
        if (r.status === 'aprovada') {
            buttons += `<button class="btn btn-primary" onclick="changeStatus('${r.id}', 'em-andamento')"><svg class="si"><use href="#i-play"/></svg> Iniciar</button>`;
        }
        if (r.status === 'em-andamento') {
            buttons += `<button class="btn btn-info" onclick="changeStatus('${r.id}', 'concluida')"><svg class="si"><use href="#i-flag"/></svg> Concluir</button>`;
        }
        if (r.status === 'em-andamento' || r.status === 'concluida') {
            buttons += `<button class="btn btn-warning" onclick="window.openEditHoursModal('${r.id}')"><svg class="si"><use href="#i-clock"/></svg> Editar Horários</button>`;
        }
        buttons += `
            <button class="btn btn-danger" onclick="deleteRequest('${r.id}')"><svg class="si"><use href="#i-trash"/></svg> Excluir</button>
            <button class="btn btn-secondary" onclick="closeViewModal()"><svg class="si"><use href="#i-x"/></svg> Fechar</button>
        `;
        footer.innerHTML = buttons;
    } else {
        let buttons = `<button class="btn btn-success" onclick="window.downloadUserRequestPDF('${r.id}')"><svg class="si"><use href="#i-file-pdf"/></svg> Baixar PDF</button>`;
        if (r.status === 'pendente') {
            buttons += `<button class="btn btn-danger" onclick="changeStatus('${r.id}', 'cancelada')"><svg class="si"><use href="#i-ban"/></svg> Cancelar</button>`;
        }
        if (r.status === 'aprovada' || r.status === 'em-andamento') {
            buttons += `<button class="btn btn-warning" onclick="window.requestCancellation('${r.id}')"><svg class="si"><use href="#i-x-circle"/></svg> Solicitar Cancelamento</button>`;
        }
        buttons += `<button class="btn btn-secondary" onclick="closeViewModal()"><svg class="si"><use href="#i-x"/></svg> Fechar</button>`;
        footer.innerHTML = buttons;
    }

    const modalEl = document.querySelector('#view-request-modal .modal');
    if (modalEl) modalEl.className = 'modal modal-fullscreen';

    document.getElementById('view-request-modal').classList.add('active');
}

export function closeViewModal() {
    document.getElementById('view-request-modal')?.classList.remove('active');
}

function updateRequestsCount() {
    const adminCount = document.getElementById('admin-requests-count');
    if (adminCount) adminCount.textContent = _requests.length;

    const userCount = document.getElementById('user-requests-count');
    if (userCount && _currentUser) {
        const mine = _requests.filter(r =>
            r.solicitanteUid === _currentUser.uid ||
            r.solicitanteEmail === _currentUser.email
        );
        userCount.textContent = mine.length;
    }
}

export function renderTodayRequestsWidget() {
    const container = document.getElementById('dashboard-today-requests');
    if (!container) return;

    const today = new Date().toISOString().slice(0, 10);
    const todayReqs = _requests.filter(r =>
        (r.dataSolicitacao === today) || (r.saida && r.saida.slice(0, 10) === today)
    );

    if (todayReqs.length === 0) {
        container.innerHTML = '<div class="widget-empty">Nenhuma solicitação hoje.</div>';
        return;
    }

    container.innerHTML = todayReqs.slice(0, 5).map(r => `
        <div class="widget-item">
            <div class="widget-item-icon"><svg class="si"><use href="#i-car"/></svg></div>
            <div class="widget-item-content">
                <div class="widget-item-title">${escapeHtml(truncate(r.destino, 25))}</div>
                <div class="widget-item-subtitle">
                    <strong>${escapeHtml(r.solicitante)}</strong>
                    · <span class="badge ${getStatusBadgeClass(r.status)}" style="font-size:0.6rem;">${getStatusText(r.status)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ============================================================
// PDF DO COMPROVANTE
// ============================================================
export async function downloadUserRequestPDF(requestId) {
    const r = _requests.find(x => x.id === requestId);
    if (!r) {
        showNotification('Erro', 'Solicitação não encontrada.', 'danger');
        return;
    }
    if (!window.html2pdf) {
        showNotification('Erro', 'Biblioteca PDF não carregada. Recarregue com Ctrl+F5.', 'danger');
        return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999998;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.2rem;font-weight:600;font-family:"Segoe UI",Arial,sans-serif;';
    overlay.innerHTML = '<div style="text-align:center"><div style="margin-bottom:10px">📄 Gerando PDF...</div><div style="font-size:0.85rem;opacity:0.8;">Aguarde um instante</div></div>';
    document.body.appendChild(overlay);

    try {
        const htmlString = buildUserRequestHTML(r);
        await window.html2pdf().set({
            margin: 0,
            filename: `solicitacao_${r.numero}_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(htmlString).save();

        await addHistory('PDF Baixado', r.numero, `Por: ${_currentUser?.name}`);
        showNotification('PDF Gerado', 'Comprovante baixado!', 'success');
    } catch (err) {
        console.error('[Requests] Erro ao gerar PDF:', err);
        showNotification('Erro', 'Não foi possível gerar o PDF.', 'danger');
    } finally {
        overlay.remove();
    }
}

function buildUserRequestHTML(r) {
    const now = new Date();
    const user = _currentUser?.name || 'Sistema';
    const esc = (v) => escapeHtml(v == null ? '' : String(v));
    const fmtDT = (v) => v ? formatDateTime(v) : '—';

    const statusClass = {
        'pendente': 'b-w', 'aprovada': 'b-s', 'recusada': 'b-d',
        'em-andamento': 'b-p', 'concluida': 'b-i', 'cancelada': 'b-x'
    }[r.status] || 'b-w';

    const prioridadeClass = {
        'baixa': 'b-x', 'normal': 'b-p', 'alta': 'b-w', 'urgente': 'b-d'
    }[r.prioridade] || 'b-p';

    const qrUrl = window.location.origin + window.location.pathname + '?request=' + r.id;

    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Solicitação ${esc(r.numero)} - SSOT</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; color: #2c3e50; }
.a4-container { width: 210mm; min-height: 297mm; padding: 15mm; box-sizing: border-box; margin: 0 auto; background: #fff; }
.header { border-bottom: 3px solid #3498db; padding-bottom: 12px; margin-bottom: 20px; }
.header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
.header-brand h1 { color: #2c3e50; margin: 0; font-size: 16px; font-weight: bold; }
.header-brand h2 { color: #3498db; margin: 3px 0 0; font-size: 11px; font-weight: normal; }
.header-meta { text-align: right; font-size: 10px; color: #7f8c8d; line-height: 1.6; flex-shrink: 0; }
.header-meta strong { color: #2c3e50; }
.status-box { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #f8f9fa; border-radius: 4px; margin-bottom: 20px; border-left: 4px solid #3498db; }
.status-box .numero-label { font-size: 10px; color: #7f8c8d; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; margin-bottom: 2px; }
.status-box .numero { font-size: 20px; font-weight: bold; color: #2c3e50; }
.section { margin-bottom: 18px; page-break-inside: avoid; }
.section-title { font-size: 11px; font-weight: bold; color: #2c3e50; text-transform: uppercase; letter-spacing: 0.5px; padding: 7px 10px; background: #eaf4fc; border-left: 3px solid #3498db; margin-bottom: 10px; }
.fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; padding: 0 6px; }
.field { min-width: 0; }
.field.full { grid-column: 1 / -1; }
.field-label { font-size: 9px; color: #7f8c8d; text-transform: uppercase; letter-spacing: 0.4px; font-weight: bold; margin-bottom: 3px; }
.field-value { font-size: 12px; color: #2c3e50; line-height: 1.4; word-wrap: break-word; overflow-wrap: break-word; }
.field-value.multi { white-space: pre-wrap; }
.badge { display: inline-block; padding: 4px 10px; border-radius: 3px; font-size: 10px; font-weight: bold; color: #fff; }
.b-w { background: #d68910; } .b-s { background: #27ae60; } .b-d { background: #c0392b; }
.b-p { background: #3498db; } .b-i { background: #1abc9c; } .b-x { background: #95a5a6; }
.footer { margin-top: 30px; text-align: center; font-size: 9px; color: #7f8c8d; border-top: 1px solid #eeeeee; padding-top: 15px; }
.footer p { margin: 3px 0; }
.footer-obs { padding: 10px 12px; background: #fff3cd; border-left: 3px solid #d68910; margin: 14px 0; font-size: 10px; color: #856404; border-radius: 3px; page-break-inside: avoid; }
.qr-section { margin-top: 20px; text-align: center; page-break-inside: avoid; }
.qr-section img { width: 100px; height: 100px; }
.qr-label { font-size: 9px; color: #7f8c8d; margin-top: 4px; }
</style></head><body><div class="a4-container">
<div class="header"><div class="header-top">
<div class="header-brand"><h1>SSOT — Comprovante de Solicitação</h1><h2>Sistema de Solicitações e Operações de Transporte</h2></div>
<div class="header-meta">Gerado em<br><strong>${esc(now.toLocaleDateString('pt-BR'))}</strong> às <strong>${esc(now.toLocaleTimeString('pt-BR'))}</strong><br>Por: ${esc(user)}</div>
</div></div>
<div class="status-box">
<div><div class="numero-label">Solicitação</div><div class="numero">${esc(r.numero)}</div></div>
<div><span class="badge ${statusClass}">${esc(getStatusText(r.status))}</span><span class="badge ${prioridadeClass}" style="margin-left:6px;">${esc(r.prioridade || 'normal')}</span></div>
</div>
<div class="section"><div class="section-title">Solicitante</div>
<div class="fields-grid">
<div class="field full"><div class="field-label">Nome</div><div class="field-value">${esc(r.solicitante)}</div></div>
<div class="field"><div class="field-label">E-mail</div><div class="field-value">${esc(r.email || '—')}</div></div>
<div class="field"><div class="field-label">Ramal</div><div class="field-value">${esc(r.ramal || '—')}</div></div>
<div class="field"><div class="field-label">Setor</div><div class="field-value">${esc(r.setor || '—')}</div></div>
<div class="field"><div class="field-label">Cargo</div><div class="field-value">${esc(r.cargo || '—')}</div></div>
</div></div>
<div class="section"><div class="section-title">Detalhes da Viagem</div>
<div class="fields-grid">
<div class="field"><div class="field-label">Destino</div><div class="field-value"><strong>${esc(r.destino)}</strong></div></div>
<div class="field"><div class="field-label">Origem</div><div class="field-value">${esc(r.origem || '—')}</div></div>
<div class="field full"><div class="field-label">Finalidade</div><div class="field-value multi">${esc(r.finalidade || '—')}</div></div>
<div class="field"><div class="field-label">Saída</div><div class="field-value"><strong>${fmtDT(r.saida)}</strong></div></div>
<div class="field"><div class="field-label">Retorno</div><div class="field-value">${fmtDT(r.retorno)}</div></div>
<div class="field"><div class="field-label">Nº de Passageiros</div><div class="field-value">${esc(String(r.passageiros || '1'))}</div></div>
<div class="field"><div class="field-label">Veículo</div><div class="field-value">${esc(getVeiculoText(r.veiculo))}</div></div>
</div></div>
${(r.necessidades || r.nomesPassageiros || r.observacoes) ? `<div class="section"><div class="section-title">Observações</div><div class="fields-grid">
${r.necessidades ? `<div class="field full"><div class="field-label">Necessidades Especiais</div><div class="field-value multi">${esc(r.necessidades)}</div></div>` : ''}
${r.nomesPassageiros ? `<div class="field full"><div class="field-label">Nomes dos Passageiros</div><div class="field-value multi">${esc(r.nomesPassageiros)}</div></div>` : ''}
${r.observacoes ? `<div class="field full"><div class="field-label">Observações</div><div class="field-value multi">${esc(r.observacoes)}</div></div>` : ''}
</div></div>` : ''}
${r.cancellationRequest?.reason ? `<div class="footer-obs"><strong>⚠️ Cancelamento solicitado</strong><br>Motivo: ${esc(r.cancellationRequest.reason)}<br>Solicitado em: ${fmtDT(r.cancellationRequest.requestedAt)}</div>` : ''}
<div class="qr-section"><img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}" alt="QR Code"><div class="qr-label">Escaneie para abrir esta solicitação</div></div>
<div class="footer"><p><strong>SSOT — Sistema de Solicitações e Operações de Transporte</strong></p><p>Documento gerado automaticamente · ${esc(now.toLocaleString('pt-BR'))}</p><p>Criada em ${fmtDT(r.timestamp)}</p></div>
</div></body></html>`;
}

// ============================================================
// Exports globais
// ============================================================
window.viewRequest = viewRequest;
window.closeViewModal = closeViewModal;
window.downloadUserRequestPDF = downloadUserRequestPDF;
window.openEditHoursModal = openEditHoursModal;
window.saveRequestHours = saveRequestHours;
window.requestCancellation = requestCancellation;
window.changeAdminPage = changeAdminPage;
window.openRegistroModal = openRegistroModal;
window.closeRegistroModal = closeRegistroModal;
window.toggleRegistroCustomDates = toggleRegistroCustomDates;
window.calculateRegistros = calculateRegistros;
window.changeStatus = async (id, status) => {
    await changeRequestStatus(id, status);
    closeViewModal();
};
window.deleteRequest = async (id) => {
    await moveToTrash(id);
    closeViewModal();
};
