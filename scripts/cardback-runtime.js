import { MODULE_ID } from "./state.js";

const DEFAULT_BACK = "modules/cassinooo/assets/balor-card-back.svg";

function configuredBack(settingKey) {
  try {
    return String(game.settings.get(MODULE_ID, settingKey) || "").trim() || DEFAULT_BACK;
  } catch {
    return DEFAULT_BACK;
  }
}

function applyImage(elements, path) {
  const value = `url(${JSON.stringify(path)})`;
  for (const el of elements) {
    el.style.setProperty("background-image", value, "important");
    el.style.setProperty("background-position", "center", "important");
    el.style.setProperty("background-size", "cover", "important");
    el.style.setProperty("background-repeat", "no-repeat", "important");
  }
}

function renumberBeholdemSeats(root = document) {
  const visualNumbers = new Map([
    ["seat-upper-left", "Lugar 1"],
    ["seat-lower-left", "Lugar 2"],
    ["seat-lower-mid-left", "Lugar 3"],
    ["seat-lower-mid-right", "Lugar 4"],
    ["seat-upper-right", "Lugar 5"],
    ["seat-lower-right", "Lugar 6"]
  ]);

  for (const [positionClass, label] of visualNumbers) {
    for (const seat of root.querySelectorAll?.(`.cassinooo-beholdem-seat.${positionClass}`) ?? []) {
      const number = seat.querySelector(".cassinooo-seat-number");
      if (number) number.textContent = label;
    }
  }
}

export function applyCasinoCardBacks(root = document) {
  const blackjackBack = configuredBack("blackjackCardBack");
  const beholdemBack = configuredBack("beholdemCardBack");

  applyImage(root.querySelectorAll?.([
    ".cassinooo-blackjack-table .cassinooo-deck-card",
    ".cassinooo-blackjack-table .cassinooo-flying-card",
    ".cassinooo-blackjack-table .cassinooo-playing-card.hidden-card"
  ].join(",")) ?? [], blackjackBack);

  applyImage(root.querySelectorAll?.([
    ".cassinooo-beholdem-table .cassinooo-beholdem-deck > div",
    ".cassinooo-beholdem-table .cassinooo-beholdem-flying-card",
    ".cassinooo-beholdem-table .cassinooo-poker-card.hidden-card"
  ].join(",")) ?? [], beholdemBack);

  renumberBeholdemSeats(root);
}

export function installCasinoAppearanceObserver() {
  applyCasinoCardBacks(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        applyCasinoCardBacks(node.matches?.(".cassinooo-blackjack-table, .cassinooo-beholdem-table") ? node : node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  Hooks.on("cassinoooBackgroundsUpdated", () => applyCasinoCardBacks(document));
  return observer;
}
