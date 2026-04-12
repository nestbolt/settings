export type SettingType = "string" | "number" | "boolean" | "json";

export interface SettingDefinition {
  key: string;
  value: any;
  type?: SettingType;
  group?: string;
  description?: string;
}

export interface SettingsModuleOptions {
  /** Default settings to seed on module init. */
  defaults?: SettingDefinition[];
  /** Cache TTL in milliseconds. Default: 60000 (1 minute). Set to 0 to disable caching. */
  cacheTtl?: number;
  /** Whether to auto-seed defaults if keys don't exist. Default: true */
  autoSeed?: boolean;
}

export interface SettingsAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<SettingsModuleOptions> | SettingsModuleOptions;
}
