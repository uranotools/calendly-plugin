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

async function getCurrentUserAndOrg(token: string): Promise<{ userUri: string; orgUri: string }> {
    const data = await calendlyFetch('/users/me', token);
    return {
        userUri: data.resource.uri,
        orgUri: data.resource.current_organization,
    };
}

export class SchedulingPlugin {
    private token: string;
    private configOrgUri: string;
    private config: any;

    constructor(config: any) {
        this.config = config;
        this.token = config.CALENDLY_TOKEN || '';
        this.configOrgUri = config.CALENDLY_ORG_URI || '';
    }

    async executeAction(action: string, payload: any) {
        guardMode('Scheduling', action, this.config);

        if (!this.token) {
            return { error: 'ATENCIÓN IA: El token de Calendly no está configurado.' };
        }

        // ── generateLink ─────────────────────────────────────────────────
        if (action === 'generateLink') {
            const { event_type_uri, max_event_count } = payload;
            if (!event_type_uri) throw new Error("Se requiere 'event_type_uri'.");

            const { userUri } = await getCurrentUserAndOrg(this.token);

            const body: any = {
                max_event_count: max_event_count ? parseInt(max_event_count, 10) : 1,
                owner: userUri,
                owner_type: 'users',
            };

            const data = await calendlyFetch('/scheduling_links', this.token, {
                method: 'POST',
                body: JSON.stringify(body),
            });

            const link = data.resource;
            return {
                booking_url: link.booking_url,
                owner: link.owner,
                owner_type: link.owner_type,
                max_event_count: link.max_event_count,
                remaining_event_count: link.remaining_event_count,
                status: link.status,
            };
        }

        // ── listLinks ────────────────────────────────────────────────────
        if (action === 'listLinks') {
            const { userUri } = await getCurrentUserAndOrg(this.token);
            const params = new URLSearchParams({ owner: userUri, owner_type: 'users' });
            const data = await calendlyFetch(`/scheduling_links?${params.toString()}`, this.token);

            return {
                total: data.collection?.length || 0,
                links: (data.collection || []).map((l: any) => ({
                    booking_url: l.booking_url,
                    owner: l.owner,
                    max_event_count: l.max_event_count,
                    remaining_event_count: l.remaining_event_count,
                    status: l.status,
                })),
            };
        }

        throw new Error(`Acción '${action}' no soportada en SchedulingPlugin`);
    }
}
