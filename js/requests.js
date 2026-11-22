// ============================================================
// SSOT - SOLICITAÇÕES DE TRANSPORTE (v15.0)
// Novidades v15.0:
//  - FEAT: Botão "Registro" na aba Admin com filtro de período (7d, 30d, Custom)
//  - PERF: Remoção do count no header e adição do cálculo por período
// ============================================================

import { ref, set, remove, update, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
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
// CRIAR E ATUALIZAR (mantidos)
// ============================================================
export async function createRequest(formData) {
    // (Mesma lógica original)
    if (!_currentUser) throw new Error('Usuário não autenticado.');
    const numero = generateNextNumero();
    const req = { numero, solicitante: formData.solicitante || _currentUser.name, email: formData.email || _currentUser.email, ramal: formData.ramal || '', setor: formData.setor || '', cargo: formData.cargo || '', destino: formData.destino, origem: formData.origem || '', finalidade: formData.finalidade, prioridade: formData.prioridade || 'normal', saida: formData.saida, retorno: formData.retorno || '', passageiros: formData.passageiros || '1', veiculo: formData.veiculo || 'carro', necessidades: formData.necessidades || '', nomesPassageiros: formData.nomesPassageiros || '', observacoes: formData.observacoes || '', solicitanteUid: _currentUser.uid, solicitanteEmail: _currentUser.email, dataSolicitacao: new Date().toISOString().slice(0, 10), status: 'pendente', timestamp: new Date().toISOString(), updatedBy: _currentUser.name };
    const newRef = push(ref(_db, 'requests'));
    await set(newRef, req);
    await addHistory('Solicitação Criada', numero, `Destino: ${formData.destino} | Solicitante: ${req.solicitante}`);
    return { ...req, id: newRef.key };
}

export async function createAdminRequest(formData) {
    // (Mesma lógica original)
    if (!_currentUser) throw new Error('Usuário não autenticado.');
    const numero = generateNextNumero();
    const req = { numero, solicitante: formData.solicitante, email: formData.email, ramal: formData.ramal, setor: formData.setor, cargo: formData.cargo, destino: formData.destino, origem: formData.origem, finalidade: formData.finalidade, prioridade: formData.prioridade, saida: formData.saida, retorno: formData.retorno, passageiros: formData.passageiros, veiculo: 'carro', necessidades: formData.necessidades, nomesPassageiros: formData.nomesPassageiros, observacoes: formData.observacoes, solicitanteUid: _currentUser.uid, solicitanteEmail: formData.email, dataSolicitacao: new Date().toISOString().slice(0, 10), status: 'pendente', timestamp: new Date().toISOString(), updatedBy: _currentUser.name };
    const newRef = push(ref(_db, 'requests'));
    await set(newRef, req);
    await addHistory('Solicitação Criada (Admin)', numero, `Destino: ${formData.destino} | Solicitante: ${req.solicitante}`);
    return { ...req, id: newRef.key };
}

export async function changeRequestStatus(id, newStatus) {
    const r = _requests.find(x => x.id === id);
    if (!r) return;
    const oldStatus = r.status;
    try {
        await update(ref(_db, 'requests/' + id), { status: newStatus, timestamp: new Date().toISOString(), updatedBy: _currentUser?.name || 'Sistema' });
        await addHistory('Status Alterado', r.numero, `De "${getStatusText(oldStatus)}" para "${getStatusText(newStatus)}" | Por: ${_currentUser?.name}`);
        showNotification('Atualizado', `Solicitação ${r.numero}: ${getStatusText(newStatus)}.`, 'success');
    } catch (err) { console.error(err); showNotification('Erro', 'Não foi possível atualizar.', 'danger'); }
}

// ============================================================
// REGISTRO (NOVO)
// ============================================================
export function openRegistroModal() {
    document.getElementById('registro-modal').classList.add('active');
    document.getElementById('registro-periodo').value = '7';
    document.getElementById('registro-custom-dates').style.display = 'none';
    calculateRegistros();
}

export function closeRegistroModal() {
    document.getElementById('registro-modal').classList.remove('active');
}

export function toggleRegistroCustomDates() {
    const val = document.getElementById('registro-periodo').value;
    const box = document.getElementById('registro-custom-dates');
    if (val === 'custom') {
        box.style.display = 'grid';
        const today = new Date();
        const past = new Date();
        past.setDate(today.getDate() - 7);
        document.getElementById('registro-data-ini').value = past.toISOString().slice(0, 10);
        document.getElementById('registro-data-fim').value = today.toISOString().slice(0, 10);
    } else {
        box.style.display = 'none';
    }
    calculateRegistros();
}

export function calculateRegistros() {
    const period = document.getElementById('registro-periodo').value;
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
        const ini = document.getElementById('registro-data-ini').value;
        const fim = document.getElementById('registro-data-fim').value;
        if (!ini || !fim) return;
        
        const dIni = new Date(ini + 'T00:00:00');
        const dFim = new Date(fim + 'T23:59:59');
        
        count = _requests.filter(r => {
            if (!r.timestamp) return false;
            const d = new Date(r.timestamp);
            return d >= dIni && d <= dFim;
        }).length;
    }
    
    document.getElementById('registro-total').textContent = count;
}

