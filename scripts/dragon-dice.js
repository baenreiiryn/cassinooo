import { MODULE_ID, SOCKET_NAME } from "./state.js";
import { getCasinoWalletBalance } from "./casino-wallet.js";

export const DRAGON_DICE_STATE_SETTING = "dragonDiceState";
export const DRAGON_DICE_SEATS_SETTING = "dragonDiceSeats";
export const DRAGON_DICE_BETS_SETTING = "dragonDiceBets";

const EMPTY_SEATS = { 0:"",1:"",2:"",3:"",4:"",5:"" };
export const DRAGON_VISUAL_SEAT_ORDER = [1,5,4,3,2,0];
export const DRAGON_HEART_RANGES = [
  { id:"low", label:"4–8", min:4, max:8 },
  { id:"mid", label:"9–13", min:9, max:13 },
  { id:"high", label:"14–18", min:14, max:18 }
];
export const DRAGON_BET_TYPES = [
  { id:"heart", label:"❤️ Coração do Dragão", payout:1 },
  { id:"gold", label:"☀️ Escamas Douradas", payout:6 },
  { id:"black", label:"🌑 Escamas Negras", payout:6 },
  { id:"heads", label:"🐲 Três Cabeças", payout:40 },
  { id:"perfect", label:"👑 Dragão Perfeito", payout:175 }
];

function emptyBets(){ return { heart:0, heartRange:"mid", gold:0, black:0, heads:0, perfect:0 }; }
function emptyState(){ return { phase:"idle", dice:null, rollNonce:null, lastAnimation:null, roundResults:[], scoreboardVisible:false, message:"Aguardando o Mestre rolar os dados sob o copo." }; }
function sanitize(value){ const n=Number(value); return Number.isFinite(n) ? Math.max(0,Math.floor(n)) : 0; }
function sanitizeHeartRange(value){ return DRAGON_HEART_RANGES.some(range=>range.id===value) ? value : "mid"; }
function primaryGM(){ return game.users.filter(u=>u.isGM&&u.active).sort((a,b)=>a.id.localeCompare(b.id))[0] ?? null; }
function isPrimaryGM(){ return Boolean(game.user?.isGM && primaryGM()?.id===game.user.id); }
function sleep(ms){ return new Promise(resolve=>window.setTimeout(resolve,ms)); }
function totalWager(wager){ return DRAGON_BET_TYPES.reduce((sum,type)=>sum+sanitize(wager?.[type.id]),0); }

export function registerDragonDiceSettings(){
  game.settings.register(MODULE_ID, DRAGON_DICE_STATE_SETTING, { name:"Estado dos Dados do Dragão", scope:"world", config:false, type:Object, default:emptyState() });
  game.settings.register(MODULE_ID, DRAGON_DICE_SEATS_SETTING, { name:"Assentos dos Dados do Dragão", scope:"world", config:false, type:Object, default:EMPTY_SEATS });
  game.settings.register(MODULE_ID, DRAGON_DICE_BETS_SETTING, { name:"Apostas dos Dados do Dragão", scope:"world", config:false, type:Object, default:{} });
}
export function getDragonDiceState(){ const state=foundry.utils.deepClone(game.settings.get(MODULE_ID,DRAGON_DICE_STATE_SETTING) ?? emptyState()); if(typeof state.scoreboardVisible!=="boolean") state.scoreboardVisible=false; return state; }
export function getDragonDiceSeats(){ const s=game.settings.get(MODULE_ID,DRAGON_DICE_SEATS_SETTING) ?? EMPTY_SEATS; return Array.from({length:6},(_,i)=>s[i]??""); }
export function getDragonDiceBets(){ return foundry.utils.deepClone(game.settings.get(MODULE_ID,DRAGON_DICE_BETS_SETTING) ?? {}); }

