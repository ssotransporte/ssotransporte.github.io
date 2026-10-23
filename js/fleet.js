// ============================================================
// SSOT - FROTA (Veículos e Motoristas)
// ============================================================

import {
    ref, set, remove, push, onValue, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { showNotification, escapeHtml, getVeiculoText } from './utils.js';
import { addHistory } from './history.js';
import { sstConfirm, sstAlert } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _vehicles = [];
let _drivers = [];
let _unsubV = null;
let _unsubD = null;
let _editingVehicleId = null;
let _editingDriverId = null;

export function setFleetContext(db, currentUser) {
    _db = db;
    _currentUser = currentUser;
}

export function getVehicles() { return _vehicles; }
export function getDrivers() { return _drivers; }

/**
 * Retorna tipos de veículos disponíveis na frota (dinâmico).
 */
export function getAvailableVehicleTypes() {
    if (_vehicles.length === 0) {
        return [{ value: 'carro', label: 'Carro' }];
    }
    const tipos = new Set();
    _vehicles.forEach(v => { if (v.tipo) tipos.add(v.tipo); });
    tipos.add('carro');

    const labels = {
        'carro': 'Carro', 'van': 'Van', 'micro-onibus': 'Micro-ônibus',
        'onibus': 'Ônibus', 'ambulancia': 'Ambulância', 'caminhonete': 'Caminhonete'
    };
    return Array.from(tipos).map(t => ({ value: t, label: labels[t] || t }));
}

export function subscribeFleet(onChange) {
    if (!_db) return;
    if (_unsubV) { try { _unsubV(); } catch (e) {} }
    if (_unsubD) { try { _unsubD(); } catch (e) {} }

    _unsubV = onValue(ref(_db, 'vehicles'), (snap) => {
        _vehicles = [];
        snap.forEach(child => _vehicles.push({ ...child.val(), id: child.key }));
        updateVehiclesTable();
        updateSystemInfo();
        if (typeof onChange === 'function') { try { onChange(); } catch (e) {} }
    }, (error) => console.error('[Fleet]', error));

    _unsubD = onValue(ref(_db, 'drivers'), (snap) => {
        _drivers = [];
        snap.forEach(child => _drivers.push({ ...child.val(), id: child.key }));
        updateDriversTable();
        updateSystemInfo();
    }, (error) => console.error('[Fleet]', error));
}

export function unsubscribeFleet() {
    if (_unsubV) { try { _unsubV(); } catch (e) {} _unsubV = null; }
    if (_unsubD) { try { _unsubD(); } catch (e) {} _unsubD = null; }
}

// ============================================================
// VEÍCULOS
// ============================================================

export async function addVehicle() {
    const placa = (document.getElementById('veiculo-placa')?.value || '').trim().toUpperCase();
    const modelo = (document.getElementById('veiculo-modelo')?.value || '').trim();
    const tipo = document.getElementById('veiculo-tipo')?.value || 'carro';
    const capacidade = (document.getElementById('veiculo-capacidade')?.value || '').trim();

    if (!placa) { await sstAlert('Informe a placa.', 'Campo obrigatório', 'warning'); return; }
    if (!modelo) { await sstAlert('Informe o modelo.', 'Campo obrigatório', 'warning'); return; }

    const placaLimpa = placa.replace(/\s/g, '');
    const dup = _vehicles.find(v => v.placa === placaLimpa);
    if (dup) {
        await sstAlert(`Já existe veículo com a placa ${placa}.`, 'Placa duplicada', 'warning');
        return;
    }

    try {
        const newRef = push(ref(_db, 'vehicles'));
        await set(newRef, {
            placa: placaLimpa, modelo, tipo,
            capacidade: capacidade || '',
            status: 'disponivel',
            createdAt: new Date().toISOString(),
            createdBy: _currentUser?.name || 'Sistema'
        });

        await addHistory('Veículo Adicionado', placa, `${modelo} - ${getVeiculoText(tipo)}`);

        ['veiculo-placa','veiculo-modelo','veiculo-capacidade'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const tipoEl = document.getElementById('veiculo-tipo');
        if (tipoEl) tipoEl.value = 'carro';

        showNotification('Veículo Adicionado', `${placa} cadastrado!`, 'success');
    } catch (err) {
        console.error('[Fleet]', err);
        showNotification('Erro', 'Não foi possível adicionar.', 'danger');
    }
}

export async function saveVehicle() {
    if (_editingVehicleId) return updateVehicle();
    return addVehicle();
}

async function updateVehicle() {
    const placa = (document.getElementById('veiculo-placa')?.value || '').trim().toUpperCase().replace(/\s/g, '');
    const modelo = (document.getElementById('veiculo-modelo')?.value || '').trim();
    const tipo = document.getElementById('veiculo-tipo')?.value || 'carro';
    const capacidade = (document.getElementById('veiculo-capacidade')?.value || '').trim();

    if (!placa || !modelo) {
        await sstAlert('Placa e modelo são obrigatórios.', 'Campos obrigatórios', 'warning');
        return;
    }

    const dup = _vehicles.find(v => v.placa === placa && v.id !== _editingVehicleId);
    if (dup) {
        await sstAlert(`Outro veículo já usa a placa ${placa}.`, 'Placa duplicada', 'warning');
        return;
    }

    try {
        await update(ref(_db, 'vehicles/' + _editingVehicleId), {
            placa, modelo, tipo, capacidade,
            updatedAt: new Date().toISOString(),
            updatedBy: _currentUser?.name || 'Sistema'
        });
        await addHistory('Veículo Editado', placa, `Por: ${_currentUser?.name}`);
        showNotification('Atualizado', `${placa} atualizado!`, 'success');
        cancelVehicleEdit();
    } catch (err) {
        console.error('[Fleet]', err);
        showNotification('Erro', 'Não foi possível salvar.', 'danger');
    }
}

export function editVehicle(id) {
    const v = _vehicles.find(x => x.id === id);
    if (!v) return;
    _editingVehicleId = id;

    document.getElementById('veiculo-placa').value = v.placa || '';
    document.getElementById('veiculo-modelo').value = v.modelo || '';
    document.getElementById('veiculo-tipo').value = v.tipo || 'carro';
    document.getElementById('veiculo-capacidade').value = v.capacidade || '';

    const btn = document.getElementById('add-vehicle');
    if (btn) {
        btn.innerHTML = '<svg class="si"><use href="#i-save"/></svg> Salvar Alterações';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
    }
    showEditBanner('vehicle');
}

export function cancelVehicleEdit() {
    _editingVehicleId = null;
    ['veiculo-placa','veiculo-modelo','veiculo-capacidade'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const tipoEl = document.getElementById('veiculo-tipo');
    if (tipoEl) tipoEl.value = 'carro';

    const btn = document.getElementById('add-vehicle');
    if (btn) {
        btn.innerHTML = '<svg class="si"><use href="#i-plus"/></svg> Adicionar';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-primary');
    }
    hideEditBanner('vehicle');
}

export async function deleteVehicle(id) {
    const v = _vehicles.find(x => x.id === id);
    if (!v) return;

    const ok = await sstConfirm(
        `Excluir o veículo ${v.placa}?\n\nModelo: ${v.modelo}\nTipo: ${getVeiculoText(v.tipo)}`,
        'Excluir Veículo',
        'danger'
    );
    if (!ok) return;

    try {
        await remove(ref(_db, 'vehicles/' + id));
        await addHistory('Veículo Removido', v.placa, v.modelo);
        showNotification('Excluído', `${v.placa} removido.`, 'success');
    } catch (err) {
        console.error('[Fleet]', err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

function updateVehiclesTable() {
    const tbody = document.getElementById('vehicles-table');
    if (!tbody) return;

    if (_vehicles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty">
            <svg class="si si-2x"><use href="#i-truck"/></svg>
            <p>Nenhum veículo cadastrado.</p>
        </td></tr>`;
        updateVehiclesCount();
        return;
    }

    _vehicles.sort((a, b) => (a.placa || '').localeCompare(b.placa || ''));

    tbody.innerHTML = _vehicles.map(v => `
        <tr>
            <td><strong>${escapeHtml(v.placa || '—')}</strong></td>
            <td>${escapeHtml(v.modelo || '—')}</td>
            <td>${getVeiculoText(v.tipo)}</td>
            <td>${escapeHtml(String(v.capacidade || '—'))}</td>
            <td class="table-actions-col">
                <div class="action-buttons" style="justify-content:flex-end;">
                    <button onclick="editVehicle('${v.id}')" class="btn btn-secondary btn-sm">
                        <svg class="si"><use href="#i-edit"/></svg>
                    </button>
                    <button onclick="deleteVehicle('${v.id}')" class="btn btn-danger btn-sm">
                        <svg class="si"><use href="#i-trash"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    updateVehiclesCount();
}

function updateVehiclesCount() {
    const el = document.getElementById('vehicles-count');
    if (el) el.textContent = _vehicles.length;
}

// ============================================================
// MOTORISTAS
// ============================================================

export async function addDriver() {
    const nome = (document.getElementById('motorista-nome')?.value || '').trim();
    const categoria = document.getElementById('motorista-categoria')?.value || 'B';
    const telefone = (document.getElementById('motorista-telefone')?.value || '').trim();

    if (!nome) { await sstAlert('Informe o nome.', 'Campo obrigatório', 'warning'); return; }

    const dup = _drivers.find(d => d.nome.toLowerCase() === nome.toLowerCase());
    if (dup) {
        await sstAlert(`Já existe motorista "${nome}".`, 'Nome duplicado', 'warning');
        return;
    }

    try {
        const newRef = push(ref(_db, 'drivers'));
        await set(newRef, {
            nome, categoria,
            telefone: telefone || '',
            status: 'ativo',
            createdAt: new Date().toISOString(),
            createdBy: _currentUser?.name || 'Sistema'
        });
        await addHistory('Motorista Adicionado', nome, `Categoria ${categoria}`);

        document.getElementById('motorista-nome').value = '';
        document.getElementById('motorista-telefone').value = '';
        document.getElementById('motorista-categoria').value = 'B';

        showNotification('Motorista Adicionado', `${nome} cadastrado!`, 'success');
    } catch (err) {
        console.error('[Fleet]', err);
        showNotification('Erro', 'Não foi possível adicionar.', 'danger');
    }
}

export async function saveDriver() {
    if (_editingDriverId) return updateDriver();
    return addDriver();
}

async function updateDriver() {
    const nome = (document.getElementById('motorista-nome')?.value || '').trim();
    const categoria = document.getElementById('motorista-categoria')?.value || 'B';
    const telefone = (document.getElementById('motorista-telefone')?.value || '').trim();

    if (!nome) { await sstAlert('Informe o nome.', 'Campo obrigatório', 'warning'); return; }

    try {
        await update(ref(_db, 'drivers/' + _editingDriverId), {
            nome, categoria, telefone,
            updatedAt: new Date().toISOString(),
            updatedBy: _currentUser?.name || 'Sistema'
        });
        await addHistory('Motorista Editado', nome, `Por: ${_currentUser?.name}`);
        showNotification('Atualizado', `${nome} atualizado!`, 'success');
        cancelDriverEdit();
    } catch (err) {
        console.error('[Fleet]', err);
        showNotification('Erro', 'Não foi possível salvar.', 'danger');
    }
}

export function editDriver(id) {
    const d = _drivers.find(x => x.id === id);
    if (!d) return;
    _editingDriverId = id;

    document.getElementById('motorista-nome').value = d.nome || '';
    document.getElementById('motorista-categoria').value = d.categoria || 'B';
    document.getElementById('motorista-telefone').value = d.telefone || '';

    const btn = document.getElementById('add-driver');
    if (btn) {
        btn.innerHTML = '<svg class="si"><use href="#i-save"/></svg> Salvar Alterações';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
    }
    showEditBanner('driver');
}

export function cancelDriverEdit() {
    _editingDriverId = null;
    document.getElementById('motorista-nome').value = '';
    document.getElementById('motorista-categoria').value = 'B';
    document.getElementById('motorista-telefone').value = '';

    const btn = document.getElementById('add-driver');
    if (btn) {
        btn.innerHTML = '<svg class="si"><use href="#i-plus"/></svg> Adicionar';
        btn.classList.remove('btn-success');
        btn.classList.add('btn-primary');
    }
    hideEditBanner('driver');
}

export async function deleteDriver(id) {
    const d = _drivers.find(x => x.id === id);
    if (!d) return;

    const ok = await sstConfirm(`Excluir o motorista "${d.nome}"?`, 'Excluir Motorista', 'danger');
    if (!ok) return;

    try {
        await remove(ref(_db, 'drivers/' + id));
        await addHistory('Motorista Removido', d.nome, '');
        showNotification('Excluído', `${d.nome} removido.`, 'success');
    } catch (err) {
        console.error('[Fleet]', err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

function updateDriversTable() {
    const tbody = document.getElementById('drivers-table');
    if (!tbody) return;

    if (_drivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty">
            <svg class="si si-2x"><use href="#i-id-card"/></svg>
            <p>Nenhum motorista cadastrado.</p>
        </td></tr>`;
        updateDriversCount();
        return;
    }

    _drivers.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    tbody.innerHTML = _drivers.map(d => `
        <tr>
            <td><strong>${escapeHtml(d.nome || '—')}</strong></td>
            <td><span class="badge badge-info">${escapeHtml(d.categoria || '—')}</span></td>
            <td>${escapeHtml(d.telefone || '—')}</td>
            <td class="table-actions-col">
                <div class="action-buttons" style="justify-content:flex-end;">
                    <button onclick="editDriver('${d.id}')" class="btn btn-secondary btn-sm">
                        <svg class="si"><use href="#i-edit"/></svg>
                    </button>
                    <button onclick="deleteDriver('${d.id}')" class="btn btn-danger btn-sm">
                        <svg class="si"><use href="#i-trash"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    updateDriversCount();
}

function updateDriversCount() {
    const el = document.getElementById('drivers-count');
    if (el) el.textContent = _drivers.length;
}

function showEditBanner(type) {
    const id = type === 'vehicle' ? 'vehicle-edit-banner' : 'driver-edit-banner';
    let banner = document.getElementById(id);
    if (banner) { banner.classList.remove('hidden'); return; }

    const container = type === 'vehicle'
        ? document.getElementById('add-vehicle')?.parentElement
        : document.getElementById('add-driver')?.parentElement;
    if (!container) return;

    banner = document.createElement('div');
    banner.id = id;
    banner.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 14px;margin-top:10px;background:#fff3cd;border-left:4px solid #f39c12;border-radius:6px;font-size:0.85rem;color:#856404;`;

    const cancelFunc = type === 'vehicle' ? 'cancelVehicleEdit' : 'cancelDriverEdit';
    const label = type === 'vehicle' ? 'veículo' : 'motorista';

    banner.innerHTML = `
        <span><strong>Modo edição</strong> — Editando um ${label}.</span>
        <button class="btn btn-secondary btn-sm" onclick="${cancelFunc}()" style="margin-left:auto;">
            <svg class="si"><use href="#i-x"/></svg> Cancelar
        </button>
    `;
    container.appendChild(banner);
}

function hideEditBanner(type) {
    const id = type === 'vehicle' ? 'vehicle-edit-banner' : 'driver-edit-banner';
    document.getElementById(id)?.remove();
}

function updateSystemInfo() {
    const eV = document.getElementById('info-total-vehicles');
    const eD = document.getElementById('info-total-drivers');
    if (eV) eV.textContent = _vehicles.length;
    if (eD) eD.textContent = _drivers.length;
}

window.addVehicle = addVehicle;
window.saveVehicle = saveVehicle;
window.editVehicle = editVehicle;
window.cancelVehicleEdit = cancelVehicleEdit;
window.deleteVehicle = deleteVehicle;

window.addDriver = addDriver;
window.saveDriver = saveDriver;
window.editDriver = editDriver;
window.cancelDriverEdit = cancelDriverEdit;
window.deleteDriver = deleteDriver;