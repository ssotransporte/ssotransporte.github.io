// ============================================================
// SSOT - FROTA E VIAGENS (v12.0)
// Alterações:
//  - openManageOrigins / openManageDestinations (novos)
//  - Popula <datalist> de origens/destinos nos formulários
//  - addOrigin/addDestination com validação de duplicata
//  - Renderização de listas com escape seguro de aspas
// ============================================================

import {
    ref, set, remove, push, onValue, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { showNotification, escapeHtml, formatDateTime } from './utils.js';
import { addHistory } from './history.js';
import { sstConfirm, sstAlert, sstPrompt } from './dialogs.js';

let _db = null;
let _currentUser = null;
let _vehicles = [];
let _drivers = [];
let _trips = [];
let _origins = [];
let _destinations = [];
let _unsubV = null, _unsubD = null, _unsubT = null, _unsubO = null, _unsubDest = null;

let _searchType = '';
let _searchValue = '';

// ============================================================
// UTILITÁRIO: argumento seguro para onclick
// Uso: onclick='window.renameOrigin(${jsArgAttr(o.id)}, ${jsArgAttr(o.name)})'
// ============================================================
function jsArgAttr(v) {
    return JSON.stringify(String(v == null ? '' : v)).replace(/'/g, '&#39;');
}

// ============================================================
// CONTEXTO
// ============================================================
export function setFleetContext(db, currentUser) {
    _db = db;
    _currentUser = currentUser;
}

export function getVehicles() { return _vehicles; }
export function getDrivers() { return _drivers; }
export function getOrigins() { return _origins; }
export function getDestinations() { return _destinations; }

// ============================================================
// SUBSCRIÇÃO
// ============================================================
export function subscribeFleet(onChange) {
    if (!_db) return;

    if (_unsubV) _unsubV();
    if (_unsubD) _unsubD();
    if (_unsubT) _unsubT();
    if (_unsubO) _unsubO();
    if (_unsubDest) _unsubDest();

    _unsubV = onValue(ref(_db, 'vehicles'), (snap) => {
        _vehicles = [];
        snap.forEach(c => _vehicles.push({ ...c.val(), id: c.key }));
        renderVehiclesTable();
        updateDropdowns();
    });

    _unsubD = onValue(ref(_db, 'drivers'), (snap) => {
        _drivers = [];
        snap.forEach(c => _drivers.push({ ...c.val(), id: c.key }));
        renderDriversTable();
        updateDropdowns();
    });

    _unsubO = onValue(ref(_db, 'fleetOrigins'), (snap) => {
        _origins = [];
        snap.forEach(c => _origins.push({ ...c.val(), id: c.key }));
        _origins.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        updateDropdowns();
        renderFleetLists();
        updateOrigemDestinoDatalists();
    });

    _unsubDest = onValue(ref(_db, 'fleetDestinations'), (snap) => {
        _destinations = [];
        snap.forEach(c => _destinations.push({ ...c.val(), id: c.key }));
        _destinations.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        updateDropdowns();
        renderFleetLists();
        updateOrigemDestinoDatalists();
    });

    _unsubT = onValue(ref(_db, 'fleetTrips'), (snap) => {
        _trips = [];
        snap.forEach(c => _trips.push({ ...c.val(), id: c.key }));
        _trips.sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
        renderTripsTable();
    });
}

export function unsubscribeFleet() {
    if (_unsubV) { try { _unsubV(); } catch (e) {} _unsubV = null; }
    if (_unsubD) { try { _unsubD(); } catch (e) {} _unsubD = null; }
    if (_unsubT) { try { _unsubT(); } catch (e) {} _unsubT = null; }
    if (_unsubO) { try { _unsubO(); } catch (e) {} _unsubO = null; }
    if (_unsubDest) { try { _unsubDest(); } catch (e) {} _unsubDest = null; }
}

// ============================================================
// GERENCIAR ORIGENS / DESTINOS (abrir modal)
// ============================================================
export function openManageOrigins() {
    if (!_db) {
        showNotification('Erro', 'Aguarde a conexão com o banco.', 'danger');
        return;
    }
    // Garante que está inscrito para renderizar a lista
    if (!_unsubO) {
        subscribeFleet();
    }
    renderFleetLists();
    window.openModal('manage-origins-modal');
    setTimeout(() => {
        document.getElementById('new-origin-input')?.focus();
    }, 200);
}

export function openManageDestinations() {
    if (!_db) {
        showNotification('Erro', 'Aguarde a conexão com o banco.', 'danger');
        return;
    }
    if (!_unsubDest) {
        subscribeFleet();
    }
    renderFleetLists();
    window.openModal('manage-destinations-modal');
    setTimeout(() => {
        document.getElementById('new-destination-input')?.focus();
    }, 200);
}

// ============================================================
// POPULAR DATALISTS NOS FORMULÁRIOS
// ============================================================
function updateOrigemDestinoDatalists() {
    // Origens — user + admin
    ['u-origem-list', 'ar-origem-list'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = _origins.map(o =>
            `<option value="${escapeHtml(o.name)}"></option>`
        ).join('');
    });

    // Destinos — user + admin
    ['u-destino-list', 'ar-destino-list'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = _destinations.map(d =>
            `<option value="${escapeHtml(d.name)}"></option>`
        ).join('');
    });
}

