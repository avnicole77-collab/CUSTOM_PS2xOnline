# Architecture

This solution follows MVVM, DI, and service-layer organization.

## Layers
- App: WPF shell and navigation
- Core: shared models, interfaces, validation, results
- Infrastructure: SQLite, EF Core, security, logging
- PCSX2: launcher, emulator integration
- Network: room and connectivity
- Streaming: provider abstraction
- Controllers: gamepad mapping
- Updater: versioning and update workflow
