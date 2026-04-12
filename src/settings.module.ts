import { DynamicModule, Module, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingEntity } from "./entities/setting.entity";
import { SETTINGS_OPTIONS } from "./settings.constants";
import { SettingsService } from "./settings.service";
import type {
  SettingsModuleOptions,
  SettingsAsyncOptions,
} from "./interfaces/settings-options.interface";

@Module({})
export class SettingsModule {
  static forRoot(options: SettingsModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      { provide: SETTINGS_OPTIONS, useValue: options },
      SettingsService,
      ...this.createSettingProviders(options),
    ];

    return {
      module: SettingsModule,
      global: true,
      imports: [TypeOrmModule.forFeature([SettingEntity])],
      providers,
      exports: [SettingsService, SETTINGS_OPTIONS],
    };
  }

  static forRootAsync(asyncOptions: SettingsAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: SETTINGS_OPTIONS,
        useFactory: asyncOptions.useFactory,
        inject: asyncOptions.inject ?? [],
      },
      SettingsService,
    ];

    return {
      module: SettingsModule,
      global: true,
      imports: [...(asyncOptions.imports ?? []), TypeOrmModule.forFeature([SettingEntity])],
      providers,
      exports: [SettingsService, SETTINGS_OPTIONS],
    };
  }

  private static createSettingProviders(options: SettingsModuleOptions): Provider[] {
    if (!options.defaults) return [];

    return options.defaults.map((def) => ({
      provide: `SETTING_${def.key}`,
      useFactory: async (service: SettingsService) => {
        return service.get(def.key, def.value);
      },
      inject: [SettingsService],
    }));
  }
}
