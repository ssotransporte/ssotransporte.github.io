// ============================================================
// SSOT - NOTAS E CALENDÁRIO
// ============================================================

import {
    ref, set, remove, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
    showNotification, escapeHtml, formatDateTime, dateToKey
} from './utils.js';

import { addHistory } from './history.js';
import { sstConfirm } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _notes = {};
let _requests = [];
let _calendarDate = new Date();
let _selectedDate = null;
let _unsub = null;
let _isSubscribed = false;

export function setNotesContext(db, currentUser) {
    _db = db;
    _currentUser = currentUser;
}

export function setNotesRequests(requests) {
    _requests = requests || [];
    const tab = document.getElementById('admin-notas-tab');
    if (tab && tab.classList.contains('active')) {
        setTimeout(renderCalendar, 50);
    }
}

export function subscribeNotes() {
    if (!_db) return null;
    if (_unsub) { try { _unsub(); } catch (e) {} }

    _isSubscribed = true;

    _unsub = onValue(
        ref(_db, 'notes'),
        (snap) => {
            _notes = snap.val() || {};
            if (_selectedDate) renderNotesForDay(_selectedDate);
            renderCalendar();
        },
        (error) => console.error('[Notes] Erro:', error)
    );

    return _unsub;
}

export function unsubscribeNotes() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    _isSubscribed = false;
}

export function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    const year = _calendarDate.getFullYear();
    const month = _calendarDate.getMonth();

    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const title = document.getElementById('calendar-month-title');
    if (title) title.textContent = `${monthNames[month]} ${year}`;

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    grid.innerHTML = '';

    dayNames.forEach(d => {
        const el = document.createElement('div');
        el.className = 'calendar-day-name';
        el.textContent = d;
        grid.appendChild(el);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = dateToKey(new Date());

    for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'calendar-day empty';
        grid.appendChild(el);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const key = dateToKey(date);

        const count = _requests.filter(r =>
            r.saida && r.saida.slice(0, 10) === key
        ).length;

        const hasNote = _notes[key] && Object.keys(_notes[key]).length > 0;

        const el = document.createElement('div');
        el.className = 'calendar-day';

        if (key === todayKey) el.classList.add('today');
        if (count > 0 && count < 5) el.classList.add('has-requests');
        if (count >= 5) el.classList.add('has-requests-many');
        if (hasNote) el.classList.add('has-note');
        if (_selectedDate === key) el.classList.add('selected');

        el.innerHTML = `
            <span class="day-number">${day}</span>
            ${count > 0 ? `<span class="day-badge">${count}</span>` : ''}
            ${hasNote ? '<span class="day-note-dot"></span>' : ''}
        `;

        el.onclick = () => selectDay(key, count);
        grid.appendChild(el);
    }
}

function selectDay(key, count) {
    _selectedDate = key;

    if (count > 0) {
        const dayRequests = _requests.filter(r =>
            r.saida && r.saida.slice(0, 10) === key
        );

        if (dayRequests.length > 0 && window.__gotoAdminTab) {
            window.__gotoAdminTab('admin-solicitacoes');
            if (window.__setRequestsHighlight) {
                window.__setRequestsHighlight(dayRequests[0].id);
            }
            return;
        }
    }

    renderNotesForDay(key);
    renderCalendar();
}

function renderNotesForDay(key) {
    const title = document.getElementById('notes-date-title');
    const list = document.getElementById('notes-list');
    const form = document.getElementById('note-form-container');

    if (!title || !list || !form) return;

    const dateObj = new Date(key + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    title.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    form.style.display = 'flex';

    const dayNotes = _notes[key] || {};
    const arr = Object.entries(dayNotes).map(([id, n]) => ({ ...n, id }));

    if (arr.length === 0) {
        list.innerHTML = `
            <div class="notes-empty">
                <i class="fas fa-sticky-note notes-empty-icon"></i>
                Nenhuma nota para este dia.<br>
                Adicione uma acima!
            </div>
        `;
        return;
    }

    arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const typeLabels = {
        'info': 'Info',
        'importante': 'Importante',
        'ocorrencia': 'Ocorrência',
        'sucesso': 'Sucesso'
    };

    list.innerHTML = arr.map(n => `
        <div class="note-item status-${n.type || 'info'}">
            <div class="note-header">
                <span class="note-type">${typeLabels[n.type] || n.type}</span>
                <button class="note-delete" onclick="deleteNote('${key}', '${n.id}')" title="Excluir">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="note-text">${escapeHtml(n.text)}</div>
            <div class="note-footer">
                <span><i class="fas fa-user"></i> ${escapeHtml(n.user || '—')}</span>
                <span>${formatDateTime(n.timestamp)}</span>
            </div>
        </div>
    `).join('');
}

export async function addNote() {
    if (!_selectedDate) {
        showNotification('Atenção', 'Selecione um dia no calendário primeiro.', 'warning');
        return;
    }

    const typeEl = document.getElementById('note-type');
    const textEl = document.getElementById('note-text');

    const type = typeEl?.value || 'info';
    const text = textEl?.value.trim() || '';

    if (!text) {
        showNotification('Atenção', 'Escreva o conteúdo da nota.', 'warning');
        textEl?.focus();
        return;
    }

    try {
        const newRef = push(ref(_db, 'notes/' + _selectedDate));
        await set(newRef, {
            type, text,
            user: _currentUser?.name || 'Sistema',
            timestamp: new Date().toISOString()
        });

        await addHistory('Nota Adicionada', _selectedDate,
            `Tipo: ${type} | Por: ${_currentUser?.name}`);

        if (textEl) textEl.value = '';

        showNotification('Nota Adicionada', 'Sua nota foi salva.', 'success');
    } catch (err) {
        console.error('[Notes] Erro:', err);
        showNotification('Erro', 'Não foi possível salvar a nota.', 'danger');
    }
}

export async function deleteNote(dateKey, noteId) {
    const ok = await sstConfirm('Excluir esta nota?', 'Excluir Nota', 'warning');
    if (!ok) return;

    try {
        await remove(ref(_db, `notes/${dateKey}/${noteId}`));
        await addHistory('Nota Excluída', dateKey, `Por: ${_currentUser?.name}`);
        showNotification('Excluída', 'Nota removida.', 'success');
    } catch (err) {
        console.error('[Notes] Erro:', err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

export function changeMonth(delta) {
    _calendarDate.setMonth(_calendarDate.getMonth() + delta);
    renderCalendar();
}

export function goToToday() {
    _calendarDate = new Date();
    _selectedDate = dateToKey(new Date());
    renderCalendar();
    renderNotesForDay(_selectedDate);
}

export function countNotesForDay(dateKey) {
    if (!_notes[dateKey]) return 0;
    return Object.keys(_notes[dateKey]).length;
}

export function hasNotesOnDay(dateKey) {
    return countNotesForDay(dateKey) > 0;
}

export function getNotesForDay(dateKey) {
    if (!_notes[dateKey]) return [];
    return Object.entries(_notes[dateKey])
        .map(([id, n]) => ({ ...n, id }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

window.addNote = addNote;
window.deleteNote = deleteNote;
window.changeMonth = changeMonth;
window.goToToday = goToToday;