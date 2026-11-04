// ============================================================
// SSOT · PDF Generator v8
// - QR gerado localmente via qrcode-generator (sem CORS)
// - Linha de assinatura como div sólido
// - Truncagem automática de texto se estourar A4
// ============================================================

import { formatDateTime, escapeHtml, getStatusText, getVeiculoText } from './utils.js';

console.log('[PDF] ✅ v8 carregado em', new Date().toISOString());

const safe = (v, f = '—') => (v === null || v === undefined || v === '') ? f : String(v);
const e = (v, f = '—') => escapeHtml(safe(v, f));

// ============================================================
// Carrega qrcode-generator dinamicamente (sem precisar mexer no HTML)
// ============================================================
async function ensureQRCodeLib() {
    if (typeof window.qrcode !== 'undefined') return true;
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
        setTimeout(() => resolve(typeof window.qrcode !== 'undefined'), 5000);
    });
}

// ============================================================
// Gera QR → data URL base64 (PNG/GIF embutido)
// ============================================================
function generateQRDataURL(text) {
    if (typeof window.qrcode === 'undefined') {
        console.warn('[PDF] qrcode-generator não disponível');
        return null;
    }
    try {
        const qr = window.qrcode(0, 'M'); // 0 = auto, M = error correction
        qr.addData(text);
        qr.make();
        const dataUrl = qr.createDataURL(6, 2); // cellSize=6, margin=2
        console.log('[PDF] ✅ QR gerado localmente (len:', dataUrl.length, 'chars)');
        return dataUrl;
    } catch (err) {
        console.error('[PDF] ❌ Erro ao gerar QR:', err);
        return null;
    }
}

// ============================================================
// Trunca textos se altura estourar A4
// ============================================================
function fitToPage(docEl) {
    const A4 = 1123;
    let attempts = 0;
    while (docEl.offsetHeight > A4 && attempts < 15) {
        const fulls = Array.from(docEl.querySelectorAll('[data-ssot-full]'));
        let biggest = null, len = 0;
        for (const f of fulls) {
            const v = f.querySelector('[data-ssot-value]');
            if (v && v.textContent.length > len) { len = v.textContent.length; biggest = v; }
        }
        if (biggest && biggest.textContent.length > 60) {
            const cut = Math.max(60, Math.floor(biggest.textContent.length * 0.7));
            biggest.textContent = biggest.textContent.substring(0, cut) + '…';
            attempts++;
        } else break;
    }
    return docEl.offsetHeight;
}

// ============================================================
// Template
// ============================================================
const F = (label, value, full = false) => `
  <div ${full ? 'data-ssot-full' : ''} style="padding:3px 0;border-bottom:1px dotted #ddd;${full ? 'grid-column:1/-1;' : ''}">
    <div style="font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.3px;font-weight:bold;margin-bottom:1px;">${label}</div>
    <div data-ssot-value style="font-size:16px;color:#111;font-weight:500;line-height:1.3;">${value}</div>
  </div>`;

