// ============================================================
// SSOT - MAIN (v10.4)
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
import * as Fleet from './fleet.js';
import * as Reports from './reports.js';
import * as Settings from './settings.js';
import * as Notifications from './notifications.js';
import * as Profile from './profile.js';

let app, db, auth;
let currentUser = null;
let isAdmin = false; // true para admin OU setor
let subscribersActive = false;
let isResuming = false;
let _loginInProgress = false;
let _enterSystemDone = false;
let _pendingDeepLink = null;

// ============================================================
// BOOT
// ============================================================
function init() {
    console.log(`[SSOT] Inicializando v${APP_VERSION}...`);

    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    auth = getAuth(app);

    window._addHistoryInternal = (action, num, details) => {
        History.addHistory(action, num, details).catch(() => {});
    };
    window._getUsersForNotif = () => Users.getUsers();

    // Lê deep link do QR Code (?request=ID)
    const params = new URLSearchParams(window.location.search);
    const reqId = params.get('request');
    if (reqId) _pendingDeepLink = reqId;

    Settings.setupServices();
    setupNetworkStatus();
    setupEventListeners();
    setupGlobalExports();
    setupFormTabs();
    setupUsersTabs();

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

        if (user) {
            await handleUserLoggedIn(user);
        } else {
            handleUserLoggedOut();
        }
    });
}

// ============================================================
// TABS FORMULÁRIO
// ============================================================
function setupFormTabs() {
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const target = this.getAttribute('data-form-tab');
            document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.querySelector(`[data-form-content="${target}"]`)?.classList.add('active');
        });
    });
}

