// ============================================================
// SSOT - RELATÓRIOS (v11.0)
// ============================================================

import {
    showNotification, formatDateTime, formatDate, escapeHtml,
    downloadCSV, getStatusText
} from './utils.js';

import { addHistory } from './history.js';

let _requests = [];
let _currentUser = null;
let _lastReportData = [];

export function setReportsContext(requests, currentUser) {
    _requests = requests || [];
    _currentUser = currentUser;
}

export function generateReport() {
    const tipo = document.getElementById('report-type')?.value || 'todas';
    const statusF = document.getElementById('report-status-filter')?.value || '';
    const start = document.getElementById('report-start')?.value || '';
    const end = document.getElementById('report-end')?.value || '';

    let list = _requests.slice();
    let titulo = 'Relatório';

    if (statusF) list = list.filter(r => r.status === statusF);

    if (start || end) {
        const s = start ? new Date(start + 'T00:00:00') : new Date(0);
        const e = end ? new Date(end + 'T23:59:59') : new Date();
        list = list.filter(r => {
            const d = r.dataSolicitacao ? new Date(r.dataSolicitacao) : (r.saida ? new Date(r.saida) : null);
            return d && d >= s && d <= e;
        });
    }

    switch (tipo) {
        case 'todas': titulo = 'Todas as Solicitações'; break;
        case 'periodo': titulo = 'Solicitações por Período'; break;
        case 'usuario': titulo = 'Solicitações por Usuário'; break;
        case 'status': titulo = 'Solicitações por Status'; break;
    }

    _lastReportData = list;
    renderReportTable(list, titulo, { start, end, statusF });

    if (list.length > 0) {
        addHistory('Relatório Gerado', '-', `${titulo} | ${list.length} registros`);
    }

    showNotification('Relatório Gerado', `${list.length} registro(s).`, 'success');
}

