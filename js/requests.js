// ============================================================
// SSOT - SOLICITAÇÕES DE TRANSPORTE (v11.1)
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
import { sstConfirm } from './dialogs.js';

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

// ✅ Admin criando solicitação para alguém
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
        solicitanteUid: _currentUser.uid, // o admin fica registrado como quem criou
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
        // ✅ LIBERA O SLOT NA AGENDA INCONDICIONALMENTE (SE HOUVER SAÍDA)
        if (r.saida && r.saida.includes('T')) {
            const [date, time] = r.saida.split('T');
            if (date && time) {
                try {
                    const schedule = await import('./schedule.js');
                    // Passa "HH:MM" para a função
                    await schedule.freeSlot(date, time.substring(0, 5));
                } catch (e) {
                    console.warn('[Requests] Falha ao liberar slot:', e);
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
        console.error(err);
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

    const modalEl = document.querySelector('#view-request-modal .modal');
    if (modalEl) {
        modalEl.className = 'modal modal-fullscreen'; 
    }

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

// PDF do Comprovante
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

    const now = new Date();
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Comprovante ${escapeHtml(r.numero)} - SSOT</title>
<style>
    @page { size: A4; margin: 0; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; }
    .a4-container { width: 210mm; min-height: 297mm; padding: 15mm; box-sizing: border-box; margin: 0 auto; background: #fff; }
    .header { text-align: center; border-bottom: 3px solid #3498db; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { color: #2c3e50; margin: 0; font-size: 1.4em; }
    .header p { color: #7f8c8d; margin: 6px 0 0; font-size: 0.85em; }
    h2 { color: #2c3e50; font-size: 1em; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #dddddd; padding-bottom: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .item { padding: 6px 0; border-bottom: 1px solid #eeeeee; }
    .label { font-size: 0.72em; color: #7f8c8d; text-transform: uppercase; font-weight: bold; margin-bottom: 2px; }
    .value { font-size: 0.95em; color: #2c3e50; }
    .full { grid-column: 1 / -1; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 3px; font-size: 0.78em; font-weight: bold; color: #ffffff; background: #d68910; }
    .footer { margin-top: 30px; text-align: center; font-size: 0.72em; color: #7f8c8d; border-top: 1px solid #eeeeee; padding-top: 15px; }
    .logo-icon { width: 32px; height: 32px; color: #2c3e50; margin-bottom: 5px; }
</style>
</head>
<body>
<div class="a4-container">
<div class="header">
    <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="M3 17V11l2-5h14l2 5v6"/><path d="M3 11h18"/></svg>
    <h1>SSOT - Comprovante de Solicitação</h1>
    <p>Solicitação <strong>${escapeHtml(r.numero)}</strong></p>
</div>
<h2>Dados do Solicitante</h2>
<div class="grid">
<div class="item"><div class="label">Nome</div><div class="value">${escapeHtml(r.solicitante)}</div></div>
<div class="item"><div class="label">E-mail</div><div class="value">${escapeHtml(r.email || '—')}</div></div>
<div class="item"><div class="label">Ramal</div><div class="value">${escapeHtml(r.ramal || '—')}</div></div>
<div class="item"><div class="label">Setor</div><div class="value">${escapeHtml(r.setor || '—')}</div></div>
<div class="item"><div class="label">Cargo</div><div class="value">${escapeHtml(r.cargo || '—')}</div></div>
<div class="item"><div class="label">Status</div><div class="value"><span class="badge">${getStatusText(r.status)}</span></div></div>
</div>
<h2>Detalhes da Viagem</h2>
<div class="grid">
<div class="item"><div class="label">Destino</div><div class="value">${escapeHtml(r.destino || '—')}</div></div>
<div class="item"><div class="label">Origem</div><div class="value">${escapeHtml(r.origem || '—')}</div></div>
<div class="item"><div class="label">Saída</div><div class="value">${r.saida ? formatDateTime(r.saida) : '—'}</div></div>
<div class="item"><div class="label">Retorno</div><div class="value">${r.retorno ? formatDateTime(r.retorno) : '—'}</div></div>
<div class="item"><div class="label">Prioridade</div><div class="value">${escapeHtml(r.prioridade || 'normal')}</div></div>
<div class="item"><div class="label">Passageiros</div><div class="value">${escapeHtml(String(r.passageiros || '—'))}</div></div>
<div class="item full"><div class="label">Finalidade</div><div class="value">${escapeHtml(r.finalidade || '—')}</div></div>
${r.necessidades ? `<div class="item full"><div class="label">Necessidades Especiais</div><div class="value">${escapeHtml(r.necessidades)}</div></div>` : ''}
${r.nomesPassageiros ? `<div class="item full"><div class="label">Passageiros</div><div class="value">${escapeHtml(r.nomesPassageiros).replace(/\n/g, '<br>')}</div></div>` : ''}
${r.observacoes ? `<div class="item full"><div class="label">Observações</div><div class="value">${escapeHtml(r.observacoes).replace(/\n/g, '<br>')}</div></div>` : ''}
</div>
<div class="footer">
<p>Emitido em ${now.toLocaleString('pt-BR')}</p>
<p>SSOT - Sistema de Solicitações e Operações de Transporte</p>
</div>
</div>
</body>
</html>`;

    const overlay = document.createElement('div');
    overlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 999998; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.2rem; font-weight: 600; font-family: 'Segoe UI', Arial, sans-serif;`;
    overlay.innerHTML = '<div style="text-align:center"><div style="margin-bottom:10px">📄 Gerando PDF...</div><div style="font-size:0.85rem;opacity:0.8;">Aguarde um instante</div></div>';
    document.body.appendChild(overlay);

    try {
        await window.html2pdf().set({
            margin: 0,
            filename: `solicitacao_${r.numero}_${now.toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(html).save();

        showNotification('PDF Gerado', 'Comprovante baixado com sucesso!', 'success');
        await addHistory('PDF Baixado', r.numero, `Por: ${_currentUser?.name}`);
    } catch (err) {
        console.error('[Requests] Erro ao gerar PDF:', err);
        showNotification('Erro', 'Não foi possível gerar o PDF.', 'danger');
    } finally {
        overlay.remove();
    }
}

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