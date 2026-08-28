import { CUP_MODEL_DATA, DICE_MODEL_DATA } from "./model-data.js";
import { decodePackedMesh, createProgram, createMesh, createTexture, compose, perspective, lookAt, disposeMesh } from "./packed-webgl.js";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=v=>{v=clamp(v,0,1);return 1-Math.pow(1-v,3);};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const rx=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[v[0],v[1]*c-v[2]*s,v[1]*s+v[2]*c];};
const ry=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c];};
const rz=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]];};
const rotate=(v,r)=>rz(ry(rx(v,r[0]),r[1]),r[2]);
const inverseRotate=(v,r)=>rx(ry(rz(v,-r[2]),-r[1]),-r[0]);

const VS=`#version 300 es
precision highp float;
in vec3 aPosition;in vec3 aNormal;in vec2 aUV;
uniform mat4 uModel,uView,uProjection;
out vec3 vNormal;out vec3 vWorld;out vec2 vUV;
void main(){vec4 w=uModel*vec4(aPosition,1.0);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*aNormal);vUV=aUV;gl_Position=uProjection*uView*w;}`;
const FS=`#version 300 es
precision highp float;
in vec3 vNormal;in vec3 vWorld;in vec2 vUV;
uniform sampler2D uTexture;uniform vec3 uLight;uniform float uBrightness;
out vec4 outColor;
void main(){vec4 tex=texture(uTexture,vUV);vec3 n=normalize(vNormal);float d=max(dot(n,normalize(uLight-vWorld)),0.0);float rim=pow(1.0-max(dot(n,normalize(vec3(0.0,3.4,7.5)-vWorld)),0.0),2.0);vec3 lit=tex.rgb*(0.42+0.58*d)*uBrightness+vec3(0.13,0.09,0.06)*rim;outColor=vec4(lit,tex.a);}`;

function solidTexture(gl,rgba=[180,180,180,255]){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return t;}

export class DragonDiceWebGL{
  constructor(canvas){this.canvas=canvas;this.gl=null;this.meshes={};this.textures={};this.phase="idle";this.dice={d4:1,d6:1,d8:1};this.started=performance.now();this.lastFrame=this.started;this.acc=0;this.frame=null;this.disposed=false;this.bodies=[];}

  async init(){
    const gl=this.canvas?.getContext("webgl2",{alpha:true,antialias:true,premultipliedAlpha:false});
    if(!gl) throw new Error("WebGL2 indisponível neste navegador.");
    this.gl=gl;this.program=createProgram(gl,VS,FS);
    this.loc={position:gl.getAttribLocation(this.program,"aPosition"),normal:gl.getAttribLocation(this.program,"aNormal"),uv:gl.getAttribLocation(this.program,"aUV"),model:gl.getUniformLocation(this.program,"uModel"),view:gl.getUniformLocation(this.program,"uView"),projection:gl.getUniformLocation(this.program,"uProjection"),texture:gl.getUniformLocation(this.program,"uTexture"),light:gl.getUniformLocation(this.program,"uLight"),brightness:gl.getUniformLocation(this.program,"uBrightness")};
    const [cup,d4,d6,d8]=await Promise.all([decodePackedMesh(CUP_MODEL_DATA),decodePackedMesh(DICE_MODEL_DATA.d4.mesh),decodePackedMesh(DICE_MODEL_DATA.d6.mesh),decodePackedMesh(DICE_MODEL_DATA.d8.mesh)]);
    this.meshes.cup=createMesh(gl,this.loc,cup);this.meshes.d4=createMesh(gl,this.loc,d4);this.meshes.d6=createMesh(gl,this.loc,d6);this.meshes.d8=createMesh(gl,this.loc,d8);
    const textureOf=async(data,fallback)=>data?.texture?createTexture(gl,data.texture):solidTexture(gl,fallback);
    [this.textures.cup,this.textures.d4,this.textures.d6,this.textures.d8]=await Promise.all([
      textureOf(CUP_MODEL_DATA,[104,50,31,255]),textureOf(DICE_MODEL_DATA.d4,[40,170,75,255]),textureOf(DICE_MODEL_DATA.d6,[55,95,200,255]),textureOf(DICE_MODEL_DATA.d8,[190,55,50,255])
    ]);
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this._tick();return this;
  }

