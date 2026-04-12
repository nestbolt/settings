export const SETTINGS_EVENTS = {
  CREATED: "settings.created",
  UPDATED: "settings.updated",
  DELETED: "settings.deleted",
} as const;

export interface SettingCreatedEvent {
  key: string;
  value: any;
  type: string;
  group: string | null;
}

export interface SettingUpdatedEvent {
  key: string;
  oldValue: any;
  newValue: any;
  type: string;
}

export interface SettingDeletedEvent {
  key: string;
  lastValue: any;
}
