// js/app.js
document.addEventListener('DOMContentLoaded', function () {
  // 1. Esconde a tela "Conectando..."
  const loading = document.getElementById('conn-loading');
  if (loading) loading.style.display = 'none';

  // 2. Mostra a página de login
  const loginPage = document.getElementById('login-page');
  if (loginPage) loginPage.classList.remove('hidden');
});

// ===== Funções globais que o HTML chama via onclick =====
window.selectArea = function (area) {
  const modal = document.getElementById('area-select-modal');
  if (modal) modal.style.display = 'none';

  document.getElementById('login-page')?.classList.add('hidden');
  document.getElementById('app-container')?.classList.remove('hidden');
  // depois você liga o roteamento real (dashboard, solicitacoes, etc.)
};

window.switchArea = function () {
  document.getElementById('app-container')?.classList.add('hidden');
  document.getElementById('login-page')?.classList.remove('hidden');
};

window.openRegistroModal = function () {
  document.getElementById('registro-modal').style.display = 'flex';
};
window.closeRegistroModal = function () {
  document.getElementById('registro-modal').style.display = 'none';
};

// Demais funções citadas no HTML (placeholders até você implementar):
window.gotoAdminTab = function (id) { /* ... */ };
window.goToLogin = function (tipo) { /* ... */ };
window.backToSelect = function () { /* ... */ };
window.openChartBuilder = function (x) { /* ... */ };
window.openManageDestinations = function () { /* ... */ };
window.openManageOrigins = function () { /* ... */ };
window.toggleRegistroDetails = function () { /* ... */ };
window.closePasswordConfirm = function () { /* ... */ };
window.closeModal = function (id) {
  document.getElementById(id)?.style && (document.getElementById(id).style.display = 'none');
};
window.closeUserModal = function () { /* ... */ };
window.togglePass = function (id, el) { /* ... */ };