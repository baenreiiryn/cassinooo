import { assignSeat, getSeats, SOCKET_NAME } from "../scripts/state.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BlackjackTable extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "cassinooo-blackjack-table",
    classes: ["cassinooo", "cassinooo-blackjack-table"],
    position: {
      width: 980,
      height: 720
    },
    window: {
      title: "Cassinooo — Blackjack",
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
    const players = game.users
      .filter((user) => !user.isGM)
      .map((user) => ({
        id: user.id,
        name: user.name,
        active: user.active
      }));

    const seats = seatIds.map((userId, index) => {
      const occupant = userId ? game.users.get(userId) : null;
      return {
        index,
        number: index + 1,
        userId,
        occupied: Boolean(occupant),
        occupantName: occupant?.name ?? "Lugar vazio",
        occupantActive: occupant?.active ?? false,
        options: players.map((player) => ({
          ...player,
          selected: player.id === userId
        }))
      };
    });

    return foundry.utils.mergeObject(context, {
      isGM: game.user?.isGM ?? false,
      seats
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (!game.user?.isGM) return;

    for (const select of this.element.querySelectorAll("select[data-seat-index]")) {
      select.addEventListener("change", async (event) => {
        const target = event.currentTarget;
        const index = Number(target.dataset.seatIndex);
        const changed = await assignSeat(index, target.value);
        if (!changed) return;

        game.socket.emit(SOCKET_NAME, {
          type: "seats-updated"
        });

        await this.render({ force: true });
      });
    }
  }
}
