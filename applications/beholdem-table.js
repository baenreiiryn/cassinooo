import { getTableBackground, getCardBack } from "../scripts/backgrounds.js";
import {
  advanceBeholdemTurn,
  assignBeholdemSeat,
  BEHOLDEM_VISUAL_SEAT_ORDER,
  dealFlop,
  dealRiver,
  dealTurn,
  getBeholdemSeats,
  getBeholdemState,
  getBeholdemWagers,
  requestBeholdemFold,
  requestBeholdemRaise,
  requestBeholdemWagerChange,
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
function formatDelta(value) {
  const n = Number(value) || 0;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
  if (n > 0) return `+${text} PO`;
  if (n < 0) return `${text} PO`;
  return "0 PO";
}

export class BeholdemTable extends HandlebarsApplicationMixin(ApplicationV2) {
  _lastAnimationNonce = null;
  _resizeObserver = null;

  static DEFAULT_OPTIONS = {
    id: "cassinooo-beholdem-table",
    classes: ["cassinooo", "cassinooo-beholdem-table"],
    position: { width: 1180, height: 900 },
    window: { title: "Cassinooo — Beholdem", icon: "fa-solid fa-spade", resizable: true }
  };

  static PARTS = { table: { template: "modules/cassinooo/templates/beholdem-table.hbs" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = getBeholdemState();
    const wagers = getBeholdemWagers();
    const seatIds = getBeholdemSeats();
    const players = game.users.filter((u) => !u.isGM).map((u) => ({ id: u.id, name: u.name, active: u.active }));
    const seatClasses = ["seat-upper-left", "seat-upper-right", "seat-lower-left", "seat-lower-mid-left", "seat-lower-mid-right", "seat-lower-right"];
    const locked = state.phase !== "idle";

    const seats = seatIds.map((userId, index) => {
      const occupant = userId ? game.users.get(userId) : null;
      const hand = userId ? state.hands?.[userId] : null;
      const maySee = Boolean(userId && game.user?.id === userId);
      const bet = hand?.bet ?? wagers[userId] ?? 0;
      const isActive = state.activeSeatIndex === index && ["preflop", "flop", "turn", "river"].includes(state.phase) && !state.roundComplete;
      const isOwnSeat = Boolean(userId && game.user?.id === userId);
      return {
        index,
        number: BEHOLDEM_VISUAL_SEAT_ORDER.indexOf(index) + 1,
        userId,
        positionClass: seatClasses[index],
        occupied: Boolean(occupant),
        occupantName: occupant?.name ?? "Lugar vazio",
        occupantActive: occupant?.active ?? false,
        cards: (hand?.cards ?? []).map((card) => cardView(card, !maySee)),
        hasCards: Boolean(hand?.cards?.length),
        bet,
        folded: Boolean(hand?.folded),
        canEditBet: Boolean(occupant && ((!locked && (game.user?.isGM || isOwnSeat)) || (isActive && isOwnSeat && !hand?.folded))),
        canFold: Boolean(isActive && isOwnSeat && !hand?.folded),
        isActive,
        bestHand: hand?.bestHand ?? "",
        options: players.map((player) => ({ ...player, selected: player.id === userId }))
      };
    });

    const activeGM = game.users.find((u) => u.isGM && u.active) ?? game.users.find((u) => u.isGM);
    const activeUserId = state.activeTurn >= 0 ? state.turnOrder?.[state.activeTurn] : null;
    const activeUser = activeUserId ? game.users.get(activeUserId) : null;
    const roundResults = (state.roundResults ?? []).map((result) => ({
      ...result,
      deltaText: formatDelta(result.delta),
      positive: result.delta > 0,
      negative: result.delta < 0
    }));

    return foundry.utils.mergeObject(context, {
      isGM: game.user?.isGM ?? false,
      dealerName: activeGM?.name ?? "Mestre",
      seats,
      community: (state.community ?? []).map((card) => cardView(card)),
      phase: state.phase,
      message: state.message,
      canStart: state.phase === "idle",
      canFlop: state.phase === "preflop" && state.roundComplete,
      canTurn: state.phase === "flop" && state.roundComplete,
      canRiver: state.phase === "turn" && state.roundComplete,
      canShowdown: state.phase === "river" && state.roundComplete,
      hasHand: state.phase !== "idle",
      turnActive: ["preflop", "flop", "turn", "river"].includes(state.phase) && !state.roundComplete && state.activeTurn >= 0,
      activePlayerName: activeUser?.name ?? "",
      pot: state.pot ?? 0,
      showResults: state.phase === "showdown" && roundResults.length > 0,
      roundResults
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const board = this.element.querySelector(".cassinooo-beholdem-felt");
    const background = getTableBackground("beholdem");
    if (board) {
      board.style.backgroundImage = background
        ? `linear-gradient(rgba(30,5,4,.03), rgba(30,5,4,.08)), url(${JSON.stringify(background)})`
        : "radial-gradient(ellipse at 50% 50%, #5b1816 0%, #32100f 62%, #170706 100%)";
      board.style.backgroundPosition = "center center";
      board.style.backgroundSize = background ? "cover" : "auto";
      board.style.backgroundRepeat = "no-repeat";
      const customBack = getCardBack("beholdem");
      if (customBack) board.style.setProperty("--beholdem-card-back", `url(${JSON.stringify(customBack)})`);
      else board.style.removeProperty("--beholdem-card-back");
    }

    this._setupScaleObserver();

    const state = getBeholdemState();
    const animation = state.lastAnimation;
    if (animation?.nonce && animation.nonce !== this._lastAnimationNonce) {
      this._lastAnimationNonce = animation.nonce;
      requestAnimationFrame(() => this._animateDeal(animation));
    }

    for (const input of this.element.querySelectorAll("input[data-beholdem-wager-user-id]")) {
      input.addEventListener("change", async (event) => {
        const target = event.currentTarget;
        const userId = target.dataset.beholdemWagerUserId;
        const value = Math.max(0, Math.floor(Number(target.value) || 0));
        const current = getBeholdemState();
        if (current.phase === "idle") await requestBeholdemWagerChange(userId, value);
        else await requestBeholdemRaise(userId, value);
      });
    }

    for (const button of this.element.querySelectorAll("button[data-beholdem-fold-user-id]")) {
      button.addEventListener("click", async (event) => {
        await requestBeholdemFold(event.currentTarget.dataset.beholdemFoldUserId);
      });
    }

    if (!game.user?.isGM) return;
    this.element.querySelector("[data-beholdem-start]")?.addEventListener("click", () => void startBeholdemHand());
    this.element.querySelector("[data-beholdem-next-turn]")?.addEventListener("click", () => void advanceBeholdemTurn());
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

  _setupScaleObserver() {
    this._resizeObserver?.disconnect();
    const viewport = this.element.querySelector(".cassinooo-beholdem-viewport");
    const stage = this.element.querySelector(".cassinooo-beholdem-stage");
    if (!viewport || !stage) return;
    const applyScale = () => {
      const availableWidth = Math.max(320, viewport.clientWidth);
      const availableHeight = Math.max(260, viewport.clientHeight);
      const naturalScale = Math.min(availableWidth / 1100, availableHeight / 700);
      const scale = Math.max(0.38, Math.min(1.6, naturalScale));
      stage.style.setProperty("--beholdem-scale", String(scale));
      stage.style.width = `${1100 * scale}px`;
      stage.style.height = `${700 * scale}px`;
    };
    applyScale();
    this._resizeObserver = new ResizeObserver(applyScale);
    this._resizeObserver.observe(viewport);
  }

  _animateDeal(animation) {
    const board = this.element.querySelector(".cassinooo-beholdem-felt");
    const deck = this.element.querySelector(".cassinooo-beholdem-deck");
    if (!board || !deck) return;

    if (animation.type === "showdown") return;
    if (!["deal-hole", "deal-community"].includes(animation.type)) return;

    const target = animation.type === "deal-hole"
      ? this.element.querySelector(`.cassinooo-beholdem-seat[data-seat-index="${animation.seatIndex}"] .cassinooo-hole-cards`)
      : this.element.querySelector(".cassinooo-community-cards");
    if (!target) return;

    const boardRect = board.getBoundingClientRect();
    const from = deck.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const flying = document.createElement("div");
    flying.className = "cassinooo-beholdem-flying-card";
    flying.style.left = `${(from.left - boardRect.left) / (boardRect.width / 1100) + from.width / 2 / (boardRect.width / 1100) - 22}px`;
    flying.style.top = `${(from.top - boardRect.top) / (boardRect.height / 700) + from.height / 2 / (boardRect.height / 700) - 31}px`;
    board.append(flying);

    const scaleX = boardRect.width / 1100;
    const scaleY = boardRect.height / 700;
    const fromCx = (from.left - boardRect.left + from.width / 2) / scaleX;
    const fromCy = (from.top - boardRect.top + from.height / 2) / scaleY;
    const toCx = (to.left - boardRect.left + to.width / 2) / scaleX;
    const toCy = (to.top - boardRect.top + to.height / 2) / scaleY;
    requestAnimationFrame(() => {
      flying.style.transform = `translate(${toCx - fromCx}px, ${toCy - fromCy}px) rotate(10deg)`;
      flying.style.opacity = "1";
    });
    window.setTimeout(() => {
      if (animation.type === "deal-community") flying.classList.add("flip");
      window.setTimeout(() => flying.remove(), 180);
    }, 470);
  }
}
