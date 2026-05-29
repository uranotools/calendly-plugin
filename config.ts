export const CalendlyConfig = {
    name: "Calendly",
    description: "Integración completa con Calendly: consulta eventos, tipos de reuniones, invitados y genera links de agendamiento directamente desde el agente.",
    icon: "Calendar",
    category: "Productividad",

    inCloud: true,
    inDesktop: true,

    // ── Plugins habilitados ────────────────────────────────────────────────
    enabledPlugins: ['User', 'EventTypes', 'Events', 'Invitees', 'Scheduling', 'Availability', 'Webhooks'],

    // ── Credenciales y configuración de entorno ────────────────────────────
    settings: [
        {
            name: 'PLUGIN_MODE',
            type: 'select',
            title: '🔒 Modo de Operación',
            description:
                'Define qué capacidades tiene el agente sobre tu Calendly.\n' +
                '• Manejo Personal: acceso completo (ver, cancelar, webhooks).\n' +
                '• Solo Lectura: consulta sin modificar nada.\n' +
                '• Solo Automatizaciones: únicamente generar links y consultar disponibilidad.',
            options: [
                { label: '✅ Manejo Personal Completo', value: 'full' },
                { label: '👁️ Solo Lectura (sin modificar)', value: 'readonly' },
                { label: '🤖 Solo Automatizaciones (links + disponibilidad)', value: 'scheduling_only' },
            ],
        },
        {
            name: 'CALENDLY_TOKEN',
            type: 'password',
            title: 'Personal Access Token',
            description: 'Tu token de acceso personal de Calendly. Obtenlo en: https://calendly.com/integrations/api_webhooks',
        },
        {
            name: 'CALENDLY_ORG_URI',
            type: 'text',
            title: 'URI de Organización (Opcional)',
            description: 'URI de tu organización de Calendly. Ej: https://api.calendly.com/organizations/XXXXXXX. Se autodetecta si se deja vacío.',
        },
        {
            name: 'DEFAULT_EVENT_COUNT',
            type: 'select',
            title: 'Eventos a listar por defecto',
            description: 'Número máximo de eventos que el agente listará en cada consulta.',
            options: [
                { label: '10 eventos', value: '10' },
                { label: '25 eventos', value: '25' },
                { label: '50 eventos', value: '50' },
                { label: '100 eventos', value: '100' },
            ],
        },
    ],

    // ── Esquemas de Herramientas MCP ───────────────────────────────────────
    pluginSchemas: {

        // Plugin 1: Perfil del usuario
        User: {
            actions: {
                getProfile: {
                    label: 'Obtener Perfil',
                    fields: [],
                },
            },
        },

        // Plugin 2: Tipos de eventos (event types)
        EventTypes: {
            actions: {
                list: {
                    label: 'Listar Tipos de Eventos',
                    fields: [
                        { name: 'active', type: 'select', label: 'Estado', options: [
                            { label: 'Todos', value: 'all' },
                            { label: 'Solo activos', value: 'true' },
                            { label: 'Solo inactivos', value: 'false' },
                        ]},
                    ],
                },
                getDetails: {
                    label: 'Ver Detalles de Tipo de Evento',
                    fields: [
                        { name: 'event_type_uri', type: 'required', label: 'URI del Tipo de Evento' },
                    ],
                },
            },
        },

        // Plugin 3: Eventos agendados
        Events: {
            actions: {
                listUpcoming: {
                    label: 'Listar Eventos Próximos',
                    fields: [
                        { name: 'count', type: 'text', label: 'Cantidad máxima (default: usa configuración)' },
                        { name: 'min_start_time', type: 'text', label: 'Desde (ISO 8601, ej: 2025-06-01T00:00:00Z)' },
                        { name: 'max_start_time', type: 'text', label: 'Hasta (ISO 8601)' },
                        { name: 'status', type: 'select', label: 'Estado del evento', options: [
                            { label: 'Activos', value: 'active' },
                            { label: 'Cancelados', value: 'canceled' },
                        ]},
                    ],
                },
                getDetails: {
                    label: 'Ver Detalles de Evento',
                    fields: [
                        { name: 'event_uri', type: 'required', label: 'URI del Evento' },
                    ],
                },
                cancel: {
                    label: 'Cancelar Evento',
                    fields: [
                        { name: 'event_uri', type: 'required', label: 'URI del Evento' },
                        { name: 'reason', type: 'text', label: 'Razón de cancelación' },
                    ],
                },
                listToday: {
                    label: 'Listar Eventos de Hoy',
                    fields: [],
                },
                listThisWeek: {
                    label: 'Listar Eventos de Esta Semana',
                    fields: [],
                },
            },
        },

        // Plugin 4: Invitados
        Invitees: {
            actions: {
                list: {
                    label: 'Listar Invitados de un Evento',
                    fields: [
                        { name: 'event_uri', type: 'required', label: 'URI del Evento' },
                        { name: 'status', type: 'select', label: 'Estado del invitado', options: [
                            { label: 'Todos', value: 'all' },
                            { label: 'Activos', value: 'active' },
                            { label: 'Cancelados', value: 'canceled' },
                        ]},
                    ],
                },
                getDetails: {
                    label: 'Ver Detalles de Invitado',
                    fields: [
                        { name: 'invitee_uri', type: 'required', label: 'URI del Invitado' },
                    ],
                },
            },
        },

        // Plugin 5: Links de agendamiento
        Scheduling: {
            actions: {
                generateLink: {
                    label: 'Generar Link de Agendamiento',
                    fields: [
                        { name: 'event_type_uri', type: 'required', label: 'URI del Tipo de Evento' },
                        { name: 'max_event_count', type: 'text', label: 'Máximo de usos (1-infinito)' },
                    ],
                },
                listLinks: {
                    label: 'Listar Links de Agendamiento Activos',
                    fields: [],
                },
            },
        },

        // Plugin 6: Disponibilidad
        Availability: {
            actions: {
                check: {
                    label: 'Consultar Disponibilidad',
                    fields: [
                        { name: 'event_type_uri', type: 'required', label: 'URI del Tipo de Evento' },
                        { name: 'start_time', type: 'required', label: 'Desde (ISO 8601)' },
                        { name: 'end_time', type: 'required', label: 'Hasta (ISO 8601)' },
                    ],
                },
            },
        },

        // Plugin 7: Webhooks
        Webhooks: {
            actions: {
                list: {
                    label: 'Listar Webhooks',
                    fields: [],
                },
                create: {
                    label: 'Crear Webhook',
                    fields: [
                        { name: 'url', type: 'required', label: 'URL del endpoint receptor' },
                        { name: 'events', type: 'text', label: 'Eventos (separados por coma: invitee.created,invitee.canceled)' },
                        { name: 'scope', type: 'select', label: 'Alcance', options: [
                            { label: 'Usuario', value: 'user' },
                            { label: 'Organización', value: 'organization' },
                        ]},
                    ],
                },
                delete: {
                    label: 'Eliminar Webhook',
                    fields: [
                        { name: 'webhook_uri', type: 'required', label: 'URI del Webhook' },
                    ],
                },
            },
        },
    },
};
