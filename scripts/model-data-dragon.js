import dice from "./model-data/dice-v140.js";
import cup0 from "./model-data/cup-00.js";
import cup1 from "./model-data/cup-01.js";
import cup2 from "./model-data/cup-02.js";

export const DICE_MODEL_DATA = JSON.parse(dice);
export const CUP_MODEL_DATA = JSON.parse([cup0, cup1, cup2].join(""));
