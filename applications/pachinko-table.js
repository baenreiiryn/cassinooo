import { getTableBackground } from "../scripts/backgrounds.js";
import { setupScaledBoard } from "../scripts/scaled-board.js";
import {
  PACHINKO_LINES,
  PACHINKO_PAYOUTS,
  getPachinkoState,
  getPachinkoTheme,
  gmLockPachinkoMachine,
  gmUnlockPachinkoMachine,
  requestPachinkoDeposit,
  requestPachinkoSpin,
  requestPachinkoStop,
  requestPachinkoWithdraw
} from "../scripts/pachinko.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const THEMES={
  medieval:{label:"Medieval",symbols:{jackpot:["♛","Coroa"],premium:["⚔","Espadas"],bell:["🔔","Sino"],bar:["BAR","Brasão"],cherry:["♦","Gemas"],coin:["●","Moedas"]}},
  cosmic:{label:"Horror Cósmico",symbols:{jackpot:["◉","Olho"],premium:["☠","Ídolo"],bell:["✦","Estrela"],bar:["R'LYEH","R'lyeh"],cherry:["☾","Luas"],coin:["✧","Runas"]}},
  infernal:{label:"Infernal",symbols:{jackpot:["♜","Arquidiabo"],premium:["♨","Chamas"],bell:["☠","Crânio"],bar:["666","Marca"],cherry:["♦","Rubis"],coin:["●","Óbolos"]}},
  tavern:{label:"Taverna",symbols:{jackpot:["★","Jackpot"],premium:["🍺","Canecas"],bell:["🔔","Sino"],bar:["BAR","Taberna"],cherry:["🍒","Cerejas"],coin:["●","Moedas"]}}
};

function themeData(id){ return THEMES[id]??THEMES.medieval; }
function symbolView(theme,id){ const [glyph,label]=theme.symbols[id]??["?",id]; return {id,glyph,label}; }
function machineStatus(machine){
  if(!machine.userId) return machine.locked?"Travada · sem jogador":"Livre";
  const name=game.users.get(machine.userId)?.name??"Jogador";
  return `${machine.locked?"Travada":"Destravada"} · ${name}`;
}

export class PachinkoTable extends HandlebarsApplicationMixin(ApplicationV2){
  _machineIndex=0;

  static DEFAULT_OPTIONS={
    id:"cassinooo-pachinko-table",
    classes:["cassinooo","cassinooo-pachinko-table"],
    position:{width:1120,height:900},
    window:{title:"Cassinooo — Pachinko",icon:"fa-solid fa-coins",resizable:true}
  };
  static PARTS={table:{template:"modules/cassinooo/templates/pachinko-table.hbs"}};

  async _prepareContext(options){
    const context=await super._prepareContext(options);
    const state=getPachinkoState();
    const index=Math.max(0,Math.min(5,Number(this._machineIndex)||0));
    const machine=state.machines[index];
    const themeId=getPachinkoTheme();
    const theme=themeData(themeId);
    const owner=machine.userId?game.users.get(machine.userId):null;
    const isOwner=Boolean(owner&&owner.id===game.user?.id&&!game.user?.isGM);
    const spinning=machine.phase==="spinning";
    const activeLineSet=new Set(machine.activeLines??["middle"]);
    const baseSymbols=Object.keys(PACHINKO_PAYOUTS).map(id=>symbolView(theme,id));
    const stripSymbols=[...baseSymbols,...baseSymbols,...baseSymbols];

    const reels=machine.reels.map((cells,reelIndex)=>({
      index:reelIndex,
      number:reelIndex+1,
      stopped:Boolean(machine.stopped?.[reelIndex]),
      spinning:spinning&&!machine.stopped?.[reelIndex],
      canStop:Boolean(isOwner&&!machine.locked&&spinning&&!machine.stopped?.[reelIndex]),
      cells:cells.map(id=>symbolView(theme,id)),
      stripSymbols
    }));

    const lines=Object.entries(PACHINKO_LINES).map(([id,line])=>({id,label:line.label,selected:activeLineSet.has(id)}));
    const payouts=Object.entries(PACHINKO_PAYOUTS).map(([id,multiplier])=>({...symbolView(theme,id),multiplier}));
    const lineWins=(machine.lastLineWins??[]).map(win=>({
      ...win,
      payoutText:`${win.payout} créditos`,
      multiplierText:`${win.multiplier}×`
    }));
    const players=game.users.filter(u=>!u.isGM).map(u=>({id:u.id,name:u.name,active:u.active,selected:u.id===machine.userId}));
    const machineOptions=state.machines.map((m,i)=>({index:i,number:i+1,selected:i===index,status:machineStatus(m),locked:m.locked,userName:m.userId?game.users.get(m.userId)?.name??"Jogador":""}));

    return foundry.utils.mergeObject(context,{
      isGM:game.user?.isGM??false,
      machineIndex:index,
      machineNumber:index+1,
      machineOptions,
      players,
      themeId,
      themeLabel:theme.label,
      ownerName:owner?.name??"Nenhum jogador",
      machineStatus:machineStatus(machine),
      locked:machine.locked,
      credits:machine.credits,
      phase:machine.phase,
      spinning,
      isOwner,
      canDeposit:Boolean(isOwner&&!machine.locked&&!spinning),
      canWithdraw:Boolean(isOwner&&!spinning&&machine.credits>0),
      canSpin:Boolean(isOwner&&!machine.locked&&!spinning&&machine.credits>0),
      betPerLine:machine.betPerLine||1,
      spinCost:machine.spinCost||0,
      reels,
      lines,
      payouts,
      lastWin:machine.lastWin||0,
      showLastResult:machine.phase==="settled",
      lineWins,
      hasLineWins:lineWins.length>0
    });
  }

