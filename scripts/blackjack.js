import { MODULE_ID, SOCKET_NAME, getSeats } from "./state.js";

export const BLACKJACK_SETTING = "blackjackState";

function emptyGameState() {
  return {
    phase: "idle",
    deck: [],
    dealer: { cards: [], score: 0 },
    hands: {},
    message: "Aguardando o Mestre iniciar uma rodada."
  };
}

export function registerBlackjackSetting() {
  game.settings.register(MODULE_ID, BLACKJACK_SETTING, {
    name: "Estado da mesa de Blackjack",
    scope: "world",
    config: false,
    type: Object,
    default: emptyGameState()
  });
}

export function getBlackjackState() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, BLACKJACK_SETTING) ?? emptyGameState());
}

async function saveState(state) {
  await game.settings.set(MODULE_ID, BLACKJACK_SETTING, state);
  game.socket.emit(SOCKET_NAME, { type: "blackjack-updated" });
  return state;
}

function buildDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) deck.push({ rank, suit });
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function scoreHand(cards = []) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === "A") {
      total += 11;
      aces += 1;
    } else if (["J", "Q", "K"].includes(card.rank)) total += 10;
    else total += Number(card.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function draw(state) {
  if (!state.deck.length) state.deck = shuffle(buildDeck());
  return state.deck.pop();
}

function primaryGM() {
  return game.users
    .filter((user) => user.isGM && user.active)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

export function isPrimaryGM() {
  const gm = primaryGM();
  return Boolean(game.user?.isGM && gm?.id === game.user.id);
}

function makeHand(userId, seatIndex) {
  return {
    userId,
    seatIndex,
    cards: [],
    score: 0,
    status: "playing",
    result: ""
  };
}

function updateHandScore(hand) {
  hand.score = scoreHand(hand.cards);
  if (hand.score > 21) {
    hand.status = "bust";
    hand.result = "Estourou";
  } else if (hand.score === 21) {
    hand.status = "standing";
    if (hand.cards.length === 2) hand.result = "Blackjack!";
  }
}

function allPlayersFinished(state) {
  return Object.values(state.hands).every((hand) => hand.status !== "playing");
}

async function finishDealerAndRound(state) {
  state.phase = "dealer";
  state.message = "O Dealer está jogando...";

  state.dealer.score = scoreHand(state.dealer.cards);
  while (state.dealer.score < 17) {
    state.dealer.cards.push(draw(state));
    state.dealer.score = scoreHand(state.dealer.cards);
  }

  const dealerBust = state.dealer.score > 21;
  const dealerBlackjack = state.dealer.score === 21 && state.dealer.cards.length === 2;

  for (const hand of Object.values(state.hands)) {
    hand.score = scoreHand(hand.cards);
    const playerBlackjack = hand.score === 21 && hand.cards.length === 2;

    if (hand.score > 21) hand.result = "Derrota — estourou";
    else if (playerBlackjack && !dealerBlackjack) hand.result = "Vitória — Blackjack!";
    else if (!playerBlackjack && dealerBlackjack) hand.result = "Derrota — Blackjack do Dealer";
    else if (dealerBust) hand.result = "Vitória — Dealer estourou";
    else if (hand.score > state.dealer.score) hand.result = "Vitória";
    else if (hand.score < state.dealer.score) hand.result = "Derrota";
    else hand.result = "Empate";

    hand.status = "finished";
  }

  state.phase = "finished";
  state.message = dealerBust
    ? `Dealer estourou com ${state.dealer.score}. Rodada encerrada.`
    : `Dealer parou em ${state.dealer.score}. Rodada encerrada.`;

  return saveState(state);
}

export async function startRound() {
  if (!game.user?.isGM) return false;

  const seatIds = getSeats();
  const occupied = seatIds
    .map((userId, seatIndex) => ({ userId, seatIndex }))
    .filter(({ userId }) => Boolean(userId && game.users.get(userId)));

  if (!occupied.length) {
    ui.notifications?.warn("Defina pelo menos um jogador em um assento antes de distribuir as cartas.");
    return false;
  }

  const state = emptyGameState();
  state.phase = "players";
  state.deck = shuffle(buildDeck());
  state.message = "Cartas distribuídas. Jogadores: pedir ou parar.";

  for (const { userId, seatIndex } of occupied) state.hands[userId] = makeHand(userId, seatIndex);

  for (let round = 0; round < 2; round += 1) {
    for (const hand of Object.values(state.hands)) hand.cards.push(draw(state));
    state.dealer.cards.push(draw(state));
  }

  for (const hand of Object.values(state.hands)) updateHandScore(hand);
  state.dealer.score = scoreHand(state.dealer.cards);

  if (allPlayersFinished(state)) return finishDealerAndRound(state);
  await saveState(state);
  return true;
}

export async function resetRound() {
  if (!game.user?.isGM) return false;
  await saveState(emptyGameState());
  return true;
}

async function applyPlayerAction({ userId, action }) {
  const state = getBlackjackState();
  if (state.phase !== "players") return false;

  const hand = state.hands[userId];
  if (!hand || hand.status !== "playing") return false;

  if (action === "hit") {
    hand.cards.push(draw(state));
    updateHandScore(hand);
  } else if (action === "stand") {
    hand.status = "standing";
    hand.result = hand.result || "Parou";
  } else return false;

  if (allPlayersFinished(state)) return finishDealerAndRound(state);
  await saveState(state);
  return true;
}

export async function handleBlackjackSocket(message) {
  if (!message) return;

  if (message.type === "blackjack-action" && isPrimaryGM()) {
    const user = game.users.get(message.userId);
    if (!user) return;
    await applyPlayerAction({ userId: message.userId, action: message.action });
  }
}

export async function requestPlayerAction(action) {
  const state = getBlackjackState();
  const hand = state.hands[game.user.id];
  if (!hand || hand.status !== "playing" || state.phase !== "players") return false;

  if (game.user.isGM && isPrimaryGM()) {
    return applyPlayerAction({ userId: game.user.id, action });
  }

  game.socket.emit(SOCKET_NAME, {
    type: "blackjack-action",
    userId: game.user.id,
    action
  });
  return true;
}
