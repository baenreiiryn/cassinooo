const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GamePlaceholder extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ id, title, icon, gameName, description }) {
    super({
      id: `cassinooo-${id}`,
      window: { title: `Cassinooo — ${title}`, icon }
    });
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

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return foundry.utils.mergeObject(context, {
      gameName: this.gameName,
      description: this.gameDescription
    });
  }
}