window.goToFormTab = function (tabName) {
    document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.form-tab-content').forEach(c => c.classList.remove('active'));
    const tabBtn = document.querySelector(`[data-form-tab="${tabName}"]`);
    const content = document.querySelector(`[data-form-content="${tabName}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    if (content) content.classList.add('active');
    document.getElementById('user-request-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ============================================================
// TABS DE USUÁRIOS (event delegation robusta)
// ============================================================
function setupUsersTabs() {
    document.addEventListener('click', function (e) {
        const tab = e.target.closest('[data-users-tab]');
        if (!tab) return;

        const target = tab.getAttribute('data-users-tab');
        document.querySelectorAll('[data-users-tab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('[data-users-content]').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const content = document.querySelector(`[data-users-content="${target}"]`);
        if (content) content.classList.add('active');

        if (target === 'pendentes' || target === 'recusados') {
            Signups.subscribeSignups();
        }
    });
}

// ============================================================
// EXPORTS
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
}

// ============================================================
// USUÁRIO LOGADO
// ============================================================
async function handleUserLoggedIn(user) {
    try {
        if (currentUser && currentUser.uid === user.uid) return;

        const snap = await get(ref(db, 'users/' + user.uid));
        if (!snap.exists()) {
            await Auth.logoutUser();
            showNotification('Acesso negado', 'Seu usuário não está cadastrado.', 'danger');
            showLoginPage();
            return;
        }

        const data = snap.val();
        if (data.active === false) {
            await Auth.logoutUser();
            showNotification('Conta desativada', 'Contate o administrador.', 'danger');
            showLoginPage();
            return;
        }

        const wasLogged = sessionStorage.getItem(SESSION_ACTIVE_KEY) === user.uid;
        if (wasLogged && !isResuming) {
            isResuming = true;
            document.getElementById('conn-loading')?.classList.add('hidden');
            showResumeModal(user, data);
            return;
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
        uid: fbUser.uid,
        username: fbUser.email,
        email: data.email || fbUser.email,
        name: data.name || fbUser.displayName || fbUser.email,
        role: data.role || 'user',
        setor: data.setor || '',
        ramal: data.ramal || '',
        cargo: data.cargo || '',
        phone: data.phone || '',
        provider: data.provider || 'password',
        photo: data.photo || null,
        isGuest: false
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
    const modal = document.getElementById('resume-modal');
    if (!modal) return;
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
        currentUser = null;
        isAdmin = false;
        isResuming = false;
        showLoginPage();
    };
}

// ============================================================
// ENTRAR
// ============================================================
async function enterSystem() {
    _enterSystemDone = true;

    document.getElementById('current-user').textContent = currentUser.name;
    document.getElementById('user-role').textContent = ROLE_LABELS[currentUser.role] || 'Usuário';

    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
        if (currentUser.photo) {
            avatarEl.innerHTML = `<img src="${currentUser.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarEl.textContent = getInitials(currentUser.name);
        }
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
    Fleet.setFleetContext(db, currentUser);
    Reports.setReportsContext([], currentUser);
    Settings.setSettingsContext(currentUser);
    Signups.setSignupsContext(db, currentUser, isAdmin);
    Notifications.setNotificationsContext(db, currentUser, isAdmin);
    Profile.setProfileContext(db, currentUser, isAdmin);

    if (isAdmin) {
        document.getElementById('user-area').classList.add('hidden');
        document.getElementById('admin-area').classList.remove('hidden');
        renderAdminMenu();
    } else {
        document.getElementById('admin-area').classList.add('hidden');
        document.getElementById('user-area').classList.remove('hidden');
        renderUserMenu();
        prefillUserForm();
    }

    activateSubscribers();
    Session.startSessionWatch(() => doLogout(true));

    setTimeout(() => {
        if (isAdmin) {
            const tab = sessionStorage.getItem(SESSION_STORAGE_KEY + '_' + currentUser.uid) || 'admin-dashboard';
            gotoAdminTab(tab);
        }
    }, 250);

    // Deep link do QR Code
    if (_pendingDeepLink) {
        const id = _pendingDeepLink;
        _pendingDeepLink = null;
        const url = new URL(window.location.href);
        url.searchParams.delete('request');
        window.history.replaceState({}, '', url.toString());

        let attempts = 0;
        const tryOpen = () => {
            const reqs = Requests.getRequests();
            if (reqs.length > 0 || attempts > 30) {
                const req = reqs.find(r => r.id === id);
                if (req) {
                    Requests.viewRequest(id, isAdmin);
                    showNotification('Solicitação aberta', `Solicitação ${req.numero}`, 'info');
                } else {
                    showNotification('Não encontrada', 'A solicitação pode ter sido removida.', 'warning');
                }
            } else {
                attempts++;
                setTimeout(tryOpen, 400);
            }
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
    Fleet.subscribeFleet(() => {});
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
    Fleet.unsubscribeFleet();
    Signups.unsubscribeSignups();
    Notifications.unsubscribeNotifications();
    Dashboard.destroyDashboardCharts();
}

// ============================================================
// MENUS
// ============================================================
function renderUserMenu() {
    document.getElementById('top-menu-list').innerHTML = `
        <li><a href="#" class="active" data-tab="user-solicitacoes"><svg class="si si-fw"><use href="#i-car"/></svg> Solicitar Transporte</a></li>
        <li><a href="#" data-tab="user-perfil"><svg class="si si-fw"><use href="#i-user"/></svg> Meu Perfil</a></li>
    `;

    document.getElementById('top-menu-list').querySelectorAll('a').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            gotoUserTab(a.getAttribute('data-tab'));
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

    if (tabId === 'user-perfil') {
        Profile.refreshProfileState();
        Profile.populateProfileForm();
    }
}

function renderAdminMenu() {
    document.getElementById('top-menu-list').innerHTML = `
        <li><a href="#" data-tab="admin-dashboard"><svg class="si si-fw"><use href="#i-chart-line"/></svg> Dashboard</a></li>
        <li><a href="#" data-tab="admin-solicitacoes"><svg class="si si-fw"><use href="#i-clipboard"/></svg> Solicitações</a></li>
        <li><a href="#" data-tab="admin-usuarios"><svg class="si si-fw"><use href="#i-users-cog"/></svg> Usuários</a></li>
        <li><a href="#" data-tab="admin-agenda"><svg class="si si-fw"><use href="#i-calendar-check"/></svg> Agenda</a></li>
        <li><a href="#" data-tab="admin-frota"><svg class="si si-fw"><use href="#i-truck"/></svg> Frota</a></li>
        <li><a href="#" data-tab="admin-relatorios"><svg class="si si-fw"><use href="#i-file-text"/></svg> Relatórios</a></li>
        <li><a href="#" data-tab="admin-historico"><svg class="si si-fw"><use href="#i-history"/></svg> Histórico</a></li>
        <li><a href="#" data-tab="admin-lixeira"><svg class="si si-fw"><use href="#i-trash"/></svg> Lixeira</a></li>
        <li><a href="#" data-tab="admin-perfil"><svg class="si si-fw"><use href="#i-user"/></svg> Perfil</a></li>
        <li><a href="#" data-tab="admin-servicos"><svg class="si si-fw"><use href="#i-cog"/></svg> Serviços</a></li>
    `;

    document.getElementById('top-menu-list').querySelectorAll('a').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            gotoAdminTab(a.getAttribute('data-tab'));
        });
    });

    gotoAdminTab('admin-dashboard');
}

