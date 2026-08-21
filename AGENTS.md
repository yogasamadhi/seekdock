# SeekDock repository rules

- `vendor/deepseek-harness` and `vendor/opencode` are read-only Git
  submodules. Never edit, format, generate into, or commit changes inside them.
- DeepSeek Harness owns Agent, Session, Tool, approval, persistence, and Web UI
  behavior. SeekDock owns only desktop lifecycle, packaging, and local runtime
  supervision.
- `overlays/deepseek-harness/pi-backend` is the sole exception: its
  version-locked compatibility patch may be applied only to a disposable DSH
  copy under `.runtime/build`. The two `@seekdock` Cordis modules live in the
  overlay; they must not introduce a second Agent state model or persistence
  path.
- OpenCode is a source reference only and must never become a runtime or build
  dependency.
- Desktop implementation uses imperative TypeScript. Do not add Effect.
- The v0 carrier is the existing loopback DSH HTTP/WebSocket surface. Do not add
  IPC, a second Agent state model, or another network protocol without an ADR.
- Keep the DSH listener on `127.0.0.1` with an OS-selected port. Never expose it
  on LAN interfaces.
- SeekDock's root workspace uses Bun for installs, scripts, development, tests,
  and builds. The read-only DeepSeek Harness submodule retains its upstream
  pnpm workspace and lockfile. DSH installs and builds run only in the
  disposable exported copy, never in the submodule.
- Run `bun run check` before considering a change complete. Run
  `bun run test:e2e` and `bun run package:dir` for lifecycle or packaging
  changes.
