const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const lerp=(a,b,t)=>a+(b-a)*t;

/**
 * 2D tabletop dice simulation for Dados do Dragão.
 * The dice roll inside a small invisible arena on the felt. During the final
 * part of the roll the arena contracts, gathering all three dice beneath the
 * cup before it descends. No die values are exposed by this animation.
 */
export class DragonDice2DAnimator {
  constructor(scene,{phase="idle"}={}){
    this.scene=scene;
    this.phase=phase;
    this.arena=scene?.querySelector("[data-dragon-roll-arena]")??null;
    this.elements=this.arena?[...this.arena.querySelectorAll("[data-dragon-die]")]:[];
    this.frame=null;
    this.disposed=false;
    this.started=performance.now();
    this.last=this.started;
    this.bodies=[];
  }

  init(){
    if(!this.scene)return this;
    if(this.phase==="rolling"&&this.arena&&this.elements.length){
      this._resetBodies();
      this.frame=requestAnimationFrame(this._tick);
    }else if(this.phase==="revealed"){
      // A freshly rendered revealed state starts from the exact covered pose,
      // then the cup lifts. This prevents any flash of the idle cup position.
      this.scene.classList.remove("is-revealed");
      this.scene.classList.add("is-covered","is-reveal-start");
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(this.disposed)return;
        this.scene.classList.remove("is-covered","is-reveal-start");
        this.scene.classList.add("is-revealed");
      }));
    }
    return this;
  }

  _resetBodies(){
    const configs=[
      {kind:"d4",radius:17,x:-48,y:-8,vx:188,vy:92,spin:-8.4},
      {kind:"d6",radius:19,x:2,y:11,vx:-162,vy:-118,spin:7.7},
      {kind:"d8",radius:18,x:49,y:-4,vx:-126,vy:136,spin:-6.9}
    ];
    this.bodies=configs.map((cfg,index)=>({
      ...cfg,
      element:this.elements[index],
      angle:(index-1)*11,
      depth:index===1 ? 1.05 : index===0 ? .98 : 1.01
    }));
    for(const body of this.bodies)this._applyBody(body,0);
  }

  _bounds(t){
    // Free tabletop roll for ~1.45 s, then contract the arena so every die is
    // already under the cup footprint before the cup reaches the felt.
    const gather=clamp((t-1.42)/.55,0,1);
    return {
      halfW:lerp(76,47,gather),
      halfH:lerp(34,22,gather),
      gather
    };
  }

  _solveWalls(body,bounds){
    const r=body.radius;
    const left=-bounds.halfW+r;
    const right=bounds.halfW-r;
    const top=-bounds.halfH+r;
    const bottom=bounds.halfH-r;

    if(body.x<left){body.x=left;body.vx=Math.abs(body.vx)*.72;body.spin=Math.abs(body.spin)*.9;}
    else if(body.x>right){body.x=right;body.vx=-Math.abs(body.vx)*.72;body.spin=-Math.abs(body.spin)*.9;}

    if(body.y<top){body.y=top;body.vy=Math.abs(body.vy)*.72;}
    else if(body.y>bottom){body.y=bottom;body.vy=-Math.abs(body.vy)*.72;}
  }

  _solveDiceCollisions(bounds){
    for(let i=0;i<this.bodies.length;i++){
      for(let j=i+1;j<this.bodies.length;j++){
        const a=this.bodies[i],b=this.bodies[j];
        const dx=b.x-a.x,dy=b.y-a.y;
        const dist=Math.hypot(dx,dy)||.001;
        const min=a.radius+b.radius;
        if(dist>=min)continue;

        const nx=dx/dist,ny=dy/dist;
        const overlap=(min-dist)/2;
        a.x-=nx*overlap;a.y-=ny*overlap;
        b.x+=nx*overlap;b.y+=ny*overlap;

        const rvx=b.vx-a.vx,rvy=b.vy-a.vy;
        const closing=rvx*nx+rvy*ny;
        if(closing<0){
          const impulse=-closing*.68;
          a.vx-=nx*impulse;a.vy-=ny*impulse;
          b.vx+=nx*impulse;b.vy+=ny*impulse;
        }
        this._solveWalls(a,bounds);
        this._solveWalls(b,bounds);
      }
    }
  }

  _step(dt,t){
    const bounds=this._bounds(t);
    const jitterX=Math.sin(t*21)*86+Math.sin(t*33)*34;
    const jitterY=Math.cos(t*18)*74+Math.sin(t*29)*28;

    for(const body of this.bodies){
      body.vx+=jitterX*.23*dt;
      body.vy+=jitterY*.23*dt;

      if(bounds.gather>0){
        // Pull gently toward the center while the permitted area shrinks.
        body.vx+=(-body.x*10.5*bounds.gather)*dt;
        body.vy+=(-body.y*10.5*bounds.gather)*dt;
      }

      const damping=Math.pow(bounds.gather>.55 ? .94 : .985,dt*60);
      body.vx*=damping;
      body.vy*=damping;
      body.x+=body.vx*dt;
      body.y+=body.vy*dt;
      body.angle+=body.spin*dt*22;
      this._solveWalls(body,bounds);
    }
    this._solveDiceCollisions(bounds);
  }

  _applyBody(body,t){
    if(!body.element||!this.arena)return;
    const cover=clamp((t-1.63)/.36,0,1);
    const w=this.arena.clientWidth||190;
    const h=this.arena.clientHeight||88;
    const x=w/2+body.x-body.radius;
    const y=h/2+body.y-body.radius;
    const scale=body.depth-(cover*.05);
    body.element.style.transform=`translate3d(${x}px,${y}px,0) rotate(${body.angle}deg) scale(${scale})`;
    body.element.style.opacity=String(1-cover*.98);
  }

  _tick=(now)=>{
    if(this.disposed)return;
    const dt=Math.min(.032,(now-this.last)/1000);
    this.last=now;
    const t=(now-this.started)/1000;

    const steps=Math.max(1,Math.ceil(dt/(1/120)));
    const step=dt/steps;
    for(let i=0;i<steps;i++)this._step(step,t);
    for(const body of this.bodies)this._applyBody(body,t);

    if(t>=1.55)this.scene.classList.add("is-covering");
    if(t<2.18)this.frame=requestAnimationFrame(this._tick);
  };

  dispose(){
    this.disposed=true;
    if(this.frame)cancelAnimationFrame(this.frame);
    this.frame=null;
  }
}
