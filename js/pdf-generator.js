// ============================================================
// SSOT · Gerador de PDF (comprovante de solicitação)
// Gera 1 página A4 real, sem "print de tela" e sem páginas em branco
// ============================================================

import { formatDateTime, escapeHtml, getStatusText, getVeiculoText } from './utils.js';

// Helper defensivo: nunca retorna undefined/null, sempre string
const safe = (v, fallback = '—') => {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
};

const e = (v, fallback = '—') => escapeHtml(safe(v, fallback));

// ============================================================
// Template HTML do comprovante (CSS 100% inline)
// ============================================================
function buildRequestHTML(r) {
    const numero     = e(r.numero);
    const solicitante = e(r.solicitante);
    const email      = e(r.email);
    const ramal      = e(r.ramal);
    const setor      = e(r.setor);
    const cargo      = e(r.cargo);
    const destino    = e(r.destino);
    const origem     = e(r.origem);
    const finalidade = e(r.finalidade);
    const prioridade = e(r.prioridade, 'normal');
    const saida      = r.saida   ? formatDateTime(r.saida)   : '—';
    const retorno    = r.retorno ? formatDateTime(r.retorno) : '—';
    const passageiros = e(r.passageiros, '1');
    const veiculo    = r.veiculo ? getVeiculoText(r.veiculo) : '—';
    const necessidades = e(r.necessidades);
    const nomesPassageiros = e(r.nomesPassageiros, '—').replace(/\n/g, '<br>');
    const observacoes = e(r.observacoes, '—').replace(/\n/g, '<br>');
    const status     = e(getStatusText(r.status), 'Pendente');
    const criadoEm   = r.timestamp ? formatDateTime(r.timestamp) : '—';
    const emitidoEm = formatDateTime(new Date().toISOString());

    const baseUrl = window.location.origin + window.location.pathname;
    const deepLink = `${baseUrl}?request=${encodeURIComponent(r.id || '')}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(deepLink)}`;

    return `
    <style>
      .pdf-doc, .pdf-doc * { box-sizing: border-box; margin: 0; padding: 0; }
      .pdf-doc {
        width: 210mm;
        min-height: 297mm;
        padding: 14mm 15mm;
        background: #ffffff;
        color: #1a1a1a;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        line-height: 1.45;
      }
      .pdf-doc .header {
        display: flex; align-items: center; justify-content: space-between;
        border-bottom: 2px solid #1e3a5f;
        padding-bottom: 10px; margin-bottom: 14px;
      }
      .pdf-doc .brand { display: flex; align-items: center; gap: 10px; }
      .pdf-doc .brand-logo {
        width: 44px; height: 44px;
        background: #1e3a5f; color: #fff;
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        font-size: 22px; font-weight: bold;
      }
      .pdf-doc .brand-text h1 { font-size: 16px; color: #1e3a5f; }
      .pdf-doc .brand-text p  { font-size: 9px; color: #666; margin-top: 2px; }
      .pdf-doc .header-meta { text-align: right; font-size: 9px; color: #555; }
      .pdf-doc .header-meta .numero {
        font-size: 14px; font-weight: bold; color: #1e3a5f; margin-bottom: 2px;
      }
      .pdf-doc .badge {
        display: inline-block; padding: 2px 8px; border-radius: 10px;
        font-size: 9px; font-weight: bold; background: #e8eef5; color: #1e3a5f;
      }
      .pdf-doc .section-title {
        font-size: 11px; font-weight: bold; color: #1e3a5f;
        text-transform: uppercase; letter-spacing: 0.5px;
        border-left: 3px solid #1e3a5f;
        padding-left: 8px; margin: 14px 0 8px;
      }
      .pdf-doc .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
      .pdf-doc .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
      .pdf-doc .field { padding: 4px 0; border-bottom: 1px dotted #ddd; }
      .pdf-doc .field.full { grid-column: 1 / -1; }
      .pdf-doc .field .label {
        font-size: 8px; color: #888;
        text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 1px;
      }
      .pdf-doc .field .value { font-size: 10.5px; color: #111; font-weight: 500; }
      .pdf-doc .footer {
        margin-top: 22px; padding-top: 10px;
        border-top: 1px solid #ccc;
        display: flex; justify-content: space-between; align-items: center;
        font-size: 8.5px; color: #666;
      }
      .pdf-doc .qr-wrap { display: flex; align-items: center; gap: 10px; }
      .pdf-doc .qr-wrap img { width: 70px; height: 70px; display: block; }
      .pdf-doc .qr-label { font-size: 8px; color: #666; max-width: 110px; }
      .pdf-doc .sig { text-align: center; margin-top: 18px; }
      .pdf-doc .sig-line { border-top: 1px solid #333; width: 200px; margin: 24px auto 4px; }
      .pdf-doc .sig-label { font-size: 8.5px; color: #555; }
    </style>
    <div class="pdf-doc">
      <div class="header">
        <div class="brand">
          <div class="brand-logo">S</div>
          <div class="brand-text">
            <h1>SSOT</h1>
            <p>Sistema de Solicitações e Operações de Transporte</p>
          </div>
        </div>
        <div class="header-meta">
          <div class="numero">${numero}</div>
          <div>Emitido em ${emitidoEm}</div>
          <div style="margin-top:4px;"><span class="badge">${status}</span></div>
        </div>
      </div>

      <div class="section-title">Dados do Solicitante</div>
      <div class="grid grid-3">
        <div class="field"><div class="label">Nome</div><div class="value">${solicitante}</div></div>
        <div class="field"><div class="label">E-mail</div><div class="value">${email}</div></div>
        <div class="field"><div class="label">Ramal</div><div class="value">${ramal}</div></div>
        <div class="field"><div class="label">Setor</div><div class="value">${setor}</div></div>
        <div class="field"><div class="label">Cargo</div><div class="value">${cargo}</div></div>
        <div class="field"><div class="label">Prioridade</div><div class="value">${prioridade}</div></div>
      </div>

      <div class="section-title">Detalhes da Viagem</div>
      <div class="grid">
        <div class="field"><div class="label">Destino</div><div class="value">${destino}</div></div>
        <div class="field"><div class="label">Origem</div><div class="value">${origem}</div></div>
        <div class="field"><div class="label">Saída</div><div class="value">${saida}</div></div>
        <div class="field"><div class="label">Retorno</div><div class="value">${retorno}</div></div>
        <div class="field"><div class="label">Passageiros</div><div class="value">${passageiros}</div></div>
        <div class="field"><div class="label">Veículo</div><div class="value">${veiculo}</div></div>
        <div class="field full"><div class="label">Finalidade</div><div class="value">${finalidade}</div></div>
        <div class="field full"><div class="label">Nomes dos Passageiros</div><div class="value">${nomesPassageiros}</div></div>
        <div class="field full"><div class="label">Necessidades Especiais</div><div class="value">${necessidades}</div></div>
        <div class="field full"><div class="label">Observações</div><div class="value">${observacoes}</div></div>
      </div>

      <div class="sig">
        <div class="sig-line"></div>
        <div class="sig-label">Assinatura do Solicitante</div>
      </div>

      <div class="footer">
        <div class="qr-wrap">
          <img src="${qrUrl}" alt="QR" crossorigin="anonymous">
          <div class="qr-label">Escaneie para abrir esta solicitação no sistema.</div>
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
// Geração do PDF (A4, 1 página, alta qualidade)
// ============================================================
export async function generateRequestPDF(request) {
    if (!request) {
        console.error('[PDF] request vazio');
        return;
    }
    if (typeof window.html2pdf === 'undefined') {
        alert('Biblioteca de PDF não carregada. Recarregue a página.');
        return;
    }

    // 1) Cria container REAL, anexado ao DOM, com dimensões reais.
    //    Posicionado fora da tela (NÃO usar display:none — html2canvas não vê).
    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
        'position: fixed',
        'left: -10000px',
        'top: 0',
        'width: 210mm',
        'background: #ffffff',
        'z-index: 1',
        'pointer-events: none'
    ].join(';');
    wrapper.innerHTML = buildRequestHTML(request);
    document.body.appendChild(wrapper);

    // 2) Espera as fontes carregarem (evita texto virar blocos)
    try {
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
    } catch (_) { /* ignorar */ }

    // 3) Espera o QR Code carregar (com timeout — se falhar, PDF sai sem QR)
    const img = wrapper.querySelector('img');
    if (img) {
        await new Promise((resolve) => {
            if (img.complete && img.naturalWidth > 0) return resolve();
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 4000);
        });
    }

    // 4) Dá 2 frames para o layout assentar (evita capturar antes do paint)
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    await new Promise(res => setTimeout(res, 120));

    // 5) Gera o PDF a partir do .pdf-doc (o <style> continua ativo no DOM)
    const docEl = wrapper.querySelector('.pdf-doc');
    if (!docEl) {
        document.body.removeChild(wrapper);
        throw new Error('Template do PDF não encontrado.');
    }

    try {
        await window.html2pdf().set({
            margin: 0,
            filename: `SSOT-${safe(request.numero, 'solicitacao')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                logging: false,
                backgroundColor: '#ffffff',
                scrollX: 0,
                scrollY: 0,
                windowWidth: docEl.scrollWidth,
                windowHeight: docEl.scrollHeight
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(docEl).save();
    } finally {
        // 6) Sempre limpa o container, mesmo em erro
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
}