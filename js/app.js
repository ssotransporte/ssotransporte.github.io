/* ============================================================================
   SSOT — js/app.js
   Motor de navegação da UI (loading → login → módulos → abas → modais).
   Substitua os "TODO:" pela sua integração real (Firebase etc.).
   ============================================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* HELPERS                                                             */
  /* ------------------------------------------------------------------ */
  const $  = (id) => document.getElementById(id);
  const $$ = (sel, root) => (root || document).querySelectorAll(sel);

  function showEl(el) { if (el) { el.classList.remove('hidden'); el.style.removeProperty('display'); } }
  function hideEl(el) { if (el) el.classList.add('hidden'); }

  function setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    el.style.removeProperty('display');
  }

  function showAlert(id, msg, type) {
    const el = $(id);
    if (!el) return;
    el.className = 'alert alert-' + (type || 'danger');
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function clearAlert(id) { const el = $(id); if (el) el.classList.add('hidden'); }

  /* ------------------------------------------------------------------ */
  /* SISTEMA DE MODAIS (tolerante a qualquer CSS)                        */
  /* ------------------------------------------------------------------ */
  function openModal(id) {
    const m = $(id);
    if (!m) return;
    m.classList.add('active', 'show', 'visible', 'open', 'modal-open');
    m.style.setProperty('display', 'flex', 'important');
    m.style.setProperty('visibility', 'visible', 'important');
    m.style.setProperty('opacity', '1', 'important');
    m.style.setProperty('pointer-events', 'auto', 'important');
    m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(id) {
    const m = $(id);
    if (!m) return;
    m.classList.remove('active', 'show', 'visible', 'open', 'modal-open');
    m.style.setProperty('display', 'none', 'important');
    m.setAttribute('aria-hidden', 'true');
    // Se nenhum outro modal está aberto, remove classe do body
    const anyOpen = Array.from($$('.modal-overlay'))
      .some((el) => getComputedStyle(el).display !== 'none' && el !== m);
    if (!anyOpen) document.body.classList.remove('modal-open');
  }

  function isModalVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 &&
           cs.display !== 'none' &&
           cs.visibility !== 'hidden' &&
           parseFloat(cs.opacity) > 0.01;
  }

  /* ------------------------------------------------------------------ */
  /* BOOT                                                                */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    // 1) Tira a tela "Conectando..."
    const loading = $('conn-loading');
    if (loading) loading.remove();

    // 2) Mostra o login
    setVisible($('login-page'), true);
    setVisible($('app-container'), false);

    // 3) Liga os formulários e botões ID-based
    wireLoginForm();
    wireUserRequestForm();
    wireHeaderButtons();
    wireGlobalClicks();

    // Foco inicial
    setTimeout(() => $('username')?.focus(), 100);
  });

  /* ------------------------------------------------------------------ */
  /* LOGIN                                                               */
  /* ------------------------------------------------------------------ */
  function wireLoginForm() {
    const form = $('login-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = ($('username')?.value || '').trim();
      const pass  = ($('password')?.value || '');
      clearAlert('login-error');

      if (!email || !pass) {
        showAlert('login-error', 'Preencha e-mail e senha.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('login-error', 'Informe um e-mail válido.');
        return;
      }

      // ===== TODO: autenticação real (Firebase Auth) =====
      // Mock: quem tem "admin" ou "setor" no e-mail vira admin, resto vira user.
      const lower = email.toLowerCase();
      const role = (lower.includes('admin') || lower.includes('setor')) ? 'admin' : 'user';

      window.__currentUser = {
        email,
        name: email.split('@')[0],
        role
      };

      enterApp();
    });
  }

  window.goToLogin = function (tipo) {
    setVisible($('screen-select'), false);
    setVisible($('screen-login'),  true);
    const t = $('login-title'); const s = $('login-subtitle');
    if (t) t.textContent = tipo === 'admin' ? 'Acesso do Setor' : 'Acesso do Usuário';
    if (s) s.textContent = tipo === 'admin' ? 'Administração do sistema' : 'Minhas solicitações';
    window.__loginType = tipo;
    clearAlert('login-error'); clearAlert('login-info');
    setTimeout(() => $('username')?.focus(), 50);
  };

  window.backToSelect = function () {
    setVisible($('screen-login'), false);
    setVisible($('screen-select'), true);
    $('login-form')?.reset();
    clearAlert('login-error'); clearAlert('login-info');
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

  window.togglePass = function (inputId) {
    const input = $(inputId);
    if (!input) return;
    input.type = (input.type === 'password') ? 'text' : 'password';
  };

  /* ------------------------------------------------------------------ */
  /* ENTRAR NO APP                                                       */
  /* ------------------------------------------------------------------ */
  function enterApp() {
    // Sai do login
    setVisible($('login-page'), false);
    // Entra no app
    setVisible($('app-container'), true);

    // Popula cabeçalho + menu
    renderUserInfo();
    renderNav();

    // Mostra uma aba padrão IMEDIATAMENTE (fallback seguro)
    const isAdmin = isAdminUser();
    selectAreaInternal(isAdmin ? 'operacoes' : 'solicitacoes');

    // Em seguida tenta exibir o modal "Selecione o módulo"
    const modal = $('area-select-modal');
    if (modal) {
      openModal('area-select-modal');
      // Se por algum motivo o modal não ficou visível, o app já está utilizável por baixo
      setTimeout(() => {
        if (!isModalVisible(modal)) {
          closeModal('area-select-modal');
        }
      }, 120);
    }
  }

  window.switchArea = function () {
    openModal('area-select-modal');
  };

  /* ------------------------------------------------------------------ */
  /* SELECIONAR ÁREA (chamado pelo modal)                                */
  /* ------------------------------------------------------------------ */
  window.selectArea = function (area) {
    closeModal('area-select-modal');
    selectAreaInternal(area);
  };

  function selectAreaInternal(area) {
    const isAdmin = isAdminUser();

    hideEl($('user-area'));
    hideEl($('admin-area'));

    if (isAdmin) {
      showEl($('admin-area'));
      // Aba padrão
      activateTab('admin-dashboard-tab', null, true);
    } else {
      showEl($('user-area'));
      activateTab('user-solicitacoes-tab', null, true);
    }

    // Botão "Trocar Área" fica visível dentro do app
    const switchBtn = $('area-switch-btn');
    if (switchBtn) switchBtn.classList.remove('hidden');

    // Breadcrumb + título
    const bc = $('breadcrumb-area');
    if (bc) bc.textContent = area === 'operacoes' ? 'Operações' : 'Solicitações';
  }

  function isAdminUser() {
    const u = window.__currentUser;
    return !!u && (u.role === 'admin' || u.role === 'setor');
  }

  /* ------------------------------------------------------------------ */
  /* MENU DINÂMICO                                                       */
  /* ------------------------------------------------------------------ */
  function renderNav() {
    const list = $('top-menu-list');
    if (!list) return;
    list.innerHTML = '';

    const isAdmin = isAdminUser();

    const tabs = isAdmin ? [
      { id: 'admin-dashboard-tab',   label: 'Dashboard',      icon: 'i-chart-line'    },
      { id: 'admin-solicitacoes-tab',label: 'Solicitações',   icon: 'i-clipboard'     },
      { id: 'admin-usuarios-tab',    label: 'Usuários',       icon: 'i-users-cog'     },
      { id: 'admin-agenda-tab',      label: 'Agenda',         icon: 'i-calendar-check'},
      { id: 'admin-frota-tab',       label: 'Frota',          icon: 'i-truck'         },
      { id: 'admin-relatorios-tab',  label: 'Relatórios',     icon: 'i-chart-bar'     },
      { id: 'admin-historico-tab',   label: 'Histórico',      icon: 'i-history'       },
      { id: 'admin-lixeira-tab',     label: 'Lixeira',        icon: 'i-trash'         },
      { id: 'admin-perfil-tab',      label: 'Perfil',         icon: 'i-user'          },
      { id: 'admin-servicos-tab',    label: 'Configurações',  icon: 'i-cog'           }
    ] : [
      { id: 'user-solicitacoes-tab', label: 'Solicitações',   icon: 'i-clipboard'     },
      { id: 'user-perfil-tab',       label: 'Perfil',         icon: 'i-user'          }
    ];

    tabs.forEach((t, i) => {
      const li  = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'top-menu-item' + (i === 0 ? ' active' : '');
      btn.dataset.tab = t.id;
      btn.innerHTML =
        '<svg class="si si-fw"><use href="#' + t.icon + '"/></svg> ' +
        '<span>' + t.label + '</span>';
      btn.addEventListener('click', () => activateTab(t.id, btn, false));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderUserInfo() {
    const u = window.__currentUser;
    if (!u) return;
    const av = $('user-avatar');
    const nm = $('current-user');
    const rl = $('user-role');
    if (av) av.textContent = (u.name || 'U').charAt(0).toUpperCase();
    if (nm) nm.textContent = u.name;
    if (rl) rl.textContent =
      u.role === 'admin' ? 'Administrador' :
      u.role === 'setor' ? 'Setor' : 'Usuário';
  }

  /* ------------------------------------------------------------------ */
  /* TROCA DE ABA                                                        */
  /* ------------------------------------------------------------------ */
  function activateTab(tabId, btnEl, silent) {
    // Achar a aba dentro da área correta (user ou admin)
    const tab = $(tabId);
    if (!tab) return;

    // Desativa todas as tabs do MESMO grupo
    const group = tab.closest('#user-area') ? '#user-area' : '#admin-area';
    $$(group + ' .tab-content').forEach((t) => t.classList.remove('active'));

    // Ativa a escolhida
    tab.classList.add('active');

    // Atualiza botão do menu
    if (!silent) {
      $$('.top-menu-item').forEach((b) => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');
      else {
        const found = Array.from($$('.top-menu-item')).find((b) => b.dataset.tab === tabId);
        if (found) found.classList.add('active');
      }
    }

    // Atualiza título da página
    const titleEl = $('page-title');
    if (titleEl && btnEl) {
      const lbl = btnEl.querySelector('span')?.textContent;
      if (lbl) titleEl.textContent = lbl;
    }
  }

  window.gotoAdminTab = function (tabId) {
    activateTab(tabId, null, false);
  };

  /* ------------------------------------------------------------------ */
  /* BOTÕES DO HEADER (fora dos onclick do HTML)                        */
  /* ------------------------------------------------------------------ */
  function wireHeaderButtons() {
    // Logout
    const logout = $('logout-btn');
    if (logout) logout.addEventListener('click', doLogout);

    // Sino de notificações
    const bell = $('notif-bell-btn');
    if (bell) bell.addEventListener('click', () => openModal('notif-view-modal'));

    // Avatar → perfil
    const userInfo = $('user-info-trigger');
    if (userInfo) {
      userInfo.addEventListener('click', () => {
        activateTab(isAdminUser() ? 'admin-perfil-tab' : 'user-perfil-tab', null, false);
      });
    }

    // Menu mobile
    const mob = $('mobile-menu-toggle');
    if (mob) {
      mob.addEventListener('click', () => {
        $('main-nav')?.classList.toggle('open');
        $('sidebar-overlay')?.classList.toggle('show');
      });
    }
  }

  function doLogout() {
    window.__currentUser = null;
    window.__loginType = null;

    // Some com o app, volta pro login
    setVisible($('app-container'), false);
    setVisible($('login-page'), true);
    setVisible($('screen-login'), false);
    setVisible($('screen-select'), true);

    // Limpa menus e conteúdo
    const list = $('top-menu-list');
    if (list) list.innerHTML = '';

    $('login-form')?.reset();
    clearAlert('login-error'); clearAlert('login-info');

    // Fecha modais abertos
    $$('.modal-overlay').forEach((m) => closeModal(m.id));
  }

  /* ------------------------------------------------------------------ */
  /* FORMULÁRIO DE SOLICITAÇÃO (área do usuário)                         */
  /* ------------------------------------------------------------------ */
  function wireUserRequestForm() {
    // Toggle do card recolhível
    const toggleBtn = $('toggle-request-form-btn');
    const card      = $('user-request-card');
    const toggleTxt = $('toggle-request-form-text');
    if (toggleBtn && card) {
      toggleBtn.addEventListener('click', () => {
        const open = card.classList.toggle('expanded');
        if (toggleTxt) toggleTxt.textContent = open ? 'Fechar Formulário' : 'Abrir Solicitação';
      });
    }

    // Abas internas
    $$('.form-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.formTab;
        if (target) window.goToFormTab(target);
      });
    });

    // Submit
    const form = $('user-request-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        // ===== TODO: enviar ao Firebase =====
        alert('Solicitação enviada! (modo demonstração)');
        form.reset();
        card?.classList.remove('expanded');
        if (toggleTxt) toggleTxt.textContent = 'Abrir Solicitação';
        window.goToFormTab('solicitante');
      });
    }
  }

  window.goToFormTab = function (tab) {
    $$('.form-tab').forEach((t) => t.classList.toggle('active', t.dataset.formTab === tab));
    $$('.form-tab-content').forEach((c) => c.classList.toggle('active', c.dataset.formContent === tab));
  };

  /* ------------------------------------------------------------------ */
  /* CLIQUES GLOBAIS (fechar modal clicando fora / ESC)                 */
  /* ------------------------------------------------------------------ */
  function wireGlobalClicks() {
    // Fecha modal ao clicar no backdrop
    $$('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });

    // ESC fecha o modal do topo
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const abertos = Array.from($$('.modal-overlay')).filter(isModalVisible);
      if (abertos.length) closeModal(abertos[abertos.length - 1].id);
    });
  }

  /* ------------------------------------------------------------------ */
  /* MODAIS GENÉRICOS                                                    */
  /* ------------------------------------------------------------------ */
  window.openModal  = openModal;
  window.closeModal = closeModal;

  // Registro
  window.openRegistroModal  = () => openModal('registro-modal');
  window.closeRegistroModal = () => closeModal('registro-modal');
  window.toggleRegistroDetails = function () {
    const d = $('registro-details');
    const b = $('registro-details-toggle');
    if (!d) return;
    const aberto = d.style.display !== 'none';
    d.style.display = aberto ? 'none' : 'block';
    if (b) b.textContent = aberto ? 'Ver detalhes' : 'Ocultar detalhes';
  };

  // Notificações
  window.openNotifModal       = () => openModal('notif-modal');
  window.closeNotifModal      = () => closeModal('notif-modal');
  window.closeNotifViewModal  = () => closeModal('notif-view-modal');
  window.closeNotifDetail     = () => closeModal('notif-detail-modal');
  window.closeNotifAdminModal = () => closeModal('notif-admin-modal');

  // Usuário / senha
  window.closeUserModal       = () => closeModal('user-modal');
  window.closePasswordConfirm = () => closeModal('password-confirm-modal');
  window.requestAccountDeletion = () => openModal('password-confirm-modal');

  /* ------------------------------------------------------------------ */
  /* STUBS (para o HTML parar de dar ReferenceError)                    */
  /* ------------------------------------------------------------------ */
  window.openManageDestinations = () => console.warn('[SSOT] TODO: gerenciar destinos');
  window.openManageOrigins      = () => console.warn('[SSOT] TODO: gerenciar origens');
  window.openChartBuilder       = (t) => console.warn('[SSOT] TODO: chart builder', t);
  window.saveVehicle            = () => console.warn('[SSOT] TODO: salvar veículo');
  window.saveDriver             = () => console.warn('[SSOT] TODO: salvar motorista');
  window.saveRequestHours       = () => console.warn('[SSOT] TODO: salvar horas');

})();
