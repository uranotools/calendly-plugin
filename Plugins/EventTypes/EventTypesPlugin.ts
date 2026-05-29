import { guardMode } from '../mode-guard';

// ── Rate Limiting singleton compartido con UserPlugin ─────────────────────
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
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
                });
                if (!retry.ok) throw new Error(`Calendly API error ${retry.status}: ${await retry.text()}`);
                return retry.json();
            }
            if (!res.ok) throw new Error(`Calendly API error ${res.status}: ${await res.text()}`);
            const text = await res.text();
            return text ? JSON.parse(text) : {};
        } finally {
            clearTimeout(timer);
        }
    });
}

// ── Obtener URI del usuario actual ────────────────────────────────────────
async function getCurrentUserUri(token: string): Promise<string> {
    const data = await calendlyFetch('/users/me', token);
    return data.resource.uri;
}

export class EventTypesPlugin {
    private token: string;
    private orgUri: string;
    private config: any;

    constructor(config: any) {
        this.config = config;
        this.token = config.CALENDLY_TOKEN || '';
        this.orgUri = config.CALENDLY_ORG_URI || '';
    }

    async executeAction(action: string, payload: any) {
        guardMode('EventTypes', action, this.config);

        if (!this.token) {
            return { error: 'ATENCIÓN IA: El token de Calendly no está configurado.' };
        }

        if (action === 'list') {
            // Obtener userUri para filtrar los event types del usuario
            const userUri = await getCurrentUserUri(this.token);
            const params = new URLSearchParams({ user: userUri, count: '100' });

            if (payload.active && payload.active !== 'all') {
                params.set('active', payload.active);
            }

            const data = await calendlyFetch(`/event_types?${params.toString()}`, this.token);

            return {
                total: data.collection?.length || 0,
                event_types: (data.collection || []).map((et: any) => ({
                    uri: et.uri,
                    name: et.name,
                    slug: et.slug,
                    duration: et.duration,
                    kind: et.kind,
                    active: et.active,
                    description: et.description_plain,
                    scheduling_url: et.scheduling_url,
                    color: et.color,
                    type: et.type,
                    secret: et.secret,
                })),
            };
        }

        if (action === 'getDetails') {
            const { event_type_uri } = payload;
            if (!event_type_uri) throw new Error("Se requiere 'event_type_uri'.");
            const uuid = event_type_uri.split('/').pop();
            const data = await calendlyFetch(`/event_types/${uuid}`, this.token);
            const et = data.resource;
            return {
                uri: et.uri,
                name: et.name,
                slug: et.slug,
                duration: et.duration,
                kind: et.kind,
                active: et.active,
                description: et.description_plain,
                scheduling_url: et.scheduling_url,
                color: et.color,
                type: et.type,
                locations: et.profile?.name,
                questions: et.custom_questions?.map((q: any) => ({ name: q.name, required: q.required })),
            };
        }

        throw new Error(`Acción '${action}' no soportada en EventTypesPlugin`);
    }
}
