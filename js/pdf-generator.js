// ============================================================
// SSOT · PDF GENERATOR (v1.0)
// Gera PDF profissional em 1 página (A4) usando html2pdf
// ============================================================

/**
 * Gera PDF de uma solicitação individual — profissional, 1 página.
 * @param {Object} request — objeto completo da solicitação
 */
export async function generateRequestPDF(request) {
    if (!request) { window.alert('Solicitação inválida.'); return; }

    if (typeof window.html2pdf === 'undefined') {
        window.alert('Biblioteca de PDF não carregada. Recarregue a página.');
        return;
    }

    const container = buildContainer(request);
    document.body.appendChild(container);

    try {
        await window.html2pdf().set({
            margin: [12, 12, 12, 12],
            filename: `solicitacao_${request.numero || 'SSOT'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 3,
                useCORS: true,
                letterRendering: true,
                logging: false,
                windowWidth: 794
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait',
                compress: true
            },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(container).save();
    } catch (err) {
        console.error('[PDF]', err);
        window.alert('Falha ao gerar PDF: ' + err.message);
    } finally {
        document.body.removeChild(container);
    }
}

/**
 * Gera PDF de uma lista de solicitações (relatório) — paisagem, tabular.
 */
export async function generateReportPDF(requests, titulo = 'Relatório de Solicitações') {
    if (!Array.isArray(requests) || requests.length === 0) {
        window.alert('Não há dados para exportar.');
        return;
    }

    if (typeof window.html2pdf === 'undefined') {
        window.alert('Biblioteca de PDF não carregada.');
        return;
    }

    const container = buildReportContainer(requests, titulo);
    document.body.appendChild(container);

    try {
        await window.html2pdf().set({
            margin: [12, 12, 12, 12],
            filename: `relatorio_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2.5, useCORS: true, logging: false, windowWidth: 1123 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(container).save();
    } catch (err) {
        console.error('[PDF]', err);
        window.alert('Falha ao gerar PDF: ' + err.message);
    } finally {
        document.body.removeChild(container);
    }
}

// ============================================================
// CONSTRUÇÃO DO HTML (estilo A4)
// ============================================================
function buildContainer(request) {
    const div = document.createElement('div');
    div.className = 'pdf-a4';
    div.style.cssText = `
        width: 210mm;
        min-height: 297mm;
        padding: 14mm;
        box-sizing: border-box;
        background: #fff;
        color: #1a1a1a;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11pt;
        line-height: 1.4;
        position: absolute;
        left: -9999px;
        top: 0;
    `;

    const esc = (v) => {
        if (v === null || v === undefined || v === '') return '—';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };
    const fmtDate = (v) => {
        if (!v) return '—';
        try {
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
                const d = new Date(v);
                return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            }
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
                const [y, m, d] = v.split('-');
                return `${d}/${m}/${y}`;
            }
            return String(v);
        } catch (e) { return String(v); }
    };

    const statusLabel = {
        pendente: 'Pendente',
        aprovada: 'Aprovada',
        recusada: 'Recusada',
        'em-andamento': 'Em Andamento',
        concluida: 'Concluída',
        cancelada: 'Cancelada'
    }[request.status] || request.status || '—';

    const prioridadeLabel = {
        baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente'
    }[request.prioridade] || request.prioridade || 'Normal';

    div.innerHTML = `
        <header style="border-bottom:3px solid #2c3e50;padding-bottom:10px;margin-bottom:14px;">
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="vertical-align:middle;">
                        <div style="font-size:18pt;font-weight:800;color:#1a252f;letter-spacing:1px;">SSOT</div>
                        <div style="font-size:9pt;color:#7f8c8d;margin-top:2px;">Sistema de Solicitações e Operações de Transporte</div>
                    </td>
                    <td style="text-align:right;vertical-align:middle;">
                        <div style="font-size:13pt;font-weight:700;color:#2c3e50;">Solicitação nº ${esc(request.numero)}</div>
                        <div style="font-size:9pt;color:#7f8c8d;margin-top:2px;">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
                    </td>
                </tr>
            </table>
        </header>

        <section style="margin-bottom:14px;">
            <h2 style="font-size:11pt;color:#2c3e50;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;border-left:4px solid #3498db;padding-left:8px;">Dados do Solicitante</h2>
            <table style="width:100%;border-collapse:collapse;font-size:10pt;">
                <tr>
                    <td style="padding:4px 0;width:25%;color:#7f8c8d;font-weight:600;">Nome</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(request.solicitante)}</td>
                    <td style="padding:4px 0;width:20%;color:#7f8c8d;font-weight:600;">E-mail</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(request.email)}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Setor</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(request.setor)}</td>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Ramal</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(request.ramal)}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Cargo</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(request.cargo)}</td>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Prioridade</td>
                    <td style="padding:4px 0;color:#1a1a1a;font-weight:700;">${esc(prioridadeLabel)}</td>
                </tr>
            </table>
        </section>

        <section style="margin-bottom:14px;">
            <h2 style="font-size:11pt;color:#2c3e50;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;border-left:4px solid #3498db;padding-left:8px;">Dados da Viagem</h2>
            <table style="width:100%;border-collapse:collapse;font-size:10pt;">
                <tr>
                    <td style="padding:4px 0;width:25%;color:#7f8c8d;font-weight:600;">Origem</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(request.origem)}</td>
                    <td style="padding:4px 0;width:20%;color:#7f8c8d;font-weight:600;">Destino</td>
                    <td style="padding:4px 0;color:#1a1a1a;font-weight:700;">${esc(request.destino)}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Finalidade</td>
                    <td style="padding:4px 0;color:#1a1a1a;" colspan="3">${esc(request.finalidade)}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Saída</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(fmtDate(request.saida))}</td>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Retorno</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(fmtDate(request.retorno))}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Passageiros</td>
                    <td style="padding:4px 0;color:#1a1a1a;">${esc(request.passageiros || '1')}</td>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Status</td>
                    <td style="padding:4px 0;color:#1a1a1a;font-weight:700;">${esc(statusLabel)}</td>
                </tr>
                <tr>
                    <td style="padding:4px 0;color:#7f8c8d;font-weight:600;">Necessidades</td>
                    <td style="padding:4px 0;color:#1a1a1a;" colspan="3">${esc(request.necessidades)}</td>
                </tr>
            </table>
        </section>

        ${request.nomesPassageiros ? `
        <section style="margin-bottom:14px;">
            <h2 style="font-size:11pt;color:#2c3e50;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;border-left:4px solid #3498db;padding-left:8px;">Passageiros</h2>
            <div style="font-size:10pt;color:#1a1a1a;background:#f8f9fa;padding:8px 10px;border-radius:4px;white-space:pre-wrap;">${esc(request.nomesPassageiros)}</div>
        </section>` : ''}

        ${request.observacoes ? `
        <section style="margin-bottom:14px;">
            <h2 style="font-size:11pt;color:#2c3e50;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;border-left:4px solid #3498db;padding-left:8px;">Observações</h2>
            <div style="font-size:10pt;color:#1a1a1a;background:#f8f9fa;padding:8px 10px;border-radius:4px;white-space:pre-wrap;">${esc(request.observacoes)}</div>
        </section>` : ''}

        <footer style="margin-top:22px;padding-top:10px;border-top:1px solid #dee2e6;font-size:8pt;color:#adb5bd;text-align:center;">
            Documento gerado eletronicamente pelo SSOT · ${new Date().getFullYear()} · ssotransporte
        </footer>
    `;
    return div;
}

