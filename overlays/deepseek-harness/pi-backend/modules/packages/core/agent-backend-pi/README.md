# @seekdock/dsh-agent-backend-pi

English | [中文](README.zh.md)

Pi's low-level reaction loop as an effect-scoped backend contribution to `ctx.agentLoop`. The package does not instantiate Pi's `Agent`, session manager, tools, credential loading, persistence, RPC server, or extension system.

## Composition

Mount this plugin after `@deepseek-ai/dsh-agent-loop`. It registers backend id `pi`; unload removes the contribution. New sessions select it through `CreateAgentOptions.agentBackend`, the `agent-loop.defaultBackend` setting, or a blank-session selection. DSH remains the default when no selection exists.

## Runtime ownership

One Pi loop invocation drives one DSH step. The backend rebuilds every model request from the DSH session log and sends it through the selected DSH LLM adapter. Pi receives placeholder tool implementations only to complete its internal turn; after Pi returns the complete assistant tool-call batch, DSH executes that batch through its ordinary validation, approval, sandbox, exclusivity, bounded-parallelism, cancellation, and result logging pipeline.

DSH owns the Agent lifecycle, inbox, steering, follow-up turns, cancellation, request recovery, session events, persistence, and Web protocol. Pi follow-up polling is disabled; a DSH follow-up remains a separate durable turn, while steering enters the next DSH step through the shared inbox.

## Failures

Provider failures enter `agent/request-error` with the serving adapter's retry policy. Cancellation records the interrupted DSH stream prefix when it contains model-visible content. A missing Pi registration or a persisted unknown backend rejects agent creation or resume before publication.

## Model Experience

### Pi-driven conversation requests

#### What the model sees

The same DSH-derived message history, rendered system prompt, and tool schemas as the built-in backend. Pi adds no model-visible prompt text and never exposes its placeholder tool results to the model.

#### Token effect

Conditional on selecting `pi`. Each DSH step makes one ordinary conversation-model request; Pi adds no auxiliary request or token-bearing wrapper.

#### KV Cache effect

The request prefix follows DSH session reconstruction. Switching backend is allowed only before the first turn, so a session never changes loop behavior after model history begins.

## Known Limitations and Deferred Work

- **Pi state is intentionally ephemeral** — the backend reconstructs each step from DSH history and does not expose Pi sessions, extensions, credential stores, or RPC features; consumers needing those systems must run Pi as a separate product rather than this backend.
- **Pi stream events are adapter-internal** — DSH `assistant/chunk` events remain the live UI and persistence stream; Pi receives the completed assistant message needed for orchestration, so Pi-specific partial-event consumers cannot attach to this package.
