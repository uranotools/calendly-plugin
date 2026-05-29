---
name: Calendly
description: Gestión completa de agenda con Calendly — consulta eventos, verifica disponibilidad, administra invitados, genera links de agendamiento y administra webhooks directamente desde el agente.
tools: [urano_calendly_user_getprofile, urano_calendly_eventtypes_list, urano_calendly_eventtypes_getdetails, urano_calendly_events_listupcoming, urano_calendly_events_listtoday, urano_calendly_events_listthisweek, urano_calendly_events_getdetails, urano_calendly_events_cancel, urano_calendly_invitees_list, urano_calendly_invitees_getdetails, urano_calendly_scheduling_generatelink, urano_calendly_scheduling_listlinks, urano_calendly_availability_check, urano_calendly_webhooks_list, urano_calendly_webhooks_create, urano_calendly_webhooks_delete]
type: mcp
---

# Skill: Calendly — Gestión de Agenda Inteligente

Este módulo conecta al agente con la cuenta de Calendly del usuario, permitiendo consultar, gestionar y automatizar toda la agenda de reuniones de forma conversacional.

---

## Protocolo de Inicio Obligatorio

**SIEMPRE** que el usuario mencione agenda, reuniones, disponibilidad, citas, Calendly, o cualquier concepto relacionado con agendar tiempo, debes:

1. Verificar que el módulo está configurado ejecutando `urano_calendly_user_getprofile`.
2. Si el perfil se obtiene correctamente, usa el `uri` del usuario para operaciones posteriores.
3. Si obtienes un error de token, informa al usuario que debe configurar su `Personal Access Token` en el **MCP Manager → Calendly → Configuración**.

---

## 🔒 Modo de Operación (PLUGIN_MODE)

El usuario puede restringir qué acciones puedes realizar. Si intentas ejecutar una herramienta bloqueada, recibirás un error con el texto `ATENCIÓN IA:`. Cuando esto ocurra:

- **Informa al usuario** amablemente que esa acción no está disponible en su modo actual.
- **Indica el modo activo** y cómo cambiarlo: *MCP Manager → Calendly → Configuración → Modo de Operación*.
- **NO intentes rodear la restricción** usando otras herramientas.

| Modo | Acciones disponibles |
|------|---------------------|
| `full` (Manejo Personal Completo) | Todas las herramientas: ver, cancelar, webhooks, links |
| `readonly` (Solo Lectura) | Consulta y listados únicamente — sin cancelar, sin crear webhooks ni links |
| `scheduling_only` (Solo Automatizaciones) | Solo perfil, tipos de evento, generar links y disponibilidad |

---


## Herramientas Disponibles

### 👤 Perfil de Usuario

#### `urano_calendly_user_getprofile`
Obtiene el perfil del usuario autenticado, incluyendo su zona horaria, URL de agendamiento y URI de organización.
- **Uso**: Ejecuta esta herramienta al iniciar cualquier flujo de Calendly para confirmar que la cuenta está conectada.
- **Resultado clave**: `uri` (necesario para filtrar eventos y tipos), `timezone`, `scheduling_url`.

---

### 📋 Tipos de Eventos (Event Types)

#### `urano_calendly_eventtypes_list`
Lista todos los tipos de reuniones configurados en la cuenta (ej. "Demo de 30 min", "Consultoría de 1 hora").
- **Uso**: Cuando el usuario pregunta "¿qué tipos de reuniones tengo?" o necesitas el `event_type_uri` para otra operación.
- **Parámetro `active`**: Usa `all` para todos, `true` solo activos (recomendado por defecto).

#### `urano_calendly_eventtypes_getdetails`
Obtiene información detallada de un tipo de evento específico, incluyendo preguntas personalizadas y duración.
- **Requiere**: `event_type_uri` (obtenerlo con `list` primero).

---

### 📅 Eventos Agendados

#### `urano_calendly_events_listtoday`
Lista todos los eventos programados para hoy. **Úsalo cuando el usuario pregunte por su agenda del día.**

#### `urano_calendly_events_listthisweek`
Lista los eventos de la semana en curso (lunes a domingo). **Úsalo cuando el usuario pregunte por su semana.**

#### `urano_calendly_events_listupcoming`
Lista próximos eventos con filtros avanzados de fecha y estado.
- **Parámetros opcionales**:
  - `min_start_time` / `max_start_time`: Rango en formato ISO 8601 (ej. `2025-07-01T00:00:00Z`).
  - `count`: Número de resultados (default: configuración del usuario).
  - `status`: `active` (por defecto) o `canceled`.

#### `urano_calendly_events_getdetails`
Obtiene todos los detalles de un evento específico: ubicación, link de videollamada, notas, etc.
- **Requiere**: `event_uri`.

