import { CARD_MODEL_DATA } from "./model-data.js";
import { createProgram, createMesh, createTexture, compose, orthographic, lookAt, disposeMesh } from "./packed-webgl.js";

const VS=`#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec4 uUVTransform;
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUV;
void main(){
  vec4 world=uModel*vec4(aPosition,1.0);
  vWorld=world.xyz;
  vNormal=normalize(mat3(uModel)*aNormal);
  vUV=aUV*uUVTransform.zw+uUVTransform.xy;
  gl_Position=uProjection*uView*world;
}`;

const FS=`#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUV;
uniform sampler2D uTexture;
uniform vec3 uLight;
uniform float uTint;
out vec4 outColor;
void main(){
  vec4 tex=texture(uTexture,vUV);
  vec3 n=normalize(vNormal);
  float diff=max(dot(n,normalize(uLight-vWorld)),0.0);
  float light=.68+.32*diff;
  outColor=vec4(tex.rgb*light*uTint,tex.a);
}`;

function planeData(z,normal,reverse=false){
  const positions=new Float32Array([
    -.5,-.5,z, .5,-.5,z, .5,.5,z, -.5,.5,z
  ]);
  const normals=new Float32Array(Array.from({length:4},()=>normal).flat());
  const uvs=new Float32Array([0,0, 1,0, 1,1, 0,1]);
  const indices=new Uint32Array(reverse?[0,2,1,0,3,2]:[0,1,2,0,2,3]);
  return {positions,normals,uvs,indices,count:indices.length};
}

function edgeData(){
  const p=[],n=[],uv=[],idx=[];
  const z0=-.045,z1=.045;
  const sides=[
    {a:[-.5,-.5],b:[.5,-.5],normal:[0,-1,0]},
    {a:[.5,-.5],b:[.5,.5],normal:[1,0,0]},
    {a:[.5,.5],b:[-.5,.5],normal:[0,1,0]},
    {a:[-.5,.5],b:[-.5,-.5],normal:[-1,0,0]}
  ];
  for(const side of sides){
    const base=p.length/3;
    p.push(side.a[0],side.a[1],z0, side.b[0],side.b[1],z0, side.b[0],side.b[1],z1, side.a[0],side.a[1],z1);
    for(let i=0;i<4;i++)n.push(...side.normal);
    uv.push(0,0,1,0,1,1,0,1);
    idx.push(base,base+1,base+2,base,base+2,base+3);
  }
  return {positions:new Float32Array(p),normals:new Float32Array(n),uvs:new Float32Array(uv),indices:new Uint32Array(idx),count:idx.length};
}

function solidTexture(gl,rgba){
  const t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  return t;
}

export class CardTableWebGL{
  constructor(canvas,board,{designWidth,designHeight,cardSelector,deckSelector}){
    this.canvas=canvas;
    this.board=board;
    this.designWidth=designWidth;
    this.designHeight=designHeight;
    this.cardSelector=cardSelector;
    this.deckSelector=deckSelector;
    this.gl=null;
    this.meshes={};
    this.textures={};
    this.cards=[];
    this.resizeObserver=null;
    this.disposed=false;
  }

  async init(){
    const gl=this.canvas?.getContext("webgl2",{alpha:true,antialias:true,premultipliedAlpha:false});
    if(!gl)throw new Error("WebGL2 indisponível para cartas 3D.");
    this.gl=gl;
    this.program=createProgram(gl,VS,FS);
    this.loc={
      position:gl.getAttribLocation(this.program,"aPosition"),
      normal:gl.getAttribLocation(this.program,"aNormal"),
      uv:gl.getAttribLocation(this.program,"aUV"),
      model:gl.getUniformLocation(this.program,"uModel"),
      view:gl.getUniformLocation(this.program,"uView"),
      projection:gl.getUniformLocation(this.program,"uProjection"),
      uvTransform:gl.getUniformLocation(this.program,"uUVTransform"),
      texture:gl.getUniformLocation(this.program,"uTexture"),
      light:gl.getUniformLocation(this.program,"uLight"),
      tint:gl.getUniformLocation(this.program,"uTint")
    };

    this.meshes.front=createMesh(gl,this.loc,planeData(.045,[0,0,1]));
    this.meshes.back=createMesh(gl,this.loc,planeData(-.045,[0,0,-1],true));
    this.meshes.edge=createMesh(gl,this.loc,edgeData());
    [this.textures.front,this.textures.back]=await Promise.all([
      createTexture(gl,CARD_MODEL_DATA.frontAtlas),
      createTexture(gl,CARD_MODEL_DATA.backTexture)
    ]);
    this.textures.edge=solidTexture(gl,[58,43,42,255]);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);

