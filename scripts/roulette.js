import { MODULE_ID, SOCKET_NAME } from "./state.js";

export const ROULETTE_STATE_SETTING = "rouletteState";
export const ROULETTE_SEATS_SETTING = "rouletteSeats";
export const ROULETTE_BETS_SETTING = "rouletteBets";
export const ROULETTE_SPIN_DURATION = 4300;

const EMPTY_SEATS = { 0: "", 1: "", 2: "", 3: "", 4: "", 5: "" };
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
let recoveryTimer = null;

function emptyState() {
  return {
    phase: "idle",
    result: null,
    spinNonce: null,
    spinStartedAt: null,
    roundResults: [],
    message: "Aguardando o Mestre girar a roleta."
  };
}

function sleep(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function primaryGM() { return game.users.filter((u) => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null; }
function isPrimaryGM() { return Boolean(game.user?.isGM && primaryGM()?.id === game.user.id); }
function sanitizeAmount(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }

export function getRouletteBetOptions() {
  const numberOptions = Array.from({ length: 37 }, (_, number) => ({ value: `number:${number}`, label: `Número ${number}` }));
  return [
    ...numberOptions,
    { value: "dozen:1", label: "1st 12 (1–12)" }, { value: "dozen:2", label: "2nd 12 (13–24)" }, { value: "dozen:3", label: "3rd 12 (25–36)" },
    { value: "low", label: "1–18" }, { value: "even", label: "Par" }, { value: "red", label: "Vermelho" }, { value: "black", label: "Preto" }, { value: "odd", label: "Ímpar" }, { value: "high", label: "19–36" }
  ];
}
function betLabel(type) { return getRouletteBetOptions().find((option) => option.value === type)?.label ?? "Sem aposta"; }
function evaluateBet(type, result) {
  if (!type) return { win: false, multiplier: 0 };
  if (type.startsWith("number:")) return { win: result === Number(type.split(":")[1]), multiplier: 35 };
  if (type.startsWith("dozen:")) {
    const ranges = { 1: [1, 12], 2: [13, 24], 3: [25, 36] };
    const [min, max] = ranges[Number(type.split(":")[1])] ?? [99, 98];
    return { win: result >= min && result <= max, multiplier: 2 };
  }
  if (result === 0) return { win: false, multiplier: 1 };
  if (type === "low") return { win: result >= 1 && result <= 18, multiplier: 1 };
  if (type === "high") return { win: result >= 19 && result <= 36, multiplier: 1 };
  if (type === "even") return { win: result % 2 === 0, multiplier: 1 };
  if (type === "odd") return { win: result % 2 === 1, multiplier: 1 };
  if (type === "red") return { win: RED.has(result), multiplier: 1 };
  if (type === "black") return { win: !RED.has(result), multiplier: 1 };
  return { win: false, multiplier: 0 };
}

export function registerRouletteSettings() {
  game.settings.register(MODULE_ID, ROULETTE_STATE_SETTING, { name: "Estado da Roleta", scope: "world", config: false, type: Object, default: emptyState() });
  game.settings.register(MODULE_ID, ROULETTE_SEATS_SETTING, { name: "Assentos da Roleta", scope: "world", config: false, type: Object, default: EMPTY_SEATS });
  game.settings.register(MODULE_ID, ROULETTE_BETS_SETTING, { name: "Apostas da Roleta", scope: "world", config: false, type: Object, default: {} });
}
export function getRouletteState() { return foundry.utils.deepClone(game.settings.get(MODULE_ID, ROULETTE_STATE_SETTING) ?? emptyState()); }
export function getRouletteSeats() { const stored = game.settings.get(MODULE_ID, ROULETTE_SEATS_SETTING) ?? EMPTY_SEATS; return Array.from({ length: 6 }, (_, index) => stored[index] ?? ""); }
export function getRouletteBets() { return foundry.utils.deepClone(game.settings.get(MODULE_ID, ROULETTE_BETS_SETTING) ?? {}); }

export async function assignRouletteSeat(index, userId) {
  if (!game.user?.isGM || !Number.isInteger(index) || index < 0 || index > 5 || (userId && !game.users.get(userId))) return false;
  const seats = getRouletteSeats();
  if (userId) for (let i = 0; i < seats.length; i++) if (i !== index && seats[i] === userId) seats[i] = "";
  seats[index] = userId || "";
  await game.settings.set(MODULE_ID, ROULETTE_SEATS_SETTING, Object.fromEntries(seats.map((id, i) => [i, id])));
  game.socket.emit(SOCKET_NAME, { type: "roulette-seats-updated" });
  return true;
}

async function saveState(state) {
  await game.settings.set(MODULE_ID, ROULETTE_STATE_SETTING, state);
  Hooks.callAll("cassinoooRouletteUpdated", foundry.utils.deepClone(state));
  game.socket.emit(SOCKET_NAME, { type: "roulette-updated" });
  return state;
}
async function saveBets(bets) { await game.settings.set(MODULE_ID, ROULETTE_BETS_SETTING, bets); Hooks.callAll("cassinoooRouletteUpdated", getRouletteState()); game.socket.emit(SOCKET_NAME, { type: "roulette-updated" }); }
async function applyBet(userId, type, amount) {
  if (getRouletteState().phase === "spinning" || !game.users.get(userId)) return false;
  const validTypes = new Set(getRouletteBetOptions().map((option) => option.value));
  const bets = getRouletteBets(); bets[userId] = { type: validTypes.has(type) ? type : "", amount: sanitizeAmount(amount) }; await saveBets(bets); return true;
}
export async function requestRouletteBetChange(userId, type, amount) {
  if (!userId) return false;
  if (game.user?.isGM) return applyBet(userId, type, amount);
  if (game.user?.id !== userId) return false;
  game.socket.emit(SOCKET_NAME, { type: "roulette-bet", userId, betType: type, amount: sanitizeAmount(amount) }); return true;
}

function settleRound(result) {
  const bets = getRouletteBets(), seats = getRouletteSeats(), roundResults = [];
  for (const userId of seats.filter(Boolean)) {
    const user = game.users.get(userId); if (!user) continue;
    const bet = bets[userId] ?? { type: "", amount: 0 }, amount = sanitizeAmount(bet.amount), evaluation = evaluateBet(bet.type, result);
    const delta = amount <= 0 ? 0 : evaluation.win ? amount * evaluation.multiplier : -amount;
    roundResults.push({ userId, name: user.name, betType: bet.type, betLabel: betLabel(bet.type), amount, delta, won: delta > 0, lost: delta < 0 });
  }
  return roundResults;
}

async function settleSpinIfCurrent(nonce) {
  const state = getRouletteState();
  if (state.phase !== "spinning" || state.spinNonce !== nonce || !Number.isInteger(state.result)) return false;
  state.phase = "settled";
  state.roundResults = settleRound(state.result);
  state.message = `A bola parou no número ${state.result}.`;
  state.spinStartedAt = null;
  await saveState(state);
  return true;
}

export async function recoverRouletteSpin() {
  if (!isPrimaryGM()) return false;
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null; }
  const state = getRouletteState();
  if (state.phase !== "spinning" || !state.spinNonce) return false;
  const startedAt = Number(state.spinStartedAt) || 0;
  const elapsed = startedAt ? Date.now() - startedAt : ROULETTE_SPIN_DURATION;
  const remaining = Math.max(0, ROULETTE_SPIN_DURATION - elapsed);
  if (remaining <= 0) return settleSpinIfCurrent(state.spinNonce);
  recoveryTimer = window.setTimeout(() => { recoveryTimer = null; void settleSpinIfCurrent(state.spinNonce); }, remaining);
  return true;
}

export async function spinRoulette() {
  if (!game.user?.isGM || getRouletteState().phase === "spinning") return false;
  const state = { phase: "spinning", result: Math.floor(Math.random() * 37), spinNonce: `${Date.now()}-${Math.random()}`, spinStartedAt: Date.now(), roundResults: [], message: "A roleta está girando..." };
  await saveState(state);
  if (isPrimaryGM()) {
    await sleep(ROULETTE_SPIN_DURATION);
    await settleSpinIfCurrent(state.spinNonce);
  }
  return true;
}
export async function resetRoulette() {
  if (!game.user?.isGM) return false;
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null; }
  await saveState(emptyState()); return true;
}
export async function handleRouletteSocket(message) { if (message?.type === "roulette-bet" && isPrimaryGM()) await applyBet(message.userId, message.betType, message.amount); }
