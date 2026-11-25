// ============================================================
// SSOT · Página de Ajuda — Recuperação de Conta
// Fluxos:
//  - E-mail: Firebase sendPasswordResetEmail
//  - SMS: Firebase Phone Auth (instância secundária) → lookup em /users
// ============================================================

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getAuth,
    sendPasswordResetEmail,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getDatabase, ref, get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from './firebase-config.js';

// ============================================================
// ESTADO
// ============================================================
let _app = null;
let _auth = null;
let _db = null;

let _smsApp = null;
let _smsAuth = null;

let _confirmationResult = null;
let _verifiedPhone = null;
let _recaptchaVerifier = null;
let _resendTimer = null;
let _resendSeconds = 0;

let _emailCooldown = 0;
let _emailTimer = null;

// ============================================================
// INIT
// ============================================================
function init() {
    try {
        _app = initializeApp(firebaseConfig);
        _auth = getAuth(_app);
        _db = getDatabase(_app);
    } catch (err) {
        console.error('[Ajuda] Erro ao inicializar Firebase:', err);
        showAlert('email', 'Não foi possível conectar. Recarregue a página.', 'danger');
        return;
    }
    setupTabs();
    setupEmailForm();
    setupSmsFlow();
}

// ============================================================
// TABS
// ============================================================
function setupTabs() {
    document.querySelectorAll('.help-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.help-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${target}`)?.classList.add('active');
            setTimeout(() => {
                const input = document.querySelector(`#panel-${target} input`);
                if (input) input.focus();
            }, 100);
        });
    });
}

// ============================================================
// HELPERS DE UI
// ============================================================
function showAlert(panel, message, type = 'info') {
    const el = document.getElementById(`${panel}-alert`);
    if (!el) return;
    el.className = `help-alert ${type}`;
    el.textContent = message;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideAlert(panel) {
    const el = document.getElementById(`${panel}-alert`);
    if (el) el.classList.add('hidden');
}
function setLoading(btn, loading, originalHTML) {
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = 'Aguarde...';
    } else {
        btn.disabled = false;
        btn.innerHTML = originalHTML || btn.dataset.originalHtml || 'Enviar';
    }
}

// ============================================================
// ============ FLUXO E-MAIL ==================================
// ============================================================
function setupEmailForm() {
    const form = document.getElementById('form-email');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSendEmail();
    });
}

async function handleSendEmail() {
    hideAlert('email');
    const emailInput = document.getElementById('email-input');
    const sendBtn = document.getElementById('email-send-btn');
    const successBox = document.getElementById('email-success');
    const form = document.getElementById('form-email');
    const email = (emailInput?.value || '').trim().toLowerCase();

    if (!email) { showAlert('email', 'Informe seu e-mail.', 'warning'); emailInput?.focus(); return; }
    if (!isValidEmail(email)) { showAlert('email', 'Formato de e-mail inválido.', 'warning'); emailInput?.focus(); return; }
    if (_emailCooldown > 0) { showAlert('email', `Aguarde ${_emailCooldown}s antes de tentar novamente.`, 'warning'); return; }

    setLoading(sendBtn, true);
    const originalHTML = sendBtn.dataset.originalHtml;

    try {
        await sendPasswordResetEmail(_auth, email);
        form.classList.add('hidden');
        successBox.classList.remove('hidden');
        document.getElementById('email-success-address').textContent = `Enviado para: ${email}`;
        startEmailCooldown(60);
    } catch (err) {
        console.error('[Ajuda] Email reset:', err);
        const msg = mapEmailError(err);
        showAlert('email', msg, err.code === 'auth/user-not-found' ? 'warning' : 'danger');
        if (err.code === 'auth/too-many-requests') startEmailCooldown(120);
    } finally {
        setLoading(sendBtn, false, originalHTML);
    }
}

function mapEmailError(err) {
    const map = {
        'auth/invalid-email': 'E-mail com formato inválido.',
        'auth/user-not-found': 'Este e-mail não está cadastrado no sistema. Se você solicitou cadastro recentemente, aguarde aprovação.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
        'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
        'auth/operation-not-allowed': 'Recuperação por e-mail indisponível. Contate o administrador.'
    };
    return map[err.code] || 'Não foi possível enviar o link. Tente novamente.';
}

