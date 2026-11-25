/* ============================================================
   SSOT — js/app.js
   Navegação, login, seletor de área e abas.
   Não interfere em registro-frota-settings.js.
   ============================================================ */
(function () {
    'use strict';

    const $  = (id) => document.getElementById(id);
    const $$ = (sel, root) => (root || document).querySelectorAll(sel);

    function isAdmin() {
        const r = window.__currentUser && window.__currentUser.role;
        return r === 'admin' || r === 'setor';
    }

    function openModal(id)  { const m = $(id); if (m) m.classList.add('active'); }
    function closeModal(id) { const m = $(id); if (m) m.classList.remove('active'); }

    /* ------------------------------------------------------------ */
    /* BOOT                                                          */
    /* ------------------------------------------------------------ */
    document.addEventListener('DOMContentLoaded', () => {
        $('conn-loading')?.remove();               // sai do "Conectando..."
        $('login-page')?.classList.remove('hidden'); // mostra login

        wireLogin();
        wireHeader();
        wireUserRequestForm();
        wireModals();
    });

    /* ------------------------------------------------------------ */
    /* LOGIN                                                         */
    /* ------------------------------------------------------------ */
    function wireLogin() {
        // Olho para mostrar/ocultar senha
        document.addEventListener('click', (e) => {
            const span = e.target.closest('.toggle-password');
            if (!span) return;
            const input = span.closest('.password-container')?.querySelector('input');
            if (input) input.type = input.type === 'password' ? 'text' : 'password';
        });

        // Caps Lock
        $('password')?.addEventListener('keyup', (e) => {
            const warn = $('capslock-warning');
            if (!warn) return;
            const on = e.getModifierState && e.getModifierState('CapsLock');
            warn.style.display = on ? 'block' : 'none';
        });

        // Submit
        $('login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = ($('username')?.value || '').trim();
            const pass  = $('password')?.value || '';
            const err   = $('login-error');

            if (!email || !pass) {
                if (err) { err.textContent = 'Preencha e-mail e senha.'; err.classList.remove('hidden'); }
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                if (err) { err.textContent = 'Informe um e-mail válido.'; err.classList.remove('hidden'); }
                return;
            }
            if (err) err.classList.add('hidden');

            window.__currentUser = {
                email,
                name: email.split('@')[0] || 'Usuário',
                role: window.__loginType === 'admin' ? 'admin' : 'user'
            };
            enterApp();
        });
    }

    window.goToLogin = function (tipo) {
        $('screen-select')?.classList.add('hidden');
        $('screen-login')?.classList.remove('hidden');
        window.__loginType = tipo;

        const t = $('login-title'), s = $('login-subtitle');
        if (t) t.textContent = tipo === 'admin' ? 'Acesso do Setor' : 'Acesso do Usuário';
        if (s) s.textContent = tipo === 'admin' ? 'Administração do sistema' : 'Minhas solicitações';

        $('login-error')?.classList.add('hidden');
        $('login-info')?.classList.add('hidden');
        setTimeout(() => $('username')?.focus(), 50);
    };

    window.backToSelect = function () {
        $('screen-login')?.classList.add('hidden');
        $('screen-select')?.classList.remove('hidden');
        $('login-form')?.reset();
        $('login-error')?.classList.add('hidden');
        $('login-info')?.classList.add('hidden');
    };

    window.togglePass = function (inputId) {
        const input = $(inputId);
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    };

    window.openForgotPassword = function (e) {
        if (e) e.preventDefault();
        const info = $('login-info');
        if (info) {
            info.className = 'alert alert-info';
            info.textContent = 'Fale com o administrador do sistema para redefinir sua senha.';
            info.classList.remove('hidden');
        }
    };

    /* ------------------------------------------------------------ */
    /* ENTRAR NO APP                                                 */
    /* ------------------------------------------------------------ */
    function enterApp() {
        $('login-page')?.classList.add('hidden');
        $('app-container')?.classList.remove('hidden');

        renderUserInfo();
        renderTopMenu();
        openModal('area-select-modal');

        // Proteção: se o modal não ficar visível (CSS quebrado),
        // mostra a área padrão direto em 200ms.
        setTimeout(() => {
            const m = $('area-select-modal');
            if (!m || getComputedStyle(m).display === 'none') {
                selectArea(isAdmin() ? 'operacoes' : 'solicitacoes');
            }
        }, 200);
    }

    function renderUserInfo() {
        const u = window.__currentUser;
        if (!u) return;
        const av = $('user-avatar');
        if (av) av.textContent = (u.name || 'U').charAt(0).toUpperCase();
        if ($('current-user')) $('current-user').textContent = u.name;
        if ($('user-role')) $('user-role').textContent =
            u.role === 'admin' ? 'Administrador' :
            u.role === 'setor' ? 'Setor' : 'Usuário';
    }

    function renderTopMenu() {
        const list = $('top-menu-list');
        if (!list) return;

        const admin = isAdmin();
        const tabs = admin ? [
            { id: 'admin-dashboard-tab',    label: 'Dashboard',      icon: 'i-chart-line'    },
            { id: 'admin-solicitacoes-tab', label: 'Solicitações',   icon: 'i-clipboard'     },
            { id: 'admin-usuarios-tab',     label: 'Usuários',       icon: 'i-users-cog'     },
            { id: 'admin-agenda-tab',       label: 'Agenda',         icon: 'i-calendar-check'},
            { id: 'admin-frota-tab',        label: 'Frota',          icon: 'i-truck'         },
            { id: 'admin-relatorios-tab',   label: 'Relatórios',     icon: 'i-chart-bar'     },
            { id: 'admin-historico-tab',    label: 'Histórico',      icon: 'i-history'       },
            { id: 'admin-lixeira-tab',      label: 'Lixeira',        icon: 'i-trash'         },
            { id: 'admin-perfil-tab',       label: 'Perfil',         icon: 'i-user'          },
            { id: 'admin-servicos-tab',     label: 'Configurações',  icon: 'i-cog'           }
        ] : [
            { id: 'user-solicitacoes-tab',  label: 'Solicitações',   icon: 'i-clipboard'     },
            { id: 'user-perfil-tab',        label: 'Perfil',         icon: 'i-user'          }
        ];

        list.innerHTML = tabs.map((t, i) => {
            const activeCls = i === 0 ? ' active' : '';
            return '<li class="top-menu-item' + activeCls + '" data-tab="' + t.id + '">'
                 + '<a href="#' + t.id + '" onclick="return window.activateTab(\'' + t.id + '\', this.parentElement)">'
                 + '<svg class="si"><use href="#' + t.icon + '"/></svg>'
                 + '<span>' + t.label + '</span>'
                 + '</a></li>';
        }).join('');
    }

    window.activateTab = function (tabId, liEl) {
        const tab = $(tabId);
        if (!tab) return false;

        const area = tab.closest('#user-area') ? 'user-area' : 'admin-area';
        $$('#' + area + ' .tab-content').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        $$('.top-menu-item').forEach(li => li.classList.remove('active'));
        const target = liEl || document.querySelector('.top-menu-item[data-tab="' + tabId + '"]');
        if (target) target.classList.add('active');

        const titleEl = $('page-title');
        if (titleEl && target) {
            const lbl = target.querySelector('span')?.textContent;
            if (lbl) titleEl.textContent = lbl;
        }
        return false;
    };

    window.gotoAdminTab = function (tabId) {
        return window.activateTab(tabId, null);
    };

    /* ------------------------------------------------------------ */
    /* SELEÇÃO DE ÁREA                                               */
    /* ------------------------------------------------------------ */
    window.selectArea = function (area) {
        closeModal('area-select-modal');

        const admin = isAdmin();
        $('user-area')?.classList.toggle('hidden', admin);
        $('admin-area')?.classList.toggle('hidden', !admin);

        const defaultTab = admin ? 'admin-dashboard-tab' : 'user-solicitacoes-tab';
        window.activateTab(defaultTab, null);

        $('area-switch-btn')?.classList.remove('hidden');
        if ($('breadcrumb-area')) $('breadcrumb-area').textContent =
            area === 'operacoes' ? 'Operações' : 'Solicitações';
    };

    window.switchArea = function () {
        openModal('area-select-modal');
    };

    /* ------------------------------------------------------------ */
    /* HEADER                                                        */
    /* ------------------------------------------------------------ */
    function wireHeader() {
        $('logout-btn')?.addEventListener('click', () => {
            window.__currentUser = null;
            $('app-container')?.classList.add('hidden');
            $('login-page')?.classList.remove('hidden');
            $('screen-login')?.classList.add('hidden');
            $('screen-select')?.classList.remove('hidden');
            $('login-form')?.reset();
            $$('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        });

        $('user-info-trigger')?.addEventListener('click', () => {
            const tabId = isAdmin() ? 'admin-perfil-tab' : 'user-perfil-tab';
            window.activateTab(tabId, null);
        });

        $('notif-bell-btn')?.addEventListener('click', () => openModal('notif-view-modal'));

        $('mobile-menu-toggle')?.addEventListener('click', () => {
            $('main-nav')?.classList.toggle('open');
            $('sidebar-overlay')?.classList.toggle('show');
        });
    }

    /* ------------------------------------------------------------ */
    /* FORM DO USUÁRIO                                               */
    /* ------------------------------------------------------------ */
    function wireUserRequestForm() {
        const btn  = $('toggle-request-form-btn');
        const card = $('user-request-card');
        const txt  = $('toggle-request-form-text');

        btn?.addEventListener('click', () => {
            const expanded = card?.classList.toggle('expanded');
            if (txt) txt.textContent = expanded ? 'Fechar Formulário' : 'Abrir Solicitação';
        });

        $$('.form-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.formTab;
                if (target) window.goToFormTab(target);
            });
        });

        $('user-request-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Solicitação enviada! (modo demonstração)');
            e.target.reset();
            card?.classList.remove('expanded');
            if (txt) txt.textContent = 'Abrir Solicitação';
            window.goToFormTab('solicitante');
        });
    }

    window.goToFormTab = function (tab) {
        $$('.form-tab').forEach(t => t.classList.toggle('active', t.dataset.formTab === tab));
        $$('.form-tab-content').forEach(c => c.classList.toggle('active', c.dataset.formContent === tab));
    };

    /* ------------------------------------------------------------ */
    /* MODAIS — fechar por backdrop / ESC                            */
    /* ------------------------------------------------------------ */
    function wireModals() {
        $$('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target !== overlay) return;
                if (overlay.id === 'area-select-modal') return; // escolha obrigatória
                overlay.classList.remove('active');
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const actives = Array.from($$('.modal-overlay.active'));
            if (!actives.length) return;
            const top = actives[actives.length - 1];
            if (top.id === 'area-select-modal') return;
            top.classList.remove('active');
        });
    }

    window.closeModal = function (id) { closeModal(id); };

    window.closeUserModal         = () => closeModal('user-modal');
    window.closePasswordConfirm   = () => closeModal('password-confirm-modal');
    window.closeNotifModal        = () => closeModal('notif-modal');
    window.closeNotifViewModal    = () => closeModal('notif-view-modal');
    window.closeNotifDetail       = () => closeModal('notif-detail-modal');
    window.closeNotifAdminModal   = () => closeModal('notif-admin-modal');
    window.openNotifModal         = () => openModal('notif-modal');
    window.requestAccountDeletion = () => openModal('password-confirm-modal');

    window.openManageDestinations = () => {};
    window.openManageOrigins      = () => {};
    window.openChartBuilder       = () => {};
    window.saveVehicle            = () => {};
    window.saveDriver             = () => {};
    window.saveRequestHours       = () => {};

})();
