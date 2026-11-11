// ============================================================
// SSOT - CONFIGURAÇÕES GLOBAIS (v12.0)
// Novidades:
//  - Sistema de rotas hash completas (#/solicitacoes/dashboard etc.)
//  - Configuração padrão do dashboard personalizável
// ============================================================

export const APP_NAME = 'SSOT';
export const APP_FULL_NAME = 'Sistema de Solicitações e Operações de Transporte';
export const APP_VERSION = '12.0';
export const FIREBASE_PROJECT = 'ssot-ed9b1';

export const TRASH_RETENTION_DAYS = 120;
export const HISTORY_MAX_ENTRIES = 500;
export const HISTORY_DISPLAY_LIMIT = 300;

export const SESSION_STORAGE_KEY = 'ssot_last_tab';
export const SESSION_ACTIVE_KEY = 'ssot_active_session';
export const THEME_STORAGE_KEY = 'ssot_theme';
export const DASHBOARD_CONFIG_KEY = 'ssot_dashboard_config';

export const SESSION_IDLE_TIMEOUT = 8 * 60 * 1000;
export const SESSION_WARNING_TIME = 60 * 1000;
export const FIREBASE_LOAD_TIMEOUT = 8000;

export const STATUS_LABELS = {
    'pendente': 'Pendente',
    'aprovada': 'Aprovada',
    'recusada': 'Recusada',
    'em-andamento': 'Em Andamento',
    'concluida': 'Concluída',
    'cancelada': 'Cancelada'
};

export const STATUS_BADGE = {
    'pendente': 'badge-warning',
    'aprovada': 'badge-success',
    'recusada': 'badge-danger',
    'em-andamento': 'badge-primary',
    'concluida': 'badge-info',
    'cancelada': 'badge-secondary'
};

export const PRIORIDADE_LABELS = {
    'baixa': 'Baixa',
    'normal': 'Normal',
    'alta': 'Alta',
    'urgente': 'Urgente'
};

export const PRIORIDADE_BADGE = {
    'baixa': 'badge-secondary',
    'normal': 'badge-primary',
    'alta': 'badge-warning',
    'urgente': 'badge-danger'
};

export const VEHICLE_LABELS = {
    'carro': 'Carro',
    'van': 'Van',
    'micro-onibus': 'Micro-ônibus',
    'onibus': 'Ônibus',
    'ambulancia': 'Ambulância',
    'caminhonete': 'Caminhonete'
};

export const ROLE_LABELS = {
    'admin': 'Administrador',
    'setor': 'Setor',
    'user': 'Usuário'
};

export const ADMIN_ROLES = ['admin', 'setor'];

export const TAB_TITLES = {
    'admin-dashboard': 'Dashboard',
    'admin-solicitacoes': 'Solicitações',
    'admin-usuarios': 'Usuários e Cadastros',
    'admin-agenda': 'Agenda',
    'admin-frota': 'Frota',
    'admin-relatorios': 'Relatórios',
    'admin-historico': 'Histórico',
    'admin-lixeira': 'Lixeira',
    'admin-perfil': 'Meu Perfil',
    'admin-servicos': 'Configurações',
    'user-solicitacoes': 'Solicitar Transporte',
    'user-perfil': 'Meu Perfil'
};

export const TAB_SUBTITLES = {
    'admin-dashboard': 'Visão geral em tempo real',
    'admin-solicitacoes': 'Gerencie todas as solicitações',
    'admin-usuarios': 'Usuários, cadastros pendentes e recusados',
    'admin-agenda': 'Horários disponíveis',
    'admin-frota': 'Veículos, motoristas e viagens',
    'admin-relatorios': 'Análises e gráficos',
    'admin-historico': 'Registro de ações',
    'admin-lixeira': 'Solicitações excluídas',
    'admin-perfil': 'Suas informações pessoais',
    'admin-servicos': 'Configurações e backup',
    'user-perfil': 'Suas informações pessoais'
};

// ============================================================
// SISTEMA DE ROTAS HASH
// ============================================================
// Formato: #/<area>/<tab> ou #/auth/<screen>
// ============================================================
export const ROUTES = {
    // ----- Autenticação -----
    'auth/login':              { type: 'screen', screen: 'login', mode: 'user' },
    'auth/login-setor':        { type: 'screen', screen: 'login', mode: 'admin' },
    'auth/requerimento':       { type: 'screen', screen: 'requerimento' },
    'auth/selecao':            { type: 'screen', screen: 'select' },

    // ----- Área do usuário comum -----
    'user/solicitar':          { type: 'tab', area: 'user', tab: 'user-solicitacoes' },
    'user/perfil':             { type: 'tab', area: 'user', tab: 'user-perfil' },

    // ----- Área de Solicitações (admin/setor) -----
    'solicitacoes/dashboard':               { type: 'tab', area: 'solicitacoes', tab: 'admin-dashboard' },
    'solicitacoes/solicitacoes-transporte': { type: 'tab', area: 'solicitacoes', tab: 'admin-solicitacoes' },
    'solicitacoes/usuarios':                { type: 'tab', area: 'solicitacoes', tab: 'admin-usuarios' },
    'solicitacoes/agenda':                  { type: 'tab', area: 'solicitacoes', tab: 'admin-agenda' },
    'solicitacoes/relatorios':              { type: 'tab', area: 'solicitacoes', tab: 'admin-relatorios' },
    'solicitacoes/historico':               { type: 'tab', area: 'solicitacoes', tab: 'admin-historico' },
    'solicitacoes/lixeira':                 { type: 'tab', area: 'solicitacoes', tab: 'admin-lixeira' },
    'solicitacoes/perfil':                  { type: 'tab', area: 'solicitacoes', tab: 'admin-perfil' },
    'solicitacoes/configuracoes':           { type: 'tab', area: 'solicitacoes', tab: 'admin-servicos' },

    // ----- Área de Operações (admin/setor) -----
    'operacoes/viagens':        { type: 'fleet', tab: 'viagens' },
    'operacoes/veiculos':       { type: 'fleet', tab: 'veiculos' },
    'operacoes/abastecimentos': { type: 'fleet', tab: 'abastecimentos' },
    'operacoes/servicos':       { type: 'fleet', tab: 'servicos' },
    'operacoes/despesas':       { type: 'fleet', tab: 'despesas' },
    'operacoes/leituras':       { type: 'fleet', tab: 'leituras' },
    'operacoes/checklist':      { type: 'fleet', tab: 'checklist' },
    'operacoes/relatorios':     { type: 'fleet', tab: 'relatorios' },
    'operacoes/importar':       { type: 'fleet', tab: 'importar' },
    'operacoes/perfil':         { type: 'tab', area: 'operacoes', tab: 'admin-perfil' },
    'operacoes/configuracoes':  { type: 'tab', area: 'operacoes', tab: 'admin-servicos' }
};

