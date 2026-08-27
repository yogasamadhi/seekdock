# SeekDock repository rules

Read `README.md` and `docs/architecture.md` before changing anything; they
define the ownership, process, and local security model.

## Ownership

- `vendor/deepseek-harness`, `vendor/pi`, and `vendor/opencode` are read-only
  Git submodules pinned to exact commits in `scripts/constants.mjs`. Never
  edit, format, generate into, or commit changes inside them. Their checked-out
  HEAD must stay frozen; the launcher and runtime scripts abort if a submodule
  commit drifts or contains modifications.
- OpenCode is a source reference only and must never become a runtime or build
  dependency. Pi is a source reference for the Agent backend and is bundled as
  npm runtime packages, never built from the submodule.
- DeepSeek Harness owns Agent, Session, Tool, approval, persistence, and Web UI
  behavior. SeekDock owns only desktop lifecycle, packaging, and local runtime
  supervision. Do not introduce a second Agent state model, a second
  persistence path, an IPC carrier, or another network protocol without an ADR.
- Desktop implementation uses imperative TypeScript. Do not add Effect.

## Overlay and pins

- `overlays/deepseek-harness/pi-backend` is the sole exception to the read-only
  rule: its version-locked compatibility patch and two `@seekdock` Cordis
  modules may be applied only to a disposable DSH copy under
  `.runtime/build/<target>`, never into the submodule. They must not introduce a
  second Agent state model or persistence path.
- Version pins live in `scripts/constants.mjs` (Bun minimum, DSH/Pi/OpenCode
  commits, koffi, and Pi version) and
  `overlays/deepseek-harness/pi-backend/manifest.json` (base commit,
  module/package versions, and content digests). Update both together, plus the
  duplicated DSH commit constant in `run.ts`. `ensure-dsh-runtime` compares the
  overlay digest and runtime package versions and rebuilds the staged runtime
  on mismatch.

## Runtime carrier

- The v0 carrier is the existing loopback DSH HTTP/WebSocket surface. Keep the
  DSH listener on `127.0.0.1` with an OS-selected port, reject non-loopback
  readiness URLs, and lock navigation to the exact runtime origin. Never expose
  it on LAN interfaces.
- DSH runs under Electron's embedded Node (`ELECTRON_RUN_AS_NODE=1`); SeekDock
  does not require or package a separate Node. `seekdock://shell` is used only
  for local startup and failure states—the functional UI is DSH's.

## Toolchain

- SeekDock's root workspace uses Bun for installs, scripts, development, tests,
  and builds (`bun install --frozen-lockfile`). DeepSeek Harness keeps its
  upstream pnpm workspace and lockfile; pnpm 11.7.0 is asserted exactly
  (`corepack enable` if missing). DSH installs and builds run only in the
  disposable exported copy, never in the submodule.
- Fresh clones must run `bun run bootstrap` first: it initializes the
  submodules (a bare `bun install` or `bun start` fails on empty `vendor/`),
  installs frozen dependencies, and prepares the runtime.
- `bun start` (or `bun run.ts`) verifies toolchain and vendor pins, installs,
  prepares the DSH runtime, runs checks, and launches Electron. Use `bun dev` or
  `bun start -- --skip-check` for faster restarts; `--skip-check` is the only
  accepted flag.
- `ensure-dsh-runtime.mjs` exports the pinned DSH commit, applies the overlay
  under `.runtime/build/<target>`, installs and builds it, then stages a
  symlink-free production closure under `.runtime/stage/<target>`. It runs
  automatically for desktop `predev`, `test:e2e`, and every `package:*` target.
  The `win32-x64` target also applies the native picker compatibility patch.
- `.runtime/` is disposable, gitignored build state; regenerate it with
  `bun run runtime:prepare` or let `ensure-dsh-runtime` do so on demand. Runtime
  and packaging targets are darwin-arm64, darwin-x64, and win32-x64 only; run
  each target on matching host hardware.

## Verification

- Run `bun run check` before considering a change complete: Prettier
  `format:check`, oxlint `--deny-warnings`, TypeScript typechecking (the root
  config covers `run.ts` and `scripts/**/*.ts`; the desktop app is checked via
  the workspace filter), and then Vitest unit tests.
- Unit tests: `bun x vitest run` (the config includes
  `apps/*/src/**/*.test.ts` and `scripts/**/*.test.ts`); run a single test with
  `bun x vitest run <path-to-test>`.
- For lifecycle or packaging changes, run `bun run test:e2e` (it builds the app,
  needs the staged DSH runtime, and uses slow 90–120 second timeouts) and
  `bun run package:dir`.
- `.runtime/` and `apps/*/out|release*` are gitignored disposable artifacts.
  Packaged outputs are unsigned and are not release artifacts.
