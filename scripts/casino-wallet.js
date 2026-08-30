import { MODULE_ID, SOCKET_NAME } from "./state.js";

export const CASINO_WALLET_SETTING = "casinoWallets";
const SETTLEMENT_GAMES = ["blackjack", "roulette", "beholdem", "dragonDice", "liarsDice"];

export const CASINO_CURRENCY_OPTIONS = [
  { id: "cp", label: "PC", name: "cobre" },
  { id: "sp", label: "PP", name: "prata" },
  { id: "gp", label: "PO", name: "ouro" }
];

const CURRENCY_PATHS = {
  cp: ["system.currency.cp", "system.currency.copper", "system.copper", "system.resources.copper.value", "system.resources.currency.copper"],
  sp: ["system.currency.sp", "system.currency.silver", "system.silver", "system.resources.silver.value", "system.resources.currency.silver"],
  gp: ["system.currency.gp", "system.currency.gold", "system.gold", "system.resources.gold.value", "system.resources.currency.gold"]
};

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
function sanitizeAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}
function primaryGM() { return game.users.filter((u) => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null; }
function isPrimaryGM() { return Boolean(game.user?.isGM && primaryGM()?.id === game.user.id); }
function settingValue(key, fallback) {
  try { return game.settings.get(MODULE_ID, key) ?? fallback; }
  catch (_) { return fallback; }
}

export function normalizeCasinoCurrency(value) {
  return CASINO_CURRENCY_OPTIONS.some((entry) => entry.id === value) ? value : "gp";
}
export function casinoCurrencyMeta(value) {
  const id = normalizeCasinoCurrency(value);
  return CASINO_CURRENCY_OPTIONS.find((entry) => entry.id === id) ?? CASINO_CURRENCY_OPTIONS[2];
}

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

export function hasOpenCasinoExposure(userId) {
  if (!userId) return false;
  const wallet = getCasinoWalletState();

  const blackjack = settingValue("blackjackState", {});
  const blackjackBet = Number(blackjack?.hands?.[userId]?.bet) || 0;
  if (["dealing", "players", "dealer"].includes(blackjack?.phase) && blackjackBet > 0) return true;
  if (blackjack?.phase === "finished" && wallet.settlement.blackjack?.armed && blackjackBet > 0) return true;

  const roulette = settingValue("rouletteState", {});
  const rouletteBet = Number(settingValue("rouletteBets", {})?.[userId]?.amount) || 0;
  if (roulette?.phase === "spinning" && rouletteBet > 0) return true;
  if (roulette?.phase === "settled" && wallet.settlement.roulette?.armed && rouletteBet > 0) return true;

  const beholdem = settingValue("beholdemState", {});
  const beholdemBet = Number(beholdem?.hands?.[userId]?.bet) || 0;
  if (["dealing", "preflop", "flop", "turn", "river"].includes(beholdem?.phase) && beholdemBet > 0) return true;
  if (beholdem?.phase === "showdown" && wallet.settlement.beholdem?.armed && beholdemBet > 0) return true;

  const dragon = settingValue("dragonDiceState", {});
  const dragonWager = settingValue("dragonDiceBets", {})?.[userId] ?? {};
  const dragonTotal = ["heart", "gold", "black", "heads", "perfect"].reduce((sum, key) => sum + (Number(dragonWager[key]) || 0), 0);
  if (dragon?.phase === "betting" && dragonTotal > 0) return true;
  if (dragon?.phase === "revealed" && wallet.settlement.dragonDice?.armed && dragonTotal > 0) return true;

  const liars = settingValue("liarsDiceState", {});
  const liarsWager = Number(settingValue("liarsDiceWagers", {})?.[userId]) || 0;
  if (["rolling", "active", "revealed", "between"].includes(liars?.phase) && liarsWager > 0) return true;
  if (liars?.phase === "finished" && wallet.settlement.liarsDice?.armed && liarsWager > 0) return true;

  return false;
}

async function saveWalletState(state) {
  const normalized = normalizeWalletState(state);
  await game.settings.set(MODULE_ID, CASINO_WALLET_SETTING, normalized);
  Hooks.callAll("cassinoooWalletUpdated", foundry.utils.deepClone(normalized));
  game.socket.emit(SOCKET_NAME, { type: "casino-wallet-updated" });
  return normalized;
}

function currencyInfo(actor, currencyId) {
  if (!actor) return null;
  const id = normalizeCasinoCurrency(currencyId);
  for (const basePath of CURRENCY_PATHS[id] ?? []) {
    const raw = foundry.utils.getProperty(actor, basePath);
    if (Number.isFinite(Number(raw))) return { path: basePath, value: Number(raw), id };
    if (raw && Number.isFinite(Number(raw.value))) return { path: `${basePath}.value`, value: Number(raw.value), id };
  }
  return null;
}

function linkedActor(userId) {
  const actor = game.users.get(userId)?.character;
  return actor?.update ? actor : null;
}

export async function changeCasinoCurrency(userId, currencyId, delta) {
  const actor = linkedActor(userId);
  const meta = casinoCurrencyMeta(currencyId);
  if (!actor) throw new Error("Vincule um personagem ao usuário antes de converter moeda do cassino.");
  const currency = currencyInfo(actor, meta.id);
  if (!currency) throw new Error(`Não encontrei um campo de ${meta.name} (${meta.label}) compatível na ficha vinculada.`);
  const next = roundMoney(currency.value + Number(delta || 0));
  if (next < 0) throw new Error(`O personagem possui apenas ${currency.value} ${meta.label}.`);
  await actor.update({ [currency.path]: next });
  return { actor, path: currency.path, previous: currency.value, next, currency: meta.id };
}

// Mantido para compatibilidade com código antigo que esperava ouro.
export async function changeCasinoGold(userId, delta) { return changeCasinoCurrency(userId, "gp", delta); }

function notifyUser(userId, message, level = "info") {
  game.socket.emit(SOCKET_NAME, { type: "casino-wallet-notify", userId, message, level });
  if (game.user?.id === userId) ui.notifications?.[level]?.(message);
}

export async function gmAddCasinoChips(userId, amount, currencyId) {
  if (!game.user?.isGM || !userId || !game.users.get(userId)) return false;
  const value = sanitizeAmount(amount);
  const meta = casinoCurrencyMeta(currencyId);
  if (value <= 0) return false;
  let currencyChange = null;
  try {
    currencyChange = await changeCasinoCurrency(userId, meta.id, -value);
    const state = getCasinoWalletState();
    state.balances[userId] = roundMoney((state.balances[userId] ?? 0) + value);
    await saveWalletState(state);
    notifyUser(userId, `O Mestre adicionou ${value} fichas por ${value} ${meta.label}. Saldo: ${state.balances[userId]} fichas.`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Falha ao adicionar fichas pelo caixa`, err);
    if (currencyChange) { try { await currencyChange.actor.update({ [currencyChange.path]: currencyChange.previous }); } catch (_) {} }
    ui.notifications?.error(err?.message ?? "Não foi possível adicionar as fichas.");
    notifyUser(userId, err?.message ?? "Não foi possível adicionar as fichas.", "error");
    return false;
  }
}

export async function gmWithdrawCasinoChips(userId, amount, currencyId) {
  if (!game.user?.isGM || !userId || !game.users.get(userId)) return false;
  if (hasOpenCasinoExposure(userId)) {
    ui.notifications?.warn("Esse jogador possui fichas comprometidas em uma aposta ativa. Aguarde a resolução antes do saque.");
    return false;
  }
  const value = sanitizeAmount(amount);
  const meta = casinoCurrencyMeta(currencyId);
  const state = getCasinoWalletState();
  const balance = roundMoney(state.balances[userId] ?? 0);
  if (value <= 0) return false;
  if (value > balance) {
    ui.notifications?.warn(`${game.users.get(userId)?.name ?? "Jogador"} possui apenas ${balance} fichas.`);
    return false;
  }
  let currencyChange = null;
  try {
    currencyChange = await changeCasinoCurrency(userId, meta.id, value);
    state.balances[userId] = roundMoney(balance - value);
    await saveWalletState(state);
    notifyUser(userId, `O Mestre sacou ${value} fichas como ${value} ${meta.label}. Saldo: ${state.balances[userId]} fichas.`);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Falha ao sacar fichas pelo caixa`, err);
    if (currencyChange) { try { await currencyChange.actor.update({ [currencyChange.path]: currencyChange.previous }); } catch (_) {} }
    ui.notifications?.error(err?.message ?? "Não foi possível sacar as fichas.");
    notifyUser(userId, err?.message ?? "Não foi possível sacar as fichas.", "error");
    return false;
  }
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
  }
}