// ============================================================
// TABELAS E PAGINAÇÃO
// ============================================================
export function updateUserTable() {
    const tbody = document.getElementById('user-requests-table');
    if (!tbody || !_currentUser) return;
    const search = (document.getElementById('user-search')?.value || '').toLowerCase();
    let mine = _requests.filter(r => r.solicitanteUid === _currentUser.uid || r.solicitanteEmail === _currentUser.email);
    if (search) {
        mine = mine.filter(r => (r.numero && r.numero.toLowerCase().includes(search)) || (r.destino && r.destino.toLowerCase().includes(search)) || (r.finalidade && r.finalidade.toLowerCase().includes(search)));
    }
    if (mine.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><svg class="si si-2x"><use href="#i-clipboard"/></svg><p>${search ? 'Nenhum resultado.' : 'Você ainda não fez solicitações.'}</p></td></tr>`;
        return;
    }
    mine.sort((a, b) => {
        const na = parseInt(String(a.numero).replace(/\D/g, '')) || 0;
        const nb = parseInt(String(b.numero).replace(/\D/g, '')) || 0;
        return nb - na;
    });
    tbody.innerHTML = mine.map(r => {
        let actions = `<button onclick="viewRequest('${r.id}', false)" class="btn btn-primary btn-sm"><svg class="si"><use href="#i-eye"/></svg> Ver</button>`;
        if (r.status === 'aprovada' || r.status === 'em-andamento') {
            actions += `<button onclick="window.requestCancellation('${r.id}')" class="btn btn-warning btn-sm" style="margin-left:6px;" title="Solicitar cancelamento"><svg class="si"><use href="#i-x-circle"/></svg> Solicitar Cancelamento</button>`;
        }
        return `<tr><td><strong>${escapeHtml(r.numero)}</strong></td><td>${escapeHtml(r.destino)}</td><td>${r.saida ? formatDateTime(r.saida) : '—'}</td><td>${r.retorno ? formatDateTime(r.retorno) : '—'}</td><td><span class="badge ${getStatusBadgeClass(r.status)}">${getStatusText(r.status)}</span></td><td>${actions}</td></tr>`;
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
    if (search) list = list.filter(r => (r.numero && r.numero.toLowerCase().includes(search)) || (r.solicitante && r.solicitante.toLowerCase().includes(search)) || (r.setor && r.setor.toLowerCase().includes(search)) || (r.destino && r.destino.toLowerCase().includes(search)));
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
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><svg class="si si-2x"><use href="#i-clipboard"/></svg><p>Nenhuma solicitação encontrada.</p></td></tr>`;
        renderPagination(0, 1, 0);
        return;
    }

    tbody.innerHTML = pageItems.map(r => {
        const hl = (_highlightedId && r.id === _highlightedId) ? 'highlight' : '';
        return `<tr class="${hl}"><td><strong>${escapeHtml(r.numero)}</strong></td><td>${escapeHtml(r.solicitante)}</td><td>${escapeHtml(r.setor || '—')}</td><td>${escapeHtml(r.destino)}</td><td>${r.saida ? formatDateTime(r.saida) : '—'}</td><td><span class="badge ${getPrioridadeBadgeClass(r.prioridade)}">${r.prioridade || 'normal'}</span></td><td><span class="badge ${getStatusBadgeClass(r.status)}">${getStatusText(r.status)}</span></td><td class="table-actions-col"><div class="action-buttons" style="justify-content:flex-end;"><button onclick="viewRequest('${r.id}', true)" class="btn btn-primary btn-sm"><svg class="si"><use href="#i-eye"/></svg></button><button onclick="deleteRequest('${r.id}')" class="btn btn-danger btn-sm"><svg class="si"><use href="#i-trash"/></svg></button></div></td></tr>`;
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
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
    paginationEl.innerHTML = `<div class="fleet-pagination"><button class="btn btn-secondary btn-sm" ${currentPage === 0 ? 'disabled' : ''} onclick="window.changeAdminPage(${currentPage - 1})"><svg class="si"><use href="#i-chevron-l"/></svg> Anterior</button><span>Página <strong>${currentPage + 1}</strong> de ${totalPages} · ${total} registro(s)</span><button class="btn btn-secondary btn-sm" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="window.changeAdminPage(${currentPage + 1})">Próxima <svg class="si"><use href="#i-chevron-r"/></svg></button></div>`;
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
    _requests.forEach(r => { if (r.solicitanteEmail && r.solicitante) userMap.set(r.solicitanteEmail, r.solicitante); });
    const current = sel.value;
    sel.innerHTML = '<option value="">Todos os Usuários</option>';
    Array.from(userMap.entries()).sort((a, b) => a[1].localeCompare(b[1])).forEach(([email, name]) => {
        const opt = document.createElement('option'); opt.value = email; opt.textContent = name; sel.appendChild(opt);
    });
    sel.value = current;
}

export function setupRequestFilters() {
    const us = document.getElementById('user-search'); if (us) us.addEventListener('input', debounce(updateUserTable, 250));
    const as = document.getElementById('admin-search'); if (as) as.addEventListener('input', debounce(() => { _adminPage = 0; updateAdminTable(); }, 250));
    const sf = document.getElementById('admin-filter-status'); if (sf) sf.addEventListener('change', () => { _adminPage = 0; updateAdminTable(); });
    const uf = document.getElementById('admin-filter-user'); if (uf) uf.addEventListener('change', () => { _adminPage = 0; updateAdminTable(); });
    const pf = document.getElementById('admin-filter-priority'); if (pf) pf.addEventListener('change', () => { _adminPage = 0; updateAdminTable(); });
}

// ============================================================
// VIEW, CANCELAMENTO E LIXEIRA (Mantidos)
// ============================================================
export function viewRequest(id, adminView) {
    // (Mesma lógica original)
    const r = _requests.find(x => x.id === id); if (!r) return;
    document.getElementById('view-request-title').textContent = `Solicitação ${r.numero}`;
    document.getElementById('request-details').innerHTML = `<div class="detail-group"><div class="detail-label">Nº</div><div class="detail-value"><strong>${escapeHtml(r.numero)}</strong></div></div><div class="detail-group"><div class="detail-label">Status</div><div class="detail-value"><span class="badge ${getStatusBadgeClass(r.status)}">${getStatusText(r.status)}</span></div></div><div class="detail-group"><div class="detail-label">Prioridade</div><div class="detail-value"><span class="badge ${getPrioridadeBadgeClass(r.prioridade)}">${r.prioridade || 'normal'}</span></div></div><div class="detail-group"><div class="detail-label">Solicitante</div><div class="detail-value">${escapeHtml(r.solicitante)}</div></div><div class="detail-group"><div class="detail-label">E-mail</div><div class="detail-value">${escapeHtml(r.email || '—')}</div></div><div class="detail-group"><div class="detail-label">Ramal</div><div class="detail-value">${escapeHtml(r.ramal || '—')}</div></div><div class="detail-group"><div class="detail-label">Setor</div><div class="detail-value">${escapeHtml(r.setor || '—')}</div></div>${r.cargo ? `<div class="detail-group"><div class="detail-label">Cargo</div><div class="detail-value">${escapeHtml(r.cargo)}</div></div>` : ''}<div class="detail-group"><div class="detail-label">Destino</div><div class="detail-value">${escapeHtml(r.destino)}</div></div><div class="detail-group"><div class="detail-label">Origem</div><div class="detail-value">${escapeHtml(r.origem || '—')}</div></div><div class="detail-group detail-full"><div class="detail-label">Finalidade</div><div class="detail-value">${escapeHtml(r.finalidade || '—')}</div></div><div class="detail-group"><div class="detail-label">Saída</div><div class="detail-value">${r.saida ? formatDateTime(r.saida) : '—'}</div></div><div class="detail-group"><div class="detail-label">Retorno</div><div class="detail-value">${r.retorno ? formatDateTime(r.retorno) : '—'}</div></div><div class="detail-group"><div class="detail-label">Passageiros</div><div class="detail-value">${escapeHtml(String(r.passageiros || '—'))}</div></div>${r.veiculo ? `<div class="detail-group"><div class="detail-label">Veículo</div><div class="detail-value">${getVeiculoText(r.veiculo)}</div></div>` : ''}${r.necessidades ? `<div class="detail-group detail-full"><div class="detail-label">Necessidades</div><div class="detail-value">${escapeHtml(r.necessidades)}</div></div>` : ''}${r.nomesPassageiros ? `<div class="detail-group detail-full"><div class="detail-label">Passageiros</div><div class="detail-value">${escapeHtml(r.nomesPassageiros).replace(/\n/g, '<br>')}</div></div>` : ''}${r.observacoes ? `<div class="detail-group detail-full"><div class="detail-label">Observações</div><div class="detail-value">${escapeHtml(r.observacoes).replace(/\n/g, '<br>')}</div></div>` : ''}${r.cancellationRequest?.reason ? `<div class="detail-group detail-full"><div class="detail-label">Cancelamento — Motivo</div><div class="detail-value">${escapeHtml(r.cancellationRequest.reason)}</div></div>` : ''}<div class="detail-group"><div class="detail-label">Criado em</div><div class="detail-value">${formatDateTime(r.timestamp)}</div></div>`;
    
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
        if (r.status === 'pendente') buttons += `<button class="btn btn-success" onclick="changeStatus('${r.id}', 'aprovada')"><svg class="si"><use href="#i-check"/></svg> Aprovar</button><button class="btn btn-warning" onclick="changeStatus('${r.id}', 'recusada')"><svg class="si"><use href="#i-x"/></svg> Recusar</button>`;
        if (r.status === 'aprovada') buttons += `<button class="btn btn-primary" onclick="changeStatus('${r.id}', 'em-andamento')"><svg class="si"><use href="#i-play"/></svg> Iniciar</button>`;
        if (r.status === 'em-andamento') buttons += `<button class="btn btn-info" onclick="changeStatus('${r.id}', 'concluida')"><svg class="si"><use href="#i-flag"/></svg> Concluir</button>`;
        if (r.status === 'em-andamento' || r.status === 'concluida') buttons += `<button class="btn btn-warning" onclick="window.openEditHoursModal('${r.id}')"><svg class="si"><use href="#i-clock"/></svg> Editar Horários</button>`;
        buttons += `<button class="btn btn-danger" onclick="deleteRequest('${r.id}')"><svg class="si"><use href="#i-trash"/></svg> Excluir</button><button class="btn btn-secondary" onclick="closeViewModal()"><svg class="si"><use href="#i-x"/></svg> Fechar</button>`;
        footer.innerHTML = buttons;
    } else {
        let buttons = `<button class="btn btn-success" onclick="window.downloadUserRequestPDF('${r.id}')"><svg class="si"><use href="#i-file-pdf"/></svg> Baixar PDF</button>`;
        if (r.status === 'pendente') buttons += `<button class="btn btn-danger" onclick="changeStatus('${r.id}', 'cancelada')"><svg class="si"><use href="#i-ban"/></svg> Cancelar</button>`;
        if (r.status === 'aprovada' || r.status === 'em-andamento') buttons += `<button class="btn btn-warning" onclick="window.requestCancellation('${r.id}')"><svg class="si"><use href="#i-x-circle"/></svg> Solicitar Cancelamento</button>`;
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

// (Funções: requestCancellation, openEditHoursModal, saveRequestHours, moveToTrash, downloadUserRequestPDF - Mantidas exatamente iguais às anteriores)
// ...

// Exports Globais
window.openRegistroModal = openRegistroModal;
window.closeRegistroModal = closeRegistroModal;
window.toggleRegistroCustomDates = toggleRegistroCustomDates;
window.changeAdminPage = changeAdminPage;
