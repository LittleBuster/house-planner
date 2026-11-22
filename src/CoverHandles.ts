import * as THREE from "three";
import type { LawnTile, Point } from "./model";
import { coverBounds } from "./groundSettings";
import { COVER_CORNERS, COVER_EDGES, coverAxis, coverDirection, coverGripEdges, type CoverEdge, type CoverGrip } from "./lawn";
import type { LawnFootprint } from "./lawnFootprint";

const labels: Record<CoverEdge,string> = {
  minX:"Изменить ширину, край −X", maxX:"Изменить ширину, край +X",
  minY:"Изменить длину, край −Y", maxY:"Изменить длину, край +Y",
};

function edgePoint(tile: LawnTile, footprint: LawnFootprint, edge: CoverEdge): Point {
  const axis = coverAxis(edge), across = axis === "x" ? "y" : "x", direction = coverDirection(edge);
  const vertices = footprint.parts.flatMap(part => part.outer);
  if (!vertices.length) return {...tile.position,[axis]:coverBounds(tile)[edge]};
  const extreme = direction * Math.max(...vertices.map(p => direction*p[axis]));
  const onEdge = (p: Point) => Math.abs(p[axis]-extreme) < .0002;
  let middle = vertices.find(onEdge)![across], longest = 0;
  for (const {outer} of footprint.parts) for (const [i,p] of outer.entries()) {
    const next = outer[(i+1)%outer.length];
    const length = Math.abs(next[across]-p[across]);
    if (onEdge(p) && onEdge(next) && length > longest) {
      longest = length;
      middle = (p[across]+next[across])/2;
    }
  }
  return {...tile.position,[axis]:extreme,[across]:middle};
}

export class CoverHandles {
  private root = document.createElement("div");
  private handles: {edges:readonly CoverEdge[]; button:HTMLButtonElement; point:Point}[];
  private lastView = "";

  constructor(private canvas: HTMLCanvasElement, private camera: THREE.Camera, private height: number, start: (grip: CoverGrip, event: PointerEvent) => void) {
    this.root.className = "cover-handles";
    this.root.hidden = true;
    const grips = [...COVER_EDGES,...Object.keys(COVER_CORNERS)] as CoverGrip[];
    this.handles = grips.map(grip => {
      const edges = coverGripEdges(grip);
      const label = edges.length === 2 ? "Потяните угол, чтобы изменить ширину и длину" : labels[edges[0]];
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cover-handle ${edges.length === 2 ? "corner" : coverAxis(edges[0])}`;
      button.dataset.testid = `cover-resize-${grip}`;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14M7 6l-4 4 4 4m6-8 4 4-4 4"/></svg>';
      button.addEventListener("pointerdown", event => start(grip,event));
      this.root.append(button);
      return {edges,button,point:{x:0,y:0}};
    });
    canvas.parentElement?.append(this.root);
  }

  show(tile: LawnTile, footprint: LawnFootprint) {
    const bounds = coverBounds(tile);
    const vertices = footprint.parts.flatMap(part => part.outer);
    for (const handle of this.handles) {
      const [edge, second] = handle.edges;
      if (!second) {
        handle.point = edgePoint(tile,footprint,edge);
        continue;
      }
      const corner = {x:bounds[edge],y:bounds[second]};
      const distance = (p: Point) => (p.x-corner.x)**2 + (p.y-corner.y)**2;
      handle.point = vertices.length ? vertices.reduce((nearest,p) => distance(p) < distance(nearest) ? p : nearest) : corner;
    }
    this.root.hidden = false;
    this.lastView = "";
    this.update();
  }

  hide() { this.root.hidden = true; }

  update() {
    if (this.root.hidden) return;
    this.camera.updateMatrixWorld();
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    const view = `${width}:${height}:${this.camera.matrixWorld.elements}:${this.camera.projectionMatrix.elements}`;
    if (this.lastView === view) return;
    this.lastView = view;
    const project = (point:Point) => new THREE.Vector3(point.x,this.height,point.y).project(this.camera);
    for (const {edges,button,point} of this.handles) {
      const tip = {...point};
      for (const edge of edges) tip[coverAxis(edge)] += coverDirection(edge)*.25;
      const a = project(point), b = project(tip);
      const dx = (b.x-a.x)*width/2, dy = (a.y-b.y)*height/2;
      const length = Math.hypot(dx,dy) || 1;
      const offset = edges.length === 2 ? 10 : 15;
      const x = (a.x+1)*width/2 + dx/length*offset, y = (1-a.y)*height/2 + dy/length*offset;
      button.hidden = a.z < -1 || a.z > 1 || x < 12 || y < 12 || x > width-12 || y > height-12;
      button.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${Math.atan2(dy,dx)}rad)`;
      if (edges.length === 2) button.style.cursor = dx*dy >= 0 ? "nwse-resize" : "nesw-resize";
    }
  }

  dispose() { this.root.remove(); }
}
