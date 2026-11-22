import * as THREE from "three";
import { distance, type Point, type Project } from "./model";
import { advanceDoorAngle,doorLeafCollider,doorLeafPose,doorLocalAngle,doorTarget,DOOR_LEAF_THICKNESS } from "./doorPhysics";
import { doorOpen, houseFloorLevel } from "./houseFinishes";
import { entryExteriorSide } from "./entrySteps";
import { BODY_RADIUS,PERSON_HEIGHT,createColliders,isWalkable,type Collider } from "./walkPhysics";
import { projectWindowVents,windowVentCollider,windowVentKey,windowVentLocalAngle,windowVentPose,windowVentTarget,WINDOW_VENT_DEPTH } from "./windowVentPhysics";
import type { WalkControls } from "./WalkControls";
import { FENCE_HEIGHT } from "./fenceSettings";
import { GATE_BOTTOM, GATE_DEPTH, gateLeafIndices, gateLeafCollider, gateLeafDimensions, gateLeafKey, gateLeafPose, gateTarget } from "./gateSettings";

type Leaf = {
  openingId:string;
  section?:number;
  wallId?:string;
  gateId?:string;
  gateSign?:number;
  gatePosts?:readonly Point[];
  wicket?:true;
  open:boolean;
  target:number;
  bottom:number;
  top:number;
  depth:number;
  french?:boolean;
  pose:(angle:number)=>{hinge:Point;direction:Point;length:number};
  collider:(angle:number)=>Collider;
  rotation:(angle:number)=>number;
};
type MovingLeaf=Leaf & {group:THREE.Group;angle:number;blocked:boolean};

export class OpeningController {
  private items=new Map<string,MovingLeaf>();
  private walls:Collider[]=[];
  private wallHeights=new Map<string,number>();
  private ray=new THREE.Raycaster();
  private press:{key:string;x:number;y:number;steps:boolean}|null=null;
  private pointer:Point|null=null;
  private hint=document.createElement("div");

