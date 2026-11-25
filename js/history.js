// ============================================================
// SSOT - HISTÓRICO (v10.3)
// ============================================================

import {
    ref, push, set, onValue, query, orderByChild, limitToLast, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { escapeHtml, formatDateTime, debounce, showNotification } from './utils.js';
import { HISTORY_MAX_ENTRIES, HISTORY_DISPLAY_LIMIT } from './config.js';
import { sstConfirm } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _history = [];
let _unsub = null;
let _isAdmin = false;
let _isSubscribed = false;
let _searchTerm = '';
let _filterAction = '';

export function setHistoryContext(db, currentUser, isAdmin) {
    _db = db;
    _currentUser = currentUser;
    _isAdmin = isAdmin;
}

export function subscribeHistory() {
    if (!_isAdmin || !_db) return null;
    if (_isSubscribed && _unsub) return _unsub;
    _isSubscribed = true;

    const q = query(ref(_db, 'history'), orderByChild('timestamp'), limitToLast(HISTORY_MAX_ENTRIES));

    _unsub = onValue(q, (snap) => {
        _history = [];
        snap.forEach(child => {
            _history.push({ ...child.val(), id: child.key });
        });
        _history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        updateHistoryTable();
    }, (error) => {
        console.warn('[History] Fallback:', error.code);
        if (_unsub) { try { _unsub(); } catch (e) {} }
        _unsub = onValue(ref(_db, 'history'), (snap) => {
            _history = [];
            snap.forEach(child => {
                _history.push({ ...child.val(), id: child.key });
            });
            _history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            updateHistoryTable();
        });
    });

    return _unsub;
}

export function unsubscribeHistory() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    _isSubscribed = false;
}

export async function addHistory(action, requestNum, details) {
    if (!_currentUser || !_db) return;
    try {
        const newRef = push(ref(_db, 'history'));
        await set(newRef, {
            timestamp: new Date().toISOString(),
            user: _currentUser.name || 'Sistema',
            userEmail: _currentUser.email || '',
            userRole: _currentUser.role || 'user',
            action: action || 'Ação',
            requestNum: requestNum || '-',
            details: details || ''
        });
    } catch (err) {
        console.warn('[History] Falha ao gravar:', err.message);
    }
}

export function updateHistoryTable() {
    const tbody = document.getElementById('historico-table');
    if (!tbody) return;

    // ✅ CORREÇÃO: atualiza o contador ANTES de checar vazio
    const countEl = document.getElementById('historico-count');
    if (countEl) countEl.textContent = _history.length;

    let filtered = _history.slice();

    if (_searchTerm) {
        const s = _searchTerm.toLowerCase();
        filtered = filtered.filter(h =>
            (h.user && h.user.toLowerCase().includes(s)) ||
            (h.action && h.action.toLowerCase().includes(s)) ||
            (h.details && h.details.toLowerCase().includes(s)) ||
            (h.requestNum && h.requestNum.toLowerCase().includes(s))
        );
    }

    if (_filterAction) filtered = filtered.filter(h => h.action === _filterAction);

    if (filtered.length === 0) {
        const isEmpty = _history.length === 0;
        tbody.innerHTML = `
            <tr><td colspan="5" class="table-empty">
                <svg class="si si-2x"><use href="#i-history"/></svg>
                <p>${isEmpty ? 'Nenhuma atividade registrada.' : 'Nenhum resultado para o filtro.'}</p>
            </td></tr>
        `;
        return;
    }

    const html = filtered.slice(0, HISTORY_DISPLAY_LIMIT).map(h => {
        const roleTag = h.userRole === 'admin'
            ? '<span class="badge badge-primary" style="font-size:0.6rem;margin-left:4px;">Admin</span>'
            : h.userRole === 'setor'
                ? '<span class="badge badge-warning" style="font-size:0.6rem;margin-left:4px;">Setor</span>'
                : '';
        return `
            <tr>
                <td>${formatDateTime(h.timestamp)}</td>
                <td>${escapeHtml(h.user || '—')}${roleTag}</td>
                <td><strong>${escapeHtml(h.action || '—')}</strong></td>
                <td>${escapeHtml(h.requestNum || '-')}</td>
                <td>${escapeHtml(h.details || '-')}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = html;
}

export function refreshHistory() {
    if (!_isSubscribed && _isAdmin) subscribeHistory();
    updateHistoryTable();
}

export async function clearAllHistory() {
    if (!_isAdmin || !_db) return;

    const ok = await sstConfirm(
        `Apagar TODO o histórico do sistema?\n\nSerão removidos ${_history.length} registros do banco de dados.\n\nEsta ação NÃO pode ser desfeita.`,
        'Limpar Histórico',
        'danger'
    );
    if (!ok) return;

    try {
        await remove(ref(_db, 'history'));
        // ✅ CORREÇÃO: força atualização local imediata
        _history = [];
        updateHistoryTable();
        showNotification('Histórico Limpo', 'Todos os registros foram removidos.', 'success');
    } catch (err) {
        console.error('[History] Erro ao limpar:', err);
        showNotification('Erro', 'Não foi possível limpar o histórico.', 'danger');
    }
}

export function renderRecentActivityWidget() {
    const container = document.getElementById('dashboard-recent-activity');
    if (!container) return;

    const recent = _history.slice(0, 5);
    if (recent.length === 0) {
        container.innerHTML = '<div class="widget-empty">Nenhuma atividade registrada.</div>';
        return;
    }

    const icons = {
        'Login': 'i-sign-in', 'Login com Google': 'i-google', 'Logout': 'i-sign-out',
        'Solicitação Criada': 'i-plus-circle', 'Status Alterado': 'i-refresh',
        'Solicitação Excluída': 'i-trash', 'Solicitação Restaurada': 'i-undo',
        'Usuário Criado': 'i-user-plus', 'Usuário Excluído': 'i-trash',
        'Cadastro Aprovado': 'i-user-check', 'Cadastro Recusado': 'i-x-circle',
        'Veículo Adicionado': 'i-truck', 'Motorista Adicionado': 'i-id-card',
        'Agenda Atualizada': 'i-calendar-check', 'Backup Realizado': 'i-database',
        'Lixeira Esvaziada': 'i-broom', 'Notificação Enviada': 'i-bell',
        'Perfil Atualizado': 'i-user'
    };

    container.innerHTML = recent.map(h => `
        <div class="widget-item">
            <div class="widget-item-icon"><svg class="si"><use href="#${icons[h.action] || 'i-info'}"/></svg></div>
            <div class="widget-item-content">
                <div class="widget-item-title">${escapeHtml(h.action || 'Ação')}</div>
                <div class="widget-item-subtitle">
                    <strong>${escapeHtml(h.user || '—')}</strong> · ${formatDateTime(h.timestamp)}
                </div>
            </div>
        </div>
    `).join('');
}

export function setupHistoryFilters() {
    const searchEl = document.getElementById('historico-search');
    const filterEl = document.getElementById('historico-filter-action');

    if (searchEl) {
        searchEl.addEventListener('input', debounce((e) => {
            _searchTerm = e.target.value.trim();
            updateHistoryTable();
        }, 300));
    }
    if (filterEl) {
        filterEl.addEventListener('change', (e) => {
            _filterAction = e.target.value.trim();
            updateHistoryTable();
        });
    }
}