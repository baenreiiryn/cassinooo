import { MODULE_ID, SOCKET_NAME } from "./state.js";

export const BEHOLDEM_STATE_SETTING = "beholdemState";
export const BEHOLDEM_SEATS_SETTING = "beholdemSeats";
export const BEHOLDEM_WAGERS_SETTING = "beholdemWagers";
const EMPTY_SEATS = { 0: "", 1: "", 2: "", 3: "", 4: "", 5: "" };
const DEAL_DELAY = 520;

// Physical seat indices ordered visually from right to left.
// This same order drives labels Lugar 1..6 and the turn carousel.
export const BEHOLDEM_VISUAL_SEAT_ORDER = [5, 1, 4, 3, 2, 0];

function sleep(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function emptyState() {
  return {
    phase: "idle",
    deck: [],
    hands: {},
    community: [],
    turnOrder: [],
    activeTurn: -1,
    activeSeatIndex: null,
    roundComplete: false,
    lastAnimation: null,
    roundResults: [],
    pot: 0,
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
function sanitizeBet(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function registerBeholdemSettings() {
  game.settings.register(MODULE_ID, BEHOLDEM_STATE_SETTING, { name: "Estado do Beholdem", scope: "world", config: false, type: Object, default: emptyState() });
  game.settings.register(MODULE_ID, BEHOLDEM_SEATS_SETTING, { name: "Assentos do Beholdem", scope: "world", config: false, type: Object, default: EMPTY_SEATS });
  game.settings.register(MODULE_ID, BEHOLDEM_WAGERS_SETTING, { name: "Apostas do Beholdem", scope: "world", config: false, type: Object, default: {} });
}

export function getBeholdemState() { return foundry.utils.deepClone(game.settings.get(MODULE_ID, BEHOLDEM_STATE_SETTING) ?? emptyState()); }
export function getBeholdemSeats() {
  const stored = game.settings.get(MODULE_ID, BEHOLDEM_SEATS_SETTING) ?? EMPTY_SEATS;
  return Array.from({ length: 6 }, (_, index) => stored[index] ?? "");
}
export function getBeholdemWagers() { return foundry.utils.deepClone(game.settings.get(MODULE_ID, BEHOLDEM_WAGERS_SETTING) ?? {}); }

async function saveState(state) {
  await game.settings.set(MODULE_ID, BEHOLDEM_STATE_SETTING, state);
  Hooks.callAll("cassinoooBeholdemUpdated", foundry.utils.deepClone(state));
  game.socket.emit(SOCKET_NAME, { type: "beholdem-updated" });
  return state;
}
async function saveWagers(wagers) {
  await game.settings.set(MODULE_ID, BEHOLDEM_WAGERS_SETTING, wagers);
  Hooks.callAll("cassinoooBeholdemUpdated", getBeholdemState());
  game.socket.emit(SOCKET_NAME, { type: "beholdem-updated" });
}

function primaryGM() {
  return game.users.filter((u) => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}
function isPrimaryGM() { return Boolean(game.user?.isGM && primaryGM()?.id === game.user.id); }

export async function assignBeholdemSeat(index, userId) {
  if (!game.user?.isGM || !Number.isInteger(index) || index < 0 || index > 5 || (userId && !game.users.get(userId))) return false;
  if (getBeholdemState().phase !== "idle") return false;
  const seats = getBeholdemSeats();
  if (userId) for (let i = 0; i < seats.length; i++) if (i !== index && seats[i] === userId) seats[i] = "";
  seats[index] = userId || "";
  await game.settings.set(MODULE_ID, BEHOLDEM_SEATS_SETTING, Object.fromEntries(seats.map((id, i) => [i, id])));
  game.socket.emit(SOCKET_NAME, { type: "beholdem-seats-updated" });
  return true;
}

async function applyWager(userId, value) {
  if (getBeholdemState().phase !== "idle") return false;
  if (!game.users.get(userId)) return false;
  const wagers = getBeholdemWagers();
  wagers[userId] = sanitizeBet(value);
  await saveWagers(wagers);
  return true;
}
export async function requestBeholdemWagerChange(userId, value) {
  if (!userId) return false;
  if (game.user?.isGM) return applyWager(userId, value);
  if (game.user?.id !== userId) return false;
  game.socket.emit(SOCKET_NAME, { type: "beholdem-wager", userId, value: sanitizeBet(value) });
  return true;
}

async function animateState(state, animation, message) {
  state.lastAnimation = { nonce: `${Date.now()}-${Math.random()}`, ...animation };
  if (message) state.message = message;
  await saveState(state);
  await sleep(DEAL_DELAY);
}

function setActiveTurn(state, index) {
  state.activeTurn = index;
  const userId = state.turnOrder[index];
  const hand = userId ? state.hands[userId] : null;
  state.activeSeatIndex = hand?.seatIndex ?? null;
  state.roundComplete = false;
  if (hand) state.message = `Turno de ${game.users.get(userId)?.name ?? "Jogador"}.`;
}
function beginBettingRound(state, message) {
  state.activeTurn = -1;
  state.activeSeatIndex = null;
  state.roundComplete = false;
  state.lastAnimation = null;
  if (!state.turnOrder.length) return;
  setActiveTurn(state, 0);
  state.message = message || state.message;
}

export async function advanceBeholdemTurn() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (!["preflop", "flop", "turn", "river"].includes(state.phase) || state.roundComplete) return false;
  const next = state.activeTurn + 1;
  if (next < state.turnOrder.length) {
    setActiveTurn(state, next);
    return saveState(state);
  }
  state.activeTurn = -1;
  state.activeSeatIndex = null;
  state.roundComplete = true;
  const nextLabel = state.phase === "preflop" ? "Flop" : state.phase === "flop" ? "Turn" : state.phase === "turn" ? "River" : "Showdown";
  state.message = `Rodada de ação concluída. O Mestre pode abrir o ${nextLabel}.`;
  return saveState(state);
}

export async function startBeholdemHand() {
  if (!game.user?.isGM) return false;
  const seats = getBeholdemSeats();
  const occupied = BEHOLDEM_VISUAL_SEAT_ORDER
    .map((seatIndex) => ({ userId: seats[seatIndex], seatIndex }))
    .filter(({ userId }) => Boolean(userId && game.users.get(userId)));

  if (occupied.length < 2) {
    ui.notifications?.warn("Defina pelo menos dois jogadores para iniciar o Beholdem.");
    return false;
  }
  const wagers = getBeholdemWagers();
  const state = emptyState();
  state.phase = "dealing";
  state.deck = shuffle(buildDeck());
  for (const { userId, seatIndex } of occupied) {
    const bet = sanitizeBet(wagers[userId]);
    state.hands[userId] = { userId, seatIndex, cards: [], bet, bestHand: "", roundDelta: 0 };
    state.turnOrder.push(userId);
    state.pot += bet;
  }
  await saveState(state);

  for (let round = 0; round < 2; round++) {
    for (const userId of state.turnOrder) {
      const hand = state.hands[userId];
      const card = state.deck.pop();
      hand.cards.push(card);
      await animateState(state, { type: "deal-hole", seatIndex: hand.seatIndex, card }, `Distribuindo para ${game.users.get(userId)?.name ?? "Jogador"}...`);
    }
  }
  state.phase = "preflop";
  beginBettingRound(state, `Pré-flop. Pote inicial: ${state.pot} PO.`);
  return saveState(state);
}

function burn(state) { if (state.deck.length) state.deck.pop(); }
async function dealCommunityCards(state, count, phase, label) {
  burn(state);
  for (let i = 0; i < count; i++) {
    const card = state.deck.pop();
    state.community.push(card);
    await animateState(state, { type: "deal-community", communityIndex: state.community.length - 1, card }, `${label}: abrindo ${card.rank}${card.suit}...`);
  }
  state.phase = phase;
  beginBettingRound(state, `${label} aberto. Turno de ${game.users.get(state.turnOrder[0])?.name ?? "Jogador"}.`);
  return saveState(state);
}

export async function dealFlop() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (state.phase !== "preflop" || !state.roundComplete) return false;
  return dealCommunityCards(state, 3, "flop", "Flop");
}
export async function dealTurn() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (state.phase !== "flop" || !state.roundComplete) return false;
  return dealCommunityCards(state, 1, "turn", "Turn");
}
export async function dealRiver() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (state.phase !== "turn" || !state.roundComplete) return false;
  return dealCommunityCards(state, 1, "river", "River");
}

const RANK_VALUE = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13,A:14 };
function combinations(cards, choose = 5) {
  const out = [];
  const walk = (start, chosen) => {
    if (chosen.length === choose) { out.push(chosen.slice()); return; }
    for (let i = start; i <= cards.length - (choose - chosen.length); i++) {
      chosen.push(cards[i]); walk(i + 1, chosen); chosen.pop();
    }
  };
  walk(0, []);
  return out;
}
function evaluateFive(cards) {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a,b) => b-a);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a,b) => b[1]-a[1] || b[0]-a[0]);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const unique = [...new Set(values)];
  if (unique[0] === 14) unique.push(1);
  let straightHigh = 0;
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i+4] === 4) { straightHigh = unique[i]; break; }
  }
  if (flush && straightHigh) return { score:[8,straightHigh], name: straightHigh === 14 ? "Royal Flush" : "Straight Flush" };
  if (groups[0][1] === 4) return { score:[7,groups[0][0],groups[1][0]], name:"Quadra" };
  if (groups[0][1] === 3 && groups[1]?.[1] === 2) return { score:[6,groups[0][0],groups[1][0]], name:"Full House" };
  if (flush) return { score:[5,...values], name:"Flush" };
  if (straightHigh) return { score:[4,straightHigh], name:"Sequência" };
  if (groups[0][1] === 3) return { score:[3,groups[0][0],...groups.slice(1).map((g)=>g[0]).sort((a,b)=>b-a)], name:"Trinca" };
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a,b)=>b-a);
    const kicker = groups.find((g)=>g[1]===1)?.[0] ?? 0;
    return { score:[2,...pairs,kicker], name:"Dois Pares" };
  }
  if (groups[0][1] === 2) return { score:[1,groups[0][0],...groups.slice(1).map((g)=>g[0]).sort((a,b)=>b-a)], name:"Par" };
  return { score:[0,...values], name:"Carta Alta" };
}
function compareScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}
function bestOfSeven(cards) {
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const evaluated = evaluateFive(combo);
    if (!best || compareScore(evaluated.score, best.score) > 0) best = evaluated;
  }
  return best ?? { score:[0], name:"Sem mão" };
}

