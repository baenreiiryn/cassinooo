export const MODULE_ID = "cassinooo";
export const SOCKET_NAME = `module.${MODULE_ID}`;

const EMPTY_SEATS = {
  0: "",
  1: "",
  2: "",
  3: "",
  4: "",
  5: ""
};

export function registerSettings() {
  game.settings.register(MODULE_ID, "seats", {
    name: "Assentos da Mesa do Cassino",
    scope: "world",
    config: false,
    type: Object,
    default: EMPTY_SEATS
  });
}

export function getSeats() {
  const stored = game.settings.get(MODULE_ID, "seats") ?? EMPTY_SEATS;
  return Array.from({ length: 6 }, (_, index) => stored[index] ?? "");
}

export async function assignSeat(index, userId) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Apenas o Mestre pode alterar os assentos da Mesa do Cassino.");
    return false;
  }

  if (!Number.isInteger(index) || index < 0 || index > 5) return false;

  if (userId && !game.users.get(userId)) {
    ui.notifications?.warn("Esse jogador não existe mais no mundo.");
    return false;
  }

  const seats = getSeats();

  if (userId) {
    for (let i = 0; i < seats.length; i += 1) {
      if (i !== index && seats[i] === userId) seats[i] = "";
    }
  }

  seats[index] = userId || "";
  await game.settings.set(MODULE_ID, "seats", Object.fromEntries(seats.map((id, i) => [i, id])));
  return true;
}
