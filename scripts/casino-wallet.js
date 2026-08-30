import { MODULE_ID, SOCKET_NAME } from "./state.js";

export const CASINO_WALLET_SETTING = "casinoWallets";
const SETTLEMENT_GAMES = ["blackjack", "roulette", "beholdem", "dragonDice", "liarsDice"];

function emptyWalletState() {
  return {
    balances: {},
    settlement: Object.fromEntries(SETTLEMENT_GAMES.map((id) => [id, { initialized: false, armed: true }]))
  };
}

function normalizeWalletState(raw) {
  const state = foundry.utils.deepClone(raw ?? emptyWalletState());
  state.balances ??= {};
  state.settlement ??= {};
  for (const id of SETTLEMENT_GAMES) state.settlement[id] = { initialized: false, armed: true, ...(state.settlement[id] ?? {}) };
  return state;
}

function roundMoney(value) { return Math.round((Number(value) || 0) * 100) / 100; }
function sanitizeDeposit(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
function primaryGM() { return game.users.filter((u) => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null; }
function isPrimaryGM() { return Boolean(game.user?.isGM && primaryGM()?.id === game.user.id); }

export function registerCasinoWalletSettings() {
  game.settings.register(MODULE_ID, CASINO_WALLET_SETTING, {
    name: "Carteiras de fichas do Cassinooo",
    scope: "world",
    config: false,
    type: Object,
    default: emptyWalletState()
  });
}

export function getCasinoWalletState() { return normalizeWalletState(game.settings.get(MODULE_ID, CASINO_WALLET_SETTING)); }
export function getCasinoWalletBalance(userId = game.user?.id) {
  if (!userId) return 0;
  return roundMoney(getCasinoWalletState().balances?.[userId] ?? 0);
}

async function saveWalletState(state) {
  const normalized = normalizeWalletState(state);
  await game.settings.set(MODULE_ID, CASINO_WALLET_SETTING, normalized);
  Hooks.callAll("cassinoooWalletUpdated", foundry.utils.deepClone(normalized));
  game.socket.emit(SOCKET_NAME, { type: "casino-wallet-updated" });
  return normalized;
}

function currencyInfo(actor) {
  if (!actor) return null;
  const candidates = [
    "system.currency.gp",
    "system.currency.gold",
    "system.gold",
    "system.resources.gold.value",
    "system.resources.currency.gold"
  ];
  for (const path of candidates) {
    const raw = foundry.utils.getProperty(actor, path);
    const value = Number(raw);
    if (Number.isFinite(value)) return { path, value };
  }
  return null;
}

function linkedActor(userId) {
  const actor = game.users.get(userId)?.character;
  return actor?.update ? actor : null;
}

export async function changeCasinoGold(userId, delta) {
  const actor = linkedActor(userId);
  if (!actor) throw new Error("Vincule um personagem ao seu usuário antes de converter fichas.");
  const currency = currencyInfo(actor);
  if (!currency) throw new Error("Não encontrei um campo de PO/ouro compatível na ficha vinculada.");
  const next = roundMoney(currency.value + Number(delta || 0));
  if (next < 0) throw new Error(`O personagem possui apenas ${currency.value} PO.`);
  await actor.update({ [currency.path]: next });
  return { actor, path: currency.path, previous: currency.value, next };
}

function notifyUser(userId, message, level = "info") {
  game.socket.emit(SOCKET_NAME, { type: "casino-wallet-notify", userId, message, level });
  if (game.user?.id === userId) ui.notifications?.[level]?.(message);
}

async function applyDeposit(userId, amount) {
  const value = sanitizeDeposit(amount);
  if (!userId || !game.users.get(userId) || value <= 0) return false;
  let goldChange = null;
  try {
    goldChange = await changeCasinoGold(userId, -value);
    const state = getCasinoWalletState();
    state.balances[userId] = roundMoney((state.balances[userId] ?? 0) + value);
    await saveWalletState(state);
    notifyUser(userId, `${value} PO convertidas em ${value} fichas. Saldo: ${state.balances[userId]} fichas.`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Falha ao adicionar fichas`, err);
    if (goldChange) { try { await goldChange.actor.update({ [goldChange.path]: goldChange.previous }); } catch (_) {} }
    notifyUser(userId, err?.message ?? "Não foi possível adicionar fichas.", "error");
    return false;
  }
}

async function applyWithdraw(userId) {
  if (!userId || !game.users.get(userId)) return false;
  const state = getCasinoWalletState();
  const amount = roundMoney(state.balances[userId] ?? 0);
  if (amount <= 0) { notifyUser(userId, "Não há fichas para sacar.", "warn"); return false; }
  let goldChange = null;
  try {
    goldChange = await changeCasinoGold(userId, amount);
    state.balances[userId] = 0;
    await saveWalletState(state);
    notifyUser(userId, `${amount} fichas convertidas em ${amount} PO e devolvidas à ficha.`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Falha ao sacar fichas`, err);
    if (goldChange) { try { await goldChange.actor.update({ [goldChange.path]: goldChange.previous }); } catch (_) {} }
    notifyUser(userId, err?.message ?? "Não foi possível sacar as fichas.", "error");
    return false;
  }
}

export function requestCasinoWalletDeposit(amount) {
  if (game.user?.isGM || !game.user?.id) return false;
  const value = sanitizeDeposit(amount);
  if (value <= 0) return false;
  game.socket.emit(SOCKET_NAME, { type: "casino-wallet-deposit", requesterId: game.user.id, amount: value });
  return true;
}

export function requestCasinoWalletWithdraw() {
  if (game.user?.isGM || !game.user?.id) return false;
  game.socket.emit(SOCKET_NAME, { type: "casino-wallet-withdraw", requesterId: game.user.id });
  return true;
}

export async function primeCasinoSettlement(gameId, settled) {
  if (!isPrimaryGM() || !SETTLEMENT_GAMES.includes(gameId)) return false;
  const state = getCasinoWalletState();
  const tracker = state.settlement[gameId];
  if (tracker.initialized) return false;
  tracker.initialized = true;
  tracker.armed = !settled;
  await saveWalletState(state);
  return true;
}

export async function reconcileCasinoSettlement(gameId, settled, rows = []) {
  if (!isPrimaryGM() || !SETTLEMENT_GAMES.includes(gameId)) return false;
  const state = getCasinoWalletState();
  const tracker = state.settlement[gameId];

  if (!tracker.initialized) {
    tracker.initialized = true;
    tracker.armed = !settled;
    await saveWalletState(state);
    return false;
  }

  if (!settled) {
    if (!tracker.armed) {
      tracker.armed = true;
      await saveWalletState(state);
      return true;
    }
    return false;
  }

  if (!tracker.armed) return false;

  for (const row of rows ?? []) {
    const userId = row?.userId;
    if (!userId || !game.users.get(userId)) continue;
    const delta = roundMoney(row?.delta ?? row?.roundDelta ?? 0);
    if (!delta) continue;
    state.balances[userId] = roundMoney((state.balances[userId] ?? 0) + delta);
  }
  tracker.armed = false;
  await saveWalletState(state);
  return true;
}

export async function handleCasinoWalletSocket(message) {
  if (!message) return;
  if (message.type === "casino-wallet-notify" && message.userId === game.user?.id) {
    ui.notifications?.[message.level ?? "info"]?.(message.message);
    return;
  }
  if (!isPrimaryGM()) return;
  if (message.type === "casino-wallet-deposit" && message.requesterId) {
    await applyDeposit(message.requesterId, message.amount);
    return;
  }
  if (message.type === "casino-wallet-withdraw" && message.requesterId) await applyWithdraw(message.requesterId);
}

export async function attachCasinoWalletControls(app) {
  if (game.user?.isGM || !game.user?.id || !app?.element) return;
  const supported = new Set(["BlackjackTable", "RouletteTable", "BeholdemTable", "DragonDiceTable", "LiarsDiceTable"]);
  if (!supported.has(app.constructor?.name)) return;
  if (app.element.querySelector(".cassinooo-wallet-bar")) return;

  const host = app.element.querySelector(".cassinooo-table-header") ?? app.element.querySelector(".window-content") ?? app.element;
  const bar = document.createElement("div");
  bar.className = "cassinooo-wallet-bar";
  const balance = getCasinoWalletBalance(game.user.id);
  bar.innerHTML = `
    <span class="cassinooo-wallet-label"><i class="fa-solid fa-coins"></i> Fichas</span>
    <strong class="cassinooo-wallet-balance">${balance}</strong>
    <input type="number" min="1" step="1" value="10" data-cassinooo-wallet-amount aria-label="Quantidade de fichas">
    <button type="button" data-cassinooo-wallet-deposit><i class="fa-solid fa-plus"></i> Adicionar</button>
    <button type="button" data-cassinooo-wallet-withdraw ${balance <= 0 ? "disabled" : ""}><i class="fa-solid fa-sack-dollar"></i> Sacar</button>`;
  host.append(bar);

  const { DialogV2 } = foundry.applications.api;
  bar.querySelector("[data-cassinooo-wallet-deposit]")?.addEventListener("click", async () => {
    const amount = sanitizeDeposit(bar.querySelector("[data-cassinooo-wallet-amount]")?.value);
    if (amount <= 0) { ui.notifications?.warn("Informe quantas PO deseja converter em fichas."); return; }
    let confirmed = false;
    if (DialogV2?.confirm) confirmed = await DialogV2.confirm({ window: { title: "Confirmar fichas" }, content: `<p>Converter <strong>${amount} PO</strong> da ficha vinculada em <strong>${amount} fichas</strong> do Cassinooo?</p>` });
    else confirmed = window.confirm(`Converter ${amount} PO em ${amount} fichas?`);
    if (confirmed) requestCasinoWalletDeposit(amount);
  });
  bar.querySelector("[data-cassinooo-wallet-withdraw]")?.addEventListener("click", () => requestCasinoWalletWithdraw());
}