export async function revealShowdown() {
  if (!game.user?.isGM) return false;
  const state = getBeholdemState();
  if (state.phase !== "river" || !state.roundComplete) return false;

  let bestScore = null;
  let winners = [];
  for (const hand of Object.values(state.hands)) {
    const best = bestOfSeven([...hand.cards, ...state.community]);
    hand.bestHand = best.name;
    hand.bestScore = best.score;
    if (!bestScore || compareScore(best.score, bestScore) > 0) { bestScore = best.score; winners = [hand.userId]; }
    else if (compareScore(best.score, bestScore) === 0) winners.push(hand.userId);
  }

  const share = winners.length ? state.pot / winners.length : 0;
  state.roundResults = Object.values(state.hands).map((hand) => {
    const won = winners.includes(hand.userId);
    hand.roundDelta = won ? share - hand.bet : -hand.bet;
    return {
      userId: hand.userId,
      name: game.users.get(hand.userId)?.name ?? "Jogador",
      bet: hand.bet,
      handName: hand.bestHand,
      delta: hand.roundDelta,
      winner: won
    };
  });
  state.phase = "showdown";
  state.activeTurn = -1;
  state.activeSeatIndex = null;
  state.roundComplete = true;
  state.lastAnimation = { nonce: `${Date.now()}-${Math.random()}`, type: "showdown" };
  state.message = winners.length > 1 ? `Empate: ${winners.length} jogadores dividem o pote de ${state.pot} PO.` : `${game.users.get(winners[0])?.name ?? "Jogador"} venceu o pote de ${state.pot} PO.`;
  return saveState(state);
}

export async function resetBeholdem() { if (!game.user?.isGM) return false; await saveState(emptyState()); return true; }
export async function handleBeholdemSocket(message) {
  if (!message) return;
  if (message.type === "beholdem-wager" && isPrimaryGM()) await applyWager(message.userId, message.value);
}
