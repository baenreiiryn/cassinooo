import { MODULE_ID, SOCKET_NAME } from "./state.js";

export const LIARS_DICE_STATE_SETTING = "liarsDiceState";
export const LIARS_DICE_SEATS_SETTING = "liarsDiceSeats";
export const LIARS_DICE_WAGERS_SETTING = "liarsDiceWagers";

const EMPTY_SEATS = { 0:"",1:"",2:"",3:"",4:"",5:"" };
const ROLL_MS = 1900;

function emptyState(){
  return {
    phase:"idle",
    round:0,
    diceCounts:{},
    dice:{},
    turnOrder:[],
    activeTurn:-1,
    activeUserId:null,
    lastLoserId:null,
    winnerId:null,
    totalPot:0,
    houseCut:0,
    prize:0,
    roundResults:[],
    message:"Defina os jogadores e as apostas antes da primeira rodada."
  };
}

function sanitizeWager(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
}
function sleep(ms){ return new Promise(resolve=>window.setTimeout(resolve,ms)); }
function primaryGM(){ return game.users.filter(u=>u.isGM&&u.active).sort((a,b)=>a.id.localeCompare(b.id))[0]??null; }
function isPrimaryGM(){ return Boolean(game.user?.isGM&&primaryGM()?.id===game.user.id); }
function roundMoney(value){ return Math.round((Number(value)||0)*100)/100; }

export function registerLiarsDiceSettings(){
  game.settings.register(MODULE_ID,LIARS_DICE_STATE_SETTING,{name:"Estado do Liar's Dice",scope:"world",config:false,type:Object,default:emptyState()});
  game.settings.register(MODULE_ID,LIARS_DICE_SEATS_SETTING,{name:"Assentos do Liar's Dice",scope:"world",config:false,type:Object,default:EMPTY_SEATS});
  game.settings.register(MODULE_ID,LIARS_DICE_WAGERS_SETTING,{name:"Apostas do Liar's Dice",scope:"world",config:false,type:Object,default:{}});
}

export function getLiarsDiceState(){ return foundry.utils.deepClone(game.settings.get(MODULE_ID,LIARS_DICE_STATE_SETTING)??emptyState()); }
export function getLiarsDiceSeats(){
  const stored=game.settings.get(MODULE_ID,LIARS_DICE_SEATS_SETTING)??EMPTY_SEATS;
  return Array.from({length:6},(_,i)=>stored[i]??"");
}
export function getLiarsDiceWagers(){ return foundry.utils.deepClone(game.settings.get(MODULE_ID,LIARS_DICE_WAGERS_SETTING)??{}); }

async function saveState(state){
  await game.settings.set(MODULE_ID,LIARS_DICE_STATE_SETTING,state);
  Hooks.callAll("cassinoooLiarsDiceUpdated",foundry.utils.deepClone(state));
  game.socket.emit(SOCKET_NAME,{type:"liars-dice-updated"});
  return state;
}
async function saveWagers(wagers){
  await game.settings.set(MODULE_ID,LIARS_DICE_WAGERS_SETTING,wagers);
  Hooks.callAll("cassinoooLiarsDiceUpdated",getLiarsDiceState());
  game.socket.emit(SOCKET_NAME,{type:"liars-dice-updated"});
}

export async function assignLiarsDiceSeat(index,userId){
  if(!game.user?.isGM||!Number.isInteger(index)||index<0||index>5||(userId&&!game.users.get(userId))) return false;
  const state=getLiarsDiceState();
  if(state.phase!=="idle") return false;
  const seats=getLiarsDiceSeats();
  if(userId) for(let i=0;i<seats.length;i++) if(i!==index&&seats[i]===userId) seats[i]="";
  seats[index]=userId||"";
  await game.settings.set(MODULE_ID,LIARS_DICE_SEATS_SETTING,Object.fromEntries(seats.map((id,i)=>[i,id])));
  game.socket.emit(SOCKET_NAME,{type:"liars-dice-seats-updated"});
  Hooks.callAll("cassinoooLiarsDiceUpdated",getLiarsDiceState());
  return true;
}

async function applyWager(userId,value){
  const state=getLiarsDiceState();
  const seats=getLiarsDiceSeats();
  if(!userId||!seats.includes(userId)||!game.users.get(userId)) return false;
  const next=sanitizeWager(value);
  const wagers=getLiarsDiceWagers();
  const previous=sanitizeWager(wagers[userId]);

  if(state.phase==="idle"){
    wagers[userId]=next;
  }else if(state.phase==="between"){
    if(next<previous) return false;
    wagers[userId]=next;
  }else if(state.phase==="active"&&state.activeUserId===userId){
    if(next<previous) return false;
    wagers[userId]=next;
  }else return false;

  await saveWagers(wagers);
  return true;
}

export async function requestLiarsWagerChange(userId,value){
  if(!userId||game.user?.isGM||game.user?.id!==userId) return false;
  game.socket.emit(SOCKET_NAME,{type:"liars-dice-wager",userId,requesterId:game.user.id,value:sanitizeWager(value)});
  return true;
}

