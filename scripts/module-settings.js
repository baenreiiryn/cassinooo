import { CasinoSettings } from "../applications/casino-settings.js";
import { BACKGROUND_SETTINGS, CARD_BACK_SETTINGS } from "./backgrounds.js";
import { MODULE_ID } from "./state.js";

export function registerModuleSettings() {
  for (const settingKey of [...Object.values(BACKGROUND_SETTINGS), ...Object.values(CARD_BACK_SETTINGS)]) {
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
    name: "Aparência das mesas",
    label: "Configurar aparência",
    hint: "Escolha os fundos das mesas e os versos das cartas do Blackjack e Beholdem.",
    icon: "fa-solid fa-images",
    type: CasinoSettings,
    restricted: true
  });
}
