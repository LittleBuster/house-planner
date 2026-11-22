import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LawnTile, Plant, PlantKind, Point, Project } from "./model";
import { plantingError, plantVariant, PLANT_CATALOGUE } from "./landscape";
import { createPlantModel, disposePlantModel, plantLibraryReady } from "./plantModels";
import { LawnLayer } from "./LawnLayer";
import { lawnError, resizeCover, snapCover, type CoverGrip } from "./lawn";
import { coverDepth, type GroundCover } from "./groundSettings";
import { lawnFootprint, onLawnFootprint } from "./lawnFootprint";
import { TreeMeasurements } from "./TreeMeasurements";
import { TREE_MARKER_LEVEL } from "./treeClearances";
import { isHerb } from "./plantSettings";
import { SITE_SNAP_STEP, snapSitePoint, snapSiteValue } from "./siteGrid";
import { FenceLayer, type FenceOptions } from "./FenceLayer";
import { moveFence } from "./fencePlacement";
import { fenceAxis, type Fence } from "./fenceSettings";
import type { Gate, GateToolKind } from "./gateSettings";
import { gateUsesFence, positionGate, slideGate } from "./gatePlacement";
import { GateLayer } from "./GateLayer";
import { GATE_HANDLE_HEIGHT, GateHandles } from "./GateHandles";

type GateTool = {kind:GateToolKind;width:number};

export type LandscapeOptions = {
  placingSteps?: boolean;
  kind: PlantKind | null;
  height: number;
  variant?: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPlace: (kind: PlantKind, position: Point, keep: boolean) => void;
  onMove: (id: string, position: Point) => void;
  notify: (message: string) => void;
  fence?: FenceOptions;
  gate?: {active:GateTool|null;selectedId:string|null;onPlace:(gate:Gate)=>void;onMove:(gate:Gate)=>void;onDeselect:()=>void};
  lawn?: {
    active: GroundCover | null;
    copied: boolean;
    size: number;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onPlace: (position: Point) => void;
    onEdit: (tile: LawnTile) => void;
  };
};
type PointerLocation = Pick<PointerEvent,"clientX" | "clientY">;
type CoverPointer = PointerLocation & Pick<PointerEvent,"altKey">;
type Drag = {
  kind: "plant";
  id: string;
  original: Point;
  offset: Point;
  start: Point;
  candidate: Point;
  error: string | null;
} | {
  kind: "lawn";
  original: LawnTile;
  candidate: LawnTile;
  start: PointerLocation;
  ground: Point;
  grip?: CoverGrip;
  pointerId: number;
  started: boolean;
  error: string | null;
} | {
  kind: "fence";
  original: Fence;
  start: PointerLocation;
  ground: Point;
  pointerId: number;
  candidate?: ReturnType<typeof moveFence>;
} | {
  kind:"gate";
  original:Gate;
  candidate:Gate;
  direction:-1|1;
  start:PointerLocation;
  ground:Point;
  pointerId:number;
  started:boolean;
};

