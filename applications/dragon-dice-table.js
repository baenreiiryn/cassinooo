import { getTableBackground } from "../scripts/backgrounds.js";
import { setupScaledBoard } from "../scripts/scaled-board.js";
import { DragonDice2DAnimator } from "../scripts/dragon-dice-2d.js";
import {
  DRAGON_BET_TYPES,
  DRAGON_HEART_RANGES,
  assignDragonDiceSeat,
  getDragonDiceBets,
  getDragonDiceSeats,
  getDragonDiceState,
  gmRevealDragonDice,
  gmRollDragonDice,
  requestDragonBetChange,
  requestDragonHeartRangeChange,
  resetDragonDice,
  setDragonScoreboardVisible
} from "../scripts/dragon-dice.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const SEAT_CLASSES=["seat-upper-left","seat-upper-right","seat-lower-left","seat-lower-mid-left","seat-lower-mid-right","seat-lower-right"];
const VISUAL_ORDER=[1,5,4,3,2,0];

function deltaText(value){ const n=Number(value)||0; return n>0?`+${n} PO`:n<0?`${n} PO`:"0 PO"; }

export class DragonDiceTable extends HandlebarsApplicationMixin(ApplicationV2){
  _dragon2d=null;

  static DEFAULT_OPTIONS={
    id:"cassinooo-dragon-dice-table",
    classes:["cassinooo","cassinooo-dragon-dice-table"],
    position:{width:1180,height:900},
    window:{title:"Cassinooo — Dados do Dragão",icon:"fa-solid fa-dice-d20",resizable:true}
  };
  static PARTS={table:{template:"modules/cassinooo/templates/dragon-dice-table.hbs"}};

  async _prepareContext(options){
    const context=await super._prepareContext(options);
    const state=getDragonDiceState();
    const seatIds=getDragonDiceSeats();
    const bets=getDragonDiceBets();
    const players=game.users.filter(u=>!u.isGM).map(u=>({id:u.id,name:u.name,active:u.active}));
    const betting=state.phase==="betting";
    const seats=seatIds.map((userId,index)=>{
      const occupant=userId?game.users.get(userId):null;
      const wager=bets[userId]??{};
      const heartRange=DRAGON_HEART_RANGES.some(range=>range.id===wager.heartRange)?wager.heartRange:"mid";
      return {
        index,
        number:VISUAL_ORDER.indexOf(index)+1,
        positionClass:SEAT_CLASSES[index],
        userId,
        occupied:Boolean(occupant),
        occupantName:occupant?.name??"Lugar vazio",
        occupantActive:occupant?.active??false,
        canEdit:Boolean(occupant&&betting&&(game.user?.isGM||game.user?.id===userId)),
        betFields:DRAGON_BET_TYPES.map(type=>({
          ...type,
          value:Number(wager[type.id])||0,
          isHeart:type.id==="heart",
          heartRanges:type.id==="heart"?DRAGON_HEART_RANGES.map(range=>({...range,selected:range.id===heartRange})):[]
        })),
        options:players.map(p=>({...p,selected:p.id===userId}))
      };
    });
    const dice=state.dice??{d4:"?",d6:"?",d8:"?"};
    const revealed=state.phase==="revealed";
    const roundResults=(state.roundResults??[]).map(r=>({...r,deltaText:deltaText(r.delta),positive:r.delta>0,negative:r.delta<0}));
    const activeGM=game.users.find(u=>u.isGM&&u.active)??game.users.find(u=>u.isGM);
    return foundry.utils.mergeObject(context,{
      isGM:game.user?.isGM??false,
      dealerName:activeGM?.name??"Mestre",
      seats,
      phase:state.phase,
      message:state.message,
      rolling:state.phase==="rolling",
      betting,
      revealed,
      idle:state.phase==="idle",
      canRoll:["idle","revealed"].includes(state.phase),
      canReveal:betting,
      canShowScoreboard:revealed&&roundResults.length>0&&!state.scoreboardVisible,
      canHideScoreboard:revealed&&roundResults.length>0&&state.scoreboardVisible,
      hasRound:state.phase!=="idle",
      d4:revealed?dice.d4:"?", d6:revealed?dice.d6:"?", d8:revealed?dice.d8:"?",
      sum:revealed?(dice.d4+dice.d6+dice.d8):"?",
      showResults:revealed&&state.scoreboardVisible&&roundResults.length>0,
      roundResults
    });
  }

  _onRender(context,options){
    super._onRender(context,options);
    const felt=this.element.querySelector(".cassinooo-dragon-felt");
    const background=getTableBackground("dragonDice");
    if(felt){
      felt.style.backgroundImage=background
        ? `linear-gradient(rgba(27,4,3,.04),rgba(27,4,3,.10)), url(${JSON.stringify(background)})`
        : "radial-gradient(ellipse at 50% 52%,#641912 0%,#32100e 60%,#160605 100%)";
      felt.style.backgroundPosition="center center";
      felt.style.backgroundSize=background?"cover":"auto";
      felt.style.backgroundRepeat="no-repeat";
    }
    setupScaledBoard(this,{viewportSelector:".cassinooo-dragon-viewport",boardSelector:".cassinooo-dragon-felt",designWidth:1100,designHeight:700});

    const state=getDragonDiceState();
    this._setup2DAnimation(state);

    for(const input of this.element.querySelectorAll("input[data-dragon-bet]")){
      input.addEventListener("change",async event=>{
        const target=event.currentTarget;
        const value=Math.max(0,Math.floor(Number(target.value)||0));
        target.value=String(value);
        await requestDragonBetChange(target.dataset.userId,target.dataset.dragonBet,value);
      });
    }

    for(const select of this.element.querySelectorAll("select[data-dragon-heart-range]")){
      select.addEventListener("change",async event=>{
        const target=event.currentTarget;
        await requestDragonHeartRangeChange(target.dataset.userId,target.value);
      });
    }

    if(!game.user?.isGM) return;
    this.element.querySelector("[data-dragon-roll]")?.addEventListener("click",()=>void gmRollDragonDice());
    this.element.querySelector("[data-dragon-reveal]")?.addEventListener("click",()=>void gmRevealDragonDice());
    this.element.querySelector("[data-dragon-show-scoreboard]")?.addEventListener("click",()=>void setDragonScoreboardVisible(true));
    this.element.querySelectorAll("[data-dragon-hide-scoreboard]").forEach(button=>button.addEventListener("click",()=>void setDragonScoreboardVisible(false)));
    this.element.querySelector("[data-dragon-reset]")?.addEventListener("click",()=>void resetDragonDice());
    for(const select of this.element.querySelectorAll("select[data-dragon-seat-index]")){
      select.addEventListener("change",async event=>{
        const target=event.currentTarget;
        const ok=await assignDragonDiceSeat(Number(target.dataset.dragonSeatIndex),target.value);
        if(!ok){ ui.notifications?.warn("Reinicie a mesa antes de trocar jogadores durante uma rodada."); await this.render({force:true}); return; }
        await this.render({force:true});
      });
    }
  }

  _setup2DAnimation(state){
    this._dragon2d?.dispose();
    this._dragon2d=null;
    const scene=this.element.querySelector("[data-dragon-2d-scene]");
    if(!scene)return;
    this._dragon2d=new DragonDice2DAnimator(scene,{phase:state.phase}).init();
  }

  async close(options={}){
    this._dragon2d?.dispose();
    this._dragon2d=null;
    return super.close(options);
  }
}
