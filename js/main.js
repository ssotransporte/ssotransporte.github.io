// ============================================================
// SSOT - MAIN (v15.2) — imports resilientes, exports primeiro
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, get, ref, set, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { firebaseConfig } from './firebase-config.js';
import {
    TAB_TITLES, TAB_SUBTITLES, ROLE_LABELS, ADMIN_ROLES,
    SESSION_STORAGE_KEY, SESSION_ACTIVE_KEY,
    FIREBASE_LOAD_TIMEOUT, APP_VERSION
} from './config.js';

import { showNotification, showAlert, downloadJSON, getInitials } from './utils.js';
import { sstAlert, sstConfirm, sstPrompt } from './dialogs.js';

import * as Auth from './auth.js';
import * as Session from './session.js';
import * as History from './history.js';
import * as Users from './users.js';
import * as Signups from './signups.js';
import * as Requests from './requests.js';
import * as Schedule from './schedule.js';
import * as Dashboard from './dashboard.js';
import * as Trash from './trash.js';
import * as FleetExcel from './fleet-excel.js';
import * as Reports from './reports.js';
import * as Settings from './settings.js';
import * as Notifications from './notifications.js';
import * as Profile from './profile.js';

// Optional modules — loaded dynamically
let ScheduleArchive = null;
let PhoneHelp = null;

let app, db, auth;
let currentUser = null;
let isAdmin = false;
let subscribersActive = false;
let isResuming = false;
let _loginInProgress = false;
let _enterSystemDone = false;
let _pendingDeepLink = null;
let _areaMode = null;
let _fleetCurrentTab = 'viagens';

const AREA_KEY = 'ssot_area_';

// ============================================================
// Helper: open/close modal (top-level, sempre disponível)
// ============================================================
window.openModal = (id) => document.getElementById(id)?.classList.add('active');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

// ============================================================
// INIT
// ============================================================
async function init() {
    console.log('[SSOT] Inicializando…');

    const safetyTimeout = setTimeout(() => {
        const loading = document.getElementById('conn-loading');
        if (loading && !loading.classList.contains('hidden')) {
            console.warn('[SSOT] Safety timeout: forçando login');
            loading.classList.add('hidden');
            document.getElementById('login-page')?.classList.remove('hidden');
        }
    }, FIREBASE_LOAD_TIMEOUT || 6000);

    // 1. Firebase (única coisa que pode impedir tudo — mas com mensagem clara)
    try {
        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        auth = getAuth(app);
        window._db = db;
        if (window.__ssotSafetyTimer) {
            clearTimeout(window.__ssotSafetyTimer);
            window.__ssotSafetyTimer = null;
        }
    } catch (err) {
        clearTimeout(safetyTimeout);
        console.error('[SSOT] Firebase falhou:', err);
        document.getElementById('conn-loading')?.classList.add('hidden');
        document.getElementById('login-page')?.classList.remove('hidden');
        const card = document.querySelector('.login-card');
        if (card && !card.querySelector('.ssot-init-err')) {
            const warn = document.createElement('div');
            warn.className = 'alert alert-danger ssot-init-err';
            warn.style.cssText = 'margin-bottom:15px;';
            warn.innerHTML = '<strong>Erro de conexão com Firebase</strong><br>' +
                (err.message || 'Verifique firebase-config.js') +
                '<br><small>Console (F12) para detalhes.</small>';
            card.insertBefore(warn, card.firstChild);
        }
        return;
    }

    // 2. Contextos globais básicos (podem falhar isoladamente)
    try { Signups.setSignupsContext(db, null, false); } catch (e) { console.error('[Signups]', e); }
    window._addHistoryInternal = (a, n, d) => History.addHistory(a, n, d).catch(() => {});
    window._getUsersForNotif = () => Users.getUsers();

    // 3. Exports globais PRIMEIRO (essencial para botões funcionarem)
    try { setupGlobalExports(); } catch (e) { console.error('[Exports]', e); }

    // 4. Carregar módulos opcionais (falha não mata o app)
    await loadOptionalModules();

    // 5. Deep link
    const params = new URLSearchParams(window.location.search);
    const reqId = params.get('request');
    if (reqId) _pendingDeepLink = reqId;

    // 6. Setups individuais (cada um protegido)
    try { Settings.setupServices(); } catch (e) { console.error('[Settings]', e); }
    try { updateNetworkStatus(); } catch (e) { console.error('[Network]', e); }
    try { setupEventListeners(); } catch (e) { console.error('[Events]', e); }
    try { setupFormTabs(); } catch (e) { console.error('[FormTabs]', e); }
    try { setupUsersTabs(); } catch (e) { console.error('[UsersTabs]', e); }
    try { setupMobileSidebar(); } catch (e) { console.error('[Mobile]', e); }

    // 7. Auth state
    onAuthStateChanged(auth, async (user) => {
        clearTimeout(safetyTimeout);
        if (_loginInProgress) return;
        if (_enterSystemDone && user && currentUser && currentUser.uid === user.uid) return;
        if (user) await handleUserLoggedIn(user);
        else handleUserLoggedOut();
    });

    console.log('[SSOT] Inicialização completa · Build: ' + APP_VERSION);
}

async function loadOptionalModules() {
    try {
        ScheduleArchive = await import('./schedule-archive.js');
        console.log('[SSOT] schedule-archive OK');
    } catch (e) {
        console.warn('[SSOT] schedule-archive indisponível:', e.message);
        ScheduleArchive = {
            archivePastSlots: async () => alert('Arquivamento indisponível.'),
            countPastSlots: async () => 0
        };
    }
    try {
        PhoneHelp = await import('./phone-help.js');
        console.log('[SSOT] phone-help OK');
    } catch (e) {
        console.warn('[SSOT] phone-help indisponível:', e.message);
        // Fallbacks globais para os botões do modal de ajuda
        window.openHelpModal = window.openHelpModal || function (ev) {
            if (ev) ev.preventDefault();
            window.openModal('help-modal');
        };
        window.closeHelpModal = window.closeHelpModal || function () {
            window.closeModal('help-modal');
        };
        window.sendHelpCode = window.sendHelpCode || async function () {
            alert('Ajuda por SMS indisponível no momento. Verifique o console.');
        };
        window.verifyHelpCode = window.verifyHelpCode || async function () {
            alert('Ajuda por SMS indisponível no momento. Verifique o console.');
        };
    }
}

