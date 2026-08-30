import { MODULE_ID, SOCKET_NAME } from "../scripts/state.js";
import { BACKGROUND_SETTINGS, getTableBackground } from "../scripts/backgrounds.js";
import { PACHINKO_THEME_SETTING, getPachinkoTheme } from "../scripts/pachinko.js";
import { CASINO_THEME_OPTIONS, TABLE_THEME_SETTINGS, getTableTheme, normalizeCasinoTheme } from "../scripts/casino-themes.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FilePicker = foundry.applications.apps.FilePicker;

function themeOptions(current) {
  return CASINO_THEME_OPTIONS.map((theme) => ({ ...theme, selected: theme.id === current }));
}

export class CasinoSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "cassinooo-settings",
    classes: ["cassinooo", "cassinooo-settings"],
    position: { width: 760, height: 820 },
    window: { title: "Cassinooo — Configurações", icon: "fa-solid fa-gears" }
  };

  static PARTS = { form: { template: "modules/cassinooo/templates/casino-settings.hbs" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const games = [
      { id: "blackjack", label: "Blackjack", icon: "fa-solid fa-club" },
      { id: "roulette", label: "Roleta", icon: "fa-solid fa-circle-notch" },
      { id: "beholdem", label: "Beholdem", icon: "fa-solid fa-spade" },
      { id: "dragonDice", label: "Dados do Dragão", icon: "fa-solid fa-dice-d20" },
      { id: "liarsDice", label: "Liar's Dice", icon: "fa-solid fa-dice" },
      { id: "pachinko", label: "Pachinko", icon: "fa-solid fa-coins" }
    ].map((gameInfo) => {
      const currentTheme = gameInfo.id === "pachinko" ? getPachinkoTheme() : getTableTheme(gameInfo.id);
      return {
        ...gameInfo,
        value: getTableBackground(gameInfo.id),
        themeOptions: themeOptions(currentTheme)
      };
    });

    return foundry.utils.mergeObject(context, { games });
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
      await this._saveAppearance();
    });
  }

  async _saveAppearance() {
    for (const [gameId, settingKey] of Object.entries(BACKGROUND_SETTINGS)) {
      const input = this.element.querySelector(`input[name="${gameId}"]`);
      await game.settings.set(MODULE_ID, settingKey, String(input?.value ?? "").trim());
    }

    for (const [gameId, settingKey] of Object.entries(TABLE_THEME_SETTINGS)) {
      const theme = normalizeCasinoTheme(this.element.querySelector(`select[name="theme-${gameId}"]`)?.value);
      await game.settings.set(MODULE_ID, settingKey, theme);
    }
    const pachinkoTheme = normalizeCasinoTheme(this.element.querySelector("select[name='theme-pachinko']")?.value);
    await game.settings.set(MODULE_ID, PACHINKO_THEME_SETTING, pachinkoTheme);

    game.socket.emit(SOCKET_NAME, { type: "backgrounds-updated" });
    Hooks.callAll("cassinoooBackgroundsUpdated");
    ui.notifications?.info("Aparência das mesas do Cassinooo salva.");
    await this.close();
  }
}
