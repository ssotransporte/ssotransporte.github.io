// ============================================================
// SSOT · Gerador de PDF do comprovante
// Layout compacto no topo + fontes maiores
// ============================================================

import { formatDateTime, escapeHtml, getStatusText, getVeiculoText } from './utils.js';

const safe = (v, fallback = '—') => {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
};
const e = (v, fallback = '—') => escapeHtml(safe(v, fallback));

// ============================================================
// Template (classes prefixadas com ssotpdf- para não colidir)
// ============================================================
function buildRequestHTML(r) {
    const numero       = e(r.numero);
    const solicitante  = e(r.solicitante);
    const email        = e(r.email);
    const ramal        = e(r.ramal);
    const setor        = e(r.setor);
    const cargo        = e(r.cargo);
    const destino      = e(r.destino);
    const origem       = e(r.origem);
    const finalidade   = e(r.finalidade);
    const prioridade   = e(r.prioridade, 'normal');
    const saida        = r.saida   ? formatDateTime(r.saida)   : '—';
    const retorno      = r.retorno ? formatDateTime(r.retorno) : '—';
    const passageiros  = e(r.passageiros, '1');
    const veiculo      = r.veiculo ? getVeiculoText(r.veiculo) : '—';
    const necessidades = e(r.necessidades);
    const nomesPassageiros = e(r.nomesPassageiros, '—').replace(/\n/g, '<br>');
    const observacoes  = e(r.observacoes, '—').replace(/\n/g, '<br>');
    const status       = e(getStatusText(r.status), 'Pendente');
    const criadoEm     = r.timestamp ? formatDateTime(r.timestamp) : '—';
    const emitidoEm    = formatDateTime(new Date().toISOString());

    const baseUrl  = window.location.origin + window.location.pathname;
    const deepLink = `${baseUrl}?request=${encodeURIComponent(r.id || '')}`;
    const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(deepLink)}`;

    return `
    <style>
      .ssotpdf-doc,
      .ssotpdf-doc * {
        box-sizing: border-box !important;
        margin: 0;
        padding: 0;
      }
      .ssotpdf-doc {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        width: 210mm !important;
        min-height: 297mm !important;
        padding: 10mm 12mm !important;   /* topo mais enxuto */
        background: #ffffff !important;
        color: #1a1a1a !important;
        font-family: Arial, Helvetica, sans-serif !important;
        font-size: 12px !important;      /* base maior */
        line-height: 1.4 !important;
      }
      .ssotpdf-doc .ssotpdf-header {
        display: flex !important;
        align-items: center;
        justify-content: space-between;
        border-bottom: 2px solid #1e3a5f;
        padding-bottom: 8px;
        margin-bottom: 10px;
      }
      .ssotpdf-doc .ssotpdf-brand { display: flex !important; align-items: center; gap: 10px; }
      .ssotpdf-doc .ssotpdf-logo {
        width: 46px; height: 46px;
        background: #1e3a5f !important;
        color: #ffffff !important;
        border-radius: 8px;
        display: flex !important; align-items: center; justify-content: center;
        font-size: 24px; font-weight: bold;
      }
      .ssotpdf-doc .ssotpdf-brand h1 { font-size: 18px !important; color: #1e3a5f !important; }
      .ssotpdf-doc .ssotpdf-brand p  { font-size: 10px !important; color: #666 !important; margin-top: 2px; }
      .ssotpdf-doc .ssotpdf-meta { text-align: right; font-size: 10px !important; color: #555 !important; }
      .ssotpdf-doc .ssotpdf-meta .ssotpdf-num {
        font-size: 16px !important; font-weight: bold;
        color: #1e3a5f !important; margin-bottom: 2px;
      }
      .ssotpdf-doc .ssotpdf-badge {
        display: inline-block !important;
        padding: 2px 9px;
        border-radius: 10px;
        font-size: 10px !important;
        font-weight: bold;
        background: #e8eef5 !important;
        color: #1e3a5f !important;
      }
      .ssotpdf-doc .ssotpdf-section {
        font-size: 12px !important;      /* título de seção maior */
        font-weight: bold;
        color: #1e3a5f !important;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-left: 3px solid #1e3a5f;
        padding-left: 8px;
        margin: 10px 0 5px;              /* menos espaço entre seções */
      }
      .ssotpdf-doc .ssotpdf-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr;
        gap: 4px 12px;                   /* gap vertical menor */
      }
      .ssotpdf-doc .ssotpdf-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
      .ssotpdf-doc .ssotpdf-field {
        padding: 3px 0;                  /* campo mais compacto */
        border-bottom: 1px dotted #ddd;
      }
      .ssotpdf-doc .ssotpdf-field.ssotpdf-full { grid-column: 1 / -1; }
      .ssotpdf-doc .ssotpdf-label {
        font-size: 9px !important;       /* label maior */
        color: #888 !important;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 1px;
      }
      .ssotpdf-doc .ssotpdf-value {
        font-size: 11.5px !important;    /* valor maior */
        color: #111 !important;
        font-weight: 500;
      }
      .ssotpdf-doc .ssotpdf-sig { text-align: center; margin-top: 14px; }
      .ssotpdf-doc .ssotpdf-sig-line {
        border-top: 1px solid #333;
        width: 220px;
        margin: 22px auto 4px;
      }
      .ssotpdf-doc .ssotpdf-sig-label { font-size: 10px !important; color: #555 !important; }
      .ssotpdf-doc .ssotpdf-footer {
        margin-top: 14px;                /* footer mais próximo */
        padding-top: 8px;
        border-top: 1px solid #ccc;
        display: flex !important;
        justify-content: space-between;
        align-items: center;
        font-size: 9.5px !important;
        color: #666 !important;
      }
      .ssotpdf-doc .ssotpdf-qr-wrap { display: flex !important; align-items: center; gap: 10px; }
      .ssotpdf-doc .ssotpdf-qr-wrap img { width: 65px; height: 65px; display: block !important; }
      .ssotpdf-doc .ssotpdf-qr-label { font-size: 9px !important; color: #666 !important; max-width: 110px; }
    </style>
    <div class="ssotpdf-doc">
      <div class="ssotpdf-header">
        <div class="ssotpdf-brand">
          <div class="ssotpdf-logo">S</div>
          <div>
            <h1>SSOT</h1>
            <p>Sistema de Solicitações e Operações de Transporte</p>
          </div>
        </div>
        <div class="ssotpdf-meta">
          <div class="ssotpdf-num">${numero}</div>
          <div>Emitido em ${emitidoEm}</div>
          <div style="margin-top:4px;"><span class="ssotpdf-badge">${status}</span></div>
        </div>
      </div>

      <div class="ssotpdf-section">Dados do Solicitante</div>
      <div class="ssotpdf-grid ssotpdf-grid-3">
        <div class="ssotpdf-field"><div class="ssotpdf-label">Nome</div><div class="ssotpdf-value">${solicitante}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">E-mail</div><div class="ssotpdf-value">${email}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Ramal</div><div class="ssotpdf-value">${ramal}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Setor</div><div class="ssotpdf-value">${setor}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Cargo</div><div class="ssotpdf-value">${cargo}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Prioridade</div><div class="ssotpdf-value">${prioridade}</div></div>
      </div>

      <div class="ssotpdf-section">Detalhes da Viagem</div>
      <div class="ssotpdf-grid">
        <div class="ssotpdf-field"><div class="ssotpdf-label">Destino</div><div class="ssotpdf-value">${destino}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Origem</div><div class="ssotpdf-value">${origem}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Saída</div><div class="ssotpdf-value">${saida}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Retorno</div><div class="ssotpdf-value">${retorno}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Passageiros</div><div class="ssotpdf-value">${passageiros}</div></div>
        <div class="ssotpdf-field"><div class="ssotpdf-label">Veículo</div><div class="ssotpdf-value">${veiculo}</div></div>
        <div class="ssotpdf-field ssotpdf-full"><div class="ssotpdf-label">Finalidade</div><div class="ssotpdf-value">${finalidade}</div></div>
        <div class="ssotpdf-field ssotpdf-full"><div class="ssotpdf-label">Nomes dos Passageiros</div><div class="ssotpdf-value">${nomesPassageiros}</div></div>
        <div class="ssotpdf-field ssotpdf-full"><div class="ssotpdf-label">Necessidades Especiais</div><div class="ssotpdf-value">${necessidades}</div></div>
        <div class="ssotpdf-field ssotpdf-full"><div class="ssotpdf-label">Observações</div><div class="ssotpdf-value">${observacoes}</div></div>
      </div>

      <div class="ssotpdf-sig">
        <div class="ssotpdf-sig-line"></div>
        <div class="ssotpdf-sig-label">Assinatura do Solicitante</div>
      </div>

      <div class="ssotpdf-footer">
        <div class="ssotpdf-qr-wrap">
          <img src="${qrUrl}" alt="QR" crossorigin="anonymous">
          <div class="ssotpdf-qr-label">Escaneie para abrir esta solicitação no sistema.</div>
        </div>
        <div style="text-align:right;">
          <div>Criado em ${criadoEm}</div>
          <div>Documento gerado pelo SSOT</div>
        </div>
      </div>
    </div>
    `;
}

// ============================================================
// Geração do PDF (mantida igual)
// ============================================================
export async function generateRequestPDF(request) {
    if (!request) { console.error('[PDF] request vazio'); return; }
    if (typeof window.html2pdf === 'undefined') {
        alert('Biblioteca de PDF não carregada. Recarregue a página (Ctrl+Shift+R).');
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'ssot-pdf-render';
    wrapper.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'width: 210mm',
        'background: #ffffff',
        'z-index: 99990',
        'pointer-events: none'
    ].join(';');
    wrapper.innerHTML = buildRequestHTML(request);
    document.body.appendChild(wrapper);

    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position: fixed',
        'inset: 0',
        'z-index: 99999',
        'background: rgba(0,0,0,0.75)',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'color: #ffffff',
        'font-family: Arial, sans-serif',
        'font-size: 18px',
        'font-weight: 600'
    ].join(';');
    overlay.textContent = 'Gerando PDF...';
    document.body.appendChild(overlay);

    try {
        try { if (document.fonts?.ready) await document.fonts.ready; } catch (_) {}

        const imgs = wrapper.querySelectorAll('img');
        await Promise.all(Array.from(imgs).map(img => new Promise(res => {
            if (img.complete && img.naturalWidth > 0) return res();
            const done = () => res();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 3000);
        })));

        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 150));

        const docEl = wrapper.querySelector('.ssotpdf-doc');
        if (!docEl) throw new Error('Template do PDF não encontrado.');

        const cs = window.getComputedStyle(docEl);
        console.log('[PDF] display=%s visibility=%s opacity=%s dims=%dx%d',
            cs.display, cs.visibility, cs.opacity,
            docEl.offsetWidth, docEl.offsetHeight);

        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
            throw new Error(`Elemento invisível (display=${cs.display}, visibility=${cs.visibility}, opacity=${cs.opacity})`);
        }
        if (docEl.offsetWidth < 100 || docEl.offsetHeight < 100) {
            throw new Error(`Dimensões inválidas: ${docEl.offsetWidth}×${docEl.offsetHeight}`);
        }

        await window.html2pdf().set({
            margin: 0,
            filename: `SSOT-${safe(request.numero, 'solicitacao')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                logging: false,
                backgroundColor: '#ffffff'
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(docEl).save();

        console.log('[PDF] Gerado com sucesso.');
    } catch (err) {
        console.error('[PDF] Erro:', err);
        alert('Erro ao gerar PDF: ' + (err.message || err));
    } finally {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
}