function supportedWalletApp(app) {
  return new Set(["BlackjackTable", "RouletteTable", "BeholdemTable", "DragonDiceTable", "LiarsDiceTable"]).has(app?.constructor?.name);
}

export async function attachCasinoWalletControls(app) {
  if (!game.user?.id || !app?.element || !supportedWalletApp(app)) return;
  if (app.element.querySelector(".cassinooo-wallet-bar")) return;

  const host = app.element.querySelector(".cassinooo-table-header") ?? app.element.querySelector(".window-content") ?? app.element;
  const bar = document.createElement("div");
  bar.className = `cassinooo-wallet-bar ${game.user.isGM ? "gm-cashier" : "player-wallet"}`;

  if (!game.user.isGM) {
    const balance = getCasinoWalletBalance(game.user.id);
    bar.innerHTML = `<span class="cassinooo-wallet-label"><i class="fa-solid fa-coins"></i> Fichas</span><strong class="cassinooo-wallet-balance">${balance}</strong><small>Câmbio administrado pelo Mestre</small>`;
    host.append(bar);
    return;
  }

  const players = game.users.filter((user) => !user.isGM);
  bar.innerHTML = `
    <span class="cassinooo-wallet-label"><i class="fa-solid fa-cash-register"></i> Caixa</span>
    <select data-cassinooo-cashier-player aria-label="Jogador">
      <option value="">— Jogador —</option>
      ${players.map((user) => `<option value="${user.id}">${user.name} · ${getCasinoWalletBalance(user.id)} fichas</option>`).join("")}
    </select>
    <input type="number" min="1" step="1" value="10" data-cassinooo-cashier-amount aria-label="Quantidade de fichas">
    <select data-cassinooo-cashier-currency aria-label="Moeda">
      ${CASINO_CURRENCY_OPTIONS.map((entry) => `<option value="${entry.id}">${entry.label} · ${entry.name}</option>`).join("")}
    </select>
    <button type="button" data-cassinooo-cashier-add><i class="fa-solid fa-plus"></i> Adicionar</button>
    <button type="button" data-cassinooo-cashier-withdraw><i class="fa-solid fa-sack-dollar"></i> Sacar</button>`;
  host.append(bar);

  const selected = () => {
    const userId = bar.querySelector("[data-cassinooo-cashier-player]")?.value ?? "";
    const amount = sanitizeAmount(bar.querySelector("[data-cassinooo-cashier-amount]")?.value);
    const currencyId = normalizeCasinoCurrency(bar.querySelector("[data-cassinooo-cashier-currency]")?.value);
    return { userId, amount, currencyId, user: game.users.get(userId), meta: casinoCurrencyMeta(currencyId) };
  };
  const { DialogV2 } = foundry.applications.api;

  bar.querySelector("[data-cassinooo-cashier-add]")?.addEventListener("click", async () => {
    const data = selected();
    if (!data.userId || data.amount <= 0) { ui.notifications?.warn("Escolha o jogador e informe a quantidade de fichas."); return; }
    const content = `<p>Adicionar <strong>${data.amount} fichas</strong> para <strong>${data.user?.name ?? "Jogador"}</strong> cobrando <strong>${data.amount} ${data.meta.label}</strong> da ficha vinculada?</p>`;
    const confirmed = DialogV2?.confirm ? await DialogV2.confirm({ window: { title: "Adicionar fichas" }, content }) : window.confirm(`Cobrar ${data.amount} ${data.meta.label} e adicionar ${data.amount} fichas?`);
    if (confirmed) await gmAddCasinoChips(data.userId, data.amount, data.currencyId);
  });

  bar.querySelector("[data-cassinooo-cashier-withdraw]")?.addEventListener("click", async () => {
    const data = selected();
    if (!data.userId || data.amount <= 0) { ui.notifications?.warn("Escolha o jogador e informe quantas fichas serão sacadas."); return; }
    const content = `<p>Sacar <strong>${data.amount} fichas</strong> de <strong>${data.user?.name ?? "Jogador"}</strong> e devolver <strong>${data.amount} ${data.meta.label}</strong> para a ficha vinculada?</p>`;
    const confirmed = DialogV2?.confirm ? await DialogV2.confirm({ window: { title: "Sacar fichas" }, content }) : window.confirm(`Sacar ${data.amount} fichas como ${data.amount} ${data.meta.label}?`);
    if (confirmed) await gmWithdrawCasinoChips(data.userId, data.amount, data.currencyId);
  });
}
