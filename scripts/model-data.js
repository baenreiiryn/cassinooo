import card0 from "./model-data/cards-v140-00.js";
import card1 from "./model-data/cards-v140-01.js";
import card2 from "./model-data/cards-v140-02.js";
import card3 from "./model-data/cards-v140-03.js";
import card4 from "./model-data/cards-v140-04.js";

import dice from "./model-data/dice-v140.js";

import cup0 from "./model-data/cup-00.js";
import cup1 from "./model-data/cup-01.js";
import cup2 from "./model-data/cup-02.js";

export const CARD_MODEL_DATA = JSON.parse([card0, card1, card2, card3, card4].join(""));
export const DICE_MODEL_DATA = JSON.parse(dice);
export const CUP_MODEL_DATA = JSON.parse([cup0, cup1, cup2].join(""));
