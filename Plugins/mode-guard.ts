/**
 * mode-guard.ts — Control de acceso por modo de operación del plugin Calendly
 *
 * PLUGIN_MODE define qué herramientas puede usar el agente:
 *
 *  full             → Acceso completo a todas las herramientas (modo personal)
 *  readonly         → Solo lectura: sin cancelaciones, sin crear webhooks ni links
 *  scheduling_only  → Solo automatizaciones: perfil, tipos de evento, links, disponibilidad
 */

export type PluginMode = 'full' | 'readonly' | 'scheduling_only';

// ── Mapa de acciones permitidas por modo y plugin ───────────────────────────
const ALLOWED: Record<PluginMode, Record<string, string[]>> = {
    full: {
        // Modo completo: todo permitido — se valida por ausencia de restricción
        User:         ['getProfile'],
        EventTypes:   ['list', 'getDetails'],
        Events:       ['listUpcoming', 'listToday', 'listThisWeek', 'getDetails', 'cancel'],
        Invitees:     ['list', 'getDetails'],
        Scheduling:   ['generateLink', 'listLinks'],
        Availability: ['check'],
        Webhooks:     ['list', 'create', 'delete'],
    },
    readonly: {
        // Solo lectura: sin cancelar, sin crear/eliminar webhooks, sin generar links
        User:         ['getProfile'],
        EventTypes:   ['list', 'getDetails'],
        Events:       ['listUpcoming', 'listToday', 'listThisWeek', 'getDetails'],
        Invitees:     ['list', 'getDetails'],
        Scheduling:   ['listLinks'],
        Availability: ['check'],
        Webhooks:     ['list'],
    },
    scheduling_only: {
        // Solo automatizaciones: agenda y disponibilidad, sin gestión de eventos existentes
        User:         ['getProfile'],
        EventTypes:   ['list', 'getDetails'],
        Events:       [],
        Invitees:     [],
        Scheduling:   ['generateLink', 'listLinks'],
        Availability: ['check'],
        Webhooks:     [],
    },
};

// Descripciones amigables para mensajes de error al agente
const MODE_LABELS: Record<PluginMode, string> = {
    full:             'Manejo Personal Completo',
    readonly:         'Solo Lectura',
    scheduling_only:  'Solo Automatizaciones de Agendamiento',
};

/**
 * Lanza un error descriptivo si la acción no está permitida en el modo activo.
 * Llama esto al inicio de cada executeAction().
 *
 * @param plugin   Nombre del plugin (ej: 'Events')
 * @param action   Nombre de la acción (ej: 'cancel')
 * @param config   Objeto de configuración inyectado por Urano (contiene PLUGIN_MODE)
 */
export function guardMode(plugin: string, action: string, config: any): void {
    const rawMode = (config?.PLUGIN_MODE || 'full') as string;
    const mode: PluginMode = (['full', 'readonly', 'scheduling_only'].includes(rawMode)
        ? rawMode
        : 'full') as PluginMode;

    const allowed = ALLOWED[mode][plugin] ?? [];

    if (!allowed.includes(action)) {
        const label = MODE_LABELS[mode];
        throw new Error(
            `ATENCIÓN IA: La acción '${action}' del plugin '${plugin}' no está disponible ` +
            `en el modo actual del plugin ("${label}"). ` +
            `El usuario ha configurado este plugin para uso restringido. ` +
            `No intentes ejecutar esta acción ni sugerir alternativas que la requieran. ` +
            `Informa al usuario que puede cambiar el modo en el MCP Manager → Calendly → Configuración.`
        );
    }
}

/**
 * Retorna las acciones permitidas para un plugin en el modo actual.
 * Útil para generar mensajes explicativos.
 */
export function getAllowedActions(plugin: string, config: any): string[] {
    const rawMode = (config?.PLUGIN_MODE || 'full') as string;
    const mode: PluginMode = (['full', 'readonly', 'scheduling_only'].includes(rawMode)
        ? rawMode
        : 'full') as PluginMode;
    return ALLOWED[mode][plugin] ?? [];
}
