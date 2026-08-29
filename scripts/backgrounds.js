import { MODULE_ID } from "./state.js";

export const BACKGROUND_SETTINGS = {
  blackjack: "blackjackBackground",
  roulette: "rouletteBackground",
  beholdem: "beholdemBackground",
  dragonDice: "dragonDiceBackground",
  liarsDice: "liarsDiceBackground"
};

export function getTableBackground(gameId) {
  const key = BACKGROUND_SETTINGS[gameId];
  if (!key) return "";
  return game.settings.get(MODULE_ID, key) ?? "";
}
