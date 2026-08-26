import { getTableBackground } from "../scripts/backgrounds.js";
import {
  assignRouletteSeat,
  getRouletteSeats,
  getRouletteState,
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

export class RouletteTable extends HandlebarsApplicationMixin(ApplicationV2) {
  _lastSpinNonce = null;

  static DEFAULT_OPTIONS = {
    id: "cassinooo-roulette-table",
    classes: ["cassinooo", "cassinooo-roulette-table"],
    position: { width: 1180, height: 860 },
    window: { title: "Cassinooo — Roleta", icon: "fa-solid fa-circle-notch" }
  };

  static PARTS = {
    table: { template: "modules/cassinooo/templates/roulette-table.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = getRouletteState();
    const seatIds = getRouletteSeats();
    const players = game.users.filter((u) => !u.isGM).map((u) => ({ id: u.id, name: u.name, active: u.active }));

    const seatClasses = ["seat-bottom-1", "seat-bottom-2", "seat-bottom-3", "seat-bottom-4", "seat-right-1", "seat-right-2"];
    const seats = seatIds.map((userId, index) => {
      const occupant = userId ? game.users.get(userId) : null;
      return {
        index,
        number: index + 1,
        positionClass: seatClasses[index],
        occupied: Boolean(occupant),
        occupantName: occupant?.name ?? "Lugar vazio",
        occupantActive: occupant?.active ?? false,
        options: players.map((player) => ({ ...player, selected: player.id === userId }))
      };
    });

    const wheelNumbers = WHEEL_ORDER.map((number, index) => ({
      number,
      color: numberColor(number),
      style: `--i:${index}; --angle:${index * (360 / WHEEL_ORDER.length)}deg;`
    }));

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
      spinNonce: state.spinNonce
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
    const ballRotation = 1800 + pocketAngle;

    wheel.style.setProperty("--roulette-wheel-end", `${wheelRotation}deg`);
    ball.style.setProperty("--roulette-ball-end", `${ballRotation}deg`);
    wheel.classList.remove("is-spinning");
    ball.classList.remove("is-spinning");
    void wheel.offsetWidth;
    wheel.classList.add("is-spinning");
    ball.classList.add("is-spinning");
  }
}