export function gotoAdminTab(tabId) {
    if (!tabId) return;

    document.querySelectorAll('#admin-area .tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(tabId + '-tab');
    if (target) target.classList.add('active');

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

    if (currentUser) {
        sessionStorage.setItem(SESSION_STORAGE_KEY + '_' + currentUser.uid, tabId);
    }

    switch (tabId) {
        case 'admin-dashboard':
            setTimeout(() => {
                Dashboard.updateDashboardCharts();
                History.renderRecentActivityWidget();
                Requests.renderTodayRequestsWidget();
                Schedule.renderUpcomingSlotsWidget();
            }, 100);
            break;
        case 'admin-agenda': Schedule.renderSlotsAdmin(); break;
        case 'admin-historico': History.refreshHistory(); break;
        case 'admin-lixeira': Trash.updateTrashTable(); break;
        case 'admin-usuarios':
            Users.updateUsersTable();
            Signups.subscribeSignups();
            break;
        case 'admin-perfil':
            Profile.refreshProfileState();
            Profile.populateProfileForm();
            break;
    }
}

function openProfileTab() {
    if (!isAdmin) {
        gotoUserTab('user-perfil');
    } else {
        gotoAdminTab('admin-perfil');
    }
}

function prefillUserForm() {
    if (!currentUser) return;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    set('u-solicitante', currentUser.name);
    set('u-email', currentUser.email);
    set('u-ramal', currentUser.ramal);
    set('u-setor', currentUser.setor);
    set('u-cargo', currentUser.cargo);
}

// ============================================================
// LOGOUT
// ============================================================
async function doLogout(silent = false) {
    if (currentUser && !currentUser.isGuest) {
        try { await History.addHistory('Logout', '-', `Usuário ${currentUser.name}`); } catch (e) {}
    }

    Session.stopSessionWatch();
    deactivateSubscribers();
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);

    currentUser = null;
    isAdmin = false;
    isResuming = false;
    _loginInProgress = false;
    _enterSystemDone = false;

    if (!silent) { try { await Auth.logoutUser(); } catch (e) {} }

    document.getElementById('app-container')?.classList.add('hidden');
    document.getElementById('conn-loading')?.classList.add('hidden');
    showLoginPage();

    if (silent) {
        showNotification('Sessão encerrada', 'Você ficou inativo.', 'warning', 6000);
    }
}

