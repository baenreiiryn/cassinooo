import { MODULE_ID, SOCKET_NAME } from "./state.js";

export const BEHOLDEM_STATE_SETTING = "beholdemState";
export const BEHOLDEM_SEATS_SETTING = "beholdemSeats";
const EMPTY_SEATS = { 0: "", 1: "", 2: "", 3: "", 4: "", 5: "" };

function emptyState() {
  return {
    phase: "idle",
    deck: [],
    hands: {},
    community: [],
    dealerButtonSeat: 0,
    message: "Aguardando o Mestre iniciar uma mão."
  };
}

function buildDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  return suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
}
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function registerBeholdemSettings() {
  game.settings.register(MODULE_ID, BEHOLDEM_STATE_SETTING, { name: "Estado do Beholdem", scope: "world", config: false, type: Object, default: emptyState() });
  game.settings.register(MODULE_ID, BEHOLDEM_SEATS_SETTING, { name: "Assentos do Beholdem", scope: "world", config: false, type: Object, default: EMPTY_SEATS });
}

export function getBeholdemState() { return foundry.utils.deepClone(game.settings.get(MODULE_ID, BEHOLDEM_STATE_SETTING) ?? emptyState()); }
export function getBeholdemSeats() {
  const stored = game.settings.get(MODULE_ID, BEHOLDEM_SEATS_SETTING) ?? EMPTY_SEATS;
  return Array.from({ length: 6 }, (_, index) => stored[index] ?? "");
}

async function saveState(state) {
  await game.settings.set(MODULE_ID, BEHOLDEM_STATE_SETTING, state);
  Hooks.callAll("cassinoooBeholdemUpdated", foundry.utils.deepClone(state));
  game.socket.emit(SOCKET_NAME, { type: "beholdem-updated" });
  return state;
}

export async function assignBeholdemSeat(index, userId) {
  if (!game.user?.isGM || !Number.isInteger(index) || index < 0 || index > 5 || (userId && !game.users.get(userId))) return false;
  const seats = getBeholdemSeats();
  if (userId) for (let i = 0; i < seats.length; i++) if (i !== index && seats[i] === userId) seats[i] = "";
  seats[index] = userId || "";
  await game.settings.set(MODULE_ID, BEHOLDEM_SEATS_SETTING, Object.fromEntries(seats.map((id, i) => [i, id])));
  game.socket.emit(SOCKET_NAME, { type: "beholdem-seats-updated" });
  return true;
}

export async function startBeholdemHand() {
  if (!game.user?.isGM) return false;
  const occupied = getBeholdemSeats().map((userId, seatIndex) => ({ userId, seatIndex })).filter(({ userId }) => Boolean(userId && game.users.get(userId)));
  if (occupied.length < 2) {
    ui.notifications?.warn("Defina pelo menos dois jogadores para iniciar o Beholdem.");
    return false;
  }
  const state = emptyState();
  state.phase = "preflop";
  state.deck = shuffle(buildDeck());
  for (const { userId, seatIndex } of occupied) state.hands[userId] = { userId, seatIndex, cards: [] };
  for (let round = 0; round < 2; round++) {
    for (const { userId } of occupied) state.hands[userId].cards.push(state.deck.pop());
  }
  state.message = "Pré-flop: duas cartas foram distribuídas para cada jogador.";
  return saveState(state);
}

function burn(state) { if (state.deck.length) state.deck.pop(); }
export async function dealFlop() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (state.phase !== "preflop") return false;
  burn(state); state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
  state.phase = "flop"; state.message = "Flop aberto."; return saveState(state);
}
export async function dealTurn() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (state.phase !== "flop") return false;
  burn(state); state.community.push(state.deck.pop()); state.phase = "turn"; state.message = "Turn aberto."; return saveState(state);
}
export async function dealRiver() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (state.phase !== "turn") return false;
  burn(state); state.community.push(state.deck.pop()); state.phase = "river"; state.message = "River aberto."; return saveState(state);
}
export async function revealShowdown() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (!['river','showdown'].includes(state.phase)) return false;
  state.phase = "showdown"; state.message = "Showdown: todas as cartas dos jogadores foram reveladas."; return saveState(state);
}
export async function resetBeholdem() { if (!game.user?.isGM) return false; await saveState(emptyState()); return true; }
export async function handleBeholdemSocket(message) { return; }
