import * as THREE from "three";
import { FENCE_COLORS, FENCE_HEIGHT, fenceLength, fencePostKey, type FenceColor, type FenceSpan } from "./fenceSettings";
import { createGateFrame, createGateInfill } from "./fenceGeometry";
import { GATE_BOTTOM, GATE_POST, gateLeafDimensions, gateLeafIndices, gateLeafKey, type Gate } from "./gateSettings";
import type { Project } from "./model";

export class GateLayer {
  readonly root=new THREE.Group();
  private objects=new THREE.Group();
  private groups=new Map<string,THREE.Group>();
  private posts=new Map<string,{mesh:THREE.Mesh;owners:number}>();
  private postGeometry=new THREE.BoxGeometry(GATE_POST,FENCE_HEIGHT,GATE_POST);
  private movingPosts=new THREE.Group();
  private hiddenPosts:THREE.Mesh[]=[];
  private geometries=new Set<THREE.BufferGeometry>();
  private materials=new Map<FenceColor,THREE.MeshStandardMaterial>();
  private metal=new THREE.MeshStandardMaterial({color:0x333639,metalness:.5,roughness:.46});
  private invisible=new THREE.MeshBasicMaterial({visible:false});
  private outlineGeometry=new THREE.BufferGeometry().setFromPoints([
    [0,0],[1,0],[1,0],[1,1],[1,1],[0,1],[0,1],[0,0],[.5,0],[.5,1],
  ].map(([x,y])=>new THREE.Vector3(x,y,0)));
  private outlineMaterial=new THREE.LineBasicMaterial({color:0x4283c3,depthTest:false});
  private outline=new THREE.LineSegments(this.outlineGeometry,this.outlineMaterial);
  private signature="";
  private project:Project;

  constructor(private scene:THREE.Scene, private canvas:HTMLCanvasElement, private ground:number, project:Project) {
    this.project=project;
    this.root.add(this.objects,this.outline,this.movingPosts);
    for (let i=0;i<2;i++) {
      const mesh=new THREE.Mesh(this.postGeometry,this.metal);
      mesh.raycast=()=>{};
      mesh.castShadow=mesh.receiveShadow=true;
      this.movingPosts.add(mesh);
    }
    this.movingPosts.visible=false;
    this.outline.visible=false;
    this.outline.renderOrder=26;
    scene.add(this.root);
    this.sync(project);
  }

  private orient(object:THREE.Object3D, span:FenceSpan) {
    object.position.set(span.a.x,this.ground,span.a.y);
    object.rotation.y=-Math.atan2(span.b.y-span.a.y,span.b.x-span.a.x);
  }

  private material(color:FenceColor) {
    let material=this.materials.get(color);
    if (!material) {
      material=new THREE.MeshStandardMaterial({color:FENCE_COLORS.find(item=>item.id===color)!.color,
        roughness:.54,metalness:.24,side:THREE.DoubleSide});
      this.materials.set(color,material);
    }
    return material;
  }

  private mesh(geometry:THREE.BufferGeometry, material:THREE.Material, parent:THREE.Group) {
    this.geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.castShadow=mesh.receiveShadow=material.visible;
    parent.add(mesh);
    return mesh;
  }

