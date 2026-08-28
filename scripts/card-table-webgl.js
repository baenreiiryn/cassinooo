import { CARD_MODEL_DATA } from "./model-data.js";
import { decodePackedMesh, createProgram, createMesh, createTexture, compose, orthographic, lookAt, disposeMesh } from "./packed-webgl.js";

const VS=`#version 300 es
precision highp float;
in vec3 aPosition;in vec3 aNormal;in vec2 aUV;
uniform mat4 uModel,uView,uProjection;uniform vec4 uUVTransform;
out vec3 vNormal;out vec3 vWorld;out vec2 vUV;
void main(){vec4 world=uModel*vec4(aPosition,1.0);vWorld=world.xyz;vNormal=normalize(mat3(uModel)*aNormal);vUV=aUV*uUVTransform.zw+uUVTransform.xy;gl_Position=uProjection*uView*world;}`;
const FS=`#version 300 es
precision highp float;
in vec3 vNormal;in vec3 vWorld;in vec2 vUV;
uniform sampler2D uTexture;uniform vec3 uLight;uniform float uTint;
out vec4 outColor;
void main(){vec4 tex=texture(uTexture,vUV);vec3 n=normalize(vNormal);float diff=max(dot(n,normalize(uLight-vWorld)),0.0);float light=.48+.52*diff;outColor=vec4(tex.rgb*light*uTint,tex.a);}`;

function solidTexture(gl,rgba){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return t;}

export class CardTableWebGL{
  constructor(canvas,board,{designWidth,designHeight,cardSelector,deckSelector}){this.canvas=canvas;this.board=board;this.designWidth=designWidth;this.designHeight=designHeight;this.cardSelector=cardSelector;this.deckSelector=deckSelector;this.gl=null;this.meshes={};this.textures={};this.cards=[];this.resizeObserver=null;this.disposed=false;}
  async init(){
    const gl=this.canvas?.getContext("webgl2",{alpha:true,antialias:true,premultipliedAlpha:false});if(!gl)throw new Error("WebGL2 indisponível para cartas 3D.");this.gl=gl;this.program=createProgram(gl,VS,FS);this.loc={position:gl.getAttribLocation(this.program,"aPosition"),normal:gl.getAttribLocation(this.program,"aNormal"),uv:gl.getAttribLocation(this.program,"aUV"),model:gl.getUniformLocation(this.program,"uModel"),view:gl.getUniformLocation(this.program,"uView"),projection:gl.getUniformLocation(this.program,"uProjection"),uvTransform:gl.getUniformLocation(this.program,"uUVTransform"),texture:gl.getUniformLocation(this.program,"uTexture"),light:gl.getUniformLocation(this.program,"uLight"),tint:gl.getUniformLocation(this.program,"uTint")};
    const [front,back,edge]=await Promise.all([decodePackedMesh(CARD_MODEL_DATA.geometry.front),decodePackedMesh(CARD_MODEL_DATA.geometry.back),decodePackedMesh(CARD_MODEL_DATA.geometry.edge)]);this.meshes.front=createMesh(gl,this.loc,front);this.meshes.back=createMesh(gl,this.loc,back);this.meshes.edge=createMesh(gl,this.loc,edge);
    [this.textures.front,this.textures.back]=await Promise.all([createTexture(gl,CARD_MODEL_DATA.frontAtlas),createTexture(gl,CARD_MODEL_DATA.backTexture)]);this.textures.edge=solidTexture(gl,[36,24,88,255]);
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this.sync();this.resizeObserver=new ResizeObserver(()=>this.sync());this.resizeObserver.observe(this.board);return this;
  }
  _rectToBoard(el){const br=this.board.getBoundingClientRect(),r=el.getBoundingClientRect(),sx=this.designWidth/br.width,sy=this.designHeight/br.height;return{x:(r.left-br.left)*sx,y:(r.top-br.top)*sy,width:r.width*sx,height:r.height*sy};}
  sync(){if(this.disposed||!this.gl)return;this.cards=[];let order=0;for(const el of this.board.querySelectorAll(this.cardSelector)){const r=this._rectToBoard(el);this.cards.push({key:el.dataset.cardKey||"A♠",hidden:el.dataset.cardHidden==="true",...r,z:1+order*.025,angle:((order%5)-2)*.015});order++;}
    const deck=this.board.querySelector(this.deckSelector);if(deck){const r=this._rectToBoard(deck);for(let i=0;i<3;i++)this.cards.push({key:"A♠",hidden:true,x:r.x+i*.8,y:r.y-i*.8,width:Math.max(38,r.width*.48),height:Math.max(56,r.height*.72),z:.35+i*.04,angle:-.025});}
    this.render();}
  _resize(){const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(2,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(2,Math.floor(this.canvas.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.gl.viewport(0,0,w,h);}
  _draw(mesh,texture,model,uv,view,proj,tint=1){const gl=this.gl;gl.uniformMatrix4fv(this.loc.model,false,compose(model));gl.uniformMatrix4fv(this.loc.view,false,view);gl.uniformMatrix4fv(this.loc.projection,false,proj);gl.uniform4f(this.loc.uvTransform,...uv);gl.uniform3f(this.loc.light,-320,440,600);gl.uniform1f(this.loc.tint,tint);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.loc.texture,0);gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);}
  render(){if(this.disposed||!this.gl)return;this._resize();const gl=this.gl;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);const view=lookAt([0,0,1200],[0,0,0],[0,1,0]),proj=orthographic(-this.designWidth/2,this.designWidth/2,-this.designHeight/2,this.designHeight/2,.1,2000);
    for(const c of this.cards){const cx=c.x+c.width/2-this.designWidth/2,cy=this.designHeight/2-(c.y+c.height/2);const baseRot=[-.055,.045+(c.hidden?Math.PI:0),c.angle];const model={position:[cx,cy,c.z],rotation:baseRot,scale:[c.width,c.height/2,Math.max(c.width*.6,c.height*.25)]};const rect=CARD_MODEL_DATA.map[c.key]||CARD_MODEL_DATA.map["A♠"]||[0,0,1/13,1/4];const sy=1-rect[1]-rect[3],frontUV=[rect[0],sy,rect[2],rect[3]];
      this._draw(this.meshes.edge,this.textures.edge,model,[0,0,1,1],view,proj,.95);this._draw(this.meshes.front,this.textures.front,model,frontUV,view,proj,1.06);this._draw(this.meshes.back,this.textures.back,model,[0,0,1,1],view,proj,1.02);
    }}
  dispose(){this.disposed=true;this.resizeObserver?.disconnect();const gl=this.gl;if(gl){for(const m of Object.values(this.meshes))disposeMesh(gl,m);for(const t of Object.values(this.textures))gl.deleteTexture(t);if(this.program)gl.deleteProgram(this.program);}this.meshes={};this.textures={};}
}
