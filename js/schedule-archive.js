// ============================================================
// SSOT · AGENDA — Arquivamento + Calendário de dias passados
// v2.0
// Alterações:
//  - Modal de calendário com dias passados e atividades
//  - Visualização de horários (livre / reservado / arquivado)
//  - Arquivamento preserva a lógica original
// ============================================================

import {
    ref, get, update, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { sstConfirm, sstAlert } from './dialogs.js';
import { showNotification, escapeHtml } from './utils.js';
import { addHistory } from './history.js';

// ============================================================
// ESTADO DO CALENDÁRIO
// ============================================================
let _archiveDate = new Date();
let _archiveData = { active: {}, archived: {} };
let _archiveSelectedDay = null;
let _archiveDb = null;

// ============================================================
// HELPERS DE DATA
// ============================================================
function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayKey() {
    return dateKey(new Date());
}

// ============================================================
// ABRIR MODAL DE CALENDÁRIO
// ============================================================
export async function openArchiveCalendar(db) {
    _archiveDb = db || window._db;
    if (!_archiveDb) {
        sstAlert('Banco de dados não inicializado.', 'Erro', 'danger');
        return;
    }

    try {
        const [activeSnap, archSnap] = await Promise.all([
            get(ref(_archiveDb, 'schedule')),
            get(ref(_archiveDb, 'schedule_archive'))
        ]);
        _archiveData = {
            active: activeSnap.val() || {},
            archived: archSnap.val() || {}
        };
    } catch (e) {
        console.error('[Archive] load:', e);
        _archiveData = { active: {}, archived: {} };
    }

    _archiveDate = new Date();
    _archiveSelectedDay = null;
    renderArchiveCalendar();
    window.openModal('archive-modal');
}

export function closeArchiveModal() {
    window.closeModal('archive-modal');
}

export function archiveChangeMonth(delta) {
    _archiveDate.setMonth(_archiveDate.getMonth() + parseInt(delta));
    renderArchiveCalendar();
}

// ============================================================
// RENDERIZAÇÃO DO CALENDÁRIO
// ============================================================
function renderArchiveCalendar() {
    const grid = document.getElementById('archive-calendar-grid');
    const title = document.getElementById('archive-month-title');
    const details = document.getElementById('archive-day-details');
    if (!grid || !title) return;

    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const year = _archiveDate.getFullYear();
    const month = _archiveDate.getMonth();
    title.textContent = `${months[month]} ${year}`;

    const hoje = todayKey();

    const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    grid.innerHTML = '';
    dayNames.forEach(d => {
        const el = document.createElement('div');
        el.className = 'calendar-day-name';
        el.textContent = d;
        grid.appendChild(el);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Células vazias no início
    for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'calendar-day empty';
        grid.appendChild(el);
    }

    // Dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const key = dateKey(d);
        const isPast = key < hoje;
        const activeSlots = _archiveData.active[key] ? Object.keys(_archiveData.active[key]).length : 0;
        const archSlots = _archiveData.archived[key] ? Object.keys(_archiveData.archived[key]).length : 0;
        const total = activeSlots + archSlots;

        const el = document.createElement('div');
        el.className = 'calendar-day';
        if (key === hoje) el.classList.add('today');
        if (isPast && total > 0) el.classList.add('has-past-data');
        if (isPast && activeSlots > 0) el.classList.add('has-active-past');
        if (_archiveSelectedDay === key) el.classList.add('selected');

        el.innerHTML = `
            <span class="day-number">${day}</span>
            ${total > 0 ? `<span class="day-badge">${total}</span>` : ''}
        `;
        el.onclick = () => {
            _archiveSelectedDay = key;
            renderArchiveCalendar();
            renderArchiveDayDetails(key);
        };
        grid.appendChild(el);
    }

    if (_archiveSelectedDay) {
        renderArchiveDayDetails(_archiveSelectedDay);
    } else if (details) {
        details.classList.add('hidden');
    }
}

// ============================================================
// DETALHES DO DIA SELECIONADO
// ============================================================
function renderArchiveDayDetails(key) {
    const details = document.getElementById('archive-day-details');
    if (!details) return;
    details.classList.remove('hidden');

    const active = _archiveData.active[key] || {};
    const arch = _archiveData.archived[key] || {};

    // Junta horários (archived tem prioridade)
    const allTimes = new Set([...Object.keys(active), ...Object.keys(arch)]);
    const times = Array.from(allTimes).sort();

    const dayDate = new Date(key + 'T12:00:00');
    const dateStr = dayDate.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    if (times.length === 0) {
        details.innerHTML = `
            <div class="archive-empty">
                Nenhuma atividade em ${escapeHtml(dateStr)}.
            </div>
        `;
        return;
    }

    details.innerHTML = `
        <h4 style="margin-bottom:10px;text-transform:capitalize;">${escapeHtml(dateStr)}</h4>
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Horário</th>
                        <th>Situação</th>
                        <th>Solicitação</th>
                        <th>Data/Hora</th>
                    </tr>
                </thead>
                <tbody>
                    ${times.map(t => {
                        const isArchived = !!arch[t];
                        const data = isArchived ? arch[t] : active[t];
                        const reqId = data.requestId || '—';

                        let status;
                        if (isArchived) {
                            status = '<span class="badge badge-secondary">Arquivado</span>';
                        } else if (data.requestId) {
                            status = '<span class="badge badge-warning">Reservado</span>';
                        } else {
                            status = '<span class="badge badge-success">Livre</span>';
                        }

                        let when = '—';
                        if (data.reservedAt) {
                            when = new Date(data.reservedAt).toLocaleString('pt-BR');
                        } else if (data.archivedAt) {
                            when = new Date(data.archivedAt).toLocaleString('pt-BR');
                        }

                        return `<tr>
                            <td><strong>${t.replace('-', ':')}</strong></td>
                            <td>${status}</td>
                            <td>${escapeHtml(String(reqId))}</td>
                            <td style="font-size:0.8rem;color:#7f8c8d;">${when}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ============================================================
// ARQUIVAMENTO (mesma lógica original, com retorno)
// ============================================================
export async function archivePastSlots(db, onDone) {
    if (!db) {
        sstAlert('Banco de dados não inicializado.', 'Erro', 'danger');
        return;
    }

    let snap;
    try {
        snap = await get(ref(db, 'schedule'));
    } catch (err) {
        console.error('[Archive] Erro ao ler schedule:', err);
        sstAlert('Falha ao ler a agenda.', 'Erro', 'danger');
        return;
    }

    if (!snap.exists()) {
        sstAlert('Não há horários cadastrados.', 'Agenda vazia', 'info');
        return;
    }

    const allDays = snap.val() || {};
    const hoje = todayKey();

    const pastDays = {};
    Object.keys(allDays).forEach(date => {
        if (date < hoje) pastDays[date] = allDays[date] || {};
    });

    const dayCount = Object.keys(pastDays).length;
    const slotCount = Object.values(pastDays).reduce(
        (s, times) => s + Object.keys(times).length, 0
    );

    if (dayCount === 0) {
        sstAlert(
            'Nenhum dia passado para arquivar. Todos os horários são de hoje ou futuros.',
            'Nada a arquivar',
            'info'
        );
        return;
    }

    const ok = await sstConfirm(
        `Arquivar ${dayCount} dia(s) passado(s) (${slotCount} horário(s))?\n\n` +
        `• Serão movidos para /schedule_archive (mantidos)\n` +
        `• Nada será perdido\n` +
        `• A agenda ativa ficará apenas com dias futuros`,
        'Arquivar agenda passada',
        'warning'
    );
    if (!ok) return;

    try {
        showNotification('Arquivando', `${dayCount} dia(s)...`, 'info');
        const now = new Date().toISOString();

        // 1) Copia para /schedule_archive
        const updates = {};
        Object.entries(pastDays).forEach(([date, times]) => {
            Object.entries(times).forEach(([timeKey, data]) => {
                updates[`schedule_archive/${date}/${timeKey}`] = {
                    ...(data || {}),
                    archivedAt: now,
                    archivedBy: 'sistema'
                };
            });
        });
        await update(ref(db), updates);

        // 2) Remove da /schedule ativa
        for (const date of Object.keys(pastDays)) {
            await remove(ref(db, 'schedule/' + date));
        }

        showNotification('Arquivado', `${dayCount} dia(s) movido(s).`, 'success');
        try {
            await addHistory('Agenda Arquivada', '-', `${dayCount} dia(s) — ${slotCount} horário(s)`);
        } catch (e) {}

        if (typeof onDone === 'function') onDone();
    } catch (err) {
        console.error('[Archive] Erro:', err);
        sstAlert('Falha ao arquivar: ' + err.message, 'Erro', 'danger');
    }
}

// ============================================================
// CONTAGEM DE DIAS PASSADOS (para o badge)
// ============================================================
export async function countPastSlots(db) {
    if (!db) return 0;
    try {
        const snap = await get(ref(db, 'schedule'));
        if (!snap.exists()) return 0;
        const hoje = todayKey();
        let count = 0;
        snap.forEach(child => {
            if (child.key < hoje) count++;
        });
        return count;
    } catch (e) {
        return 0;
    }
}

// ============================================================
// EXPOSIÇÃO GLOBAL (para onclick no HTML)
// ============================================================
window.closeArchiveModal = closeArchiveModal;
window.archiveChangeMonth = archiveChangeMonth;