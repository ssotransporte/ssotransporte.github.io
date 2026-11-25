// ============================================================
// SSOT - FUNÇÕES UTILITÁRIAS (v10.8 - Fuso horário corrigido)
// ============================================================

import {
    STATUS_LABELS, STATUS_BADGE,
    PRIORIDADE_LABELS, PRIORIDADE_BADGE,
    VEHICLE_LABELS
} from './config.js';

// ============================================================
// NOTIFICAÇÕES
// ============================================================
export function showNotification(title, message, type = 'info', duration = 4500) {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;

    const n = document.createElement('div');
    n.className = `alert alert-${type} notification`;
    n.innerHTML = `<div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
    panel.appendChild(n);
    setTimeout(() => {
        n.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => n.remove(), 300);
    }, duration);
}

export function showAlert(message, type = 'danger', duration = 5000) {
    const main = document.querySelector('.main-content') || document.body;
    const a = document.createElement('div');
    a.className = `alert alert-${type}`;
    a.innerHTML = `<span>${escapeHtml(message)}</span>`;
    main.insertBefore(a, main.firstChild);
    setTimeout(() => a.remove(), duration);
}

// ============================================================
// SEGURANÇA
// ============================================================
export function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

export function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

export function isValidPassword(pwd) {
    return pwd && typeof pwd === 'string' && pwd.length >= 6;
}

// ============================================================
// DATAS — Parsing seguro (Fuso Horário Corrigido)
// ============================================================

/**
 * Converte string/Date em Date de forma segura e respeitando o fuso horário.
 */
export function parseDateSafe(d) {
    if (!d) return null;
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;

    const s = String(d).trim();

    // 1. Se tem fuso horário explícito (UTC 'Z' ou offset '+03:00' / '-03:00'), 
    // deixa o JavaScript nativo fazer a conversão correta para o fuso local (Brasília).
    if (s.includes('Z') || /[+-]\d{2}:\d{2}$/.test(s)) {
        const dt = new Date(s);
        return isNaN(dt.getTime()) ? null : dt;
    }

    // 2. YYYY-MM-DD puro (data sem hora) -> Cria como meia-noite local
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (isoDate) {
        const dt = new Date(
            parseInt(isoDate[1]),
            parseInt(isoDate[2]) - 1,
            parseInt(isoDate[3])
        );
        return isNaN(dt.getTime()) ? null : dt;
    }

    // 3. YYYY-MM-DDTHH:mm(:ss)? SEM fuso (input datetime-local) -> Cria como hora local
    const isoDT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (isoDT) {
        const dt = new Date(
            parseInt(isoDT[1]),
            parseInt(isoDT[2]) - 1,
            parseInt(isoDT[3]),
            parseInt(isoDT[4]),
            parseInt(isoDT[5]),
            parseInt(isoDT[6] || '0')
        );
        return isNaN(dt.getTime()) ? null : dt;
    }

    // 4. Fallback
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
}

export function formatDateTime(d) {
    const dt = parseDateSafe(d);
    if (!dt) return '—';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, '0');
    const mi = String(dt.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export function formatDate(d) {
    const dt = parseDateSafe(d);
    if (!dt) return '—';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

export function formatDateLong(d) {
    const dt = parseDateSafe(d);
    if (!dt) return '—';
    const weekdays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `${weekdays[dt.getDay()]}, ${dt.getDate()} de ${months[dt.getMonth()]} de ${dt.getFullYear()}`;
}

export function dateToKey(date) {
    const d = date instanceof Date ? date : parseDateSafe(date);
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function daysBetween(dateA, dateB) {
    const a = parseDateSafe(dateA);
    const b = parseDateSafe(dateB);
    if (!a || !b) return 0;
    return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// ============================================================
// STATUS / PRIORIDADE
// ============================================================
export function getStatusText(s) { return STATUS_LABELS[s] || 'Pendente'; }
export function getStatusBadgeClass(s) { return STATUS_BADGE[s] || 'badge-warning'; }
export function getPrioridadeText(p) { return PRIORIDADE_LABELS[p] || 'Normal'; }
export function getPrioridadeBadgeClass(p) { return PRIORIDADE_BADGE[p] || 'badge-primary'; }
export function getVeiculoText(v) { return VEHICLE_LABELS[v] || '—'; }

// ============================================================
// STRINGS
// ============================================================
export function truncate(text, max = 30) {
    if (!text) return '';
    const s = String(text);
    return s.length > max ? s.slice(0, max) + '...' : s;
}

export function getInitials(name) {
    if (!name) return 'U';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ============================================================
// PERFORMANCE
// ============================================================
export function debounce(fn, wait = 300) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), wait);
    };
}

// ============================================================
// DOWNLOADS
// ============================================================
export function downloadCanvas(canvasId, filename = 'grafico') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    try {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_${dateToKey(new Date())}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showNotification('Download', 'Imagem salva com sucesso!', 'success');
    } catch (e) {
        console.error(e);
    }
}

export function downloadCSV(data, filename = 'dados') {
    if (!data || data.length === 0) {
        showNotification('Exportação', 'Não há dados para exportar.', 'danger');
        return;
    }
    const headers = Object.keys(data[0]);
    let csv = '\ufeff' + headers.join(';') + '\n';
    data.forEach(item => {
        csv += headers.map(h => {
            let v = item[h] == null ? '' : String(item[h]);
            v = v.replace(/"/g, '""');
            if (v.includes(';') || v.includes('\n') || v.includes('"')) v = `"${v}"`;
            return v;
        }).join(';') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${dateToKey(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('Exportação', 'Arquivo CSV gerado!', 'success');
}

export function downloadJSON(data, filename = 'backup') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${dateToKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================
// CORES
// ============================================================
export function getChartColor(index) {
    const palette = ['#3498db', '#27ae60', '#c0392b', '#d68910', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
    return palette[index % palette.length];
}

// ============================================================
// IMAGEM — redimensionar para foto de perfil
// ============================================================
export function resizeImage(file, maxSize = 200) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('Arquivo não é uma imagem.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;

                if (w > h) {
                    if (w > maxSize) { h = h * maxSize / w; w = maxSize; }
                } else {
                    if (h > maxSize) { w = w * maxSize / h; h = maxSize; }
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = () => reject(new Error('Erro ao carregar imagem.'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
        reader.readAsDataURL(file);
    });
}