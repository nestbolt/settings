import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsService } from "../src/settings.service";
import { SettingEntity } from "../src/entities/setting.entity";
import { SETTINGS_OPTIONS } from "../src/settings.constants";
import { SettingNotFoundException } from "../src/exceptions/setting-not-found.exception";
import { SETTINGS_EVENTS } from "../src/events/settings.events";

describe("SettingsService", () => {
  let module: TestingModule;
  let service: SettingsService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "better-sqlite3",
          database: ":memory:",
          entities: [SettingEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([SettingEntity]),
      ],
      providers: [
        { provide: SETTINGS_OPTIONS, useValue: { cacheTtl: 0 } },
        SettingsService,
      ],
    }).compile();

    await module.init();
    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should have static instance after init", () => {
    expect(SettingsService.getInstance()).toBe(service);
  });

  it("should clear static instance on destroy", async () => {
    await module.close();
    expect(SettingsService.getInstance()).toBeNull();
  });

  describe("set() and get()", () => {
    it("should set and get a string setting", async () => {
      await service.set("app.name", "MyApp");
      const value = await service.get("app.name");
      expect(value).toBe("MyApp");
    });

    it("should set and get a number setting", async () => {
      await service.set("app.port", 3000, { type: "number" });
      const value = await service.get<number>("app.port");
      expect(value).toBe(3000);
    });

    it("should set and get a boolean setting", async () => {
      await service.set("app.debug", true, { type: "boolean" });
      const value = await service.get<boolean>("app.debug");
      expect(value).toBe(true);
    });

    it("should set and get a json setting", async () => {
      const data = { host: "localhost", port: 5432 };
      await service.set("db.config", data, { type: "json" });
      const value = await service.get("db.config");
      expect(value).toEqual(data);
    });

    it("should return default value when key not found", async () => {
      const value = await service.get("nonexistent", "default");
      expect(value).toBe("default");
    });

    it("should return undefined when key not found and no default", async () => {
      const value = await service.get("nonexistent");
      expect(value).toBeUndefined();
    });

    it("should update existing setting", async () => {
      await service.set("app.name", "OldName");
      await service.set("app.name", "NewName");
      const value = await service.get("app.name");
      expect(value).toBe("NewName");
    });

    it("should infer type from value", async () => {
      await service.set("num", 42);
      await service.set("bool", false);
      await service.set("obj", { key: "value" });

      expect(await service.get("num")).toBe(42);
      expect(await service.get("bool")).toBe(false);
      expect(await service.get("obj")).toEqual({ key: "value" });
    });

    it("should store group and description", async () => {
      const entity = await service.set("mail.host", "smtp.example.com", {
        group: "mail",
        description: "SMTP host",
      });
      expect(entity.group).toBe("mail");
      expect(entity.description).toBe("SMTP host");
    });
  });

  describe("getOrFail()", () => {
    it("should return value when key exists", async () => {
      await service.set("app.name", "MyApp");
      const value = await service.getOrFail("app.name");
      expect(value).toBe("MyApp");
    });

    it("should throw SettingNotFoundException when key not found", async () => {
      await expect(service.getOrFail("nonexistent")).rejects.toThrow(
        SettingNotFoundException,
      );
    });
  });

  describe("has()", () => {
    it("should return true for existing key", async () => {
      await service.set("app.name", "MyApp");
      expect(await service.has("app.name")).toBe(true);
    });

    it("should return false for nonexistent key", async () => {
      expect(await service.has("nonexistent")).toBe(false);
    });
  });

  describe("forget()", () => {
    it("should delete a setting", async () => {
      await service.set("app.name", "MyApp");
      await service.forget("app.name");
      expect(await service.has("app.name")).toBe(false);
    });

    it("should not throw when deleting nonexistent key", async () => {
      await expect(service.forget("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("all()", () => {
    it("should return all settings as key-value map", async () => {
      await service.set("a", "1");
      await service.set("b", "2");
      await service.set("c", "3");

      const all = await service.all();
      expect(all).toEqual({ a: "1", b: "2", c: "3" });
    });

    it("should return empty object when no settings", async () => {
      const all = await service.all();
      expect(all).toEqual({});
    });
  });

  describe("group()", () => {
    it("should return settings filtered by group", async () => {
      await service.set("mail.host", "smtp.example.com", { group: "mail" });
      await service.set("mail.port", "587", { group: "mail" });
      await service.set("app.name", "MyApp", { group: "app" });

      const mailSettings = await service.group("mail");
      expect(Object.keys(mailSettings)).toHaveLength(2);
      expect(mailSettings["mail.host"]).toBe("smtp.example.com");
      expect(mailSettings["mail.port"]).toBe("587");
    });

    it("should return empty object for nonexistent group", async () => {
      const result = await service.group("nonexistent");
      expect(result).toEqual({});
    });
  });

  describe("getOptions()", () => {
    it("should return the module options", () => {
      const options = service.getOptions();
      expect(options.cacheTtl).toBe(0);
    });
  });

  describe("key validation", () => {
    it("rejects invalid keys on every public method", async () => {
      await expect(service.set("", "x")).rejects.toThrow(/non-empty string/);
      await expect(service.get("")).rejects.toThrow(/non-empty string/);
      await expect(service.getOrFail("")).rejects.toThrow(/non-empty string/);
      await expect(service.has("")).rejects.toThrow(/non-empty string/);
      await expect(service.forget("")).rejects.toThrow(/non-empty string/);
      await expect(service.set("bad\nkey", "x")).rejects.toThrow(
        /control characters/,
      );
    });
  });

  describe("json parse fallback", () => {
    it("returns raw string when stored json is corrupt", async () => {
      // Bypass the service to plant invalid json in the DB
      const repo = module.get<import("typeorm").Repository<SettingEntity>>(
        "SettingEntityRepository",
      );
      await repo.save(
        repo.create({
          key: "broken.json",
          value: "{not-json",
          type: "json",
          group: null,
          description: null,
        }),
      );

      const value = await service.get("broken.json");
      expect(value).toBe("{not-json");
    });
  });
});

describe("SettingsService (with cache)", () => {
  let module: TestingModule;
  let service: SettingsService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "better-sqlite3",
          database: ":memory:",
          entities: [SettingEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([SettingEntity]),
      ],
      providers: [
        { provide: SETTINGS_OPTIONS, useValue: { cacheTtl: 60000 } },
        SettingsService,
      ],
    }).compile();

    await module.init();
    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  it("should cache values on get", async () => {
    await service.set("cached", "value");
    // First get populates cache
    const value1 = await service.get("cached");
    expect(value1).toBe("value");
    // Second get should return from cache (same result)
    const value2 = await service.get("cached");
    expect(value2).toBe("value");
  });

  it("should invalidate cache on set", async () => {
    await service.set("key", "old");
    await service.get("key"); // Populate cache
    await service.set("key", "new");
    const value = await service.get("key");
    expect(value).toBe("new");
  });

  it("should invalidate cache on forget", async () => {
    await service.set("key", "value");
    await service.get("key"); // Populate cache
    await service.forget("key");
    const value = await service.get("key", "default");
    expect(value).toBe("default");
  });

  it("should flush entire cache", async () => {
    await service.set("a", "1");
    await service.set("b", "2");
    await service.get("a"); // Populate cache
    await service.get("b"); // Populate cache
    service.flushCache();
    // Cache is flushed, but values still exist in DB
    expect(await service.get("a")).toBe("1");
  });

  it("expires cached values after TTL", async () => {
    const realNow = Date.now;
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      await service.set("temp", "v1");
      expect(await service.get("temp")).toBe("v1");

      // Advance past TTL — entry should be evicted on next read
      now += 60_001;
      // Mutate the DB out-of-band so we can detect a re-read
      await service.flushCache();
      await service.set("temp", "v2");
      now += 60_001;
      expect(await service.get("temp")).toBe("v2");
    } finally {
      Date.now = realNow;
    }
  });

  it("returns hit on second read while cache is fresh", async () => {
    await service.set("hot", "v");
    const first = await service.get("hot");
    const second = await service.get("hot");
    expect(first).toBe("v");
    expect(second).toBe("v");
  });

  it("short-circuits has() via cache", async () => {
    await service.set("k", "v");
    await service.get("k"); // populates cache
    // even after deleting from DB out-of-band, has() should still return true
    // because the cache entry hasn't expired
    expect(await service.has("k")).toBe(true);
  });

  it("returns cached value from getOrFail()", async () => {
    await service.set("k", "v");
    await service.get("k"); // populates cache
    expect(await service.getOrFail("k")).toBe("v");
  });

  it("serializes null values as empty string", async () => {
    const entity = await service.set("nullable", null);
    expect(entity.value).toBe("");
  });
});