function startEmailCooldown(seconds) {
    _emailCooldown = seconds;
    if (_emailTimer) clearInterval(_emailTimer);
    _emailTimer = setInterval(() => {
        _emailCooldown--;
        if (_emailCooldown <= 0) { clearInterval(_emailTimer); _emailTimer = null; _emailCooldown = 0; }
    }, 1000);
}

// ============================================================
// ============ FLUXO SMS =====================================
// ============================================================
function setupSmsFlow() {
    const sendBtn = document.getElementById('sms-send-btn');
    const verifyBtn = document.getElementById('sms-verify-btn');
    const resendBtn = document.getElementById('sms-resend-btn');
    const codeInput = document.getElementById('code-input');

    sendBtn?.addEventListener('click', handleSendSms);
    verifyBtn?.addEventListener('click', handleVerifyCode);
    resendBtn?.addEventListener('click', handleResendSms);

    codeInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleVerifyCode(); }
    });
    codeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });

    // ---- máscara simples no input de telefone ----
    const phoneInput = document.getElementById('phone-input');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
            let formatted = '';
            if (digits.length > 0) formatted = '(' + digits.slice(0, 2);
            if (digits.length >= 3) formatted += ') ' + digits.slice(2, digits.length <= 10 ? 6 : 7);
            if (digits.length > (digits.length <= 10 ? 6 : 7)) {
                formatted += '-' + digits.slice(digits.length <= 10 ? 6 : 7);
            }
            e.target.value = formatted;
        });
    }
}

async function ensureSmsAuth() {
    if (_smsAuth) return _smsAuth;
    const name = 'ajuda-sms-' + Date.now();
    _smsApp = initializeApp(firebaseConfig, name);
    _smsAuth = getAuth(_smsApp);
    return _smsAuth;
}

async function cleanupSmsAuth() {
    try { if (_smsAuth) await signOut(_smsAuth); } catch (e) {}
    try { if (_smsApp) await deleteApp(_smsApp); } catch (e) {}
    _smsApp = null;
    _smsAuth = null;
    try { if (_recaptchaVerifier) _recaptchaVerifier.clear(); } catch (e) {}
    _recaptchaVerifier = null;
    _confirmationResult = null;
}

// ============================================================
// TELEFONE — entrada SIMPLES, saída E.164 para o Firebase
// Aceita: "(11) 99999-9999", "11999999999", "5511999999999",
//         "+55 (11) 99999-9999", "+5511999999999", etc.
// ============================================================
function normalizePhone(p) {
    let digits = String(p || '').replace(/\D/g, '');
    if (!digits) return '';
    digits = digits.replace(/^0+/, '');
    if (!digits) return '';

    // Se tem 10 ou 11 dígitos → DDD + número (Brasil). Prefixa +55.
    // Se tem 12 ou 13 dígitos e começa com 55 → já tem DDI, mantém.
    if (digits.length === 10 || digits.length === 11) {
        digits = '55' + digits;
    } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
        // já está em E.164
    } else if (digits.length > 13) {
        // corta possíveis sobras
        digits = digits.slice(-13);
        if (!digits.startsWith('55')) return '';
    } else if (!digits.startsWith('55')) {
        return '';
    }

    if (!/^55\d{10,11}$/.test(digits)) return '';
    return '+' + digits;
}

/** Exibe o telefone no formato brasileiro simples */
function formatPhoneDisplay(p) {
    const digits = String(p || '').replace(/\D/g, '');
    const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    return local;
}

