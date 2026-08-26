import { BlackjackTable } from "../applications/blackjack-table.js";
import { MODULE_ID, SOCKET_NAME, registerSettings } from "./state.js";

let blackjackTable = null;

function getBlackjackTable() {
  blackjackTable ??= new BlackjackTable();
  return blackjackTable;
}

function openBlackjackTable() {
  getBlackjackTable().render({ force: true });
}

function injectJournalButton(app, element) {
  if (!(element instanceof HTMLElement)) return;
  if (element.querySelector("#cassinooo-open-blackjack")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "cassinooo-journal-launcher";

  const button = document.createElement("button");
  button.id = "cassinooo-open-blackjack";
  button.type = "button";
  button.innerHTML = '<i class="fa-solid fa-club"></i> Blackjack';
  button.addEventListener("click", openBlackjackTable);

  wrapper.append(button);

  const footer = element.querySelector("footer.directory-footer, .directory-footer");
  if (footer) footer.append(wrapper);
  else element.append(wrapper);
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando Cassinooo`);
  registerSettings();
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, async (message) => {
    if (message?.type !== "seats-updated") return;
    if (!blackjackTable?.rendered) return;
    await blackjackTable.render({ force: true });
  });
});

Hooks.on("renderJournalDirectory", injectJournalButton);

// Fallback para o ciclo ApplicationV2 do Foundry VTT v13.
Hooks.on("renderApplicationV2", (app, element) => {
  if (app?.constructor?.name !== "JournalDirectory") return;
  injectJournalButton(app, element);
});
