// ============================================================
// SSOT · PHONE HELP (v1.0)
// Login/recovery por SMS via Firebase Auth
// ============================================================

import {
    RecaptchaVerifier,
    signInWithPhoneNumber,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

let _auth = null;
let _db = null;
let _confirmationResult = null;
let _verifiedPhone = null;

export function setPhoneHelpContext(auth, db) {
    _auth = auth;
    _db = db;
}

export function openHelpModal() {
    _confirmationResult = null;
    _verifiedPhone = null;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('help-phone-input', '');
    set('help-code-input', '');
    document.getElementById('help-step-phone')?.classList.remove('hidden');
    document.getElementById('help-step-code')?.classList.add('hidden');
    document.getElementById('help-step-result')?.classList.add('hidden');
    document.getElementById('help-error')?.classList.add('hidden');
    window.openModal('help-modal');
    setTimeout(() => document.getElementById('help-phone-input')?.focus(), 300);
}

export function closeHelpModal() {
    window.closeModal('help-modal');
    try { if (window._helpRecaptcha) window._helpRecaptcha.clear(); } catch (e) {}
    window._helpRecaptcha = null;
    _confirmationResult = null;
    _verifiedPhone = null;
}

function normalizePhone(p) {
    return String(p || '').replace(/[^\d+]/g, '');
}

export async function sendHelpCode() {
    const err = document.getElementById('help-error');
    const phone = normalizePhone(document.getElementById('help-phone-input')?.value);
    if (!/^\+\d{10,15}$/.test(phone)) {
        if (err) { err.textContent = 'Informe no formato internacional: +5511999999999'; err.classList.remove('hidden'); }
        return;
    }
    if (!_auth) {
        if (err) { err.textContent = 'Auth não inicializado. Recarregue a página.'; err.classList.remove('hidden'); }
        return;
    }
    if (err) err.classList.add('hidden');

    const btn = document.getElementById('help-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

    try {
        if (!window._helpRecaptcha) {
            const container = document.getElementById('help-recaptcha');
            if (!container) throw new Error('Container reCAPTCHA não encontrado.');
            window._helpRecaptcha = new RecaptchaVerifier(_auth, 'help-recaptcha', {
                size: 'invisible',
                callback: () => {}
            });
        }
        const result = await signInWithPhoneNumber(_auth, phone, window._helpRecaptcha);
        _confirmationResult = result;
        _verifiedPhone = phone;

        document.getElementById('help-step-phone')?.classList.add('hidden');
        document.getElementById('help-step-code')?.classList.remove('hidden');
        document.getElementById('help-code-input')?.focus();
    } catch (e) {
        console.error('[PhoneHelp] send:', e);
        if (err) { err.textContent = 'Falha: ' + (e.message || e.code || 'erro'); err.classList.remove('hidden'); }
        try { if (window._helpRecaptcha) window._helpRecaptcha.clear(); } catch (_) {}
        window._helpRecaptcha = null;
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar Código'; }
    }
}

export async function verifyHelpCode() {
    const err = document.getElementById('help-error');
    const code = (document.getElementById('help-code-input')?.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
        if (err) { err.textContent = 'Código deve ter 6 dígitos.'; err.classList.remove('hidden'); }
        return;
    }
    if (!_confirmationResult) {
        if (err) { err.textContent = 'Sessão expirada. Reenvie o código.'; err.classList.remove('hidden'); }
        return;
    }
    if (err) err.classList.add('hidden');

    const btn = document.getElementById('help-verify-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

    try {
        await _confirmationResult.confirm(code);

        // Busca conta aprovada com este telefone
        let found = null;
        const usersSnap = await get(ref(_db, 'users'));
        if (usersSnap.exists()) {
            const target = normalizePhone(_verifiedPhone);
            usersSnap.forEach(child => {
                if (found) return;
                const u = child.val();
                const uPhone = normalizePhone(u.phone);
                if (!uPhone) return;
                // compara finais (evita erros de formatação)
                const matches = uPhone === target
                    || uPhone.endsWith(target)
                    || target.endsWith(uPhone);
                if (matches && u.active !== false) found = u;
            });
        }

        document.getElementById('help-step-code')?.classList.add('hidden');
        const resultDiv = document.getElementById('help-step-result');
        resultDiv?.classList.remove('hidden');

        if (found && resultDiv) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <svg class="si"><use href="#i-check-circle"/></svg>
                    <div>
                        <strong>Conta encontrada!</strong>
                        <p>O e-mail associado é: <strong>${escapeHtml(found.email || '—')}</strong></p>
                        <p>Use este e-mail para entrar com sua senha.</p>
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn btn-primary btn-block" onclick="closeHelpModal(); goToLogin('user');">
                        <svg class="si"><use href="#i-sign-in"/></svg> Ir para Login
                    </button>
                </div>`;
        } else if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="alert alert-warning">
                    <svg class="si"><use href="#i-alert"/></svg>
                    <div>
                        <strong>Telefone não cadastrado</strong>
                        <p>Este número não está associado a nenhuma conta aprovada. Solicite cadastro.</p>
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn btn-success btn-block" onclick="closeHelpModal(); goToRequerimento();">
                        <svg class="si"><use href="#i-file-signature"/></svg> Solicitar Cadastro
                    </button>
                </div>`;
        }

        try { await signOut(_auth); } catch (e) {}
    } catch (e) {
        console.error('[PhoneHelp] verify:', e);
        if (err) { err.textContent = 'Código inválido ou expirado. Tente novamente.'; err.classList.remove('hidden'); }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Verificar'; }
    }
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.sendHelpCode = sendHelpCode;
window.verifyHelpCode = verifyHelpCode;