function b64Bytes(text){
  const binary=atob(text); const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) out[i]=binary.charCodeAt(i);
  return out;
}

async function gunzip(bytes){
  if(typeof DecompressionStream!=="undefined"){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error("DecompressionStream/gzip indisponível neste navegador.");
}

export async function decodePackedMesh(data){
  const raw=await gunzip(b64Bytes(data.payload));
  const [pPart,nPart,uvPart,iPart]=data.parts;
  const pView=new Uint16Array(raw.buffer,raw.byteOffset+pPart[0],pPart[1]/2);
  const nView=new Int8Array(raw.buffer,raw.byteOffset+nPart[0],nPart[1]);
  const uvView=new Uint16Array(raw.buffer,raw.byteOffset+uvPart[0],uvPart[1]/2);
  const iView=new Uint32Array(raw.buffer,raw.byteOffset+iPart[0],iPart[1]/4);
  const positions=new Float32Array(pView.length), normals=new Float32Array(nView.length), uvs=new Float32Array(uvView.length);
  for(let i=0;i<data.count;i++){
    for(let k=0;k<3;k++) positions[i*3+k]=data.positionMin[k]+(pView[i*3+k]/65535)*data.positionSpan[k];
    for(let k=0;k<3;k++) normals[i*3+k]=nView[i*3+k]/127;
    for(let k=0;k<2;k++) uvs[i*2+k]=data.uvMin[k]+(uvView[i*2+k]/65535)*data.uvSpan[k];
  }
  return {positions,normals,uvs,indices:new Uint32Array(iView),count:data.indexCount};
}

export function createShader(gl,type,source){
  const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)||"Shader compile error");
  return shader;
}
export function createProgram(gl,vs,fs){
  const program=gl.createProgram(); gl.attachShader(program,createShader(gl,gl.VERTEX_SHADER,vs)); gl.attachShader(program,createShader(gl,gl.FRAGMENT_SHADER,fs)); gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||"Program link error");
  return program;
}

export function createMesh(gl,loc,data){
  const vao=gl.createVertexArray(); gl.bindVertexArray(vao); const buffers=[];
  const bind=(attribute,array,size)=>{const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,size,gl.FLOAT,false,0,0);};
  bind(loc.position,data.positions,3); bind(loc.normal,data.normals,3); bind(loc.uv,data.uvs,2);
  const ib=gl.createBuffer();buffers.push(ib);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
  gl.bindVertexArray(null); return {vao,buffers,count:data.count};
}

export async function createTexture(gl,base64,{flipY=true}={}){
  const bytes=b64Bytes(base64); const blob=new Blob([bytes],{type:"image/webp"}); const bitmap=await createImageBitmap(blob);
  const texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flipY);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap); bitmap.close?.();
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

export function mat4Identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
export function mat4Multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
export function mat4Translation(x,y,z){const m=mat4Identity();m[12]=x;m[13]=y;m[14]=z;return m;}
export function mat4Scale(x,y,z){const m=mat4Identity();m[0]=x;m[5]=y;m[10]=z;return m;}
export function mat4RotX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
export function mat4RotY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
export function mat4RotZ(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,1,0,0,0,0,0,1]);}
export function compose({position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]}){let m=mat4Translation(...position);m=mat4Multiply(m,mat4RotZ(rotation[2]));m=mat4Multiply(m,mat4RotY(rotation[1]));m=mat4Multiply(m,mat4RotX(rotation[0]));return mat4Multiply(m,mat4Scale(...scale));}
export function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
export function orthographic(l,r,b,t,n,f){const lr=1/(l-r),bt=1/(b-t),nf=1/(n-f);return new Float32Array([-2*lr,0,0,0,0,-2*bt,0,0,0,0,2*nf,0,(l+r)*lr,(t+b)*bt,(f+n)*nf,1]);}
function norm(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l);} function sub(a,b){return a.map((x,i)=>x-b[i]);} function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
export function lookAt(eye,target,up=[0,1,0]){const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1]);}

export function disposeMesh(gl,mesh){if(!mesh)return;gl.deleteVertexArray(mesh.vao);for(const b of mesh.buffers)gl.deleteBuffer(b);}
