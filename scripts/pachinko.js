import { MODULE_ID, SOCKET_NAME } from "./state.js";
import { casinoCurrencyMeta, changeCasinoCurrency, normalizeCasinoCurrency } from "./casino-wallet.js";

export const PACHINKO_STATE_SETTING = "pachinkoState";
export const PACHINKO_THEME_SETTING = "pachinkoTheme";

export const PACHINKO_LINES = {
  top: { label: "Horizontal de cima", rows: [0,0,0] },
  middle: { label: "Horizontal do meio", rows: [1,1,1] },
  bottom: { label: "Horizontal de baixo", rows: [2,2,2] },
  diagDown: { label: "Diagonal ↘", rows: [0,1,2] },
  diagUp: { label: "Diagonal ↗", rows: [2,1,0] }
};

export const PACHINKO_PAYOUTS = {
  jackpot: 50,
  premium: 20,
  bell: 10,
  bar: 6,
  cherry: 4,
  coin: 3
};

const SYMBOL_POOL = [
  ...Array(2).fill("jackpot"),
  ...Array(4).fill("premium"),
  ...Array(7).fill("bell"),
  ...Array(10).fill("bar"),
  ...Array(14).fill("cherry"),
  ...Array(18).fill("coin")
];

function emptyMachine(number){
  return {
    number,
    locked:true,
    userId:"",
    credits:0,
    creditCurrency:"gp",
    phase:"idle",
    reels:[["coin","bar","cherry"],["bell","coin","bar"],["cherry","bell","coin"]],
    stopped:[true,true,true],
    activeLines:["middle"],
    betPerLine:1,
    spinCost:0,
    lastWin:0,
    lastLineWins:[],
    spinNonce:null
  };
}

function emptyState(){
  return { machines:Array.from({length:6},(_,i)=>emptyMachine(i+1)) };
}

function normalizeState(raw){
  const state=foundry.utils.deepClone(raw??emptyState());
  state.machines=Array.from({length:6},(_,i)=>{
    const machine={...emptyMachine(i+1),...(state.machines?.[i]??{}),number:i+1};
    machine.creditCurrency=normalizeCasinoCurrency(machine.creditCurrency);
    return machine;
  });
  return state;
}

export function registerPachinkoSettings(){
  game.settings.register(MODULE_ID,PACHINKO_STATE_SETTING,{name:"Estado das máquinas Pachinko",scope:"world",config:false,type:Object,default:emptyState()});
  game.settings.register(MODULE_ID,PACHINKO_THEME_SETTING,{name:"Tema do Pachinko",scope:"world",config:false,type:String,default:"medieval"});
}

export function getPachinkoState(){ return normalizeState(game.settings.get(MODULE_ID,PACHINKO_STATE_SETTING)); }
export function getPachinkoTheme(){ return game.settings.get(MODULE_ID,PACHINKO_THEME_SETTING)??"medieval"; }

function primaryGM(){ return game.users.filter(u=>u.isGM&&u.active).sort((a,b)=>a.id.localeCompare(b.id))[0]??null; }
function isPrimaryGM(){ return Boolean(game.user?.isGM&&primaryGM()?.id===game.user.id); }
function sanitizeCredits(value){ const n=Number(value); return Number.isFinite(n)?Math.max(0,Math.floor(n)):0; }
function sanitizeMachineIndex(index){ const n=Number(index); return Number.isInteger(n)&&n>=0&&n<6?n:-1; }

async function saveState(state){
  await game.settings.set(MODULE_ID,PACHINKO_STATE_SETTING,normalizeState(state));
  Hooks.callAll("cassinoooPachinkoUpdated");
  game.socket.emit(SOCKET_NAME,{type:"pachinko-updated"});
}

function notifyUser(userId,message,level="info"){
  game.socket.emit(SOCKET_NAME,{type:"pachinko-notify",userId,message,level});
  if(game.user?.id===userId) ui.notifications?.[level]?.(message);
}

function ownedMachine(state,index,userId){
  const i=sanitizeMachineIndex(index);
  if(i<0) return null;
  const machine=state.machines[i];
  return machine?.userId===userId?machine:null;
}

export async function gmSetPachinkoCreditCurrency(index,currencyId){
  if(!game.user?.isGM) return false;
  const i=sanitizeMachineIndex(index);
  if(i<0) return false;
  const state=getPachinkoState();
  const machine=state.machines[i];
  if(machine.phase==="spinning"){ ui.notifications?.warn("Espere os três rolos pararem antes de alterar a moeda da máquina."); return false; }
  if(!machine.locked){ ui.notifications?.warn("Trave a máquina antes de alterar o valor do crédito."); return false; }
  if(Number(machine.credits)>0){ ui.notifications?.warn("Saque todos os créditos antes de alterar a moeda da máquina."); return false; }
  machine.creditCurrency=normalizeCasinoCurrency(currencyId);
  await saveState(state);
  return true;
}

