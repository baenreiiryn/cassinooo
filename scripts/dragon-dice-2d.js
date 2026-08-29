const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

/**
 * Lightweight 2D cup-local dice simulation.
 * Dice are circles for collision purposes, but remain CSS polyhedra visually.
 * Coordinates are local to the upright cup, so shaking the cup wrapper carries
 * the dice with it while the solver keeps them inside the tapered interior.
 */
export class DragonDice2DAnimator {
  constructor(scene,{phase="idle"}={}){
    this.scene=scene;
    this.phase=phase;
    this.track=scene?.querySelector("[data-dragon-dice-track]")??null;
    this.elements=this.track?[...this.track.querySelectorAll("[data-dragon-die]")]:[];
    this.frame=null;
    this.disposed=false;
    this.started=performance.now();
    this.last=this.started;
    this.bodies=[];
  }

  init(){
    if(!this.scene)return this;
    if(this.phase==="rolling"&&this.track&&this.elements.length){
      this._resetBodies();
      this.frame=requestAnimationFrame(this._tick);
    }else if(this.phase==="revealed"){
      // Force a transition from the covered pose after the freshly-rendered DOM
      // has had one frame to paint.
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
    // Visual dice are ~38-42px. Collision radii are slightly smaller so their
    // corners may visually approach the wall without ever crossing it.
    const configs=[
      {kind:"d4",radius:17,x:-29,y:62,vx:42,vy:-112,nextJump:.06,spin:-8.0},
      {kind:"d6",radius:19,x:0,y:54,vx:-36,vy:-148,nextJump:.18,spin:7.2},
      {kind:"d8",radius:18,x:29,y:64,vx:30,vy:-124,nextJump:.30,spin:-6.3}
    ];
    this.bodies=configs.map((cfg,index)=>({
      ...cfg,
      element:this.elements[index],
      angle:(index-1)*9,
      depth:index===1?1.05:index===0?.98:1.01,
      jumpIndex:0
    }));
    for(const body of this.bodies)this._applyBody(body,0);
  }

  _halfWidthAt(y){
    // Interior geometry: 116px inner mouth, narrowing to ~80px at the floor.
    // Above the mouth the same opening width is preserved, preventing a jumping
    // die from drifting sideways behind the cup.
    if(y<=0)return 58;
    const p=clamp(y/112,0,1);
    return 58-(18*p);
  }

  _jump(body,t){
    if(t<body.nextJump||t>1.47)return;
    const patterns={
      d4:[-184,-166,-196,-174],
      d6:[-208,-176,-194,-216],
      d8:[-178,-202,-170,-190]
    };
    const side={d4:[78,-54,64,-72],d6:[-62,72,-78,55],d8:[55,-70,82,-58]};
    const i=body.jumpIndex%4;
    body.vy=patterns[body.kind][i];
    body.vx+=side[body.kind][i];
    body.spin+=(i%2?1:-1)*1.8;
    body.jumpIndex++;
    body.nextJump+=.34+(body.kind==="d6"?.035:body.kind==="d8"?.07:0);
  }

  _solveWalls(body){
    const r=body.radius;
    const half=this._halfWidthAt(body.y);
    const left=-half+r;
    const right=half-r;
    if(body.x<left){
      body.x=left;
      body.vx=Math.abs(body.vx)*.58;
      body.spin=Math.abs(body.spin)*.88;
    }else if(body.x>right){
      body.x=right;
      body.vx=-Math.abs(body.vx)*.58;
      body.spin=-Math.abs(body.spin)*.88;
    }

    const floor=112-r;
    if(body.y>floor){
      body.y=floor;
      body.vy=-Math.abs(body.vy)*.47;
      if(Math.abs(body.vy)<34)body.vy=0;
      body.vx*=.88;
    }

    // The mouth is open. A die may jump above it, but not so high that it looks
    // detached from the cup.
    const ceiling=-55+r*.15;
    if(body.y<ceiling){
      body.y=ceiling;
      body.vy=Math.abs(body.vy)*.28;
    }
  }

  _solveDiceCollisions(){
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
          const impulse=-closing*.62;
          a.vx-=nx*impulse;a.vy-=ny*impulse;
          b.vx+=nx*impulse;b.vy+=ny*impulse;
        }
        this._solveWalls(a);this._solveWalls(b);
      }
    }
  }

  _step(dt,t){
    const shakeX=Math.sin(t*19)*92+Math.sin(t*31)*34;
    const shakeY=Math.sin(t*23)*18;
    for(const body of this.bodies){
      this._jump(body,t);
      body.vx+=(shakeX*.18)*dt;
      body.vy+=(430+shakeY)*dt;
      body.vx*=Math.pow(.986,dt*60);
      body.vy*=Math.pow(.997,dt*60);
      body.x+=body.vx*dt;
      body.y+=body.vy*dt;
      body.angle+=body.spin*dt*18;
      this._solveWalls(body);
    }
    this._solveDiceCollisions();
  }

  _applyBody(body,t){
    if(!body.element)return;
    // When the cup starts turning, dice descend and fade behind the front wall;
    // they never slide outside of the cup silhouette.
    const turning=clamp((t-1.48)/.48,0,1);
    const lift=clamp((-body.y)/55,0,1);
    const scale=body.depth+(lift*.12)-(turning*.08);
    const x=66+body.x-body.radius;
    const y=7+body.y-body.radius+(turning*31);
    body.element.style.transform=`translate3d(${x}px,${y}px,0) rotate(${body.angle}deg) scale(${scale})`;
    body.element.style.opacity=String(1-turning*.94);
    body.element.style.setProperty("--die-shadow-lift",String(lift));
  }

  _tick=(now)=>{
    if(this.disposed)return;
    const dt=Math.min(.032,(now-this.last)/1000);
    this.last=now;
    const t=(now-this.started)/1000;

    // Fixed-ish microsteps reduce tunnelling through the tapered walls.
    const steps=Math.max(1,Math.ceil(dt/(1/120)));
    const step=dt/steps;
    for(let i=0;i<steps;i++)this._step(step,t);
    for(const body of this.bodies)this._applyBody(body,t);

    if(t>=1.47)this.scene.classList.add("is-turning");
    if(t<2.22)this.frame=requestAnimationFrame(this._tick);
  };

  dispose(){
    this.disposed=true;
    if(this.frame)cancelAnimationFrame(this.frame);
    this.frame=null;
  }
}
