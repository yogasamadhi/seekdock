# Vendor source references

These directories are read-only Git submodules:

| Project | Commit | Role |
| --- | --- | --- |
| DeepSeek Harness | `141eb6fef83422698aef7a981029e843e8161534` (`v0.1.0-rc.8`) | Runtime, HTTP/WebSocket protocol, and product UI; packaged by SeekDock. |
| OpenCode | `b155b15694dbcc6768f11d2f25cc2bdd1f738ab4` (`v1.18.19`) | Electron engineering reference only; never packaged. |

Initialize them with:

```bash
git submodule sync --recursive
git submodule update --init --recursive
```

Updates require an explicit review of runtime behavior, licenses, Electron
integration assumptions, and the real DSH integration tests.