export async function gmUnlockPachinkoMachine(index,userId){
  if(!game.user?.isGM) return false;
  const i=sanitizeMachineIndex(index);
  if(i<0||!userId||!game.users.get(userId)||game.users.get(userId)?.isGM) return false;
  const state=getPachinkoState();
  const machine=state.machines[i];
  if(machine.phase==="spinning"){ ui.notifications?.warn("Espere os três rolos pararem antes de alterar a máquina."); return false; }
  if(machine.userId&&machine.userId!==userId&&machine.credits>0){
    ui.notifications?.warn(`A máquina ${i+1} ainda possui ${machine.credits} créditos de outro jogador. Ele precisa sacar antes da transferência.`);
    return false;
  }
  if(machine.userId!==userId){
    const currency=machine.creditCurrency;
    const fresh=emptyMachine(i+1);
    fresh.creditCurrency=currency;
    fresh.userId=userId;
    fresh.locked=false;
    state.machines[i]=fresh;
  }else machine.locked=false;
  await saveState(state);
  return true;
}

export async function gmLockPachinkoMachine(index){
  if(!game.user?.isGM) return false;
  const i=sanitizeMachineIndex(index);
  if(i<0) return false;
  const state=getPachinkoState();
  const machine=state.machines[i];
  if(machine.phase==="spinning"){ ui.notifications?.warn("Espere os três rolos pararem antes de travar a máquina."); return false; }
  machine.locked=true;
  await saveState(state);
  return true;
}

export function requestPachinkoDeposit(index,amount){
  if(game.user?.isGM) return false;
  const value=sanitizeCredits(amount);
  if(value<=0) return false;
  game.socket.emit(SOCKET_NAME,{type:"pachinko-deposit",requesterId:game.user.id,machineIndex:Number(index),amount:value});
  return true;
}

export function requestPachinkoWithdraw(index){
  if(game.user?.isGM) return false;
  game.socket.emit(SOCKET_NAME,{type:"pachinko-withdraw",requesterId:game.user.id,machineIndex:Number(index)});
  return true;
}

function randomSymbol(){ return SYMBOL_POOL[Math.floor(Math.random()*SYMBOL_POOL.length)]; }
function generateReels(){ return Array.from({length:3},()=>Array.from({length:3},randomSymbol)); }

function cleanLines(lines){
  const allowed=new Set(Object.keys(PACHINKO_LINES));
  const result=[...new Set((Array.isArray(lines)?lines:[]).filter(x=>allowed.has(x)))];
  return result.length?result:["middle"];
}

export function requestPachinkoSpin(index,betPerLine,lines){
  if(game.user?.isGM) return false;
  game.socket.emit(SOCKET_NAME,{
    type:"pachinko-spin",
    requesterId:game.user.id,
    machineIndex:Number(index),
    betPerLine:sanitizeCredits(betPerLine),
    lines:cleanLines(lines)
  });
  return true;
}

export function requestPachinkoStop(index,reelIndex){
  if(game.user?.isGM) return false;
  game.socket.emit(SOCKET_NAME,{type:"pachinko-stop",requesterId:game.user.id,machineIndex:Number(index),reelIndex:Number(reelIndex)});
  return true;
}

function evaluateLine(machine,lineId){
  const line=PACHINKO_LINES[lineId];
  const symbols=line.rows.map((row,col)=>machine.reels[col][row]);
  const [a,b,c]=symbols;
  let multiplier=0;
  let reason="";
  if(a===b&&b===c){ multiplier=PACHINKO_PAYOUTS[a]??0; reason=`3× ${a}`; }
  else {
    const cherries=symbols.filter(s=>s==="cherry").length;
    if(cherries===2){ multiplier=2; reason="2× cherry"; }
    else if(cherries===1){ multiplier=1; reason="1× cherry"; }
  }
  const payout=machine.betPerLine*multiplier;
  return {lineId,label:line.label,symbols,multiplier,payout,reason};
}

function settleMachine(machine){
  const wins=machine.activeLines.map(id=>evaluateLine(machine,id)).filter(w=>w.payout>0);
  const total=wins.reduce((sum,w)=>sum+w.payout,0);
  machine.credits+=total;
  machine.lastWin=total;
  machine.lastLineWins=wins;
  machine.phase="settled";
  return total;
}