  constructor(private camera:THREE.PerspectiveCamera,private canvas:HTMLCanvasElement,private model:THREE.Group,private roof:THREE.Group,private gates:THREE.Group,private walker:WalkControls|null,private options:()=>{toggle:(id:string,section?:number)=>void;toggleGate:(id:string)=>void;selectGate:(id:string)=>void;toggleSteps:(id:string)=>void;placingSteps:boolean;disabled:boolean}){
    this.hint.className="door-interaction-hint";
    this.hint.setAttribute("role","status");
    this.hint.hidden=true;
    canvas.parentElement?.append(this.hint);
    canvas.addEventListener("pointerdown",this.down,true);
    canvas.addEventListener("pointerup",this.up,true);
    canvas.addEventListener("pointermove",this.move);
    canvas.addEventListener("pointercancel",this.cancel);
    canvas.addEventListener("pointerleave",this.leave);
  }
  bind(project:Project){
    const floor = houseFloorLevel(project);
    const old=this.items;
    const gateAngles=new Map<string,number>();
    for (const item of old.values())
      if (item.gateId) gateAngles.set(`${item.gateId}:${item.gateSign}`,item.angle);
    this.items=new Map();
    const attach=(key:string,leaf:Leaf)=>{
      const group=(leaf.gateId ? this.gates : this.model).getObjectByName(key);
      if(!(group instanceof THREE.Group))return;
      const angle=leaf.gateId
        ? gateAngles.get(`${leaf.gateId}:${leaf.gateSign}`)??0
        : old.get(key)?.angle??leaf.target;
      group.rotation.y=leaf.rotation(angle);
      this.items.set(key,{...leaf,group,angle,blocked:false});
    };
    const walls=new Map(project.walls.map(w=>[w.id,w]));
    for(const door of project.openings){
      const wall=walls.get(door.wallId);
      if(door.kind!=="door"||!wall)continue;
      attach(`door-leaf-${door.id}`,{
        openingId:door.id,wallId:wall.id,open:doorOpen(door),target:doorTarget(door),
        bottom:floor+(entryExteriorSide(project,door,wall)?0:door.sill),top:floor+door.sill+door.height,depth:DOOR_LEAF_THICKNESS,
        pose:angle=>doorLeafPose(door,wall,angle),collider:angle=>doorLeafCollider(door,wall,angle),
        rotation:angle=>-doorLocalAngle(door,angle),
      });
    }
    for(const vent of projectWindowVents(project))attach(`window-vent-${vent.id}`,{
      openingId:vent.openingId,section:vent.section,wallId:vent.wall.id,open:vent.open,target:windowVentTarget(vent),
      bottom:floor+vent.bottom,top:floor+vent.bottom+vent.height,depth:WINDOW_VENT_DEPTH,french:vent.french,
      pose:angle=>windowVentPose(vent,angle),collider:angle=>windowVentCollider(vent,angle),rotation:angle=>-windowVentLocalAngle(vent,angle),
    });
    for (const gate of project.gates ?? []) for (const index of gateLeafIndices(gate)) {
      const {sign}=gateLeafDimensions(gate,index);
      attach(gateLeafKey(gate.id,index),{
        openingId:gate.id,gateId:gate.id,gateSign:sign,gatePosts:[gate.a,gate.b],wicket:gate.wicket,open:!!gate.open,target:gateTarget(project,gate),
        bottom:GATE_BOTTOM,top:FENCE_HEIGHT,depth:GATE_DEPTH,
        pose:angle=>gateLeafPose(gate,index,angle),collider:angle=>gateLeafCollider(gate,index,angle),
        rotation:angle=>-angle*sign,
      });
    }
    this.wallHeights=new Map(project.walls.map(w=>[w.id,floor+w.height]));
    this.walls=createColliders({...project,display:{house:true,roof:false,landscape:true}},0)
      .filter(c=>!("doorId" in c)&&!("ventId" in c)&&!("gateLeaf" in c));
    this.syncWalk();
  }
  private syncWalk(){
    if(!this.walker)return;
    const doors=new Map<string,number>(),vents=new Map<string,number>(),gates=new Map<string,number>();
    for(const item of this.items.values()){
      if(item.gateId)gates.set(item.group.name,item.angle);
      else if(item.section===undefined)doors.set(item.openingId,item.angle);
      else vents.set(windowVentKey(item.openingId,item.section),item.angle);
    }
    this.walker.setOpeningAngles(doors,vents,gates);
  }
  private cancel=()=>{this.press=null;};
  private leave=()=>{this.pointer=null;this.hint.hidden=true;this.canvas.classList.remove("door-target","vent-target");};
  private move=(event:PointerEvent)=>{
    this.pointer={x:event.clientX,y:event.clientY};
    if(this.press&&Math.hypot(event.clientX-this.press.x,event.clientY-this.press.y)>=7)this.press=null;
  };
  private pick(point:Point|null){
    if(this.options().disabled||this.options().placingSteps)return null;
    const state=this.walker?.openingInteractionState(),center=state?.input==="native"||state?.input==="pointer";
    if(!point&&!center)return null;
    const rect=this.canvas.getBoundingClientRect(),uv=center?new THREE.Vector2():new THREE.Vector2(((point!.x-rect.left)/rect.width)*2-1,-((point!.y-rect.top)/rect.height)*2+1);
    this.camera.updateMatrixWorld();this.model.updateMatrixWorld(true);this.gates.updateMatrixWorld(true);this.ray.setFromCamera(uv,this.camera);
    const hit=this.ray.intersectObjects([this.model,this.gates].filter(root=>root.visible),true).find(({object})=>{
      if(!(object instanceof THREE.Mesh)||!object.visible||object.userData.entryOpening)return false;
      // An open vent can also be closed by clicking the aperture it left.
      const aperture=object.userData.ventAperture;
      return !aperture||Math.abs(this.items.get(aperture)?.angle??0)>1e-6;
    });
    if(!hit||(this.walker&&hit.distance>2.5))return null;
    let key=hit.object.userData.ventAperture;
    for(let object:THREE.Object3D|null=hit.object;!key&&object&&object!==this.model&&object!==this.gates;object=object.parent)
      key=object.userData.hingedLeaf ?? (object.userData.gatePick ? gateLeafKey(object.userData.gatePick,0) : undefined);
    if(!key)return null;
    if(this.roof.visible&&this.ray.intersectObject(this.roof,true).some(roofHit=>roofHit.distance<hit.distance&&roofHit.object instanceof THREE.Mesh))return null;
    return this.items.get(key)??null;
  }
  private pickEntry(point:Point|null): string|undefined {
    if (!point || !this.model.visible || !this.options().placingSteps || this.options().disabled) return;
    const rect = this.canvas.getBoundingClientRect();
    const uv = new THREE.Vector2(2*(point.x-rect.x)/rect.width-1,1-2*(point.y-rect.y)/rect.height);
    this.camera.updateMatrixWorld();
    this.model.updateMatrixWorld(true);
    this.ray.setFromCamera(uv,this.camera);
    const hit = this.ray.intersectObject(this.model,true).find(({object}) => object instanceof THREE.Mesh && !object.userData.ventAperture);
    if (!hit?.object.userData.entryOpening) return;
    if (this.roof.visible && this.ray.intersectObject(this.roof,true).some(item => item.distance < hit.distance)) return;
    return hit.object.userData.entryOpening;
  }
  private down=(event:PointerEvent)=>{
    if(event.button!==0)return;
    const point = {x:event.clientX,y:event.clientY};
    const steps = this.options().placingSteps;
    const item=steps ? null : this.pick(point);
    const key = steps ? this.pickEntry(point) : item?.group.name;
    if (!key) return;
    event.preventDefault();
    if (item?.gateId&&!this.walker) event.stopImmediatePropagation();
    this.press={key,...point,steps};
    try{this.canvas.setPointerCapture(event.pointerId);}catch{}
  };
  private up=(event:PointerEvent)=>{
    if(!this.press||event.button!==0)return;const press=this.press;this.press=null;
    if(Math.hypot(event.clientX-press.x,event.clientY-press.y)>=7)return;
    const point = {x:event.clientX,y:event.clientY};
    if (press.steps) {
      if (this.pickEntry(point) === press.key) this.options().toggleSteps(press.key);
      return;
    }
    const item=this.pick(point);
    if(item?.group.name!==press.key)return;
    if(item.gateId) {
      if(this.walker)this.options().toggleGate(item.gateId);
      else {
        event.stopImmediatePropagation();
        this.options().selectGate(item.gateId);
      }
    } else this.options().toggle(item.openingId,item.section);
  };
  update(seconds:number){
    const person=this.walker?.openingInteractionState();
    for(const item of this.items.values()){
      const result=advanceDoorAngle(item.angle,item.target,seconds,next=>{
        if(person&&(item.gateId?this.gates.visible:this.model.visible)&&person.footHeight<item.top&&person.footHeight+PERSON_HEIGHT>item.bottom&&
          !isWalkable(person.position,[item.collider(next)],BODY_RADIUS+.012))return false;
        const pose=item.pose(next);
        const walls=this.walls.filter(c=>
          (!item.gatePosts||!("gateId" in c)||item.gatePosts.every(post=>distance(post,c.center)>1e-6))&&
          (!("wallId" in c)||!c.wallId||(c.wallId!==item.wallId&&(this.wallHeights.get(c.wallId)??Infinity)>item.bottom)));
        for(const other of this.items.values()){
          if(other!==item&&!(item.gateId&&other.gateId===item.gateId)&&other.bottom<item.top&&other.top>item.bottom)
            walls.push(other.collider(other.angle));
        }
        const count=Math.ceil(pose.length/.04);
        for(let i=1;i<=count;i++){
          const s=pose.length*i/count;
          if(!isWalkable({x:pose.hinge.x+pose.direction.x*s,y:pose.hinge.y+pose.direction.y*s},walls,item.depth/2+.002))return false;
        }
        return true;
      });
      item.blocked=result.blocked;
      item.angle=result.angle;
      item.group.rotation.y=item.rotation(item.angle);
    }
    this.syncWalk();
    const selected=this.pick(this.pointer);
    const entry=this.pickEntry(this.pointer);
    this.canvas.classList.toggle("door-target",!!entry||!!selected&&selected.section===undefined);
    this.canvas.classList.toggle("vent-target",selected?.section!==undefined);
    this.hint.hidden=!selected&&!entry;
    if (entry) this.hint.textContent="Добавить или убрать ступеньки";
    else if (selected?.gateId) {
      const action=this.walker ? selected.open?"Закрыть":"Открыть" : "Выбрать";
      this.hint.textContent=`${action} ${selected.wicket?"калитку":"ворота"}`;
    }
    else if(selected)this.hint.textContent=`${selected.open?"Закрыть":"Открыть"} ${selected.section===undefined?"дверь":selected.french?"створку":"форточку"}`;
    const rect=this.canvas.getBoundingClientRect();this.model.updateMatrixWorld(true);this.camera.updateMatrixWorld();
    const items=[...this.items.values()];
    const positions=items.filter(item=>!item.gateId).map(item=>{
      const handles=(item.group.userData.handlePoints as THREE.Vector3[]).map(p=>item.group.localToWorld(p.clone())).sort((a,b)=>a.distanceToSquared(this.camera.position)-b.distanceToSquared(this.camera.position));
      const handle=handles[0],screen=handle.clone().project(this.camera);
      return {id:item.openingId,section:item.section,angle:item.angle,open:item.open,blocked:item.blocked,
        handle:{x:rect.x+(screen.x+1)*rect.width/2,y:rect.y+(1-screen.y)*rect.height/2},position:handle.toArray()};
    });
    this.canvas.dataset.doors=JSON.stringify(positions.filter(item=>item.section===undefined));
    this.canvas.dataset.windowVents=JSON.stringify(positions.filter(item=>item.section!==undefined));
    this.canvas.dataset.gateLeaves=JSON.stringify(items.filter(item=>item.gateId)
      .map(item=>({id:item.gateId,key:item.group.name,angle:item.angle,blocked:item.blocked})));
  }
  dispose(){
    this.canvas.removeEventListener("pointerdown",this.down,true);this.canvas.removeEventListener("pointerup",this.up,true);this.canvas.removeEventListener("pointermove",this.move);this.canvas.removeEventListener("pointercancel",this.cancel);this.canvas.removeEventListener("pointerleave",this.leave);this.hint.remove();
  }
}
