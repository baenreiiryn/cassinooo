const MODULE_ROOT="modules/cassinooo";
const MODEL_URLS={d4:`${MODULE_ROOT}/assets/models/d4.obj`,d6:`${MODULE_ROOT}/assets/models/d6.obj`,d8:`${MODULE_ROOT}/assets/models/d8.obj`,cup:`${MODULE_ROOT}/assets/models/dice-cup.obj`};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=v=>{v=clamp(v,0,1);return 1-Math.pow(1-v,3)};
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function norm(v){const l=Math.hypot(...v)||1;return mul(v,1/l)}

function rx(v,a){const c=Math.cos(a),s=Math.sin(a);return[v[0],v[1]*c-v[2]*s,v[1]*s+v[2]*c]}
function ry(v,a){const c=Math.cos(a),s=Math.sin(a);return[v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c]}
function rz(v,a){const c=Math.cos(a),s=Math.sin(a);return[v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]]}
function rotate(v,r){return rz(ry(rx(v,r[0]),r[1]),r[2])}
function inverseRotate(v,r){return rx(ry(rz(v,-r[2]),-r[1]),-r[0])}

function I(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
function mm(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}
function mt(x,y,z){const m=I();m[12]=x;m[13]=y;m[14]=z;return m}
function ms(x,y,z){const m=I();m[0]=x;m[5]=y;m[10]=z;return m}
function mx(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1])}
function my(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1])}
function mz(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1])}
function compose(o){let m=mt(...(o.position||[0,0,0]));const r=o.rotation||[0,0,0],s=o.scale||[1,1,1];m=mm(m,mz(r[2]));m=mm(m,my(r[1]));m=mm(m,mx(r[0]));return mm(m,ms(...s))}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
function lookAt(e,t,u=[0,1,0]){const z=norm(sub(e,t)),x=norm(cross(u,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1])}

function parseOBJ(text){const pts=[],p=[],n=[];for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line||line[0]==="#")continue;const a=line.split(/\s+/);if(a[0]==="v")pts.push([+a[1],+a[2],+a[3]]);if(a[0]!=="f")continue;const ids=a.slice(1).map(x=>+x.split("/")[0]).map(i=>i<0?pts.length+i:i-1);for(let j=1;j<ids.length-1;j++){const tri=[pts[ids[0]],pts[ids[j]],pts[ids[j+1]]],nn=norm(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])));for(const v of tri){p.push(...v);n.push(...nn)}}}return{positions:new Float32Array(p),normals:new Float32Array(n),count:p.length/3}}
function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||"shader");return s}
function makeProgram(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||"program");return p}
const VS=`#version 300 es\nprecision highp float;in vec3 aPosition;in vec3 aNormal;uniform mat4 uModel,uView,uProjection;out vec3 vNormal,vWorld;void main(){vec4 w=uModel*vec4(aPosition,1.);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*aNormal);gl_Position=uProjection*uView*w;}`;
const FS=`#version 300 es\nprecision highp float;in vec3 vNormal,vWorld;uniform vec3 uColor,uLight;uniform float uMetallic;out vec4 outColor;void main(){vec3 n=normalize(vNormal),l=normalize(uLight-vWorld);float d=max(dot(n,l),0.),rim=pow(1.-max(dot(n,normalize(vec3(0.,3.,7.)-vWorld)),0.),2.);vec3 c=uColor*(.24+.76*d)+vec3(.28,.18,.09)*rim*(.25+uMetallic*.7);outColor=vec4(c,1.);}`;