async function applyDeposit(message){
  const state=getPachinkoState();
  const machine=ownedMachine(state,message.machineIndex,message.requesterId);
  const amount=sanitizeCredits(message.amount);
  if(!machine||machine.locked||machine.phase==="spinning"||amount<=0) return false;
  const meta=casinoCurrencyMeta(machine.creditCurrency);
  let change;
  try{
    change=await changeCasinoCurrency(message.requesterId,meta.id,-amount);
    machine.credits+=amount;
    await saveState(state);
    notifyUser(message.requesterId,`${amount} ${meta.label} convertidas em ${amount} créditos na máquina ${Number(message.machineIndex)+1}.`);
    return true;
  }catch(err){
    console.error(`${MODULE_ID} | Falha ao depositar Pachinko`,err);
    if(change){ try{ await change.actor.update({[change.path]:change.previous}); }catch(_){} }
    notifyUser(message.requesterId,err?.message??"Não foi possível adicionar créditos.","error");
    return false;
  }
}

async function applyWithdraw(message){
  const state=getPachinkoState();
  const machine=ownedMachine(state,message.machineIndex,message.requesterId);
  if(!machine||machine.phase==="spinning") return false;
  const amount=sanitizeCredits(machine.credits);
  if(amount<=0){ notifyUser(message.requesterId,"Não há créditos para sacar.","warn"); return false; }
  const meta=casinoCurrencyMeta(machine.creditCurrency);
  let change;
  try{
    change=await changeCasinoCurrency(message.requesterId,meta.id,amount);
    machine.credits=0;
    machine.lastWin=0;
    machine.lastLineWins=[];
    await saveState(state);
    notifyUser(message.requesterId,`${amount} créditos retornaram como ${amount} ${meta.label} para a ficha.`);
    return true;
  }catch(err){
    console.error(`${MODULE_ID} | Falha ao sacar Pachinko`,err);
    if(change){ try{ await change.actor.update({[change.path]:change.previous}); }catch(_){} }
    notifyUser(message.requesterId,err?.message??"Não foi possível sacar os créditos.","error");
    return false;
  }
}

async function applySpin(message){
  const state=getPachinkoState();
  const machine=ownedMachine(state,message.machineIndex,message.requesterId);
  if(!machine||machine.locked||machine.phase==="spinning") return false;
  const bet=sanitizeCredits(message.betPerLine);
  const lines=cleanLines(message.lines);
  const cost=bet*lines.length;
  if(bet<=0||cost<=0){ notifyUser(message.requesterId,"Defina uma aposta por linha maior que zero.","warn"); return false; }
  if(machine.credits<cost){ notifyUser(message.requesterId,`Créditos insuficientes. A jogada custa ${cost} créditos.`,"warn"); return false; }
  machine.credits-=cost;
  machine.phase="spinning";
  machine.reels=generateReels();
  machine.stopped=[false,false,false];
  machine.activeLines=lines;
  machine.betPerLine=bet;
  machine.spinCost=cost;
  machine.lastWin=0;
  machine.lastLineWins=[];
  machine.spinNonce=`${Date.now()}-${Math.random()}`;
  await saveState(state);
  return true;
}

async function applyStop(message){
  const state=getPachinkoState();
  const machine=ownedMachine(state,message.machineIndex,message.requesterId);
  const reel=Number(message.reelIndex);
  if(!machine||machine.locked||machine.phase!=="spinning"||!Number.isInteger(reel)||reel<0||reel>2||machine.stopped[reel]) return false;
  machine.stopped[reel]=true;
  if(machine.stopped.every(Boolean)){
    const win=settleMachine(machine);
    await saveState(state);
    notifyUser(message.requesterId,win>0?`Você ganhou ${win} créditos!`:`Nenhuma linha premiada nesta rodada.`,win>0?"info":"warn");
  }else await saveState(state);
  return true;
}

export async function handlePachinkoSocket(message){
  if(!message) return;
  if(message.type==="pachinko-notify"){
    if(message.userId===game.user?.id) ui.notifications?.[message.level??"info"]?.(message.message??"");
    return;
  }
  if(!isPrimaryGM()) return;
  if(message.type==="pachinko-deposit") await applyDeposit(message);
  else if(message.type==="pachinko-withdraw") await applyWithdraw(message);
  else if(message.type==="pachinko-spin") await applySpin(message);
  else if(message.type==="pachinko-stop") await applyStop(message);
}
