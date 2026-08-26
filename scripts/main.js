import { BlackjackTable } from "../applications/blackjack-table.js";
import { MODULE_ID, SOCKET_NAME, registerSettings } from "./state.js";
import { handleBlackjackSocket, registerBlackjackSetting } from "./blackjack.js";

let blackjackTable = null;

function getBlackjackTable() {
  blackjackTable ??= new BlackjackTable();
  return blackjackTable;
}

function openCasinoTable() {
  getBlackjackTable().render({ force: true });
}

async function refreshOpenTable() {
  if (!blackjackTable?.rendered) return;
  await blackjackTable.render({ force: true });
}

function injectJournalButton(app, element) {
  if (!(element instanceof HTMLElement)) return;
  if (element.querySelector("#cassinooo-open-table")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "cassinooo-journal-launcher";

  const button = document.createElement("button");
  button.id = "cassinooo-open-table";
  button.type = "button";
  button.innerHTML = '<i class="fa-solid fa-dice"></i> Mesa do Cassino';
  button.addEventListener("click", openCasinoTable);

  wrapper.append(button);

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
Hooks.on("renderJournalDirectory", injectJournalButton);

Hooks.on("renderApplicationV2", (app, element) => {
  if (app?.constructor?.name !== "JournalDirectory") return;
  injectJournalButton(app, element);
});