// ============================================================
// SIDEBAR MOBILE
// ============================================================
function setupMobileSidebar() {
    const t = document.getElementById('mobile-menu-toggle');
    const n = document.getElementById('main-nav');
    const o = document.getElementById('sidebar-overlay');
    if (t && n && o) {
        t.addEventListener('click', () => { n.classList.toggle('active'); o.classList.toggle('active'); });
        o.addEventListener('click', () => { n.classList.remove('active'); o.classList.remove('active'); });
    }
}
function closeMobileSidebar() {
    document.getElementById('main-nav')?.classList.remove('active');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
}

function setupFormTabs() {
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const tgt = this.getAttribute('data-form-tab');
            document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.querySelector(`[data-form-content="${tgt}"]`)?.classList.add('active');
        });
    });
}
window.goToFormTab = function (t) {
    document.querySelectorAll('.form-tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.form-tab-content').forEach(x => x.classList.remove('active'));
    document.querySelector(`[data-form-tab="${t}"]`)?.classList.add('active');
    document.querySelector(`[data-form-content="${t}"]`)?.classList.add('active');
    document.getElementById('user-request-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function setupUsersTabs() {
    document.addEventListener('click', function (e) {
        const tab = e.target.closest('[data-users-tab]');
        if (!tab) return;
        const target = tab.getAttribute('data-users-tab');
        document.querySelectorAll('[data-users-tab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('[data-users-content]').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
        tab.classList.add('active');
        const content = document.querySelector(`[data-users-content="${target}"]`);
        if (content) { content.classList.add('active'); content.style.display = 'block'; }
        if (target === 'pendentes' || target === 'recusados') Signups.subscribeSignups();
    });
}

// ============================================================
// EXPORTS GLOBAIS
// ============================================================
function setupGlobalExports() {
    window.goToLogin = goToLoginFn;
    window.goToRequerimento = goToRequerimentoFn;
    window.backToSelect = backToSelectFn;
    window.gotoAdminTab = gotoAdminTab;
    window.gotoUserTab = gotoUserTab;
    window.__gotoAdminTab = gotoAdminTab;
    window.__setRequestsHighlight = (id) => Requests.setRequestsHighlight(id);
    window.closeViewModal = () => Requests.closeViewModal();
    window.closePasswordConfirm = () => Trash.closePasswordConfirm();
    window.closeUserModal = () => Users.closeUserModal();
    window.sstAlert = sstAlert;
    window.sstConfirm = sstConfirm;
    window.sstPrompt = sstPrompt;
    window.showNotification = showNotification;
    window.showAlert = showAlert;
    window.downloadJSON = downloadJSON;
    window.togglePass = togglePassFn;
    window.openNotifModal = () => Notifications.openNotifModal();
    window.closeNotifModal = () => Notifications.closeNotifModal();
    window.openNotifViewModal = () => Notifications.openNotifViewModal();
    window.closeNotifViewModal = () => Notifications.closeNotifViewModal();
    window.openNotifAdminModal = () => Notifications.openNotifAdminModal();
    window.closeNotifAdminModal = () => Notifications.closeNotifAdminModal();
    window.openProfileTab = openProfileTab;
    window.selectArea = selectArea;
    window.switchArea = switchArea;
}

// ============================================================
// SELEÇÃO DE ÁREA
// ============================================================
function showAreaSelectModal() {
    const btn = document.getElementById('area-switch-btn');
    if (btn) btn.classList.add('hidden');
    window.openModal('area-select-modal');
}

function selectArea(mode) {
    if (mode !== 'operacoes' && mode !== 'solicitacoes') return;
    if (!currentUser) return;
    _areaMode = mode;
    sessionStorage.setItem(AREA_KEY + currentUser.uid, mode);
    window.closeModal('area-select-modal');
    const btn = document.getElementById('area-switch-btn');
    if (btn) btn.classList.remove('hidden');
    const bc = document.getElementById('breadcrumb-area');
    if (bc) bc.textContent = mode === 'operacoes' ? 'Operações' : 'Solicitações';
    const lbl = document.getElementById('area-current-label');
    if (lbl) lbl.textContent = mode === 'operacoes' ? 'Operações' : 'Solicitações';
    renderAdminMenu();
}

function switchArea() {
    if (!currentUser) return;
    sessionStorage.removeItem(AREA_KEY + currentUser.uid);
    _areaMode = null;
    showAreaSelectModal();
}

// ============================================================
// LOGIN
// ============================================================
async function handleUserLoggedIn(user) {
    try {
        if (currentUser && currentUser.uid === user.uid) return;
        const snap = await get(ref(db, 'users/' + user.uid));
        if (!snap.exists()) {
            await Auth.logoutUser();
            showNotification('Acesso negado', 'Seu usuário não está cadastrado.', 'danger');
            showLoginPage(); return;
        }
        const data = snap.val();
        if (data.active === false) {
            await Auth.logoutUser();
            showNotification('Conta desativada', 'Contate o administrador.', 'danger');
            showLoginPage(); return;
        }
        const wasLogged = sessionStorage.getItem(SESSION_ACTIVE_KEY) === user.uid;
        if (wasLogged && !isResuming) {
            isResuming = true;
            document.getElementById('conn-loading')?.classList.add('hidden');
            showResumeModal(user, data); return;
        }
        currentUser = buildUser(user, data);
        isAdmin = ADMIN_ROLES.includes(currentUser.role);
        await enterSystem();
    } catch (err) {
        console.error('[SSOT]', err);
        showLoginPage();
    }
}

function handleUserLoggedOut() {
    if (currentUser) return;
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    document.getElementById('conn-loading')?.classList.add('hidden');
    document.getElementById('login-page')?.classList.remove('hidden');
    document.getElementById('app-container')?.classList.add('hidden');
}

function buildUser(fbUser, data) {
    return {
        uid: fbUser.uid, username: fbUser.email, email: data.email || fbUser.email,
        name: data.name || fbUser.displayName || fbUser.email, role: data.role || 'user',
        setor: data.setor || '', ramal: data.ramal || '', cargo: data.cargo || '',
        phone: data.phone || '', provider: data.provider || 'password',
        photo: data.photo || null, isGuest: false
    };
}

function showLoginPage() {
    _enterSystemDone = false;
    document.getElementById('login-page')?.classList.remove('hidden');
    document.getElementById('app-container')?.classList.add('hidden');
    document.getElementById('conn-loading')?.classList.add('hidden');
    backToSelectFn();
}

function showResumeModal(fbUser, data) {
    const modal = document.getElementById('resume-modal'); if (!modal) return;
    modal.classList.add('active');
    document.getElementById('resume-yes-btn').onclick = async () => {
        modal.classList.remove('active');
        currentUser = buildUser(fbUser, data);
        isAdmin = ADMIN_ROLES.includes(currentUser.role);
        await enterSystem();
    };
    document.getElementById('resume-no-btn').onclick = async () => {
        modal.classList.remove('active');
        sessionStorage.removeItem(SESSION_ACTIVE_KEY);
        try { await Auth.logoutUser(); } catch (e) {}
        currentUser = null; isAdmin = false; isResuming = false; showLoginPage();
    };
}

async function enterSystem() {
    _enterSystemDone = true;
    document.getElementById('current-user').textContent = currentUser.name;
    document.getElementById('user-role').textContent = ROLE_LABELS[currentUser.role] || 'Usuário';
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
        if (currentUser.photo) avatarEl.innerHTML = `<img src="${currentUser.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        else avatarEl.textContent = getInitials(currentUser.name);
    }
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('conn-loading').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    sessionStorage.setItem(SESSION_ACTIVE_KEY, currentUser.uid);

    try { Users.setUsersContext(db, currentUser); } catch (e) {}
    try { Requests.setRequestsContext(db, currentUser); } catch (e) {}
    try { Schedule.setScheduleContext(db, currentUser); } catch (e) {}
    try { History.setHistoryContext(db, currentUser, isAdmin); } catch (e) {}
    try { Trash.setTrashContext(db, currentUser, isAdmin); } catch (e) {}
    try { FleetExcel.setFleetExcelContext(db, currentUser); } catch (e) {}
    try { Reports.setReportsContext([], currentUser); } catch (e) {}
    try { Settings.setSettingsContext(currentUser); } catch (e) {}
    try { Signups.setSignupsContext(db, currentUser, isAdmin); } catch (e) {}
    try { Notifications.setNotificationsContext(db, currentUser, isAdmin); } catch (e) {}
    try { Profile.setProfileContext(db, currentUser, isAdmin); } catch (e) {}

    if (isAdmin) {
        document.getElementById('user-area').classList.add('hidden');
        document.getElementById('admin-area').classList.remove('hidden');
        const savedArea = sessionStorage.getItem(AREA_KEY + currentUser.uid);
        if (savedArea === 'operacoes' || savedArea === 'solicitacoes') {
            _areaMode = savedArea;
            const bc = document.getElementById('breadcrumb-area');
            if (bc) bc.textContent = savedArea === 'operacoes' ? 'Operações' : 'Solicitações';
            const btn = document.getElementById('area-switch-btn');
            if (btn) btn.classList.remove('hidden');
            renderAdminMenu();
        } else {
            _areaMode = null;
            showAreaSelectModal();
        }
    } else {
        document.getElementById('admin-area').classList.add('hidden');
        document.getElementById('user-area').classList.remove('hidden');
        document.getElementById('area-switch-btn')?.classList.add('hidden');
        renderUserMenu();
        prefillUserForm();
    }

    activateSubscribers();
    try { Session.startSessionWatch(() => doLogout(true)); } catch (e) { console.warn('[Session]', e); }

    if (_pendingDeepLink) {
        const id = _pendingDeepLink; _pendingDeepLink = null;
        const url = new URL(window.location.href);
        url.searchParams.delete('request');
        window.history.replaceState({}, '', url.toString());
        setTimeout(() => {
            try {
                const reqs = Requests.getRequests();
                const req = reqs.find(r => r.id === id);
                if (req) Requests.viewRequest(id, isAdmin);
            } catch (e) {}
        }, 800);
    }

    try { await History.addHistory('Login', '-', `Usuário ${currentUser.name} acessou`); } catch (e) {}
    showNotification('Bem-vindo(a)', `Olá, ${currentUser.name}!`, 'success');
}

function activateSubscribers() {
    if (subscribersActive) return;
    subscribersActive = true;
    try { Users.subscribeUsers(); } catch (e) { console.warn('[Users.sub]', e); }
    try {
        Requests.subscribeRequests((requests) => {
            try { Dashboard.setDashboardData(requests); } catch (e) {}
            try { Reports.setReportsContext(requests, currentUser); } catch (e) {}
        });
    } catch (e) { console.warn('[Requests.sub]', e); }
    try { Schedule.subscribeSlots(); } catch (e) { console.warn('[Schedule.sub]', e); }
    try { Notifications.subscribeNotifications(); } catch (e) { console.warn('[Notif.sub]', e); }
    if (isAdmin) {
        try { History.subscribeHistory(); } catch (e) {}
        try { Trash.subscribeTrash(); } catch (e) {}
        try { Signups.subscribeSignups(); } catch (e) {}
    }
}
function deactivateSubscribers() {
    if (!subscribersActive) return;
    subscribersActive = false;
    try { Users.unsubscribeUsers(); } catch (e) {}
    try { Requests.unsubscribeRequests(); } catch (e) {}
    try { Schedule.unsubscribeSlots(); } catch (e) {}
    try { History.unsubscribeHistory(); } catch (e) {}
    try { Trash.unsubscribeTrash(); } catch (e) {}
    try { Signups.unsubscribeSignups(); } catch (e) {}
    try { Notifications.unsubscribeNotifications(); } catch (e) {}
    try { Dashboard.destroyDashboardCharts(); } catch (e) {}
}

// ============================================================
// MENUS
// ============================================================
function renderUserMenu() {
    const menu = document.getElementById('top-menu-list');
    if (!menu) return;
    menu.innerHTML = `
        <li><a href="#" class="active" data-tab="user-solicitacoes"><svg class="si si-fw"><use href="#i-car"/></svg> Solicitar Transporte</a></li>
        <li><a href="#" data-tab="user-perfil"><svg class="si si-fw"><use href="#i-user"/></svg> Meu Perfil</a></li>
    `;
    menu.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            gotoUserTab(a.getAttribute('data-tab'));
            closeMobileSidebar();
        });
    });
    gotoUserTab('user-solicitacoes');
}

function gotoUserTab(tabId) {
    if (!tabId) return;
    document.querySelectorAll('#user-area .tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(tabId + '-tab');
    if (target) target.classList.add('active');
    document.querySelectorAll('#top-menu-list a').forEach(a => {
        a.classList.remove('active');
        if (a.getAttribute('data-tab') === tabId) a.classList.add('active');
    });
    const t = document.getElementById('page-title');
    if (t) t.textContent = TAB_TITLES[tabId] || 'SSOT';
    const sub = TAB_SUBTITLES[tabId];
    const subtitle = document.getElementById('page-subtitle');
    if (subtitle) {
        if (sub) { subtitle.textContent = sub; subtitle.classList.remove('hidden'); }
        else subtitle.classList.add('hidden');
    }
    if (tabId === 'user-perfil') {
        try { Profile.refreshProfileState(); Profile.populateProfileForm(); } catch (e) {}
    }
}

function renderOperacoesMenu() {
    const menu = document.getElementById('top-menu-list');
    if (!menu) return;
    menu.innerHTML = `
        <li><a href="#" data-fleet-tab="viagens"><svg class="si si-fw"><use href="#i-route"/></svg> Viagens</a></li>
        <li><a href="#" data-fleet-tab="veiculos"><svg class="si si-fw"><use href="#i-car"/></svg> Veículos</a></li>
        <li><a href="#" data-fleet-tab="abastecimentos"><svg class="si si-fw"><use href="#i-truck"/></svg> Abastecimentos</a></li>
        <li><a href="#" data-fleet-tab="servicos"><svg class="si si-fw"><use href="#i-cog"/></svg> Serviços</a></li>
        <li><a href="#" data-fleet-tab="despesas"><svg class="si si-fw"><use href="#i-file-text"/></svg> Despesas</a></li>
        <li><a href="#" data-fleet-tab="leituras"><svg class="si si-fw"><use href="#i-clock"/></svg> Leituras</a></li>
        <li><a href="#" data-fleet-tab="checklist"><svg class="si si-fw"><use href="#i-check-circle"/></svg> Checklist</a></li>
        <li><a href="#" data-fleet-tab="importar"><svg class="si si-fw"><use href="#i-upload"/></svg> Importar/Exportar</a></li>
        <li><a href="#" data-tab="admin-perfil"><svg class="si si-fw"><use href="#i-user"/></svg> Perfil</a></li>
        <li><a href="#" data-tab="admin-servicos"><svg class="si si-fw"><use href="#i-cog"/></svg> Serviços</a></li>
    `;
    menu.querySelectorAll('[data-fleet-tab]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const tabKey = a.getAttribute('data-fleet-tab');
            document.querySelectorAll('#admin-area .tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById('admin-frota-tab')?.classList.add('active');
            try { FleetExcel.initFleetExcel(); } catch (err) { console.error(err); }
            _fleetCurrentTab = tabKey;
            if (typeof window.fleetExcelSwitchTab === 'function') window.fleetExcelSwitchTab(tabKey);
            menu.querySelectorAll('a').forEach(l => l.classList.remove('active'));
            a.classList.add('active');
            const titles = {
                viagens: 'Viagens', veiculos: 'Veículos', abastecimentos: 'Abastecimentos',
                servicos: 'Serviços', despesas: 'Despesas', leituras: 'Leituras',
                checklist: 'Checklist', importar: 'Importar/Exportar'
            };
            const title = document.getElementById('page-title');
            if (title) title.textContent = titles[tabKey] || 'Frota';
        });
    });
    menu.querySelectorAll('[data-tab]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            gotoAdminTab(a.getAttribute('data-tab'));
        });
    });
    const activeLink = menu.querySelector(`[data-fleet-tab="${_fleetCurrentTab}"]`);
    if (activeLink) activeLink.classList.add('active');
    try { FleetExcel.initFleetExcel(); } catch (err) { console.error(err); }
    setTimeout(() => {
        if (typeof window.fleetExcelSwitchTab === 'function') window.fleetExcelSwitchTab(_fleetCurrentTab);
    }, 100);
}

function renderAdminMenu() {
    const menu = document.getElementById('top-menu-list');
    if (!menu) return;
    if (_areaMode === 'operacoes') {
        renderOperacoesMenu();
        document.querySelectorAll('#admin-area .tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('admin-frota-tab')?.classList.add('active');
        const title = document.getElementById('page-title');
        if (title) title.textContent = 'Frota';
    } else {
        menu.innerHTML = `
            <li><a href="#" data-tab="admin-dashboard"><svg class="si si-fw"><use href="#i-chart-line"/></svg> Dashboard</a></li>
            <li><a href="#" data-tab="admin-solicitacoes"><svg class="si si-fw"><use href="#i-clipboard"/></svg> Solicitações</a></li>
            <li><a href="#" data-tab="admin-usuarios"><svg class="si si-fw"><use href="#i-users-cog"/></svg> Usuários</a></li>
            <li><a href="#" data-tab="admin-agenda"><svg class="si si-fw"><use href="#i-calendar-check"/></svg> Agenda</a></li>
            <li><a href="#" data-tab="admin-relatorios"><svg class="si si-fw"><use href="#i-file-text"/></svg> Relatórios</a></li>
            <li><a href="#" data-tab="admin-historico"><svg class="si si-fw"><use href="#i-history"/></svg> Histórico</a></li>
            <li><a href="#" data-tab="admin-lixeira"><svg class="si si-fw"><use href="#i-trash"/></svg> Lixeira</a></li>
            <li><a href="#" data-tab="admin-perfil"><svg class="si si-fw"><use href="#i-user"/></svg> Perfil</a></li>
            <li><a href="#" data-tab="admin-servicos"><svg class="si si-fw"><use href="#i-cog"/></svg> Serviços</a></li>
        `;
        menu.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', e => {
                e.preventDefault();
                gotoAdminTab(a.getAttribute('data-tab'));
                closeMobileSidebar();
            });
        });
        gotoAdminTab('admin-dashboard');
    }
}

export function gotoAdminTab(tabId) {
    if (!tabId) return;
    const solicitacoesOnly = ['admin-solicitacoes', 'admin-usuarios', 'admin-agenda', 'admin-historico', 'admin-lixeira', 'admin-dashboard', 'admin-relatorios'];
    if (_areaMode === 'operacoes' && solicitacoesOnly.includes(tabId)) tabId = 'admin-frota';
    if (_areaMode === 'solicitacoes' && tabId === 'admin-frota') tabId = 'admin-dashboard';

    document.querySelectorAll('#admin-area .tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId + '-tab')?.classList.add('active');
    document.querySelectorAll('#top-menu-list a').forEach(a => {
        a.classList.remove('active');
        if (a.getAttribute('data-tab') === tabId) a.classList.add('active');
    });
    const title = document.getElementById('page-title');
    const subtitle = document.getElementById('page-subtitle');
    if (title) title.textContent = TAB_TITLES[tabId] || 'Painel';
    if (subtitle) {
        const sub = TAB_SUBTITLES[tabId];
        if (sub) { subtitle.textContent = sub; subtitle.classList.remove('hidden'); }
        else subtitle.classList.add('hidden');
    }
    if (currentUser) sessionStorage.setItem(SESSION_STORAGE_KEY + '_' + currentUser.uid, tabId);

    switch (tabId) {
        case 'admin-dashboard':
            setTimeout(() => {
                try { Dashboard.updateDashboardCharts(); } catch (e) {}
                try { History.renderRecentActivityWidget(); } catch (e) {}
                try { Requests.renderTodayRequestsWidget(); } catch (e) {}
                try { Schedule.renderUpcomingSlotsWidget(); } catch (e) {}
            }, 100);
            break;
        case 'admin-agenda':
            try { Schedule.renderSlotsAdmin(); } catch (e) {}
            updateArchiveBadge();
            break;
        case 'admin-historico': try { History.refreshHistory(); } catch (e) {} break;
        case 'admin-lixeira': try { Trash.updateTrashTable(); } catch (e) {} break;
        case 'admin-usuarios':
            try { Users.updateUsersTable(); } catch (e) {}
            try { Signups.subscribeSignups(); } catch (e) {}
            break;
        case 'admin-perfil':
            try { Profile.refreshProfileState(); Profile.populateProfileForm(); } catch (e) {}
            break;
        case 'admin-servicos': updateNetworkStatus(); break;
        case 'admin-frota':
            try { FleetExcel.initFleetExcel(); } catch (e) { console.error('[SSOT] Frota:', e); }
            break;
    }
}

async function updateArchiveBadge() {
    const btn = document.getElementById('archive-past-slots');
    if (!btn || !ScheduleArchive) return;
    try {
        const count = await ScheduleArchive.countPastSlots(db);
        let badge = btn.querySelector('.archive-badge');
        if (count > 0) {
            if (!badge) { badge = document.createElement('span'); badge.className = 'archive-badge'; btn.appendChild(badge); }
            badge.textContent = count;
            btn.classList.add('has-archive');
        } else {
            if (badge) badge.remove();
            btn.classList.remove('has-archive');
        }
    } catch (e) {}
}

function openProfileTab() {
    if (!isAdmin) gotoUserTab('user-perfil');
    else gotoAdminTab('admin-perfil');
}

function prefillUserForm() {
    if (!currentUser) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('u-solicitante', currentUser.name);
    set('u-email', currentUser.email);
    set('u-ramal', currentUser.ramal);
    set('u-setor', currentUser.setor);
    set('u-cargo', currentUser.cargo);
}

async function doLogout(silent = false) {
    if (currentUser && !currentUser.isGuest) {
        try { await History.addHistory('Logout', '-', `Usuário ${currentUser.name}`); } catch (e) {}
    }
    if (currentUser) sessionStorage.removeItem(AREA_KEY + currentUser.uid);
    _areaMode = null;
    try { Session.stopSessionWatch(); } catch (e) {}
    deactivateSubscribers();
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    currentUser = null; isAdmin = false; isResuming = false;
    _loginInProgress = false; _enterSystemDone = false;
    try { await Auth.logoutUser(); } catch (e) {}
    document.getElementById('app-container')?.classList.add('hidden');
    document.getElementById('conn-loading')?.classList.add('hidden');
    showLoginPage();
    if (silent) showNotification('Sessão encerrada', 'Você ficou inativo.', 'warning', 6000);
}

// ============================================================
// TELAS DE LOGIN
// ============================================================
function goToLoginFn(mode) {
    window._loginMode = mode;
    document.getElementById('screen-select')?.classList.add('hidden');
    document.getElementById('screen-login')?.classList.remove('hidden');
    document.getElementById('screen-requerimento')?.classList.add('hidden');
    const title = document.getElementById('login-title');
    const subtitle = document.getElementById('login-subtitle');
    if (mode === 'admin') {
        if (title) title.textContent = 'Entrar como Setor';
        if (subtitle) subtitle.textContent = 'Acesso administrativo';
    } else {
        if (title) title.textContent = 'Entrar como Usuário';
        if (subtitle) subtitle.textContent = 'Acesse suas solicitações';
    }
    document.getElementById('login-error')?.classList.add('hidden');
    document.getElementById('login-info')?.classList.add('hidden');
    const u = document.getElementById('username');
    const p = document.getElementById('password');
    if (u) u.value = '';
    if (p) p.value = '';
    u?.focus();
}
function goToRequerimentoFn() {
    document.getElementById('screen-select')?.classList.add('hidden');
    document.getElementById('screen-login')?.classList.add('hidden');
    document.getElementById('screen-requerimento')?.classList.remove('hidden');
    document.getElementById('requerimento-error')?.classList.add('hidden');
    document.getElementById('requerimento-success')?.classList.add('hidden');
    document.getElementById('requerimento-form')?.reset();
    document.getElementById('r-nome')?.focus();
}
function backToSelectFn() {
    document.getElementById('screen-select')?.classList.remove('hidden');
    document.getElementById('screen-login')?.classList.add('hidden');
    document.getElementById('screen-requerimento')?.classList.add('hidden');
    document.getElementById('login-error')?.classList.add('hidden');
    document.getElementById('login-info')?.classList.add('hidden');
}
function togglePassFn(id, el) {
    const p = document.getElementById(id); if (!p) return;
    const use = el.querySelector('use');
    if (p.type === 'password') { p.type = 'text'; if (use) use.setAttribute('href', '#i-eye-off'); }
    else { p.type = 'password'; if (use) use.setAttribute('href', '#i-eye'); }
}

// ============================================================
// EVENT LISTENERS (individualmente protegidos)
// ============================================================
function setupEventListeners() {
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };

    on('login-form', 'submit', handleLoginSubmit);
    on('google-login-btn', 'click', handleGoogleLogin);
    on('requerimento-form', 'submit', handleSignupSubmit);
    on('user-request-form', 'submit', handleRequestSubmit);

    on('admin-new-request-btn', 'click', () => {
        document.getElementById('admin-request-form').reset();
        window.openModal('admin-new-request-modal');
    });
    on('admin-request-form', 'submit', handleAdminRequestSubmit);
    on('logout-btn', 'click', async () => {
        const ok = await sstConfirm('Deseja realmente sair?', 'Sair', 'warning');
        if (ok) doLogout(false);
    });
    on('toggle-password', 'click', function () { togglePassFn('password', this); });
    on('password', 'keyup', function (e) {
        const warn = document.getElementById('capslock-warning');
        if (warn) warn.style.display = e.getModifierState('CapsLock') ? 'block' : 'none';
    });
    on('user-info-trigger', 'click', () => openProfileTab());

    window.openForgotPassword = async function (e) {
        e.preventDefault();
        const email = await sstPrompt('Digite seu e-mail:', '', 'Redefinir Senha');
        if (!email) return;
        try { await Auth.sendReset(email); showNotification('E-mail enviado', 'Verifique sua caixa.', 'success'); }
        catch (err) { showNotification('Erro', 'Não foi possível enviar.', 'danger'); }
    };

    on('notif-bell-btn', 'click', () => {
        if (isAdmin) Notifications.openNotifAdminModal();
        else Notifications.openNotifViewModal();
    });
    on('send-notif-btn', 'click', handleSendNotification);

    on('new-user-btn', 'click', () => Users.openUserModal());
    on('save-user-btn', 'click', () => Users.saveUser());
    on('refresh-users', 'click', () => {
        Users.updateUsersTable();
        Signups.subscribeSignups();
        showNotification('Atualizado', 'Lista atualizada.', 'success', 2000);
    });
    try { Users.setupUserFilters(); } catch (e) { console.error('[UserFilters]', e); }

    on('user-photo-input', 'change', function (e) { const f = e.target.files?.[0]; if (f) Users.handlePhotoSelect(f); });
    on('user-photo-remove', 'click', () => Users.handlePhotoRemove());

    on('ap-photo-input', 'change', function (e) { const f = e.target.files?.[0]; if (f) Profile.handleProfilePhotoSelect(f); });
    on('ap-photo-remove', 'click', () => Profile.handleProfilePhotoRemove());
    on('ap-save-btn', 'click', () => Profile.saveProfile());

    on('up-photo-input', 'change', function (e) { const f = e.target.files?.[0]; if (f) Profile.handleProfilePhotoSelect(f); });
    on('up-photo-remove', 'click', () => Profile.handleProfilePhotoRemove());
    on('up-save-btn', 'click', () => Profile.saveProfile());

    try { Requests.setupRequestFilters(); } catch (e) { console.error('[ReqFilters]', e); }
    try { History.setupHistoryFilters(); } catch (e) { console.error('[HistFilters]', e); }

    on('user-refresh', 'click', () => { Requests.updateUserTable(); showNotification('Atualizado', 'Lista atualizada.', 'success', 2000); });
    on('admin-refresh', 'click', () => { Requests.updateAdminTable(); showNotification('Atualizado', 'Lista atualizada.', 'success', 2000); });
    on('historico-refresh', 'click', () => { History.refreshHistory(); showNotification('Atualizado', 'Histórico atualizado.', 'success', 2000); });
    on('historico-clear', 'click', () => History.clearAllHistory());

    on('add-slot-block', 'click', async () => {
        await Schedule.addSlotBlock(
            document.getElementById('slot-date')?.value,
            document.getElementById('slot-start')?.value,
            document.getElementById('slot-end')?.value
        );
    });
    on('add-single-slot', 'click', async () => {
        await Schedule.addSingleSlot(
            document.getElementById('single-slot-date')?.value,
            document.getElementById('single-slot-time')?.value
        );
    });
    on('refresh-slots', 'click', () => {
        Schedule.renderSlotsAdmin();
        updateArchiveBadge();
        showNotification('Atualizado', 'Agenda atualizada.', 'success', 2000);
    });

    on('archive-past-slots', 'click', async () => {
        if (!ScheduleArchive) {
            alert('Módulo de arquivamento indisponível.');
            return;
        }
        await ScheduleArchive.archivePastSlots(db, () => {
            try { Schedule.renderSlotsAdmin(); } catch (e) {}
            updateArchiveBadge();
        });
    });

    on('lixeira-clear', 'click', () => Trash.emptyTrash());
    on('generate-report', 'click', () => Reports.generateReport());
    on('export-excel', 'click', () => Reports.exportReportExcel());
    on('export-pdf', 'click', () => Reports.exportReportPDF(false));
    on('preview-pdf', 'click', () => Reports.exportReportPDF(true));
    on('admin-export-pdf', 'click', () => Reports.exportReportPDF(false));
    on('admin-export-excel', 'click', () => Reports.exportReportExcel());

    try { Dashboard.setupChartDownloads(); } catch (e) {}
    try { Dashboard.setupChartFilters(); } catch (e) {}
    try { Settings.setupBackupButtons(handleBackup, handleImportBackup); } catch (e) {}

    on('close-view-modal', 'click', () => Requests.closeViewModal());
    on('close-pdf-modal', 'click', closePdfModal);
    on('close-pdf-modal-btn', 'click', closePdfModal);
    on('download-pdf', 'click', () => { Reports.exportReportPDF(false); setTimeout(closePdfModal, 1500); });

    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', function (e) {
            if (e.target === this) {
                if (this.id === 'session-modal' || this.id === 'resume-modal' || this.id === 'area-select-modal') return;
                this.classList.remove('active');
            }
        });
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => {
                if (m.id !== 'session-modal' && m.id !== 'resume-modal' && m.id !== 'area-select-modal') {
                    m.classList.remove('active');
                }
            });
        }
    });
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
}

// ============================================================
// SUBMIT HANDLERS
// ============================================================
async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('username')?.value.trim() || '';
    const password = document.getElementById('password')?.value || '';
    const btn = document.getElementById('login-submit-btn');
    const errBox = document.getElementById('login-error');
    _loginInProgress = true;
    errBox?.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    try {
        const user = await Auth.loginUser(email, password);
        const snap = await get(ref(db, 'users/' + user.uid));
        if (!snap.exists()) {
            const sc = await Signups.checkSignupByEmail(email);
            await Auth.logoutUser();
            if (sc.exists && sc.status === 'pendente') throw new Error('Sua solicitação está PENDENTE.');
            else if (sc.exists && sc.status === 'recusado') throw new Error('Sua solicitação foi RECUSADA.');
            else throw new Error('Usuário não cadastrado.');
        }
        const data = snap.val();
        if (data.active === false) { await Auth.logoutUser(); throw new Error('Conta desativada.'); }
        const mode = window._loginMode || 'user';
        const userRole = data.role || 'user';
        const isAdminRole = ADMIN_ROLES.includes(userRole);
        if (mode === 'admin' && !isAdminRole) { await Auth.logoutUser(); throw new Error('Sem acesso administrativo.'); }
        if (mode === 'user' && isAdminRole) { await Auth.logoutUser(); throw new Error('Use "Sou Setor".'); }
        currentUser = buildUser(user, data);
        isAdmin = isAdminRole;
        _loginInProgress = false;
        await enterSystem();
    } catch (err) {
        _loginInProgress = false;
        try { await Auth.logoutUser(); } catch (e) {}
        const msg = err.code ? Auth.getAuthErrorMessage(err) : err.message;
        if (errBox) { errBox.textContent = msg; errBox.classList.remove('hidden'); }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
}

async function handleGoogleLogin() {
    const btn = document.getElementById('google-login-btn');
    const errBox = document.getElementById('login-error');
    const infoBox = document.getElementById('login-info');
    _loginInProgress = true;
    errBox?.classList.add('hidden'); infoBox?.classList.add('hidden');
    if (btn) btn.disabled = true;
    try {
        const result = await Auth.loginWithGoogle();
        const googleUser = result.user;
        const email = (googleUser.email || '').toLowerCase();
        const snap = await get(ref(db, 'users/' + googleUser.uid));
        if (snap.exists()) {
            const data = snap.val();
            if (data.active === false) { await Auth.logoutUser(); throw new Error('Conta desativada.'); }
            currentUser = buildUser(googleUser, data);
            isAdmin = ADMIN_ROLES.includes(currentUser.role);
            _loginInProgress = false;
            await enterSystem();
            return;
        }
        const sc = await Signups.checkSignupByEmail(email);
        if (sc.exists && sc.status === 'pendente') {
            await Auth.logoutUser(); _loginInProgress = false;
            if (infoBox) { infoBox.innerHTML = '<strong>Pendente</strong><p>Aguarde aprovação.</p>'; infoBox.classList.remove('hidden'); }
            return;
        }
        await Auth.logoutUser();
        _loginInProgress = false;
        goToRequerimentoFn();
        document.getElementById('r-nome').value = googleUser.displayName || '';
        document.getElementById('r-email').value = email;
    } catch (err) {
        _loginInProgress = false;
        try { await Auth.logoutUser(); } catch (e) {}
        const msg = err.code ? Auth.getAuthErrorMessage(err) : (err.message || 'Erro.');
        if (errBox) { errBox.textContent = msg; errBox.classList.remove('hidden'); }
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function handleSignupSubmit(e) {
    e.preventDefault();
    const nome = document.getElementById('r-nome')?.value.trim() || '';
    const email = document.getElementById('r-email')?.value.trim().toLowerCase() || '';
    const ramal = document.getElementById('r-ramal')?.value.trim() || '';
    const setor = document.getElementById('r-setor')?.value.trim() || '';
    const cargo = document.getElementById('r-cargo')?.value.trim() || '';
    const senha = document.getElementById('r-senha')?.value || '';
    const senha2 = document.getElementById('r-senha2')?.value || '';
    const justificativa = document.getElementById('r-justificativa')?.value.trim() || '';
    const errBox = document.getElementById('requerimento-error');
    const successBox = document.getElementById('requerimento-success');
    errBox?.classList.add('hidden'); successBox?.classList.add('hidden');
    if (!nome || !email || !ramal || !setor) { errBox.textContent = 'Preencha os campos.'; errBox.classList.remove('hidden'); return; }
    if (!senha || senha.length < 6) { errBox.textContent = 'Senha mínima 6 caracteres.'; errBox.classList.remove('hidden'); return; }
    if (senha !== senha2) { errBox.textContent = 'Senhas não coincidem.'; errBox.classList.remove('hidden'); return; }
    const btn = document.getElementById('requerimento-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
        await Signups.createSignup({ nome, email, ramal, setor, cargo, justificativa, senha, origin: 'form' });
        successBox.innerHTML = '<strong>Solicitação enviada!</strong><p>Aguarde aprovação.</p>';
        successBox.classList.remove('hidden');
        document.getElementById('requerimento-form')?.reset();
        setTimeout(() => backToSelectFn(), 6000);
    } catch (err) {
        errBox.textContent = err.message || 'Erro.';
        errBox.classList.remove('hidden');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar Solicitação'; }
    }
}

async function handleRequestSubmit(e) {
    e.preventDefault();
    const formData = {
        solicitante: document.getElementById('u-solicitante')?.value.trim(),
        email: document.getElementById('u-email')?.value.trim(),
        ramal: document.getElementById('u-ramal')?.value.trim(),
        setor: document.getElementById('u-setor')?.value.trim(),
        cargo: document.getElementById('u-cargo')?.value.trim() || '',
        destino: document.getElementById('u-destino')?.value.trim(),
        origem: document.getElementById('u-origem')?.value.trim() || '',
        finalidade: document.getElementById('u-finalidade')?.value.trim(),
        prioridade: document.getElementById('u-prioridade')?.value || 'normal',
        saida: document.getElementById('u-saida')?.value,
        retorno: document.getElementById('u-retorno')?.value || '',
        passageiros: document.getElementById('u-passageiros')?.value || '1',
        necessidades: document.getElementById('u-necessidades')?.value.trim() || '',
        nomesPassageiros: document.getElementById('u-nomes-passageiros')?.value.trim() || '',
        observacoes: document.getElementById('u-observacoes')?.value.trim() || ''
    };
    const required = ['solicitante', 'email', 'ramal', 'setor', 'destino', 'finalidade', 'saida'];
    for (const field of required) {
        if (!formData[field]) {
            showAlert('Preencha todos os campos obrigatórios.', 'danger');
            const fieldMap = {
                solicitante: 'solicitante', email: 'solicitante', ramal: 'solicitante',
                setor: 'solicitante', destino: 'viagem', finalidade: 'viagem', saida: 'viagem'
            };
            window.goToFormTab(fieldMap[field] || 'solicitante');
            return;
        }
    }
    try {
        const created = await Requests.createRequest(formData);
        if (formData.saida && formData.saida.includes('T')) {
            const [date, time] = formData.saida.split('T');
            if (date && time) {
                try { await Schedule.reserveSlot(date, time.substring(0, 5), created.numero); } catch (e) {}
            }
        }
        ['u-destino','u-origem','u-finalidade','u-saida','u-retorno','u-necessidades','u-nomes-passageiros','u-observacoes'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        const p = document.getElementById('u-passageiros'); if (p) p.value = 1;
        const pr = document.getElementById('u-prioridade'); if (pr) pr.value = 'normal';
        window.goToFormTab('solicitante');
        showNotification('Enviada', `Solicitação ${created.numero} registrada!`, 'success');
    } catch (err) {
        showAlert('Erro: ' + (err.message || ''), 'danger');
    }
}

async function handleAdminRequestSubmit(e) {
    e.preventDefault();
    const formData = {
        solicitante: document.getElementById('ar-solicitante')?.value.trim(),
        email: document.getElementById('ar-email')?.value.trim(),
        ramal: document.getElementById('ar-ramal')?.value.trim(),
        setor: document.getElementById('ar-setor')?.value.trim(),
        cargo: document.getElementById('ar-cargo')?.value.trim() || '',
        destino: document.getElementById('ar-destino')?.value.trim(),
        origem: document.getElementById('ar-origem')?.value.trim() || '',
        finalidade: document.getElementById('ar-finalidade')?.value.trim(),
        prioridade: document.getElementById('ar-prioridade')?.value || 'normal',
        saida: document.getElementById('ar-saida')?.value,
        retorno: document.getElementById('ar-retorno')?.value || '',
        passageiros: document.getElementById('ar-passageiros')?.value || '1',
        necessidades: document.getElementById('ar-necessidades')?.value.trim() || '',
        nomesPassageiros: document.getElementById('ar-nomes-passageiros')?.value.trim() || '',
        observacoes: document.getElementById('ar-observacoes')?.value.trim() || ''
    };
    const required = ['solicitante', 'email', 'ramal', 'setor', 'destino', 'finalidade', 'saida'];
    for (const field of required) { if (!formData[field]) { showAlert('Preencha os campos.', 'danger'); return; } }
    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
        const created = await Requests.createAdminRequest(formData);
        if (formData.saida && formData.saida.includes('T')) {
            const [date, time] = formData.saida.split('T');
            if (date && time) { try { await Schedule.reserveSlot(date, time.substring(0, 5), created.numero); } catch (e) {} }
        }
        window.closeModal('admin-new-request-modal');
        showNotification('Enviada', `Solicitação ${created.numero}!`, 'success');
    } catch (err) {
        showAlert('Erro: ' + (err.message || ''), 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = original; }
    }
}

async function handleSendNotification() {
    const target = document.getElementById('notif-target')?.value || 'all';
    const type = document.getElementById('notif-type')?.value || 'info';
    const title = document.getElementById('notif-title')?.value || '';
    const message = document.getElementById('notif-message')?.value || '';
    const btn = document.getElementById('send-notif-btn');
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
    try {
        await Notifications.sendNotification({ target, type, title, message });
        Notifications.closeNotifModal();
        showNotification('Enviada', 'Notificação enviada.', 'success');
    } catch (err) {
        showAlert(err.message || 'Erro.', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
}

function handleBackup() {
    const backup = {
        meta: { app: 'SSOT', version: APP_VERSION, timestamp: new Date().toISOString(), createdBy: currentUser?.name || 'Sistema' },
        data: { requests: Requests.getRequests(), users: Users.getUsers(), trash: Trash.getTrash(), signups: Signups.getSignups(), notifications: Notifications.getNotifications() }
    };
    downloadJSON(backup, `backup_ssot_${new Date().toISOString().slice(0, 10)}`);
    History.addHistory('Backup Realizado', '-', `Por: ${currentUser?.name}`);
    showNotification('Backup', 'Arquivo gerado!', 'success');
}
async function handleImportBackup(file) {
    if (!file) return;
    const ok = await sstConfirm('Importar? Os dados serão MANTIDOS.', 'Importar Backup');
    if (!ok) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const payload = data.data || data;
        let imported = 0;
        const importCollection = async (col, items, idField) => {
            if (!Array.isArray(items)) return;
            for (const item of items) {
                const id = item[idField] || item.id;
                if (!id) continue;
                const copy = { ...item };
                delete copy[idField]; delete copy.id;
                await set(ref(db, col + '/' + id), copy);
                imported++;
            }
        };
        await importCollection('requests', payload.requests, 'id');
        await importCollection('users', payload.users, 'uid');
        await History.addHistory('Backup Importado', '-', `${imported} registros`);
        showNotification('Importado', `${imported} registros.`, 'success');
    } catch (err) {
        showAlert('Erro ao importar.', 'danger');
    }
}

function closePdfModal() {
    document.getElementById('pdf-modal')?.classList.remove('active');
}
function updateNetworkStatus() {
    const el = document.getElementById('servicos-network-status');
    if (!el) return;
    el.textContent = navigator.onLine ? 'Online' : 'Offline';
    el.style.color = navigator.onLine ? '#27ae60' : '#c0392b';
}

// ============================================================
// BOOTSTRAP
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
