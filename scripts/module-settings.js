import { CasinoSettings } from "../applications/casino-settings.js";
import { BACKGROUND_SETTINGS } from "./backgrounds.js";
import { registerCasinoThemeSettings } from "./casino-themes.js";
import { MODULE_ID } from "./state.js";

export function registerModuleSettings() {
  for (const settingKey of Object.values(BACKGROUND_SETTINGS)) {
    game.settings.register(MODULE_ID, settingKey, {
      name: settingKey,
      hint: "",
      scope: "world",
      config: false,
      type: String,
      default: ""
    });
  }
  registerCasinoThemeSettings();

  game.settings.registerMenu(MODULE_ID, "tableBackgrounds", {
    name: "Aparência das mesas",
    label: "Configurar aparência",
    hint: "Escolha temas e fundos das mesas do Cassinooo.",
    icon: "fa-solid fa-images",
    type: CasinoSettings,
    restricted: true
  });
}