  setState(phase,dice){this.phase=phase||"idle";if(dice)this.dice={...this.dice,...dice};this.started=performance.now();this.lastFrame=this.started;this.acc=0;if(this.phase==="rolling")this._resetBodies();}

  _resetBodies(){const kinds=["d4","d6","d8"],radius=[.25,.28,.29];this.bodies=kinds.map((kind,i)=>({kind,radius:radius[i],position:[-.32+i*.32,-.04+(i%2)*.16,(i-1)*.13],velocity:[(Math.random()-.5)*1.2,.35+Math.random(),(Math.random()-.5)*1.2],rotation:[Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI],angular:[5+Math.random()*4,6+Math.random()*4,4+Math.random()*5]}));}

  _finalRot(kind,value){const v=Number(value)||1;if(kind==="d6"){const m={1:[0,0,0],2:[Math.PI/2,0,0],3:[0,-Math.PI/2,0],4:[0,Math.PI/2,0],5:[-Math.PI/2,0,0],6:[Math.PI,0,0]};return m[v]||[0,0,0];}return[((v*1.17)%3.1)-1.55,((v*.83)%3.1)-1.55,((v*.51)%2.2)-1.1];}

  _cupPose(t){
    if(this.phase==="rolling"){
      const flip=ease((t-1.25)/.95);
      if(t<1.25)return{position:[Math.sin(t*9)*.42,2.05+Math.abs(Math.sin(t*7))*.34,Math.cos(t*8)*.18],rotation:[Math.sin(t*7)*.18,Math.sin(t*5)*.12,Math.sin(t*10)*.25],scale:1.58};
      return{position:[0,2.05-1.17*flip,0],rotation:[Math.PI*flip,.1*Math.sin(flip*Math.PI),-.1*Math.sin(flip*Math.PI)],scale:1.62};
    }
    if(this.phase==="betting")return{position:[0,.88,0],rotation:[Math.PI,0,0],scale:1.65};
    if(this.phase==="revealed"){const p=ease(t/1.15);return{position:[2.8*p,.88+2.9*p,-.25*p],rotation:[Math.PI-.55*p,.15*p,-.35*p],scale:1.65};}
    if(this.phase==="revealed-static")return{position:[2.8,3.78,-.25],rotation:[Math.PI-.55,.15,-.35],scale:1.65};
    return{position:[0,2.35,0],rotation:[0,0,0],scale:1.58};
  }

  _radiusAt(y){const q=clamp((y+.58)/1.18,0,1);return .57+.27*q;}

