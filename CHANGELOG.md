# Changelog

All notable changes to `@nestbolt/settings` will be documented in this file.

## v0.1.0 — Initial Release

### Features

- **Database-backed settings** — Key-value settings stored in a dedicated `settings` table with TypeORM
- **Typed access** — Automatic type casting for string, number, boolean, and JSON values
- **In-memory cache** — Configurable TTL-based cache for high-performance reads
- **Setting groups** — Organize settings by group and query by group name
- **Auto-seeding** — Seed default settings on module initialization
- **Query API** — `get()`, `getOrFail()`, `set()`, `has()`, `forget()`, `all()`, `group()` methods
- **Events** — Emits `settings.created`, `settings.updated`, `settings.deleted` events via optional `@nestjs/event-emitter`
- **Module configuration** — `forRoot()` and `forRootAsync()` with cache TTL, defaults, and auto-seed options
