import { MODULE_ID, SOCKET_NAME } from "./state.js";

export const ROULETTE_STATE_SETTING = "rouletteState";
export const ROULETTE_SEATS_SETTING = "rouletteSeats";
const SPIN_DURATION = 4300;

const EMPTY_SEATS = { 0: "", 1: "", 2: "", 3: "", 4: "", 5: "" };

function emptyState() {
  return {
    phase: "idle",
    result: null,
    spinNonce: null,
    message: "Aguardando o Mestre girar a roleta."
  };
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function registerRouletteSettings() {
  game.settings.register(MODULE_ID, ROULETTE_STATE_SETTING, {
    name: "Estado da Roleta",
    scope: "world",
    config: false,
    type: Object,
    default: emptyState()
  });

  game.settings.register(MODULE_ID, ROULETTE_SEATS_SETTING, {
    name: "Assentos da Roleta",
    scope: "world",
    config: false,
    type: Object,
    default: EMPTY_SEATS
  });
}

export function getRouletteState() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, ROULETTE_STATE_SETTING) ?? emptyState());
}

export function getRouletteSeats() {
  const stored = game.settings.get(MODULE_ID, ROULETTE_SEATS_SETTING) ?? EMPTY_SEATS;
  return Array.from({ length: 6 }, (_, index) => stored[index] ?? "");
}

export async function assignRouletteSeat(index, userId) {
  if (!game.user?.isGM) return false;
  if (!Number.isInteger(index) || index < 0 || index > 5) return false;
  if (userId && !game.users.get(userId)) return false;

  const seats = getRouletteSeats();
  if (userId) {
    for (let i = 0; i < seats.length; i += 1) {
      if (i !== index && seats[i] === userId) seats[i] = "";
    }
  }
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

export async function spinRoulette() {
  if (!game.user?.isGM) return false;
  const current = getRouletteState();
  if (current.phase === "spinning") return false;

  const result = Math.floor(Math.random() * 37);
  const state = {
    phase: "spinning",
    result,
    spinNonce: `${Date.now()}-${Math.random()}`,
    message: "A roleta está girando..."
  };
  await saveState(state);
  await sleep(SPIN_DURATION);

  const settled = getRouletteState();
  if (settled.spinNonce !== state.spinNonce) return false;
  settled.phase = "settled";
  settled.message = `A bola parou no número ${result}.`;
  await saveState(settled);
  return true;
}

export async function resetRoulette() {
  if (!game.user?.isGM) return false;
  await saveState(emptyState());
  return true;
}

export async function handleRouletteSocket(message) {
  if (!message) return;
}
