import { guardMode } from '../mode-guard';

// ── Rate Limiting ─────────────────────────────────────────────────────────
const CALENDLY_MIN_INTERVAL_MS = 700;
let calendlyLastCall = 0;
let calendlyQueue: Promise<any> = Promise.resolve();

function calendlyEnqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = calendlyQueue.then(async () => {
        const now = Date.now();
        const wait = CALENDLY_MIN_INTERVAL_MS - (now - calendlyLastCall);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        calendlyLastCall = Date.now();
        return fn();
    });
    calendlyQueue = result.catch(() => {});
    return result;
}

async function calendlyFetch(
    path: string,
    token: string,
    options: RequestInit = {},
    timeoutMs = 15000
): Promise<any> {
    return calendlyEnqueue(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(`https://api.calendly.com${path}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...(options.headers || {}),
                },
            });
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
                await new Promise(r => setTimeout(r, retryAfter * 1000 + 200));
                const retry = await fetch(`https://api.calendly.com${path}`, {
                    ...options,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        ...(options.headers || {}),
                    },
                });
                if (!retry.ok) throw new Error(`Calendly API error ${retry.status}: ${await retry.text()}`);
                return retry.json();
            }
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`Calendly API error ${res.status}: ${body}`);
            }
            const text = await res.text();
            return text ? JSON.parse(text) : {};
        } finally {
            clearTimeout(timer);
        }
    });
}

export class UserPlugin {
    private token: string;
    private config: any;

    constructor(config: any) {
        this.config = config;
        this.token = config.CALENDLY_TOKEN || '';
    }

    async executeAction(action: string, payload: any) {
        guardMode('User', action, this.config);

        if (!this.token) {
            return { error: 'ATENCIÓN IA: El token de Calendly no está configurado. Pide al usuario que lo configure en el MCP Manager.' };
        }

        if (action === 'getProfile') {
            const data = await calendlyFetch('/users/me', this.token);
            const user = data.resource;
            return {
                name: user.name,
                email: user.email,
                timezone: user.timezone,
                avatar_url: user.avatar_url,
                scheduling_url: user.scheduling_url,
                uri: user.uri,
                slug: user.slug,
                created_at: user.created_at,
                organization: user.current_organization,
            };
        }

        throw new Error(`Acción '${action}' no soportada en UserPlugin`);
    }
}