function getRollClass(){ return CONFIG?.Dice?.rolls?.[0]??foundry?.dice?.Roll??globalThis.Roll; }
async function rollD6Pool(count){
  const RollClass=getRollClass();
  if(!RollClass) throw new Error("Foundry Roll API indisponível.");
  const roll=await new RollClass(`${count}d6`).evaluate({allowInteractive:false});
  const values=(roll.dice?.[0]?.results??[]).filter(r=>r.active!==false).map(r=>Number(r.result));
  if(values.length!==count) throw new Error("Não foi possível ler todos os d6 da rolagem.");
  return values;
}

function initializeCounts(state,occupiedIds){
  if(Object.keys(state.diceCounts??{}).length) return;
  state.diceCounts=Object.fromEntries(occupiedIds.map(id=>[id,5]));
}
function aliveOrder(state){
  return getLiarsDiceSeats().filter(id=>id&&Number(state.diceCounts?.[id]??0)>0&&game.users.get(id));
}

export async function gmStartLiarsRound(){
  if(!game.user?.isGM) return false;
  const state=getLiarsDiceState();
  if(!["idle","between"].includes(state.phase)) return false;

  const occupied=getLiarsDiceSeats().filter(id=>id&&game.users.get(id));
  if(occupied.length<2){ ui.notifications?.warn("O Liar's Dice precisa de pelo menos dois jogadores."); return false; }
  initializeCounts(state,occupied);
  const order=aliveOrder(state);
  if(order.length<2){ ui.notifications?.warn("É preciso ter pelo menos dois jogadores com dados restantes."); return false; }

  state.phase="rolling";
  state.round+=1;
  state.turnOrder=order;
  state.activeTurn=-1;
  state.activeUserId=null;
  state.dice={};
  state.lastLoserId=null;
  state.message=`Rodada ${state.round}: os dados estão rolando...`;

  try{
    for(const userId of order) state.dice[userId]=await rollD6Pool(Number(state.diceCounts[userId]));
  }catch(err){
    console.error(`${MODULE_ID} | Falha ao rolar Liar's Dice`,err);
    ui.notifications?.error("Não foi possível rolar os dados do Liar's Dice.");
    state.phase=state.round>1?"between":"idle";
    await saveState(state);
    return false;
  }

  await saveState(state);
  await sleep(ROLL_MS);
  state.phase="active";
  state.activeTurn=0;
  state.activeUserId=order[0];
  state.message=`Turno de ${game.users.get(order[0])?.name??"Jogador"}.`;
  await saveState(state);
  return true;
}

export async function gmPassLiarsTurn(){
  if(!game.user?.isGM) return false;
  const state=getLiarsDiceState();
  if(state.phase!=="active"||!state.turnOrder?.length) return false;
  state.activeTurn=(state.activeTurn+1)%state.turnOrder.length;
  state.activeUserId=state.turnOrder[state.activeTurn];
  state.message=`Turno de ${game.users.get(state.activeUserId)?.name??"Jogador"}.`;
  await saveState(state);
  return true;
}

function buildFinalResults(state,winnerId){
  const wagers=getLiarsDiceWagers();
  const participants=Object.keys(state.diceCounts??{}).filter(id=>game.users.get(id));
  const totalPot=participants.reduce((sum,id)=>sum+sanitizeWager(wagers[id]),0);
  const houseCut=roundMoney(totalPot*.10);
  const prize=roundMoney(totalPot-houseCut);
  const rows=participants.map(userId=>{
    const wager=sanitizeWager(wagers[userId]);
    const winner=userId===winnerId;
    const received=winner?prize:0;
    const delta=roundMoney(received-wager);
    return {userId,name:game.users.get(userId)?.name??"Jogador",wager,received,delta,winner,diceLeft:Number(state.diceCounts[userId]??0)};
  });
  return {totalPot,houseCut,prize,rows};
}

export async function gmMarkLiarsLoser(userId){
  if(!game.user?.isGM) return false;
  const state=getLiarsDiceState();
  if(state.phase!=="active"||!userId||Number(state.diceCounts?.[userId]??0)<=0) return false;

  state.diceCounts[userId]=Math.max(0,Number(state.diceCounts[userId])-1);
  state.lastLoserId=userId;
  state.dice={};
  state.turnOrder=[];
  state.activeTurn=-1;
  state.activeUserId=null;

  const alive=aliveOrder(state);
  if(alive.length===1){
    const winnerId=alive[0];
    const settled=buildFinalResults(state,winnerId);
    state.phase="finished";
    state.winnerId=winnerId;
    state.totalPot=settled.totalPot;
    state.houseCut=settled.houseCut;
    state.prize=settled.prize;
    state.roundResults=settled.rows;
    state.message=`${game.users.get(winnerId)?.name??"Jogador"} venceu o Liar's Dice.`;
  }else{
    state.phase="between";
    const loserName=game.users.get(userId)?.name??"Jogador";
    const remaining=Number(state.diceCounts[userId]);
    state.message=remaining>0?`${loserName} perdeu 1d6 e ficou com ${remaining}d6. Preparem a próxima rodada.`:`${loserName} perdeu o último d6 e foi eliminado.`;
  }
  await saveState(state);
  return true;
}

export async function resetLiarsDice(){
  if(!game.user?.isGM) return false;
  await game.settings.set(MODULE_ID,LIARS_DICE_WAGERS_SETTING,{});
  await saveState(emptyState());
  return true;
}

export async function handleLiarsDiceSocket(message){
  if(!message) return;
  if(message.type==="liars-dice-wager"&&isPrimaryGM()&&message.requesterId===message.userId){
    await applyWager(message.userId,message.value);
  }
}
