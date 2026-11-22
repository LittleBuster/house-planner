import * as THREE from "three";
import type { Point, Project } from "./model";
import { createFencePanel, createFencePost } from "./fenceGeometry";
import { FENCE_COLORS, FENCE_HEIGHT, FENCE_LENGTH, FENCE_POST, FENCE_TYPES, fenceLength, fencePostKey,
  type Fence, type FenceColor, type FenceKind, type FenceSpan, type FenceStyle } from "./fenceSettings";
import { fencePlacement, previewFenceEdit, snapFenceStart, type FenceEdit, type FenceStart } from "./fencePlacement";
import { measureFenceClearances } from "./fenceClearances";
import { snapSitePoint } from "./siteGrid";
import { TreeMeasurements } from "./TreeMeasurements";
import { replacesFencePost, visibleFencePieces } from "./gatePlacement";

export type FenceOptions = {
  active: FenceStyle | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPlace: (span: FenceSpan) => Fence | null;
  onMove: (fence: Fence) => void;
};

export class FenceLayer {
  private root = new THREE.Group();
  private sections = new THREE.Group();
  private preview = new THREE.Group();
  private panels = new Map<string,THREE.BufferGeometry>();
  private materials = new Map<FenceColor,THREE.MeshStandardMaterial>();
  private post = createFencePost();
  private targetGeometry = new THREE.BoxGeometry(1,FENCE_HEIGHT,.15).translate(0,FENCE_HEIGHT/2,0);
  private targetMaterial = new THREE.MeshBasicMaterial({visible:false});
  private ghostMaterial = new THREE.MeshBasicMaterial({transparent:true,opacity:.68,side:THREE.DoubleSide,depthWrite:false});
  private highlight = new THREE.LineSegments(new THREE.EdgesGeometry(this.targetGeometry),
    new THREE.LineBasicMaterial({color:0x407bb8,depthTest:false}));
  private targets: THREE.Mesh[] = [];
  private measurements: TreeMeasurements | null;
  private start: FenceStart | null = null;
  private fences: Fence[] | null | undefined = null;
  private gateEnds="";
  private pieces:Fence[]=[];
  private measurementProject: Project | null = null;
  private measuredId: string | null = null;
  private draftId = THREE.MathUtils.generateUUID();
  private hiddenObjects: THREE.Object3D[] = [];

