import { CasinoSettings } from "../applications/casino-settings.js";
import { BACKGROUND_SETTINGS } from "./backgrounds.js";
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

  game.settings.registerMenu(MODULE_ID, "tableBackgrounds", {
    name: "Fundos das mesas",
    label: "Configurar fundos",
    hint: "Escolha ou faça upload das imagens usadas como fundo de cada mesa do Cassinooo.",
    icon: "fa-solid fa-image",
    type: CasinoSettings,
    restricted: true
  });
}
