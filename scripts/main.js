import { BlackjackTable } from "../applications/blackjack-table.js";
import { GamePlaceholder } from "../applications/game-placeholder.js";
import { MODULE_ID, SOCKET_NAME, registerSettings } from "./state.js";
import { handleBlackjackSocket, registerBlackjackSetting } from "./blackjack.js";

let blackjackTable = null;
const futureGames = new Map();

function getBlackjackTable() {
  blackjackTable ??= new BlackjackTable();
  return blackjackTable;
}

function getFutureGame(id, config) {
  if (!futureGames.has(id)) futureGames.set(id, new GamePlaceholder({ id, ...config }));
  return futureGames.get(id);
}

function openBlackjack() { getBlackjackTable().render({ force: true }); }
function openRoulette() {
  getFutureGame("roulette", { title: "Roleta", icon: "fa-solid fa-circle-notch", gameName: "Roleta", description: "A mesa de roleta será implementada como um jogo independente." }).render({ force: true });
}
function openBeholdem() {
  getFutureGame("beholdem", { title: "Beholdem", icon: "fa-solid fa-spade", gameName: "Beholdem", description: "Texas Hold'em compartilhado para a mesa do Cassinooo." }).render({ force: true });
}
function openDragonDice() {
  getFutureGame("dragon-dice", { title: "Dados do Dragão", icon: "fa-solid fa-dice-d20", gameName: "Dados do Dragão", description: "Jogo de dados do Cassinooo, a ser implementado em uma mesa própria." }).render({ force: true });
}

async function refreshOpenTable() {
  if (!blackjackTable?.rendered) return;
  await blackjackTable.render({ force: true });
}

function makeLauncherButton({ id, icon, label, onClick }) {
  const button = document.createElement("button");
  button.id = id;
  button.type = "button";
  button.innerHTML = `<i class="${icon}"></i> ${label}`;
  button.addEventListener("click", onClick);
  return button;
}

function injectJournalButtons(app, element) {
  if (!(element instanceof HTMLElement)) return;
  if (element.querySelector("#cassinooo-game-launchers")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "cassinooo-game-launchers";
  wrapper.className = "cassinooo-journal-launcher";

  wrapper.append(
    makeLauncherButton({ id: "cassinooo-open-blackjack", icon: "fa-solid fa-club", label: "Blackjack", onClick: openBlackjack }),
    makeLauncherButton({ id: "cassinooo-open-roulette", icon: "fa-solid fa-circle-notch", label: "Roleta", onClick: openRoulette }),
    makeLauncherButton({ id: "cassinooo-open-beholdem", icon: "fa-solid fa-spade", label: "Beholdem", onClick: openBeholdem }),
    makeLauncherButton({ id: "cassinooo-open-dragon-dice", icon: "fa-solid fa-dice-d20", label: "Dados do Dragão", onClick: openDragonDice })
  );

  const footer = element.querySelector("footer.directory-footer, .directory-footer");
  if (footer) footer.append(wrapper);
  else element.append(wrapper);
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando Cassinooo`);
  registerSettings();
  registerBlackjackSetting();
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, async (message) => {
    await handleBlackjackSocket(message);
    if (!["seats-updated", "blackjack-updated"].includes(message?.type)) return;
    await refreshOpenTable();
  });
});

Hooks.on("cassinoooBlackjackUpdated", refreshOpenTable);
Hooks.on("renderJournalDirectory", injectJournalButtons);
Hooks.on("renderApplicationV2", (app, element) => {
  if (app?.constructor?.name !== "JournalDirectory") return;
  injectJournalButtons(app, element);
});