  _physics(dt,t,pose){
    const gravity=inverseRotate([0,-8.4,0],pose.rotation),shake=t<1.25?[Math.sin(t*17)*13,Math.sin(t*23)*4,Math.cos(t*19)*13]:[0,0,0];
    for(const b of this.bodies){
      b.velocity=add(b.velocity,mul(add(gravity,shake),dt));b.velocity=mul(b.velocity,.994);b.position=add(b.position,mul(b.velocity,dt));b.rotation=add(b.rotation,mul(b.angular,dt));b.angular=mul(b.angular,.992);
      const ymin=-.50+b.radius,ymax=.50-b.radius;
      if(b.position[1]<ymin){b.position[1]=ymin;b.velocity[1]=Math.abs(b.velocity[1])*.48;}
      if(b.position[1]>ymax){b.position[1]=ymax;b.velocity[1]=-Math.abs(b.velocity[1])*.48;}
      const rr=Math.hypot(b.position[0],b.position[2]),limit=Math.max(.14,this._radiusAt(b.position[1])-b.radius);
      if(rr>limit){const nx=b.position[0]/rr,nz=b.position[2]/rr;b.position[0]=nx*limit;b.position[2]=nz*limit;const vn=b.velocity[0]*nx+b.velocity[2]*nz;if(vn>0){b.velocity[0]-=1.55*vn*nx;b.velocity[2]-=1.55*vn*nz;}b.angular=add(b.angular,[nz*1.25,.45,-nx*1.25]);}
    }
    for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++){
      const a=this.bodies[i],b=this.bodies[j],d=sub(b.position,a.position),dist=Math.hypot(...d)||.001,min=a.radius+b.radius;
      if(dist>=min)continue;const n=mul(d,1/dist),push=(min-dist)/2;a.position=sub(a.position,mul(n,push));b.position=add(b.position,mul(n,push));const rel=dot(sub(b.velocity,a.velocity),n);if(rel<0){const imp=rel*-.78;a.velocity=sub(a.velocity,mul(n,imp));b.velocity=add(b.velocity,mul(n,imp));}
    }
  }

  _bodyWorld(b,pose){return{kind:b.kind,position:add(pose.position,mul(rotate(b.position,pose.rotation),pose.scale)),rotation:add(pose.rotation,b.rotation),scale:.72};}

  _scene(now){
    const t=(now-this.started)/1000,pose=this._cupPose(t),objects=[];
    if(this.phase==="rolling"){
      if(!this.bodies.length)this._resetBodies();for(const b of this.bodies)objects.push(this._bodyWorld(b,pose));
    }else if(this.phase==="betting"){
      const bases=[[-.27,.17,-.08],[.18,.12,.11],[.08,-.18,-.1]],k=["d4","d6","d8"];
      for(let i=0;i<3;i++)objects.push(this._bodyWorld({kind:k[i],position:bases[i],rotation:this._finalRot(k[i],this.dice[k[i]])},pose));
    }else{
      const bases=[[-1.05,.28,0],[0,.28,.1],[1.05,.28,-.04]],k=["d4","d6","d8"];
      for(let i=0;i<3;i++)objects.push({kind:k[i],position:bases[i],rotation:this._finalRot(k[i],this.dice[k[i]]),scale:.72});
    }
    objects.push({kind:"cup",position:pose.position,rotation:pose.rotation,scale:pose.scale,twoSided:true});return objects;
  }

  _resize(){const d=Math.min(devicePixelRatio||1,2),w=Math.max(2,Math.floor(this.canvas.clientWidth*d)),h=Math.max(2,Math.floor(this.canvas.clientHeight*d));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.gl.viewport(0,0,w,h);return w/h;}

  _draw(object,view,projection){
    const gl=this.gl,mesh=this.meshes[object.kind],texture=this.textures[object.kind];if(!mesh||!texture)return;
    if(object.twoSided)gl.disable(gl.CULL_FACE);else gl.enable(gl.CULL_FACE);
    gl.uniformMatrix4fv(this.loc.model,false,compose({position:object.position,rotation:object.rotation,scale:[object.scale,object.scale,object.scale]}));gl.uniformMatrix4fv(this.loc.view,false,view);gl.uniformMatrix4fv(this.loc.projection,false,projection);gl.uniform3f(this.loc.light,-3.5,6.4,7.8);gl.uniform1f(this.loc.brightness,object.kind==="cup"?1.05:1.12);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.loc.texture,0);gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);
  }

  _tick=(now=performance.now())=>{
    if(this.disposed)return;const dt=Math.min(.05,(now-this.lastFrame)/1000);this.lastFrame=now;const t=(now-this.started)/1000,pose=this._cupPose(t);
    if(this.phase==="rolling"){this.acc+=dt;while(this.acc>=1/60){this._physics(1/60,t,pose);this.acc-=1/60;}}
    this._resize();const gl=this.gl;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);const aspect=Math.max(.2,this.canvas.width/Math.max(1,this.canvas.height)),view=lookAt([0,4.0,8.6],[0,1.25,0],[0,1,0]),projection=perspective(Math.PI/4.4,aspect,.1,50);for(const object of this._scene(now))this._draw(object,view,projection);this.frame=requestAnimationFrame(this._tick);
  };

  dispose(){this.disposed=true;if(this.frame)cancelAnimationFrame(this.frame);const gl=this.gl;if(gl){for(const mesh of Object.values(this.meshes))disposeMesh(gl,mesh);for(const texture of Object.values(this.textures))gl.deleteTexture(texture);if(this.program)gl.deleteProgram(this.program);}this.meshes={};this.textures={};}
}
