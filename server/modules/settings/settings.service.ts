// Public API of the settings module. Settings are plain key/JSON pairs: global
// ones in `settings` (app URL, discovery interval), per-user ones in
// `user_settings` (caps, filters, notifications, inbox). Other modules own the
// meaning (and validation) of their own keys.
export { getSetting, getUserSetting, putSetting, putUserSetting } from "./settings.repository";