function renderReportTable(list, titulo, filters) {
    const container = document.getElementById('report-results');
    if (!container) return;

    let filterInfo = '';
    if (filters.start || filters.end) {
        filterInfo += `<p style="color:#7f8c8d;font-size:0.85rem;margin-top:4px;">
            Período: ${filters.start ? formatDate(filters.start) : 'início'} até ${filters.end ? formatDate(filters.end) : 'hoje'}
        </p>`;
    }
    if (filters.statusF) {
        filterInfo += `<p style="color:#7f8c8d;font-size:0.85rem;">Status: ${getStatusText(filters.statusF)}</p>`;
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center;padding:36px 20px;">
                <h3 style="color:#2c3e50;margin-bottom:8px;">${escapeHtml(titulo)}</h3>
                <p style="color:#7f8c8d;">Nenhum resultado encontrado.</p>
            </div>
        `;
        return;
    }

    const sorted = list.slice().sort((a, b) => {
        const da = new Date(a.dataSolicitacao || a.timestamp || 0);
        const db = new Date(b.dataSolicitacao || b.timestamp || 0);
        return db - da;
    });

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div class="card-header-title">
                    <svg class="si si-fw"><use href="#i-file-text"/></svg>
                    <h2>${escapeHtml(titulo)}</h2>
                </div>
            </div>
            <div class="card-body">
                ${filterInfo}
                <div class="table-responsive" style="margin-top:14px;">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Nº</th><th>Solicitante</th><th>Setor</th><th>Destino</th>
                                <th>Saída</th><th>Prioridade</th><th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map(r => `
                                <tr>
                                    <td><strong>${escapeHtml(r.numero)}</strong></td>
                                    <td>${escapeHtml(r.solicitante || '—')}</td>
                                    <td>${escapeHtml(r.setor || '—')}</td>
                                    <td>${escapeHtml(r.destino || '—')}</td>
                                    <td>${r.saida ? formatDateTime(r.saida) : '—'}</td>
                                    <td><span class="badge badge-${r.prioridade === 'urgente' ? 'danger' : r.prioridade === 'alta' ? 'warning' : r.prioridade === 'baixa' ? 'secondary' : 'primary'}" style="font-size:0.7rem;">${r.prioridade || 'normal'}</span></td>
                                    <td>${getStatusText(r.status)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <p style="margin-top:14px;color:#7f8c8d;font-size:0.85rem;">
                    Total: <strong>${list.length}</strong> registro(s)
                </p>
            </div>
        </div>
    `;
}

export function exportReportExcel() {
    const data = _lastReportData.length > 0 ? _lastReportData : _requests;
    if (data.length === 0) {
        showNotification('Exportação', 'Gere um relatório primeiro.', 'danger');
        return;
    }

    const formatted = data.map(r => ({
        'Número': r.numero || '',
        'Solicitante': r.solicitante || '',
        'E-mail': r.email || '',
        'Ramal': r.ramal || '',
        'Setor': r.setor || '',
        'Destino': r.destino || '',
        'Origem': r.origem || '',
        'Finalidade': r.finalidade || '',
        'Saída': r.saida || '',
        'Retorno': r.retorno || '',
        'Passageiros': r.passageiros || '',
        'Veículo': r.veiculo || '',
        'Prioridade': r.prioridade || '',
        'Status': getStatusText(r.status),
        'Data Solicitação': r.dataSolicitacao || '',
        'Observações': r.observacoes || ''
    }));

    downloadCSV(formatted, 'relatorio_ssot');
    addHistory('Relatório Exportado', '-', `Excel | ${data.length} registros`);
}

export function exportReportPDF(previewOnly = false) {
    const data = _lastReportData.length > 0 ? _lastReportData : _requests;
    if (data.length === 0) {
        showNotification('Exportação', 'Gere um relatório primeiro.', 'danger');
        return;
    }

    const html = buildReportHTML(data);

    if (previewOnly) {
        const iframe = document.getElementById('pdf-iframe');
        if (iframe) {
            iframe.srcdoc = '';
            setTimeout(() => { iframe.srcdoc = html; }, 30);
        }
        document.getElementById('pdf-modal')?.classList.add('active');
        return;
    }

    _downloadReportAsPDF(html, data.length);
}

function buildReportHTML(data) {
    const now = new Date();
    const tituloRelatorio = document.getElementById('report-type')?.options[
        document.getElementById('report-type')?.selectedIndex
    ]?.text || 'Relatório de Solicitações';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(tituloRelatorio)} - SSOT</title>
<style>
    @page { size: A4; margin: 0; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; }
    .a4-container { width: 210mm; min-height: 297mm; padding: 15mm; box-sizing: border-box; margin: 0 auto; background: #fff; }
    .header { text-align: center; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px; }
    .header h1 { color: #2c3e50; margin: 0; font-size: 1.4em; }
    .header h2 { color: #3498db; margin: 5px 0 0; font-size: 1.1em; font-weight: normal; }
    .header p { color: #7f8c8d; margin: 8px 0 0; font-size: 0.85em; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85em; margin-top: 15px; }
    th { background: #3498db; color: #ffffff; padding: 9px 8px; text-align: left; }
    td { padding: 8px; border-bottom: 1px solid #dddddd; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    tr:nth-child(even) { background: #f8f9fa; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 0.75em; font-weight: bold; color: #ffffff; }
    .b-w { background: #d68910; }
    .b-s { background: #27ae60; }
    .b-d { background: #c0392b; }
    .b-p { background: #3498db; }
    .b-i { background: #1abc9c; }
    .b-x { background: #95a5a6; }
    .footer { margin-top: 25px; text-align: center; font-size: 0.75em; color: #7f8c8d; border-top: 1px solid #eeeeee; padding-top: 15px; }
    .total { text-align: center; margin-top: 18px; color: #2c3e50; font-size: 0.9em; }
    .truncated { text-align: center; margin-top: 15px; color: #7f8c8d; font-size: 0.8em; }
    .logo-icon { width: 32px; height: 32px; color: #2c3e50; margin-bottom: 5px; }
</style>
</head>
<body>
<div class="a4-container">
<div class="header">
    <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="M3 17V11l2-5h14l2 5v6"/><path d="M3 11h18"/></svg>
    <h1>SSOT - Sistema de Solicitações e Operações de Transporte</h1>
    <h2>${escapeHtml(tituloRelatorio)}</h2>
    <p>Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')} por ${escapeHtml(_currentUser?.name || 'Sistema')}</p>
</div>
<table>
<thead>
<tr><th>Nº</th><th>Solicitante</th><th>Destino</th><th>Saída</th><th>Status</th></tr>
</thead>
<tbody>
${data.slice(0, 300).map(r => {
    let cls = 'b-w';
    if (r.status === 'aprovada' || r.status === 'concluida') cls = 'b-s';
    else if (r.status === 'recusada' || r.status === 'cancelada') cls = 'b-d';
    else if (r.status === 'em-andamento') cls = 'b-p';
    return `<tr><td><strong>${escapeHtml(r.numero)}</strong></td><td>${escapeHtml(r.solicitante || '—')}</td><td>${escapeHtml(r.destino || '—')}</td><td>${r.saida ? formatDateTime(r.saida) : '—'}</td><td><span class="badge ${cls}">${getStatusText(r.status)}</span></td></tr>`;
}).join('')}
</tbody>
</table>
${data.length > 300 ? `<p class="truncated">Exibindo 300 de ${data.length} registros.</p>` : ''}
<p class="total"><strong>Total: ${data.length} registro(s)</strong></p>
<div class="footer"><p>SSOT v11.0 · Relatório gerado automaticamente</p></div>
</div>
</body>
</html>`;
}

async function _downloadReportAsPDF(htmlString, count) {
    if (!window.html2pdf) {
        showNotification('Erro', 'Biblioteca PDF não carregada. Recarregue com Ctrl+F5.', 'danger');
        return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 999998; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.2rem; font-weight: 600; font-family: 'Segoe UI', Arial, sans-serif;`;
    overlay.innerHTML = '<div style="text-align:center"><div style="margin-bottom:10px">📄 Gerando PDF...</div><div style="font-size:0.85rem;opacity:0.8;">Aguarde um instante</div></div>';
    document.body.appendChild(overlay);

    try {
        await window.html2pdf().set({
            margin: 0,
            filename: `relatorio_ssot_${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(htmlString).save();

        showNotification('PDF Gerado', 'Relatório exportado com sucesso!', 'success');
        addHistory('Relatório Exportado', '-', `PDF | ${count} registros`);
    } catch (err) {
        console.error('[Reports] Erro ao gerar PDF:', err);
        showNotification('Erro', 'Não foi possível gerar o PDF.', 'danger');
    } finally {
        overlay.remove();
    }
}

export function setupReportChartDownloads() {}