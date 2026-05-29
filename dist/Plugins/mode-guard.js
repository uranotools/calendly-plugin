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

// Plugins/mode-guard.ts
var mode_guard_exports = {};
__export(mode_guard_exports, {
  getAllowedActions: () => getAllowedActions,
  guardMode: () => guardMode
});
module.exports = __toCommonJS(mode_guard_exports);
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
function getAllowedActions(plugin, config) {
  const rawMode = config?.PLUGIN_MODE || "full";
  const mode = ["full", "readonly", "scheduling_only"].includes(rawMode) ? rawMode : "full";
  return ALLOWED[mode][plugin] ?? [];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getAllowedActions,
  guardMode
});
