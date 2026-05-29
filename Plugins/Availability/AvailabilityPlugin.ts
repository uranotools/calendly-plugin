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

export class AvailabilityPlugin {
    private token: string;
    private config: any;

    constructor(config: any) {
        this.config = config;
        this.token = config.CALENDLY_TOKEN || '';
    }

    async executeAction(action: string, payload: any) {
        guardMode('Availability', action, this.config);

        if (!this.token) {
            return { error: 'ATENCIÓN IA: El token de Calendly no está configurado.' };
        }

        // ── check ─────────────────────────────────────────────────────────
        if (action === 'check') {
            const { event_type_uri, start_time, end_time } = payload;
            if (!event_type_uri) throw new Error("Se requiere 'event_type_uri'.");
            if (!start_time) throw new Error("Se requiere 'start_time' en formato ISO 8601.");
            if (!end_time) throw new Error("Se requiere 'end_time' en formato ISO 8601.");

            // Extraer el UUID del event type
            const eventTypeUuid = event_type_uri.split('/').pop();

            const params = new URLSearchParams({
                event_type: `https://api.calendly.com/event_types/${eventTypeUuid}`,
                start_time,
                end_time,
            });

            const data = await calendlyFetch(
                `/event_type_available_times?${params.toString()}`,
                this.token
            );

            const slots = data.collection || [];

            return {
                total_available_slots: slots.length,
                event_type: event_type_uri,
                range: { from: start_time, to: end_time },
                available_times: slots.map((slot: any) => ({
                    start_time: slot.start_time,
                    invitees_remaining: slot.invitees_remaining,
                    status: slot.status,
                })),
                summary: slots.length > 0
                    ? `Hay ${slots.length} horario(s) disponible(s) entre ${start_time} y ${end_time}.`
                    : `No hay horarios disponibles entre ${start_time} y ${end_time}.`,
            };
        }

        throw new Error(`Acción '${action}' no soportada en AvailabilityPlugin`);
    }
}
