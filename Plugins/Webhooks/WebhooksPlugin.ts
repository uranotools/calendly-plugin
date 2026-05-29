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

// Eventos de webhook soportados por la API de Calendly
const VALID_WEBHOOK_EVENTS = [
    'invitee.created',
    'invitee.canceled',
    'invitee_no_show.created',
    'invitee_no_show.deleted',
    'routing_form_submission.created',
    'meeting_guests_changed',
];

export class WebhooksPlugin {
    private token: string;
    private configOrgUri: string;
    private config: any;

    constructor(config: any) {
        this.config = config;
        this.token = config.CALENDLY_TOKEN || '';
        this.configOrgUri = config.CALENDLY_ORG_URI || '';
    }

    async executeAction(action: string, payload: any) {
        guardMode('Webhooks', action, this.config);

        if (!this.token) {
            return { error: 'ATENCIÓN IA: El token de Calendly no está configurado.' };
        }

        // ── list ──────────────────────────────────────────────────────────
        if (action === 'list') {
            const { userUri, orgUri } = await getCurrentUserAndOrg(this.token);
            const resolvedOrg = this.configOrgUri || orgUri;

            const params = new URLSearchParams({
                scope: 'user',
                user: userUri,
                organization: resolvedOrg,
            });

            const data = await calendlyFetch(`/webhook_subscriptions?${params.toString()}`, this.token);

            return {
                total: data.collection?.length || 0,
                webhooks: (data.collection || []).map((wh: any) => ({
                    uri: wh.uri,
                    callback_url: wh.callback_url,
                    events: wh.events,
                    scope: wh.scope,
                    state: wh.state,
                    created_at: wh.created_at,
                    updated_at: wh.updated_at,
                    retry_started_at: wh.retry_started_at,
                })),
            };
        }

        // ── create ────────────────────────────────────────────────────────
        if (action === 'create') {
            const { url, events, scope } = payload;
            if (!url) throw new Error("Se requiere 'url' (endpoint receptor del webhook).");
            if (!events) throw new Error("Se requiere 'events' (ej: invitee.created,invitee.canceled).");

            const { userUri, orgUri } = await getCurrentUserAndOrg(this.token);
            const resolvedOrg = this.configOrgUri || orgUri;

            // Parsear y validar los eventos
            const requestedEvents = events.split(',').map((e: string) => e.trim()).filter(Boolean);
            const invalidEvents = requestedEvents.filter((e: string) => !VALID_WEBHOOK_EVENTS.includes(e));
            if (invalidEvents.length > 0) {
                return {
                    error: `Eventos inválidos: ${invalidEvents.join(', ')}. Eventos válidos: ${VALID_WEBHOOK_EVENTS.join(', ')}`,
                };
            }

            const resolvedScope = scope || 'user';

            const body: any = {
                url,
                events: requestedEvents,
                organization: resolvedOrg,
                scope: resolvedScope,
            };

            if (resolvedScope === 'user') {
                body.user = userUri;
            }

            const data = await calendlyFetch('/webhook_subscriptions', this.token, {
                method: 'POST',
                body: JSON.stringify(body),
            });

            const wh = data.resource;
            return {
                success: true,
                uri: wh.uri,
                callback_url: wh.callback_url,
                events: wh.events,
                scope: wh.scope,
                state: wh.state,
                created_at: wh.created_at,
            };
        }

        // ── delete ────────────────────────────────────────────────────────
        if (action === 'delete') {
            const { webhook_uri } = payload;
            if (!webhook_uri) throw new Error("Se requiere 'webhook_uri'.");
            const uuid = webhook_uri.split('/').pop();

            await calendlyFetch(`/webhook_subscriptions/${uuid}`, this.token, {
                method: 'DELETE',
            });

            return {
                success: true,
                message: `Webhook ${webhook_uri} eliminado correctamente.`,
            };
        }

        throw new Error(`Acción '${action}' no soportada en WebhooksPlugin`);
    }
}
