// ============================================================
// SSOT · Gerador de PDF (comprovante de solicitação)
// Gera 1 página A4 real, sem "print de tela"
// ============================================================

import { formatDateTime, escapeHtml, getStatusText, getVeiculoText } from './utils.js';

export async function generateRequestPDF(request) {
    if (!request) {
        console.error('[PDF] request vazio');
        return;
    }
    if (typeof window.html2pdf === 'undefined') {
        alert('Biblioteca de PDF não carregada. Recarregue a página.');
        return;
    }

    const numero = request.numero || '—';
    const solicitante = request.solicitante || '—';
    const email = request.email || '—';
    const ramal = request.ramal || '—';
    const setor = request.setor || '—';
    const cargo = request.cargo || '—';
    const destino = request.destino || '—';
    const origem = request.origem || '—';
    const finalidade = request.finalidade || '—';
    const prioridade = request.prioridade || 'normal';
    const saida = request.saida ? formatDateTime(request.saida) : '—';
    const retorno = request.retorno ? formatDateTime(request.retorno) : '—';
    const passageiros = request.passageiros || '1';
    const veiculo = request.veiculo ? getVeiculoText(request.veiculo) : '—';
    const necessidades = request.necessidades || '—';
    const nomesPassageiros = request.nomesPassageiros || '—';
    const observacoes = request.observacoes || '—';
    const status = getStatusText(request.status) || 'Pendente';
    const criadoEm = request.timestamp ? formatDateTime(request.timestamp) : '—';
    const emitidoEm = formatDateTime(new Date().toISOString());

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          background: #ffffff;
          color: #1a1a1a;
          padding: 15mm;
          font-size: 11px;
        }
        .a4-container {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          box-sizing: border-box;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #1e3a5f;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .header h1 {
          font-size: 20px;
          color: #1e3a5f;
        }
        .header .numero {
          font-size: 16px;
          font-weight: bold;
          color: #1e3a5f;
        }
        h2 {
          font-size: 13px;
          color: #1e3a5f;
          margin: 16px 0 8px;
          text-transform: uppercase;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 20px;
        }
        .field {
          border-bottom: 1px dotted #ddd;
          padding: 4px 0;
        }
        .label {
          font-size: 9px;
          color: #888;
          text-transform: uppercase;
        }
        .value {
          font-size: 12px;
          font-weight: 500;
        }
        .footer {
          margin-top: 30px;
          padding-top: 12px;
          border-top: 1px solid #ccc;
          text-align: center;
          font-size: 9px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="a4-container">
        <div class="header">
          <h1>SSOT</h1>
          <div class="numero">${escapeHtml(numero)}</div>
        </div>

        <h2>Dados do Solicitante</h2>
        <div class="grid">
          <div class="field"><div class="label">Nome</div><div class="value">${escapeHtml(solicitante)}</div></div>
          <div class="field"><div class="label">E-mail</div><div class="value">${escapeHtml(email)}</div></div>
          <div class="field"><div class="label">Ramal</div><div class="value">${escapeHtml(ramal)}</div></div>
          <div class="field"><div class="label">Setor</div><div class="value">${escapeHtml(setor)}</div></div>
          <div class="field"><div class="label">Cargo</div><div class="value">${escapeHtml(cargo)}</div></div>
          <div class="field"><div class="label">Prioridade</div><div class="value">${escapeHtml(prioridade)}</div></div>
        </div>

        <h2>Detalhes da Viagem</h2>
        <div class="grid">
          <div class="field"><div class="label">Destino</div><div class="value">${escapeHtml(destino)}</div></div>
          <div class="field"><div class="label">Origem</div><div class="value">${escapeHtml(origem)}</div></div>
          <div class="field"><div class="label">Saída</div><div class="value">${saida}</div></div>
          <div class="field"><div class="label">Retorno</div><div class="value">${retorno}</div></div>
          <div class="field"><div class="label">Passageiros</div><div class="value">${escapeHtml(String(passageiros))}</div></div>
          <div class="field"><div class="label">Veículo</div><div class="value">${escapeHtml(veiculo)}</div></div>
        </div>

        <div class="footer">
          <div>Status: ${escapeHtml(status)} · Criado em ${criadoEm}</div>
          <div>Documento gerado pelo SSOT · Emitido em ${emitidoEm}</div>
        </div>
      </div>
    </body>
    </html>
    `;

    try {
        await window.html2pdf().set({
            margin: 0,
            filename: `SSOT-${numero}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(html).save();
        console.log('[PDF] Gerado com sucesso.');
    } catch (err) {
        console.error('[PDF] Erro:', err);
        alert('Erro ao gerar PDF: ' + (err.message || err));
    }
}
