import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { SettingEntity } from "./entities/setting.entity";
import { SETTINGS_OPTIONS } from "./settings.constants";
import { SETTINGS_EVENTS } from "./events/settings.events";
import { SettingNotFoundException } from "./exceptions/setting-not-found.exception";
import { assertValidKey } from "./utils";
import type {
  SettingsModuleOptions,
  SettingDefinition,
  SettingType,
} from "./interfaces";

interface EventEmitterLike {
  emit(event: string, ...args: unknown[]): boolean;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

@Injectable()
export class SettingsService implements OnModuleInit, OnModuleDestroy {
  private static instance: SettingsService | null = null;
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtl: number;

  constructor(
    @Inject(SETTINGS_OPTIONS) private readonly options: SettingsModuleOptions,
    @InjectRepository(SettingEntity)
    private readonly settingRepo: Repository<SettingEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional()
    @Inject("EventEmitter2")
    private readonly eventEmitter?: EventEmitterLike,
  ) {
    this.cacheTtl = options.cacheTtl ?? 60000;
  }

  async onModuleInit(): Promise<void> {
    SettingsService.instance = this;
    if (this.options.autoSeed !== false && this.options.defaults) {
      await this.seed(this.options.defaults);
    }
    this.logger.log("SettingsService initialized");
  }

  onModuleDestroy(): void {
    if (SettingsService.instance === this) {
      SettingsService.instance = null;
    }
  }

  static getInstance(): SettingsService | null {
    return SettingsService.instance;
  }

  // --- Options ---

  getOptions(): SettingsModuleOptions {
    return this.options;
  }

  // --- Read ---

  async get<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    assertValidKey(key);
    const cached = this.getCached(key);
    if (cached !== undefined) return cached as T;

    const setting = await this.settingRepo.findOne({ where: { key } });
    if (!setting) {
      if (defaultValue !== undefined) return defaultValue;
      return undefined as T;
    }

    const value = this.castValue(setting.value, setting.type as SettingType);
    this.setCache(key, value);
    return value as T;
  }

  async getOrFail<T = unknown>(key: string): Promise<T> {
    assertValidKey(key);
    const cached = this.getCached(key);
    if (cached !== undefined) return cached as T;

    const setting = await this.settingRepo.findOne({ where: { key } });
    if (!setting) {
      throw new SettingNotFoundException(key);
    }

    const value = this.castValue(setting.value, setting.type as SettingType);
    this.setCache(key, value);
    return value as T;
  }

  // --- Write ---

  async set(
    key: string,
    value: unknown,
    options?: { type?: SettingType; group?: string; description?: string },
  ): Promise<SettingEntity> {
    assertValidKey(key);
    const serialized = this.serializeValue(value);
    const type = options?.type ?? this.inferType(value);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SettingEntity);
      const existing = await repo.findOne({ where: { key } });
      const oldValue = existing
        ? this.castValue(existing.value, existing.type as SettingType)
        : undefined;

      const partial: Partial<SettingEntity> = {
        key,
        value: serialized,
        type,
      };
      if (options?.group !== undefined) partial.group = options.group;
      else if (!existing) partial.group = null;
      if (options?.description !== undefined)
        partial.description = options.description;
      else if (!existing) partial.description = null;

      await repo.upsert(partial as SettingEntity, ["key"]);
      const saved = await repo.findOneOrFail({ where: { key } });

      this.setCache(key, value);
      if (existing) {
        this.emit(SETTINGS_EVENTS.UPDATED, {
          key,
          oldValue,
          newValue: value,
          type,
        });
      } else {
        this.emit(SETTINGS_EVENTS.CREATED, {
          key,
          value,
          type,
          group: saved.group,
        });
      }
      return saved;
    });
  }

  // --- Check ---

  async has(key: string): Promise<boolean> {
    assertValidKey(key);
    const cached = this.getCached(key);
    if (cached !== undefined) return true;

    const count = await this.settingRepo.count({ where: { key } });
    return count > 0;
  }

  // --- Delete ---

  async forget(key: string): Promise<void> {
    assertValidKey(key);
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const repo = manager.getRepository(SettingEntity);
      const setting = await repo.findOne({ where: { key } });
      if (!setting) return;

      const lastValue = this.castValue(
        setting.value,
        setting.type as SettingType,
      );
      await repo.remove(setting);
      this.invalidateCache(key);
      this.emit(SETTINGS_EVENTS.DELETED, { key, lastValue });
    });
  }

  // --- Bulk ---

  async all(): Promise<Record<string, unknown>> {
    const settings = await this.settingRepo.find();
    const result: Record<string, unknown> = {};
    for (const setting of settings) {
      result[setting.key] = this.castValue(
        setting.value,
        setting.type as SettingType,
      );
    }
    return result;
  }

  async group(name: string): Promise<Record<string, unknown>> {
    const settings = await this.settingRepo.find({ where: { group: name } });
    const result: Record<string, unknown> = {};
    for (const setting of settings) {
      result[setting.key] = this.castValue(
        setting.value,
        setting.type as SettingType,
      );
    }
    return result;
  }

  // --- Cache ---

  flushCache(): void {
    this.cache.clear();
  }

  // --- Private ---

  private async seed(defaults: SettingDefinition[]): Promise<void> {
    if (defaults.length === 0) return;

    for (const def of defaults) {
      assertValidKey(def.key);
    }

    const rows = defaults.map((def) => ({
      key: def.key,
      value: this.serializeValue(def.value),
      type: def.type ?? this.inferType(def.value),
      group: def.group ?? null,
      description: def.description ?? null,
    }));

    await this.settingRepo
      .createQueryBuilder()
      .insert()
      .into(SettingEntity)
      .values(rows)
      .orIgnore()
      .execute();
  }

  private castValue(raw: string, type: SettingType): unknown {
    switch (type) {
      case "number":
        return Number(raw);
      case "boolean":
        return raw === "true" || raw === "1";
      case "json":
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      case "string":
      default:
        return raw;
    }
  }

  private serializeValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  private inferType(value: unknown): SettingType {
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "object" && value !== null) return "json";
    return "string";
  }

  private getCached(key: string): unknown {
    if (this.cacheTtl <= 0) return undefined;

    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  private setCache(key: string, value: unknown): void {
    if (this.cacheTtl <= 0) return;
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtl });
  }

  private invalidateCache(key: string): void {
    this.cache.delete(key);
  }

  private emit(event: string, payload: unknown): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event, payload);
    }
  }
}