export class DragonDiceWebGL{
 constructor(canvas){this.canvas=canvas;this.gl=null;this.meshes=new Map();this.phase="idle";this.dice={d4:1,d6:1,d8:1};this.started=performance.now();this.frame=null;this.disposed=false;this.bodies=[];this.acc=0;this.lastFrame=performance.now()}
 async init(){const gl=this.canvas?.getContext("webgl2",{alpha:true,antialias:true,premultipliedAlpha:false});if(!gl)throw new Error("WebGL2 indisponível neste navegador.");this.gl=gl;this.program=makeProgram(gl,VS,FS);this.l={pos:gl.getAttribLocation(this.program,"aPosition"),normal:gl.getAttribLocation(this.program,"aNormal"),model:gl.getUniformLocation(this.program,"uModel"),view:gl.getUniformLocation(this.program,"uView"),projection:gl.getUniformLocation(this.program,"uProjection"),color:gl.getUniformLocation(this.program,"uColor"),light:gl.getUniformLocation(this.program,"uLight"),metallic:gl.getUniformLocation(this.program,"uMetallic")};await Promise.all(Object.entries(MODEL_URLS).map(async([k,url])=>{const r=await fetch(url);if(!r.ok)throw new Error(`Falha carregando ${url}`);this.meshes.set(k,this._mesh(parseOBJ(await r.text())))}));gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);this._tick();return this}
 _mesh(d){const gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,d.positions,gl.STATIC_DRAW);gl.enableVertexAttribArray(this.l.pos);gl.vertexAttribPointer(this.l.pos,3,gl.FLOAT,false,0,0);const nb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,d.normals,gl.STATIC_DRAW);gl.enableVertexAttribArray(this.l.normal);gl.vertexAttribPointer(this.l.normal,3,gl.FLOAT,false,0,0);gl.bindVertexArray(null);return{vao,count:d.count,buffers:[pb,nb]}}
 setState(phase,dice){this.phase=phase||"idle";if(dice)this.dice={...this.dice,...dice};this.started=performance.now();this.lastFrame=this.started;this.acc=0;if(this.phase==="rolling")this._resetBodies()}
 _resetBodies(){const kinds=["d4","d6","d8"],rad=[.28,.31,.31];this.bodies=kinds.map((kind,i)=>({kind,radius:rad[i],position:[-.34+i*.34,-.05+(i%2)*.2,(i-1)*.15],velocity:[(Math.random()-.5)*1.3,.3+Math.random(),(Math.random()-.5)*1.3],rotation:[Math.random()*3,Math.random()*3,Math.random()*3],angular:[5+Math.random()*4,6+Math.random()*5,4+Math.random()*5]}))}
 _finalRot(k,v){v=+v||1;if(k==="d6"){const m={1:[0,0,0],2:[Math.PI/2,0,0],3:[0,-Math.PI/2,0],4:[0,Math.PI/2,0],5:[-Math.PI/2,0,0],6:[Math.PI,0,0]};return m[v]||[0,0,0]}return[((v*1.17)%3.1)-1.55,((v*.83)%3.1)-1.55,((v*.51)%2.2)-1.1]}
 _cupPose(t){if(this.phase==="rolling"){const flip=ease((t-1.25)/.95);if(t<1.25)return{position:[Math.sin(t*9)*.42,2.05+Math.abs(Math.sin(t*7))*.34,Math.cos(t*8)*.18],rotation:[Math.sin(t*7)*.18,Math.sin(t*5)*.12,Math.sin(t*10)*.25],scale:1.58,flip:0};return{position:[0,2.05-1.17*flip,0],rotation:[Math.PI*flip,.1*Math.sin(flip*Math.PI),-.1*Math.sin(flip*Math.PI)],scale:1.62,flip}}
  if(this.phase==="betting")return{position:[0,.88,0],rotation:[Math.PI,0,0],scale:1.65,flip:1};
  if(this.phase==="revealed"){const p=ease(t/1.15);return{position:[2.8*p,.88+2.9*p,-.25*p],rotation:[Math.PI-.55*p,.15*p,-.35*p],scale:1.65,flip:1}}
  if(this.phase==="revealed-static")return{position:[2.8,3.78,-.25],rotation:[Math.PI-.55,.15,-.35],scale:1.65,flip:1};
  return{position:[0,2.35,0],rotation:[0,0,0],scale:1.58,flip:0}}
 _radiusAt(y){const q=clamp((y+.58)/1.18,0,1);return .58+(.28*q)}
 _physics(dt,t,pose){const gravity=inverseRotate([0,-8.4,0],pose.rotation),shake=t<1.25?[Math.sin(t*17)*13,Math.sin(t*23)*4,Math.cos(t*19)*13]:[0,0,0];for(const b of this.bodies){b.velocity=add(b.velocity,mul(add(gravity,shake),dt));b.velocity=mul(b.velocity,.994);b.position=add(b.position,mul(b.velocity,dt));b.rotation=add(b.rotation,mul(b.angular,dt));b.angular=mul(b.angular,.992);
   const ymin=-.52+b.radius,ymax=.52-b.radius;if(b.position[1]<ymin){b.position[1]=ymin;b.velocity[1]=Math.abs(b.velocity[1])*.48;b.angular=add(b.angular,[.7,-.4,.5])}if(b.position[1]>ymax){b.position[1]=ymax;b.velocity[1]=-Math.abs(b.velocity[1])*.48;b.angular=add(b.angular,[-.5,.6,.4])}
   const rr=Math.hypot(b.position[0],b.position[2]),limit=Math.max(.16,this._radiusAt(b.position[1])-b.radius);if(rr>limit){const nx=b.position[0]/rr,nz=b.position[2]/rr;b.position[0]=nx*limit;b.position[2]=nz*limit;const vn=b.velocity[0]*nx+b.velocity[2]*nz;if(vn>0){b.velocity[0]-=(1.55*vn)*nx;b.velocity[2]-=(1.55*vn)*nz}b.angular=add(b.angular,[nz*1.3,.5,-nx*1.3])}}
  for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++){const a=this.bodies[i],b=this.bodies[j],d=sub(b.position,a.position),dist=Math.hypot(...d)||.001,min=a.radius+b.radius;if(dist<min){const n=mul(d,1/dist),push=(min-dist)/2;a.position=sub(a.position,mul(n,push));b.position=add(b.position,mul(n,push));const rel=dot(sub(b.velocity,a.velocity),n);if(rel<0){const imp=rel*-.78;a.velocity=sub(a.velocity,mul(n,imp));b.velocity=add(b.velocity,mul(n,imp));a.angular=add(a.angular,[n[2],.3,-n[0]]);b.angular=add(b.angular,[-n[2],-.3,n[0]])}}}}
 _bodyWorld(b,pose){const p=add(pose.position,mul(rotate(b.position,pose.rotation),pose.scale));return{mesh:b.kind,position:p,rotation:add(pose.rotation,b.rotation),scale:[.72,.72,.72],color:b.kind==="d4"?[.12,.67,.29]:b.kind==="d6"?[.13,.39,.86]:[.78,.12,.12],metallic:.15}}
 _scene(now){const t=(now-this.started)/1000,pose=this._cupPose(t),out=[];if(this.phase==="rolling"){if(!this.bodies.length)this._resetBodies();for(const b of this.bodies)out.push(this._bodyWorld(b,pose))}else if(this.phase==="betting"){const bases=[[-.27,.17,-.08],[.18,.12,.11],[.08,-.18,-.1]],k=["d4","d6","d8"];for(let i=0;i<3;i++){const b={kind:k[i],position:bases[i],rotation:this._finalRot(k[i],this.dice[k[i]])};out.push(this._bodyWorld(b,pose))}}else{const bases=[[-1.05,.28,0],[0,.28,.1],[1.05,.28,-.04]],k=["d4","d6","d8"];for(let i=0;i<3;i++)out.push({mesh:k[i],position:bases[i],rotation:this._finalRot(k[i],this.dice[k[i]]),scale:[.72,.72,.72],color:i===0?[.12,.67,.29]:i===1?[.13,.39,.86]:[.78,.12,.12],metallic:.15})}
  out.push({mesh:"cup",position:pose.position,rotation:pose.rotation,scale:[pose.scale,pose.scale,pose.scale],color:[.31,.10,.055],metallic:.62,twoSided:true});return out}
 _resize(){const d=Math.min(devicePixelRatio||1,2),w=Math.max(2,Math.floor(this.canvas.clientWidth*d)),h=Math.max(2,Math.floor(this.canvas.clientHeight*d));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}this.gl.viewport(0,0,w,h);return w/h}
 _draw(o,v,p){const gl=this.gl,m=this.meshes.get(o.mesh);if(!m)return;if(o.twoSided)gl.disable(gl.CULL_FACE);gl.uniformMatrix4fv(this.l.model,false,compose(o));gl.uniformMatrix4fv(this.l.view,false,v);gl.uniformMatrix4fv(this.l.projection,false,p);gl.uniform3fv(this.l.color,o.color);gl.uniform3fv(this.l.light,[3.8,6.5,5]);gl.uniform1f(this.l.metallic,o.metallic||0);gl.bindVertexArray(m.vao);gl.drawArrays(gl.TRIANGLES,0,m.count);if(o.twoSided)gl.enable(gl.CULL_FACE)}
 _tick=()=>{if(this.disposed)return;const now=performance.now(),dt=Math.min(.05,(now-this.lastFrame)/1000);this.lastFrame=now;this.acc+=dt;const t=(now-this.started)/1000,pose=this._cupPose(t);if(this.phase==="rolling")while(this.acc>=1/60){this._physics(1/60,t,pose);this.acc-=1/60}else this.acc=0;const gl=this.gl,aspect=this._resize();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);const v=lookAt([0,4.2,7.4],[0,.55,0]),p=perspective(Math.PI/4.3,aspect,.1,50);for(const o of this._scene(now))this._draw(o,v,p);this.frame=requestAnimationFrame(this._tick)}
 dispose(){this.disposed=true;if(this.frame)cancelAnimationFrame(this.frame);const gl=this.gl;if(gl){for(const m of this.meshes.values()){gl.deleteVertexArray(m.vao);for(const b of m.buffers)gl.deleteBuffer(b)}if(this.program)gl.deleteProgram(this.program)}this.meshes.clear()}
}
