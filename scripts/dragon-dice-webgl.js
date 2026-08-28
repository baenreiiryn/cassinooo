const MODULE_ROOT = "modules/cassinooo";

const MODEL_URLS = {
  d4: `${MODULE_ROOT}/assets/models/d4.obj`,
  d6: `${MODULE_ROOT}/assets/models/d6.obj`,
  d8: `${MODULE_ROOT}/assets/models/d8.obj`,
  cup: `${MODULE_ROOT}/assets/models/dice-cup.obj`
};

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }

function mat4Identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) {
    out[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
  }
  return out;
}
function mat4Translation(x,y,z) { const m=mat4Identity(); m[12]=x;m[13]=y;m[14]=z;return m; }
function mat4Scale(x,y,z) { const m=mat4Identity(); m[0]=x;m[5]=y;m[10]=z;return m; }
function mat4RotX(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
function mat4RotY(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
function mat4RotZ(a) { const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
function compose({position=[0,0,0], rotation=[0,0,0], scale=[1,1,1]}) {
  let m=mat4Translation(...position);
  m=mat4Multiply(m,mat4RotZ(rotation[2]));
  m=mat4Multiply(m,mat4RotY(rotation[1]));
  m=mat4Multiply(m,mat4RotX(rotation[0]));
  return mat4Multiply(m,mat4Scale(...scale));
}
function perspective(fov, aspect, near, far) {
  const f=1/Math.tan(fov/2), nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0]);
}
function lookAt(eye,target,up=[0,1,0]) {
  const z=normalize(sub(eye,target));
  const x=normalize(cross(up,z));
  const y=cross(z,x);
  return new Float32Array([
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
    -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
    -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1
  ]);
}

function parseOBJ(text) {
  const points=[];
  const positions=[];
  const normals=[];
  for (const raw of text.split(/\r?\n/)) {
    const line=raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p=line.split(/\s+/);
    if (p[0]==="v") points.push([Number(p[1]),Number(p[2]),Number(p[3])]);
    if (p[0]!=="f") continue;
    const ids=p.slice(1).map(v=>Number(v.split("/")[0])).map(i=>i<0?points.length+i:i-1);
    for (let i=1;i<ids.length-1;i++) {
      const tri=[points[ids[0]],points[ids[i]],points[ids[i+1]]];
      const n=normalize(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])));
      for (const v of tri) { positions.push(...v); normals.push(...n); }
    }
  }
  return { positions:new Float32Array(positions), normals:new Float32Array(normals), count:positions.length/3 };
}

function shader(gl,type,source){
  const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||"Shader error");
  return s;
}
function program(gl,vs,fs){
  const p=gl.createProgram(); gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs)); gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||"Program error");
  return p;
}

const VS=`#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
out vec3 vNormal;
out vec3 vWorld;
void main(){
  vec4 world=uModel*vec4(aPosition,1.0);
  vWorld=world.xyz;
  vNormal=normalize(mat3(uModel)*aNormal);
  gl_Position=uProjection*uView*world;
}`;
const FS=`#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uLight;
uniform float uMetallic;
out vec4 outColor;
void main(){
  vec3 n=normalize(vNormal);
  vec3 l=normalize(uLight-vWorld);
  float diff=max(dot(n,l),0.0);
  float rim=pow(1.0-max(dot(n,normalize(vec3(0.0,3.0,7.0)-vWorld)),0.0),2.0);
  vec3 c=uColor*(0.28+0.72*diff)+vec3(0.20,0.14,0.08)*rim*(0.35+uMetallic*0.55);
  outColor=vec4(c,1.0);
}`;

export class DragonDiceWebGL {
  constructor(canvas){
    this.canvas=canvas;
    this.gl=null;
    this.meshes=new Map();
    this.phase="idle";
    this.dice={d4:1,d6:1,d8:1};
    this.started=performance.now();
    this.frame=null;
    this.disposed=false;
  }

  async init(){
    const gl=this.canvas?.getContext("webgl2",{alpha:true,antialias:true,premultipliedAlpha:false});
    if(!gl) throw new Error("WebGL2 indisponível neste navegador.");
    this.gl=gl;
    this.program=program(gl,VS,FS);
    this.locations={
      pos:gl.getAttribLocation(this.program,"aPosition"), normal:gl.getAttribLocation(this.program,"aNormal"),
      model:gl.getUniformLocation(this.program,"uModel"), view:gl.getUniformLocation(this.program,"uView"), projection:gl.getUniformLocation(this.program,"uProjection"),
      color:gl.getUniformLocation(this.program,"uColor"), light:gl.getUniformLocation(this.program,"uLight"), metallic:gl.getUniformLocation(this.program,"uMetallic")
    };
    await Promise.all(Object.entries(MODEL_URLS).map(async ([name,url])=>{
      const response=await fetch(url); if(!response.ok) throw new Error(`Falha carregando ${url}`);
      this.meshes.set(name,this._createMesh(parseOBJ(await response.text())));
    }));
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    this._tick();
    return this;
  }

