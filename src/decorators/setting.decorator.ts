import { Inject } from "@nestjs/common";

/**
 * Parameter decorator to inject a setting value by key.
 *
 * The setting key must be registered in the `defaults` array of `SettingsModule.forRoot()`.
 * The module creates a dynamic provider for each default setting using a `SETTING_<key>` token.
 *
 * @example
 * ```typescript
 * @Injectable()
 * class MyService {
 *   constructor(@Setting('app.name') private appName: string) {}
 * }
 * ```
 */
export function Setting(key: string): ParameterDecorator {
  const token = `SETTING_${key}`;
  return Inject(token);
}
