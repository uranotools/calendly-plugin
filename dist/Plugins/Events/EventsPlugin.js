var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// Plugins/Events/EventsPlugin.ts
var EventsPlugin_exports = {};
__export(EventsPlugin_exports, {
  EventsPlugin: () => EventsPlugin
});
module.exports = __toCommonJS(EventsPlugin_exports);

// Plugins/mode-guard.ts
var ALLOWED = {
  full: {
    // Modo completo: todo permitido — se valida por ausencia de restricción
    User: ["getProfile"],
    EventTypes: ["list", "getDetails"],
    Events: ["listUpcoming", "listToday", "listThisWeek", "getDetails", "cancel"],
    Invitees: ["list", "getDetails"],
    Scheduling: ["generateLink", "listLinks"],
    Availability: ["check"],
    Webhooks: ["list", "create", "delete"]
  },
  readonly: {
    // Solo lectura: sin cancelar, sin crear/eliminar webhooks, sin generar links
    User: ["getProfile"],
    EventTypes: ["list", "getDetails"],
    Events: ["listUpcoming", "listToday", "listThisWeek", "getDetails"],
    Invitees: ["list", "getDetails"],
    Scheduling: ["listLinks"],
    Availability: ["check"],
    Webhooks: ["list"]
  },
  scheduling_only: {
    // Solo automatizaciones: agenda y disponibilidad, sin gestión de eventos existentes
    User: ["getProfile"],
    EventTypes: ["list", "getDetails"],
    Events: [],
    Invitees: [],
    Scheduling: ["generateLink", "listLinks"],
    Availability: ["check"],
    Webhooks: []
  }
};
var MODE_LABELS = {
  full: "Manejo Personal Completo",
  readonly: "Solo Lectura",
  scheduling_only: "Solo Automatizaciones de Agendamiento"
};
function guardMode(plugin, action, config) {
  const rawMode = config?.PLUGIN_MODE || "full";
  const mode = ["full", "readonly", "scheduling_only"].includes(rawMode) ? rawMode : "full";
  const allowed = ALLOWED[mode][plugin] ?? [];
  if (!allowed.includes(action)) {
    const label = MODE_LABELS[mode];
    throw new Error(
      `ATENCI\xD3N IA: La acci\xF3n '${action}' del plugin '${plugin}' no est\xE1 disponible en el modo actual del plugin ("${label}"). El usuario ha configurado este plugin para uso restringido. No intentes ejecutar esta acci\xF3n ni sugerir alternativas que la requieran. Informa al usuario que puede cambiar el modo en el MCP Manager \u2192 Calendly \u2192 Configuraci\xF3n.`
    );
  }
}

// Plugins/Events/EventsPlugin.ts
var CALENDLY_MIN_INTERVAL_MS = 700;
var calendlyLastCall = 0;
var calendlyQueue = Promise.resolve();
function calendlyEnqueue(fn) {
  const result = calendlyQueue.then(async () => {
    const now = Date.now();
    const wait = CALENDLY_MIN_INTERVAL_MS - (now - calendlyLastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    calendlyLastCall = Date.now();
    return fn();
  });
  calendlyQueue = result.catch(() => {
  });
  return result;
}
async function calendlyFetch(path, token, options = {}, timeoutMs = 15e3) {
  return calendlyEnqueue(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`https://api.calendly.com${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options.headers || {}
        }
      });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1e3 + 200));
        const retry = await fetch(`https://api.calendly.com${path}`, {
          ...options,
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...options.headers || {} }
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
async function getCurrentUserUri(token) {
  const data = await calendlyFetch("/users/me", token);
  return data.resource.uri;
}
function todayRange() {
  const now = /* @__PURE__ */ new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
function thisWeekRange() {
  const now = /* @__PURE__ */ new Date();
  const diffToMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.toISOString(), end: sunday.toISOString() };
}
function formatEvent(ev) {
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
    cancellation: ev.cancellation || null
  };
}
var EventsPlugin = class {
  constructor(config) {
    this.config = config;
    this.token = config.CALENDLY_TOKEN || "";
    this.defaultCount = parseInt(config.DEFAULT_EVENT_COUNT || "25", 10);
  }
  async executeAction(action, payload) {
    guardMode("Events", action, this.config);
    if (!this.token) {
      return { error: "ATENCI\xD3N IA: El token de Calendly no est\xE1 configurado. Pide al usuario que lo configure en el MCP Manager." };
    }
    if (action === "listToday") {
      const { start, end } = todayRange();
      return this._listEvents({ min_start_time: start, max_start_time: end, count: String(this.defaultCount) });
    }
    if (action === "listThisWeek") {
      const { start, end } = thisWeekRange();
      return this._listEvents({ min_start_time: start, max_start_time: end, count: String(this.defaultCount) });
    }
    if (action === "listUpcoming") {
      return this._listEvents(payload);
    }
    if (action === "getDetails") {
      const { event_uri } = payload;
      if (!event_uri) throw new Error("Se requiere 'event_uri'.");
      const uuid = event_uri.split("/").pop();
      const data = await calendlyFetch(`/scheduled_events/${uuid}`, this.token);
      return formatEvent(data.resource);
    }
    if (action === "cancel") {
      const { event_uri, reason } = payload;
      if (!event_uri) throw new Error("Se requiere 'event_uri'.");
      const uuid = event_uri.split("/").pop();
      const inviteesData = await calendlyFetch(`/scheduled_events/${uuid}/invitees`, this.token);
      const invitees = inviteesData.collection || [];
      if (invitees.length === 0) {
        return { success: false, message: "No se encontraron invitados para cancelar este evento." };
      }
      const results = [];
      for (const invitee of invitees) {
        const inviteeUuid = invitee.uri.split("/").pop();
        try {
          await calendlyFetch(`/scheduled_events/${uuid}/invitees/${inviteeUuid}/cancellation`, this.token, {
            method: "POST",
            body: JSON.stringify({
              reason: reason || "Cancelado a trav\xE9s de Urano AI Agent"
            })
          });
          results.push({ email: invitee.email, cancelled: true });
        } catch (e) {
          results.push({ email: invitee.email, cancelled: false, error: e.message });
        }
      }
      return {
        success: true,
        message: `Se proces\xF3 la cancelaci\xF3n del evento para ${results.length} invitado(s).`,
        results
      };
    }
    throw new Error(`Acci\xF3n '${action}' no soportada en EventsPlugin`);
  }
  async _listEvents(payload) {
    const userUri = await getCurrentUserUri(this.token);
    const count = parseInt(payload.count || String(this.defaultCount), 10);
    const params = new URLSearchParams({
      user: userUri,
      count: String(Math.min(count, 100)),
      sort: "start_time:asc"
    });
    if (payload.min_start_time) params.set("min_start_time", payload.min_start_time);
    if (payload.max_start_time) params.set("max_start_time", payload.max_start_time);
    if (payload.status && payload.status !== "all") params.set("status", payload.status);
    else params.set("status", "active");
    const data = await calendlyFetch(`/scheduled_events?${params.toString()}`, this.token);
    const events = (data.collection || []).map(formatEvent);
    return {
      total: events.length,
      pagination: data.pagination || null,
      events
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EventsPlugin
});
