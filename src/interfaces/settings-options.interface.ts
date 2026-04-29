import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from "@nestjs/common";

export type SettingType = "string" | "number" | "boolean" | "json";

export interface SettingDefinition {
  key: string;
  value: unknown;
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
  /** Whether to register the module globally. Default: true */
  global?: boolean;
}

export interface SettingsAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  useFactory: (
    ...args: unknown[]
  ) => Promise<SettingsModuleOptions> | SettingsModuleOptions;
  /** Whether to register the module globally. Default: true */
  global?: boolean;
}
