// ============================================================
// js/app.js — SSOT
// Destrava a navegação do login e os modais do HTML.
// Substitua os "TODO:" pela sua lógica real (Firebase, etc.).
// ============================================================

// ---------- 1) Sair do loading e mostrar o login ----------
document.addEventListener('DOMContentLoaded', () => {
  const loading = document.getElementById('conn-loading');
  if (loading) loading.remove();          // remove de vez (não só esconde)

  document.getElementById('login-page')?.classList.remove('hidden');
});

// ---------- 2) Tela de login: escolher perfil ----------
window.goToLogin = function (tipo) {
  document.getElementById('screen-select')?.classList.add('hidden');
  document.getElementById('screen-login')?.classList.remove('hidden');

  const title = document.getElementById('login-title');
  const sub   = document.getElementById('login-subtitle');
  if (title) title.textContent = (tipo === 'admin') ? 'Acesso do Setor' : 'Acesso do Usuário';
  if (sub)   sub.textContent   = (tipo === 'admin') ? 'Administração do sistema' : 'Minhas solicitações';

  window.__loginType = tipo;
  document.getElementById('login-error')?.classList.add('hidden');
  document.getElementById('login-info')?.classList.add('hidden');
  setTimeout(() => document.getElementById('username')?.focus(), 50);
};

window.backToSelect = function () {
  document.getElementById('screen-login')?.classList.add('hidden');
  document.getElementById('screen-select')?.classList.remove('hidden');
  document.getElementById('login-form')?.reset();
  document.getElementById('login-error')?.classList.add('hidden');
  document.getElementById('login-info')?.classList.add('hidden');
};

window.openForgotPassword = function (e) {
  if (e) e.preventDefault();
  const info = document.getElementById('login-info');
  if (info) {
    info.textContent = 'Fale com o administrador do sistema para redefinir sua senha.';
    info.classList.remove('hidden');
  }
};

// ---------- 3) Mostrar/ocultar senha (olho) ----------
// Cobre tanto <span class="toggle-password"> (login)
// quanto onclick="togglePass('user-password', this)" (modal).
window.togglePass = function (inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = (input.type === 'password') ? 'text' : 'password';
};

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.toggle-password');
  if (!toggle || toggle.hasAttribute('onclick')) return; // se já tem onclick, deixa pro handler
  const input = toggle.parentElement?.querySelector('input');
  if (!input) return;
  input.type = (input.type === 'password') ? 'text' : 'password';
});

// ---------- 4) Submit do login ----------
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('username')?.value.trim();
    const pass  = document.getElementById('password')?.value;
    const err   = document.getElementById('login-error');

    if (!email || !pass) {
      if (err) { err.textContent = 'Preencha e-mail e senha.'; err.classList.remove('hidden'); }
      return;
    }

    if (err) err.classList.add('hidden');

    // ===== TODO: substituir por autenticação real (Firebase Auth, etc.) =====
    console.log('[app.js] login tentado:', { email, tipo: window.__loginType });

    // Por enquanto, entra direto no app:
    document.getElementById('login-page')?.classList.add('hidden');
    document.getElementById('app-container')?.classList.remove('hidden');
    const areaModal = document.getElementById('area-select-modal');
    if (areaModal) areaModal.style.display = 'flex';
  });
});

// ---------- 5) Seleção de área ----------
window.selectArea = function (area) {
  const m = document.getElementById('area-select-modal');
  if (m) m.style.display = 'none';
  console.log('[app.js] área:', area);
  // TODO: rotear para a área (mostrar abas certas, etc.)
};

window.switchArea = function () {
  const m = document.getElementById('area-select-modal');
  if (m) m.style.display = 'flex';
};

// ---------- 6) Abas admin ----------
window.gotoAdminTab = function (tabId) {
  document.querySelectorAll('#admin-area .tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId)?.classList.add('active');
};

// ---------- 7) Modais genéricos ----------
window.openModal  = function (id) { const m = document.getElementById(id); if (m) m.style.display = 'flex'; };
window.closeModal = function (id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; };

// ---------- 8) Registro ----------
window.openRegistroModal  = function () { window.openModal('registro-modal'); };
window.closeRegistroModal = function () { window.closeModal('registro-modal'); };
window.toggleRegistroDetails = function () {
  const d = document.getElementById('registro-details');
  const b = document.getElementById('registro-details-toggle');
  if (!d) return;
  const aberto = d.style.display !== 'none';
  d.style.display = aberto ? 'none' : 'block';
  if (b) b.textContent = aberto ? 'Ver detalhes' : 'Ocultar detalhes';
};

// ---------- 9) Notificações ----------
window.openNotifModal        = function () { window.openModal('notif-modal'); };
window.closeNotifModal       = function () { window.closeModal('notif-modal'); };
window.closeNotifViewModal   = function () { window.closeModal('notif-view-modal'); };
window.closeNotifDetail      = function () { window.closeModal('notif-detail-modal'); };
window.closeNotifAdminModal  = function () { window.closeModal('notif-admin-modal'); };

// ---------- 10) Usuário / senha ----------
window.closeUserModal       = function () { window.closeModal('user-modal'); };
window.closePasswordConfirm = function () { window.closeModal('password-confirm-modal'); };

// ---------- 11) Form de solicitação (abas internas) ----------
window.goToFormTab = function (tab) {
  document.querySelectorAll('.form-tab').forEach(t => t.classList.toggle('active', t.dataset.formTab === tab));
  document.querySelectorAll('.form-tab-content').forEach(c => c.classList.toggle('active', c.dataset.formContent === tab));
};

// ---------- 12) Botão recolhível do formulário do usuário ----------
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('toggle-request-form-btn');
  const card = document.getElementById('user-request-card');
  const txt = document.getElementById('toggle-request-form-text');
  if (!btn || !card) return;
  btn.addEventListener('click', () => {
    const aberto = card.classList.toggle('expanded');
    if (txt) txt.textContent = aberto ? 'Fechar Formulário' : 'Abrir Solicitação';
  });
});

// ---------- 13) Stubs para o que ainda vai implementar ----------
window.openManageDestinations = function () { console.warn('TODO: gerenciar destinos'); };
window.openManageOrigins      = function () { console.warn('TODO: gerenciar origens'); };
window.openChartBuilder       = function (x) { console.warn('TODO: gráfico dinâmico', x); };
window.saveVehicle            = function () { console.warn('TODO: salvar veículo'); };
window.saveDriver             = function () { console.warn('TODO: salvar motorista'); };
window.saveRequestHours       = function () { console.warn('TODO: salvar horas'); };
window.requestAccountDeletion = function () { window.openModal('password-confirm-modal'); };
