import { MODULE_ID, SOCKET_NAME, registerSettings } from "./state.js";
import { registerModuleSettings } from "./module-settings.js";
import { setupScaledBoard } from "./scaled-board.js";
import { applyCasinoThemeClass } from "./casino-themes.js";
import {
  attachCasinoWalletControls,
  handleCasinoWalletSocket,
  primeCasinoSettlement,
  reconcileCasinoSettlement,
  registerCasinoWalletSettings
} from "./casino-wallet.js";
import { getBlackjackState, handleBlackjackSocket, registerBlackjackSetting } from "./blackjack.js";
import { getRouletteState, handleRouletteSocket, recoverRouletteSpin, registerRouletteSettings } from "./roulette.js";
import { getBeholdemState, handleBeholdemSocket, registerBeholdemSettings } from "./beholdem.js";
import { getDragonDiceState, handleDragonDiceSocket, registerDragonDiceSettings } from "./dragon-dice.js";
import { getLiarsDiceState, handleLiarsDiceSocket, registerLiarsDiceSettings } from "./liars-dice.js";
import { handlePachinkoSocket, registerPachinkoSettings } from "./pachinko.js";

let blackjackTable = null;
let rouletteTable = null;
let beholdemTable = null;
let dragonDiceTable = null;
let liarsDiceTable = null;
let pachinkoTable = null;

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
async function getPachinkoTable() {
  if (!pachinkoTable) {
    const { PachinkoTable } = await import("../applications/pachinko-table.js");
    pachinkoTable = new PachinkoTable();
  }
  return pachinkoTable;
}