  constructor(private scene: THREE.Scene, camera: THREE.Camera, private canvas: HTMLCanvasElement,
    private ground: number, private project: Project, private editable: boolean) {
    this.measurements=editable ? new TreeMeasurements(camera,canvas,ground,"fence") : null;
    this.root.add(this.sections,this.preview,this.highlight);
    this.highlight.renderOrder=25;
    this.highlight.visible=false;
    this.scene.add(this.root);
    this.sync(project);
  }
  private panelKey(kind: FenceKind, length: number) {return kind+":"+length.toFixed(6);}
  private panel(kind: FenceKind, length: number) {
    const key=this.panelKey(kind,length);
    let geometry=this.panels.get(key);
    if (!geometry) {geometry=createFencePanel(kind,length);this.panels.set(key,geometry);}
    return geometry;
  }
  private material(color: FenceColor) {
    let material=this.materials.get(color);
    if (!material) {
      material=new THREE.MeshStandardMaterial({
        color:FENCE_COLORS.find(item=>item.id===color)!.color,
        roughness:.55,metalness:color==="zinc"?.5:.22,side:THREE.DoubleSide,
      });
      this.materials.set(color,material);
    }
    return material;
  }
  private orient(object:THREE.Object3D, span:FenceSpan) {
    object.position.set(span.a.x,this.ground,span.a.y);
    object.rotation.y=-Math.atan2(span.b.y-span.a.y,span.b.x-span.a.x);
  }
  private orientTarget(object:THREE.Object3D, span:FenceSpan) {
    this.orient(object,span);
    object.position.set((span.a.x+span.b.x)/2,this.ground,(span.a.y+span.b.y)/2);
    object.scale.x=fenceLength(span)+FENCE_POST;
  }
  private section(fence: Fence, material: THREE.Material) {
    const mesh=new THREE.Mesh(this.panel(fence.kind,fenceLength(fence)),material);
    this.orient(mesh,fence);
    mesh.scale.z=fence.flipped ? -1 : 1;
    return mesh;
  }
  sync(project: Project) {
    this.project=project;
    const gateEnds=JSON.stringify(project.gates?.map(gate=>[gate.a,gate.b]) ?? []);
    if (this.fences===project.fences && this.gateEnds===gateEnds) return;
    this.gateEnds=gateEnds;
    this.fences=project.fences;
    this.pieces=visibleFencePieces(project);
    this.sections.clear();
    this.targets=[];
    const posts=new Map<string,THREE.Mesh>();
    const usedPanels=new Set(FENCE_TYPES.map(({id})=>this.panelKey(id,FENCE_LENGTH)));
    for (const fence of this.pieces) {
      const material=this.material(fence.color);
      const hasPanel=fenceLength(fence)>FENCE_POST+.008;
      if (hasPanel) {
        const section=this.section(fence,material);
        usedPanels.add(this.panelKey(fence.kind,fenceLength(fence)));
        section.castShadow=section.receiveShadow=true;
        section.userData.fenceIds=[fence.id];
        this.sections.add(section);
      }
      for (const point of [fence.a,fence.b]) {
        const key=fencePostKey(point);
        if (replacesFencePost(project,point)) continue;
        const existing=posts.get(key);
        if (existing) {existing.userData.fenceIds.push(fence.id);continue;}
        const post=new THREE.Mesh(this.post,material);
        post.userData.fenceIds=[fence.id];
        posts.set(key,post);
        post.position.set(point.x,this.ground,point.y);
        post.rotation.y=-Math.atan2(fence.b.y-fence.a.y,fence.b.x-fence.a.x);
        post.castShadow=post.receiveShadow=true;
        this.sections.add(post);
      }
      if (this.editable && hasPanel) {
        const target=new THREE.Mesh(this.targetGeometry,this.targetMaterial);
        target.userData.fenceId=fence.id;
        this.orientTarget(target,fence);
        this.sections.add(target);
        this.targets.push(target);
      }
    }
    for (const [key,geometry] of this.panels) if (!usedPanels.has(key)) {
      geometry.dispose();
      this.panels.delete(key);
    }
    if (this.start?.neighbor && !project.fences?.some(fence=>fence.id===this.start?.neighbor?.id)) this.cancel();
    this.root.updateMatrixWorld(true);
    this.canvas.dataset.fences=JSON.stringify(project.fences ?? []);
    this.canvas.dataset.fencePosts=String(posts.size);
  }
  setOptions(visible: boolean, options?: FenceOptions) {
    this.root.visible=visible;
    if (!visible || (!options?.active && !this.hiddenObjects.length)) this.cancel();
    const selected=visible && !options?.active ? this.pieces.find(fence=>fence.id===options?.selectedId && fenceLength(fence)>FENCE_POST+.008) : undefined;
    this.canvas.dataset.selectedFence=selected?.id ?? "";
    if (visible && this.hiddenObjects.length) return;
    this.highlight.visible=!!selected;
    if (selected) this.orientTarget(this.highlight,selected);
    if (this.measurementProject!==this.project || this.measuredId!==(selected?.id ?? null)) {
      this.measurementProject=this.project;
      this.measuredId=selected?.id ?? null;
      this.measurements?.show(selected ? measureFenceClearances(this.project,selected) : []);
    }
  }
  pick(raycaster: THREE.Raycaster) {
    return this.root.visible ? raycaster.intersectObjects(this.targets,false)[0] : undefined;
  }
  private snap(point: Point) { return snapFenceStart(this.pieces,snapSitePoint(point)); }
  hover(pointer: Point, turn: boolean, style: FenceStyle) {
    this.preview.clear();
    if (!this.start) {
      const {point}=this.snap(pointer);
      const post=new THREE.Mesh(this.post,this.ghostMaterial);
      post.position.set(point.x,this.ground,point.y);
      this.ghostMaterial.color.set(0x518aca);
      this.preview.add(post);
      return;
    }
    const span=fencePlacement(this.start,pointer,turn,this.pieces);
    if (!span) return;
    const fence={...span,...style,id:this.draftId};
    this.drawPreview(fence,previewFenceEdit(this.project,fence));
  }
  private drawPreview(fence: Fence, edit: FenceEdit) {
    this.preview.clear();
    const error="error" in edit ? edit.error : null;
    this.ghostMaterial.color.set(error ? 0xa8524a : 0x518aca);
    const panel=this.section(fence,this.ghostMaterial);
    this.preview.add(panel);
    const posts=new Set([...this.pieces,...(this.project.gates ?? [])].filter(item=>item.id!==fence.id)
      .flatMap(item=>[fencePostKey(item.a),fencePostKey(item.b)]));
    const points=[fence.a,fence.b,...("joints" in edit ? edit.joints : [])];
    for (const point of points) if (!posts.has(fencePostKey(point))) {
      posts.add(fencePostKey(point));
      const post=new THREE.Mesh(this.post,this.ghostMaterial);
      post.position.set(point.x,this.ground,point.y);
      post.rotation.y=panel.rotation.y;
      this.preview.add(post);
    }
    this.canvas.dataset.fencePreview=JSON.stringify({a:fence.a,b:fence.b,error,joints:"joints" in edit ? edit.joints : []});
  }
  showMove(fence: Fence, edit: FenceEdit) {
    if (!this.hiddenObjects.length) {
      this.hiddenObjects=this.sections.children.filter(item=>item.userData.fenceIds?.length===1 && item.userData.fenceIds[0]===fence.id);
      this.hiddenObjects.forEach(item=>{item.visible=false;});
    }
    this.drawPreview(fence,edit);
    this.highlight.visible=true;
    this.orientTarget(this.highlight,fence);
    this.measurementProject=null;
    const project={...this.project,fences:"fences" in edit ? edit.fences :
      this.project.fences?.map(item=>item.id===fence.id ? fence : item)};
    this.measurements?.show(measureFenceClearances(project,fence));
  }
  endMove() {
    this.hiddenObjects.forEach(item=>{item.visible=true;});
    this.hiddenObjects=[];
    this.hidePreview();
  }
  click(pointer: Point, turn: boolean, options: FenceOptions) {
    const style=options.active;
    if (!style) return;
    if (!this.start) {
      this.start=this.snap(pointer);
      this.canvas.dataset.fenceStart=JSON.stringify(this.start.point);
      this.hidePreview();
      return;
    }
    const span=fencePlacement(this.start,pointer,turn,this.pieces);
    if (!span) return;
    const fence=options.onPlace(span);
    if (!fence) return;
    this.start={point:fence.b,neighbor:fence};
    this.canvas.dataset.fenceStart=JSON.stringify(fence.b);
    this.hidePreview();
  }
  hidePreview() {
    this.preview.clear();
    delete this.canvas.dataset.fencePreview;
  }
  cancel() {
    this.start=null;
    this.hidePreview();
    delete this.canvas.dataset.fenceStart;
  }
  update() { this.measurements?.update(); }
  dispose() {
    this.measurements?.dispose();
    this.scene.remove(this.root);
    this.post.dispose();this.targetGeometry.dispose();this.targetMaterial.dispose();
    this.ghostMaterial.dispose();this.highlight.geometry.dispose();this.highlight.material.dispose();
    this.panels.forEach(panel=>panel.dispose());
    this.materials.forEach(material=>material.dispose());
  }
}
