import { assignSeat, getSeats, SOCKET_NAME } from "../scripts/state.js";
import { getTableBackground } from "../scripts/backgrounds.js";
import {
  getBlackjackState,
  getBlackjackWagers,
  gmGiveCard,
  gmPassTurn,
  requestWagerChange,
  resetRound,
  startRound
} from "../scripts/blackjack.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function cardView(card, hidden = false) {
  if (hidden) return { hidden: true, label: "?", red: false };
  return { hidden: false, label: `${card.rank}${card.suit}`, red: card.suit === "♥" || card.suit === "♦" };
}

function formatDelta(value) {
  const n = Number(value) || 0;
  if (n > 0) return `+${n} PO`;
  if (n < 0) return `${n} PO`;
  return "0 PO";
}

export class BlackjackTable extends HandlebarsApplicationMixin(ApplicationV2) {
  _lastAnimationNonce = null;

  static DEFAULT_OPTIONS = {
    id: "cassinooo-blackjack-table",
    classes: ["cassinooo", "cassinooo-blackjack-table"],
    position: { width: 1120, height: 860 },
    window: { title: "Cassinooo — Blackjack", icon: "fa-solid fa-club" }
  };

  static PARTS = { table: { template: "modules/cassinooo/templates/blackjack-table.hbs" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const seatIds = getSeats();
    const state = getBlackjackState();
    const wagers = getBlackjackWagers();
    const players = game.users.filter((u) => !u.isGM).map((u) => ({ id: u.id, name: u.name, active: u.active }));
    const roundLocked = ["dealing", "players", "dealer"].includes(state.phase);
    const positionClasses = ["seat-side-left", "seat-diagonal-left", "seat-bottom-left", "seat-bottom-right", "seat-diagonal-right", "seat-side-right"];

    const seats = seatIds.map((userId, index) => {
      const occupant = userId ? game.users.get(userId) : null;
      const hand = userId ? state.hands?.[userId] : null;
      const bet = hand?.bet ?? wagers[userId] ?? 0;
      return {
        index, number: index + 1, positionClass: positionClasses[index], userId,
        occupied: Boolean(occupant), occupantName: occupant?.name ?? "Lugar vazio", occupantActive: occupant?.active ?? false,
        cards: (hand?.cards ?? []).map((card) => cardView(card)), score: hand?.score ?? null, hasHand: Boolean(hand), result: hand?.result ?? "",
        isActive: state.phase === "players" && state.activeSeatIndex === index,
        bet,
        canEditBet: Boolean(occupant && !roundLocked && (game.user?.isGM || game.user?.id === userId)),
        options: players.map((player) => ({ ...player, selected: player.id === userId }))
      };
    });

    const hideHoleCard = state.phase === "players" || state.phase === "dealing";
    const dealerCards = (state.dealer?.cards ?? []).map((card, index) => cardView(card, hideHoleCard && index === 1));
    const visibleDealerScore = hideHoleCard && state.dealer?.cards?.length ? this._scoreVisibleDealerCard(state.dealer.cards[0]) : (state.dealer?.score || null);
    const activeGM = game.users.find((u) => u.isGM && u.active) ?? game.users.find((u) => u.isGM);
    const activeHand = state.activeTurn >= 0 ? state.hands?.[state.turnOrder?.[state.activeTurn]] : null;
    const activeUser = activeHand ? game.users.get(activeHand.userId) : null;

    const roundResults = state.phase === "finished"
      ? Object.values(state.hands ?? {}).map((hand) => ({
          name: game.users.get(hand.userId)?.name ?? "Jogador",
          bet: hand.bet ?? 0,
          result: hand.result,
          delta: formatDelta(hand.roundDelta),
          positive: hand.roundDelta > 0,
          negative: hand.roundDelta < 0
        }))
      : [];

    return foundry.utils.mergeObject(context, {
      isGM: game.user?.isGM ?? false, seats, dealerName: activeGM?.name ?? "Mestre", dealerCards,
      dealerScore: visibleDealerScore, showDealerScore: Boolean(dealerCards.length), deckCount: state.deck?.length ?? 0,
      phase: state.phase, message: state.message, roundActive: roundLocked,
      playerTurnActive: state.phase === "players" && Boolean(activeHand), activePlayerName: activeUser?.name ?? "",
      hasRound: state.phase !== "idle", showResults: state.phase === "finished", roundResults
    });
  }

  _scoreVisibleDealerCard(card) {
    if (!card) return null;
    if (card.rank === "A") return 11;
    if (["J", "Q", "K"].includes(card.rank)) return 10;
    return Number(card.rank);
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const felt = this.element.querySelector(".cassinooo-felt");
    const background = getTableBackground("blackjack");
    if (felt) {
      felt.style.backgroundImage = background
        ? `linear-gradient(rgba(20,4,3,.05), rgba(20,4,3,.16)), url(${JSON.stringify(background)})`
        : "radial-gradient(circle at 50% 42%, #5f1713 0%, #32100e 58%, #170706 100%)";
      felt.style.backgroundPosition = "center center";
      felt.style.backgroundSize = background ? "cover" : "auto";
      felt.style.backgroundRepeat = "no-repeat";
    }

    const state = getBlackjackState();
    const animation = state.lastAnimation;
    if (animation?.nonce && animation.nonce !== this._lastAnimationNonce) {
      this._lastAnimationNonce = animation.nonce;
      requestAnimationFrame(() => this._animateDeal(animation));
    }

    for (const input of this.element.querySelectorAll("input[data-wager-user-id]")) {
      input.addEventListener("change", async (event) => {
        const target = event.currentTarget;
        const value = Math.max(0, Math.floor(Number(target.value) || 0));
        target.value = String(value);
        await requestWagerChange(target.dataset.wagerUserId, value);
      });
    }

    if (!game.user?.isGM) return;
    this.element.querySelector("[data-start-round]")?.addEventListener("click", () => { void startRound(); });
    this.element.querySelector("[data-reset-round]")?.addEventListener("click", async () => { await resetRound(); });
    this.element.querySelector("[data-give-card]")?.addEventListener("click", async () => { await gmGiveCard(); });
    this.element.querySelector("[data-pass-turn]")?.addEventListener("click", async () => { await gmPassTurn(); });

    for (const select of this.element.querySelectorAll("select[data-seat-index]")) {
      select.addEventListener("change", async (event) => {
        const current = getBlackjackState();
        if (["dealing", "players", "dealer"].includes(current.phase)) {
          ui.notifications?.warn("Encerre ou reinicie a rodada antes de trocar os jogadores de lugar.");
          await this.render({ force: true }); return;
        }
        const target = event.currentTarget;
        const changed = await assignSeat(Number(target.dataset.seatIndex), target.value);
        if (!changed) return;
        game.socket.emit(SOCKET_NAME, { type: "seats-updated" });
        await this.render({ force: true });
      });
    }
  }

  _animateDeal(animation) {
    if (!["deal-to-seat", "deal-to-dealer", "reveal-dealer-hole"].includes(animation?.type)) return;
    if (animation.type === "reveal-dealer-hole") {
      this.element.querySelector(".cassinooo-dealer-hand .hidden-card")?.classList.add("revealing"); return;
    }
    const deck = this.element.querySelector(".cassinooo-deck");
    const target = animation.type === "deal-to-dealer"
      ? this.element.querySelector(".cassinooo-dealer-hand")
      : this.element.querySelector(`.cassinooo-seat[data-seat-index="${animation.seatIndex}"] .cassinooo-hand`);
    const board = this.element.querySelector(".cassinooo-felt");
    if (!deck || !target || !board) return;
    const boardRect = board.getBoundingClientRect(), from = deck.getBoundingClientRect(), to = target.getBoundingClientRect();
    const flying = document.createElement("div"); flying.className = "cassinooo-flying-card";
    flying.style.left = `${from.left - boardRect.left + from.width / 2 - 19}px`;
    flying.style.top = `${from.top - boardRect.top + from.height / 2 - 27}px`; board.append(flying);
    const dx = to.left - boardRect.left + to.width / 2 - (from.left - boardRect.left + from.width / 2);
    const dy = to.top - boardRect.top + to.height / 2 - (from.top - boardRect.top + from.height / 2);
    requestAnimationFrame(() => { flying.style.transform = `translate(${dx}px, ${dy}px) rotate(8deg)`; flying.style.opacity = "0.98"; });
    window.setTimeout(() => flying.remove(), 540);
  }
}