    this.sync();
    this.resizeObserver=new ResizeObserver(()=>this.sync());
    this.resizeObserver.observe(this.board);
    return this;
  }

  _rectToBoard(el){
    const br=this.board.getBoundingClientRect(),r=el.getBoundingClientRect();
    if(!br.width||!br.height)return{x:0,y:0,width:0,height:0};
    const sx=this.designWidth/br.width,sy=this.designHeight/br.height;
    return{x:(r.left-br.left)*sx,y:(r.top-br.top)*sy,width:r.width*sx,height:r.height*sy};
  }

  sync(){
    if(this.disposed||!this.gl)return;
    this.cards=[];
    let order=0;
    for(const el of this.board.querySelectorAll(this.cardSelector)){
      const r=this._rectToBoard(el);
      if(r.width<2||r.height<2)continue;
      this.cards.push({
        key:el.dataset.cardKey||"A♠",
        hidden:el.dataset.cardHidden==="true",
        ...r,
        z:1+order*.035,
        angle:((order%5)-2)*.012
      });
      order++;
    }

    const deck=this.board.querySelector(this.deckSelector);
    if(deck){
      const r=this._rectToBoard(deck);
      const h=Math.max(58,Math.min(74,r.height*.82));
      const w=h*.52;
      for(let i=0;i<3;i++)this.cards.push({
        key:"A♠",hidden:true,
        x:r.x+r.width/2-w/2+i*1.1,
        y:r.y+r.height/2-h/2-i*1.1,
        width:w,height:h,z:.35+i*.05,angle:-.022
      });
    }
    this.render();
  }

  _resize(){
    const dpr=Math.min(globalThis.devicePixelRatio||1,2);
    const w=Math.max(2,Math.floor(this.canvas.clientWidth*dpr));
    const h=Math.max(2,Math.floor(this.canvas.clientHeight*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    this.gl.viewport(0,0,w,h);
  }

  _draw(mesh,texture,model,uv,view,proj,tint=1){
    const gl=this.gl;
    gl.uniformMatrix4fv(this.loc.model,false,compose(model));
    gl.uniformMatrix4fv(this.loc.view,false,view);
    gl.uniformMatrix4fv(this.loc.projection,false,proj);
    gl.uniform4f(this.loc.uvTransform,...uv);
    gl.uniform3f(this.loc.light,-260,420,700);
    gl.uniform1f(this.loc.tint,tint);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.uniform1i(this.loc.texture,0);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);
  }

  render(){
    if(this.disposed||!this.gl)return;
    this._resize();
    const gl=this.gl;
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const view=lookAt([0,0,1200],[0,0,0],[0,1,0]);
    const proj=orthographic(-this.designWidth/2,this.designWidth/2,-this.designHeight/2,this.designHeight/2,.1,2000);

    for(const c of this.cards){
      const cx=c.x+c.width/2-this.designWidth/2;
      const cy=this.designHeight/2-(c.y+c.height/2);
      const model={position:[cx,cy,c.z],rotation:[-.075,.035,c.angle],scale:[c.width,c.height,Math.min(c.width,c.height)]};
      const rect=CARD_MODEL_DATA.map[c.key]||CARD_MODEL_DATA.map["A♠"]||[0,0,1/13,1/4];
      const frontUV=[rect[0],1-rect[1]-rect[3],rect[2],rect[3]];
      const faceTexture=c.hidden?this.textures.back:this.textures.front;
      const faceUV=c.hidden?[0,0,1,1]:frontUV;

      this._draw(this.meshes.edge,this.textures.edge,model,[0,0,1,1],view,proj,.94);
      this._draw(this.meshes.front,faceTexture,model,faceUV,view,proj,1.04);
      this._draw(this.meshes.back,this.textures.back,model,[0,0,1,1],view,proj,.98);
    }
  }

  dispose(){
    this.disposed=true;
    this.resizeObserver?.disconnect();
    const gl=this.gl;
    if(gl){
      for(const m of Object.values(this.meshes))disposeMesh(gl,m);
      for(const t of Object.values(this.textures))gl.deleteTexture(t);
      if(this.program)gl.deleteProgram(this.program);
    }
    this.meshes={};
    this.textures={};
  }
}