async function handleSendSms() {
    hideAlert('sms');
    const phoneInput = document.getElementById('phone-input');
    const sendBtn = document.getElementById('sms-send-btn');
    const originalHTML = sendBtn?.innerHTML;

    const rawValue = (phoneInput?.value || '').trim();
    const digits = rawValue.replace(/\D/g, '');

    if (digits.length < 10 || digits.length > 13) {
        showAlert('sms', 'Telefone inválido. Use DDD + número. Ex: (11) 99999-9999', 'warning');
        phoneInput?.focus();
        return;
    }

    const phone = normalizePhone(rawValue);
    if (!phone) {
        showAlert('sms', 'Telefone inválido. Use DDD + número. Ex: (11) 99999-9999', 'warning');
        phoneInput?.focus();
        return;
    }

    if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = 'Enviando SMS...'; }

    try {
        const smsAuth = await ensureSmsAuth();

        if (!_recaptchaVerifier) {
            const container = document.getElementById('help-recaptcha');
            if (!container) throw new Error('Container reCAPTCHA não encontrado.');
            _recaptchaVerifier = new RecaptchaVerifier(smsAuth, 'help-recaptcha', {
                size: 'invisible',
                callback: () => {},
                'expired-callback': () => {
                    try { _recaptchaVerifier.clear(); } catch (e) {}
                    _recaptchaVerifier = null;
                }
            });
        }

        const result = await signInWithPhoneNumber(smsAuth, phone, _recaptchaVerifier);
        _confirmationResult = result;
        _verifiedPhone = phone;

        document.getElementById('sms-step-phone').classList.add('hidden');
        document.getElementById('sms-step-code').classList.remove('hidden');
        document.getElementById('sms-step-result').classList.add('hidden');
        document.getElementById('sms-phone-shown').textContent = formatPhoneDisplay(phone);

        document.getElementById('code-input')?.focus();
        startResendCooldown(60);
    } catch (err) {
        console.error('[Ajuda] SMS send:', err);
        const msg = mapSmsSendError(err);
        showAlert('sms', msg, 'danger');
        try { if (_recaptchaVerifier) _recaptchaVerifier.clear(); } catch (e) {}
        _recaptchaVerifier = null;
    } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = originalHTML; }
    }
}

function mapSmsSendError(err) {
    const map = {
        'auth/invalid-phone-number': 'Telefone inválido. Verifique o DDD e o número.',
        'auth/too-many-requests': 'Muitas tentativas de envio. Aguarde alguns minutos.',
        'auth/quota-exceeded': 'Cota de SMS diária excedida. Tente novamente amanhã.',
        'auth/captcha-check-failed': 'Verificação de segurança falhou. Recarregue a página.',
        'auth/operation-not-allowed': 'Login por SMS não está habilitado. Contate o administrador.',
        'auth/network-request-failed': 'Sem conexão. Verifique sua internet.'
    };
    return map[err.code] || 'Não foi possível enviar o SMS. Verifique o número e tente novamente.';
}

async function handleResendSms() {
    if (_resendSeconds > 0) return;
    hideAlert('sms');
    const resendBtn = document.getElementById('sms-resend-btn');
    if (resendBtn) resendBtn.disabled = true;
    try {
        await cleanupSmsAuth();
        await handleSendSms();
    } catch (err) {
        console.error('[Ajuda] Resend:', err);
    } finally {
        if (resendBtn) resendBtn.disabled = false;
    }
}

function startResendCooldown(seconds) {
    _resendSeconds = seconds;
    const countEl = document.getElementById('sms-resend-count');
    const resendBtn = document.getElementById('sms-resend-btn');
    if (resendBtn) resendBtn.disabled = true;
    if (countEl) countEl.textContent = _resendSeconds;
    if (_resendTimer) clearInterval(_resendTimer);
    _resendTimer = setInterval(() => {
        _resendSeconds--;
        if (countEl) countEl.textContent = Math.max(0, _resendSeconds);
        if (_resendSeconds <= 0) {
            clearInterval(_resendTimer);
            _resendTimer = null;
            if (resendBtn) resendBtn.disabled = false;
        }
    }, 1000);
}

async function handleVerifyCode() {
    hideAlert('sms');
    const codeInput = document.getElementById('code-input');
    const verifyBtn = document.getElementById('sms-verify-btn');
    const originalHTML = verifyBtn?.innerHTML;
    const code = (codeInput?.value || '').trim();

    if (!/^\d{6}$/.test(code)) { showAlert('sms', 'O código deve ter 6 dígitos.', 'warning'); codeInput?.focus(); return; }
    if (!_confirmationResult) { showAlert('sms', 'Sessão expirada. Reenvie o código.', 'warning'); return; }

    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.innerHTML = 'Verificando...'; }

    try {
        await _confirmationResult.confirm(code);
        const account = await findAccountByPhone(_verifiedPhone);
        await cleanupSmsAuth();
        document.getElementById('sms-step-phone').classList.add('hidden');
        document.getElementById('sms-step-code').classList.add('hidden');
        renderSmsResult(account);
    } catch (err) {
        console.error('[Ajuda] Verify:', err);
        const map = {
            'auth/invalid-verification-code': 'Código incorreto. Verifique e tente novamente.',
            'auth/code-expired': 'Código expirado. Solicite um novo SMS.',
            'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
            'auth/session-expired': 'Sessão expirada. Reenvie o código.'
        };
        showAlert('sms', map[err.code] || 'Código inválido ou expirado. Tente novamente.', 'danger');
        codeInput?.focus();
    } finally {
        if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerHTML = originalHTML; }
    }
}

