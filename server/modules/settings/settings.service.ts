// Public API of the settings module. Settings are plain key/JSON pairs; other
// modules own the meaning (and validation) of their own keys.
export { getSetting, putSetting } from "./settings.repository";