function buildReportContainer(requests, titulo) {
    const div = document.createElement('div');
    div.className = 'pdf-a4-landscape';
    div.style.cssText = `
        width: 297mm;
        min-height: 210mm;
        padding: 12mm;
        box-sizing: border-box;
        background: #fff;
        color: #1a1a1a;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 9pt;
        line-height: 1.35;
        position: absolute;
        left: -9999px;
        top: 0;
    `;

    const esc = (v) => (v == null || v === '') ? '—' : String(v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const fmt = (v) => {
        if (!v) return '—';
        try {
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
                return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            }
            return String(v);
        } catch (e) { return String(v); }
    };

    const rows = requests.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f8f9fa'};">
            <td style="padding:5px 6px;border:1px solid #dee2e6;text-align:center;font-weight:600;">${esc(r.numero)}</td>
            <td style="padding:5px 6px;border:1px solid #dee2e6;">${esc(r.solicitante)}</td>
            <td style="padding:5px 6px;border:1px solid #dee2e6;">${esc(r.setor)}</td>
            <td style="padding:5px 6px;border:1px solid #dee2e6;">${esc(r.destino)}</td>
            <td style="padding:5px 6px;border:1px solid #dee2e6;text-align:center;white-space:nowrap;">${esc(fmt(r.saida))}</td>
            <td style="padding:5px 6px;border:1px solid #dee2e6;text-align:center;">${esc(r.prioridade || 'normal')}</td>
            <td style="padding:5px 6px;border:1px solid #dee2e6;text-align:center;">${esc(r.status || 'pendente')}</td>
        </tr>
    `).join('');

    div.innerHTML = `
        <header style="border-bottom:3px solid #2c3e50;padding-bottom:8px;margin-bottom:10px;">
            <table style="width:100%;border-collapse:collapse;">
                <tr>
                    <td style="vertical-align:middle;">
                        <div style="font-size:16pt;font-weight:800;color:#1a252f;letter-spacing:1px;">SSOT</div>
                        <div style="font-size:8pt;color:#7f8c8d;">Relatório de Transporte</div>
                    </td>
                    <td style="text-align:right;vertical-align:middle;">
                        <div style="font-size:12pt;font-weight:700;color:#2c3e50;">${esc(titulo)}</div>
                        <div style="font-size:8pt;color:#7f8c8d;">${requests.length} registro(s) · ${new Date().toLocaleString('pt-BR')}</div>
                    </td>
                </tr>
            </table>
        </header>

        <table style="width:100%;border-collapse:collapse;font-size:9pt;">
            <thead>
                <tr style="background:#2c3e50;color:#fff;">
                    <th style="padding:6px;border:1px solid #2c3e50;text-align:center;font-weight:700;">Nº</th>
                    <th style="padding:6px;border:1px solid #2c3e50;text-align:left;font-weight:700;">Solicitante</th>
                    <th style="padding:6px;border:1px solid #2c3e50;text-align:left;font-weight:700;">Setor</th>
                    <th style="padding:6px;border:1px solid #2c3e50;text-align:left;font-weight:700;">Destino</th>
                    <th style="padding:6px;border:1px solid #2c3e50;text-align:center;font-weight:700;">Saída</th>
                    <th style="padding:6px;border:1px solid #2c3e50;text-align:center;font-weight:700;">Prioridade</th>
                    <th style="padding:6px;border:1px solid #2c3e50;text-align:center;font-weight:700;">Status</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>

        <footer style="margin-top:14px;padding-top:8px;border-top:1px solid #dee2e6;font-size:7.5pt;color:#adb5bd;text-align:center;">
            Documento gerado eletronicamente pelo SSOT · ${new Date().getFullYear()}
        </footer>
    `;
    return div;
}