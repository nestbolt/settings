import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsModule } from "../src/settings.module";
import { SettingsService } from "../src/settings.service";
import { SettingEntity } from "../src/entities/setting.entity";
import { SETTINGS_OPTIONS } from "../src/settings.constants";

describe("SettingsModule", () => {
  describe("forRoot()", () => {
    let module: TestingModule;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({
            type: "better-sqlite3",
            database: ":memory:",
            entities: [SettingEntity],
            synchronize: true,
          }),
          SettingsModule.forRoot(),
        ],
      }).compile();

      await module.init();
    });

    afterEach(async () => {
      await module?.close();
    });

    it("should provide SettingsService", () => {
      const service = module.get<SettingsService>(SettingsService);
      expect(service).toBeDefined();
    });

    it("should export SETTINGS_OPTIONS", () => {
      const options = module.get(SETTINGS_OPTIONS);
      expect(options).toEqual({});
    });
  });

  describe("forRoot() with options", () => {
    let module: TestingModule;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({
            type: "better-sqlite3",
            database: ":memory:",
            entities: [SettingEntity],
            synchronize: true,
          }),
          SettingsModule.forRoot({
            cacheTtl: 30000,
            defaults: [{ key: "app.name", value: "MyApp", type: "string" }],
          }),
        ],
      }).compile();

      await module.init();
    });

    afterEach(async () => {
      await module?.close();
    });

    it("should store options correctly", () => {
      const service = module.get<SettingsService>(SettingsService);
      const options = service.getOptions();
      expect(options.cacheTtl).toBe(30000);
      expect(options.defaults).toHaveLength(1);
    });

    it("should seed defaults on init", async () => {
      const service = module.get<SettingsService>(SettingsService);
      const value = await service.get("app.name");
      expect(value).toBe("MyApp");
    });
  });

  describe("forRootAsync()", () => {
    let module: TestingModule;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({
            type: "better-sqlite3",
            database: ":memory:",
            entities: [SettingEntity],
            synchronize: true,
          }),
          SettingsModule.forRootAsync({
            useFactory: () => ({
              cacheTtl: 5000,
            }),
          }),
        ],
      }).compile();

      await module.init();
    });

    afterEach(async () => {
      await module?.close();
    });

    it("should provide SettingsService", () => {
      const service = module.get<SettingsService>(SettingsService);
      expect(service).toBeDefined();
    });

    it("should resolve options from factory", () => {
      const service = module.get<SettingsService>(SettingsService);
      const options = service.getOptions();
      expect(options.cacheTtl).toBe(5000);
    });
  });

  describe("forRootAsync() with inject", () => {
    let module: TestingModule;
    const CONFIG_TOKEN = "CONFIG_TOKEN";

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({
            type: "better-sqlite3",
            database: ":memory:",
            entities: [SettingEntity],
            synchronize: true,
          }),
          {
            module: class ConfigModule {},
            providers: [{ provide: CONFIG_TOKEN, useValue: { ttl: 10000 } }],
            exports: [CONFIG_TOKEN],
            global: true,
          },
          SettingsModule.forRootAsync({
            inject: [CONFIG_TOKEN],
            useFactory: (config: any) => ({
              cacheTtl: config.ttl,
            }),
          }),
        ],
      }).compile();

      await module.init();
    });

    afterEach(async () => {
      await module?.close();
    });

    it("should support inject option", () => {
      const service = module.get<SettingsService>(SettingsService);
      const options = service.getOptions();
      expect(options.cacheTtl).toBe(10000);
    });
  });
});
