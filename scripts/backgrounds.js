import { MODULE_ID } from "./state.js";

export const BACKGROUND_SETTINGS = {
  blackjack: "blackjackBackground",
  roulette: "rouletteBackground",
  beholdem: "beholdemBackground",
  dragonDice: "dragonDiceBackground"
};

export const CARD_BACK_SETTINGS = {
  blackjackCardBack: "blackjackCardBack",
  beholdemCardBack: "beholdemCardBack"
};

export function getTableBackground(gameId) {
  const key = BACKGROUND_SETTINGS[gameId];
  if (!key) return "";
  return game.settings.get(MODULE_ID, key) ?? "";
}

export function getCardBack(gameId) {
  const key = gameId === "blackjack" ? CARD_BACK_SETTINGS.blackjackCardBack : gameId === "beholdem" ? CARD_BACK_SETTINGS.beholdemCardBack : null;
  if (!key) return "";
  return game.settings.get(MODULE_ID, key) ?? "";
}

export function applyCardBackVariables() {
  const root = document.documentElement;
  if (!root) return;
  const blackjack = getCardBack("blackjack");
  const beholdem = getCardBack("beholdem");
  root.style.setProperty("--blackjack-card-back", blackjack ? `url(${JSON.stringify(blackjack)})` : "url('modules/cassinooo/assets/balor-card-back.svg')");
  root.style.setProperty("--beholdem-card-back", beholdem ? `url(${JSON.stringify(beholdem)})` : "url('modules/cassinooo/assets/balor-card-back.svg')");
}
