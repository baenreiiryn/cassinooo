export class DragonDiceModelRenderer {
  constructor(canvas){
    this.canvas=canvas;
    this.renderer=null;
  }

  async init(){
    const { DragonDiceWebGL } = await import("./dragon-dice-webgl.js");
    const renderer = await new DragonDiceWebGL(this.canvas).init();
    this.renderer = renderer;
    return renderer;
  }

  dispose(){
    this.renderer?.dispose?.();
    this.renderer=null;
  }
}