function reportOpenError(gameName, err) {
  console.error(`cassinooo | Falha ao abrir ${gameName}`, err);
  ui.notifications?.error(`Cassinooo: não foi possível abrir ${gameName}. Veja o console para detalhes.`);
}
function openBlackjack() { void getBlackjackTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Blackjack", err)); }
function openRoulette() { void recoverRouletteSpin(); void getRouletteTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Roleta", err)); }
function openBeholdem() { void getBeholdemTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Beholdem", err)); }
function openDragonDice() { void getDragonDiceTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Dados do Dragão", err)); }
function openLiarsDice() { void getLiarsDiceTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Liar's Dice", err)); }
function openPachinko() { void getPachinkoTable().then((app) => app.render({ force: true })).catch((err) => reportOpenError("Pachinko", err)); }

async function refreshOpenBlackjack() { if (blackjackTable?.rendered) await blackjackTable.render({ force: true }); }
async function refreshOpenRoulette() { if (rouletteTable?.rendered) await rouletteTable.render({ force: true }); }
async function refreshOpenBeholdem() { if (beholdemTable?.rendered) await beholdemTable.render({ force: true }); }
async function refreshOpenDragonDice() { if (dragonDiceTable?.rendered) await dragonDiceTable.render({ force: true }); }
async function refreshOpenLiarsDice() { if (liarsDiceTable?.rendered) await liarsDiceTable.render({ force: true }); }
async function refreshOpenPachinko() { if (pachinkoTable?.rendered) await pachinkoTable.render({ force: true }); }
async function refreshOpenCasinoTables() { await Promise.all([refreshOpenBlackjack(), refreshOpenRoulette(), refreshOpenBeholdem(), refreshOpenDragonDice(), refreshOpenLiarsDice(), refreshOpenPachinko()]); }

function blackjackWalletView() {
  const state = getBlackjackState();
  const rows = Object.values(state.hands ?? {}).map((hand) => ({ userId: hand.userId, delta: Number(hand.roundDelta) || 0 }));
  return { state, settled: state.phase === "finished", rows };
}
function rouletteWalletView() {
  const state = getRouletteState();
  return { state, settled: state.phase === "settled", rows: state.roundResults ?? [] };
}
function beholdemWalletView() {
  const state = getBeholdemState();
  return { state, settled: state.phase === "showdown" && Boolean(state.roundComplete) && (state.roundResults?.length ?? 0) > 0, rows: state.roundResults ?? [] };
}
function dragonWalletView() {
  const state = getDragonDiceState();
  return { state, settled: state.phase === "revealed" && (state.roundResults?.length ?? 0) > 0, rows: state.roundResults ?? [] };
}
function liarsWalletView() {
  const state = getLiarsDiceState();
  return { state, settled: state.phase === "finished" && (state.roundResults?.length ?? 0) > 0, rows: state.roundResults ?? [] };
}

async function reconcileBlackjackWallet() { const view = blackjackWalletView(); await reconcileCasinoSettlement("blackjack", view.settled, view.rows); }
async function reconcileRouletteWallet() { const view = rouletteWalletView(); await reconcileCasinoSettlement("roulette", view.settled, view.rows); }
async function reconcileBeholdemWallet() { const view = beholdemWalletView(); await reconcileCasinoSettlement("beholdem", view.settled, view.rows); }
async function reconcileDragonWallet() { const view = dragonWalletView(); await reconcileCasinoSettlement("dragonDice", view.settled, view.rows); }
async function reconcileLiarsWallet() { const view = liarsWalletView(); await reconcileCasinoSettlement("liarsDice", view.settled, view.rows); }

async function onBlackjackUpdated() { await reconcileBlackjackWallet(); await refreshOpenBlackjack(); }
async function onRouletteUpdated() { await reconcileRouletteWallet(); await refreshOpenRoulette(); }
async function onBeholdemUpdated() { await reconcileBeholdemWallet(); await refreshOpenBeholdem(); }
async function onDragonUpdated() { await reconcileDragonWallet(); await refreshOpenDragonDice(); }
async function onLiarsUpdated() { await reconcileLiarsWallet(); await refreshOpenLiarsDice(); }

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
    makeLauncherButton({ id: "cassinooo-open-liars-dice", icon: "fa-solid fa-dice", label: "Liar's Dice", onClick: openLiarsDice }),
    makeLauncherButton({ id: "cassinooo-open-pachinko", icon: "fa-solid fa-coins", label: "Pachinko", onClick: openPachinko })
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
  if (name === "PachinkoTable") setupScaledBoard(app, { viewportSelector: ".cassinooo-pachinko-viewport", boardSelector: ".cassinooo-pachinko-board", designWidth: 1000, designHeight: 700 });
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando Cassinooo`);
  registerSettings();
  registerModuleSettings();
  registerCasinoWalletSettings();
  registerBlackjackSetting();
  registerRouletteSettings();
  registerBeholdemSettings();
  registerDragonDiceSettings();
  registerLiarsDiceSettings();
  registerPachinkoSettings();
});

Hooks.once("ready", async () => {
  void recoverRouletteSpin();

  const initialViews = {
    blackjack: blackjackWalletView(),
    roulette: rouletteWalletView(),
    beholdem: beholdemWalletView(),
    dragonDice: dragonWalletView(),
    liarsDice: liarsWalletView()
  };
  for (const [gameId, view] of Object.entries(initialViews)) await primeCasinoSettlement(gameId, view.settled);

  game.socket.on(SOCKET_NAME, async (message) => {
    await handleBlackjackSocket(message);
    await handleRouletteSocket(message);
    await handleBeholdemSocket(message);
    await handleDragonDiceSocket(message);
    await handleLiarsDiceSocket(message);
    await handlePachinkoSocket(message);
    await handleCasinoWalletSocket(message);
    if (["seats-updated", "blackjack-updated"].includes(message?.type)) await refreshOpenBlackjack();
    if (["roulette-seats-updated", "roulette-updated"].includes(message?.type)) await refreshOpenRoulette();
    if (["beholdem-seats-updated", "beholdem-updated"].includes(message?.type)) await refreshOpenBeholdem();
    if (["dragon-dice-seats-updated", "dragon-dice-updated"].includes(message?.type)) await refreshOpenDragonDice();
    if (["liars-dice-seats-updated", "liars-dice-updated"].includes(message?.type)) await refreshOpenLiarsDice();
    if (message?.type === "pachinko-updated") await refreshOpenPachinko();
    if (["backgrounds-updated", "casino-wallet-updated"].includes(message?.type)) await refreshOpenCasinoTables();
  });
});

Hooks.on("cassinoooBlackjackUpdated", onBlackjackUpdated);
Hooks.on("cassinoooRouletteUpdated", onRouletteUpdated);
Hooks.on("cassinoooBeholdemUpdated", onBeholdemUpdated);
Hooks.on("cassinoooDragonDiceUpdated", onDragonUpdated);
Hooks.on("cassinoooLiarsDiceUpdated", onLiarsUpdated);
Hooks.on("cassinoooPachinkoUpdated", refreshOpenPachinko);
Hooks.on("cassinoooWalletUpdated", refreshOpenCasinoTables);
Hooks.on("cassinoooBackgroundsUpdated", refreshOpenCasinoTables);
Hooks.on("renderJournalDirectory", injectJournalButtons);
Hooks.on("renderApplicationV2", (app, element) => {
  if (app?.constructor?.name === "JournalDirectory") injectJournalButtons(app, element);
  setupApplicationScale(app);
  applyCasinoThemeClass(app);
  void attachCasinoWalletControls(app);
});
