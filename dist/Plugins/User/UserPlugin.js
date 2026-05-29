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

// Plugins/User/UserPlugin.ts
var UserPlugin_exports = {};
__export(UserPlugin_exports, {
  UserPlugin: () => UserPlugin
});
module.exports = __toCommonJS(UserPlugin_exports);

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

// Plugins/User/UserPlugin.ts
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
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            ...options.headers || {}
          }
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
var UserPlugin = class {
  constructor(config) {
    this.config = config;
    this.token = config.CALENDLY_TOKEN || "";
  }
  async executeAction(action, payload) {
    guardMode("User", action, this.config);
    if (!this.token) {
      return { error: "ATENCI\xD3N IA: El token de Calendly no est\xE1 configurado. Pide al usuario que lo configure en el MCP Manager." };
    }
    if (action === "getProfile") {
      const data = await calendlyFetch("/users/me", this.token);
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
        organization: user.current_organization
      };
    }
    throw new Error(`Acci\xF3n '${action}' no soportada en UserPlugin`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  UserPlugin
});
