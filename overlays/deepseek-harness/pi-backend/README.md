# Pi backend compatibility overlay

This directory is SeekDock's version-locked integration layer for the official
DeepSeek Harness commit recorded in `manifest.json`. It is not a fork and is
never applied to `vendor/deepseek-harness`.

`compatibility.patch` adds only the DSH extension surface required for an Agent
backend choice. `modules/` contains the two `@seekdock` Cordis packages loaded
by `apps/desktop/resources/seekdock.patch.yml`. Pi's npm runtime packages are
locked to 0.84.2 and travel inside the staged desktop runtime; no module is
downloaded at application startup.

The build exports the official submodule with `git archive`, applies this
overlay in `.runtime/build/<target>`, builds and deploys there, then deletes the
temporary source. Any base commit, patch, module, or runtime-package change must
update `manifest.json` and pass the overlay, DSH, E2E, and packaging tests.