export class LandscapeScene {
  private root = new THREE.Group();
  private objects = new Map<string, { tree: THREE.Group; signature: string }>();
  private project: Project;
  private ghost: THREE.Group | null = null;
  private ghostSignature = "";
  private raycaster = new THREE.Raycaster();
  private plane: THREE.Plane;
  private gatePlane:THREE.Plane;
  private marker: THREE.Mesh;
  private selectedMarker: THREE.Mesh;
  private drag: Drag | null = null;
  private pendingCoverPointer: CoverPointer | null = null;
  private pendingGatePointer:PointerLocation|null=null;
  private down: Point | null = null;
  private lawnLayer: LawnLayer;
  private fenceLayer: FenceLayer;
  private gateHandles:GateHandles|null;
  private measurements: TreeMeasurements | null;
  private visible=true;
  private gateDraftId=THREE.MathUtils.generateUUID();
  setVisible(visible:boolean){
    this.visible=visible;this.root.visible=visible;this.lawnLayer.setVisible(visible);this.canvas.dataset.landscapeVisible=String(visible);
    this.gateLayer.setVisible(visible);
    this.fenceLayer.setOptions(visible,this.editable?this.options().fence:undefined);
    if (!visible) this.gateHandles?.show(this.project);
    if(!visible){this.cancelDrag();this.leave();this.measurements?.setTree(this.project,null);this.canvas.classList.remove("planting");this.canvas.dataset.selectedPlant="";this.canvas.dataset.selectedLawn="";this.canvas.dataset.plantMarkerHeight="";}
    else this.setOptions();
  }
  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private canvas: HTMLCanvasElement,
    private controls: OrbitControls | null,
    private house: THREE.Group,
    private gateLayer: GateLayer,
    project: Project,
    private groundHeight: number,
    private options: () => LandscapeOptions,
    private editable: boolean,
  ) {
    this.project = project;
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundHeight);
    this.gatePlane=new THREE.Plane(new THREE.Vector3(0,1,0),-groundHeight-GATE_HANDLE_HEIGHT);
    const marker = () => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 64),
        new THREE.MeshBasicMaterial({
          color: 0x477eb9,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          depthTest: false,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = groundHeight + TREE_MARKER_LEVEL;
      m.renderOrder = 50;
      m.visible = false;
      this.root.add(m);
      return m;
    };
    this.marker = marker();
    this.selectedMarker = marker();
    this.scene.add(this.root);
    this.lawnLayer = new LawnLayer(scene, canvas, groundHeight, project, camera, editable ? this.startCoverResize : undefined);
    this.fenceLayer = new FenceLayer(scene,camera,canvas,groundHeight,project,editable);
    this.gateHandles=editable ? new GateHandles(canvas,camera,groundHeight,this.startGateMove) : null;
    this.measurements = editable ? new TreeMeasurements(camera, canvas, groundHeight) : null;
    this.setProject(project);
    if (editable) {
      canvas.addEventListener("pointerdown", this.pointerDown, true);
      canvas.addEventListener("pointermove", this.pointerMove);
      canvas.addEventListener("pointerup", this.pointerUp, true);
      canvas.addEventListener("pointercancel", this.cancelDrag);
      canvas.addEventListener("pointerleave", this.leave);
      canvas.addEventListener("dragover", this.dragOver);
      canvas.addEventListener("drop", this.drop);
      canvas.addEventListener("dragleave", this.leave);
      document.addEventListener("keydown", this.keyDown);
    }
  }
  setProject(project: Project) {
    if (this.project !== project && this.drag) this.cancelDrag();
    this.project = project;
    const ids = new Set((project.plants ?? []).map((p) => p.id));
    for (const [id, item] of this.objects)
      if (!ids.has(id)) {
        this.root.remove(item.tree);
        disposePlantModel(item.tree);
        this.objects.delete(id);
      }
    for (const plant of project.plants ?? []) {
      const signature = `${plant.kind}:${plant.variant ?? ""}:${plantLibraryReady()}`;
      let item = this.objects.get(plant.id);
      if (!item || item.signature !== signature) {
        if (item) {
          this.root.remove(item.tree);
          disposePlantModel(item.tree);
        }
        const tree = createPlantModel(plant.kind, plant.seed, plant.variant);
        tree.userData.plantId = plant.id;
        this.root.add(tree);
        item = { tree, signature };
        this.objects.set(plant.id, item);
      }
      item.tree.position.set(
        plant.position.x,
        this.groundHeight,
        plant.position.y,
      );
      item.tree.scale.setScalar(plant.height);
      item.tree.rotation.y = (plant.rotation * Math.PI) / 180;
      item.tree.updateMatrixWorld(true);
    }
    this.canvas.dataset.plants = String(this.objects.size);
    this.canvas.dataset.landscape = JSON.stringify(
      (project.plants ?? []).map((p) => ({
        id: p.id,
        kind: p.kind,
        variant: this.objects.get(p.id)!.tree.userData.variant,
        loaded: this.objects.get(p.id)!.tree.userData.loaded,
        height: p.height,
        position: p.position,
        modelHeight: new THREE.Box3()
          .setFromObject(this.objects.get(p.id)!.tree)
          .getSize(new THREE.Vector3()).y,
      })),
    );
    this.lawnLayer.sync(project);
    this.fenceLayer.sync(project);
    this.gateLayer.sync(project);
    this.setOptions();
  }
  setOptions() {
    if (!this.editable||!this.visible) return;
    const options = this.options();
    if (this.drag && (options.lawn?.active || options.fence?.active || options.gate?.active)) {
      this.cancelDrag();
      return;
    }
    const signature = options.kind ? `${options.kind}:${options.variant ?? ""}:${options.height}:${plantLibraryReady()}` : "";
    if (signature !== this.ghostSignature) {
      if (this.ghost) {
        this.root.remove(this.ghost);
        disposePlantModel(this.ghost);
        this.ghost = null;
      }
      this.ghostSignature = signature;
      if (options.kind) {
        this.ghost = createPlantModel(options.kind, 1481, options.variant);
        this.ghost.scale.setScalar(options.height);
        this.ghost.visible = false;
        this.ghost.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = false;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(
              (m) => {
                m.transparent = true;
                m.opacity = 0.4;
                m.depthWrite = false;
              },
            );
          }
        });
        this.root.add(this.ghost);
      }
      this.marker.visible = false;
    }
    const selected = this.project.plants?.find(
      (p) => p.id === options.selectedId,
    );
    this.canvas.dataset.selectedPlant = selected?.id ?? "";
    this.selectedMarker.visible = !!selected && !options.kind && !options.lawn?.active;
    (this.selectedMarker.material as THREE.MeshBasicMaterial).color.setHex(
      0x477eb9,
    );
    if (selected) {
      this.selectedMarker.position.set(
        selected.position.x,
        this.groundHeight + TREE_MARKER_LEVEL,
        selected.position.y,
      );
      this.selectedMarker.scale.setScalar(
        isHerb(selected.kind) ? Math.max(0.12, selected.height * plantVariant(selected.kind,selected.variant).crownRatio / 2 + 0.08) : Math.max(0.5, selected.height * 0.26),
      );
    }
    this.canvas.dataset.plantMarkerHeight = selected ? String(this.selectedMarker.position.y - this.groundHeight) : "";
    this.measurements?.setTree(this.project, this.selectedMarker.visible && !isHerb(selected!.kind) ? selected! : null);
    this.lawnLayer.options(options.lawn?.active ?? null, options.lawn?.size ?? 2, options.lawn?.depth ?? 2, options.lawn?.selectedId ?? null);
    this.fenceLayer.setOptions(true,options.fence);
    this.gateLayer.select(options.gate?.selectedId ?? null);
    const selectedGate=this.project.gates?.find(gate=>gate.id===options.gate?.selectedId);
    this.gateHandles?.show(this.project,this.drag?.kind==="gate" ? this.drag.candidate : selectedGate);
    if (this.drag?.kind === "lawn" && this.drag.started) this.lawnLayer.draft(this.drag.candidate,this.drag.error);
    this.canvas.classList.toggle("planting", !!options.kind || !!options.lawn?.active || !!options.fence?.active || !!options.gate?.active);
  }
  update() {
    if (this.pendingGatePointer) {
      const pointer=this.pendingGatePointer;
      this.pendingGatePointer=null;
      if (this.drag?.kind==="gate") this.updateGateDrag(pointer,this.drag);
    }
    if (this.pendingCoverPointer) {
      const pointer = this.pendingCoverPointer;
      this.pendingCoverPointer = null;
      if (this.drag?.kind === "lawn") this.updateCoverDrag(pointer);
      else if (this.options().lawn?.active) this.hover(pointer);
    }
    this.lawnLayer.updateHandles();
    this.measurements?.update();
    this.fenceLayer.update();
    this.gateHandles?.update();
  }
  private ray(event: { clientX: number; clientY: number }) {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
  }
  private ground(event: PointerLocation, snap = true, plane=this.plane): Point | null {
    this.ray(event);
    const p = this.raycaster.ray.intersectPlane(
      plane,
      new THREE.Vector3(),
    );
    if (!p) return null;
    const position={x:p.x,y:p.z};
    return snap?snapSitePoint(position):position;
  }
  private pickFence(event: PointerLocation) {
    this.ray(event);
    const hit=this.fenceLayer.pick(this.raycaster);
    if (!hit) return null;
    if (this.house.visible && this.raycaster.intersectObject(this.house,true).some(item=>item.distance<hit.distance))
      return null;
    const plants=[...this.objects.values()].map(item=>item.tree);
    if (this.raycaster.intersectObjects(plants,true).some(item=>item.distance<hit.distance)) return null;
    return hit;
  }
  private draftGate(event:PointerLocation, tool:GateTool) {
    const hit=this.pickFence(event);
    const fence=this.project.fences?.find(item=>item.id===hit?.object.userData.fenceId);
    if (!fence || !hit || (tool.kind!=="wicket" && fence.kind!==tool.kind))
      return {error:"Нажмите на секцию забора подходящего типа."};
    return positionGate(this.project,fence,{x:hit.point.x,y:hit.point.z},tool.width,{
      id:this.gateDraftId,kind:fence.kind,color:fence.color,swing:"in",flipped:fence.flipped,
      ...(tool.kind==="wicket" ? {wicket:true} : {}),
    });
  }
  private pick(event: { clientX: number; clientY: number }) {
    if(!this.visible)return null;
    this.ray(event);
    const hits = this.raycaster.intersectObjects(
      [...this.objects.values()].map((o) => o.tree),
      true,
    );
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.plantId) object = object.parent;
      if (object?.userData.plantId) return object.userData.plantId as string;
    }
    return null;
  }
  private candidate(kind: PlantKind, height: number, position: Point): Plant {
    return { id: "preview", kind, height, position, variant: this.options().variant, seed: 1481, rotation: 0 };
  }
  private hover(event: CoverPointer) {
    if(!this.visible)return null;
    const options = this.options();
    if (options.lawn?.active) {
      const raw = this.ground(event, false);
      if (!raw) return null;
      const candidate = { id: "preview", position: raw, size: options.lawn.size, depth: options.lawn.depth, material: options.lawn.active };
      const tile = options.lawn.copied && !event.altKey ? snapCover(this.project,candidate) : candidate;
      const {position} = tile;
      const obstruction = this.house.visible?this.raycaster.intersectObject(this.house, true)[0]:undefined;
      const groundDistance = this.raycaster.ray.origin.distanceTo(new THREE.Vector3(raw.x, this.groundHeight, raw.y));
      const error = obstruction && obstruction.distance + .04 < groundDistance
        ? "Нажмите на свободную землю за пределами дома."
        : lawnError(this.project, tile) ?? (onLawnFootprint(position, lawnFootprint(this.project,tile)) ? null : "Нажмите на видимую землю снаружи дома.");
      this.canvas.dataset.lawnPosition = JSON.stringify(position);
      this.canvas.dataset.lawnValid = String(!error);
      this.lawnLayer.preview(tile, error, event);
      return { position, error };
    }
    if (!options.kind) return null;
    const position = this.ground(event);
    if (!position) return null;
    const obstruction = this.house.visible?this.raycaster.intersectObject(this.house, true)[0]:undefined;
    const groundDistance = this.raycaster.ray.origin.distanceTo(
      new THREE.Vector3(position.x, this.groundHeight, position.y),
    );
    const error =
      obstruction && obstruction.distance + 0.04 < groundDistance
        ? "Нажмите на свободный участок, за пределами дома."
        : plantingError(
            this.project,
            this.candidate(options.kind, options.height, position),
          );
    this.canvas.dataset.plantingPosition = JSON.stringify(position);
    this.canvas.dataset.plantingValid = String(!error);
    if (this.ghost) {
      this.ghost.visible = true;
      this.ghost.position.set(position.x, this.groundHeight, position.y);
    }
    this.marker.visible = true;
    this.marker.position.set(position.x, this.groundHeight + TREE_MARKER_LEVEL, position.y);
    this.marker.scale.setScalar(Math.max(0.5, options.height * 0.26));
    (this.marker.material as THREE.MeshBasicMaterial).color.setHex(
      error ? 0xb06a63 : 0x477eb9,
    );
    return { position, error };
  }
  private beginCoverDrag(tile: LawnTile, ground: Point, event: PointerEvent, grip?: CoverGrip) {
    this.drag = {kind:"lawn", original:tile, candidate:tile, ground, grip,
      start:{clientX:event.clientX,clientY:event.clientY}, pointerId:event.pointerId, started:false, error:null};
    if (this.controls) this.controls.enabled = false;
    event.stopImmediatePropagation();
    this.canvas.setPointerCapture(event.pointerId);
  }

  private startCoverResize = (grip: CoverGrip, event: PointerEvent) => {
    if (!this.visible || event.button !== 0 || this.drag) return;
    const tile = this.project.lawn?.find(item => item.id === this.options().lawn?.selectedId);
    const point = this.ground(event,false);
    if (!tile || !point) return;
    event.preventDefault();
    this.beginCoverDrag(tile,point,event,grip);
  };

  private startGateMove=(direction:-1|1,event:PointerEvent)=>{
    if (!this.visible || event.button!==0 || this.drag) return;
    const gate=this.project.gates?.find(item=>item.id===this.options().gate?.selectedId);
    const point=this.ground(event,false,this.gatePlane);
    if (!gate || !point) return;
    this.drag={kind:"gate",original:gate,candidate:gate,direction,ground:point,
      start:{clientX:event.clientX,clientY:event.clientY},pointerId:event.pointerId,started:false};
    if (this.controls) this.controls.enabled=false;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.canvas.setPointerCapture(event.pointerId);
  };

  private updateGateDrag(pointer:PointerLocation,drag:Extract<Drag,{kind:"gate"}>) {
    if (!drag.started && Math.hypot(pointer.clientX-drag.start.clientX,pointer.clientY-drag.start.clientY)<3) return;
    const point=this.ground(pointer,false,this.gatePlane);
    if (!point) return;
    drag.started=true;
    const axis=fenceAxis(drag.original);
    const offset=snapSiteValue((point.x-drag.ground.x)*axis.x+(point.y-drag.ground.y)*axis.y);
    const candidate=slideGate(this.project,drag.original,offset);
    if (Math.hypot(candidate.a.x-drag.candidate.a.x,candidate.a.y-drag.candidate.a.y)<1e-6) return;
    drag.candidate=candidate;
    if (candidate===drag.original) this.restoreGateDrag(drag.original);
    else {
      this.gateLayer.showMove(drag.original,candidate);
      this.fenceLayer.sync({...this.project,gates:this.project.gates?.map(gate=>gate.id===candidate.id?candidate:gate)});
    }
    this.gateHandles?.show(this.project,candidate);
  }

  private restoreGateDrag(gate:Gate) {
    this.gateLayer.endMove(gate);
    this.fenceLayer.sync(this.project);
  }

  private updateCoverDrag(event: CoverPointer) {
    const drag = this.drag;
    if (drag?.kind !== "lawn") return;
    if (!drag.started && Math.hypot(event.clientX-drag.start.clientX,event.clientY-drag.start.clientY) < 3) return;
    const point = this.ground(event,false);
    if (!point) return;
    drag.started = true;
    const delta = {x:point.x-drag.ground.x, y:point.y-drag.ground.y};
    const tile = drag.original;
    const candidate = drag.grip
      ? resizeCover(this.project,tile,drag.grip,delta)
      : {...tile,position:{x:tile.position.x+delta.x,y:tile.position.y+delta.y}};
    drag.candidate = drag.grip || event.altKey ? candidate : snapCover(this.project,candidate,tile.id);
    drag.error = lawnError(this.project,drag.candidate,tile.id);
    this.lawnLayer.draft(drag.candidate,drag.error,event);
  }

  private pointerDown = (event: PointerEvent) => {
    if (event.defaultPrevented||!this.visible||event.button !== 0||this.options().placingSteps) return;
    this.down = { x: event.clientX, y: event.clientY };
    const options=this.options();
    if (options.kind || options.lawn?.active || options.fence?.active || options.gate?.active) {
      event.stopImmediatePropagation();
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    const fenceId=this.pickFence(event)?.object.userData.fenceId;
    const fence=this.project.fences?.find(item=>item.id===fenceId);
    if (fence && options.fence) {
      options.fence.onSelect(fence.id);
      if (gateUsesFence(this.project,fence)) {
        this.down=null;
        event.stopImmediatePropagation();
        return;
      }
      const ground=this.ground(event,false);
      if (ground) {
        this.drag={kind:"fence",original:fence,start:{clientX:event.clientX,clientY:event.clientY},ground,pointerId:event.pointerId};
        if (this.controls) this.controls.enabled=false;
        event.stopImmediatePropagation();
        this.canvas.setPointerCapture(event.pointerId);
      }
      return;
    }
    const id = this.pick(event),
      p = this.ground(event,false);
    if (id && p) {
      const plant = this.project.plants!.find((p) => p.id === id)!;
      this.drag = {
        kind: "plant",
        id,
        original: { ...plant.position },
        offset: { x: plant.position.x - p.x, y: plant.position.y - p.y },
        start: this.down,
        candidate: { ...plant.position },
        error: null,
      };
      this.options().onSelect(id);
      if (this.controls) this.controls.enabled = false;
      event.stopImmediatePropagation();
      this.canvas.setPointerCapture(event.pointerId);
    } else if (p) {
      const lawnId = this.lawnLayer.pick(p);
      if (!lawnId) return;
      const tile = this.project.lawn!.find(t => t.id === lawnId)!;
      this.options().lawn?.onSelect(lawnId);
      this.beginCoverDrag(tile,p,event);
    }
  };
  private updateFenceDrag(event: PointerEvent, drag: Extract<Drag,{kind:"fence"}>) {
    if (drag.pointerId!==event.pointerId) return;
    if (!drag.candidate && Math.hypot(event.clientX-drag.start.clientX,event.clientY-drag.start.clientY)<3) return;
    const point=this.ground(event,false);
    if (!point) return;
    const delta=snapSitePoint({x:point.x-drag.ground.x,y:point.y-drag.ground.y});
    drag.candidate=moveFence(this.project,drag.original,delta);
    this.fenceLayer.showMove(drag.candidate.fence,drag.candidate.edit);
  }
  private pointerMove = (event: PointerEvent) => {
    if(!this.visible)return;
    if (this.drag?.kind==="gate") {
      if (this.drag.pointerId===event.pointerId)
        this.pendingGatePointer={clientX:event.clientX,clientY:event.clientY};
      return;
    }
    if (this.drag?.kind==="fence") {
      this.updateFenceDrag(event,this.drag);
      return;
    }
    const gate=this.options().gate?.active;
    if (gate) {
      this.gateLayer.showOutline(this.draftGate(event,gate).gate);
      return;
    }
    const fence=this.options().fence?.active;
    if (fence) {
      const pointer=this.ground(event,false);
      if (pointer) this.fenceLayer.hover(pointer,event.shiftKey,fence);
      else this.fenceLayer.hidePreview();
      return;
    }
    if (this.drag?.kind === "lawn" || this.options().lawn?.active) {
      this.pendingCoverPointer = {clientX:event.clientX,clientY:event.clientY,altKey:event.altKey};
      return;
    }
    if (this.drag) {
      const point = this.ground(event,false);
      if (!point) return;
      const d = this.drag,
        p = this.project.plants!.find((p) => p.id === d.id)!;
      const delta=snapSitePoint({x:point.x+d.offset.x-d.original.x,y:point.y+d.offset.y-d.original.y});
      d.candidate={x:d.original.x+delta.x,y:d.original.y+delta.y};
      d.error = plantingError(
        this.project,
        { ...p, position: d.candidate },
        d.id,
      );
      this.objects
        .get(d.id)!
        .tree.position.set(d.candidate.x, this.groundHeight, d.candidate.y);
      this.selectedMarker.position.set(
        d.candidate.x,
        this.groundHeight + TREE_MARKER_LEVEL,
        d.candidate.y,
      );
      (this.selectedMarker.material as THREE.MeshBasicMaterial).color.setHex(
        d.error ? 0xb06a63 : 0x477eb9,
      );
      this.measurements?.setTree(this.project, isHerb(p.kind) ? null : { ...p, position: d.candidate }, !!d.error);
      return;
    }
    this.hover(event);
  };
  private pointerUp = (event: PointerEvent) => {
    if (!this.visible||event.button !== 0||this.options().placingSteps) return;
    this.pendingCoverPointer = null;
    this.pendingGatePointer=null;
    if (this.drag?.kind==="gate") {
      const drag=this.drag;
      if (drag.pointerId!==event.pointerId) return;
      event.stopImmediatePropagation();
      this.updateGateDrag(event,drag);
      const next=drag.started ? drag.candidate : slideGate(this.project,drag.original,drag.direction*SITE_SNAP_STEP);
      this.drag=null;
      this.down=null;
      if (this.controls) this.controls.enabled=true;
      this.restoreGateDrag(drag.original);
      if (next!==drag.original) this.options().gate?.onMove(next);
      this.setOptions();
      return;
    }
    if (this.drag?.kind==="fence") {
      const drag=this.drag;
      if (drag.pointerId!==event.pointerId) return;
      event.stopImmediatePropagation();
      this.updateFenceDrag(event,drag);
      this.drag=null;
      this.down=null;
      if (this.controls) this.controls.enabled=true;
      this.fenceLayer.endMove();
      if (drag.candidate) {
        const {fence,edit}=drag.candidate;
        if ("error" in edit) this.options().notify(edit.error);
        else if (Math.hypot(fence.a.x-drag.original.a.x,fence.a.y-drag.original.a.y)>1e-6)
          this.options().fence?.onMove(fence);
      }
      this.setOptions();
      return;
    }
    if (this.drag?.kind === "lawn") {
      const drag = this.drag;
      if (drag.pointerId !== event.pointerId) return;
      event.stopImmediatePropagation();
      this.updateCoverDrag(event);
      this.drag = null;
      this.down = null;
      if (this.controls) this.controls.enabled = true;
      this.lawnLayer.hide();
      const {candidate,original} = drag;
      const changed = Math.abs(candidate.size-original.size) > 1e-6 || Math.abs(coverDepth(candidate)-coverDepth(original)) > 1e-6 ||
        Math.hypot(candidate.position.x-original.position.x,candidate.position.y-original.position.y) > 1e-6;
      if (drag.started && changed && !drag.error) this.options().lawn?.onEdit(candidate);
      else this.lawnLayer.draft(original);
      if (drag.error) this.options().notify(drag.error);
      this.setOptions();
      return;
    }
    if (this.drag) {
      event.stopImmediatePropagation();
      const d = this.drag;
      this.drag = null;
      if (this.controls) this.controls.enabled = true;
      if (d.error) {
        this.objects.get(d.id)?.tree.position.set(d.original.x, this.groundHeight, d.original.y);
        this.options().notify(d.error);
      } else if (
        Math.hypot(d.candidate.x - d.original.x, d.candidate.y - d.original.y) >
        1e-6
      ) {
        this.options().onMove(d.id, d.candidate);
      }
      this.setOptions();
      this.down = null;
      return;
    }
    if (
      !this.down ||
      Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6
    ) {
      this.down = null;
      return;
    }
    this.down = null;
    const options = this.options();
    if (options.gate?.active) {
      event.stopImmediatePropagation();
      const draft=this.draftGate(event,options.gate.active);
      if (draft.gate) options.gate.onPlace(draft.gate);
      else options.notify(draft.error!);
    } else if (options.fence?.active) {
      event.stopImmediatePropagation();
      const pointer=this.ground(event,false);
      if (pointer) this.fenceLayer.click(pointer,event.shiftKey,options.fence);
    } else if (options.lawn?.active) {
      event.stopImmediatePropagation();
      const hit = this.hover(event);
      if (hit?.error) options.notify(hit.error);
      else if (hit) options.lawn.onPlace(hit.position);
    } else if (options.kind) {
      event.stopImmediatePropagation();
      const hit = this.hover(event);
      if (hit?.error) options.notify(hit.error);
      else if (hit) options.onPlace(options.kind, hit.position, event.shiftKey);
    } else {
      const fenceId=this.pickFence(event)?.object.userData.fenceId ?? null;
      options.gate?.onDeselect();
      options.fence?.onSelect(fenceId);
      if (!fenceId) {
        options.lawn?.onSelect(null);
        options.onSelect(this.pick(event));
      }
    }
  };
  private leave = () => {
    this.pendingCoverPointer = null;
    if (!this.drag) {
      if (this.ghost) this.ghost.visible = false;
      this.marker.visible = false;
      this.lawnLayer.hide();
      this.fenceLayer.hidePreview();
      if (this.options().gate?.active) this.gateLayer.showOutline();
    }
  };
  private dragOver = (event: DragEvent) => {
    if(!this.visible)return;
    if (!event.dataTransfer?.types.includes("application/x-domplan-plant"))
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    this.hover(event);
  };
  private drop = (event: DragEvent) => {
    if(!this.visible)return;
    const kind = event.dataTransfer?.getData("application/x-domplan-plant");
    if (!Object.keys(PLANT_CATALOGUE).includes(kind ?? "")) return;
    event.preventDefault();
    const options = this.options(),
      hit = this.hover(event);
    if (hit?.error) options.notify(hit.error);
    else if (hit) options.onPlace(kind as PlantKind, hit.position, false);
    this.leave();
  };
  private cancelDrag = () => {
    this.pendingCoverPointer = null;
    this.pendingGatePointer=null;
    if (this.drag) {
      const d = this.drag;
      if (d.kind === "lawn") {
        this.lawnLayer.draft(d.original);
        this.lawnLayer.hide();
        if (this.canvas.hasPointerCapture(d.pointerId)) this.canvas.releasePointerCapture(d.pointerId);
      } else if (d.kind==="gate") {
        this.restoreGateDrag(d.original);
        if (this.canvas.hasPointerCapture(d.pointerId)) this.canvas.releasePointerCapture(d.pointerId);
      } else if (d.kind==="fence") {
        this.fenceLayer.endMove();
        if (this.canvas.hasPointerCapture(d.pointerId)) this.canvas.releasePointerCapture(d.pointerId);
      } else this.objects.get(d.id)?.tree.position.set(d.original.x, this.groundHeight, d.original.y);
      this.drag = null;
    }
    if (this.controls) this.controls.enabled = true;
    this.down = null;
    this.setOptions();
  };
  private keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.fenceLayer.cancel();
      this.cancelDrag();
    }
  };
  dispose() {
    this.canvas.removeEventListener("pointerdown", this.pointerDown, true);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp, true);
    this.canvas.removeEventListener("pointercancel", this.cancelDrag);
    this.canvas.removeEventListener("pointerleave", this.leave);
    this.canvas.removeEventListener("dragover", this.dragOver);
    this.canvas.removeEventListener("drop", this.drop);
    this.canvas.removeEventListener("dragleave", this.leave);
    document.removeEventListener("keydown", this.keyDown);
    for (const item of this.objects.values()) disposePlantModel(item.tree);
    if (this.ghost) disposePlantModel(this.ghost);
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.selectedMarker.geometry.dispose();
    (this.selectedMarker.material as THREE.Material).dispose();
    this.scene.remove(this.root);
    this.objects.clear();
    this.lawnLayer.dispose();
    this.fenceLayer.dispose();
    this.gateHandles?.dispose();
    this.measurements?.dispose();
  }
}