// ============================================================
// RENDERIZAÇÃO E DROPDOWNS (selects antigos)
// ============================================================
function updateDropdowns() {
    const drvSelect = document.getElementById('trip-driver');
    if (drvSelect) {
        const current = drvSelect.value;
        drvSelect.innerHTML = '<option value="">Selecione...</option>';
        _drivers.forEach(d => {
            drvSelect.innerHTML += `<option value="${d.id}">${escapeHtml(d.nome)}</option>`;
        });
        drvSelect.value = current;
    }

    const originSelect = document.getElementById('trip-origin');
    if (originSelect) {
        const current = originSelect.value;
        originSelect.innerHTML = '<option value="">Selecione...</option>';
        _origins.forEach(o => {
            originSelect.innerHTML += `<option value="${escapeHtml(o.name)}">${escapeHtml(o.name)}</option>`;
        });
        originSelect.value = current;
    }

    const destSelect = document.getElementById('trip-destination');
    if (destSelect) {
        const current = destSelect.value;
        destSelect.innerHTML = '<option value="">Selecione...</option>';
        _destinations.forEach(d => {
            destSelect.innerHTML += `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`;
        });
        destSelect.value = current;
    }
}

// ============================================================
// RENDERIZAR LISTAS NOS MODAIS
// ============================================================
export function renderFleetLists() {
    const originTbody = document.getElementById('origins-list-table');
    if (originTbody) {
        if (_origins.length === 0) {
            originTbody.innerHTML = '<tr><td colspan="2" class="table-empty"><p>Nenhuma origem cadastrada.</p></td></tr>';
        } else {
            originTbody.innerHTML = _origins.map(o => `
                <tr>
                    <td>${escapeHtml(o.name)}</td>
                    <td class="table-actions-col">
                        <div class="action-buttons" style="justify-content:flex-end;">
                            <button class="btn btn-secondary btn-sm" title="Renomear"
                                    onclick='window.renameOrigin(${jsArgAttr(o.id)}, ${jsArgAttr(o.name)})'>
                                <svg class="si"><use href="#i-edit"/></svg>
                            </button>
                            <button class="btn btn-danger btn-sm" title="Excluir"
                                    onclick='window.deleteOrigin(${jsArgAttr(o.id)})'>
                                <svg class="si"><use href="#i-trash"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    }

    const destTbody = document.getElementById('destinations-list-table');
    if (destTbody) {
        if (_destinations.length === 0) {
            destTbody.innerHTML = '<tr><td colspan="2" class="table-empty"><p>Nenhum destino cadastrado.</p></td></tr>';
        } else {
            destTbody.innerHTML = _destinations.map(d => `
                <tr>
                    <td>${escapeHtml(d.name)}</td>
                    <td class="table-actions-col">
                        <div class="action-buttons" style="justify-content:flex-end;">
                            <button class="btn btn-secondary btn-sm" title="Renomear"
                                    onclick='window.renameDestination(${jsArgAttr(d.id)}, ${jsArgAttr(d.name)})'>
                                <svg class="si"><use href="#i-edit"/></svg>
                            </button>
                            <button class="btn btn-danger btn-sm" title="Excluir"
                                    onclick='window.deleteDestination(${jsArgAttr(d.id)})'>
                                <svg class="si"><use href="#i-trash"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    }
}

function renderTripsTable() {
    const tbody = document.getElementById('fleet-trips-table');
    if (!tbody) return;

    if (_trips.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><svg class="si si-2x"><use href="#i-route"/></svg><p>Nenhuma viagem registrada.</p></td></tr>`;
        return;
    }

    tbody.innerHTML = _trips.map(t => `
        <tr>
            <td>${formatDateTime(t.date + 'T' + t.time)}</td>
            <td><strong>${escapeHtml(t.driverName)}</strong></td>
            <td>
                <div class="origin-dest">
                    ${escapeHtml(t.origin)}
                    <svg class="si"><use href="#i-arrow-right"/></svg>
                    ${escapeHtml(t.destination)}
                </div>
            </td>
            <td>
                <span style="font-size:0.75rem;color:#7f8c8d;">Inicial:</span> ${escapeHtml(t.odoStart)}<br>
                <span style="font-size:0.75rem;color:#7f8c8d;">Final:</span> ${escapeHtml(t.odoEnd)}
            </td>
            <td>${escapeHtml(t.motive)}</td>
            <td class="table-actions-col">
                <button onclick='window.deleteTrip(${jsArgAttr(t.id)})' class="btn btn-danger btn-sm" title="Excluir">
                    <svg class="si"><use href="#i-trash"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderVehiclesTable() {
    const tbody = document.getElementById('vehicles-table');
    if (!tbody) return;
    if (_vehicles.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty"><p>Nenhum veículo.</p></td></tr>`;
        return;
    }
    tbody.innerHTML = _vehicles.map(v => `
        <tr>
            <td><strong>${escapeHtml(v.placa)}</strong></td>
            <td>${escapeHtml(v.modelo)}</td>
            <td>${escapeHtml(v.capacidade || '—')}</td>
            <td class="table-actions-col">
                <button onclick='window.deleteVehicle(${jsArgAttr(v.id)})' class="btn btn-danger btn-sm" title="Excluir">
                    <svg class="si"><use href="#i-trash"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderDriversTable() {
    const tbody = document.getElementById('drivers-table');
    if (!tbody) return;
    if (_drivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="table-empty"><p>Nenhum motorista.</p></td></tr>`;
        return;
    }
    tbody.innerHTML = _drivers.map(d => `
        <tr>
            <td><strong>${escapeHtml(d.nome)}</strong></td>
            <td>${escapeHtml(d.telefone || '—')}</td>
            <td class="table-actions-col">
                <button onclick='window.deleteDriver(${jsArgAttr(d.id)})' class="btn btn-danger btn-sm" title="Excluir">
                    <svg class="si"><use href="#i-trash"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// EXPANDIR / RECOLHER FORMULÁRIO DE VIAGEM
// ============================================================
export function toggleFleetForm() {
    const form = document.getElementById('fleet-new-trip-form');
    const btn = document.getElementById('toggle-fleet-btn');
    if (!form || !btn) return;

    if (form.classList.contains('hidden')) {
        form.classList.remove('hidden');
        btn.innerHTML = 'Recolher <svg class="si"><use href="#i-chevron-up"/></svg>';
    } else {
        form.classList.add('hidden');
        btn.innerHTML = 'Expandir <svg class="si"><use href="#i-chevron-down"/></svg>';
    }
}

// ============================================================
// PESQUISA DE ORIGEM/DESTINO (mini guia — legado)
// ============================================================
export function openFleetSearch(type) {
    _searchType = type;
    _searchValue = '';

    const title = document.getElementById('fleet-search-title');
    const input = document.getElementById('fleet-search-input');

    if (title) title.textContent = `Pesquisar ${type === 'origin' ? 'Origem' : 'Destino'}`;
    if (input) { input.value = ''; input.focus(); }

    renderFleetSearchList('');
    window.openModal('modal-fleet-search');
}

export function filterFleetSearchList(val) {
    _searchValue = val;
    renderFleetSearchList(val);
}

function renderFleetSearchList(filter) {
    const list = document.getElementById('fleet-search-list');
    if (!list) return;

    const data = _searchType === 'origin' ? _origins : _destinations;
    const filtered = data.filter(d =>
        (d.name || '').toLowerCase().includes((filter || '').toLowerCase())
    );

    if (filtered.length === 0) {
        list.innerHTML = `<li style="padding:15px; text-align:center; color:#7f8c8d;">Nenhum resultado.</li>`;
        return;
    }

    list.innerHTML = filtered.map(d => `
        <li class="fleet-search-list-item" onclick='window.selectFleetSearch(${jsArgAttr(d.name)})'>
            ${escapeHtml(d.name)}
        </li>
    `).join('');
}

export function selectFleetSearch(value) {
    if (_searchType === 'origin') {
        const sel = document.getElementById('trip-origin');
        if (sel) sel.value = value;
    } else if (_searchType === 'destination') {
        const sel = document.getElementById('trip-destination');
        if (sel) sel.value = value;
    }
    window.closeModal('modal-fleet-search');
}

// ============================================================
// SALVAR VIAGEM
// ============================================================
export async function saveTrip() {
    const driverId = document.getElementById('trip-driver')?.value;
    const origin = document.getElementById('trip-origin')?.value;
    const destination = document.getElementById('trip-destination')?.value;
    const odoStart = document.getElementById('trip-odo-start')?.value.trim();
    const odoEnd = document.getElementById('trip-odo-end')?.value.trim();
    const date = document.getElementById('trip-date')?.value;
    const time = document.getElementById('trip-time')?.value;
    const motive = document.getElementById('trip-motive')?.value.trim();

    if (!driverId || !origin || !destination || !odoStart || !odoEnd || !date || !time || !motive) {
        showNotification('Erro', 'Preencha todos os campos da viagem.', 'warning');
        return;
    }

    const driverObj = _drivers.find(d => d.id === driverId);
    if (!driverObj) return;

    const odoExists = _trips.find(t =>
        t.odoStart === odoStart || t.odoEnd === odoStart ||
        t.odoStart === odoEnd || t.odoEnd === odoEnd
    );
    if (odoExists) {
        await sstAlert('Um dos odômetros informados já foi registrado em outra viagem. Verifique!', 'Odômetro Duplicado', 'danger');
        return;
    }

    try {
        const newRef = push(ref(_db, 'fleetTrips'));
        await set(newRef, {
            driverId, driverName: driverObj.nome,
            origin, destination,
            odoStart, odoEnd,
            date, time, motive,
            createdAt: new Date().toISOString(),
            createdBy: _currentUser?.name
        });

        document.getElementById('trip-odo-start').value = '';
        document.getElementById('trip-odo-end').value = '';
        document.getElementById('trip-motive').value = '';
        showNotification('Sucesso', 'Viagem registrada!', 'success');
        addHistory('Viagem Registrada', '-', `${origin} -> ${destination}`).catch(() => {});
    } catch (err) {
        console.error(err);
    }
}

export async function deleteTrip(id) {
    const ok = await sstConfirm('Excluir esta viagem?', 'Excluir', 'danger');
    if (!ok) return;
    await remove(ref(_db, 'fleetTrips/' + id));
    showNotification('Excluída', 'Viagem removida.', 'success');
}

// ============================================================
// GERENCIAR ORIGENS / DESTINOS (CRUD)
// ============================================================
export async function addOrigin() {
    const input = document.getElementById('new-origin-input');
    const name = input?.value.trim();
    if (!name) {
        showNotification('Atenção', 'Digite um nome para a origem.', 'warning');
        input?.focus();
        return;
    }
    if (_origins.some(o => (o.name || '').toLowerCase() === name.toLowerCase())) {
        showNotification('Atenção', 'Esta origem já está cadastrada.', 'warning');
        input?.focus();
        return;
    }
    try {
        await push(ref(_db, 'fleetOrigins'), { name });
        input.value = '';
        input.focus();
        showNotification('Adicionado', 'Origem criada.', 'success');
        addHistory('Origem Adicionada', '-', name).catch(() => {});
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível adicionar.', 'danger');
    }
}

export async function addDestination() {
    const input = document.getElementById('new-destination-input');
    const name = input?.value.trim();
    if (!name) {
        showNotification('Atenção', 'Digite um nome para o destino.', 'warning');
        input?.focus();
        return;
    }
    if (_destinations.some(d => (d.name || '').toLowerCase() === name.toLowerCase())) {
        showNotification('Atenção', 'Este destino já está cadastrado.', 'warning');
        input?.focus();
        return;
    }
    try {
        await push(ref(_db, 'fleetDestinations'), { name });
        input.value = '';
        input.focus();
        showNotification('Adicionado', 'Destino criado.', 'success');
        addHistory('Destino Adicionado', '-', name).catch(() => {});
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível adicionar.', 'danger');
    }
}

export async function renameOrigin(id, oldName) {
    const newName = await sstPrompt('Novo nome para a Origem:', oldName, 'Renomear Origem');
    if (!newName || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    if (_origins.some(o => o.id !== id && (o.name || '').toLowerCase() === trimmed.toLowerCase())) {
        await sstAlert('Já existe uma origem com esse nome.', 'Duplicado', 'warning');
        return;
    }
    try {
        await update(ref(_db, 'fleetOrigins/' + id), { name: trimmed });
        showNotification('Atualizado', 'Origem renomeada.', 'success');
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível renomear.', 'danger');
    }
}

export async function deleteOrigin(id) {
    const o = _origins.find(x => x.id === id);
    if (!o) return;
    const ok = await sstConfirm(`Excluir a origem "${o.name}"?`, 'Excluir', 'danger');
    if (!ok) return;
    try {
        await remove(ref(_db, 'fleetOrigins/' + id));
        showNotification('Excluída', 'Origem removida.', 'success');
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

export async function renameDestination(id, oldName) {
    const newName = await sstPrompt('Novo nome para o Destino:', oldName, 'Renomear Destino');
    if (!newName || newName.trim() === oldName) return;
    const trimmed = newName.trim();
    if (_destinations.some(d => d.id !== id && (d.name || '').toLowerCase() === trimmed.toLowerCase())) {
        await sstAlert('Já existe um destino com esse nome.', 'Duplicado', 'warning');
        return;
    }
    try {
        await update(ref(_db, 'fleetDestinations/' + id), { name: trimmed });
        showNotification('Atualizado', 'Destino renomeado.', 'success');
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível renomear.', 'danger');
    }
}

export async function deleteDestination(id) {
    const d = _destinations.find(x => x.id === id);
    if (!d) return;
    const ok = await sstConfirm(`Excluir o destino "${d.name}"?`, 'Excluir', 'danger');
    if (!ok) return;
    try {
        await remove(ref(_db, 'fleetDestinations/' + id));
        showNotification('Excluído', 'Destino removido.', 'success');
    } catch (err) {
        console.error(err);
        showNotification('Erro', 'Não foi possível excluir.', 'danger');
    }
}

// ============================================================
// VEÍCULOS E MOTORISTAS
// ============================================================
export async function saveVehicle() {
    const placa = document.getElementById('veiculo-placa')?.value.trim().toUpperCase();
    const modelo = document.getElementById('veiculo-modelo')?.value.trim();
    const capacidade = document.getElementById('veiculo-capacidade')?.value.trim();

    if (!placa || !modelo) {
        showNotification('Erro', 'Placa e modelo obrigatórios.', 'warning');
        return;
    }

    await push(ref(_db, 'vehicles'), {
        placa, modelo, capacidade,
        createdAt: new Date().toISOString()
    });
    document.getElementById('veiculo-placa').value = '';
    document.getElementById('veiculo-modelo').value = '';
    document.getElementById('veiculo-capacidade').value = '';
    showNotification('Sucesso', 'Veículo adicionado.', 'success');
}

export async function deleteVehicle(id) {
    const ok = await sstConfirm('Excluir este veículo?', 'Excluir', 'danger');
    if (ok) await remove(ref(_db, 'vehicles/' + id));
}

export async function saveDriver() {
    const nome = document.getElementById('motorista-nome')?.value.trim();
    const telefone = document.getElementById('motorista-telefone')?.value.trim();

    if (!nome) {
        showNotification('Erro', 'Nome obrigatório.', 'warning');
        return;
    }

    await push(ref(_db, 'drivers'), {
        nome, telefone,
        createdAt: new Date().toISOString()
    });
    document.getElementById('motorista-nome').value = '';
    document.getElementById('motorista-telefone').value = '';
    showNotification('Sucesso', 'Motorista adicionado.', 'success');
}

export async function deleteDriver(id) {
    const ok = await sstConfirm('Excluir este motorista?', 'Excluir', 'danger');
    if (ok) await remove(ref(_db, 'drivers/' + id));
}

// ============================================================
// EXPORTS GLOBAIS (para onclick no HTML)
// ============================================================
window.saveTrip = saveTrip;
window.deleteTrip = deleteTrip;
window.addOrigin = addOrigin;
window.addDestination = addDestination;
window.renameOrigin = renameOrigin;
window.deleteOrigin = deleteOrigin;
window.renameDestination = renameDestination;
window.deleteDestination = deleteDestination;
window.saveVehicle = saveVehicle;
window.deleteVehicle = deleteVehicle;
window.saveDriver = saveDriver;
window.deleteDriver = deleteDriver;
window.toggleFleetForm = toggleFleetForm;
window.openFleetSearch = openFleetSearch;
window.filterFleetSearchList = filterFleetSearchList;
window.selectFleetSearch = selectFleetSearch;
window.openManageOrigins = openManageOrigins;
window.openManageDestinations = openManageDestinations;