import { getTableBackground } from "../scripts/backgrounds.js";
import { setupScaledBoard } from "../scripts/scaled-board.js";
import {
  assignLiarsDiceSeat,
  getLiarsDiceSeats,
  getLiarsDiceState,
  getLiarsDiceWagers,
  gmMarkLiarsLoser,
  gmPassLiarsTurn,
  gmSetLiarsChallengeSummaryVisible,
  gmStartLiarsRound,
  requestLiarsCall,
  requestLiarsWagerChange,
  resetLiarsDice
} from "../scripts/liars-dice.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const SEAT_CLASSES=["seat-upper-right","seat-right","seat-lower-right","seat-lower-left","seat-left","seat-upper-left"];

function money(value){
  const n=Number(value)||0;
  return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,"").replace(/\.$/,"");
}
function deltaText(value){
  const n=Number(value)||0;
  if(n>0)return `+${money(n)} PO`;
  if(n<0)return `${money(n)} PO`;
  return "0 PO";
}
function roundMoney(value){ return Math.round((Number(value)||0)*100)/100; }

export class LiarsDiceTable extends HandlebarsApplicationMixin(ApplicationV2){
  _peekOpen=false;

  static DEFAULT_OPTIONS={
    id:"cassinooo-liars-dice-table",
    classes:["cassinooo","cassinooo-liars-dice-table"],
    position:{width:1180,height:900},
    window:{title:"Cassinooo — Liar's Dice",icon:"fa-solid fa-dice",resizable:true}
  };
  static PARTS={table:{template:"modules/cassinooo/templates/liars-dice-table.hbs"}};

  async _prepareContext(options){
    const context=await super._prepareContext(options);
    const state=getLiarsDiceState();
    const seatIds=getLiarsDiceSeats();
    const wagers=getLiarsDiceWagers();
    const players=game.users.filter(u=>!u.isGM).map(u=>({id:u.id,name:u.name,active:u.active}));
    const activePhase=state.phase==="active";
    const revealedPhase=state.phase==="revealed";
    const rolling=state.phase==="rolling";
    const between=state.phase==="between";
    const finished=state.phase==="finished";
    const canAssignSeats=Boolean(game.user?.isGM&&state.phase==="idle");

    const seats=seatIds.map((userId,index)=>{
      const occupant=userId?game.users.get(userId):null;
      const wager=Number(wagers[userId])||0;
      const diceCount=userId?Number(state.diceCounts?.[userId]??5):0;
      const eliminated=Boolean(occupant&&Object.keys(state.diceCounts??{}).length&&diceCount<=0);
      const isActive=activePhase&&state.activeUserId===userId;
      const owner=Boolean(occupant&&game.user?.id===userId&&!game.user?.isGM);
      const canEditWager=Boolean(owner&&!eliminated&&(state.phase==="idle"||between||isActive));
      const sourceDice=state.dice?.[userId]??[];
      const diceViews=Array.from({length:Math.max(0,diceCount)},(_,dieIndex)=>{
        const canSeeValue=revealedPhase||(owner&&activePhase);
        const value=canSeeValue?sourceDice[dieIndex]:null;
        return {index:dieIndex,value,visible:Boolean(canSeeValue&&sourceDice[dieIndex])};
      });
      return {
        index,
        number:index+1,
        positionClass:SEAT_CLASSES[index],
        userId,
        occupied:Boolean(occupant),
        occupantName:occupant?.name??"Lugar vazio",
        occupantActive:occupant?.active??false,
        diceCount,
        eliminated,
        isActive,
        owner,
        canPeek:Boolean(owner&&activePhase&&!eliminated),
        canCallLiar:Boolean(owner&&isActive&&!eliminated),
        canEditWager,
        wager,
        wagerMin:state.phase==="idle"?0:wager,
        diceViews,
        stageClass:rolling?"is-rolling":revealedPhase?"is-revealed":"is-covered",
        showDiceStage:Boolean(occupant&&!eliminated&&(rolling||activePhase||revealedPhase)),
        options:players.map(p=>({...p,selected:p.id===userId}))
      };
    });

    const alive=seats.filter(s=>s.occupied&&!s.eliminated);
    const pot=seatIds.reduce((sum,id)=>sum+(Number(wagers[id])||0),0);
    const loserOptions=alive.map(s=>({id:s.userId,name:s.occupantName,diceCount:s.diceCount}));
    const allDice=Object.values(state.dice??{}).flat().map(Number).filter(value=>Number.isInteger(value)&&value>=1&&value<=6);
    const faceCounts=Array.from({length:6},(_,index)=>({face:index+1,count:allDice.filter(value=>value===index+1).length}));
    const challengeHouseCut=roundMoney(pot*.10);
    const challengePrize=roundMoney(pot-challengeHouseCut);
    const challengeSummaryVisible=Boolean(revealedPhase&&state.challengeSummaryVisible);
    const roundResults=(state.roundResults??[]).map(row=>({
      ...row,
      wagerText:`${money(row.wager)} PO`,
      receivedText:`${money(row.received)} PO`,
      deltaText:deltaText(row.delta),
      positive:row.delta>0,
      negative:row.delta<0
    }));

    return foundry.utils.mergeObject(context,{
      isGM:game.user?.isGM??false,
      seats,
      phase:state.phase,
      message:state.message,
      round:state.round,
      rolling,
      activePhase,
      revealedPhase,
      between,
      finished,
      hasGame:state.phase!=="idle",
      canAssignSeats,
      canStartRound:Boolean(game.user?.isGM&&["idle","between"].includes(state.phase)&&alive.length>=2),
      canPassTurn:Boolean(game.user?.isGM&&activePhase),
      canMarkLoser:Boolean(game.user?.isGM&&revealedPhase&&loserOptions.length>1),
      canShowChallengeSummary:Boolean(game.user?.isGM&&revealedPhase&&!challengeSummaryVisible),
      canHideChallengeSummary:Boolean(game.user?.isGM&&challengeSummaryVisible),
      challengeSummaryVisible,
      faceCounts,
      totalDiceOnTable:allDice.length,
      challengePot:money(pot),
      challengeHouseCut:money(challengeHouseCut),
      challengePrize:money(challengePrize),
      loserOptions,
      activePlayerName:state.activeUserId?game.users.get(state.activeUserId)?.name??"":"",
      challengerName:state.challengerId?game.users.get(state.challengerId)?.name??"":"",
      pot:money(pot),
      totalPot:money(state.totalPot),
      houseCut:money(state.houseCut),
      prize:money(state.prize),
      winnerName:state.winnerId?game.users.get(state.winnerId)?.name??"Jogador":"",
      showResults:finished&&roundResults.length>0,
      roundResults
    });
  }

