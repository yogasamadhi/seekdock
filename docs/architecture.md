# SeekDock architecture

## Ownership

DeepSeek Harness is the single source of truth for Agent execution, Session
history, tools, approvals, persistence, settings, credentials, workspaces, and
the React UI. SeekDock owns the Electron process, window policy, runtime
lifecycle, logs, and native packaging. It does not project or persist Agent
state.

OpenCode is used only as an engineering reference for Electron lifecycle,
sidecar supervision, navigation hardening, and packaging. It is not linked or
executed by SeekDock.

## Process model

Electron starts a dedicated child through a small launcher module, using its
own executable with `ELECTRON_RUN_AS_NODE=1`. The launcher runs the built `dsh`
entry with the Web profile on `127.0.0.1` and port `0`.
`DshRuntimeSupervisor` waits for the canonical stdout readiness line,
validates its origin, probes the generated index page, and only then navigates
the BrowserWindow.

DSH receives an isolated `DSH_HOME` under Electron `userData` and uses the
user's home directory as its initial workspace root. It does not share state
with a separately installed `dsh` CLI.

Shutdown is explicit. Electron sends a control message to the Node launcher;
the launcher emits the SIGTERM event consumed by DSH's bounded plugin-tree
disposal. Electron waits five seconds before force termination.

## Web and navigation boundary

The packaged local shell is served from the privileged internal
`seekdock://shell` origin and is used only for starting, failure, and restart
states. The functional UI, API, and event streams are same-origin resources
served by DSH.

The BrowserWindow has context isolation, sandboxing, and no Node integration or
preload. Navigation is limited to the local shell and the exact DSH origin.
HTTPS links are opened by the operating system; all other external schemes,
other loopback ports, and popup windows are rejected.

## Accepted v0 limitation

The current DSH Web carrier provides loopback and DNS-rebinding fences but no
authentication against another process owned by the same OS user. SeekDock
does not represent the random port as a secret. Remote and LAN exposure remain
out of scope until an authenticated upstream transport exists.

## Distribution

SeekDock uses a Bun workspace while DeepSeek retains its upstream pnpm
workspace. Development and release staging build the pinned DeepSeek submodule
and materialize the production `@deepseek-ai/dsh` closure. Both modes run that
same symlink-free payload with Electron's embedded Node; no second Node runtime
is downloaded or packaged. OpenCode is never included in the application.
