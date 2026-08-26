import { MODULE_ID, SOCKET_NAME } from "../scripts/state.js";
import { BACKGROUND_SETTINGS, getTableBackground } from "../scripts/backgrounds.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FilePicker = foundry.applications.apps.FilePicker;

export class CasinoSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "cassinooo-settings",
    classes: ["cassinooo", "cassinooo-settings"],
    position: { width: 720, height: 680 },
    window: {
      title: "Cassinooo — Configurações",
      icon: "fa-solid fa-gears"
    }
  };

  static PARTS = {
    form: { template: "modules/cassinooo/templates/casino-settings.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return foundry.utils.mergeObject(context, {
      games: [
        { id: "blackjack", label: "Blackjack", icon: "fa-solid fa-club", value: getTableBackground("blackjack") },
        { id: "roulette", label: "Roleta", icon: "fa-solid fa-circle-notch", value: getTableBackground("roulette") },
        { id: "beholdem", label: "Beholdem", icon: "fa-solid fa-spade", value: getTableBackground("beholdem") },
        { id: "dragonDice", label: "Dados do Dragão", icon: "fa-solid fa-dice-d20", value: getTableBackground("dragonDice") }
      ]
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);

    for (const button of this.element.querySelectorAll("button[data-file-picker]")) {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const picker = FilePicker.fromButton(event.currentTarget);
        await picker.render({ force: true });
      });
    }

    for (const button of this.element.querySelectorAll("button[data-clear-background]")) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const input = this.element.querySelector(`input[name="${event.currentTarget.dataset.clearBackground}"]`);
        if (input) input.value = "";
      });
    }

    this.element.querySelector("[data-save-backgrounds]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await this._saveBackgrounds();
    });
  }

  async _saveBackgrounds() {
    for (const [gameId, settingKey] of Object.entries(BACKGROUND_SETTINGS)) {
      const input = this.element.querySelector(`input[name="${gameId}"]`);
      await game.settings.set(MODULE_ID, settingKey, String(input?.value ?? "").trim());
    }

    game.socket.emit(SOCKET_NAME, { type: "backgrounds-updated" });
    Hooks.callAll("cassinoooBackgroundsUpdated");
    ui.notifications?.info("Fundos das mesas do Cassinooo salvos.");
    await this.close();
  }
}
