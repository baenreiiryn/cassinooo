import { setupScaledBoard } from "../scripts/scaled-board.js";
import {
  assignLiarsDiceSeat,
  getLiarsDiceSeats,
  getLiarsDiceState,
  getLiarsDiceWagers,
  gmMarkLiarsLoser,
  gmPassLiarsTurn,
  gmStartLiarsRound,
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
      const diceViews=Array.from({length:Math.max(0,diceCount)},(_,dieIndex)=>({
        index:dieIndex,
        value:owner&&activePhase?sourceDice[dieIndex]:null,
        visible:Boolean(owner&&activePhase&&sourceDice[dieIndex])
      }));
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
        canEditWager,
        wager,
        wagerMin:isActive?wager:0,
        diceViews,
        showDiceStage:Boolean(occupant&&!eliminated&&(rolling||activePhase)),
        options:players.map(p=>({...p,selected:p.id===userId}))
      };
    });

    const alive=seats.filter(s=>s.occupied&&!s.eliminated);
    const pot=seatIds.reduce((sum,id)=>sum+(Number(wagers[id])||0),0);
    const loserOptions=alive.map(s=>({id:s.userId,name:s.occupantName,diceCount:s.diceCount}));
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
      between,
      finished,
      hasGame:state.phase!=="idle",
      canAssignSeats,
      canStartRound:Boolean(game.user?.isGM&&["idle","between"].includes(state.phase)&&alive.length>=2),
      canPassTurn:Boolean(game.user?.isGM&&activePhase),
      canMarkLoser:Boolean(game.user?.isGM&&activePhase&&loserOptions.length>1),
      loserOptions,
      activePlayerName:state.activeUserId?game.users.get(state.activeUserId)?.name??"":"",
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

    this.element.querySelector("[data-liars-peek]")?.addEventListener("click",event=>{
      this._peekOpen=!this._peekOpen;
      event.currentTarget.textContent=this._peekOpen?"Baixar o copo":"Espiar meus dados";
      this._syncPeek();
    });

    if(!game.user?.isGM)return;
    this.element.querySelector("[data-liars-start-round]")?.addEventListener("click",()=>void gmStartLiarsRound());
    this.element.querySelector("[data-liars-pass-turn]")?.addEventListener("click",()=>void gmPassLiarsTurn());
    this.element.querySelector("[data-liars-mark-loser]")?.addEventListener("click",()=>{
      const select=this.element.querySelector("select[data-liars-loser]");
      if(select?.value) void gmMarkLiarsLoser(select.value);
    });
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
    ownSeat?.querySelector(".cassinooo-liars-dice-stage")?.classList.toggle("is-peeking",this._peekOpen);
  }
}