  sync(project:Project) {
    this.project=project;
    const gates=project.gates ?? [];
    this.canvas.dataset.gates=JSON.stringify(gates);
    const signature=JSON.stringify(gates.map(({id,a,b,kind,color,flipped,wicket,mirrored})=>[id,a,b,kind,color,flipped,wicket,mirrored]));
    if (this.signature===signature) return;
    this.signature=signature;
    this.objects.clear();
    this.groups.clear();
    this.posts.clear();
    this.geometries.forEach(geometry=>geometry.dispose());
    this.geometries.clear();
    for (const gate of gates) {
      const group=new THREE.Group();
      this.orient(group,gate);
      this.objects.add(group);
      this.groups.set(gate.id,group);
      const span=fenceLength(gate), material=this.material(gate.color);
      const {length}=gateLeafDimensions(gate,0);
      const frame=createGateFrame(gate.kind,length), panel=createGateInfill(gate.kind,length);
      for (const point of [gate.a,gate.b]) {
        const key=fencePostKey(point), existing=this.posts.get(key);
        if (existing) existing.owners++;
        else {
          const mesh=new THREE.Mesh(this.postGeometry,material);
          mesh.castShadow=mesh.receiveShadow=true;
          this.orient(mesh,gate);
          mesh.position.set(point.x,this.ground+FENCE_HEIGHT/2,point.y);
          mesh.userData.gatePick=gate.id;
          this.posts.set(key,{mesh,owners:1});
          this.objects.add(mesh);
        }
      }
      for (const index of gateLeafIndices(gate)) {
        const {hingeX,sign}=gateLeafDimensions(gate,index);
        const leaf=new THREE.Group();
        leaf.name=gateLeafKey(gate.id,index);
        leaf.userData.gatePick=gate.id;
        leaf.position.x=hingeX;
        leaf.scale.x=sign;
        group.add(leaf);
        this.mesh(frame,material,leaf);
        this.mesh(panel,material,leaf).scale.z=gate.flipped?-1:1;
        for (const y of [.25,1.55]) {
          const hinge=this.mesh(new THREE.CylinderGeometry(.021,.021,.095,10),this.metal,group);
          hinge.position.set(hingeX,y,0);
          hinge.userData.gatePick=gate.id;
        }
        if (index===0) {
          const latch=this.mesh(new THREE.BoxGeometry(.12,.055,.09),this.metal,leaf);
          latch.position.set(length-.065,.99,0);
        }
      }
      const aperture=this.mesh(new THREE.BoxGeometry(span,FENCE_HEIGHT,.065),this.invisible,group);
      aperture.position.set(span/2,FENCE_HEIGHT/2,0);
      aperture.userData.gatePick=gate.id;
    }
    this.root.updateMatrixWorld(true);
    this.canvas.dataset.gatePosts=String(this.posts.size);
  }

  setVisible(visible:boolean) {this.root.visible=visible;}

  showOutline(span?:Gate) {
    this.outline.visible=!!span;
    if (!span) return;
    this.orient(this.outline,span);
    this.outlineGeometry.setDrawRange(0,span.wicket?8:10);
    this.outline.position.y+=GATE_BOTTOM;
    this.outline.scale.set(fenceLength(span),FENCE_HEIGHT-GATE_BOTTOM,1);
  }

  select(id:string|null) {
    this.canvas.dataset.selectedGate=id??"";
    this.showOutline(this.project.gates?.find(gate=>gate.id===id));
  }

  showMove(original:Gate, gate:Gate) {
    const group=this.groups.get(gate.id);
    if (!group) return;
    if (!this.movingPosts.visible) {
      for (const point of [original.a,original.b]) {
        const post=this.posts.get(fencePostKey(point));
        if (post?.owners!==1) continue;
        post.mesh.visible=false;
        this.hiddenPosts.push(post.mesh);
      }
    }
    this.orient(group,gate);
    this.movingPosts.visible=true;
    for (const [index,point] of [gate.a,gate.b].entries()) {
      const mesh=this.movingPosts.children[index] as THREE.Mesh;
      mesh.material=this.material(gate.color);
      this.orient(mesh,gate);
      mesh.position.set(point.x,this.ground+FENCE_HEIGHT/2,point.y);
    }
    this.showOutline(gate);
  }

  endMove(original:Gate) {
    const group=this.groups.get(original.id);
    if (group) this.orient(group,original);
    this.movingPosts.visible=false;
    this.hiddenPosts.forEach(post=>{post.visible=true;});
    this.hiddenPosts=[];
    this.showOutline(original);
  }

  dispose() {
    this.scene.remove(this.root);
    this.geometries.forEach(geometry=>geometry.dispose());
    this.materials.forEach(material=>material.dispose());
    this.metal.dispose();
    this.invisible.dispose();
    this.postGeometry.dispose();
    this.outlineGeometry.dispose();
    this.outlineMaterial.dispose();
  }
}