#### `urano_calendly_events_cancel`
Cancela un evento y notifica a todos los invitados.
- **⚠️ Importante**: Pide SIEMPRE confirmación explícita al usuario antes de ejecutar esta acción.
- **Requiere**: `event_uri`.
- **Opcional**: `reason` (razón de cancelación, visible para los invitados).

---

### 👥 Invitados

#### `urano_calendly_invitees_list`
Lista los invitados de un evento específico con sus respuestas a preguntas personalizadas.
- **Requiere**: `event_uri`.

#### `urano_calendly_invitees_getdetails`
Obtiene los detalles completos de un invitado específico.
- **Requiere**: `invitee_uri` (obtenible desde `list`).

---

### 🔗 Links de Agendamiento

#### `urano_calendly_scheduling_generatelink`
Genera un link único de agendamiento de un solo uso (o con un número máximo de usos).
- **Caso de uso típico**: El usuario quiere compartir un link con alguien para que agende una reunión específica.
- **Requiere**: `event_type_uri`.
- **Opcional**: `max_event_count` (cuántas veces puede usarse el link).

#### `urano_calendly_scheduling_listlinks`
Lista todos los links de agendamiento activos del usuario.

---

### 📡 Webhooks

#### `urano_calendly_webhooks_list`
Lista todos los webhooks configurados en la cuenta del usuario.

#### `urano_calendly_webhooks_create`
Crea un nuevo webhook para recibir notificaciones en tiempo real.
- **Requiere**: `url` (endpoint HTTPS accesible públicamente), `events`.
- **Eventos válidos**: `invitee.created`, `invitee.canceled`, `invitee_no_show.created`, `invitee_no_show.deleted`, `routing_form_submission.created`, `meeting_guests_changed`.
- **⚠️ Importante**: La URL debe ser HTTPS y estar accesible públicamente. No usar localhost.

#### `urano_calendly_webhooks_delete`
Elimina un webhook existente.
- **⚠️ Importante**: Pide confirmación antes de eliminar.
- **Requiere**: `webhook_uri`.

---

## Reglas de Comportamiento

### Flujo de Consulta de Agenda (Mandatorio)
```
1. urano_calendly_events_listtoday  →  "¿Qué tengo hoy?"
2. urano_calendly_events_listthisweek  →  "¿Cómo va mi semana?"
3. urano_calendly_events_listupcoming (con rango)  →  consultas específicas de fecha
```

### Formato de Fechas
- Todas las fechas de la API son **ISO 8601 UTC** (ej. `2025-07-15T14:30:00Z`).
- Al presentar fechas al usuario, **conviértelas** a un formato legible tomando en cuenta la zona horaria del perfil (`timezone` de `getProfile`).
- Ejemplo: `2025-07-15T14:30:00Z` en zona `America/Mexico_City` → `15 de julio, 8:30 AM (hora Ciudad de México)`.

### Flujo para Generar un Link de Agendamiento
```
1. urano_calendly_eventtypes_list  →  Muestra los tipos disponibles al usuario
2. Usuario elige un tipo  →  Obtén el event_type_uri
3. urano_calendly_scheduling_generatelink  →  Genera y comparte el link
```

### Acciones Destructivas (Cancelar / Eliminar)
- **NUNCA** ejecutes `cancel` o `webhooks_delete` sin una confirmación explícita del usuario.
- Muestra siempre los detalles del elemento a eliminar antes de pedir confirmación.
- Ejemplo: *"¿Confirmas que deseas cancelar la reunión 'Demo con Juan' del martes 15 de julio a las 10:00 AM?"*

### Manejo de Errores
- Si la API retorna un error 401: el token ha expirado o es inválido → pide al usuario que lo regenere.
- Si la API retorna un error 403: el token no tiene permisos para la operación solicitada.
- Si la API retorna un error 404: el recurso no existe o fue eliminado.
- Si el token no está configurado: dirige al usuario al **MCP Manager → Calendly → Configuración → Personal Access Token**.

---

## Ejemplo de Conversación

**Usuario**: "¿Tengo alguna reunión esta semana?"

**Agente** (correctamente):
1. Ejecuta `urano_calendly_events_listthisweek`
2. Formatea los resultados con fechas locales
3. Responde: *"Tienes 3 reuniones esta semana: Demo con Ana (lunes 2 PM), Sync de equipo (miércoles 10 AM) y Revisión de Q3 (viernes 4 PM)."*

> [!IMPORTANT]
> Nunca inventes URIs de eventos o tipos. Siempre obtén los URIs reales usando las herramientas de listado antes de operar sobre un recurso específico.
