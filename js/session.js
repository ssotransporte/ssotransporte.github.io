// ============================================================
// SSOT - CONTROLE DE SESSÃO E INATIVIDADE
// ============================================================

import { SESSION_IDLE_TIMEOUT, SESSION_WARNING_TIME } from './config.js';

let _idleTimer = null;
let _countdownTimer = null;
let _logoutCallback = null;
let _warningSeconds = 60;
let _isWatching = false;

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'touchmove'];

export function startSessionWatch(onLogout) {
    if (_isWatching) stopSessionWatch();
    _logoutCallback = onLogout;
    _isWatching = true;

    ACTIVITY_EVENTS.forEach(evt => {
        document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    const stayBtn = document.getElementById('session-stay-btn');
    const logoutBtn = document.getElementById('session-logout-btn');
    if (stayBtn) stayBtn.onclick = () => { hideWarning(); resetIdleTimer(); };
    if (logoutBtn) logoutBtn.onclick = () => { hideWarning(); stopSessionWatch(); if (_logoutCallback) _logoutCallback(); };

    resetIdleTimer();
}

export function stopSessionWatch() {
    _isWatching = false;
    if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    ACTIVITY_EVENTS.forEach(evt => document.removeEventListener(evt, resetIdleTimer));
    hideWarning();
    _logoutCallback = null;
}

function resetIdleTimer() {
    if (!_isWatching) return;
    if (_idleTimer) clearTimeout(_idleTimer);
    hideWarning();
    _idleTimer = setTimeout(showWarning, SESSION_IDLE_TIMEOUT);
}

function showWarning() {
    const modal = document.getElementById('session-modal');
    if (!modal) return;
    modal.classList.add('active');

    _warningSeconds = Math.floor(SESSION_WARNING_TIME / 1000);
    const countdownEl = document.getElementById('session-countdown');
    if (countdownEl) countdownEl.textContent = _warningSeconds;

    if (_countdownTimer) clearInterval(_countdownTimer);
    _countdownTimer = setInterval(() => {
        _warningSeconds--;
        if (countdownEl) countdownEl.textContent = _warningSeconds;
        if (_warningSeconds <= 0) {
            clearInterval(_countdownTimer);
            _countdownTimer = null;
            hideWarning();
            forceLogout();
        }
    }, 1000);
}

function hideWarning() {
    const modal = document.getElementById('session-modal');
    if (modal) modal.classList.remove('active');
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
}

function forceLogout() {
    stopSessionWatch();
    if (_logoutCallback) _logoutCallback();
}