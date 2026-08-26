import { assignSeat, getSeats, SOCKET_NAME } from "../scripts/state.js";
import {
  getBlackjackState,
  requestPlayerAction,
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
  static DEFAULT_OPTIONS = {
    id: "cassinooo-blackjack-table",
    classes: ["cassinooo", "cassinooo-blackjack-table"],
    position: {
      width: 1120,
      height: 820
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
        canAct: Boolean(userId && userId === game.user?.id && state.phase === "players" && hand?.status === "playing"),
        options: players.map((player) => ({ ...player, selected: player.id === userId }))
      };
    });

    const hideHoleCard = state.phase === "players";
    const dealerCards = (state.dealer?.cards ?? []).map((card, index) => cardView(card, hideHoleCard && index === 1));
    const visibleDealerScore = hideHoleCard && state.dealer?.cards?.length
      ? this._scoreVisibleDealerCard(state.dealer.cards[0])
      : (state.dealer?.score || null);

    const activeGM = game.users.find((user) => user.isGM && user.active) ?? game.users.find((user) => user.isGM);

    return foundry.utils.mergeObject(context, {
      isGM: game.user?.isGM ?? false,
      seats,
      dealerName: activeGM?.name ?? "Mestre",
      dealerCards,
      dealerScore: visibleDealerScore,
      showDealerScore: Boolean(dealerCards.length),
      phase: state.phase,
      message: state.message,
      roundActive: state.phase === "players" || state.phase === "dealer",
      hasRound: state.phase !== "idle"
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

    for (const button of this.element.querySelectorAll("button[data-blackjack-action]")) {
      button.addEventListener("click", async (event) => {
        const action = event.currentTarget.dataset.blackjackAction;
        await requestPlayerAction(action);
      });
    }

    if (!game.user?.isGM) return;

    this.element.querySelector("[data-start-round]")?.addEventListener("click", async () => {
      await startRound();
      await this.render({ force: true });
    });

    this.element.querySelector("[data-reset-round]")?.addEventListener("click", async () => {
      await resetRound();
      await this.render({ force: true });
    });

    for (const select of this.element.querySelectorAll("select[data-seat-index]")) {
      select.addEventListener("change", async (event) => {
        const state = getBlackjackState();
        if (state.phase === "players" || state.phase === "dealer") {
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
}
