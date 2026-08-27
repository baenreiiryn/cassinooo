import { MODULE_ID, SOCKET_NAME } from "./state.js";

export const DRAGON_DICE_STATE_SETTING = "dragonDiceState";
export const DRAGON_DICE_SEATS_SETTING = "dragonDiceSeats";
export const DRAGON_DICE_BETS_SETTING = "dragonDiceBets";

const EMPTY_SEATS = { 0:"",1:"",2:"",3:"",4:"",5:"" };
export const DRAGON_BET_TYPES = [
  { id:"heart", label:"❤️ Coração do Dragão", payout:1 },
  { id:"gold", label:"☀️ Escamas Douradas", payout:6 },
  { id:"black", label:"🌑 Escamas Negras", payout:6 },
  { id:"heads", label:"🐲 Três Cabeças", payout:40 },
  { id:"perfect", label:"👑 Dragão Perfeito", payout:175 }
];

function emptyBets(){ return { heart:0, gold:0, black:0, heads:0, perfect:0 }; }
function emptyState(){
  return {
    phase:"idle",
    dice:null,
    rollNonce:null,
    lastAnimation:null,
    roundResults:[],
    message:"Aguardando o Mestre rolar os dados sob o copo."
  };
}
function sanitize(value){ const n=Number(value); return Number.isFinite(n) ? Math.max(0,Math.floor(n)) : 0; }
function primaryGM(){ return game.users.filter(u=>u.isGM&&u.active).sort((a,b)=>a.id.localeCompare(b.id))[0] ?? null; }
function isPrimaryGM(){ return Boolean(game.user?.isGM && primaryGM()?.id===game.user.id); }

export function registerDragonDiceSettings(){
  game.settings.register(MODULE_ID, DRAGON_DICE_STATE_SETTING, { name:"Estado dos Dados do Dragão", scope:"world", config:false, type:Object, default:emptyState() });
  game.settings.register(MODULE_ID, DRAGON_DICE_SEATS_SETTING, { name:"Assentos dos Dados do Dragão", scope:"world", config:false, type:Object, default:EMPTY_SEATS });
  game.settings.register(MODULE_ID, DRAGON_DICE_BETS_SETTING, { name:"Apostas dos Dados do Dragão", scope:"world", config:false, type:Object, default:{} });
}
export function getDragonDiceState(){ return foundry.utils.deepClone(game.settings.get(MODULE_ID,DRAGON_DICE_STATE_SETTING) ?? emptyState()); }
export function getDragonDiceSeats(){ const s=game.settings.get(MODULE_ID,DRAGON_DICE_SEATS_SETTING) ?? EMPTY_SEATS; return Array.from({length:6},(_,i)=>s[i]??""); }
export function getDragonDiceBets(){ return foundry.utils.deepClone(game.settings.get(MODULE_ID,DRAGON_DICE_BETS_SETTING) ?? {}); }

async function saveState(state){
  await game.settings.set(MODULE_ID,DRAGON_DICE_STATE_SETTING,state);
  Hooks.callAll("cassinoooDragonDiceUpdated",foundry.utils.deepClone(state));
  game.socket.emit(SOCKET_NAME,{type:"dragon-dice-updated"});
  return state;
}
async function saveBets(bets){
  await game.settings.set(MODULE_ID,DRAGON_DICE_BETS_SETTING,bets);
  Hooks.callAll("cassinoooDragonDiceUpdated",getDragonDiceState());
  game.socket.emit(SOCKET_NAME,{type:"dragon-dice-updated"});
}

export async function assignDragonDiceSeat(index,userId){
  if(!game.user?.isGM || !Number.isInteger(index) || index<0 || index>5 || (userId&&!game.users.get(userId))) return false;
  const state=getDragonDiceState();
  if(state.phase!=="idle" && state.phase!=="revealed") return false;
  const seats=getDragonDiceSeats();
  if(userId) for(let i=0;i<seats.length;i++) if(i!==index&&seats[i]===userId) seats[i]="";
  seats[index]=userId||"";
  await game.settings.set(MODULE_ID,DRAGON_DICE_SEATS_SETTING,Object.fromEntries(seats.map((id,i)=>[i,id])));
  game.socket.emit(SOCKET_NAME,{type:"dragon-dice-seats-updated"});
  return true;
}

