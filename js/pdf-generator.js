// ============================================================
// SSOT · SOLICITAÇÕES DE TRANSPORTE · v11.5
// - PDF delegado para pdf-generator.js v6 (QR base64, 1 página A4)
// - Cache busting no import do PDF
// - Validações e proteções defensivas
// ============================================================

import {
    ref, set, remove, update, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
    showNotification, showAlert, formatDateTime, escapeHtml, debounce,
    getStatusText, getStatusBadgeClass, getPrioridadeBadgeClass,
    getVeiculoText, truncate
} from './utils.js';

// ⭐ Cache busting: o ?v=6 força o browser a baixar o v6 do pdf-generator
import { generateRequestPDF } from './pdf-generator.js?v=7';

import { addHistory } from './history.js';
import { sstConfirm } from './dialogs.js';

const MODULE_VERSION = 'v11.5';
console.log('[Requests] ✅ Módulo carregado:', MODULE_VERSION, 'em', new Date().toISOString());

// ============================================================
// ESTADO
// ============================================================
let _db = null;
let _currentUser = null;
let _requests = [];
let _nextNumber = 1;
let _unsub = null;
let _highlightedId = null;

export function setRequestsContext(db, currentUser) {
    _db = db;
    _currentUser = currentUser;
}

export function getRequests() { return _requests; }
export function setRequestsHighlight(id) { _highlightedId = id; }

// ============================================================
// SUBSCRIBE
// ============================================================
export function subscribeRequests(callback) {
    if (!_db) return null;
    if (_unsub) { try { _unsub(); } catch (e) {} }

    _unsub = onValue(ref(_db, 'requests'), (snap) => {
        try {
            _requests = [];
            snap.forEach(child => {
                _requests.push({ ...child.val(), id: child.key });
            });
            _nextNumber = computeNextNumber();

            try { if (callback) callback(_requests); } catch (err) { console.error('[Requests] callback:', err); }
            try { updateAllTables(); } catch (err) { console.error('[Requests] updateAllTables:', err); }
            try { updateRequestsCount(); } catch (err) { console.error('[Requests] updateRequestsCount:', err); }
        } catch (err) {
            console.error('[Requests] Erro no snapshot:', err);
        }
    }, (error) => console.error('[Requests] onValue error:', error));

    return _unsub;
}

export function unsubscribeRequests() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
}

// ============================================================
// NUMERAÇÃO
// ============================================================
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
    return 'SSOT' + String(_nextNumber).padStart(5, '0');
}

