import * as THREE from "three";
import { format, type LawnTile, type Point, type Project } from "./model";
import { createGroundTile, disposeLawnModel, lawnLibraryReady } from "./lawnModels";
import { coverBounds, coverDepth, groundCover, COVER_SITE_LIMIT, GRASS_BLOCK_SIZE, type GroundCover } from "./groundSettings";
import { lawnFootprint, onLawnFootprint, type LawnFootprint } from "./lawnFootprint";
import { CoverHandles } from "./CoverHandles";
import type { CoverGrip } from "./lawn";

const emptyFootprint: LawnFootprint = { parts: [], area: 0, full: false };
const BLUE = 0x477eb9, INVALID = 0xb06a63;
type Item = { group: THREE.Group; signature: string };

export class LawnLayer {
  private root = new THREE.Group();
  private items = new Map<string, Item>();
  private ghost: Item | null = null;
  private toolSignature = "";
  private outline: THREE.LineSegments;
  private selection: THREE.LineSegments;
  private handles: CoverHandles | null;
  private label = document.createElement("div");

  setVisible(visible: boolean) {
    this.root.visible = visible;
    if (!visible) { this.hide(); this.handles?.hide(); }
  }

  constructor(private scene: THREE.Scene, private canvas: HTMLCanvasElement, private ground: number, private project: Project,
    camera: THREE.Camera, startResize?: (grip:CoverGrip,event:PointerEvent) => void) {
    const border = () => {
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:BLUE,transparent:true,opacity:.95,depthTest:false}));
      line.renderOrder = 4;
      line.visible = false;
      this.root.add(line);
      return line;
    };
    this.outline = border();
    this.selection = border();
    scene.add(this.root);
    this.label.className = "lawn-size-label";
    this.label.hidden = true;
    this.label.setAttribute("aria-hidden", "true");
    canvas.parentElement?.appendChild(this.label);
    this.handles = startResize ? new CoverHandles(canvas,camera,ground+.14,startResize) : null;
  }

  private remove(item: Item) {
    this.root.remove(item.group);
    disposeLawnModel(item.group);
  }

  private updateTile(item: Item | undefined, tile: LawnTile, footprint: LawnFootprint, ghost = false): Item {
    const cover = groundCover(tile);
    const positionKey = cover === "lawn" && footprint.full ? null : tile.position;
    const signature = JSON.stringify([positionKey, tile.size, coverDepth(tile), cover, cover !== "lawn" || lawnLibraryReady(), footprint.full ? "full" : footprint.parts]);
    if (item?.signature === signature) {
      item.group.position.set(tile.position.x,this.ground,tile.position.y);
      item.group.updateMatrixWorld(true);
      return item;
    }
    if (item) this.remove(item);
    const group = createGroundTile(tile, footprint, ghost);
    group.position.set(tile.position.x, this.ground, tile.position.y);
    this.root.add(group);
    group.updateMatrixWorld(true);
    return {group, signature};
  }

  sync(project: Project) {
    if (this.project !== project) this.hide();
    this.project = project;
    const tiles = project.lawn ?? [], ids = new Set(tiles.map(tile => tile.id));
    for (const [id, item] of this.items) if (!ids.has(id)) {
      this.remove(item);
      this.items.delete(id);
    }
    this.canvas.dataset.lawn = JSON.stringify(tiles.map(tile => {
      const footprint = lawnFootprint(project, tile);
      const item = this.updateTile(this.items.get(tile.id), tile, footprint);
      this.items.set(tile.id,item);
      item.group.visible = true;
      const base = item.group.getObjectByName("lawn-base");
      const size = base ? new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3()) : new THREE.Vector3();
      const grass = item.group.getObjectByName("lawn-grass");
      return {...tile, loaded:item.group.userData.loaded ?? true, modelWidth:size.x, modelDepth:size.z,
        grassHeight:grass ? new THREE.Box3().setFromObject(item.group).getSize(new THREE.Vector3()).y : 0,
        visibleArea:footprint.area, grassBlocks:grass instanceof THREE.InstancedMesh ? grass.count : 0,
        grassBlockSize:grass ? GRASS_BLOCK_SIZE : 0};
    }));
    this.canvas.dataset.lawnCount = String(this.items.size);
  }

  options(active: GroundCover | null, size: number, depth: number, selectedId: string | null) {
    const signature = active ? `${active}:${size}:${depth}:${lawnLibraryReady()}` : "";
    if (signature !== this.toolSignature) {
      this.hide();
      if (this.ghost) this.remove(this.ghost);
      this.ghost = null;
      this.toolSignature = signature;
    }
    const selected = this.project.lawn?.find(tile => tile.id === selectedId);
    this.selection.visible = false;
    this.handles?.hide();
    if (selected && !active) {
      const footprint = lawnFootprint(this.project,selected);
      this.showBorder(this.selection,footprint,BLUE);
      if (footprint.area > 0) this.handles?.show(selected,footprint);
    }
    this.canvas.dataset.selectedLawn = selected?.id ?? "";
  }

  private showBorder(line: THREE.LineSegments, footprint: LawnFootprint, color: number) {
    if (line.userData.footprint !== footprint) {
      const points: THREE.Vector3[] = [];
      for (const part of footprint.parts) for (const ring of [part.outer, ...part.holes]) {
        ring.forEach((p,i) => {
          const next = ring[(i+1)%ring.length];
          points.push(new THREE.Vector3(p.x,this.ground+.018,p.y),new THREE.Vector3(next.x,this.ground+.018,next.y));
        });
      }
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(points);
      line.userData.footprint = footprint;
    }
    (line.material as THREE.LineBasicMaterial).color.setHex(color);
    line.visible = footprint.parts.length > 0;
  }

  private footprint(tile: LawnTile) {
    if (Object.values(coverBounds(tile)).some(n => Math.abs(n) > COVER_SITE_LIMIT+1e-6)) return emptyFootprint;
    return lawnFootprint(this.project,tile);
  }

  preview(tile: LawnTile, error: string | null, event: {clientX:number;clientY:number}) {
    const footprint = this.footprint(tile);
    if (error) {
      if (this.ghost) this.ghost.group.visible = false;
    } else {
      this.ghost = this.updateTile(this.ghost ?? undefined,tile,footprint,true);
      this.ghost.group.visible = true;
    }
    this.showBorder(this.outline,footprint,error ? INVALID : BLUE);
    this.canvas.dataset.lawnPreviewArea = String(footprint.area);
    this.showLabel(tile,footprint,error,event);
  }

  private showLabel(tile:LawnTile, footprint:LawnFootprint, error:string|null, event:{clientX:number;clientY:number}) {
    this.label.hidden = false;
    this.label.classList.toggle("invalid",!!error);
    this.label.textContent = `${format(tile.size)} × ${format(coverDepth(tile))} м · ${format(footprint.area)} м²${error ? " · нельзя уложить" : ""}`;
    const rect = this.canvas.getBoundingClientRect();
    this.label.style.left = `${Math.max(8,Math.min(rect.width-235,event.clientX-rect.left+16))}px`;
    this.label.style.top = `${Math.max(8,Math.min(rect.height-38,event.clientY-rect.top+18))}px`;
  }

  pick(point: Point) {
    return (this.project.lawn ?? []).find(tile => onLawnFootprint(point,lawnFootprint(this.project,tile)))?.id ?? null;
  }

  draft(tile: LawnTile, error: string | null = null, event?: {clientX:number;clientY:number}) {
    const footprint = this.footprint(tile);
    const current = this.items.get(tile.id);
    if (error) {
      if (current) current.group.visible = false;
    } else {
      const item = this.updateTile(current,tile,footprint);
      item.group.visible = true;
      this.items.set(tile.id,item);
    }
    this.showBorder(this.selection,footprint,error ? INVALID : BLUE);
    if (this.root.visible) this.handles?.show(tile,footprint);
    if (event) {
      this.canvas.dataset.lawnDraft = JSON.stringify({...tile,visibleArea:footprint.area,valid:!error});
      this.showLabel(tile,footprint,error,event);
    }
  }

  updateHandles() { this.handles?.update(); }

  hide() {
    if (this.ghost) this.ghost.group.visible = false;
    this.outline.visible = false;
    this.label.hidden = true;
    delete this.canvas.dataset.lawnDraft;
  }

  dispose() {
    for (const item of this.items.values()) this.remove(item);
    if (this.ghost) this.remove(this.ghost);
    for (const line of [this.outline,this.selection]) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.label.remove();
    this.handles?.dispose();
    this.scene.remove(this.root);
    this.items.clear();
  }
}