function buildHTML(r, qrDataUrl) {
    const emitidoEm = formatDateTime(new Date().toISOString());
    const status = e(getStatusText(r.status), 'Pendente');
    const base = 'width:210mm;padding:5mm 10mm;background:#fff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;margin:0;';

    const qrHTML = qrDataUrl
        ? `<img data-ssot-qr src="${qrDataUrl}" alt="QR" style="width:80px;height:80px;display:block;border:1px solid #eee;">`
        : `<div style="width:80px;height:80px;border:2px dashed #c00;background:#fee;display:flex;align-items:center;justify-content:center;font-size:10px;color:#c00;text-align:center;padding:4px;box-sizing:border-box;">QR<br>falhou</div>`;

    return `
<div style="${base}" class="ssotpdf-doc">

  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:50px;height:50px;background:#1e3a5f;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;">S</div>
      <div>
        <h1 style="font-size:24px;color:#1e3a5f;font-weight:bold;margin:0;line-height:1.1;">SSOT</h1>
        <p style="font-size:12px;color:#666;margin:2px 0 0 0;">Sistema de Solicitações e Operações de Transporte</p>
      </div>
    </div>
    <div style="text-align:right;font-size:13px;color:#555;">
      <div style="font-size:22px;font-weight:bold;color:#1e3a5f;margin-bottom:3px;">${e(r.numero)}</div>
      <div>Emitido em ${emitidoEm}</div>
      <div style="margin-top:4px;"><span style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:13px;font-weight:bold;background:#e8eef5;color:#1e3a5f;">${status}</span></div>
    </div>
  </div>

  <div style="font-size:16px;font-weight:bold;color:#1e3a5f;text-transform:uppercase;border-left:4px solid #1e3a5f;padding-left:8px;margin:12px 0 6px;">Dados do Solicitante</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 14px;">
    ${F('Nome', e(r.solicitante))}
    ${F('E-mail', e(r.email))}
    ${F('Ramal', e(r.ramal))}
    ${F('Setor', e(r.setor))}
    ${F('Cargo', e(r.cargo))}
    ${F('Prioridade', e(r.prioridade, 'normal'))}
  </div>

  <div style="font-size:16px;font-weight:bold;color:#1e3a5f;text-transform:uppercase;border-left:4px solid #1e3a5f;padding-left:8px;margin:12px 0 6px;">Detalhes da Viagem</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;">
    ${F('Destino', e(r.destino))}
    ${F('Origem', e(r.origem))}
    ${F('Saída', r.saida ? formatDateTime(r.saida) : '—')}
    ${F('Retorno', r.retorno ? formatDateTime(r.retorno) : '—')}
    ${F('Passageiros', e(r.passageiros, '1'))}
    ${F('Veículo', r.veiculo ? getVeiculoText(r.veiculo) : '—')}
    ${r.finalidade ? F('Finalidade', e(r.finalidade), true) : ''}
    ${r.nomesPassageiros ? F('Nomes dos Passageiros', e(r.nomesPassageiros).replace(/\n/g, '<br>'), true) : ''}
    ${r.necessidades ? F('Necessidades Especiais', e(r.necessidades), true) : ''}
    ${r.observacoes ? F('Observações', e(r.observacoes).replace(/\n/g, '<br>'), true) : ''}
  </div>

  <div style="text-align:center;margin-top:24px;">
    <div data-ssot-sig style="height:1px;background:#333;width:300px;margin:34px auto 6px;"></div>
    <div style="font-size:13px;color:#555;">Assinatura do Solicitante</div>
  </div>

  <div style="margin-top:18px;padding-top:10px;border-top:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#666;">
    <div style="display:flex;align-items:center;gap:12px;">
      ${qrHTML}
      <div style="font-size:11px;color:#666;max-width:140px;">Escaneie para abrir esta solicitação no sistema.</div>
    </div>
    <div style="text-align:right;">
      <div>Criado em ${r.timestamp ? formatDateTime(r.timestamp) : '—'}</div>
      <div>Documento gerado pelo SSOT</div>
    </div>
  </div>

</div>`;
}

// ============================================================
// Geração
// ============================================================
export async function generateRequestPDF(request) {
    console.log('[PDF] ▶ v8 chamado | numero:', request?.numero);
    if (!request) return;
    if (typeof window.html2pdf === 'undefined') {
        alert('html2pdf não carregado. Recarregue com Ctrl+Shift+R.');
        return;
    }

    // 1. Carrega qrcode-generator
    const libOk = await ensureQRCodeLib();
    console.log('[PDF] qrcode-generator:', libOk ? '✅' : '❌');

    // 2. Gera QR local
    const baseUrl = window.location.origin + window.location.pathname;
    const deepLink = `${baseUrl}?request=${encodeURIComponent(request.id || '')}`;
    const qrDataUrl = generateQRDataURL(deepLink);

    // 3. Wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;top:0;left:0;width:210mm;background:#fff;z-index:99990;pointer-events:none;';
    wrapper.innerHTML = buildHTML(request, qrDataUrl);
    document.body.appendChild(wrapper);

    // 4. Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;color:#fff;font-family:Arial,sans-serif;font-size:20px;font-weight:600;';
    overlay.textContent = 'Gerando PDF...';
    document.body.appendChild(overlay);

    try {
        try { if (document.fonts?.ready) await document.fonts.ready; } catch (_) {}
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 150));

        const docEl = wrapper.querySelector('.ssotpdf-doc');
        let h = docEl.offsetHeight;
        console.log('[PDF] altura antes:', h, 'px');

        if (h > 1123) {
            h = fitToPage(docEl);
            console.log('[PDF] altura após truncagem:', h, 'px');
        }

        console.log('[PDF] QR no DOM:', docEl.querySelectorAll('[data-ssot-qr]').length,
                    '| Assinatura no DOM:', docEl.querySelectorAll('[data-ssot-sig]').length,
                    '| Altura final:', h, h > 1123 ? '⚠️' : '✅');

        await window.html2pdf().set({
            margin: 0,
            filename: `SSOT-${safe(request.numero, 'solicitacao')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#fff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all'] }
        }).from(docEl).save();

        console.log('[PDF] ✅ gerado.');
    } catch (err) {
        console.error('[PDF] ❌', err);
        alert('Erro: ' + err.message);
    } finally {
        overlay.remove();
        wrapper.remove();
    }
}