  _createMesh(data){
    const gl=this.gl, vao=gl.createVertexArray(); gl.bindVertexArray(vao);
    const pb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,pb); gl.bufferData(gl.ARRAY_BUFFER,data.positions,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.locations.pos); gl.vertexAttribPointer(this.locations.pos,3,gl.FLOAT,false,0,0);
    const nb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,nb); gl.bufferData(gl.ARRAY_BUFFER,data.normals,gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.locations.normal); gl.vertexAttribPointer(this.locations.normal,3,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null); return {vao,count:data.count,buffers:[pb,nb]};
  }

  setState(phase,dice){
    this.phase=phase||"idle";
    if(dice) this.dice={...this.dice,...dice};
    this.started=performance.now();
  }

  _dieFinalRotation(kind,value){
    const v=Number(value)||1;
    if(kind==="d6") {
      const map={1:[0,0,0],2:[Math.PI/2,0,0],3:[0,-Math.PI/2,0],4:[0,Math.PI/2,0],5:[-Math.PI/2,0,0],6:[Math.PI,0,0]};
      return map[v]||[0,0,0];
    }
    // d4/d8 values are represented by deterministic orientations. Visible labels are HTML overlays.
    return [((v*1.17)%3.1)-1.55,((v*0.83)%3.1)-1.55,((v*0.51)%2.2)-1.1];
  }

  _scene(now){
    const t=(now-this.started)/1000;
    const rolling=this.phase==="rolling";
    const covered=this.phase==="betting";
    const revealed=this.phase==="revealed";
    const diceBase=[[-1.15,0.28,0],[0,0.28,0.12],[1.15,0.28,-0.05]];
    const kinds=["d4","d6","d8"];
    const values=[this.dice.d4,this.dice.d6,this.dice.d8];
    const objects=[];

    for(let i=0;i<3;i++){
      let pos=[...diceBase[i]], rot=this._dieFinalRotation(kinds[i],values[i]);
      if(rolling){
        pos=[diceBase[i][0]+Math.sin(t*8+i)*0.38,0.65+Math.abs(Math.sin(t*7.5+i))*0.72,diceBase[i][2]+Math.cos(t*7+i)*0.32];
        rot=[t*(6.2+i*1.4),t*(7.7+i),t*(5.4+i*.8)];
      }
      objects.push({mesh:kinds[i],position:pos,rotation:rot,scale:[.72,.72,.72],color:i===0?[.12,.67,.29]:i===1?[.13,.39,.86]:[.78,.12,.12],metallic:.15});
    }

    let cup={position:[0,2.35,0],rotation:[0,0,0],scale:[1.55,1.55,1.55]};
    if(rolling){
      cup.position=[Math.sin(t*8)*.45,2.0+Math.abs(Math.sin(t*6))*.45,Math.cos(t*7)*.20];
      cup.rotation=[Math.sin(t*7)*.22,Math.sin(t*5)*.18,Math.sin(t*9)*.28];
    } else if(covered){
      cup={position:[0,.88,0],rotation:[Math.PI,0,0],scale:[1.65,1.65,1.65]};
    } else if(revealed){
      const p=Math.min(1,t/1.15), ease=1-Math.pow(1-p,3);
      cup={position:[2.8*ease,.88+2.9*ease,-.25*ease],rotation:[Math.PI-(.55*ease),.15*ease,-.35*ease],scale:[1.65,1.65,1.65]};
    }
    objects.push({mesh:"cup",...cup,color:[.31,.10,.055],metallic:.62});
    return objects;
  }

  _resize(){
    const dpr=Math.min(window.devicePixelRatio||1,2), w=Math.max(2,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(2,Math.floor(this.canvas.clientHeight*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.gl.viewport(0,0,w,h); return w/h;
  }

  _draw(obj,view,projection){
    const gl=this.gl, mesh=this.meshes.get(obj.mesh); if(!mesh)return;
    gl.uniformMatrix4fv(this.locations.model,false,compose(obj));
    gl.uniformMatrix4fv(this.locations.view,false,view); gl.uniformMatrix4fv(this.locations.projection,false,projection);
    gl.uniform3fv(this.locations.color,obj.color); gl.uniform3fv(this.locations.light,[3.8,6.5,5.0]); gl.uniform1f(this.locations.metallic,obj.metallic||0);
    gl.bindVertexArray(mesh.vao); gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }

  _tick=()=>{
    if(this.disposed)return;
    const gl=this.gl, aspect=this._resize();
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
    const view=lookAt([0,4.2,7.4],[0,.55,0],[0,1,0]);
    const proj=perspective(Math.PI/4.3,aspect,.1,50);
    for(const obj of this._scene(performance.now())) this._draw(obj,view,proj);
    this.frame=requestAnimationFrame(this._tick);
  }

  dispose(){
    this.disposed=true; if(this.frame)cancelAnimationFrame(this.frame);
    const gl=this.gl;
    if(gl){for(const m of this.meshes.values()){gl.deleteVertexArray(m.vao);for(const b of m.buffers)gl.deleteBuffer(b);} if(this.program)gl.deleteProgram(this.program);}
    this.meshes.clear();
  }
}
