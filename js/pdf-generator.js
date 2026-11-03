// ============================================================
// SSOT · Gerador de PDF v3
// Correções: sem min-height (evita 2ª página) + CSS no <head>
// + fontes maiores + layout compacto no topo
// ============================================================

import { formatDateTime, escapeHtml, getStatusText, getVeiculoText } from './utils.js';

const PDF_VERSION = 'v3-2024-11-03';
console.log('[PDF] Módulo carregado:', PDF_VERSION);

const safe = (v, fallback = '—') => {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
};
const e = (v, fallback = '—') => escapeHtml(safe(v, fallback));

// ============================================================
// CSS injetado no <head> (garante aplicação)
// ============================================================
const PDF_CSS_ID = 'ssot-pdf-styles';

function injectStyles() {
    if (document.getElementById(PDF_CSS_ID)) return;
    const style = document.createElement('style');
    style.id = PDF_CSS_ID;
    style.textContent = `
      .ssotpdf-doc {
        width: 210mm !important;
        height: auto !important;
        padding: 8mm 10mm !important;
        background: #ffffff !important;
        color: #1a1a1a !important;
        font-family: Arial, Helvetica, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.35 !important;
        box-sizing: border-box !important;
        display: block !important;
      }
      .ssotpdf-doc * {
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .ssotpdf-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        border-bottom: 2px solid #1e3a5f !important;
        padding-bottom: 6px !important;
        margin-bottom: 8px !important;
      }
      .ssotpdf-brand {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
      }
      .ssotpdf-logo {
        width: 48px !important;
        height: 48px !important;
        background: #1e3a5f !important;
        color: #ffffff !important;
        border-radius: 8px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 26px !important;
        font-weight: bold !important;
      }
      .ssotpdf-brand h1 {
        font-size: 22px !important;
        color: #1e3a5f !important;
        font-weight: bold !important;
        line-height: 1.1 !important;
      }
      .ssotpdf-brand p {
        font-size: 11px !important;
        color: #666 !important;
        margin-top: 3px !important;
      }
      .ssotpdf-meta {
        text-align: right !important;
        font-size: 11px !important;
        color: #555 !important;
      }
      .ssotpdf-num {
        font-size: 20px !important;
        font-weight: bold !important;
        color: #1e3a5f !important;
        margin-bottom: 3px !important;
      }
      .ssotpdf-badge {
        display: inline-block !important;
        padding: 3px 10px !important;
        border-radius: 10px !important;
        font-size: 11px !important;
        font-weight: bold !important;
        background: #e8eef5 !important;
        color: #1e3a5f !important;
      }
      .ssotpdf-section {
        font-size: 14px !important;
        font-weight: bold !important;
        color: #1e3a5f !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        border-left: 4px solid #1e3a5f !important;
        padding-left: 8px !important;
        margin: 10px 0 4px !important;
        line-height: 1.2 !important;
      }
      .ssotpdf-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 2px 14px !important;
      }
      .ssotpdf-grid-3 { grid-template-columns: 1fr 1fr 1fr !important; }
      .ssotpdf-field {
        padding: 2px 0 !important;
        border-bottom: 1px dotted #ddd !important;
      }
      .ssotpdf-full { grid-column: 1 / -1 !important; }
      .ssotpdf-label {
        font-size: 10px !important;
        color: #777 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.3px !important;
        margin-bottom: 1px !important;
        font-weight: bold !important;
      }
      .ssotpdf-value {
        font-size: 13px !important;
        color: #111 !important;
        font-weight: 500 !important;
        line-height: 1.3 !important;
      }
      .ssotpdf-sig {
        text-align: center !important;
        margin-top: 14px !important;
      }
      .ssotpdf-sig-line {
        border-top: 1px solid #333 !important;
        width: 240px !important;
        margin: 20px auto 4px !important;
      }
      .ssotpdf-sig-label {
        font-size: 11px !important;
        color: #555 !important;
      }
      .ssotpdf-footer {
        margin-top: 12px !important;
        padding-top: 8px !important;
        border-top: 1px solid #ccc !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        font-size: 10.5px !important;
        color: #666 !important;
      }
      .ssotpdf-qr-wrap {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
      }
      .ssotpdf-qr-wrap img {
        width: 70px !important;
        height: 70px !important;
        display: block !important;
      }
      .ssotpdf-qr-label {
        font-size: 10px !important;
        color: #666 !important;
        max-width: 120px !important;
      }
    `;
    document.head.appendChild(style);
}

// ============================================================
// Template
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
// Geração do PDF
// ============================================================
export async function generateRequestPDF(request) {
    console.log('[PDF] generateRequestPDF chamado', PDF_VERSION, '| numero:', request?.numero);

    if (!request) { console.error('[PDF] request vazio'); return; }
    if (typeof window.html2pdf === 'undefined') {
        alert('Biblioteca PDF não carregada. Recarregue com Ctrl+Shift+R.');
        return;
    }

    injectStyles();

    const wrapper = document.createElement('div');
    wrapper.id = 'ssot-pdf-render';
    wrapper.style.cssText = 'position:fixed;top:0;left:0;width:210mm;background:#fff;z-index:99990;pointer-events:none;';
    wrapper.innerHTML = buildRequestHTML(request);
    document.body.appendChild(wrapper);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;color:#fff;font-family:Arial,sans-serif;font-size:20px;font-weight:600;';
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
        await new Promise(r => setTimeout(r, 100));

        const docEl = wrapper.querySelector('.ssotpdf-doc');
        if (!docEl) throw new Error('Template não encontrado.');

        const cs = window.getComputedStyle(docEl);
        console.log('[PDF] Computed: font-size=%s padding=%s display=%s dims=%dx%d',
            cs.fontSize, cs.padding, cs.display, docEl.offsetWidth, docEl.offsetHeight);

        // ⭐ FIX das 2 páginas: pagebreak avoid-all
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
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all'] }
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
