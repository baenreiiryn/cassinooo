import { getTableBackground, getCardBack } from "../scripts/backgrounds.js";
import {
  assignBeholdemSeat,
  dealFlop,
  dealRiver,
  dealTurn,
  getBeholdemSeats,
  getBeholdemState,
  resetBeholdem,
  revealShowdown,
  startBeholdemHand
} from "../scripts/beholdem.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function cardView(card, hidden = false) {
  if (!card) return null;
  if (hidden) return { hidden: true, label: "?", red: false };
  return { hidden: false, label: `${card.rank}${card.suit}`, red: card.suit === "♥" || card.suit === "♦" };
}

export class BeholdemTable extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "cassinooo-beholdem-table",
    classes: ["cassinooo", "cassinooo-beholdem-table"],
    position: { width: 1160, height: 860 },
    window: { title: "Cassinooo — Beholdem", icon: "fa-solid fa-spade" }
  };

  static PARTS = { table: { template: "modules/cassinooo/templates/beholdem-table.hbs" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = getBeholdemState();
    const seatIds = getBeholdemSeats();
    const players = game.users.filter((u) => !u.isGM).map((u) => ({ id: u.id, name: u.name, active: u.active }));
    const seatClasses = ["seat-upper-left", "seat-upper-right", "seat-lower-left", "seat-lower-mid-left", "seat-lower-mid-right", "seat-lower-right"];
    const revealAll = state.phase === "showdown";

    const seats = seatIds.map((userId, index) => {
      const occupant = userId ? game.users.get(userId) : null;
      const hand = userId ? state.hands?.[userId] : null;
      const maySee = Boolean(game.user?.isGM || game.user?.id === userId || revealAll);
      return {
        index,
        number: index + 1,
        userId,
        positionClass: seatClasses[index],
        occupied: Boolean(occupant),
        occupantName: occupant?.name ?? "Lugar vazio",
        occupantActive: occupant?.active ?? false,
        cards: (hand?.cards ?? []).map((card) => cardView(card, !maySee)),
        hasCards: Boolean(hand?.cards?.length),
        options: players.map((player) => ({ ...player, selected: player.id === userId }))
      };
    });

    const activeGM = game.users.find((u) => u.isGM && u.active) ?? game.users.find((u) => u.isGM);
    return foundry.utils.mergeObject(context, {
      isGM: game.user?.isGM ?? false,
      dealerName: activeGM?.name ?? "Mestre",
      seats,
      community: (state.community ?? []).map((card) => cardView(card)),
      phase: state.phase,
      message: state.message,
      canStart: state.phase === "idle",
      canFlop: state.phase === "preflop",
      canTurn: state.phase === "flop",
      canRiver: state.phase === "turn",
      canShowdown: state.phase === "river",
      hasHand: state.phase !== "idle"
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const board = this.element.querySelector(".cassinooo-beholdem-felt");
    const background = getTableBackground("beholdem");
    if (board) {
      board.style.backgroundImage = background
        ? `linear-gradient(rgba(30,5,4,.06), rgba(30,5,4,.14)), url(${JSON.stringify(background)})`
        : "radial-gradient(ellipse at 50% 50%, #5b1816 0%, #32100f 62%, #170706 100%)";
      board.style.backgroundPosition = "center center";
      board.style.backgroundSize = background ? "cover" : "auto";
      board.style.backgroundRepeat = "no-repeat";
      const customBack = getCardBack("beholdem");
      if (customBack) board.style.setProperty("--beholdem-card-back", `url(${JSON.stringify(customBack)})`);
      else board.style.removeProperty("--beholdem-card-back");
    }

    if (!game.user?.isGM) return;
    this.element.querySelector("[data-beholdem-start]")?.addEventListener("click", () => void startBeholdemHand());
    this.element.querySelector("[data-beholdem-flop]")?.addEventListener("click", () => void dealFlop());
    this.element.querySelector("[data-beholdem-turn]")?.addEventListener("click", () => void dealTurn());
    this.element.querySelector("[data-beholdem-river]")?.addEventListener("click", () => void dealRiver());
    this.element.querySelector("[data-beholdem-showdown]")?.addEventListener("click", () => void revealShowdown());
    this.element.querySelector("[data-beholdem-reset]")?.addEventListener("click", () => void resetBeholdem());

    for (const select of this.element.querySelectorAll("select[data-beholdem-seat-index]")) {
      select.addEventListener("change", async (event) => {
        if (getBeholdemState().phase !== "idle") {
          ui.notifications?.warn("Limpe a mão antes de trocar os jogadores de lugar.");
          await this.render({ force: true });
          return;
        }
        const target = event.currentTarget;
        await assignBeholdemSeat(Number(target.dataset.beholdemSeatIndex), target.value);
        await this.render({ force: true });
      });
    }
  }
}
