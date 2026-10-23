// ============================================================
// SSOT - AGENDA DE HORÁRIOS
// ============================================================

import {
    ref, remove, onValue, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import {
    showNotification, escapeHtml, formatDate, formatDateLong
} from './utils.js';

import { addHistory } from './history.js';
import { sstConfirm, sstAlert } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _slots = {};
let _unsub = null;

export function setScheduleContext(db, currentUser) {
    _db = db;
    _currentUser = currentUser;
}

export function getAllSlots() { return _slots; }

export function subscribeSlots() {
    if (!_db) return null;
    if (_unsub) { try { _unsub(); } catch (e) {} }

    _unsub = onValue(ref(_db, 'schedule'), (snap) => {
        _slots = snap.val() || {};
        renderSlotsAdmin();
        populateUserTimeSlots();
        renderUpcomingSlotsWidget();
    }, (error) => console.error('[Schedule]', error));

    return _unsub;
}

export function unsubscribeSlots() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
}

function generateIntervals(start, end) {
    const result = [];
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);

    let cur = sh * 60 + sm;
    const endMin = eh * 60 + em;

    while (cur <= endMin) {
        const h = Math.floor(cur / 60);
        const m = cur % 60;
        result.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        cur += 30;
    }
    return result;
}

/**
 * ✅ ESTRUTURA: schedule/{YYYY-MM-DD}/{HH-MM} = { time, date, available, ... }
 */
export async function addSlotBlock(date, start, end) {
    if (!_db) {
        await sstAlert('Sistema não conectado.', 'Erro', 'danger');
        return;
    }

    if (!date || !start || !end) {
        await sstAlert('Preencha data, hora inicial e hora final.', 'Campos obrigatórios', 'warning');
        return;
    }

    if (start >= end) {
        await sstAlert('A hora inicial deve ser anterior à final.', 'Horário inválido', 'warning');
        return;
    }

    const intervals = generateIntervals(start, end);
    if (intervals.length === 0) {
        await sstAlert('Nenhum horário gerado.', 'Erro', 'warning');
        return;
    }

    const existingToday = _slots[date] ? Object.keys(_slots[date]).length : 0;
    if (existingToday > 0) {
        const ok = await sstConfirm(
            `Já existem ${existingToday} horários em ${formatDate(date)}.\n\nDeseja adicionar mesmo assim?`,
            'Horários existentes',
            'warning'
        );
        if (!ok) return;
    }

    const updates = {};
    intervals.forEach(time => {
        const key = time.replace(':', '-');
        updates[key] = {
            time, date, available: true,
            createdBy: _currentUser?.name || 'Sistema',
            createdAt: new Date().toISOString()
        };
    });

    try {
        await update(ref(_db, 'schedule/' + date), updates);
        await addHistory('Agenda Atualizada', date,
            `${intervals.length} horários adicionados (${start} às ${end})`);
        showNotification('Bloco Adicionado',
            `${intervals.length} horários criados para ${formatDate(date)}.`, 'success');
    } catch (err) {
        console.error('[Schedule]', err);
        await sstAlert('Não foi possível adicionar.\n\nVerifique as regras do Firebase.', 'Erro', 'danger');
    }
}

export async function removeSlot(date, time) {
    const ok = await sstConfirm(`Remover ${time} de ${formatDate(date)}?`, 'Remover Horário', 'warning');
    if (!ok) return;

    const timeKey = time.replace(':', '-');
    try {
        await remove(ref(_db, `schedule/${date}/${timeKey}`));
        await addHistory('Agenda Atualizada', date, `Horário ${time} removido`);
        showNotification('Removido', 'Horário removido.', 'success');
    } catch (err) {
        console.error('[Schedule]', err);
        showNotification('Erro', 'Não foi possível remover.', 'danger');
    }
}

export async function removeDay(date) {
    if (!_slots[date]) {
        showNotification('Aviso', 'Nenhum horário neste dia.', 'warning');
        return;
    }

    const count = Object.keys(_slots[date]).length;
    const ok = await sstConfirm(
        `Remover TODOS os ${count} horários de ${formatDate(date)}?\n\nAção irreversível.`,
        'Remover Dia',
        'danger'
    );
    if (!ok) return;

    try {
        await remove(ref(_db, 'schedule/' + date));
        await addHistory('Agenda Atualizada', date, `Todos os horários removidos`);
        showNotification('Removido', 'Dia removido.', 'success');
    } catch (err) {
        console.error('[Schedule]', err);
        showNotification('Erro', 'Não foi possível remover.', 'danger');
    }
}

