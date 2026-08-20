# Third-party notices

SeekDock itself is distributed under the MIT License in [`LICENSE`](LICENSE).

## DeepSeek Harness

- Source: <https://github.com/deepseek-ai/deepseek-harness>
- Pinned commit: `465cf1d2fa446209c7e83eae343d0b9dda0a8576`
- License: MIT, retained in `vendor/deepseek-harness/LICENSE`

DeepSeek Harness and its production dependency closure are included in packaged
SeekDock builds. Its generated third-party notice is copied into the packaged
runtime during staging.

## Pi

- Source: <https://github.com/earendil-works/pi>
- Pinned commit: `914cf1472e715297caa30db4b9535d534a9eb718` (`v0.84.2`)
- License: MIT, retained in `vendor/pi/LICENSE`

The Pi submodule is a read-only source and audit reference and is not copied
wholesale into packaged builds. DeepSeek Harness deploys the exact
`@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` 0.84.2 production
packages required by its optional Pi agent backend; the Pi license is copied
into the packaged runtime during staging.

## OpenCode

- Source: <https://github.com/anomalyco/opencode>
- Pinned commit: `b155b15694dbcc6768f11d2f25cc2bdd1f738ab4`
- License: MIT, retained in `vendor/opencode/LICENSE`

OpenCode is a source reference and is not included in packaged SeekDock builds.

## Electron

- Source: <https://github.com/electron/electron>
- Version: 42.3.3
- License: MIT and bundled Chromium/Node.js third-party licenses retained in
  Electron distributions

Electron supplies the application shell and the embedded Node runtime used to
execute DeepSeek Harness. SeekDock does not download or package a separate
Node.js distribution.
