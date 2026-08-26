const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GamePlaceholder extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ id, title, icon, gameName, description }) {
    super();
    this.gameId = id;
    this.gameTitle = title;
    this.gameIcon = icon;
    this.gameName = gameName;
    this.gameDescription = description;
  }

  static DEFAULT_OPTIONS = {
    classes: ["cassinooo", "cassinooo-placeholder"],
    position: { width: 520, height: 340 },
    window: { title: "Cassinooo", icon: "fa-solid fa-dice" }
  };

  static PARTS = {
    content: { template: "modules/cassinooo/templates/game-placeholder.hbs" }
  };

  get id() { return `cassinooo-${this.gameId}`; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.options.window.title = `Cassinooo — ${this.gameTitle}`;
    this.options.window.icon = this.gameIcon;
    return foundry.utils.mergeObject(context, {
      gameName: this.gameName,
      description: this.gameDescription
    });
  }
}
