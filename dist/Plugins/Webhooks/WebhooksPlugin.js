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

// Plugins/Webhooks/WebhooksPlugin.ts
var WebhooksPlugin_exports = {};
__export(WebhooksPlugin_exports, {
  WebhooksPlugin: () => WebhooksPlugin
});
module.exports = __toCommonJS(WebhooksPlugin_exports);

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

// Plugins/Webhooks/WebhooksPlugin.ts
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
async function getCurrentUserAndOrg(token) {
  const data = await calendlyFetch("/users/me", token);
  return {
    userUri: data.resource.uri,
    orgUri: data.resource.current_organization
  };
}
var VALID_WEBHOOK_EVENTS = [
  "invitee.created",
  "invitee.canceled",
  "invitee_no_show.created",
  "invitee_no_show.deleted",
  "routing_form_submission.created",
  "meeting_guests_changed"
];
var WebhooksPlugin = class {
  constructor(config) {
    this.config = config;
    this.token = config.CALENDLY_TOKEN || "";
    this.configOrgUri = config.CALENDLY_ORG_URI || "";
  }
  async executeAction(action, payload) {
    guardMode("Webhooks", action, this.config);
    if (!this.token) {
      return { error: "ATENCI\xD3N IA: El token de Calendly no est\xE1 configurado." };
    }
    if (action === "list") {
      const { userUri, orgUri } = await getCurrentUserAndOrg(this.token);
      const resolvedOrg = this.configOrgUri || orgUri;
      const params = new URLSearchParams({
        scope: "user",
        user: userUri,
        organization: resolvedOrg
      });
      const data = await calendlyFetch(`/webhook_subscriptions?${params.toString()}`, this.token);
      return {
        total: data.collection?.length || 0,
        webhooks: (data.collection || []).map((wh) => ({
          uri: wh.uri,
          callback_url: wh.callback_url,
          events: wh.events,
          scope: wh.scope,
          state: wh.state,
          created_at: wh.created_at,
          updated_at: wh.updated_at,
          retry_started_at: wh.retry_started_at
        }))
      };
    }
    if (action === "create") {
      const { url, events, scope } = payload;
      if (!url) throw new Error("Se requiere 'url' (endpoint receptor del webhook).");
      if (!events) throw new Error("Se requiere 'events' (ej: invitee.created,invitee.canceled).");
      const { userUri, orgUri } = await getCurrentUserAndOrg(this.token);
      const resolvedOrg = this.configOrgUri || orgUri;
      const requestedEvents = events.split(",").map((e) => e.trim()).filter(Boolean);
      const invalidEvents = requestedEvents.filter((e) => !VALID_WEBHOOK_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        return {
          error: `Eventos inv\xE1lidos: ${invalidEvents.join(", ")}. Eventos v\xE1lidos: ${VALID_WEBHOOK_EVENTS.join(", ")}`
        };
      }
      const resolvedScope = scope || "user";
      const body = {
        url,
        events: requestedEvents,
        organization: resolvedOrg,
        scope: resolvedScope
      };
      if (resolvedScope === "user") {
        body.user = userUri;
      }
      const data = await calendlyFetch("/webhook_subscriptions", this.token, {
        method: "POST",
        body: JSON.stringify(body)
      });
      const wh = data.resource;
      return {
        success: true,
        uri: wh.uri,
        callback_url: wh.callback_url,
        events: wh.events,
        scope: wh.scope,
        state: wh.state,
        created_at: wh.created_at
      };
    }
    if (action === "delete") {
      const { webhook_uri } = payload;
      if (!webhook_uri) throw new Error("Se requiere 'webhook_uri'.");
      const uuid = webhook_uri.split("/").pop();
      await calendlyFetch(`/webhook_subscriptions/${uuid}`, this.token, {
        method: "DELETE"
      });
      return {
        success: true,
        message: `Webhook ${webhook_uri} eliminado correctamente.`
      };
    }
    throw new Error(`Acci\xF3n '${action}' no soportada en WebhooksPlugin`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebhooksPlugin
});
