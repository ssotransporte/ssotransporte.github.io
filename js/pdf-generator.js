// ============================================================
// SSOT · PDF Generator v6
// - QR baixado como base64 ANTES de gerar (bug de CORS resolvido)
// - Linha de assinatura como <div> sólido (border-top pode falhar)
// - Padding top 3mm (mais no topo)
// - Fontes +1px em tudo
// - Sem fallback de remoção (não vai apagar mais nada)
// ============================================================

import { formatDateTime, escapeHtml, getStatusText, getVeiculoText } from './utils.js';

console.log('[PDF] ✅ v6 carregado em', new Date().toISOString());

const safe = (v, f = '—') => (v === null || v === undefined || v === '') ? f : String(v);
const e = (v, f = '—') => escapeHtml(safe(v, f));

// ============================================================
// Baixa o QR e converte para base64 (data URL)
// ============================================================
async function fetchQRAsBase64(deepLink) {
    const encoded = encodeURIComponent(deepLink);
    const apis = [
        `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`,
        `https://quickchart.io/qr?text=${encoded}&size=200&margin=1`,
        `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&format=png`
    ];

    for (const url of apis) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const resp = await fetch(url, { cache: 'no-cache', signal: controller.signal });
            clearTimeout(timeout);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const blob = await resp.blob();
            if (!blob || blob.size < 100) throw new Error('Blob vazio');

            const dataUrl = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsDataURL(blob);
            });

            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
                console.log('[PDF] ✅ QR obtido como base64 de:', url.split('?')[0], '| tamanho:', Math.round(blob.size / 1024) + 'KB');
                return dataUrl;
            }
            throw new Error('Data URL inválida');
        } catch (err) {
            console.warn('[PDF] ⚠️ QR falhou em', url.split('?')[0], '-', err.message);
        }
    }

    console.error('[PDF] ❌ Nenhuma API de QR funcionou — PDF sairá sem QR');
    return null;
}

// ============================================================
// Estilos 100% inline
// ============================================================
const S = {
    doc:     'width:210mm;padding:3mm 8mm 4mm 8mm;background:#fff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.3;box-sizing:border-box;margin:0;',
    header:  'display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1e3a5f;padding-bottom:6px;margin-bottom:8px;',
    brand:   'display:flex;align-items:center;gap:10px;',
    logo:    'width:52px;height:52px;background:#1e3a5f;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:bold;',
    brandH:  'font-size:26px;color:#1e3a5f;font-weight:bold;margin:0;line-height:1.1;',
    brandP:  'font-size:12px;color:#666;margin:2px 0 0 0;',
    meta:    'text-align:right;font-size:13px;color:#555;',
    num:     'font-size:24px;font-weight:bold;color:#1e3a5f;margin-bottom:3px;',
    badge:   'display:inline-block;padding:3px 10px;border-radius:10px;font-size:14px;font-weight:bold;background:#e8eef5;color:#1e3a5f;',
    section: 'font-size:17px;font-weight:bold;color:#1e3a5f;text-transform:uppercase;letter-spacing:0.5px;border-left:4px solid #1e3a5f;padding-left:8px;margin:10px 0 5px 0;line-height:1.2;',
    grid:    'display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;',
    grid3:   'display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 14px;',
    field:   'padding:2px 0;border-bottom:1px dotted #ddd;',
    fieldFull: 'grid-column:1/-1;padding:2px 0;border-bottom:1px dotted #ddd;',
    label:   'font-size:12px;color:#777;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:1px;font-weight:bold;',
    value:   'font-size:16px;color:#111;font-weight:500;line-height:1.3;',
    sigWrap: 'text-align:center;margin-top:24px;',
    sigLine: 'height:1px;background:#333;width:300px;margin:34px auto 6px auto;',
    sigLabel:'font-size:13px;color:#555;',
    footer:  'margin-top:16px;padding-top:10px;border-top:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#666;',
    qrWrap:  'display:flex;align-items:center;gap:12px;',
    qrImg:   'width:80px;height:80px;display:block;border:1px solid #eee;',
    qrLabel: 'font-size:11px;color:#666;max-width:140px;'
};

const field = (label, value, full = false) =>
    `<div style="${full ? S.fieldFull : S.field}"><div style="${S.label}">${label}</div><div style="${S.value}">${value}</div></div>`;

