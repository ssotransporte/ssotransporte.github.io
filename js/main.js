// ============================================================
// SSOT - MAIN (v15.0 - PDF profissional + arquivar agenda)
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
import * as ScheduleArchive from './schedule-archive.js';

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
// ROTEAMENTO POR HASH
// ============================================================
function getAreaFromHash() {
    const h = window.location.hash;
    if (h === '#/operacoes') return 'operacoes';
    if (h === '#/solicitacoes') return 'solicitacoes';
    return null;
}
function setAreaHash(area) { window.location.hash = `#/${area}`; }
function clearAreaHash() {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
}
window.addEventListener('hashchange', () => {
    const area = getAreaFromHash();
    if (area && currentUser && isAdmin) { _areaMode = area; renderAdminMenu(); }
});

// ============================================================
// INIT
// ============================================================
function init() {
    console.log(`[SSOT] Inicializando v${APP_VERSION}...`);
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    auth = getAuth(app);
    window._db = db;

    Signups.setSignupsContext(db, null, false);
    window._addHistoryInternal = (action, num, details) => History.addHistory(action, num, details).catch(() => {});
    window._getUsersForNotif = () => Users.getUsers();

    const params = new URLSearchParams(window.location.search);
    const reqId = params.get('request');
    if (reqId) _pendingDeepLink = reqId;

    Settings.setupServices();
    updateNetworkStatus();
    setupEventListeners();
    setupGlobalExports();
    setupFormTabs();
    setupUsersTabs();
    setupMobileSidebar();

    const safetyTimeout = setTimeout(() => {
        const loading = document.getElementById('conn-loading');
        if (loading && !loading.classList.contains('hidden')) {
            loading.classList.add('hidden');
            document.getElementById('login-page').classList.remove('hidden');
        }
    }, FIREBASE_LOAD_TIMEOUT);

    onAuthStateChanged(auth, async (user) => {
        clearTimeout(safetyTimeout);
        if (_loginInProgress) return;
        if (_enterSystemDone && user && currentUser && currentUser.uid === user.uid) return;
        if (user) await handleUserLoggedIn(user);
        else handleUserLoggedOut();
    });
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

window.openModal = (id) => document.getElementById(id)?.classList.add('active');
window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

// ============================================================
// FORM TABS + USERS TABS
// ============================================================
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
    setAreaHash(mode);
    const btn = document.getElementById('area-switch-btn');
    if (btn) btn.classList.remove('hidden');
    const bc = document.getElementById('breadcrumb-area');
    if (bc) bc.textContent = mode === 'operacoes' ? 'Operações' : 'Solicitações';
    renderAdminMenu();
}

function switchArea() {
    if (!currentUser) return;
    sessionStorage.removeItem(AREA_KEY + currentUser.uid);
    _areaMode = null;
    clearAreaHash();
    showAreaSelectModal();
}

// ============================================================
// LOGIN / LOGOUT
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
    } catch (err) { console.error('[SSOT]', err); showLoginPage(); }
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

// ============================================================
// ENTRAR NO SISTEMA
// ============================================================
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

    Users.setUsersContext(db, currentUser);
    Requests.setRequestsContext(db, currentUser);
    Schedule.setScheduleContext(db, currentUser);
    History.setHistoryContext(db, currentUser, isAdmin);
    Trash.setTrashContext(db, currentUser, isAdmin);
    FleetExcel.setFleetExcelContext(db, currentUser);
    Reports.setReportsContext([], currentUser);
    Settings.setSettingsContext(currentUser);
    Signups.setSignupsContext(db, currentUser, isAdmin);
    Notifications.setNotificationsContext(db, currentUser, isAdmin);
    Profile.setProfileContext(db, currentUser, isAdmin);

    if (isAdmin) {
        document.getElementById('user-area').classList.add('hidden');
        document.getElementById('admin-area').classList.remove('hidden');
        const hashArea = getAreaFromHash();
        if (hashArea) {
            _areaMode = hashArea;
            const bc = document.getElementById('breadcrumb-area');
            if (bc) bc.textContent = hashArea === 'operacoes' ? 'Operações' : 'Solicitações';
            const btn = document.getElementById('area-switch-btn');
            if (btn) btn.classList.remove('hidden');
            renderAdminMenu();
        } else {
            const savedArea = sessionStorage.getItem(AREA_KEY + currentUser.uid);
            if (savedArea === 'operacoes' || savedArea === 'solicitacoes') {
                _areaMode = savedArea;
                setAreaHash(savedArea);
                const bc = document.getElementById('breadcrumb-area');
                if (bc) bc.textContent = savedArea === 'operacoes' ? 'Operações' : 'Solicitações';
                const btn = document.getElementById('area-switch-btn');
                if (btn) btn.classList.remove('hidden');
                renderAdminMenu();
            } else {
                _areaMode = null;
                showAreaSelectModal();
            }
        }
    } else {
        document.getElementById('admin-area').classList.add('hidden');
        document.getElementById('user-area').classList.remove('hidden');
        document.getElementById('area-switch-btn')?.classList.add('hidden');
        renderUserMenu();
        prefillUserForm();
    }

    activateSubscribers();
    Session.startSessionWatch(() => doLogout(true));

    if (_pendingDeepLink) {
        const id = _pendingDeepLink; _pendingDeepLink = null;
        const url = new URL(window.location.href);
        url.searchParams.delete('request');
        window.history.replaceState({}, '', url.toString());
        let attempts = 0;
        const tryOpen = () => {
            const reqs = Requests.getRequests();
            if (reqs.length > 0 || attempts > 30) {
                const req = reqs.find(r => r.id === id);
                if (req) { Requests.viewRequest(id, isAdmin); showNotification('Solicitação aberta', `Solicitação ${req.numero}`, 'info'); }
                else showNotification('Não encontrada', 'A solicitação pode ter sido removida.', 'warning');
            } else { attempts++; setTimeout(tryOpen, 400); }
        };
        setTimeout(tryOpen, 500);
    }

    const loginAction = currentUser.provider === 'google' ? 'Login com Google' : 'Login';
    await History.addHistory(loginAction, '-', `Usuário ${currentUser.name} acessou`);
    showNotification('Bem-vindo(a)', `Olá, ${currentUser.name}!`, 'success');
}

