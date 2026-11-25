/* ============================================================
   SSOT — registro-frota-settings.js
   v1.0

   Responsabilidades:
   1) Botão "Registro" de Solicitações (modal com períodos).
   2) Seletor de layout da Frota (Grid × Lista).
   3) Persistência de preferências no Firebase RTDB, por usuário.

   Estrutura no banco:
     users/{uid}/settings/fleetLayout = "grid" | "list"

   Como é auto-contido, ele NÃO interfere em nada do app.js existente:
   - Usa window.state.requests (se existir) para pegar as solicitações.
   - Caso contrário, tenta ler direto do RTDB em caminhos comuns.
   ============================================================ */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

/* Caminho das configurações do usuário no RTDB.
   Ajuste se seu app.js usar outra estrutura (ex.: profiles/{uid}). */
const SETTINGS_PATH = (uid) => `users/${uid}/settings`;

/* ---------- ESTADO ---------- */
let currentUid      = null;
let domReady        = false;
let authReady       = false;
let registroPeriod  = 'prev-month';
let registroStart   = null;
let registroEnd     = null;
let registroCache   = null;

/* ============================================================
   SETTINGS — leitura/gravação por usuário
   ============================================================ */
async function saveUserSetting(key, value) {
    if (!currentUid) {
        console.warn('[settings] Sem UID, não salvou:', key);
        return false;
    }
    try {
        await update(ref(db, SETTINGS_PATH(currentUid)), { [key]: value });
        return true;
    } catch (e) {
        console.error('[settings] Erro ao salvar', key, e);
        return false;
    }
}

async function loadUserSetting(key) {
    if (!currentUid) return undefined;
    try {
        const snap = await get(ref(db, `${SETTINGS_PATH(currentUid)}/${key}`));
        return snap.exists() ? snap.val() : undefined;
    } catch (e) {
        console.error('[settings] Erro ao carregar', key, e);
        return undefined;
    }
}

/* ============================================================
   LAYOUT DA FROTA — Grid × Lista
   ============================================================ */
function applyFleetLayout(layout) {
    const normalized = layout === 'list' ? 'list' : 'grid';
    document.querySelectorAll('.fleet-card-grid').forEach(el => {
        el.classList.remove('fleet-layout-grid', 'fleet-layout-list');
        el.classList.add(normalized === 'list' ? 'fleet-layout-list' : 'fleet-layout-grid');
    });
}

/* Exposto globalmente — útil para o app.js quando re-renderiza a Frota */
window.applyFleetLayout = applyFleetLayout;

async function initFleetLayoutSelector() {
    const sel = document.getElementById('fleet-layout-selector');
    if (!sel || sel.dataset.bound === '1') return;
    sel.dataset.bound = '1';

    if (currentUid) {
        const saved = await loadUserSetting('fleetLayout');
        if (saved === 'grid' || saved === 'list') {
            sel.value = saved;
            applyFleetLayout(saved);
        } else {
            applyFleetLayout('grid');
        }
    }

    sel.addEventListener('change', async () => {
        const v = sel.value === 'list' ? 'list' : 'grid';
        applyFleetLayout(v);
        const ok = await saveUserSetting('fleetLayout', v);
        if (!ok && typeof window.showNotification === 'function') {
            window.showNotification('warning', 'Layout aplicado, mas não foi possível salvar na conta.');
        }
    });
}

/* ============================================================
   REGISTRO DE SOLICITAÇÕES
   ============================================================ */

/* Converte vários formatos para Date */
function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

/* Tenta vários campos comuns para data da solicitação */
function getRequestDate(r) {
    if (!r) return null;
    return r.dataSolicitacao
        || r.createdAt
        || r.data
        || r.dataHora
        || r.saida
        || r.dataSaida
        || null;
}

/* Tenta pegar lista de solicitações do window.state (o app.js costuma expor) */
function getRequestsFromWindow() {
    if (window.state && Array.isArray(window.state.requests)) return window.state.requests;
    if (Array.isArray(window.requests)) return window.requests;
    if (Array.isArray(window.allRequests)) return window.allRequests;
    if (Array.isArray(window.solicitacoes)) return window.solicitacoes;
    return null;
}

/* Fallback: leitura direta do RTDB em caminhos comuns */
async function getRequestsArray() {
    const fromWindow = getRequestsFromWindow();
    if (fromWindow) return fromWindow;

    const paths = ['solicitacoes', 'requests', 'solicitacoes/items', 'solicitacoes/lista'];
    for (const p of paths) {
        try {
            const snap = await get(ref(db, p));
            if (snap.exists()) {
                const val = snap.val();
                if (Array.isArray(val)) return val.filter(Boolean);
                if (val && typeof val === 'object') return Object.values(val);
            }
        } catch (_) { /* ignora caminho inválido */ }
    }
    return [];
}

