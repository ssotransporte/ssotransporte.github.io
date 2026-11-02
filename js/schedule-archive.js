// ============================================================
// SSOT · AGENDA — Arquivamento de dias passados (v1.1)
// Move dias inteiros de /schedule para /schedule_archive
// ============================================================

import { ref, get, update, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { sstConfirm, sstAlert } from './dialogs.js';
import { showNotification } from './utils.js';
import { addHistory } from './history.js';

function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
        sstAlert('Nenhum dia passado para arquivar. Todos os horários são de hoje ou futuros.', 'Nada a arquivar', 'info');
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
        try { await addHistory('Agenda Arquivada', '-', `${dayCount} dia(s) — ${slotCount} horário(s)`); } catch (e) {}

        if (typeof onDone === 'function') onDone();
    } catch (err) {
        console.error('[Archive] Erro:', err);
        sstAlert('Falha ao arquivar: ' + err.message, 'Erro', 'danger');
    }
}

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