// ============================================================
// Template (recebe o QR já em base64)
// ============================================================
function buildRequestHTML(r, qrDataUrl) {
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

    // QR: usa base64 se disponível, senão placeholder visível
    const qrHTML = qrDataUrl
        ? `<img src="${qrDataUrl}" alt="QR" style="${S.qrImg}">`
        : `<div style="width:80px;height:80px;border:2px dashed #c00;background:#fee;display:flex;align-items:center;justify-content:center;font-size:9px;color:#c00;text-align:center;padding:4px;box-sizing:border-box;">QR<br>indisponível</div>`;

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

      <div style="${S.sigWrap}">
        <div style="${S.sigLine}"></div>
        <div style="${S.sigLabel}">Assinatura do Solicitante</div>
      </div>

      <div style="${S.footer}">
        <div style="${S.qrWrap}">
          ${qrHTML}
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
    console.log('[PDF] ▶ v6 chamado | numero:', request?.numero);

    if (!request) { console.error('[PDF] request vazio'); return; }
    if (typeof window.html2pdf === 'undefined') {
        alert('html2pdf não carregado. Recarregue com Ctrl+Shift+R.');
        return;
    }

    // ⭐ 1) Baixa o QR ANTES de tudo
    const baseUrl  = window.location.origin + window.location.pathname;
    const deepLink = `${baseUrl}?request=${encodeURIComponent(request.id || '')}`;
    const qrDataUrl = await fetchQRAsBase64(deepLink);
    console.log('[PDF] QR base64 disponível?', qrDataUrl ? 'SIM ✅' : 'NÃO ❌');

    // ⭐ 2) Cria o wrapper com o QR já embutido
    const wrapper = document.createElement('div');
    wrapper.id = 'ssot-pdf-render';
    wrapper.style.cssText = 'position:fixed;top:0;left:0;width:210mm;background:#fff;z-index:99990;margin:0;padding:0;';
    wrapper.innerHTML = buildRequestHTML(request, qrDataUrl);
    document.body.appendChild(wrapper);

    // ⭐ 3) Overlay cobre tudo
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;color:#fff;font-family:Arial,sans-serif;font-size:20px;font-weight:600;';
    overlay.textContent = 'Gerando PDF...';
    document.body.appendChild(overlay);

    try {
        // Espera fontes
        try { if (document.fonts?.ready) await document.fonts.ready; } catch (_) {}

        // Espera imagens (QR base64 é instantâneo, mas por segurança)
        const imgs = wrapper.querySelectorAll('img');
        await Promise.all(Array.from(imgs).map(img => new Promise(res => {
            if (img.complete && img.naturalWidth > 0) return res();
            img.addEventListener('load', () => res(), { once: true });
            img.addEventListener('error', () => res(), { once: true });
            setTimeout(res, 2000);
        })));

        // 2 frames + 150ms
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 150));

        const docEl = wrapper.querySelector('.ssotpdf-doc');
        if (!docEl) throw new Error('Template não encontrado.');

        // Log de diagnóstico completo
        const cs = window.getComputedStyle(docEl);
        console.log('[PDF] DIAGNÓSTICO:');
        console.log('  - font-size:', cs.fontSize, '| padding:', cs.padding);
        console.log('  - dimensões:', docEl.offsetWidth + '×' + docEl.offsetHeight, '(A4=793×1123)');
        console.log('  - QR no DOM:', wrapper.querySelectorAll('img').length, 'imagem(ns)');
        console.log('  - Assinatura no DOM:', wrapper.querySelectorAll('div[style*="height:1px"]').length, 'linha(s)');
        console.log('  - Altura total:', docEl.offsetHeight, 'px →', docEl.offsetHeight > 1123 ? '⚠️ VAI ESTOURAR' : '✅ cabe em 1 página');

        // ⭐ SEM fallback de remoção — confia no layout
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
                height: docEl.offsetHeight,
                windowWidth: docEl.offsetWidth,
                windowHeight: docEl.offsetHeight,
                scrollX: -window.scrollX,
                scrollY: -window.scrollY
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all'] }
        }).from(docEl).save();

        console.log('[PDF] ✅ PDF gerado com sucesso.');
    } catch (err) {
        console.error('[PDF] ❌ Erro:', err);
        alert('Erro ao gerar PDF: ' + (err.message || err));
    } finally {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
}
