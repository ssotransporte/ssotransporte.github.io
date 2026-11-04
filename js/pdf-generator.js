// ============================================================
// SSOT · PDF Generator v5
// - Mais próximo do topo (padding 4mm)
// - Fontes +1px a +2px
// - QR Code e assinatura de volta
// - Fallback: remove assinatura/QR se estourar a página
// ============================================================

import { formatDateTime, escapeHtml, getStatusText, getVeiculoText } from './utils.js';

console.log('[PDF] ✅ v5-INLINE carregado em', new Date().toISOString());

const safe = (v, f = '—') => (v === null || v === undefined || v === '') ? f : String(v);
const e = (v, f = '—') => escapeHtml(safe(v, f));

// ============================================================
// Estilos 100% inline (strings)
// ============================================================
const S = {
    doc:     'width:210mm;padding:4mm 8mm 6mm 8mm;background:#fff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.3;box-sizing:border-box;margin:0;',
    header:  'display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1e3a5f;padding-bottom:6px;margin-bottom:8px;',
    brand:   'display:flex;align-items:center;gap:10px;',
    logo:    'width:50px;height:50px;background:#1e3a5f;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;',
    brandH:  'font-size:24px;color:#1e3a5f;font-weight:bold;margin:0;line-height:1.1;',
    brandP:  'font-size:12px;color:#666;margin:2px 0 0 0;',
    meta:    'text-align:right;font-size:12px;color:#555;',
    num:     'font-size:22px;font-weight:bold;color:#1e3a5f;margin-bottom:3px;',
    badge:   'display:inline-block;padding:3px 10px;border-radius:10px;font-size:13px;font-weight:bold;background:#e8eef5;color:#1e3a5f;',
    section: 'font-size:16px;font-weight:bold;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.5px;border-left:4px solid #1e3a5f;padding-left:8px;margin:10px 0 5px 0;line-height:1.2;',
    grid:    'display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;',
    grid3:   'display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 14px;',
    field:   'padding:2px 0;border-bottom:1px dotted #ddd;',
    fieldFull: 'grid-column:1/-1;padding:2px 0;border-bottom:1px dotted #ddd;',
    label:   'font-size:11px;color:#777;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:1px;font-weight:bold;',
    value:   'font-size:15px;color:#111;font-weight:500;line-height:1.3;',
    sig:     'text-align:center;margin-top:22px;',
    sigLine: 'border-top:1px solid #333;width:280px;margin:32px auto 5px auto;',
    sigLabel:'font-size:12px;color:#555;',
    footer:  'margin-top:16px;padding-top:10px;border-top:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#666;',
    qrWrap:  'display:flex;align-items:center;gap:12px;',
    qrImg:   'width:80px;height:80px;display:block;',
    qrLabel: 'font-size:10px;color:#666;max-width:140px;'
};

const field = (label, value, full = false) =>
    `<div style="${full ? S.fieldFull : S.field}"><div style="${S.label}">${label}</div><div style="${S.value}">${value}</div></div>`;

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
    <div style="${S.doc}" class="ssotpdf-doc">
      <div style="${S.header}">
        <div style="${S.brand}">
          <div style="${S.logo}">S</div>
          <div>
            <h1 style="${S.brandH}">SSOT</h1>
            <p style="${S.brandP}">Sistema de Solicitações e Operações de Transporte</p>
          </div>
        </div>
        <div style="${S.meta}">
          <div style="${S.num}">${numero}</div>
          <div>Emitido em ${emitidoEm}</div>
          <div style="margin-top:4px;"><span style="${S.badge}">${status}</span></div>
        </div>
      </div>

      <div style="${S.section}">Dados do Solicitante</div>
      <div style="${S.grid3}">
        ${field('Nome', solicitante)}
        ${field('E-mail', email)}
        ${field('Ramal', ramal)}
        ${field('Setor', setor)}
        ${field('Cargo', cargo)}
        ${field('Prioridade', prioridade)}
      </div>

      <div style="${S.section}">Detalhes da Viagem</div>
      <div style="${S.grid}">
        ${field('Destino', destino)}
        ${field('Origem', origem)}
        ${field('Saída', saida)}
        ${field('Retorno', retorno)}
        ${field('Passageiros', passageiros)}
        ${field('Veículo', veiculo)}
        ${field('Finalidade', finalidade, true)}
        ${field('Nomes dos Passageiros', nomesPassageiros, true)}
        ${field('Necessidades Especiais', necessidades, true)}
        ${field('Observações', observacoes, true)}
      </div>

      <div style="${S.sig}" class="ssotpdf-sig">
        <div style="${S.sigLine}"></div>
        <div style="${S.sigLabel}">Assinatura do Solicitante</div>
      </div>

      <div style="${S.footer}" class="ssotpdf-footer">
        <div style="${S.qrWrap}" class="ssotpdf-qr-wrap">
          <img src="${qrUrl}" alt="QR" crossorigin="anonymous" style="${S.qrImg}">
          <div style="${S.qrLabel}">Escaneie para abrir esta solicitação no sistema.</div>
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
// Geração
// ============================================================
export async function generateRequestPDF(request) {
    console.log('[PDF] ▶ chamado | numero:', request?.numero);

    if (!request) { console.error('[PDF] request vazio'); return; }
    if (typeof window.html2pdf === 'undefined') {
        alert('html2pdf não carregado. Recarregue com Ctrl+Shift+R.');
        return;
    }

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

        // ⭐ FALLBACK INTELIGENTE: se estourar 1123px, remove assinatura e depois QR
        const A4_HEIGHT = 1123;
        const measure = () => docEl.offsetHeight;
        let h = measure();
        console.log('[PDF] Altura inicial:', h, 'px (limite A4:', A4_HEIGHT + 'px)');

        if (h > A4_HEIGHT) {
            const sig = docEl.querySelector('.ssotpdf-sig');
            if (sig) {
                sig.remove();
                h = measure();
                console.log('[PDF] Assinatura removida. Nova altura:', h);
            }
        }

        if (h > A4_HEIGHT) {
            const qr = docEl.querySelector('.ssotpdf-qr-wrap');
            if (qr) {
                qr.remove();
                h = measure();
                console.log('[PDF] QR removido. Nova altura:', h);
            }
        }

        if (h > A4_HEIGHT) {
            console.warn('[PDF] ⚠️ Ainda', h, 'px > 1123px — 2ª página inevitável.');
        } else {
            console.log('[PDF] ✅ Altura ok (%dpx) → 1 página A4', h);
        }

        const cs = window.getComputedStyle(docEl);
        console.log('[PDF] Computed → font-size=%s padding=%s', cs.fontSize, cs.padding);

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
                width: docEl.offsetWidth,
                height: Math.min(docEl.offsetHeight, A4_HEIGHT)
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all'] }
        }).from(docEl).save();

        console.log('[PDF] ✅ Gerado com sucesso.');
    } catch (err) {
        console.error('[PDF] ❌ Erro:', err);
        alert('Erro ao gerar PDF: ' + (err.message || err));
    } finally {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
}
