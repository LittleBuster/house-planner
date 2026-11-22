import * as THREE from "three";
import { format, type Plant, type Project } from "./model";
import { measureTreeClearances, treeClearanceObstacles, TREE_MARKER_LEVEL, type TreeClearance } from "./treeClearances";
import type { Collider } from "./walkPhysics";

const svgNode = <K extends keyof SVGElementTagNameMap>(name: K) => document.createElementNS("http://www.w3.org/2000/svg", name);
export class TreeMeasurements {
  private svg = svgNode("svg");
  private parts = Array.from({length:4}, () => ({group:svgNode("g"),line:svgNode("line"),leader:svgNode("line"),label:svgNode("g"),rect:svgNode("rect"),text:svgNode("text")}));
  private project: Project | null = null;
  private id: string | null = null;
  private obstacles: Collider[] = [];
  private measurements: TreeClearance[] = [];
  private lastView = "";
  constructor(private camera: THREE.Camera, private canvas: HTMLCanvasElement, private ground: number,
    private subject:"tree"|"fence"|"gate"="tree",private height=TREE_MARKER_LEVEL) {
    this.svg.classList.add("tree-measurements");
    if (subject!=="tree") this.svg.classList.add(subject+"-measurements");
    this.svg.setAttribute("role","img");
    this.svg.style.display="none";
    const defs=svgNode("defs"),marker=svgNode("marker"),path=svgNode("path");
    const markerId=`tree-arrow-${THREE.MathUtils.generateUUID()}`;
    marker.id=markerId;marker.setAttribute("viewBox","0 0 10 10");marker.setAttribute("refX","5");marker.setAttribute("refY","5");
    marker.setAttribute("markerWidth","6");marker.setAttribute("markerHeight","6");marker.setAttribute("orient","auto-start-reverse");
    path.setAttribute("d","M9 5L1 1L1 9Z");marker.append(path);defs.append(marker);this.svg.append(defs);
    for(const part of this.parts) {
      part.line.classList.add("tree-distance-line");part.leader.classList.add("tree-distance-leader");part.text.classList.add("tree-distance-label");
      part.line.setAttribute("marker-start",`url(#${markerId})`);part.line.setAttribute("marker-end",`url(#${markerId})`);
      part.rect.setAttribute("rx","5");part.rect.setAttribute("height","24");part.rect.setAttribute("y","-12");
      part.text.setAttribute("text-anchor","middle");part.text.setAttribute("y","4");
      part.label.append(part.rect,part.text);part.group.append(part.line,part.leader,part.label);this.svg.append(part.group);
    }
    canvas.parentElement?.append(this.svg);
  }
  setTree(project: Project, plant: Plant | null, invalid = false) {
    this.svg.classList.toggle("invalid",invalid);
    if(!plant) {
      this.show([]);return;
    }
    if(project!==this.project || plant.id!==this.id) {
      this.project=project;this.id=plant.id;this.obstacles=treeClearanceObstacles(project,plant.id);
    }
    this.show(measureTreeClearances(plant,this.obstacles));
  }
  show(measurements: TreeClearance[]) {
    this.lastView="";
    this.measurements=measurements;
    const visible = this.measurements.filter(m => m.distance !== null);
    this.svg.style.display=visible.length ? "block" : "none";
    this.parts.forEach((part,i) => { if (this.measurements[i]?.distance == null) { part.group.style.display="none";part.text.textContent=""; } });
    this.canvas.dataset[this.subject+"Distances"]=JSON.stringify(this.measurements);
    const edge=this.subject==="tree"?"края ствола":this.subject==="fence"?"секции забора":"столбов проёма";
    this.svg.setAttribute("aria-label",`Расстояния от ${edge}: ${visible.map(m=>`${m.direction}: ${format(m.distance!)} м`).join("; ")}`);
  }
  update() {
    if(!this.measurements.length)return;
    this.camera.updateMatrixWorld();
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
    const view=`${width}:${height}:${this.camera.matrixWorld.elements}:${this.camera.projectionMatrix.elements}`;
    if(view===this.lastView)return;this.lastView=view;
    this.svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
    for(const [i,measurement] of this.measurements.entries()) {
      const part=this.parts[i];
      if(measurement.distance===null){part.group.style.display="none";part.text.textContent="";continue;}
      const a=new THREE.Vector3(measurement.start.x,this.ground+this.height,measurement.start.y).applyMatrix4(this.camera.matrixWorldInverse);
      const b=new THREE.Vector3(measurement.end.x,this.ground+this.height,measurement.end.y).applyMatrix4(this.camera.matrixWorldInverse);
      const near=(this.camera as THREE.PerspectiveCamera).near??.1;
      if(a.z>=-near){part.group.style.display="none";continue;}
      if(b.z>=-near){const t=(-near-.001-a.z)/(b.z-a.z);b.copy(a.clone().lerp(b,t));}
      a.applyMatrix4(this.camera.projectionMatrix);b.applyMatrix4(this.camera.projectionMatrix);
      const x=(a.x+1)*width/2,y=(1-a.y)*height/2;
      if(x<8||x>width-8||y<8||y>height-8||a.z>1){part.group.style.display="none";continue;}
      const dx=(b.x+1)*width/2-x,dy=(1-b.y)*height/2-y;
      let t=1;
      if(dx>0)t=Math.min(t,(width-20-x)/dx);else if(dx<0)t=Math.min(t,(20-x)/dx);
      if(dy>0)t=Math.min(t,(height-20-y)/dy);else if(dy<0)t=Math.min(t,(20-y)/dy);
      t=Math.max(0,t);
      const endX=x+dx*t,endY=y+dy*t,length=Math.hypot(endX-x,endY-y);
      part.group.style.display="";part.group.dataset.direction=measurement.direction;
      part.line.setAttribute("x1",String(x));part.line.setAttribute("y1",String(y));part.line.setAttribute("x2",String(endX));part.line.setAttribute("y2",String(endY));
      const text=`${format(measurement.distance)} м${t<.999?" ↗":""}`;
      part.text.textContent=text;
      const boxWidth=Math.max(60,text.length*7+18);
      const midX=(x+endX)/2,midY=(y+endY)/2;
      const offset=length<125?Math.max(0,70-length/2):0;
      let labelX=midX+(length?dx/Math.hypot(dx,dy)*offset:0),labelY=midY+(length?dy/Math.hypot(dx,dy)*offset:22);
      labelX=Math.max(boxWidth/2+8,Math.min(width-boxWidth/2-8,labelX));labelY=Math.max(18,Math.min(height-18,labelY));
      part.rect.setAttribute("x",String(-boxWidth/2));part.rect.setAttribute("width",String(boxWidth));
      part.label.setAttribute("transform",`translate(${labelX} ${labelY})`);
      part.leader.style.display=offset>0?"":"none";part.leader.setAttribute("x1",String(midX));part.leader.setAttribute("y1",String(midY));part.leader.setAttribute("x2",String(labelX));part.leader.setAttribute("y2",String(labelY));
    }
  }
  dispose(){this.svg.remove();}
}