// ============================================================
// LOGIN
// ============================================================
function goToLoginFn(mode) {
    window._loginMode = mode;
    document.getElementById('screen-select').classList.add('hidden');
    document.getElementById('screen-login').classList.remove('hidden');
    document.getElementById('screen-requerimento').classList.add('hidden');

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
    const p = document.getElementById(id);
    if (!p) return;
    const use = el.querySelector('use');
    if (p.type === 'password') {
        p.type = 'text';
        if (use) use.setAttribute('href', '#i-eye-off');
    } else {
        p.type = 'password';
        if (use) use.setAttribute('href', '#i-eye');
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
    document.getElementById('login-form')?.addEventListener('submit', handleLoginSubmit);
    document.getElementById('google-login-btn')?.addEventListener('click', handleGoogleLogin);
    document.getElementById('requerimento-form')?.addEventListener('submit', handleSignupSubmit);
    document.getElementById('user-request-form')?.addEventListener('submit', handleRequestSubmit);

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        const ok = await sstConfirm('Deseja realmente sair?', 'Sair', 'warning');
        if (ok) doLogout(false);
    });

    document.getElementById('toggle-password')?.addEventListener('click', function () {
        togglePassFn('password', this);
    });

    document.getElementById('password')?.addEventListener('keyup', function (e) {
        const warn = document.getElementById('capslock-warning');
        if (warn) warn.style.display = e.getModifierState('CapsLock') ? 'block' : 'none';
    });

    document.getElementById('password')?.addEventListener('blur', () => {
        document.getElementById('capslock-warning')?.style.setProperty('display', 'none');
    });

    // Avatar → perfil
    document.getElementById('user-info-trigger')?.addEventListener('click', () => openProfileTab());

    window.openForgotPassword = async function (e) {
        e.preventDefault();
        const email = await sstPrompt('Digite seu e-mail para receber o link:', '', 'Redefinir Senha');
        if (!email) return;
        try {
            await Auth.sendReset(email);
            showNotification('E-mail enviado', 'Verifique sua caixa.', 'success');
        } catch (err) {
            console.error(err);
            showNotification('Erro', 'Não foi possível enviar.', 'danger');
        }
    };

    // Sino de notificações
    document.getElementById('notif-bell-btn')?.addEventListener('click', () => {
        if (isAdmin) Notifications.openNotifAdminModal();
        else Notifications.openNotifViewModal();
    });

    document.getElementById('send-notif-btn')?.addEventListener('click', handleSendNotification);

    // Usuários
    document.getElementById('new-user-btn')?.addEventListener('click', () => Users.openUserModal());
    document.getElementById('save-user-btn')?.addEventListener('click', () => Users.saveUser());
    document.getElementById('refresh-users')?.addEventListener('click', () => {
        Users.updateUsersTable();
        Signups.subscribeSignups();
        showNotification('Atualizado', 'Lista atualizada.', 'success', 2000);
    });
    Users.setupUserFilters();

    document.getElementById('user-photo-input')?.addEventListener('change', function (e) {
        const file = e.target.files?.[0];
        if (file) Users.handlePhotoSelect(file);
    });
    document.getElementById('user-photo-remove')?.addEventListener('click', () => Users.handlePhotoRemove());

    // Perfil (admin)
    document.getElementById('ap-photo-input')?.addEventListener('change', function (e) {
        const file = e.target.files?.[0];
        if (file) Profile.handleProfilePhotoSelect(file);
    });
    document.getElementById('ap-photo-remove')?.addEventListener('click', () => Profile.handleProfilePhotoRemove());
    document.getElementById('ap-save-btn')?.addEventListener('click', () => Profile.saveProfile());

    // Perfil (user)
    document.getElementById('up-photo-input')?.addEventListener('change', function (e) {
        const file = e.target.files?.[0];
        if (file) Profile.handleProfilePhotoSelect(file);
    });
    document.getElementById('up-photo-remove')?.addEventListener('click', () => Profile.handleProfilePhotoRemove());
    document.getElementById('up-save-btn')?.addEventListener('click', () => Profile.saveProfile());

    // Filtros
    Requests.setupRequestFilters();
    History.setupHistoryFilters();

    document.getElementById('user-refresh')?.addEventListener('click', () => {
        Requests.updateUserTable();
        showNotification('Atualizado', 'Lista atualizada.', 'success', 2000);
    });

    document.getElementById('admin-refresh')?.addEventListener('click', () => {
        Requests.updateAdminTable();
        showNotification('Atualizado', 'Lista atualizada.', 'success', 2000);
    });

    document.getElementById('historico-refresh')?.addEventListener('click', () => {
        History.refreshHistory();
        showNotification('Atualizado', 'Histórico atualizado.', 'success', 2000);
    });

    document.getElementById('historico-clear')?.addEventListener('click', () => History.clearAllHistory());

    // ============================================================
    // AGENDA
    // ============================================================
    // Adicionar bloco (múltiplos horários)
    document.getElementById('add-slot-block')?.addEventListener('click', async () => {
        await Schedule.addSlotBlock(
            document.getElementById('slot-date')?.value,
            document.getElementById('slot-start')?.value,
            document.getElementById('slot-end')?.value
        );
    });

    // ✅ NOVO: Adicionar horário individual
    document.getElementById('add-single-slot')?.addEventListener('click', async () => {
        await Schedule.addSingleSlot(
            document.getElementById('single-slot-date')?.value,
            document.getElementById('single-slot-time')?.value
        );
    });

    document.getElementById('refresh-slots')?.addEventListener('click', () => {
        Schedule.renderSlotsAdmin();
        showNotification('Atualizado', 'Agenda atualizada.', 'success', 2000);
    });

    // Lixeira
    document.getElementById('lixeira-clear')?.addEventListener('click', () => Trash.emptyTrash());

    // Frota
    document.getElementById('add-vehicle')?.addEventListener('click', () => Fleet.saveVehicle());
    document.getElementById('add-driver')?.addEventListener('click', () => Fleet.saveDriver());

    // Relatórios
    document.getElementById('generate-report')?.addEventListener('click', () => Reports.generateReport());
    document.getElementById('export-excel')?.addEventListener('click', () => Reports.exportReportExcel());
    document.getElementById('export-pdf')?.addEventListener('click', () => Reports.exportReportPDF(false));
    document.getElementById('preview-pdf')?.addEventListener('click', () => Reports.exportReportPDF(true));
    document.getElementById('admin-export-pdf')?.addEventListener('click', () => Reports.exportReportPDF(false));
    document.getElementById('admin-export-excel')?.addEventListener('click', () => Reports.exportReportExcel());

    // Dashboard
    Dashboard.setupChartDownloads();
    Dashboard.setupChartFilters();

    // Backup
    Settings.setupBackupButtons(handleBackup, handleImportBackup);

    // Modais
    document.getElementById('close-view-modal')?.addEventListener('click', () => Requests.closeViewModal());
    document.getElementById('close-pdf-modal')?.addEventListener('click', closePdfModal);
    document.getElementById('close-pdf-modal-btn')?.addEventListener('click', closePdfModal);

    // ✅ Download do PDF (mantém modal aberto até terminar)
    document.getElementById('download-pdf')?.addEventListener('click', () => {
        Reports.exportReportPDF(false);
        setTimeout(closePdfModal, 1500);
    });

    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', function (e) {
            if (e.target === this) {
                if (this.id === 'session-modal' || this.id === 'resume-modal') return;
                this.classList.remove('active');
            }
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => {
                if (m.id !== 'session-modal' && m.id !== 'resume-modal') m.classList.remove('active');
            });
        }
    });

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
}

