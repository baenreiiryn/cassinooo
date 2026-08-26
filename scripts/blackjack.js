import { MODULE_ID, SOCKET_NAME, getSeats } from "./state.js";

export const BLACKJACK_SETTING = "blackjackState";
const DEAL_DELAY = 620;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function emptyGameState() {
  return {
    phase: "idle",
    deck: [],
    dealer: { cards: [], score: 0 },
    hands: {},
    turnOrder: [],
    activeTurn: -1,
    activeSeatIndex: null,
    lastAnimation: null,
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
  Hooks.callAll("cassinoooBlackjackUpdated", foundry.utils.deepClone(state));
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

function makeHand(userId, seatIndex) {
  return {
    userId,
    seatIndex,
    cards: [],
    score: 0,
    status: "waiting",
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
    hand.result = hand.cards.length === 2 ? "Blackjack!" : "21";
  }
}

function currentHand(state) {
  const userId = state.turnOrder?.[state.activeTurn];
  return userId ? state.hands?.[userId] : null;
}

function setActiveTurn(state, index) {
  state.activeTurn = index;
  const userId = state.turnOrder[index];
  const hand = userId ? state.hands[userId] : null;
  state.activeSeatIndex = hand?.seatIndex ?? null;
  if (hand) {
    hand.status = "playing";
    const user = game.users.get(userId);
    state.message = `Turno de ${user?.name ?? "Jogador"}.`;
  }
}

function findNextTurn(state, startIndex) {
  for (let i = Math.max(0, startIndex); i < state.turnOrder.length; i += 1) {
    const hand = state.hands[state.turnOrder[i]];
    if (hand?.status === "waiting") return i;
  }
  return -1;
}

function hasUnfinishedPlayers(state) {
  return state.turnOrder.some((userId) => {
    const status = state.hands[userId]?.status;
    return status === "waiting" || status === "playing";
  });
}

async function animateState(state, animation, message) {
  state.lastAnimation = {
    nonce: `${Date.now()}-${Math.random()}`,
    ...animation
  };
  if (message) state.message = message;
  await saveState(state);
  await sleep(DEAL_DELAY);
}

async function settleRound(state) {
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
  state.activeTurn = -1;
  state.activeSeatIndex = null;
  state.lastAnimation = null;
  state.message = dealerBust
    ? `Dealer estourou com ${state.dealer.score}. Rodada encerrada.`
    : `Dealer parou em ${state.dealer.score}. Rodada encerrada.`;

  return saveState(state);
}

async function playDealer(state) {
  state.phase = "dealer";
  state.activeTurn = -1;
  state.activeSeatIndex = null;
  state.dealer.score = scoreHand(state.dealer.cards);

  await animateState(
    state,
    { type: "reveal-dealer-hole" },
    `Vez do Dealer. Carta fechada revelada: ${state.dealer.score}.`
  );

  while (state.dealer.score < 17) {
    const card = draw(state);
    state.dealer.cards.push(card);
    state.dealer.score = scoreHand(state.dealer.cards);
    await animateState(
      state,
      { type: "deal-to-dealer", card },
      `Dealer compra ${card.rank}${card.suit} e fica com ${state.dealer.score}.`
    );
  }

  return settleRound(state);
}

async function advanceTurn(state) {
  const next = findNextTurn(state, state.activeTurn + 1);
  if (next >= 0) {
    setActiveTurn(state, next);
    return saveState(state);
  }

  if (hasUnfinishedPlayers(state)) {
    const fallback = findNextTurn(state, 0);
    if (fallback >= 0) {
      setActiveTurn(state, fallback);
      return saveState(state);
    }
  }

  return playDealer(state);
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
  state.phase = "dealing";
  state.deck = shuffle(buildDeck());
  state.message = "Distribuindo as cartas...";

  for (const { userId, seatIndex } of occupied) {
    state.hands[userId] = makeHand(userId, seatIndex);
    state.turnOrder.push(userId);
  }

  await saveState(state);

  for (let round = 0; round < 2; round += 1) {
    for (const userId of state.turnOrder) {
      const hand = state.hands[userId];
      const card = draw(state);
      hand.cards.push(card);
      hand.score = scoreHand(hand.cards);
      const user = game.users.get(userId);
      await animateState(
        state,
        { type: "deal-to-seat", seatIndex: hand.seatIndex, card, initialDeal: true },
        `Distribuindo para ${user?.name ?? "Jogador"}...`
      );
    }

    const dealerCard = draw(state);
    state.dealer.cards.push(dealerCard);
    state.dealer.score = scoreHand(state.dealer.cards);
    await animateState(
      state,
      { type: "deal-to-dealer", card: dealerCard, initialDeal: true },
      round === 0 ? "Dealer recebe a primeira carta." : "Dealer recebe a carta fechada."
    );
  }

  for (const hand of Object.values(state.hands)) updateHandScore(hand);
  state.dealer.score = scoreHand(state.dealer.cards);
  state.phase = "players";
  state.lastAnimation = null;

  const first = findNextTurn(state, 0);
  if (first >= 0) {
    setActiveTurn(state, first);
    await saveState(state);
    return true;
  }

  return playDealer(state);
}

export async function resetRound() {
  if (!game.user?.isGM) return false;
  await saveState(emptyGameState());
  return true;
}

export async function gmGiveCard() {
  if (!game.user?.isGM) return false;
  const state = getBlackjackState();
  if (state.phase !== "players") return false;

  const hand = currentHand(state);
  if (!hand || hand.status !== "playing") return false;

  const card = draw(state);
  hand.cards.push(card);
  updateHandScore(hand);

  const user = game.users.get(hand.userId);
  await animateState(
    state,
    { type: "deal-to-seat", seatIndex: hand.seatIndex, card },
    `${user?.name ?? "Jogador"} recebeu ${card.rank}${card.suit}.`
  );

  if (hand.status === "playing") {
    state.lastAnimation = null;
    state.message = `Turno de ${user?.name ?? "Jogador"}.`;
    await saveState(state);
    return true;
  }

  // Estouro ou 21 encerra apenas esta mão; os outros jogadores continuam normalmente.
  return advanceTurn(state);
}

export async function gmPassTurn() {
  if (!game.user?.isGM) return false;
  const state = getBlackjackState();
  if (state.phase !== "players") return false;

  const hand = currentHand(state);
  if (!hand || hand.status !== "playing") return false;

  hand.status = "standing";
  hand.result = hand.result || "Parou";
  return advanceTurn(state);
}

export async function handleBlackjackSocket(message) {
  // Os jogadores apenas assistem. O socket mantém todas as mesas abertas sincronizadas.
  if (!message) return;
}
