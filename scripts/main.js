import { MODULE_ID, SOCKET_NAME, registerSettings } from "./state.js";
import { registerModuleSettings } from "./module-settings.js";
import { setupScaledBoard } from "./scaled-board.js";
import { handleBlackjackSocket, registerBlackjackSetting } from "./blackjack.js";
import { handleRouletteSocket, recoverRouletteSpin, registerRouletteSettings } from "./roulette.js";
import { handleBeholdemSocket, registerBeholdemSettings } from "./beholdem.js";
import { handleDragonDiceSocket, registerDragonDiceSettings } from "./dragon-dice.js";
import { handleLiarsDiceSocket, registerLiarsDiceSettings } from "./liars-dice.js";

let blackjackTable = null;
let rouletteTable = null;
let beholdemTable = null;
let dragonDiceTable = null;
let liarsDiceTable = null;

async function getBlackjackTable() {
  if (!blackjackTable) {
    const { BlackjackTable } = await import("../applications/blackjack-table.js");
    blackjackTable = new BlackjackTable();
  }
  return blackjackTable;
}

async function getRouletteTable() {
  if (!rouletteTable) {
    const { RouletteTable } = await import("../applications/roulette-table.js");
    try { RouletteTable.DEFAULT_OPTIONS.window.resizable = true; } catch (_) {}
    rouletteTable = new RouletteTable();
  }
  return rouletteTable;
}

async function getBeholdemTable() {
  if (!beholdemTable) {
    const { BeholdemTable } = await import("../applications/beholdem-table.js");
    beholdemTable = new BeholdemTable();
  }
  return beholdemTable;
}

async function getDragonDiceTable() {
  if (!dragonDiceTable) {
    const { DragonDiceTable } = await import("../applications/dragon-dice-table.js");
    dragonDiceTable = new DragonDiceTable();
  }
  return dragonDiceTable;
}

async function getLiarsDiceTable() {
  if (!liarsDiceTable) {
    const { LiarsDiceTable } = await import("../applications/liars-dice-table.js");
    liarsDiceTable = new LiarsDiceTable();
  }
  return liarsDiceTable;
}

function reportOpenError(gameName, err) {
  console.error(`cassinooo | Falha ao abrir ${gameName}`, err);
  ui.notifications?.error(`Cassinooo: não foi possível abrir ${gameName}. Veja o console para detalhes.`);
}

function openBlackjack() {
  void getBlackjackTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Blackjack", err));
}
function openRoulette() {
  void recoverRouletteSpin();
  void getRouletteTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Roleta", err));
}
function openBeholdem() {
  void getBeholdemTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Beholdem", err));
}
function openDragonDice() {
  void getDragonDiceTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Dados do Dragão", err));
}
function openLiarsDice() {
  void getLiarsDiceTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Liar's Dice", err));
}

async function refreshOpenBlackjack() { if (blackjackTable?.rendered) await blackjackTable.render({ force: true }); }
async function refreshOpenRoulette() { if (rouletteTable?.rendered) await rouletteTable.render({ force: true }); }
async function refreshOpenBeholdem() { if (beholdemTable?.rendered) await beholdemTable.render({ force: true }); }
async function refreshOpenDragonDice() { if (dragonDiceTable?.rendered) await dragonDiceTable.render({ force: true }); }
async function refreshOpenLiarsDice() { if (liarsDiceTable?.rendered) await liarsDiceTable.render({ force: true }); }
async function refreshOpenCasinoTables() { await Promise.all([refreshOpenBlackjack(), refreshOpenRoulette(), refreshOpenBeholdem(), refreshOpenDragonDice(), refreshOpenLiarsDice()]); }

function makeLauncherButton({ id, icon, label, onClick }) {
  const button = document.createElement("button");
  button.id = id;
  button.type = "button";
  button.innerHTML = `<i class="${icon}"></i> ${label}`;
  button.addEventListener("click", onClick);
  return button;
}

function resolveHookElement(app, element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  if (app?.element instanceof HTMLElement) return app.element;
  return null;
}