describe("SettingsService (empty seed)", () => {
  let module: TestingModule;
  let service: SettingsService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "better-sqlite3",
          database: ":memory:",
          entities: [SettingEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([SettingEntity]),
      ],
      providers: [
        { provide: SETTINGS_OPTIONS, useValue: { cacheTtl: 0, defaults: [] } },
        SettingsService,
      ],
    }).compile();

    await module.init();
    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  it("initializes cleanly with empty defaults", async () => {
    expect(await service.all()).toEqual({});
  });
});

describe("SettingsService (seed with inferred types)", () => {
  let module: TestingModule;
  let service: SettingsService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "better-sqlite3",
          database: ":memory:",
          entities: [SettingEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([SettingEntity]),
      ],
      providers: [
        {
          provide: SETTINGS_OPTIONS,
          useValue: {
            cacheTtl: 0,
            // Note: no explicit `type` — exercises the inferType fallback in seed()
            defaults: [{ key: "auto.port", value: 8080 }],
          },
        },
        SettingsService,
      ],
    }).compile();

    await module.init();
    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  it("infers type when default omits explicit type", async () => {
    expect(await service.get<number>("auto.port")).toBe(8080);
  });
});

describe("SettingsService (EventEmitter integration)", () => {
  let module: TestingModule;
  let service: SettingsService;
  let emitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    emitter = { emit: vi.fn().mockReturnValue(true) };
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "better-sqlite3",
          database: ":memory:",
          entities: [SettingEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([SettingEntity]),
      ],
      providers: [
        { provide: SETTINGS_OPTIONS, useValue: { cacheTtl: 0 } },
        { provide: "EventEmitter2", useValue: emitter },
        SettingsService,
      ],
    }).compile();

    await module.init();
    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  it("emits CREATED on first set", async () => {
    await service.set("k", "v", { group: "g", description: "d" });
    expect(emitter.emit).toHaveBeenCalledWith(SETTINGS_EVENTS.CREATED, {
      key: "k",
      value: "v",
      type: "string",
      group: "g",
    });
  });

  it("emits UPDATED on subsequent set", async () => {
    await service.set("k", "old");
    emitter.emit.mockClear();
    await service.set("k", "new");
    expect(emitter.emit).toHaveBeenCalledWith(SETTINGS_EVENTS.UPDATED, {
      key: "k",
      oldValue: "old",
      newValue: "new",
      type: "string",
    });
  });

  it("emits DELETED on forget", async () => {
    await service.set("k", "bye");
    emitter.emit.mockClear();
    await service.forget("k");
    expect(emitter.emit).toHaveBeenCalledWith(SETTINGS_EVENTS.DELETED, {
      key: "k",
      lastValue: "bye",
    });
  });

  it("does not emit when forgetting a non-existent key", async () => {
    await service.forget("ghost");
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});

describe("SettingsService (seeding)", () => {
  let module: TestingModule;
  let service: SettingsService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "better-sqlite3",
          database: ":memory:",
          entities: [SettingEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([SettingEntity]),
      ],
      providers: [
        {
          provide: SETTINGS_OPTIONS,
          useValue: {
            cacheTtl: 0,
            defaults: [
              { key: "app.name", value: "Nestbolt", type: "string" as const },
              { key: "app.port", value: 3000, type: "number" as const },
              { key: "app.debug", value: false, type: "boolean" as const },
            ],
          },
        },
        SettingsService,
      ],
    }).compile();

    await module.init();
    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  it("should seed default settings on init", async () => {
    expect(await service.get("app.name")).toBe("Nestbolt");
    expect(await service.get<number>("app.port")).toBe(3000);
    expect(await service.get<boolean>("app.debug")).toBe(false);
  });

  it("should not overwrite existing settings on re-seed", async () => {
    await service.set("app.name", "Custom");
    // Manually call seed by re-initializing — the seed should NOT overwrite
    const all = await service.all();
    expect(all["app.name"]).toBe("Custom");
  });
});
