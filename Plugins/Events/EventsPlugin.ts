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

async function getCurrentUserUri(token: string): Promise<string> {
    const data = await calendlyFetch('/users/me', token);
    return data.resource.uri;
}

function todayRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
}

function thisWeekRange() {
    const now = new Date();
    const diffToMonday = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);
    return { start: monday.toISOString(), end: sunday.toISOString() };
}

function formatEvent(ev: any) {
    return {
        uri: ev.uri,
        name: ev.name,
        status: ev.status,
        start_time: ev.start_time,
        end_time: ev.end_time,
        event_type: ev.event_type,
        location: ev.location?.join_url || ev.location?.location || ev.location?.type || null,
        created_at: ev.created_at,
        updated_at: ev.updated_at,
        invitees_counter: ev.invitees_counter,
        meeting_notes_plain: ev.meeting_notes_plain || null,
        cancellation: ev.cancellation || null,
    };
}

export class EventsPlugin {
    private token: string;
    private defaultCount: number;
    private config: any;

    constructor(config: any) {
        this.config = config;
        this.token = config.CALENDLY_TOKEN || '';
        this.defaultCount = parseInt(config.DEFAULT_EVENT_COUNT || '25', 10);
    }

    async executeAction(action: string, payload: any) {
        guardMode('Events', action, this.config);

        if (!this.token) {
            return { error: 'ATENCIÓN IA: El token de Calendly no está configurado. Pide al usuario que lo configure en el MCP Manager.' };
        }

        // ── listToday ────────────────────────────────────────────────────
        if (action === 'listToday') {
            const { start, end } = todayRange();
            return this._listEvents({ min_start_time: start, max_start_time: end, count: String(this.defaultCount) });
        }

        // ── listThisWeek ─────────────────────────────────────────────────
        if (action === 'listThisWeek') {
            const { start, end } = thisWeekRange();
            return this._listEvents({ min_start_time: start, max_start_time: end, count: String(this.defaultCount) });
        }

        // ── listUpcoming ─────────────────────────────────────────────────
        if (action === 'listUpcoming') {
            return this._listEvents(payload);
        }

        // ── getDetails ───────────────────────────────────────────────────
        if (action === 'getDetails') {
            const { event_uri } = payload;
            if (!event_uri) throw new Error("Se requiere 'event_uri'.");
            const uuid = event_uri.split('/').pop();
            const data = await calendlyFetch(`/scheduled_events/${uuid}`, this.token);
            return formatEvent(data.resource);
        }

        // ── cancel ───────────────────────────────────────────────────────
        if (action === 'cancel') {
            const { event_uri, reason } = payload;
            if (!event_uri) throw new Error("Se requiere 'event_uri'.");
            const uuid = event_uri.split('/').pop();

            // Calendly requiere cancelar a través del endpoint de invitee
            // Primero obtenemos los invitados para cancelar
            const inviteesData = await calendlyFetch(`/scheduled_events/${uuid}/invitees`, this.token);
            const invitees = inviteesData.collection || [];

            if (invitees.length === 0) {
                return { success: false, message: 'No se encontraron invitados para cancelar este evento.' };
            }

            // Cancelar cada invitado
            const results = [];
            for (const invitee of invitees) {
                const inviteeUuid = invitee.uri.split('/').pop();
                try {
                    await calendlyFetch(`/scheduled_events/${uuid}/invitees/${inviteeUuid}/cancellation`, this.token, {
                        method: 'POST',
                        body: JSON.stringify({
                            reason: reason || 'Cancelado a través de Urano AI Agent',
                        }),
                    });
                    results.push({ email: invitee.email, cancelled: true });
                } catch (e: any) {
                    results.push({ email: invitee.email, cancelled: false, error: e.message });
                }
            }

            return {
                success: true,
                message: `Se procesó la cancelación del evento para ${results.length} invitado(s).`,
                results,
            };
        }

        throw new Error(`Acción '${action}' no soportada en EventsPlugin`);
    }

    private async _listEvents(payload: any) {
        const userUri = await getCurrentUserUri(this.token);
        const count = parseInt(payload.count || String(this.defaultCount), 10);

        const params = new URLSearchParams({
            user: userUri,
            count: String(Math.min(count, 100)),
            sort: 'start_time:asc',
        });

        if (payload.min_start_time) params.set('min_start_time', payload.min_start_time);
        if (payload.max_start_time) params.set('max_start_time', payload.max_start_time);
        if (payload.status && payload.status !== 'all') params.set('status', payload.status);
        else params.set('status', 'active');

        const data = await calendlyFetch(`/scheduled_events?${params.toString()}`, this.token);
        const events = (data.collection || []).map(formatEvent);

        return {
            total: events.length,
            pagination: data.pagination || null,
            events,
        };
    }
}