  _onRender(context,options){
    super._onRender(context,options);
    const board=this.element.querySelector(".cassinooo-pachinko-board");
    const background=getTableBackground("pachinko");
    if(board){
      board.style.backgroundImage=background?`linear-gradient(rgba(4,2,3,.10),rgba(4,2,3,.24)), url(${JSON.stringify(background)})`:"";
      board.style.backgroundPosition="center";
      board.style.backgroundSize=background?"cover":"auto";
      board.style.backgroundRepeat="no-repeat";
    }
    setupScaledBoard(this,{viewportSelector:".cassinooo-pachinko-viewport",boardSelector:".cassinooo-pachinko-board",designWidth:1000,designHeight:700});

    this.element.querySelector("select[data-pachinko-machine]")?.addEventListener("change",async event=>{
      this._machineIndex=Math.max(0,Math.min(5,Number(event.currentTarget.value)||0));
      await this.render({force:true});
    });

    const syncLines=()=>{
      for(const input of this.element.querySelectorAll("input[data-pachinko-line]")){
        this.element.querySelector(`.cassinooo-payline-${input.value}`)?.classList.toggle("active",input.checked);
      }
      const bet=Math.max(0,Math.floor(Number(this.element.querySelector("[data-pachinko-bet]")?.value)||0));
      const count=this.element.querySelectorAll("input[data-pachinko-line]:checked").length;
      const total=this.element.querySelector("[data-pachinko-total-bet]");
      if(total) total.textContent=String(bet*count);
    };
    for(const input of this.element.querySelectorAll("input[data-pachinko-line], [data-pachinko-bet]")) input.addEventListener("change",syncLines);
    syncLines();

    this.element.querySelector("[data-pachinko-deposit]")?.addEventListener("click",async()=>{
      const input=this.element.querySelector("[data-pachinko-deposit-amount]");
      const amount=Math.max(0,Math.floor(Number(input?.value)||0));
      if(amount<=0){ ui.notifications?.warn("Informe quantas PO deseja converter em créditos."); return; }
      let confirmed=false;
      if(DialogV2?.confirm){
        confirmed=await DialogV2.confirm({window:{title:"Confirmar créditos"},content:`<p>Converter <strong>${amount} PO</strong> da ficha vinculada em <strong>${amount} créditos</strong> na máquina ${this._machineIndex+1}?</p>`});
      }else confirmed=window.confirm(`Converter ${amount} PO em ${amount} créditos?`);
      if(confirmed) requestPachinkoDeposit(this._machineIndex,amount);
    });

    this.element.querySelector("[data-pachinko-withdraw]")?.addEventListener("click",()=>requestPachinkoWithdraw(this._machineIndex));

    this.element.querySelector("[data-pachinko-lever]")?.addEventListener("click",()=>{
      const bet=Math.max(0,Math.floor(Number(this.element.querySelector("[data-pachinko-bet]")?.value)||0));
      const lines=[...this.element.querySelectorAll("input[data-pachinko-line]:checked")].map(el=>el.value);
      if(!lines.length){ ui.notifications?.warn("Escolha pelo menos uma linha de aposta."); return; }
      requestPachinkoSpin(this._machineIndex,bet,lines);
    });

    for(const button of this.element.querySelectorAll("button[data-pachinko-stop]")) button.addEventListener("click",()=>requestPachinkoStop(this._machineIndex,Number(button.dataset.pachinkoStop)));

    if(!game.user?.isGM) return;
    this.element.querySelector("[data-pachinko-unlock]")?.addEventListener("click",()=>{
      const select=this.element.querySelector("select[data-pachinko-player]");
      if(!select?.value){ ui.notifications?.warn("Escolha o jogador para destravar esta máquina."); return; }
      void gmUnlockPachinkoMachine(this._machineIndex,select.value);
    });
    this.element.querySelector("[data-pachinko-lock]")?.addEventListener("click",()=>void gmLockPachinkoMachine(this._machineIndex));
  }
}
