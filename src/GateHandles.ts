import * as THREE from "three";
import { FENCE_HEIGHT, fenceAxis } from "./fenceSettings";
import { measureGateEnds } from "./gatePlacement";
import type { Gate } from "./gateSettings";
import type { Point, Project } from "./model";
import { TreeMeasurements } from "./TreeMeasurements";

export const GATE_HANDLE_HEIGHT=1.1;

export class GateHandles {
  private root=document.createElement("div");
  private dimensions:TreeMeasurements;
  private handles: {direction:-1|1;button:HTMLButtonElement}[];
  private gate:Gate|undefined;
  private lastView="";

  constructor(private canvas:HTMLCanvasElement,private camera:THREE.Camera,private ground:number,
    start:(direction:-1|1,event:PointerEvent)=>void) {
    this.dimensions=new TreeMeasurements(camera,canvas,ground,"gate",FENCE_HEIGHT+.16);
    this.root.className="cover-handles";
    this.root.hidden=true;
    this.handles=([-1,1] as const).map(direction=>{
      const button=document.createElement("button");
      const label=direction<0?"Переместить к началу забора":"Переместить к концу забора";
      button.type="button";
      button.className="cover-handle gate-move-handle";
      button.dataset.testid=direction<0?"gate-move-start":"gate-move-end";
      button.setAttribute("aria-label",label);
      button.title=label;
      button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14m-5-5 5 5-5 5"/></svg>';
      button.addEventListener("pointerdown",event=>start(direction,event));
      this.root.append(button);
      return {direction,button};
    });
    canvas.parentElement?.append(this.root);
  }

  show(project:Project,gate?:Gate) {
    this.gate=gate;
    this.root.hidden=!gate;
    this.lastView="";
    this.dimensions.show(gate?measureGateEnds(project,gate):[]);
    this.update();
  }

  update() {
    if (!this.gate) return;
    this.dimensions.update();
    this.camera.updateMatrixWorld();
    const width=this.canvas.clientWidth, height=this.canvas.clientHeight;
    const view=`${width}:${height}:${this.camera.matrixWorld.elements}:${this.camera.projectionMatrix.elements}`;
    if (this.lastView===view) return;
    this.lastView=view;
    const axis=fenceAxis(this.gate);
    const project=(point:Point)=>new THREE.Vector3(point.x,this.ground+GATE_HANDLE_HEIGHT,point.y).project(this.camera);
    for (const {direction,button} of this.handles) {
      const point=direction<0?this.gate.a:this.gate.b;
      const start=project(point);
      const tip=project({x:point.x+axis.x*.25*direction,y:point.y+axis.y*.25*direction});
      const dx=(tip.x-start.x)*width/2, dy=(start.y-tip.y)*height/2;
      const length=Math.hypot(dx,dy)||1;
      const x=(start.x+1)*width/2+dx/length*17, y=(1-start.y)*height/2+dy/length*17;
      button.hidden=start.z< -1||start.z>1||x<14||y<14||x>width-14||y>height-14;
      button.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) rotate(${Math.atan2(dy,dx)}rad)`;
    }
  }

  dispose() {
    this.dimensions.dispose();
    this.root.remove();
  }
}