// ============================================================
// LOGIN EMAIL
// ============================================================
async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('username')?.value.trim() || '';
    const password = document.getElementById('password')?.value || '';
    const btn = document.getElementById('login-submit-btn');
    const errBox = document.getElementById('login-error');
    const infoBox = document.getElementById('login-info');

    _loginInProgress = true;
    errBox?.classList.add('hidden');
    infoBox?.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

    try {
        const user = await Auth.loginUser(email, password);
        const snap = await get(ref(db, 'users/' + user.uid));

        if (!snap.exists()) {
            const signupCheck = await Signups.checkSignupByEmail(email);
            await Auth.logoutUser();
            if (signupCheck.exists && signupCheck.status === 'pendente') {
                throw new Error('Sua solicitação está PENDENTE. Aguarde a aprovação.');
            } else if (signupCheck.exists && signupCheck.status === 'recusado') {
                throw new Error('Sua solicitação foi RECUSADA.');
            } else {
                throw new Error('Usuário não cadastrado. Solicite um cadastro.');
            }
        }

        const data = snap.val();
        if (data.active === false) {
            await Auth.logoutUser();
            throw new Error('Conta desativada.');
        }

        const mode = window._loginMode || 'user';
        const userRole = data.role || 'user';
        const isAdminRole = ADMIN_ROLES.includes(userRole);

        if (mode === 'admin' && !isAdminRole) {
            await Auth.logoutUser();
            throw new Error('Este usuário não tem acesso administrativo.');
        }
        if (mode === 'user' && isAdminRole) {
            await Auth.logoutUser();
            throw new Error('Use "Sou Setor" para este usuário.');
        }

        currentUser = buildUser(user, data);
        isAdmin = isAdminRole;
        _loginInProgress = false;
        await enterSystem();
    } catch (err) {
        console.error('[SSOT] Erro login:', err);
        _loginInProgress = false;
        try { await Auth.logoutUser(); } catch (e) {}
        const msg = err.code ? Auth.getAuthErrorMessage(err) : err.message;
        if (errBox) { errBox.textContent = msg; errBox.classList.remove('hidden'); }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
}

