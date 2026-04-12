import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SettingEntity } from "./entities/setting.entity";
import { SETTINGS_OPTIONS } from "./settings.constants";
import { SETTINGS_EVENTS } from "./events/settings.events";
import { SettingNotFoundException } from "./exceptions/setting-not-found.exception";
import type { SettingsModuleOptions, SettingDefinition, SettingType } from "./interfaces";

interface EventEmitterLike {
  emit(event: string, ...args: any[]): boolean;
}

interface CacheEntry {
  value: any;
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
    @Optional() @Inject("EventEmitter2") private readonly eventEmitter?: EventEmitterLike,
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

  async get<T = any>(key: string, defaultValue?: T): Promise<T> {
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

  async getOrFail<T = any>(key: string): Promise<T> {
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
    value: any,
    options?: { type?: SettingType; group?: string; description?: string },
  ): Promise<SettingEntity> {
    const existing = await this.settingRepo.findOne({ where: { key } });
    const serialized = this.serializeValue(value);
    const type = options?.type ?? this.inferType(value);

    if (existing) {
      const oldValue = this.castValue(existing.value, existing.type as SettingType);
      existing.value = serialized;
      existing.type = type;
      if (options?.group !== undefined) existing.group = options.group;
      if (options?.description !== undefined) existing.description = options.description;
      const saved = await this.settingRepo.save(existing);
      this.setCache(key, value);
      this.emit(SETTINGS_EVENTS.UPDATED, { key, oldValue, newValue: value, type });
      return saved;
    }

    const setting = this.settingRepo.create({
      key,
      value: serialized,
      type,
      group: options?.group ?? null,
      description: options?.description ?? null,
    });
    const saved = await this.settingRepo.save(setting);
    this.setCache(key, value);
    this.emit(SETTINGS_EVENTS.CREATED, {
      key,
      value,
      type,
      group: options?.group ?? null,
    });
    return saved;
  }

  // --- Check ---

  async has(key: string): Promise<boolean> {
    const cached = this.getCached(key);
    if (cached !== undefined) return true;

    const count = await this.settingRepo.count({ where: { key } });
    return count > 0;
  }

  // --- Delete ---

  async forget(key: string): Promise<void> {
    const setting = await this.settingRepo.findOne({ where: { key } });
    if (!setting) return;

    const lastValue = this.castValue(setting.value, setting.type as SettingType);
    await this.settingRepo.remove(setting);
    this.invalidateCache(key);
    this.emit(SETTINGS_EVENTS.DELETED, { key, lastValue });
  }

  // --- Bulk ---

  async all(): Promise<Record<string, any>> {
    const settings = await this.settingRepo.find();
    const result: Record<string, any> = {};
    for (const setting of settings) {
      result[setting.key] = this.castValue(setting.value, setting.type as SettingType);
    }
    return result;
  }

  async group(name: string): Promise<Record<string, any>> {
    const settings = await this.settingRepo.find({ where: { group: name } });
    const result: Record<string, any> = {};
    for (const setting of settings) {
      result[setting.key] = this.castValue(setting.value, setting.type as SettingType);
    }
    return result;
  }

  // --- Cache ---

  flushCache(): void {
    this.cache.clear();
  }

  // --- Private ---

  private async seed(defaults: SettingDefinition[]): Promise<void> {
    for (const def of defaults) {
      const exists = await this.settingRepo.findOne({ where: { key: def.key } });
      if (!exists) {
        const setting = this.settingRepo.create({
          key: def.key,
          value: this.serializeValue(def.value),
          type: def.type ?? this.inferType(def.value),
          group: def.group ?? null,
          description: def.description ?? null,
        });
        await this.settingRepo.save(setting);
      }
    }
  }

  private castValue(raw: string, type: SettingType): any {
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

  private serializeValue(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  private inferType(value: any): SettingType {
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "object" && value !== null) return "json";
    return "string";
  }

  private getCached(key: string): any | undefined {
    if (this.cacheTtl <= 0) return undefined;

    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  private setCache(key: string, value: any): void {
    if (this.cacheTtl <= 0) return;
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtl });
  }

  private invalidateCache(key: string): void {
    this.cache.delete(key);
  }

  private emit(event: string, payload: any): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event, payload);
    }
  }
}
