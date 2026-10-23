export const APP_NAME = 'SSOT';
export const APP_FULL_NAME = 'Sistema de Solicitações e Operações de Transporte';
export const APP_VERSION = '10.3';
export const FIREBASE_PROJECT = 'ssot-ed9b1';

export const TRASH_RETENTION_DAYS = 120;
export const HISTORY_MAX_ENTRIES = 500;
export const HISTORY_DISPLAY_LIMIT = 300;

export const SESSION_STORAGE_KEY = 'ssot_last_tab';
export const SESSION_ACTIVE_KEY = 'ssot_active_session';
export const THEME_STORAGE_KEY = 'ssot_theme';

export const SESSION_IDLE_TIMEOUT = 6 * 60 * 1000;
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

// Roles que têm permissão administrativa
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
    'admin-servicos': 'Serviços',
    'user-solicitacoes': 'Solicitar Transporte',
    'user-perfil': 'Meu Perfil'
};

export const TAB_SUBTITLES = {
    'admin-dashboard': 'Visão geral em tempo real',
    'admin-solicitacoes': 'Gerencie todas as solicitações',
    'admin-usuarios': 'Usuários, cadastros pendentes e recusados',
    'admin-agenda': 'Horários disponíveis',
    'admin-frota': 'Veículos e motoristas',
    'admin-relatorios': 'Análises e gráficos',
    'admin-historico': 'Registro de ações',
    'admin-lixeira': 'Solicitações excluídas',
    'admin-perfil': 'Suas informações pessoais',
    'admin-servicos': 'Configurações e backup',
    'user-perfil': 'Suas informações pessoais'
};