async function saveState(state){ await game.settings.set(MODULE_ID,DRAGON_DICE_STATE_SETTING,state); Hooks.callAll("cassinoooDragonDiceUpdated",foundry.utils.deepClone(state)); game.socket.emit(SOCKET_NAME,{type:"dragon-dice-updated"}); return state; }
async function saveBets(bets){ await game.settings.set(MODULE_ID,DRAGON_DICE_BETS_SETTING,bets); Hooks.callAll("cassinoooDragonDiceUpdated",getDragonDiceState()); game.socket.emit(SOCKET_NAME,{type:"dragon-dice-updated"}); }

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
  if(state.phase!=="betting" || !game.users.get(userId) || !DRAGON_BET_TYPES.some(b=>b.id===betId)) return false;
  const bets=getDragonDiceBets();
  const wager={...emptyBets(),...(bets[userId]??{})};
  wager[betId]=sanitize(value);
  wager.heartRange=sanitizeHeartRange(wager.heartRange);
  if(totalWager(wager)>getCasinoWalletBalance(userId)) return false;
  bets[userId]=wager;
  await saveBets(bets);
  return true;
}
async function applyHeartRange(userId,rangeId){
  const state=getDragonDiceState();
  if(state.phase!=="betting" || !game.users.get(userId)) return false;
  const bets=getDragonDiceBets();
  bets[userId] = {...emptyBets(),...(bets[userId]??{})};
  bets[userId].heartRange=sanitizeHeartRange(rangeId);
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
export async function requestDragonHeartRangeChange(userId,rangeId){
  if(!userId) return false;
  const safeRange=sanitizeHeartRange(rangeId);
  if(game.user?.isGM) return applyHeartRange(userId,safeRange);
  if(game.user?.id!==userId) return false;
  game.socket.emit(SOCKET_NAME,{type:"dragon-dice-heart-range",userId,rangeId:safeRange});
  return true;
}

function getRollClass(){ return CONFIG?.Dice?.rolls?.[0] ?? foundry?.dice?.Roll ?? globalThis.Roll; }
async function createDragonRoll(){
  const RollClass=getRollClass();
  if(!RollClass) throw new Error("Foundry Roll API indisponível.");
  const roll=await new RollClass("1d4 + 1d6 + 1d8").evaluate({allowInteractive:false});
  const values=roll.dice.map(die=>Number(die.results?.find(r=>r.active!==false)?.result ?? die.total ?? 0));
  if(values.length<3) throw new Error("Não foi possível ler d4, d6 e d8 da rolagem.");
  return { d4:values[0], d6:values[1], d8:values[2] };
}

export async function gmRollDragonDice(){
  if(!game.user?.isGM) return false;
  const current=getDragonDiceState();
  if(current.phase==="rolling" || current.phase==="betting") return false;
  let dice;
  try { dice=await createDragonRoll(); }
  catch(err){ console.error(`${MODULE_ID} | Falha ao gerar Dados do Dragão`,err); ui.notifications?.error("Não foi possível rolar os Dados do Dragão."); return false; }
  const state=emptyState();
  state.phase="rolling"; state.dice=dice; state.rollNonce=`${Date.now()}-${Math.random()}`; state.lastAnimation={nonce:state.rollNonce,type:"cup-roll"}; state.message="Os três dados rolam sobre a mesa...";
  await saveState(state);
  await sleep(2200);
  state.phase="betting"; state.lastAnimation={nonce:`${Date.now()}-${Math.random()}`,type:"cup-cover"}; state.message="O copo cobre o resultado. Façam suas apostas em fichas.";
  await saveState(state);
  return true;
}

function winFor(type,d,wager){
  const sum=d.d4+d.d6+d.d8;
  if(type==="heart"){
    const selected=sanitizeHeartRange(wager.heartRange);
    const range=DRAGON_HEART_RANGES.find(item=>item.id===selected) ?? DRAGON_HEART_RANGES[1];
    return sum>=range.min&&sum<=range.max;
  }
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
    const wager={...emptyBets(),...(bets[userId]??{})}; wager.heartRange=sanitizeHeartRange(wager.heartRange);
    let totalBet=0, delta=0; const breakdown=[];
    for(const type of DRAGON_BET_TYPES){
      const amount=sanitize(wager[type.id]); if(!amount) continue;
      totalBet+=amount;
      const won=winFor(type.id,dice,wager);
      const part=won ? amount*type.payout : -amount;
      delta+=part;
      const extra=type.id==="heart" ? ` (${DRAGON_HEART_RANGES.find(r=>r.id===wager.heartRange)?.label??"9–13"})` : "";
      breakdown.push(`${type.label.replace(/^\S+\s/,"")}${extra}: ${won?`+${part}`:part} fichas`);
    }
    rows.push({userId,name:user.name,totalBet,delta,breakdown:breakdown.join(" • ")||"Sem apostas"});
  }
  return rows;
}

export async function gmRevealDragonDice(){
  if(!game.user?.isGM) return false;
  const state=getDragonDiceState();
  if(state.phase!=="betting" || !state.dice) return false;
  const bets=getDragonDiceBets();
  for(const userId of getDragonDiceSeats().filter(Boolean)){
    const wager={...emptyBets(),...(bets[userId]??{})};
    const total=totalWager(wager), balance=getCasinoWalletBalance(userId);
    if(total>balance){ ui.notifications?.warn(`${game.users.get(userId)?.name??"Jogador"} apostou ${total} fichas, mas possui apenas ${balance}.`); return false; }
  }
  state.phase="revealed";
  state.roundResults=settle(state.dice);
  state.scoreboardVisible=false;
  state.lastAnimation={nonce:`${Date.now()}-${Math.random()}`,type:"cup-reveal"};
  const sum=state.dice.d4+state.dice.d6+state.dice.d8;
  state.message=`Revelado: ${state.dice.d4} — ${state.dice.d6} — ${state.dice.d8}. Soma ${sum}.`;
  await saveState(state);
  return true;
}
export async function setDragonScoreboardVisible(visible){
  if(!game.user?.isGM) return false;
  const state=getDragonDiceState();
  if(state.phase!=="revealed" || !state.roundResults?.length) return false;
  state.scoreboardVisible=Boolean(visible); state.lastAnimation=null; await saveState(state); return true;
}
export async function resetDragonDice(){ if(!game.user?.isGM) return false; await saveState(emptyState()); return true; }
export async function handleDragonDiceSocket(message){
  if(!message) return;
  if(message.type==="dragon-dice-bet" && isPrimaryGM()) await applyBet(message.userId,message.betId,message.value);
  if(message.type==="dragon-dice-heart-range" && isPrimaryGM()) await applyHeartRange(message.userId,message.rangeId);
}
