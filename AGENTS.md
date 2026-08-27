# SeekDock repository rules

Read `README.md` and `docs/architecture.md` before changing anything; they
define the ownership, process, and local security model.

## Source boundaries

- `vendor/deepseek-harness`, `vendor/opencode`, and `vendor/pi` are read-only
  Git submodules pinned to exact commits. Never edit, format, generate into, or
  commit changes inside them. Their checked-out HEAD must stay frozen; the
  launcher and all runtime scripts fail if it drifts.
- OpenCode is a source reference only and must never become a runtime or build
  dependency. Pi is a source reference for the Agent backend and is bundled as
  npm runtime packages, never built from the submodule.
- DeepSeek Harness owns Agent, Session, Tool, approval, persistence, and Web UI
  behavior. SeekDock owns only desktop lifecycle, packaging, and local runtime
  supervision. Do not introduce a second Agent state model, a second
  persistence path, an IPC carrier, or another network protocol without an ADR.

## Overlay and pins

- `overlays/deepseek-harness/pi-backend` is the sole exception to the read-only
  rule: its version-locked compatibility patch and its two `@seekdock` Cordis
  modules. They may be applied only to a disposable DSH copy under
  `.runtime/build/<platform-arch>`, never into the submodule.
- Version pins live in `scripts/constants.mjs` (Bun minimum, DSH/Pi/OpenCode
  commits, koffi, Pi version) and
  `overlays/deepseek-harness/pi-backend/manifest.json` (baseCommit,
  module/package versions, content digests). Update both together, plus the
  duplicated DSH commit constant in `run.ts`
  (it has historically drifted). Runtime scripts verify the manifest digest and
  package versions, so a pin edit without `bun run runtime:prepare` will make
  `ensure-dsh-runtime` rebuild from scratch.
- Desktop implementation uses imperative TypeScript. Do not add Effect.

## Runtime carrier

- The v0 carrier is the existing loopback DSH HTTP/WebSocket surface. Keep the
  DSH listener on `127.0.0.1` with an OS-selected port, reject non-loopback
  readiness URLs, and lock navigation to the exact runtime origin. Never expose
  it on LAN interfaces.
- DSH runs under Electron's embedded Node (`ELECTRON_RUN_AS_NODE=1`); SeekDock
  does not require or package a separate Node. `seekdock://shell` is used only
  for the local startup/failure states — the functional UI is DSH's.

## Build and workflow

- SeekDock's root workspace uses Bun for installs, scripts, development, tests,
  and builds. The DSH submodule retains its upstream pnpm workspace and
  lockfile; pnpm installs/builds run only in the disposable exported copy.
- `bun run check` (prettier → oxlint → tsc → vitest, in that order) before
  considering a change complete. Use `bun run test:e2e` and `bun run package:dir`
  for lifecycle or packaging changes.
- `bun run bootstrap` is the required setup: submodule init →
  `bun install --frozen-lockfile` → runtime prepare. `bun start` re-asserts pins
  and checks
  (`--skip-check` / `bun dev` skips only the check) and needs pnpm 11.7.0 on
  PATH (corepack).
- `ensure-dsh-runtime.mjs` is a slow native build: it git-archives the pinned
  DSH commit, applies the overlay into `.runtime/build`, runs pnpm
  install+build, then stages a symlink-free production closure under
  `.runtime/stage/<platform-arch>` and swaps it in only after validation. It
  runs automatically for desktop `predev`, `test:e2e`, and every `package:*`
  target — first run needs network and several minutes. `win32-x64` also
  applies the native picker compatibility patch (`scripts/patch-dsh-runtime.mjs`).
- Root `bun run test` is unit-only (vitest; `apps/*/src/**` and `scripts/**`).
  `bun run --filter @seekdock/desktop test:e2e` adds a vitest runtime
  integration test plus a serial (workers: 1) Playwright Electron spec.
- `.runtime/` and `apps/*/out|release*` are gitignored disposable artifacts.
  Packaged outputs are unsigned and are not release artifacts.
