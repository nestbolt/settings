<p align="center">
    <h1 align="center">@nestbolt/settings</h1>
    <p align="center">Database-backed key-value application settings for NestJS with TypeORM.</p>
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@nestbolt/settings"><img src="https://img.shields.io/npm/v/@nestbolt/settings.svg?style=flat-square" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/@nestbolt/settings"><img src="https://img.shields.io/npm/dt/@nestbolt/settings.svg?style=flat-square" alt="npm downloads"></a>
    <a href="https://github.com/nestbolt/settings/actions"><img src="https://img.shields.io/github/actions/workflow/status/nestbolt/settings/tests.yml?branch=main&style=flat-square&label=tests" alt="tests"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-brightgreen.svg?style=flat-square" alt="license"></a>
</p>

<hr>

This package provides a **database-backed settings store** for [NestJS](https://nestjs.com) that lets you manage application configuration at runtime with typed access, in-memory caching, and auto-seeding.

Once installed, using it is as simple as:

```typescript
const appName = await settingsService.get<string>('app.name', 'MyApp');
await settingsService.set('app.theme', 'dark');
```

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Module Configuration](#module-configuration)
  - [Static Configuration (forRoot)](#static-configuration-forroot)
  - [Async Configuration (forRootAsync)](#async-configuration-forrootasync)
- [Using the Service](#using-the-service)
- [Setting Types](#setting-types)
- [Setting Groups](#setting-groups)
- [Caching](#caching)
- [Auto-Seeding](#auto-seeding)
- [Events](#events)
- [Configuration Options](#configuration-options)
- [Testing](#testing)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [Security](#security)
- [Credits](#credits)
- [License](#license)

## Installation

Install the package via npm:

```bash
npm install @nestbolt/settings
```

Or via yarn:

```bash
yarn add @nestbolt/settings
```

Or via pnpm:

```bash
pnpm add @nestbolt/settings
```

### Peer Dependencies

This package requires the following peer dependencies, which you likely already have in a NestJS project:

```
@nestjs/common    ^10.0.0 || ^11.0.0
@nestjs/core      ^10.0.0 || ^11.0.0
@nestjs/typeorm   ^10.0.0 || ^11.0.0
typeorm           ^0.3.0
reflect-metadata  ^0.1.13 || ^0.2.0
```

Optional:

```
@nestjs/event-emitter  ^2.0.0 || ^3.0.0
```

## Quick Start

1. Register the module in your `AppModule`:

```typescript
import { SettingsModule } from '@nestbolt/settings';

@Module({
  imports: [
    TypeOrmModule.forRoot({ /* ... */ }),
    SettingsModule.forRoot({
      defaults: [
        { key: 'app.name', value: 'MyApp', type: 'string' },
        { key: 'app.perPage', value: 25, type: 'number' },
      ],
    }),
  ],
})
export class AppModule {}
```

2. Inject and use the service:

```typescript
import { SettingsService } from '@nestbolt/settings';

@Injectable()
export class AppService {
  constructor(private readonly settings: SettingsService) {}

  async getAppName(): Promise<string> {
    return this.settings.get<string>('app.name', 'Default');
  }

  async updateTheme(theme: string): Promise<void> {
    await this.settings.set('app.theme', theme, { group: 'appearance' });
  }
}
```

## Module Configuration

### Static Configuration (forRoot)

```typescript
SettingsModule.forRoot({
  cacheTtl: 60000,         // 1 minute cache (default)
  autoSeed: true,          // Auto-seed defaults (default: true)
  defaults: [
    { key: 'app.name', value: 'MyApp', type: 'string', group: 'app' },
    { key: 'app.debug', value: false, type: 'boolean', group: 'app' },
    { key: 'mail.from', value: 'noreply@example.com', type: 'string', group: 'mail' },
  ],
})
```

### Async Configuration (forRootAsync)

```typescript
SettingsModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    cacheTtl: config.get('SETTINGS_CACHE_TTL', 60000),
    defaults: [
      { key: 'app.name', value: config.get('APP_NAME'), type: 'string' },
    ],
  }),
})
```

The module is registered as **global** — `SettingsService` is available everywhere without re-importing.

## Using the Service

Inject `SettingsService` into any service or controller:

| Method | Returns | Description |
|--------|---------|-------------|
| `get<T>(key, default?)` | `Promise<T>` | Get a setting value, returns default if not found |
| `getOrFail<T>(key)` | `Promise<T>` | Get a setting value, throws `SettingNotFoundException` if not found |
| `set(key, value, options?)` | `Promise<SettingEntity>` | Create or update a setting |
| `has(key)` | `Promise<boolean>` | Check if a setting exists |
| `forget(key)` | `Promise<void>` | Delete a setting |
| `all()` | `Promise<Record<string, any>>` | Get all settings as a key-value map |
| `group(name)` | `Promise<Record<string, any>>` | Get all settings in a group |
| `flushCache()` | `void` | Clear the in-memory cache |

## Setting Types

Settings support four types with automatic casting:

| Type | Stored As | Cast To |
|------|-----------|---------|
| `string` | text | `string` |
| `number` | text | `Number()` |
| `boolean` | text | `true`/`"1"` = `true`, else `false` |
| `json` | text | `JSON.parse()` |

```typescript
await settings.set('app.port', 3000, { type: 'number' });
await settings.set('app.debug', true, { type: 'boolean' });
await settings.set('app.config', { theme: 'dark' }, { type: 'json' });
```

If no type is specified, it is inferred from the value.

## Setting Groups

Organize settings by group for easy retrieval:

```typescript
await settings.set('mail.host', 'smtp.example.com', { group: 'mail' });
await settings.set('mail.port', '587', { group: 'mail' });

const mailSettings = await settings.group('mail');
// { 'mail.host': 'smtp.example.com', 'mail.port': '587' }
```

## Caching

Settings are cached in memory with a configurable TTL (default: 60 seconds). Set `cacheTtl: 0` to disable caching.

The cache is automatically invalidated when you call `set()` or `forget()`. Use `flushCache()` to manually clear it.

## Auto-Seeding

When `autoSeed` is enabled (default), the module seeds any `defaults` that don't already exist in the database during initialization. Existing settings are never overwritten.

## Events

When `@nestjs/event-emitter` is installed, the following events are emitted:

| Event | Payload |
|-------|---------|
| `settings.created` | `{ key, value, type, group }` |
| `settings.updated` | `{ key, oldValue, newValue, type }` |
| `settings.deleted` | `{ key, lastValue }` |

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaults` | `SettingDefinition[]` | `undefined` | Default settings to seed on init |
| `cacheTtl` | `number` | `60000` | Cache TTL in ms (0 to disable) |
| `autoSeed` | `boolean` | `true` | Auto-seed defaults if keys don't exist |

## Testing

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Generate coverage report:

```bash
npm run test:cov
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information on what has changed recently.

## Contributing

Please see [CONTRIBUTING](CONTRIBUTING.md) for details.

## Security

If you discover any security-related issues, please report them via [GitHub Issues](https://github.com/nestbolt/settings/issues) with the **security** label instead of using the public issue tracker.

## Credits

- Inspired by [spatie/laravel-settings](https://github.com/spatie/laravel-settings)

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