async function findAccountByPhone(phone) {
    try {
        const target = normalizePhone(phone);
        const snap = await get(ref(_db, 'users'));
        if (!snap.exists()) return null;
        let found = null;
        snap.forEach(child => {
            if (found) return;
            const u = child.val();
            if (!u || u.active === false) return;
            const uPhone = normalizePhone(u.phone || '');
            if (!uPhone) return;
            if (uPhone === target) found = u;
        });
        return found;
    } catch (err) {
        console.error('[Ajuda] findAccountByPhone:', err);
        return null;
    }
}

function renderSmsResult(account) {
    const container = document.getElementById('sms-step-result');
    if (!container) return;
    container.classList.remove('hidden');

    if (account && account.email) {
        container.innerHTML = `
            <div class="sms-result-card found">
                <div class="sms-result-icon">
                    <svg class="si si-2x"><use href="#i-check-circle"/></svg>
                </div>
                <h3>Conta encontrada!</h3>
                <p>O telefone verificado está associado à conta:</p>
                <div class="sms-result-email">${escapeHtml(account.email)}</div>
                <p style="font-size:0.82rem;color:#5a6b7d;margin-bottom:0;">
                    Clique abaixo para receber um <strong>link de recuperação</strong> nesse e-mail.
                </p>
                <div class="sms-result-actions">
                    <button type="button" class="help-btn-primary help-btn-success" id="sms-reset-email-btn">
                        <svg class="si"><use href="#i-send"/></svg>
                        Enviar link de recuperação
                    </button>
                    <button type="button" class="help-btn-secondary" onclick="window.location.href='index.html'">
                        <svg class="si"><use href="#i-sign-in"/></svg>
                        Ir para Login
                    </button>
                </div>
            </div>
        `;
        document.getElementById('sms-reset-email-btn')?.addEventListener('click', async () => {
            await sendResetToAccount(account.email);
        });
    } else {
        container.innerHTML = `
            <div class="sms-result-card notfound">
                <div class="sms-result-icon">
                    <svg class="si si-2x"><use href="#i-alert"/></svg>
                </div>
                <h3>Telefone não cadastrado</h3>
                <p>Este número não está associado a nenhuma conta ativa no SSOT.</p>
                <p style="font-size:0.82rem;color:#5a6b7d;">
                    Se você ainda não tem acesso, solicite um cadastro.
                </p>
                <div class="sms-result-actions">
                    <button type="button" class="help-btn-primary" onclick="window.location.href='index.html'">
                        <svg class="si"><use href="#i-user"/></svg>
                        Solicitar Cadastro
                    </button>
                    <button type="button" class="help-btn-secondary" onclick="window.location.reload()">
                        <svg class="si"><use href="#i-refresh"/></svg>
                        Tentar outro número
                    </button>
                </div>
            </div>
        `;
    }
}

async function sendResetToAccount(email) {
    const btn = document.getElementById('sms-reset-email-btn');
    if (!btn) return;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Enviando...';
    try {
        await sendPasswordResetEmail(_auth, email);
        const container = document.getElementById('sms-step-result');
        if (container) {
            container.innerHTML = `
                <div class="help-success-box">
                    <div class="help-success-icon">
                        <svg class="si si-2x"><use href="#i-check-circle"/></svg>
                    </div>
                    <h3>Link enviado!</h3>
                    <p>Verifique a caixa de entrada do e-mail <strong>${escapeHtml(email)}</strong> e a pasta de <strong>spam</strong>.</p>
                    <p class="help-small">O link é válido por 1 hora.</p>
                    <button type="button" class="help-btn-primary" onclick="window.location.href='index.html'">
                        <svg class="si"><use href="#i-sign-in"/></svg>
                        Ir para Login
                    </button>
                </div>
            `;
        }
    } catch (err) {
        console.error('[Ajuda] Reset via SMS:', err);
        const msg = mapEmailError(err);
        showAlert('sms', msg, 'danger');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

// ============================================================
// HELPERS
// ============================================================
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}
function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// START
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
window.addEventListener('beforeunload', () => { cleanupSmsAuth(); });