async function applyBet(userId,betId,value){
  const state=getDragonDiceState();
  if(state.phase!=="betting") return false;
  if(!game.users.get(userId) || !DRAGON_BET_TYPES.some(b=>b.id===betId)) return false;
  const bets=getDragonDiceBets();
  bets[userId] ??= emptyBets();
  bets[userId][betId]=sanitize(value);
  await saveBets(bets);
  return true;
}
export async function requestDragonBetChange(userId,betId,value){
  if(!userId) return false;
  if(game.user?.isGM) return applyBet(userId,betId,value);
  if(game.user?.id!==userId) return false;
  game.socket.emit(SOCKET_NAME,{type:"dragon-dice-bet",userId,betId,value:sanitize(value)});
  return true;
}

function rollHiddenDice(){
  return { d4:1+Math.floor(Math.random()*4), d6:1+Math.floor(Math.random()*6), d8:1+Math.floor(Math.random()*8) };
}
async function showDiceSoNice(dice,{hidden=false,synchronize=false}={}){
  if(!game.dice3d?.show) return false;
  const data={ formula:"1d4 + 1d6 + 1d8", results:[dice.d4,dice.d6,dice.d8] };
  try {
    const whisper=hidden ? [game.user.id] : null;
    return await game.dice3d.show(data,game.user,synchronize,whisper,false);
  } catch(err){ console.warn(`${MODULE_ID} | Dice So Nice unavailable`,err); return false; }
}

export async function gmRollDragonDice(){
  if(!game.user?.isGM) return false;
  const current=getDragonDiceState();
  if(current.phase==="rolling" || current.phase==="betting") return false;
  const dice=rollHiddenDice();
  const state=emptyState();
  state.phase="rolling";
  state.dice=dice;
  state.rollNonce=`${Date.now()}-${Math.random()}`;
  state.lastAnimation={nonce:state.rollNonce,type:"cup-roll"};
  state.message="O crupiê sacode o copo... os dados permanecem escondidos.";
  await saveState(state);
  void showDiceSoNice(dice,{hidden:true,synchronize:false});
  await new Promise(r=>window.setTimeout(r,1500));
  state.phase="betting";
  state.lastAnimation={nonce:`${Date.now()}-${Math.random()}`,type:"cup-cover"};
  state.message="O copo está sobre os dados. Façam suas apostas.";
  await saveState(state);
  return true;
}

function winFor(type,d){
  const sum=d.d4+d.d6+d.d8;
  if(type==="heart") return sum>=9&&sum<=12;
  if(type==="gold") return d.d4%2===0&&d.d6%2===0&&d.d8%2===0;
  if(type==="black") return d.d4%2===1&&d.d6%2===1&&d.d8%2===1;
  if(type==="heads") return d.d4===d.d6&&d.d6===d.d8;
  if(type==="perfect") return d.d4===4&&d.d6===6&&d.d8===8;
  return false;
}
function settle(dice){
  const bets=getDragonDiceBets();
  const rows=[];
  for(const userId of getDragonDiceSeats().filter(Boolean)){
    const user=game.users.get(userId); if(!user) continue;
    const wager={...emptyBets(),...(bets[userId]??{})};
    let totalBet=0, delta=0;
    const breakdown=[];
    for(const type of DRAGON_BET_TYPES){
      const amount=sanitize(wager[type.id]); if(!amount) continue;
      totalBet+=amount;
      const won=winFor(type.id,dice);
      const part=won ? amount*type.payout : -amount;
      delta+=part;
      breakdown.push(`${type.label.replace(/^\S+\s/,"")}: ${won?`+${part}`:part} PO`);
    }
    rows.push({userId,name:user.name,totalBet,delta,breakdown:breakdown.join(" • ")||"Sem apostas"});
  }
  return rows;
}

export async function gmRevealDragonDice(){
  if(!game.user?.isGM) return false;
  const state=getDragonDiceState();
  if(state.phase!=="betting" || !state.dice) return false;
  state.phase="revealed";
  state.roundResults=settle(state.dice);
  state.lastAnimation={nonce:`${Date.now()}-${Math.random()}`,type:"cup-reveal"};
  const sum=state.dice.d4+state.dice.d6+state.dice.d8;
  state.message=`Revelado: ${state.dice.d4} — ${state.dice.d6} — ${state.dice.d8}. Soma ${sum}.`;
  await saveState(state);
  await showDiceSoNice(state.dice,{hidden:false,synchronize:true});
  return true;
}

export async function resetDragonDice(){ if(!game.user?.isGM) return false; await saveState(emptyState()); return true; }
export async function handleDragonDiceSocket(message){
  if(!message) return;
  if(message.type==="dragon-dice-bet" && isPrimaryGM()) await applyBet(message.userId,message.betId,message.value);
}
