// ============================================================
// SSOT · Gerador de PDF — Comprovante Oficial de Solicitação
// v2.0 · A4 1 página · Texto nítido · Design institucional
// ============================================================

import { formatDateTime, escapeHtml, getStatusText, getVeiculoText } from './utils.js';
import { sstAlert } from './dialogs.js';

// -------- helpers defensivos --------
const safe = (v, fallback = '—') =>
    (v === null || v === undefined || v === '' ? fallback : String(v));
const e = (v, fallback = '—') => escapeHtml(safe(v, fallback));

// -------- mapas --------
const STATUS_CSS = {
    'pendente':     'pendente',
    'aprovada':     'aprovada',
    'recusada':     'recusada',
    'em-andamento': 'andamento',
    'concluida':    'concluida',
    'cancelada':    'cancelada'
};

const PRIORIDADE_LABEL = {
    'baixa':   'Baixa',
    'normal':  'Normal',
    'alta':    'Alta',
    'urgente': 'Urgente'
};

// -------- hash de verificação (FNV-1a simplificado) --------
function shortHash(str) {
    const s = String(str || '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

// -------- SVG de fallback quando o QR falha --------
function fallbackQrSvg() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
        <rect width="120" height="120" fill="#eaf1f7" stroke="#1e3a5f" stroke-width="2"/>
        <text x="60" y="55" text-anchor="middle" font-family="Arial" font-size="9" font-weight="bold" fill="#1e3a5f">QR CODE</text>
        <text x="60" y="70" text-anchor="middle" font-family="Arial" font-size="7" fill="#6b7d8f">Verificação</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// -------- prefetch do QR como DataURL (evita CORS no html2canvas) --------
async function fetchAsDataUrl(url, timeoutMs = 6000) {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(url, { mode: 'cors', signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn('[PDF] QR prefetch falhou:', err);
        return null;
    }
}

// ============================================================
// Template HTML do comprovante (CSS 100% inline)
// ============================================================
function buildRequestHTML(r, qrSrc) {
    const numero           = e(r.numero);
    const solicitante      = e(r.solicitante);
    const email            = e(r.email);
    const ramal            = e(r.ramal);
    const setor            = e(r.setor);
    const cargo            = e(r.cargo);
    const destino          = e(r.destino);
    const origem           = e(r.origem);
    const finalidade       = e(r.finalidade);
    const prioridade       = e(PRIORIDADE_LABEL[r.prioridade] || 'Normal');
    const saida            = r.saida   ? formatDateTime(r.saida)   : '—';
    const retorno          = r.retorno ? formatDateTime(r.retorno) : '—';
    const passageiros      = e(r.passageiros, '1');
    const veiculo          = r.veiculo ? getVeiculoText(r.veiculo) : '—';
    const necessidades     = e(r.necessidades);
    const nomesPassageiros = e(r.nomesPassageiros, '—').replace(/\n/g, '<br>');
    const observacoes      = e(r.observacoes, '—').replace(/\n/g, '<br>');
    const statusLabel      = e(getStatusText(r.status), 'Pendente');
    const statusCss        = STATUS_CSS[r.status] || 'pendente';
    const criadoEm         = r.timestamp ? formatDateTime(r.timestamp) : '—';
    const emitidoEm        = formatDateTime(new Date().toISOString());
    const hash             = shortHash(`${r.id}|${r.numero}|${r.timestamp}`);

    return `
    <style>
        .pdf-doc, .pdf-doc * { box-sizing: border-box; margin: 0; padding: 0; }
        .pdf-doc {
            width: 210mm;
            height: 297mm;
            background: #fff;
            color: #1a1a1a;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 10px;
            line-height: 1.4;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .pdf-top-bar    { height: 8mm; background: linear-gradient(90deg, #1e3a5f 0%, #2471a3 50%, #1e3a5f 100%); flex-shrink: 0; }
        .pdf-bottom-bar { height: 6mm; background: linear-gradient(90deg, #1e3a5f 0%, #2471a3 50%, #1e3a5f 100%); flex-shrink: 0; }
        .pdf-body { flex: 1; padding: 10mm 14mm; display: flex; flex-direction: column; min-height: 0; }

        /* HEADER */
        .doc-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; border-bottom: 2.5px solid #1e3a5f; margin-bottom: 10px; }
        .doc-brand  { display: flex; align-items: center; gap: 10px; }
        .doc-seal {
            width: 44px; height: 44px; border-radius: 50%;
            background: linear-gradient(135deg, #1e3a5f 0%, #2471a3 100%);
            color: #fff; font-size: 11px; font-weight: 900;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1e3a5f;
            letter-spacing: 0.5px;
        }
        .doc-brand-text h1 { font-size: 14px; font-weight: 900; color: #1e3a5f; letter-spacing: 1.5px; line-height: 1.1; }
        .doc-brand-text p  { font-size: 7.5px; color: #5a6b7d; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; margin-top: 2px; }
        .doc-header-meta   { text-align: right; font-size: 8px; color: #555; }
        .doc-header-meta .doc-title { font-size: 9px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; padding: 3px 8px; background: #eaf1f7; border-radius: 3px; display: inline-block; margin-bottom: 4px; }
        .doc-header-meta .doc-subtitle { font-size: 8px; color: #5a6b7d; margin-top: 2px; }

        /* PROTOCOLO */
        .protocol { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: linear-gradient(180deg, #f8fafc 0%, #eaf1f7 100%); border: 1px solid #c8d6e5; border-left: 4px solid #1e3a5f; border-radius: 3px; margin-bottom: 12px; }
        .protocol-main   { flex: 1; }
        .protocol-label  { font-size: 7px; color: #6b7d8f; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; margin-bottom: 1px; }
        .protocol-number { font-family: 'Courier New', monospace; font-size: 15px; font-weight: 900; color: #1e3a5f; letter-spacing: 0.5px; line-height: 1; }
        .protocol-badge  { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.6px; line-height: 1.4; }
        .protocol-badge.pendente  { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
        .protocol-badge.aprovada  { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .protocol-badge.recusada  { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .protocol-badge.andamento { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .protocol-badge.concluida { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .protocol-badge.cancelada { background: #e2e3e5; color: #383d41; border: 1px solid #d6d8db; }
        .protocol-meta   { text-align: right; font-size: 8px; color: #5a6b7d; }
        .protocol-meta strong { display: block; font-size: 9px; color: #1e3a5f; font-weight: 700; }

        /* SEÇÕES */
        .doc-section { margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
        .section-title { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; padding-bottom: 3px; border-bottom: 1.5px solid #d0d7de; }
        .section-num   { width: 16px; height: 16px; border-radius: 50%; background: #1e3a5f; color: #fff; font-size: 9px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .section-title h2 { font-size: 9px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; }

        /* GRID DE CAMPOS */
        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; }
        .field-grid.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
        .field { padding: 3px 0; border-bottom: 1px dotted #d5dbe0; min-width: 0; }
        .field.full { grid-column: 1 / -1; }
        .field .label { font-size: 6.5px; color: #6b7d8f; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; margin-bottom: 1px; line-height: 1.2; }
        .field .value { font-size: 9.5px; color: #1a1a1a; font-weight: 500; line-height: 1.35; word-wrap: break-word; overflow-wrap: break-word; }

        /* TERMOS */
        .terms { background: #fafbfc; border: 1px solid #d0d7de; border-radius: 3px; padding: 8px 10px; font-size: 7.5px; color: #444; line-height: 1.55; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
        .terms strong { color: #1e3a5f; font-weight: 800; }

        /* ASSINATURAS */
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 6px 0 10px; page-break-inside: avoid; break-inside: avoid; }
        .sig { text-align: center; }
        .sig-line  { border-top: 1px solid #1a1a1a; margin-top: 26px; margin-bottom: 4px; }
        .sig-label { font-size: 7.5px; color: #333; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .sig-sub   { font-size: 7px; color: #6b7d8f; margin-top: 2px; }

        /* VERIFICAÇÃO */
        .verification { display: flex; align-items: center; gap: 10px; background: linear-gradient(135deg, #f8fafc 0%, #eaf1f7 100%); border: 1px dashed #1e3a5f; border-radius: 3px; padding: 8px 10px; page-break-inside: avoid; break-inside: avoid; margin-top: auto; }
        .verification img { width: 58px; height: 58px; border: 1px solid #d0d7de; border-radius: 2px; background: #fff; padding: 2px; flex-shrink: 0; display: block; }
        .verification-info { flex: 1; min-width: 0; }
        .verification-info .v-title { font-size: 8.5px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 2px; }
        .verification-info .v-text  { font-size: 7.5px; color: #444; line-height: 1.4; margin-bottom: 3px; }
        .verification-info code { font-family: 'Courier New', monospace; font-size: 7px; background: #fff; border: 1px solid #d0d7de; border-radius: 2px; padding: 1px 4px; color: #1e3a5f; font-weight: 700; }

        /* FOOTER */
        .doc-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px solid #c8d6e5; font-size: 6.5px; color: #6b7d8f; margin-top: 8px; }
        .doc-footer strong { color: #1e3a5f; font-weight: 800; }
    </style>

    <div class="pdf-doc">
        <div class="pdf-top-bar"></div>
        <div class="pdf-body">

            <div class="doc-header">
                <div class="doc-brand">
                    <div class="doc-seal">SSOT</div>
                    <div class="doc-brand-text">
                        <h1>SSOT</h1>
                        <p>Sistema de Solicitações e Operações de Transporte</p>
                    </div>
                </div>
                <div class="doc-header-meta">
                    <div class="doc-title">Comprovante de Solicitação</div>
                    <div class="doc-subtitle">Emitido em ${emitidoEm}</div>
                </div>
            </div>

            <div class="protocol">
                <div class="protocol-main">
                    <div class="protocol-label">Protocolo de Atendimento</div>
                    <div class="protocol-number">${numero}</div>
                </div>
                <div class="protocol-badge ${statusCss}">${statusLabel}</div>
                <div class="protocol-meta">
                    <div>Criado em</div>
                    <strong>${criadoEm}</strong>
                </div>
            </div>

            <div class="doc-section">
                <div class="section-title">
                    <span class="section-num">1</span>
                    <h2>Dados do Solicitante</h2>
                </div>
                <div class="field-grid cols-3">
                    <div class="field full"><div class="label">Nome Completo</div><div class="value">${solicitante}</div></div>
                    <div class="field"><div class="label">E-mail</div><div class="value">${email}</div></div>
                    <div class="field"><div class="label">Ramal</div><div class="value">${ramal}</div></div>
                    <div class="field"><div class="label">Setor</div><div class="value">${setor}</div></div>
                    <div class="field"><div class="label">Cargo</div><div class="value">${cargo}</div></div>
                    <div class="field"><div class="label">Prioridade</div><div class="value">${prioridade}</div></div>
                </div>
            </div>

            <div class="doc-section">
                <div class="section-title">
                    <span class="section-num">2</span>
                    <h2>Detalhes da Viagem</h2>
                </div>
                <div class="field-grid">
                    <div class="field"><div class="label">Origem</div><div class="value">${origem}</div></div>
                    <div class="field"><div class="label">Destino</div><div class="value">${destino}</div></div>
                    <div class="field"><div class="label">Data/Hora de Saída</div><div class="value">${saida}</div></div>
                    <div class="field"><div class="label">Data/Hora de Retorno</div><div class="value">${retorno}</div></div>
                    <div class="field"><div class="label">Número de Passageiros</div><div class="value">${passageiros}</div></div>
                    <div class="field"><div class="label">Veículo</div><div class="value">${veiculo}</div></div>
                    <div class="field full"><div class="label">Finalidade da Viagem</div><div class="value">${finalidade}</div></div>
                    <div class="field full"><div class="label">Nomes dos Passageiros</div><div class="value">${nomesPassageiros}</div></div>
                    <div class="field full"><div class="label">Necessidades Especiais</div><div class="value">${necessidades}</div></div>
                    <div class="field full"><div class="label">Observações</div><div class="value">${observacoes}</div></div>
                </div>
            </div>

            <div class="terms">
                <strong>TERMOS E CONDIÇÕES:</strong> Este documento é o comprovante oficial da solicitação de transporte registrada no sistema SSOT. A autorização da viagem está sujeita à análise e aprovação do setor responsável. O solicitante compromete-se a utilizar o veículo exclusivamente para a finalidade declarada, respeitando as normas internas de segurança e conduta. A autenticidade deste comprovante pode ser verificada pelo QR Code ou pelo código de verificação <strong>${hash}</strong>.
            </div>

            <div class="signatures">
                <div class="sig">
                    <div class="sig-line"></div>
                    <div class="sig-label">Assinatura do Solicitante</div>
                    <div class="sig-sub">${solicitante}</div>
                </div>
                <div class="sig">
                    <div class="sig-line"></div>
                    <div class="sig-label">Autorização do Setor</div>
                    <div class="sig-sub">Carimbo e assinatura</div>
                </div>
            </div>

            <div class="verification">
                <img src="${qrSrc}" alt="QR de verificação">
                <div class="verification-info">
                    <div class="v-title">Verificação de Autenticidade</div>
                    <div class="v-text">Escaneie o QR Code para consultar esta solicitação no sistema SSOT.</div>
                    <div>Código de verificação: <code>${hash}</code></div>
                </div>
            </div>

            <div class="doc-footer">
                <div><strong>SSOT</strong> · Documento gerado eletronicamente</div>
                <div>${emitidoEm} · ${numero}</div>
            </div>
        </div>
        <div class="pdf-bottom-bar"></div>
    </div>
    `;
}

// ============================================================
// Geração do PDF (A4 · 1 página · sem corte · texto nítido)
// ============================================================
export async function generateRequestPDF(request) {
    if (!request) {
        console.error('[PDF] request vazio');
        return;
    }
    if (typeof window.html2pdf === 'undefined') {
        await sstAlert('Biblioteca de PDF não carregada. Recarregue com Ctrl+F5.', 'Erro', 'danger');
        return;
    }

    // 1) Prefetch do QR como Data URL (evita CORS no html2canvas)
    const baseUrl  = window.location.origin + window.location.pathname;
    const deepLink = `${baseUrl}?request=${encodeURIComponent(request.id || '')}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(deepLink)}`;

    let qrSrc = await fetchAsDataUrl(qrApiUrl);
    if (!qrSrc) qrSrc = fallbackQrSvg();

    // 2) A4 em pixels exatos (96 DPI) — trava o layout em dimensões conhecidas
    const A4_W = 794;   // 210mm @ 96dpi
    const A4_H = 1123;  // 297mm @ 96dpi

    // 3) Container off-screen com tamanho travado em PX
    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
        'position: fixed',
        'left: -10000px',
        'top: 0',
        `width: ${A4_W}px`,
        `height: ${A4_H}px`,
        'background: #ffffff',
        'z-index: 1',
        'pointer-events: none'
    ].join(';');
    wrapper.innerHTML = buildRequestHTML(request, qrSrc);
    document.body.appendChild(wrapper);

    // 4) Força o .pdf-doc a ter EXATAMENTE A4_W × A4_H em px (vence o mm do CSS)
    const docEl = wrapper.querySelector('.pdf-doc');
    if (!docEl) {
        document.body.removeChild(wrapper);
        throw new Error('Template do PDF não encontrado.');
    }
    docEl.style.width  = A4_W + 'px';
    docEl.style.height = A4_H + 'px';

    // 5) Fontes prontas
    try { if (document.fonts?.ready) await document.fonts.ready; } catch (_) {}

    // 6) QR carregado (data URL resolve rápido; fallback SVG também)
    const img = docEl.querySelector('.verification img');
    if (img && !(img.complete && img.naturalWidth > 0)) {
        await new Promise(resolve => {
            const done = () => resolve();
            img.addEventListener('load',  done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 4000);
        });
    }

    // 7) Dois frames para o layout assentar
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    await new Promise(res => setTimeout(res, 150));

    try {
        await window.html2pdf().set({
            margin: 0,
            filename: `SSOT-${safe(request.numero, 'solicitacao')}.pdf`,
            image: { type: 'png' },             // texto nítido
            html2canvas: {
                scale: 2,                       // 1588×2246 px (proporção A4 exata)
                useCORS: true,
                allowTaint: false,
                logging: false,
                backgroundColor: '#ffffff',
                scrollX: 0,
                scrollY: 0
                // ⚠️ NÃO usar windowWidth / windowHeight — é o que estava cortando
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait',
                compress: true
            },
            pagebreak: { mode: ['css', 'legacy'] }
            // (opcional) avoid: ['.doc-header', '.protocol', '.doc-section', '.terms',
            //                   '.signatures', '.verification', '.doc-footer']
        }).from(docEl).save();
    } catch (err) {
        console.error('[PDF] Erro:', err);
        await sstAlert('Não foi possível gerar o PDF: ' + (err.message || ''), 'Erro', 'danger');
    } finally {
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }
}
