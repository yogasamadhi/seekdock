# Vendor source references

These directories are read-only Git submodules:

| Project | Commit | Role |
| --- | --- | --- |
| DeepSeek Harness | `141eb6fef83422698aef7a981029e843e8161534` (official upstream commit) | Read-only runtime source; exported to a disposable build copy and packaged by SeekDock. |
| OpenCode | `b155b15694dbcc6768f11d2f25cc2bdd1f738ab4` (`v1.18.19`) | Electron engineering reference only; never packaged. |
| Pi | `914cf1472e715297caa30db4b9535d534a9eb718` (`v0.84.2`) | Source/audit reference for the optional Pi agent backend; npm runtime packages are deployed through DSH. |

Initialize them with:

```bash
git submodule sync --recursive
git submodule update --init --recursive
```

Updates require an explicit review of runtime behavior, licenses, Electron
integration assumptions, and the real DSH integration tests.

SeekDock's Pi backend compatibility layer is stored outside the submodules at
`overlays/deepseek-harness/pi-backend`. It is applied only to a temporary
`git archive` export, so cloning on another computer needs no additional fork
or submodule.