function computeRange() {
    if (registroPeriod === 'all') return { start: null, end: null };
    if (registroPeriod === 'custom') {
        return {
            start: registroStart ? new Date(registroStart + 'T00:00:00') : null,
            end:   registroEnd   ? new Date(registroEnd   + 'T23:59:59') : null
        };
    }
    // Mês anterior
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const end   = new Date(now.getFullYear(), now.getMonth(),     0, 23, 59, 59);
    return { start, end };
}

function filterByPeriod(list, start, end) {
    if (!start || !end) return list.slice();
    return list.filter(r => {
        const d = toDate(getRequestDate(r));
        return d && d >= start && d <= end;
    });
}

async function refreshRegistroView(force = false) {
    if (force || !registroCache) {
        registroCache = await getRequestsArray();
    }
    const { start, end } = computeRange();
    const filtered = filterByPeriod(registroCache, start, end);

    /* Total */
    const totalEl = document.getElementById('registro-total');
    if (totalEl) totalEl.textContent = filtered.length;

    /* Badge do botão */
    const badge = document.getElementById('admin-registro-count');
    if (badge) badge.textContent = filtered.length;

    /* Status textual */
    const status = document.getElementById('registro-status');
    if (status) {
        if (!registroCache.length) {
            status.textContent = 'Nenhuma solicitação carregada ainda.';
        } else if (!filtered.length) {
            status.textContent = 'Nenhum registro no período selecionado.';
        } else {
            status.textContent = `${filtered.length} registro(s) no período selecionado.`;
        }
    }

    /* Tabela de detalhes */
    const tbody = document.getElementById('registro-table-body');
    if (tbody) {
        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="table-empty"><p>Sem registros.</p></td></tr>`;
        } else {
            tbody.innerHTML = filtered.map(r => {
                const d = toDate(getRequestDate(r));
                const dataStr = d ? d.toLocaleString('pt-BR') : '—';
                const num  = r.numero || r.id || '—';
                const nome = r.solicitante || r.nome || '—';
                const dest = r.destino || '—';
                const st   = r.status || '—';
                return `<tr>
                    <td>${num}</td>
                    <td>${nome}</td>
                    <td>${dest}</td>
                    <td>${dataStr}</td>
                    <td>${st}</td>
                </tr>`;
            }).join('');
        }
    }
}

/* ============================================================
   APIs GLOBAIS (chamadas pelo HTML)
   ============================================================ */
window.openRegistroModal = async function () {
    const modal = document.getElementById('registro-modal');
    if (!modal) return;

    /* Reset do estado */
    registroPeriod = 'prev-month';
    registroStart = registroEnd = null;
    registroCache = null;

    document.querySelectorAll('#registro-period-tabs .tab-inner').forEach(t => {
        t.classList.toggle('active', t.dataset.period === 'prev-month');
    });
    const custom = document.getElementById('registro-custom-range');
    if (custom) custom.style.display = 'none';
    const s = document.getElementById('registro-start'); if (s) s.value = '';
    const e = document.getElementById('registro-end');   if (e) e.value = '';
    const det = document.getElementById('registro-details');
    if (det) det.style.display = 'none';
    const btn = document.getElementById('registro-details-toggle');
    if (btn) btn.textContent = 'Ver detalhes';

    modal.classList.add('active');
    await refreshRegistroView(true);
};

window.closeRegistroModal = function () {
    document.getElementById('registro-modal')?.classList.remove('active');
};

window.toggleRegistroDetails = function () {
    const det = document.getElementById('registro-details');
    const btn = document.getElementById('registro-details-toggle');
    if (!det) return;
    const visible = det.style.display !== 'none';
    det.style.display = visible ? 'none' : 'block';
    if (btn) btn.textContent = visible ? 'Ver detalhes' : 'Ocultar detalhes';
};

/* Chamável de fora (ex.: app.js) para atualizar o badge sem abrir o modal */
window.updateRegistroBadge = async function () {
    await refreshRegistroView(true);
};

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
function bindRegistroTabs() {
    document.querySelectorAll('#registro-period-tabs .tab-inner').forEach(btn => {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            registroPeriod = btn.dataset.period;
            document.querySelectorAll('#registro-period-tabs .tab-inner')
                .forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const custom = document.getElementById('registro-custom-range');
            if (custom) custom.style.display = (registroPeriod === 'custom') ? 'flex' : 'none';
            refreshRegistroView();
        });
    });

    const s = document.getElementById('registro-start');
    const e = document.getElementById('registro-end');
    if (s && s.dataset.bound !== '1') {
        s.dataset.bound = '1';
        s.addEventListener('change', () => { registroStart = s.value; refreshRegistroView(); });
    }
    if (e && e.dataset.bound !== '1') {
        e.dataset.bound = '1';
        e.addEventListener('change', () => { registroEnd = e.value; refreshRegistroView(); });
    }
}

async function tryInit() {
    if (!domReady || !authReady) return;
    if (!currentUid) return;

    await initFleetLayoutSelector();
    try { await window.updateRegistroBadge(); } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    bindRegistroTabs();
    tryInit();
});

onAuthStateChanged(auth, (user) => {
    currentUid = user?.uid || null;
    authReady  = true;
    tryInit();
});