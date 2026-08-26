import { assignSeat, getSeats, SOCKET_NAME } from "../scripts/state.js";
import {
  getBlackjackState,
  gmGiveCard,
  gmPassTurn,
  resetRound,
  startRound
} from "../scripts/blackjack.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function cardView(card, hidden = false) {
  if (hidden) return { hidden: true, label: "?", red: false };
  return {
    hidden: false,
    label: `${card.rank}${card.suit}`,
    red: card.suit === "♥" || card.suit === "♦"
  };
}

export class BlackjackTable extends HandlebarsApplicationMixin(ApplicationV2) {
  _lastAnimationNonce = null;

  static DEFAULT_OPTIONS = {
    id: "cassinooo-blackjack-table",
    classes: ["cassinooo", "cassinooo-blackjack-table"],
    position: {
      width: 1120,
      height: 840
    },
    window: {
      title: "Cassinooo — Mesa do Cassino",
      icon: "fa-solid fa-club"
    }
  };

  static PARTS = {
    table: {
      template: "modules/cassinooo/templates/blackjack-table.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const seatIds = getSeats();
    const state = getBlackjackState();
    const players = game.users
      .filter((user) => !user.isGM)
      .map((user) => ({ id: user.id, name: user.name, active: user.active }));

    const positionClasses = [
      "seat-side-left",
      "seat-side-right",
      "seat-diagonal-left",
      "seat-diagonal-right",
      "seat-bottom-left",
      "seat-bottom-right"
    ];

    const seats = seatIds.map((userId, index) => {
      const occupant = userId ? game.users.get(userId) : null;
      const hand = userId ? state.hands?.[userId] : null;
      return {
        index,
        number: index + 1,
        positionClass: positionClasses[index],
        userId,
        occupied: Boolean(occupant),
        occupantName: occupant?.name ?? "Lugar vazio",
        occupantActive: occupant?.active ?? false,
        cards: (hand?.cards ?? []).map((card) => cardView(card)),
        score: hand?.score ?? null,
        hasHand: Boolean(hand),
        result: hand?.result ?? "",
        isActive: state.phase === "players" && state.activeSeatIndex === index,
        options: players.map((player) => ({ ...player, selected: player.id === userId }))
      };
    });

    const hideHoleCard = state.phase === "players" || state.phase === "dealing";
    const dealerCards = (state.dealer?.cards ?? []).map((card, index) => cardView(card, hideHoleCard && index === 1));
    const visibleDealerScore = hideHoleCard && state.dealer?.cards?.length
      ? this._scoreVisibleDealerCard(state.dealer.cards[0])
      : (state.dealer?.score || null);

    const activeGM = game.users.find((user) => user.isGM && user.active) ?? game.users.find((user) => user.isGM);
    const activeHand = state.activeTurn >= 0 ? state.hands?.[state.turnOrder?.[state.activeTurn]] : null;
    const activeUser = activeHand ? game.users.get(activeHand.userId) : null;

    return foundry.utils.mergeObject(context, {
      isGM: game.user?.isGM ?? false,
      seats,
      dealerName: activeGM?.name ?? "Mestre",
      dealerCards,
      dealerScore: visibleDealerScore,
      showDealerScore: Boolean(dealerCards.length),
      deckCount: state.deck?.length ?? 0,
      phase: state.phase,
      message: state.message,
      roundActive: ["dealing", "players", "dealer"].includes(state.phase),
      playerTurnActive: state.phase === "players" && Boolean(activeHand),
      activePlayerName: activeUser?.name ?? "",
      hasRound: state.phase !== "idle",
      lastAnimation: state.lastAnimation ?? null
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

    const state = getBlackjackState();
    const animation = state.lastAnimation;
    if (animation?.nonce && animation.nonce !== this._lastAnimationNonce) {
      this._lastAnimationNonce = animation.nonce;
      requestAnimationFrame(() => this._animateDeal(animation));
    }

    if (!game.user?.isGM) return;

    this.element.querySelector("[data-start-round]")?.addEventListener("click", () => {
      void startRound();
    });

    this.element.querySelector("[data-reset-round]")?.addEventListener("click", async () => {
      await resetRound();
    });

    this.element.querySelector("[data-give-card]")?.addEventListener("click", async () => {
      await gmGiveCard();
    });

    this.element.querySelector("[data-pass-turn]")?.addEventListener("click", async () => {
      await gmPassTurn();
    });

    for (const select of this.element.querySelectorAll("select[data-seat-index]")) {
      select.addEventListener("change", async (event) => {
        const current = getBlackjackState();
        if (["dealing", "players", "dealer"].includes(current.phase)) {
          ui.notifications?.warn("Encerre ou reinicie a rodada antes de trocar os jogadores de lugar.");
          await this.render({ force: true });
          return;
        }

        const target = event.currentTarget;
        const index = Number(target.dataset.seatIndex);
        const changed = await assignSeat(index, target.value);
        if (!changed) return;

        game.socket.emit(SOCKET_NAME, { type: "seats-updated" });
        await this.render({ force: true });
      });
    }
  }

  _animateDeal(animation) {
    if (!["deal-to-seat", "deal-to-dealer", "reveal-dealer-hole"].includes(animation?.type)) return;

    if (animation.type === "reveal-dealer-hole") {
      const hidden = this.element.querySelector(".cassinooo-dealer-hand .hidden-card");
      hidden?.classList.add("revealing");
      return;
    }

    const deck = this.element.querySelector(".cassinooo-deck");
    const target = animation.type === "deal-to-dealer"
      ? this.element.querySelector(".cassinooo-dealer-hand")
      : this.element.querySelector(`.cassinooo-seat[data-seat-index="${animation.seatIndex}"] .cassinooo-hand`);
    if (!deck || !target) return;

    const board = this.element.querySelector(".cassinooo-felt");
    if (!board) return;

    const boardRect = board.getBoundingClientRect();
    const from = deck.getBoundingClientRect();
    const to = target.getBoundingClientRect();

    const flying = document.createElement("div");
    flying.className = "cassinooo-flying-card";
    flying.style.left = `${from.left - boardRect.left + from.width / 2 - 19}px`;
    flying.style.top = `${from.top - boardRect.top + from.height / 2 - 27}px`;
    board.append(flying);

    const dx = to.left - boardRect.left + to.width / 2 - (from.left - boardRect.left + from.width / 2);
    const dy = to.top - boardRect.top + to.height / 2 - (from.top - boardRect.top + from.height / 2);

    requestAnimationFrame(() => {
      flying.style.transform = `translate(${dx}px, ${dy}px) rotate(8deg)`;
      flying.style.opacity = "0.98";
    });

    window.setTimeout(() => flying.remove(), 540);
  }
}
