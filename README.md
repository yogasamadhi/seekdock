# SeekDock

SeekDock is an independent, open-source desktop host for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It is not
an official DeepSeek product and is not affiliated with DeepSeek.

The first implementation is intentionally thin: Electron supervises a pinned
DeepSeek Harness runtime and loads the UI served by `dsh web` on an OS-selected
loopback port. Agent state, tools, approvals, settings, credentials, sessions,
and the complete product UI remain owned by DeepSeek Harness.

## Architecture

```text
Electron Main
  |-- local startup and recovery shell (seekdock://shell)
  |-- DshRuntimeSupervisor
  |     `-- Electron embedded Node -> dsh web --host 127.0.0.1 --port 0
  `-- BrowserWindow -> http://127.0.0.1:<ephemeral-port>
                         |-- DeepSeek Harness Web UI
                         |-- /api
                         `-- WebSocket event streams
```

There is no preload bridge and no Electron IPC carrier. See
[`docs/architecture.md`](docs/architecture.md) for the security and ownership
boundaries.

## Requirements

- Git with submodule support
- Bun 1.3.14 or later
- pnpm 11.7.0 (only for the upstream DeepSeek Harness workspace)

## Development

```bash
bun install
bun run bootstrap
bun start
```

`bootstrap` initializes all three submodules, installs SeekDock, exports the
pinned DeepSeek Harness source to a disposable build directory, and prepares
the desktop runtime. The first run creates an isolated DSH home under
Electron's SeekDock user-data directory.

`bun start` runs [`run.ts`](run.ts): it verifies the pinned toolchain and
submodules, installs frozen dependencies, builds missing DSH development
artifacts, runs SeekDock checks, and starts Electron. Use
`bun start -- --skip-check` or `bun dev` for a faster restart during active
development.
The same launcher can be invoked directly with `bun run.ts`. Bun owns the root
install, scripts, development server, tests, and desktop build. DSH itself runs
under Electron's embedded Node via `ELECTRON_RUN_AS_NODE=1`; SeekDock neither
requires nor packages a separate Node distribution.

DeepSeek Harness remains a read-only upstream pnpm workspace. SeekDock exports
the pinned official commit with `git archive`, applies its version-locked Pi
compatibility overlay only to that temporary copy, then materializes a
production closure without workspace symlinks. Pi remains a read-only source
reference at `v0.84.2`; SeekDock does not build or modify that submodule. The
packaged runtime contains two SeekDock-owned Cordis modules, so users can choose
DeepSeek Harness or Pi without a fork, a separate repository, or a startup
download.

Useful commands:

```bash
bun run check
bun run test:e2e
bun run build
bun run runtime:prepare
bun run package:dir
bun run package:mac:arm64
bun run package:win:x64
```

`runtime:prepare` and `package:dir` are native builds. The initial matrix is
macOS arm64, macOS x64, and Windows x64; run each target on matching hardware.
The generated application is unsigned and is not a release artifact.

## Local security model

DSH binds only to `127.0.0.1`; SeekDock rejects non-loopback readiness URLs and
locks navigation to the exact runtime origin. The current DSH Web surface does
not authenticate other processes running as the same OS user. The v0 threat
model accepts that limitation explicitly. The random port is discovery data,
not an authentication credential.

## License

SeekDock is MIT licensed. Vendored and packaged upstream projects retain their
own notices; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
