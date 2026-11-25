// ============================================================
// SSOT - AUTENTICAÇÃO
// ============================================================

import {
    getAuth, signInWithEmailAndPassword, signOut,
    createUserWithEmailAndPassword, sendPasswordResetEmail,
    reauthenticateWithCredential, EmailAuthProvider,
    updatePassword, deleteUser as fbDeleteUser,
    GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
    initializeApp, deleteApp, getApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import { firebaseConfig } from './firebase-config.js';

function getOrInitApp() {
    try { return getApp(); }
    catch (e) { return initializeApp(firebaseConfig); }
}

export function getAuthInstance() { return getAuth(getOrInitApp()); }

export async function loginUser(email, password) {
    const auth = getAuthInstance();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
}

export async function logoutUser() {
    const auth = getAuthInstance();
    await signOut(auth);
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function loginWithGoogle() {
    const auth = getAuthInstance();
    const result = await signInWithPopup(auth, googleProvider);
    return { user: result.user, isNewUser: result._tokenResponse?.isNewUser || false };
}

export async function createUserSafely(email, password) {
    const name = 'sec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    let secondaryApp = null;

    try {
        secondaryApp = initializeApp(firebaseConfig, name);
        const secondaryAuth = getAuth(secondaryApp);
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const uid = cred.user.uid;
        await signOut(secondaryAuth);
        return uid;
    } finally {
        if (secondaryApp) { try { await deleteApp(secondaryApp); } catch (e) {} }
    }
}

export async function verifyCurrentPassword(password) {
    const auth = getAuthInstance();
    const user = auth.currentUser;
    if (!user) return false;

    const isGoogle = user.providerData.some(p => p.providerId === 'google.com');
    const hasPassword = user.providerData.some(p => p.providerId === 'password');

    if (isGoogle && !hasPassword) return !password;
    if (!user.email) return false;

    try {
        const cred = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, cred);
        return true;
    } catch (err) {
        return false;
    }
}

export async function sendReset(email) {
    const auth = getAuthInstance();
    await sendPasswordResetEmail(auth, email);
}

export function getAuthErrorMessage(err) {
    if (!err) return 'Erro desconhecido.';
    const map = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/wrong-password': 'E-mail ou senha incorretos.',
        'auth/user-not-found': 'Usuário não encontrado.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/user-disabled': 'Esta conta foi desativada.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde.',
        'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
        'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
        'auth/weak-password': 'Senha muito fraca.',
        'auth/operation-not-allowed': 'Login por E-mail/Senha desativado.',
        'auth/requires-recent-login': 'Faça login novamente.',
        'auth/popup-closed-by-user': 'Login cancelado.',
        'auth/popup-blocked': 'Pop-up bloqueado.',
        'auth/cancelled-popup-request': 'Login cancelado.'
    };
    return map[err.code] || err.message || 'Erro ao autenticar.';
}