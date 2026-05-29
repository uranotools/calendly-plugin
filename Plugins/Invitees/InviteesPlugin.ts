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

export class InviteesPlugin {
    private token: string;
    private config: any;

    constructor(config: any) {
        this.config = config;
        this.token = config.CALENDLY_TOKEN || '';
    }

    async executeAction(action: string, payload: any) {
        guardMode('Invitees', action, this.config);

        if (!this.token) {
            return { error: 'ATENCIÓN IA: El token de Calendly no está configurado.' };
        }

        // ── list ──────────────────────────────────────────────────────────
        if (action === 'list') {
            const { event_uri, status } = payload;
            if (!event_uri) throw new Error("Se requiere 'event_uri'.");
            const eventUuid = event_uri.split('/').pop();

            const params = new URLSearchParams({ count: '100' });
            if (status && status !== 'all') params.set('status', status);

            const data = await calendlyFetch(
                `/scheduled_events/${eventUuid}/invitees?${params.toString()}`,
                this.token
            );

            return {
                total: data.collection?.length || 0,
                invitees: (data.collection || []).map((inv: any) => ({
                    uri: inv.uri,
                    email: inv.email,
                    name: inv.name,
                    status: inv.status,
                    timezone: inv.timezone,
                    created_at: inv.created_at,
                    updated_at: inv.updated_at,
                    cancel_url: inv.cancel_url,
                    reschedule_url: inv.reschedule_url,
                    questions_and_answers: inv.questions_and_answers || [],
                    tracking: inv.tracking || null,
                    payment: inv.payment || null,
                    no_show: inv.no_show || null,
                })),
            };
        }

        // ── getDetails ────────────────────────────────────────────────────
        if (action === 'getDetails') {
            const { invitee_uri } = payload;
            if (!invitee_uri) throw new Error("Se requiere 'invitee_uri'.");

            // La URI de invitee tiene la forma: .../scheduled_events/{eventUuid}/invitees/{inviteeUuid}
            const parts = invitee_uri.split('/');
            const inviteeUuid = parts.pop();
            const eventUuid = parts[parts.indexOf('scheduled_events') + 1];

            const data = await calendlyFetch(
                `/scheduled_events/${eventUuid}/invitees/${inviteeUuid}`,
                this.token
            );
            const inv = data.resource;
            return {
                uri: inv.uri,
                email: inv.email,
                name: inv.name,
                status: inv.status,
                timezone: inv.timezone,
                created_at: inv.created_at,
                cancel_url: inv.cancel_url,
                reschedule_url: inv.reschedule_url,
                questions_and_answers: inv.questions_and_answers || [],
                tracking: inv.tracking || null,
                payment: inv.payment || null,
                no_show: inv.no_show || null,
                routing_form_submission: inv.routing_form_submission || null,
            };
        }

        throw new Error(`Acción '${action}' no soportada en InviteesPlugin`);
    }
}
