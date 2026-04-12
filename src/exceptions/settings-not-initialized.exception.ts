export class SettingsNotInitializedException extends Error {
  constructor() {
    super(
      "SettingsModule has not been initialized. Make sure SettingsModule.forRoot() is imported.",
    );
    this.name = "SettingsNotInitializedException";
  }
}