  _onRender(context,options){
    super._onRender(context,options);

    const felt=this.element.querySelector(".cassinooo-liars-felt");
    const background=getTableBackground("liarsDice");
    if(felt){
      felt.style.backgroundImage=background
        ? `linear-gradient(rgba(35,8,7,.10),rgba(35,8,7,.24)), url(${JSON.stringify(background)})`
        : "radial-gradient(ellipse at 50% 48%,rgba(113,28,22,.98) 0%,rgba(70,18,15,.98) 53%,rgba(31,8,7,.99) 100%)";
      felt.style.backgroundPosition="center center";
      felt.style.backgroundSize=background?"cover":"auto";
      felt.style.backgroundRepeat="no-repeat";
    }

    setupScaledBoard(this,{viewportSelector:".cassinooo-liars-viewport",boardSelector:".cassinooo-liars-felt",designWidth:1100,designHeight:700});

    const state=getLiarsDiceState();
    if(state.phase!=="active") this._peekOpen=false;
    this._syncPeek();

    for(const input of this.element.querySelectorAll("input[data-liars-wager-user-id]")){
      input.addEventListener("change",async event=>{
        const target=event.currentTarget;
        const min=Math.max(0,Number(target.min)||0);
        const value=Math.max(min,Math.floor(Number(target.value)||0));
        target.value=String(value);
        await requestLiarsWagerChange(target.dataset.liarsWagerUserId,value);
      });
    }

    this.element.querySelector("[data-liars-peek]")?.addEventListener("click",()=>{
      this._peekOpen=!this._peekOpen;
      this._syncPeek();
    });

    this.element.querySelector("[data-liars-call]")?.addEventListener("click",()=>{
      void requestLiarsCall(game.user?.id);
    });

    if(!game.user?.isGM)return;
    this.element.querySelector("[data-liars-start-round]")?.addEventListener("click",()=>void gmStartLiarsRound());
    this.element.querySelector("[data-liars-pass-turn]")?.addEventListener("click",()=>void gmPassLiarsTurn());
    this.element.querySelector("[data-liars-show-summary]")?.addEventListener("click",()=>void gmSetLiarsChallengeSummaryVisible(true));
    this.element.querySelectorAll("[data-liars-hide-summary]").forEach(button=>button.addEventListener("click",()=>void gmSetLiarsChallengeSummaryVisible(false)));

    const loserSelect=this.element.querySelector("select[data-liars-loser]");
    const loserButton=this.element.querySelector("[data-liars-mark-loser]");
    if(loserSelect&&loserButton){
      const syncLoserButton=()=>{ loserButton.disabled=!loserSelect.value; };
      syncLoserButton();
      loserSelect.addEventListener("change",syncLoserButton);
      loserButton.addEventListener("click",()=>{
        if(!loserSelect.value){
          ui.notifications?.warn("Escolha qual jogador perdeu a rodada.");
          return;
        }
        void gmMarkLiarsLoser(loserSelect.value);
      });
    }

    this.element.querySelector("[data-liars-reset]")?.addEventListener("click",()=>void resetLiarsDice());

    for(const select of this.element.querySelectorAll("select[data-liars-seat-index]")){
      select.addEventListener("change",async event=>{
        const target=event.currentTarget;
        const ok=await assignLiarsDiceSeat(Number(target.dataset.liarsSeatIndex),target.value);
        if(!ok){ ui.notifications?.warn("Reinicie a mesa antes de trocar os jogadores."); await this.render({force:true}); }
      });
    }
  }

  _syncPeek(){
    const ownSeat=this.element?.querySelector(`.cassinooo-liars-seat[data-user-id="${game.user?.id??""}"]`);
    const stage=ownSeat?.querySelector(".cassinooo-liars-dice-stage");
    stage?.classList.toggle("is-peeking",this._peekOpen);
    const button=ownSeat?.querySelector("[data-liars-peek]");
    if(button) button.textContent=this._peekOpen?"Baixar o copo":"Espiar meus dados";
  }
}
