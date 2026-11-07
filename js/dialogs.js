// ============================================================
// SSOT - DIÁLOGOS DO SISTEMA
// Substituem alert/confirm/prompt nativos
// ============================================================

let _dialogCounter = 0;

function esc(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

export function sstAlert(message, title = 'Aviso', type = 'info') {
    return new Promise((resolve) => {
        _showDialog({
            title, message, type,
            buttons: [{ label: 'OK', class: 'btn-primary', value: true, primary: true }],
            onResolve: () => resolve(true)
        });
    });
}

export function sstConfirm(message, title = 'Confirmar', type = 'warning') {
    return new Promise((resolve) => {
        _showDialog({
            title, message, type,
            buttons: [
                { label: 'Cancelar', class: 'btn-secondary', value: false },
                { label: 'Confirmar', class: 'btn-danger', value: true, primary: true }
            ],
            onResolve: (val) => resolve(val === true)
        });
    });
}

export function sstPrompt(message, defaultValue = '', title = 'Digite') {
    return new Promise((resolve) => {
        _showDialog({
            title, message, type: 'info', input: true, defaultValue,
            buttons: [
                { label: 'Cancelar', class: 'btn-secondary', value: null },
                { label: 'Confirmar', class: 'btn-primary', value: '__INPUT__', primary: true }
            ],
            onResolve: (val) => resolve(val)
        });
    });
}

function _showDialog({ title, message, type, buttons, input, defaultValue, onResolve }) {
    const id = 'sst-dialog-' + (++_dialogCounter);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = id;
    overlay.style.zIndex = '3000';

    const headerClass = type === 'warning' ? 'modal-header-warning'
        : type === 'danger' ? 'modal-header-danger'
        : 'modal-header-info';

    overlay.innerHTML = `
        <div class="modal modal-small">
            <div class="modal-header ${headerClass}">
                <h3>${esc(title)}</h3>
                <button class="modal-close" data-close>&times;</button>
            </div>
            <div class="modal-body">
                <p style="color:#555;line-height:1.6;font-size:0.93rem;word-wrap:break-word;">${esc(message).replace(/\n/g, '<br>')}</p>
                ${input ? `<input type="text" class="form-control" style="margin-top:15px;" placeholder="Digite aqui..." value="${esc(defaultValue)}">` : ''}
            </div>
            <div class="modal-footer">
                ${buttons.map(btn => `
                    <button class="btn ${btn.class}" data-value="${btn.value}">${btn.label}</button>
                `).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);

    const closeDialog = (value) => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.remove();
            onResolve(value);
        }, 200);
    };

    const inputEl = overlay.querySelector('.modal-body input');
    if (inputEl) {
        setTimeout(() => { inputEl.focus(); inputEl.select(); }, 200);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') closeDialog(inputEl.value);
        });
    }

    overlay.querySelectorAll('[data-value]').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-value');
            if (val === '__INPUT__') closeDialog(inputEl?.value || '');
            else if (val === 'true') closeDialog(true);
            else if (val === 'false') closeDialog(false);
            else closeDialog(val);
        });
    });

    overlay.querySelector('[data-close]')?.addEventListener('click', () => closeDialog(null));
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDialog(null);
    });
}

window.sstAlert = sstAlert;
window.sstConfirm = sstConfirm;
window.sstPrompt = sstPrompt;