# @seekdock/dsh-client-ui-agent-backend

English | [中文](README.zh.md)

Web surfaces for choosing and identifying the Agent loop backend registered by `ctx.agentLoop`. This package owns presentation and browser-side staging only; the Host owns validation, durability, and the first-turn lock.

## Surfaces

- The General settings row writes `agent-loop.defaultBackend`, which affects later Sessions without changing existing ones.
- The New Session hero picker calls `agentBackend.select` for the current blank Session. A pick made before a Session exists remains staged and is applied when the Host-created blank Session enters the client list.
- The Session header label renders `SessionSummary.agentBackend`, using roster metadata for the display name and durable id as the fallback.

All three surfaces read `agentBackend.list`, so contributed providers appear without a client package change. A rejected or raced selection restores the Host-reported backend and displays the business error. The picker disappears when the deployment reports no backends and becomes read-only when settings are not writable.

## Model Experience

None, as this package selects a Host loop implementation but never adds prompt text, schemas, messages, or model calls.

#### KV Cache effect

None directly. The Host permits a backend change only before the first turn, so this UI cannot alter a Session's request prefix after model history exists.

## Known Limitations and Deferred Work

- **Selection is blank-Session only** — there is no migration flow for a started Session; continue it under the backend recorded in its history or create a new Session.
- **Backend capabilities are descriptive only** — the roster exposes id, name, and description, not a feature-negotiation matrix. Shared DSH Agent, tool, approval, and persistence contracts remain the compatibility boundary.