// ============================================================
// GOOGLE
// ============================================================
async function handleGoogleLogin() {
    const btn = document.getElementById('google-login-btn');
    const errBox = document.getElementById('login-error');
    const infoBox = document.getElementById('login-info');

    _loginInProgress = true;
    errBox?.classList.add('hidden');
    infoBox?.classList.add('hidden');
    if (btn) btn.disabled = true;

    try {
        const result = await Auth.loginWithGoogle();
        const googleUser = result.user;
        const email = (googleUser.email || '').toLowerCase();

        const snap = await get(ref(db, 'users/' + googleUser.uid));

        if (snap.exists()) {
            const data = snap.val();
            if (data.email && data.email.toLowerCase() !== email) {
                await Auth.logoutUser();
                throw new Error('O e-mail do Google não bate com o cadastro aprovado.');
            }
            if (data.active === false) {
                await Auth.logoutUser();
                throw new Error('Conta desativada.');
            }

            currentUser = buildUser(googleUser, data);
            isAdmin = ADMIN_ROLES.includes(currentUser.role);
            _loginInProgress = false;
            await enterSystem();
            return;
        }

        const signupCheck = await Signups.checkSignupByEmail(email);

        if (signupCheck.exists && signupCheck.status === 'pendente') {
            await Auth.logoutUser();
            _loginInProgress = false;
            if (infoBox) {
                infoBox.innerHTML = '<strong>Solicitação pendente</strong><p>Aguarde a aprovação de um administrador.</p>';
                infoBox.classList.remove('hidden');
            }
            return;
        }
        if (signupCheck.exists && signupCheck.status === 'recusado') {
            await Auth.logoutUser();
            _loginInProgress = false;
            if (errBox) {
                errBox.textContent = 'Sua solicitação foi recusada.';
                errBox.classList.remove('hidden');
            }
            return;
        }

        // Cria signup automático
        const nome = googleUser.displayName || email.split('@')[0];
        const signupRef = push(ref(db, 'signups'));
        await set(signupRef, {
            nome, email, ramal: '', setor: '', cargo: '',
            justificativa: 'Cadastro automático via Google.',
            password: null,
            provider: 'google',
            status: 'pendente',
            origin: 'google',
            timestamp: new Date().toISOString()
        });

        await Auth.logoutUser();
        _loginInProgress = false;

        if (infoBox) {
            infoBox.innerHTML = '<strong>Solicitação enviada!</strong><p>Seu cadastro via Google foi registrado e está aguardando aprovação.</p>';
            infoBox.classList.remove('hidden');
        }
    } catch (err) {
        console.error('[SSOT] Erro Google:', err);
        _loginInProgress = false;
        try { await Auth.logoutUser(); } catch (e) {}
        const msg = err.code ? Auth.getAuthErrorMessage(err) : (err.message || 'Erro ao autenticar.');
        if (errBox) { errBox.textContent = msg; errBox.classList.remove('hidden'); }
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// CADASTRO
// ============================================================
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
    errBox?.classList.add('hidden');
    successBox?.classList.add('hidden');

    if (!nome || !email || !ramal || !setor) {
        errBox.textContent = 'Preencha todos os campos obrigatórios.';
        errBox.classList.remove('hidden');
        return;
    }
    if (!senha || senha.length < 6) {
        errBox.textContent = 'A senha deve ter no mínimo 6 caracteres.';
        errBox.classList.remove('hidden');
        return;
    }
    if (senha !== senha2) {
        errBox.textContent = 'As senhas não coincidem.';
        errBox.classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('requerimento-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    try {
        await Signups.createSignup({ nome, email, ramal, setor, cargo, justificativa, senha, origin: 'form' });
        successBox.innerHTML = '<strong>Solicitação enviada!</strong><p style="margin-top:4px;">Aguarde a aprovação do administrador.</p>';
        successBox.classList.remove('hidden');
        document.getElementById('requerimento-form')?.reset();
        setTimeout(() => backToSelectFn(), 6000);
    } catch (err) {
        console.error(err);
        errBox.textContent = err.message || 'Erro ao enviar.';
        errBox.classList.remove('hidden');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar Solicitação'; }
    }
}

// ============================================================
// SOLICITAÇÃO DE TRANSPORTE
// ============================================================
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
            showAlert('Preencha todos os campos obrigatórios (*).', 'danger');
            const fieldMap = {
                'solicitante': 'solicitante', 'email': 'solicitante', 'ramal': 'solicitante',
                'setor': 'solicitante', 'destino': 'viagem', 'finalidade': 'viagem', 'saida': 'viagem'
            };
            window.goToFormTab(fieldMap[field] || 'solicitante');
            return;
        }
    }

    try {
        const created = await Requests.createRequest(formData);

        // Reserva o slot da agenda (se aplicável)
        if (formData.saida && formData.saida.includes('T')) {
            const [date, time] = formData.saida.split('T');
            if (date && time) {
                try { await Schedule.reserveSlot(date, time, created.numero); }
                catch (e) { console.warn('[SSOT]', e); }
            }
        }

        ['u-destino','u-origem','u-finalidade','u-saida','u-retorno','u-necessidades','u-nomes-passageiros','u-observacoes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const p = document.getElementById('u-passageiros');
        if (p) p.value = 1;
        const pr = document.getElementById('u-prioridade');
        if (pr) pr.value = 'normal';

        window.goToFormTab('solicitante');
        showNotification('Solicitação Enviada', `Solicitação ${created.numero} registrada!`, 'success');
    } catch (err) {
        console.error(err);
        showAlert('Erro ao salvar solicitação: ' + (err.message || ''), 'danger');
    }
}

