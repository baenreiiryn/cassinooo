import { MODULE_ID } from "./state.js";

export const CASINO_THEME_OPTIONS = [
  { id: "medieval", label: "Medieval" },
  { id: "cosmic", label: "Horror Cósmico" },
  { id: "infernal", label: "Infernal" },
  { id: "tavern", label: "Taverna" }
];

export const TABLE_THEME_SETTINGS = {
  blackjack: "blackjackTheme",
  roulette: "rouletteTheme",
  beholdem: "beholdemTheme",
  dragonDice: "dragonDiceTheme",
  liarsDice: "liarsDiceTheme"
};

export function registerCasinoThemeSettings() {
  for (const settingKey of Object.values(TABLE_THEME_SETTINGS)) {
    game.settings.register(MODULE_ID, settingKey, {
      name: settingKey,
      scope: "world",
      config: false,
      type: String,
      default: "medieval"
    });
  }
}

export function normalizeCasinoTheme(value) {
  return CASINO_THEME_OPTIONS.some((theme) => theme.id === value) ? value : "medieval";
}

export function getTableTheme(gameId) {
  const settingKey = TABLE_THEME_SETTINGS[gameId];
  if (!settingKey) return "medieval";
  return normalizeCasinoTheme(game.settings.get(MODULE_ID, settingKey));
}

export function applyCasinoThemeClass(app) {
  const root = app?.element;
  if (!(root instanceof HTMLElement)) return;
  const gameIdByApp = {
    BlackjackTable: "blackjack",
    RouletteTable: "roulette",
    BeholdemTable: "beholdem",
    DragonDiceTable: "dragonDice",
    LiarsDiceTable: "liarsDice"
  };
  const appName = app?.constructor?.name;
  let theme = null;
  if (appName === "PachinkoTable") theme = normalizeCasinoTheme(game.settings.get(MODULE_ID, "pachinkoTheme"));
  else {
    const gameId = gameIdByApp[appName];
    if (gameId) theme = getTableTheme(gameId);
  }
  if (!theme) return;
  for (const option of CASINO_THEME_OPTIONS) root.classList.remove(`cassinooo-theme-${option.id}`);
  root.classList.add(`cassinooo-theme-${theme}`);
}