// Mapa inverso: tabId → rota
export const TAB_TO_ROUTE = {
    'admin-dashboard':    'solicitacoes/dashboard',
    'admin-solicitacoes': 'solicitacoes/solicitacoes-transporte',
    'admin-usuarios':     'solicitacoes/usuarios',
    'admin-agenda':       'solicitacoes/agenda',
    'admin-relatorios':   'solicitacoes/relatorios',
    'admin-historico':    'solicitacoes/historico',
    'admin-lixeira':      'solicitacoes/lixeira',
    'admin-perfil':       'solicitacoes/perfil',
    'admin-servicos':     'solicitacoes/configuracoes',
    'user-solicitacoes':  'user/solicitar',
    'user-perfil':        'user/perfil'
};

// Mapa inverso para Operações (fleet tab → rota)
export const FLEET_TAB_TO_ROUTE = {
    'viagens':        'operacoes/viagens',
    'veiculos':       'operacoes/veiculos',
    'abastecimentos': 'operacoes/abastecimentos',
    'servicos':       'operacoes/servicos',
    'despesas':       'operacoes/despesas',
    'leituras':       'operacoes/leituras',
    'checklist':      'operacoes/checklist',
    'relatorios':     'operacoes/relatorios',
    'importar':       'operacoes/importar'
};

// ============================================================
// DASHBOARD PERSONALIZÁVEL — CONFIG PADRÃO
// ============================================================
export const DASHBOARD_CHARTS = {
    status:     { label: 'Por Status',      icon: 'i-chart-pie',  family: 'requests' },
    prioridade: { label: 'Por Prioridade',  icon: 'i-chart-bar',  family: 'requests' },
    timeline:   { label: 'Linha do Tempo',  icon: 'i-chart-line', family: 'requests' },
    destinos:   { label: 'Top Destinos',    icon: 'i-truck',      family: 'requests' },
    veiculos:   { label: 'Veículos',        icon: 'i-car',        family: 'requests' },
    setores:    { label: 'Top Setores',     icon: 'i-building',   family: 'requests' }
};

// Tipos de gráfico disponíveis (2D usa Chart.js / 3D usa ECharts GL)
export const CHART_TYPES = {
    // 2D (Chart.js)
    doughnut:   { label: 'Rosca (2D)',      engine: 'chartjs', kind: 'doughnut' },
    pie:        { label: 'Pizza (2D)',      engine: 'chartjs', kind: 'pie' },
    bar:        { label: 'Barra (2D)',      engine: 'chartjs', kind: 'bar' },
    line:       { label: 'Linha (2D)',      engine: 'chartjs', kind: 'line' },
    polarArea:  { label: 'Polar (2D)',      engine: 'chartjs', kind: 'polarArea' },
    radar:      { label: 'Radar (2D)',      engine: 'chartjs', kind: 'radar' },

    // 3D (ECharts GL)
    'bar3d':     { label: 'Barra 3D',       engine: 'echarts-gl', kind: 'bar3D' },
    'line3d':    { label: 'Linha 3D',       engine: 'echarts-gl', kind: 'line3D' },
    'scatter3d': { label: 'Dispersão 3D',   engine: 'echarts-gl', kind: 'scatter3D' },
    'pie3d':     { label: 'Pizza 3D',       engine: 'echarts-style', kind: 'pie3d-style' }
};

// Configuração padrão (será mesclada com preferências salvas)
export const DEFAULT_DASHBOARD_CONFIG = {
    charts: [
        { id: 'status',     type: 'doughnut',  visible: true, order: 1 },
        { id: 'prioridade', type: 'bar',       visible: true, order: 2 },
        { id: 'timeline',   type: 'line',      visible: true, order: 3 },
        { id: 'destinos',   type: 'bar',       visible: true, order: 4 },
        { id: 'veiculos',   type: 'polarArea', visible: true, order: 5 },
        { id: 'setores',    type: 'bar',       visible: true, order: 6 }
    ]
};