// ============================================================
// NOTIFICAÇÃO
// ============================================================
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
        console.error(err);
        showAlert(err.message || 'Erro ao enviar.', 'danger');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
}

// ============================================================
// BACKUP
// ============================================================
function handleBackup() {
    const backup = {
        meta: { app: 'SSOT', version: APP_VERSION, timestamp: new Date().toISOString(), createdBy: currentUser?.name || 'Sistema' },
        data: {
            requests: Requests.getRequests(),
            vehicles: Fleet.getVehicles(),
            drivers: Fleet.getDrivers(),
            users: Users.getUsers(),
            trash: Trash.getTrash(),
            signups: Signups.getSignups(),
            notifications: Notifications.getNotifications()
        }
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
                delete copy[idField];
                delete copy.id;
                await set(ref(db, col + '/' + id), copy);
                imported++;
            }
        };
        await importCollection('requests', payload.requests, 'id');
        await importCollection('users', payload.users, 'uid');
        await importCollection('vehicles', payload.vehicles, 'id');
        await importCollection('drivers', payload.drivers, 'id');
        await History.addHistory('Backup Importado', '-', `${imported} registros`);
        showNotification('Importado', `${imported} registros.`, 'success');
    } catch (err) {
        console.error(err);
        showAlert('Erro ao importar.', 'danger');
    }
}

function closePdfModal() {
    document.getElementById('pdf-modal')?.classList.remove('active');
}

function updateNetworkStatus() {
    const el = document.getElementById('network-status');
    const txt = document.getElementById('network-status-text');
    if (!el) return;
    if (navigator.onLine) {
        el.className = 'network-status network-online';
        if (txt) txt.textContent = 'Online';
    } else {
        el.className = 'network-status network-offline';
        if (txt) txt.textContent = 'Offline';
    }
}

function setupNetworkStatus() { updateNetworkStatus(); }

document.addEventListener('DOMContentLoaded', init);
console.log(`[SSOT] v${APP_VERSION} · Firebase: ssot-ed9b1`);