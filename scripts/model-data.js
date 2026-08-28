import cup0 from "./model-data/cup-00.js";
import cup1 from "./model-data/cup-01.js";
import cup2 from "./model-data/cup-02.js";
import dice0 from "./model-data/dice-00.js";
import cards0 from "./model-data/cards-00.js";
import cards1 from "./model-data/cards-01.js";
import cards2 from "./model-data/cards-02.js";

export const CUP_MODEL_DATA = JSON.parse([cup0, cup1, cup2].join(""));
export const DICE_MODEL_DATA = JSON.parse(dice0);
export const CARD_MODEL_DATA = JSON.parse([cards0, cards1, cards2].join(""));