// ============================================================
// SUBSCRIBERS
// ============================================================
function activateSubscribers() {
    if (subscribersActive) return;
    subscribersActive = true;
    Users.subscribeUsers();
    Requests.subscribeRequests((requests) => {
        Dashboard.setDashboardData(requests);
        Reports.setReportsContext(requests, currentUser);
    });
    Schedule.subscribeSlots();
    Notifications.subscribeNotifications();
    if (isAdmin) {
        History.subscribeHistory();
        Trash.subscribeTrash();
        Signups.subscribeSignups();
    }
}
function deactivateSubscribers() {
    if (!subscribersActive) return;
    subscribersActive = false;
    Users.unsubscribeUsers();
    Requests.unsubscribeRequests();
    Schedule.unsubscribeSlots();
    History.unsubscribeHistory();
    Trash.unsubscribeTrash();
    Signups.unsubscribeSignups();
    Notifications.unsubscribeNotifications();
    Dashboard.destroyDashboardCharts();
}

// ============================================================
// MENUS
// ============================================================
function renderUserMenu() {
    const menu = document.getElementById('top-menu-list');
    menu.innerHTML = `
        <li><a href="#" class="active" data-tab="user-solicitacoes"><svg class="si si-fw"><use href="#i-car"/></svg> Solicitar Transporte</a></li>
        <li><a href="#" data-tab="user-perfil"><svg class="si si-fw"><use href="#i-user"/></svg> Meu Perfil</a></li>
    `;
    menu.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault(); gotoUserTab(a.getAttribute('data-tab')); closeMobileSidebar();
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
    document.getElementById('page-title').textContent = TAB_TITLES[tabId] || 'SSOT';
    const sub = TAB_SUBTITLES[tabId];
    const subtitle = document.getElementById('page-subtitle');
    if (sub) { subtitle.textContent = sub; subtitle.classList.remove('hidden'); }
    else subtitle.classList.add('hidden');
    if (tabId === 'user-perfil') { Profile.refreshProfileState(); Profile.populateProfileForm(); }
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
                e.preventDefault(); gotoAdminTab(a.getAttribute('data-tab')); closeMobileSidebar();
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
                Dashboard.updateDashboardCharts();
                History.renderRecentActivityWidget();
                Requests.renderTodayRequestsWidget();
                Schedule.renderUpcomingSlotsWidget();
            }, 100);
            break;
        case 'admin-agenda':
            Schedule.renderSlotsAdmin();
            updateArchiveBadge();
            break;
        case 'admin-historico': History.refreshHistory(); break;
        case 'admin-lixeira': Trash.updateTrashTable(); break;
        case 'admin-usuarios': Users.updateUsersTable(); Signups.subscribeSignups(); break;
        case 'admin-perfil': Profile.refreshProfileState(); Profile.populateProfileForm(); break;
        case 'admin-servicos': updateNetworkStatus(); break;
        case 'admin-frota':
            try { FleetExcel.initFleetExcel(); } catch (e) { console.error('[SSOT] Frota Excel:', e); }
            break;
    }
}

