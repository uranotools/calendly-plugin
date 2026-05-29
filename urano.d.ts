// Declara los módulos internos de Urano para silenciar errores de TypeScript
// en el editor. En runtime, Urano inyecta estas clases automáticamente.
// NO incluir este archivo en el bundle de esbuild.

declare module '@core/PluginBase' {
    export class PluginBase {
        constructor(config: any);
        protected config: any;
        protected moduleName: string;
    }
}

declare module '@core/Security/Vault' {
    export class Vault {
        static getSecret(module: string, key: string): string | null;
        static deleteSecret(module: string, key: string): void;
    }
}

declare module '@core/Router' {
    export const Router: any;
}

declare module '@core/runtime/SessionManager' {
    export class SessionManager {
        static getSession(sessionId: string): any;
    }
}

declare module '@core/EnginePluginBase' {
    export class EnginePluginBase {
        constructor(config?: any);
    }
}
