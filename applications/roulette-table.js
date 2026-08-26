import { getTableBackground } from "../scripts/backgrounds.js";
import {
  assignRouletteSeat,
  getRouletteBetOptions,
  getRouletteBets,
  getRouletteSeats,
  getRouletteState,
  requestRouletteBetChange,
  resetRoulette,
  spinRoulette
} from "../scripts/roulette.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function numberColor(number) {
  if (number === 0) return "green";
  return RED.has(number) ? "red" : "black";
}

function formatDelta(value) {
  const n = Number(value) || 0;
  if (n > 0) return `+${n} PO`;
  if (n < 0) return `${n} PO`;
  return "0 PO";
}

export class RouletteTable extends HandlebarsApplicationMixin(ApplicationV2) {
  _lastSpinNonce = null;

  static DEFAULT_OPTIONS = {
    id: "cassinooo-roulette-table",
    classes: ["cassinooo", "cassinooo-roulette-table"],
    position: { width: 1180, height: 900 },
    window: { title: "Cassinooo — Roleta", icon: "fa-solid fa-circle-notch" }
  };

  static PARTS = {
    table: { template: "modules/cassinooo/templates/roulette-table.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = getRouletteState();
    const seatIds = getRouletteSeats();
    const bets = getRouletteBets();
    const betOptions = getRouletteBetOptions();
    const players = game.users.filter((u) => !u.isGM).map((u) => ({ id: u.id, name: u.name, active: u.active }));
    const locked = state.phase === "spinning";

    const seatClasses = ["seat-bottom-1", "seat-bottom-2", "seat-bottom-3", "seat-bottom-4", "seat-right-1", "seat-right-2"];
    const seats = seatIds.map((userId, index) => {
      const occupant = userId ? game.users.get(userId) : null;
      const bet = userId ? (bets[userId] ?? { type: "", amount: 0 }) : { type: "", amount: 0 };
      return {
        index,
        number: index + 1,
        positionClass: seatClasses[index],
        userId,
        occupied: Boolean(occupant),
        occupantName: occupant?.name ?? "Lugar vazio",
        occupantActive: occupant?.active ?? false,
        betType: bet.type ?? "",
        betAmount: bet.amount ?? 0,
        canEditBet: Boolean(occupant && !locked && (game.user?.isGM || game.user?.id === userId)),
        betOptions: betOptions.map((option) => ({ ...option, selected: option.value === bet.type })),
        options: players.map((player) => ({ ...player, selected: player.id === userId }))
      };
    });

    const step = 360 / WHEEL_ORDER.length;
    const wheelNumbers = WHEEL_ORDER.map((number, index) => {
      const angle = index * step;
      return {
        number,
        color: numberColor(number),
        style: `--i:${index}; --angle:${angle}deg; --label-angle:${-angle}deg;`
      };
    });

    const gridNumbers = [];
    for (let row = 0; row < 3; row += 1) {
      const rowNumbers = [];
      for (let col = 0; col < 12; col += 1) {
        const number = col * 3 + (3 - row);
        rowNumbers.push({
          number,
          color: numberColor(number),
          winner: state.phase === "settled" && state.result === number
        });
      }
      gridNumbers.push(rowNumbers);
    }

    const roundResults = (state.roundResults ?? []).map((entry) => ({
      ...entry,
      deltaText: formatDelta(entry.delta),
      positive: entry.delta > 0,
      negative: entry.delta < 0
    }));

    return foundry.utils.mergeObject(context, {
      isGM: game.user?.isGM ?? false,
      seats,
      wheelNumbers,
      gridNumbers,
      zeroWinner: state.phase === "settled" && state.result === 0,
      result: state.result,
      hasResult: Number.isInteger(state.result),
      spinning: state.phase === "spinning",
      settled: state.phase === "settled",
      message: state.message,
      spinNonce: state.spinNonce,
      showResults: state.phase === "settled" && roundResults.length > 0,
      roundResults
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const board = this.element.querySelector(".cassinooo-roulette-felt");
    const background = getTableBackground("roulette");
    if (board) {
      board.style.backgroundImage = background
        ? `linear-gradient(rgba(4,25,12,.08), rgba(4,25,12,.16)), url(${JSON.stringify(background)})`
        : "radial-gradient(circle at 55% 42%, #2d8b46 0%, #17622f 62%, #0d3c20 100%)";
      board.style.backgroundPosition = "center center";
      board.style.backgroundSize = background ? "cover" : "auto";
      board.style.backgroundRepeat = "no-repeat";
    }

    const state = getRouletteState();
    if (state.phase === "spinning" && state.spinNonce && state.spinNonce !== this._lastSpinNonce) {
      this._lastSpinNonce = state.spinNonce;
      requestAnimationFrame(() => this._animateSpin(state.result));
    }

    for (const seat of this.element.querySelectorAll(".cassinooo-roulette-seat[data-seat-index]")) {
      const select = seat.querySelector("select[data-roulette-bet-type]");
      const input = seat.querySelector("input[data-roulette-bet-amount]");
      if (!select || !input) continue;

      const saveBet = async () => {
        const userId = seat.dataset.userId;
        if (!userId) return;
        const amount = Math.max(0, Math.floor(Number(input.value) || 0));
        input.value = String(amount);
        await requestRouletteBetChange(userId, select.value, amount);
      };

      select.addEventListener("change", saveBet);
      input.addEventListener("change", saveBet);
    }

    if (!game.user?.isGM) return;

    this.element.querySelector("[data-spin-roulette]")?.addEventListener("click", () => { void spinRoulette(); });
    this.element.querySelector("[data-reset-roulette]")?.addEventListener("click", () => { void resetRoulette(); });

    for (const select of this.element.querySelectorAll("select[data-roulette-seat-index]")) {
      select.addEventListener("change", async (event) => {
        const current = getRouletteState();
        if (current.phase === "spinning") {
          ui.notifications?.warn("Espere a roleta parar antes de trocar os jogadores de lugar.");
          await this.render({ force: true });
          return;
        }
        const target = event.currentTarget;
        await assignRouletteSeat(Number(target.dataset.rouletteSeatIndex), target.value);
        await this.render({ force: true });
      });
    }
  }

  _animateSpin(result) {
    const ball = this.element.querySelector(".cassinooo-roulette-ball-orbit");
    const wheel = this.element.querySelector(".cassinooo-roulette-wheel-inner");
    if (!ball || !wheel || !Number.isInteger(result)) return;

    const targetIndex = WHEEL_ORDER.indexOf(result);
    const pocketAngle = targetIndex * (360 / WHEEL_ORDER.length);
    const wheelRotation = 1440 + (360 - pocketAngle);
    const ballRotation = 1800;

    wheel.style.setProperty("--roulette-wheel-end", `${wheelRotation}deg`);
    ball.style.setProperty("--roulette-ball-end", `${ballRotation}deg`);
    wheel.classList.remove("is-spinning");
    ball.classList.remove("is-spinning");
    void wheel.offsetWidth;
    wheel.classList.add("is-spinning");
    ball.classList.add("is-spinning");
  }
}
