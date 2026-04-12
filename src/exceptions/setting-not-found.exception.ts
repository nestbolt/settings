export class SettingNotFoundException extends Error {
  constructor(key: string) {
    super(`Setting with key "${key}" was not found.`);
    this.name = "SettingNotFoundException";
  }
}