// ============================================================
// CRIAR
// ============================================================
export async function createRequest(formData) {
    if (!_currentUser) throw new Error('Usuário não autenticado.');
    if (!formData?.destino || !formData?.finalidade) {
        throw new Error('Destino e finalidade são obrigatórios.');
    }

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
        saida: formData.saida || '',
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
    if (!formData?.destino || !formData?.finalidade) {
        throw new Error('Destino e finalidade são obrigatórios.');
    }

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
        console.error('[Requests] changeRequestStatus:', err);
        showNotification('Erro', 'Não foi possível atualizar.', 'danger');
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
        `Destino: ${r.destino}\n` +
        `Solicitante: ${r.solicitante}\n\n` +
        `Ela irá para a lixeira e o horário será liberado na agenda.`,
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
                    console.log('[Requests] Slot liberado:', date, time.substring(0, 5));
                } catch (e) {
                    console.warn('[Requests] Falha ao liberar slot (não bloqueia exclusão):', e);
                }
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
        console.error('[Requests] moveToTrash:', err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
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

    tbody.innerHTML = mine.map(r => `
        <tr>
            <td><strong>${escapeHtml(r.numero)}</strong></td>
            <td>${escapeHtml(r.destino)}</td>
            <td>${r.saida ? formatDateTime(r.saida) : '—'}</td>
            <td>${r.retorno ? formatDateTime(r.retorno) : '—'}</td>
            <td><span class="badge ${getStatusBadgeClass(r.status)}">${getStatusText(r.status)}</span></td>
            <td>
                <button onclick="viewRequest('${r.id}', false)" class="btn btn-primary btn-sm">
                    <svg class="si"><use href="#i-eye"/></svg> Ver
                </button>
            </td>
        </tr>
    `).join('');
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

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8" class="table-empty">
                <svg class="si si-2x"><use href="#i-clipboard"/></svg>
                <p>Nenhuma solicitação encontrada.</p>
            </td></tr>
        `;
        return;
    }

    list.sort((a, b) => {
        const na = parseInt(String(a.numero).replace(/\D/g, '')) || 0;
        const nb = parseInt(String(b.numero).replace(/\D/g, '')) || 0;
        return nb - na;
    });

    tbody.innerHTML = list.map(r => {
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
    if (as) as.addEventListener('input', debounce(updateAdminTable, 250));

    const sf = document.getElementById('admin-filter-status');
    if (sf) sf.addEventListener('change', updateAdminTable);

    const uf = document.getElementById('admin-filter-user');
    if (uf) uf.addEventListener('change', updateAdminTable);

    const pf = document.getElementById('admin-filter-priority');
    if (pf) pf.addEventListener('change', updateAdminTable);
}

// ============================================================
// VIEW REQUEST
// ============================================================
function buildRequestQRUrl(requestId) {
    const baseUrl = window.location.origin + window.location.pathname;
    const deepLinkUrl = `${baseUrl}?request=${encodeURIComponent(requestId)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(deepLinkUrl)}`;
}

export function viewRequest(id, adminView) {
    const r = _requests.find(x => x.id === id);
    if (!r) {
        showNotification('Aviso', 'Solicitação não encontrada (pode ter sido removida).', 'warning');
        return;
    }

    const titleEl = document.getElementById('view-request-title');
    if (titleEl) titleEl.textContent = `Solicitação ${r.numero}`;

    const detailsEl = document.getElementById('request-details');
    if (detailsEl) {
        detailsEl.innerHTML = `
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
            <div class="detail-group"><div class="detail-label">Criado em</div><div class="detail-value">${formatDateTime(r.timestamp)}</div></div>
        `;
    }

    const qr = document.getElementById('view-qr-code');
    if (qr) {
        qr.innerHTML = `<img src="${buildRequestQRUrl(r.id)}" style="width:100%;height:100%;" alt="QR Code">`;
    }

    const footer = document.getElementById('view-modal-footer');
    if (footer) {
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
            buttons += `<button class="btn btn-secondary" onclick="closeViewModal()"><svg class="si"><use href="#i-x"/></svg> Fechar</button>`;
            footer.innerHTML = buttons;
        }
    }

    const modalEl = document.querySelector('#view-request-modal .modal');
    if (modalEl) modalEl.className = 'modal modal-fullscreen';

    document.getElementById('view-request-modal')?.classList.add('active');
}

export function closeViewModal() {
    document.getElementById('view-request-modal')?.classList.remove('active');
}

// ============================================================
// CONTADOR
// ============================================================
export function updateRequestsCount() {
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

// ============================================================
// WIDGET DASHBOARD
// ============================================================
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

    try {
        await generateRequestPDF(r);
        try {
            await addHistory('PDF Baixado', r.numero, `Por: ${_currentUser?.name}`);
        } catch (e) {
            console.warn('[Requests] Falha ao registrar PDF no histórico (não bloqueia):', e);
        }
        showNotification('PDF Gerado', 'Comprovante baixado com sucesso!', 'success');
    } catch (err) {
        console.error('[Requests] Erro ao gerar PDF:', err);
        showNotification('Erro', 'Não foi possível gerar o PDF.', 'danger');
    }
}

// ============================================================
// GLOBALS (para onclick inline no HTML)
// ============================================================
window.viewRequest = viewRequest;
window.closeViewModal = closeViewModal;
window.downloadUserRequestPDF = downloadUserRequestPDF;
window.changeStatus = async (id, status) => {
    await changeRequestStatus(id, status);
    closeViewModal();
};
window.deleteRequest = async (id) => {
    await moveToTrash(id);
    closeViewModal();
};
