import { EnginePluginBase } from '@core/EnginePluginBase';

export class CalendlyEnginePlugin extends EnginePluginBase {
    protected config: any;

    constructor(config: any) {
        super(config);
        this.config = config;
    }

    async onSessionStart(ctx: any): Promise<void> {
        const mode = this.config?.PLUGIN_MODE || 'full';

        ctx.appendCustomInstructions(
            `\n\n[🔒 MÓDULO CALENDLY - CONFIGURACIÓN DEL SISTEMA]\n` +
            `El plugin de Calendly está configurado por el usuario en el modo: "${mode}".\n` +
            `Como agente, debes respetar estrictamente las siguientes restricciones y limitaciones en este chat:\n` +
            (mode === 'readonly'
                ? `* Estás en modo de SOLO LECTURA. Solo puedes consultar y listar información. TIENES PROHIBIDO cancelar reuniones, generar links de agendamiento o crear/eliminar webhooks.\n`
                : '') +
            (mode === 'scheduling_only'
                ? `* Estás en modo de SOLO AGENDAMIENTO. Solo puedes consultar la disponibilidad del usuario y generar links de agendamiento. TIENES PROHIBIDO listar eventos agendados, consultar invitados, cancelar eventos o administrar webhooks.\n`
                : '') +
            `* Si el usuario te pide realizar alguna de estas acciones prohibidas, explícale de forma cortés que no puedes hacerlo porque el plugin está configurado en el modo "${mode}", e indícale que puede cambiar el modo en la configuración (MCP Manager → Calendly → Configuración).`
        );
    }
}