export function renderSlotsAdmin() {
    const container = document.getElementById('slots-container');
    if (!container) return;

    const sortedDays = Object.keys(_slots).sort();

    if (sortedDays.length === 0) {
        container.innerHTML = `
            <div class="notes-empty">
                <svg class="si si-2x" style="opacity:0.3;margin-bottom:10px;"><use href="#i-calendar-check"/></svg>
                Nenhum horário cadastrado.<br>Adicione um bloco acima.
            </div>
        `;
        return;
    }

    container.innerHTML = sortedDays.map(date => {
        const dayData = _slots[date] || {};
        const slots = Object.entries(dayData).map(([key, val]) => ({
            time: key.replace('-', ':'), ...val, timeKey: key
        }));
        slots.sort((a, b) => a.time.localeCompare(b.time));

        const reservedCount = slots.filter(s => s.requestId).length;

        return `
            <div class="slot-day-block">
                <div class="slot-day-header">
                    <h4>
                        <svg class="si si-fw"><use href="#i-calendar"/></svg>
                        ${formatDate(date)}
                        ${reservedCount > 0 ? `<span class="badge badge-warning" style="font-size:0.65rem;margin-left:6px;">${reservedCount} reservado${reservedCount > 1 ? 's' : ''}</span>` : ''}
                    </h4>
                    <button class="btn btn-danger btn-sm" onclick="removeDay('${date}')">
                        <svg class="si"><use href="#i-trash"/></svg> Remover Dia
                    </button>
                </div>
                <div class="slot-times">
                    ${slots.map(s => `
                        <div class="slot-chip ${s.requestId ? 'slot-reserved' : ''}"
                             title="${s.requestId ? 'Reservado: ' + s.requestId : 'Disponível'}">
                            <span>${s.time}</span>
                            <button class="slot-remove" onclick="removeSlot('${date}', '${s.time}')">&times;</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

export function populateUserTimeSlots() {
    const select = document.getElementById('u-saida');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione uma data disponível...</option>';

    const today = new Date().toISOString().slice(0, 10);
    let hasAny = false;

    const sortedDays = Object.keys(_slots).sort();

    sortedDays.forEach(date => {
        if (date < today) return;

        const dayData = _slots[date] || {};
        const available = [];

        Object.entries(dayData).forEach(([key, val]) => {
            if (val.available === false || val.requestId) return;
            available.push(key.replace('-', ':'));
        });

        if (available.length === 0) return;
        hasAny = true;

        const optGroup = document.createElement('optgroup');
        optGroup.label = formatDateLong(date);
        available.sort().forEach(time => {
            const opt = document.createElement('option');
            opt.value = `${date}T${time}`;
            opt.textContent = time;
            optGroup.appendChild(opt);
        });
        select.appendChild(optGroup);
    });

    if (!hasAny) {
        select.innerHTML = '<option value="">Nenhum horário disponível</option>';
    }
}

export async function reserveSlot(date, time, requestNum) {
    const timeKey = time.replace(':', '-');
    try {
        await update(ref(_db, `schedule/${date}/${timeKey}`), {
            requestId: requestNum, available: false,
            reservedAt: new Date().toISOString(),
            reservedBy: _currentUser?.name || 'Sistema'
        });
    } catch (err) {
        console.error('[Schedule] Erro ao reservar:', err);
    }
}

export function renderUpcomingSlotsWidget() {
    const container = document.getElementById('dashboard-upcoming-slots');
    if (!container) return;

    const now = new Date();
    const reserved = [];

    Object.entries(_slots).forEach(([date, dayData]) => {
        if (!dayData || typeof dayData !== 'object') return;
        Object.entries(dayData).forEach(([timeKey, val]) => {
            if (!val.requestId) return;
            const time = timeKey.replace('-', ':');
            const slotDate = new Date(`${date}T${time}:00`);
            if (isNaN(slotDate.getTime()) || slotDate < now) return;
            reserved.push({ date, time, requestId: val.requestId, slotDate });
        });
    });

    reserved.sort((a, b) => a.slotDate - b.slotDate);

    if (reserved.length === 0) {
        container.innerHTML = '<div class="widget-empty">Nenhum horário reservado.</div>';
        return;
    }

    container.innerHTML = reserved.slice(0, 5).map(s => `
        <div class="widget-item">
            <div class="widget-item-icon"><svg class="si"><use href="#i-clock"/></svg></div>
            <div class="widget-item-content">
                <div class="widget-item-title">${s.time} — ${formatDate(s.date)}</div>
                <div class="widget-item-subtitle">Solicitação: <strong>${escapeHtml(s.requestId)}</strong></div>
            </div>
        </div>
    `).join('');
}

window.removeSlot = removeSlot;
window.removeDay = removeDay;
// ============================================================
// ADICIONAR HORÁRIO INDIVIDUAL (v10.4)
// ============================================================
export async function addSingleSlot(date, time) {
    if (!_db) {
        await sstAlert('Sistema não conectado.', 'Erro', 'danger');
        return;
    }
    if (!date || !time) {
        await sstAlert('Informe a data e o horário.', 'Campos obrigatórios', 'warning');
        return;
    }

    const timeKey = time.replace(':', '-');
    const existing = _slots[date]?.[timeKey];

    if (existing) {
        const ok = await sstConfirm(
            `Já existe um horário ${time} em ${formatDate(date)}.\n\nDeseja sobrescrever?`,
            'Horário existente',
            'warning'
        );
        if (!ok) return;
    }

    try {
        await update(ref(_db, `schedule/${date}/${timeKey}`), {
            time, date, available: true,
            createdBy: _currentUser?.name || 'Sistema',
            createdAt: new Date().toISOString()
        });
        await addHistory('Agenda Atualizada', date, `Horário ${time} adicionado`);
        showNotification('Adicionado', `Horário ${time} adicionado em ${formatDate(date)}.`, 'success');
    } catch (err) {
        console.error('[Schedule]', err);
        await sstAlert('Não foi possível adicionar.', 'Erro', 'danger');
    }
}