function injectJournalButtons(app, element) {
  const root = resolveHookElement(app, element);
  if (!root || root.querySelector("#cassinooo-game-launchers")) return;
  const wrapper = document.createElement("div");
  wrapper.id = "cassinooo-game-launchers";
  wrapper.className = "cassinooo-journal-launcher";
  wrapper.append(
    makeLauncherButton({ id: "cassinooo-open-blackjack", icon: "fa-solid fa-club", label: "Blackjack", onClick: openBlackjack }),
    makeLauncherButton({ id: "cassinooo-open-roulette", icon: "fa-solid fa-circle-notch", label: "Roleta", onClick: openRoulette }),
    makeLauncherButton({ id: "cassinooo-open-beholdem", icon: "fa-solid fa-spade", label: "Beholdem", onClick: openBeholdem }),
    makeLauncherButton({ id: "cassinooo-open-dragon-dice", icon: "fa-solid fa-dice-d20", label: "Dados do Dragão", onClick: openDragonDice }),
    makeLauncherButton({ id: "cassinooo-open-liars-dice", icon: "fa-solid fa-dice", label: "Liar's Dice", onClick: openLiarsDice })
  );
  const footer = root.querySelector("footer.directory-footer, .directory-footer");
  if (footer) footer.append(wrapper); else root.append(wrapper);
}

function setupApplicationScale(app) {
  const name = app?.constructor?.name;
  if (name === "BlackjackTable") setupScaledBoard(app, { boardSelector: ".cassinooo-felt", designWidth: 1040, designHeight: 693 });
  if (name === "RouletteTable") setupScaledBoard(app, { boardSelector: ".cassinooo-roulette-felt", designWidth: 1100, designHeight: 690 });
  if (name === "DragonDiceTable") setupScaledBoard(app, { viewportSelector: ".cassinooo-dragon-viewport", boardSelector: ".cassinooo-dragon-felt", designWidth: 1100, designHeight: 700 });
  if (name === "LiarsDiceTable") setupScaledBoard(app, { viewportSelector: ".cassinooo-liars-viewport", boardSelector: ".cassinooo-liars-felt", designWidth: 1100, designHeight: 700 });
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando Cassinooo`);
  registerSettings();
  registerModuleSettings();
  registerBlackjackSetting();
  registerRouletteSettings();
  registerBeholdemSettings();
  registerDragonDiceSettings();
  registerLiarsDiceSettings();
});

Hooks.once("ready", () => {
  void recoverRouletteSpin();
  game.socket.on(SOCKET_NAME, async (message) => {
    await handleBlackjackSocket(message);
    await handleRouletteSocket(message);
    await handleBeholdemSocket(message);
    await handleDragonDiceSocket(message);
    await handleLiarsDiceSocket(message);
    if (["seats-updated", "blackjack-updated"].includes(message?.type)) await refreshOpenBlackjack();
    if (["roulette-seats-updated", "roulette-updated"].includes(message?.type)) await refreshOpenRoulette();
    if (["beholdem-seats-updated", "beholdem-updated"].includes(message?.type)) await refreshOpenBeholdem();
    if (["dragon-dice-seats-updated", "dragon-dice-updated"].includes(message?.type)) await refreshOpenDragonDice();
    if (["liars-dice-seats-updated", "liars-dice-updated"].includes(message?.type)) await refreshOpenLiarsDice();
    if (message?.type === "backgrounds-updated") await refreshOpenCasinoTables();
  });
});

Hooks.on("cassinoooBlackjackUpdated", refreshOpenBlackjack);
Hooks.on("cassinoooRouletteUpdated", refreshOpenRoulette);
Hooks.on("cassinoooBeholdemUpdated", refreshOpenBeholdem);
Hooks.on("cassinoooDragonDiceUpdated", refreshOpenDragonDice);
Hooks.on("cassinoooLiarsDiceUpdated", refreshOpenLiarsDice);
Hooks.on("cassinoooBackgroundsUpdated", refreshOpenCasinoTables);
Hooks.on("renderJournalDirectory", injectJournalButtons);
Hooks.on("renderApplicationV2", (app, element) => {
  if (app?.constructor?.name === "JournalDirectory") injectJournalButtons(app, element);
  setupApplicationScale(app);
});