async function updateArchiveBadge() {
    const btn = document.getElementById('archive-past-slots');
    if (!btn) return;
    try {
        const count = await ScheduleArchive.countPastSlots(db);
        let badge = btn.querySelector('.archive-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'archive-badge';
                btn.appendChild(badge);
            }
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
    set('u-solicitante', currentUser.name); set('u-email', currentUser.email);
    set('u-ramal', currentUser.ramal); set('u-setor', currentUser.setor); set('u-cargo', currentUser.cargo);
}

// ============================================================
// LOGOUT
// ============================================================
async function doLogout(silent = false) {
    if (currentUser && !currentUser.isGuest) {
        try { await History.addHistory('Logout', '-', `Usuário ${currentUser.name}`); } catch (e) {}
    }
    if (currentUser) sessionStorage.removeItem(AREA_KEY + currentUser.uid);
    _areaMode = null;
    clearAreaHash();
    Session.stopSessionWatch();
    deactivateSubscribers();
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    currentUser = null; isAdmin = false; isResuming = false;
    _loginInProgress = false; _enterSystemDone = false;
    try { await Auth.logoutUser(); } catch (e) {}
    document.getElementById('app-container')?.classList.add('hidden');
    document.getElementById('conn-loading')?.classList.add('hidden');
    showLoginPage();
    if (silent) showNotification('Sessão encerrada', 'Você ficou inativo e foi desconectado.', 'warning', 6000);
}

// ============================================================
// NAVEGAÇÃO LOGIN
// ============================================================
function goToLoginFn(mode) {
    window._loginMode = mode;
    document.getElementById('screen-select').classList.add('hidden');
    document.getElementById('screen-login').classList.remove('hidden');
    document.getElementById('screen-requerimento').classList.add('hidden');
    const title = document.getElementById('login-title');
    const subtitle = document.getElementById('login-subtitle');
    if (mode === 'admin') { if (title) title.textContent = 'Entrar como Setor'; if (subtitle) subtitle.textContent = 'Acesso administrativo'; }
    else { if (title) title.textContent = 'Entrar como Usuário'; if (subtitle) subtitle.textContent = 'Acesse suas solicitações'; }
    document.getElementById('login-error')?.classList.add('hidden');
    document.getElementById('login-info')?.classList.add('hidden');
    const u = document.getElementById('username'); const p = document.getElementById('password');
    if (u) u.value = ''; if (p) p.value = ''; u?.focus();
}
function goToRequerimentoFn() {
    document.getElementById('screen-select').classList.add('hidden');
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-requerimento').classList.remove('hidden');
    document.getElementById('requerimento-error')?.classList.add('hidden');
    document.getElementById('requerimento-success')?.classList.add('hidden');
    document.getElementById('requerimento-form')?.reset();
    document.getElementById('r-nome')?.focus();
}
function backToSelectFn() {
    document.getElementById('screen-select').classList.remove('hidden');
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-requerimento').classList.add('hidden');
    document.getElementById('login-error')?.classList.add('hidden');
    document.getElementById('login-info')?.classList.add('hidden');
    document.getElementById('requerimento-error')?.classList.add('hidden');
    document.getElementById('requerimento-success')?.classList.add('hidden');
}
function togglePassFn(id, el) {
    const p = document.getElementById(id); if (!p) return;
    const use = el.querySelector('use');
    if (p.type === 'password') { p.type = 'text'; if (use) use.setAttribute('href', '#i-eye-off'); }
    else { p.type = 'password'; if (use) use.setAttribute('href', '#i-eye'); }
}

// ============================================================
// LISTENERS
// ============================================================
function setupEventListeners() {
    document.getElementById('login-form')?.addEventListener('submit', handleLoginSubmit);
    document.getElementById('google-login-btn')?.addEventListener('click', handleGoogleLogin);
    document.getElementById('requerimento-form')?.addEventListener('submit', handleSignupSubmit);
    document.getElementById('user-request-form')?.addEventListener('submit', handleRequestSubmit);

    document.getElementById('admin-new-request-btn')?.addEventListener('click', () => {
        document.getElementById('admin-request-form').reset();
        const saidaSelect = document.getElementById('ar-saida');
        if (saidaSelect) {
            saidaSelect.innerHTML = '<option value="">Selecione...</option>';
            const userSelect = document.getElementById('u-saida');
            if (userSelect) {
                Array.from(userSelect.children).forEach(child => {
                    if (child.tagName === 'OPTGROUP') {
                        const grp = document.createElement('optgroup');
                        grp.label = child.label;
                        Array.from(child.children).forEach(opt => {
                            const newOpt = document.createElement('option');
                            newOpt.value = opt.value; newOpt.textContent = opt.textContent;
                            grp.appendChild(newOpt);
                        });
                        saidaSelect.appendChild(grp);
                    } else if (child.value) {
                        const newOpt = document.createElement('option');
                        newOpt.value = child.value; newOpt.textContent = child.textContent;
                        saidaSelect.appendChild(newOpt);
                    }
                });
            }
        }
        window.openModal('admin-new-request-modal');
    });
    document.getElementById('admin-request-form')?.addEventListener('submit', handleAdminRequestSubmit);
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        const ok = await sstConfirm('Deseja realmente sair?', 'Sair', 'warning');
        if (ok) doLogout(false);
    });
    document.getElementById('toggle-password')?.addEventListener('click', function () { togglePassFn('password', this); });
    document.getElementById('password')?.addEventListener('keyup', function (e) {
        const warn = document.getElementById('capslock-warning');
        if (warn) warn.style.display = e.getModifierState('CapsLock') ? 'block' : 'none';
    });
    document.getElementById('password')?.addEventListener('blur', () => {
        document.getElementById('capslock-warning')?.style.setProperty('display', 'none');
    });
    document.getElementById('user-info-t
