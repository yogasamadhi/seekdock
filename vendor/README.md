# Vendor source references

These directories are read-only Git submodules:

| Project | Commit | Role |
| --- | --- | --- |
| DeepSeek Harness | `465cf1d2fa446209c7e83eae343d0b9dda0a8576` (SeekDock Pi backend branch based on `v0.1.0-rc.8`) | Runtime, HTTP/WebSocket protocol, agent backends, and product UI; packaged by SeekDock. |
| OpenCode | `b155b15694dbcc6768f11d2f25cc2bdd1f738ab4` (`v1.18.19`) | Electron engineering reference only; never packaged. |
| Pi | `914cf1472e715297caa30db4b9535d534a9eb718` (`v0.84.2`) | Source/audit reference for the optional Pi agent backend; npm runtime packages are deployed through DSH. |

Initialize them with:

```bash
git submodule sync --recursive
git submodule update --init --recursive
```

Updates require an explicit review of runtime behavior, licenses, Electron
integration assumptions, and the real DSH integration tests.
