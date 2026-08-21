# Third-party notices

SeekDock itself is distributed under the MIT License in [`LICENSE`](LICENSE).

## DeepSeek Harness

- Source: <https://github.com/deepseek-ai/deepseek-harness>
- Pinned commit: `141eb6fef83422698aef7a981029e843e8161534`
- License: MIT, retained in `vendor/deepseek-harness/LICENSE`

DeepSeek Harness and its production dependency closure are included in packaged
SeekDock builds. Its generated third-party notice is copied into the packaged
runtime during staging.

## Pi

- Source: <https://github.com/earendil-works/pi>
- Pinned source-reference commit: `914cf1472e715297caa30db4b9535d534a9eb718` (`v0.84.2`)
- License: MIT, retained in `vendor/pi/LICENSE`

The Pi submodule is a read-only source reference and is not copied wholesale
into packaged builds. The Pi adapter included in the DeepSeek Harness runtime
is covered by the Harness production dependency notices.

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
