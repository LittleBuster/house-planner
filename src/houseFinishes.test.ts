import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {demoProject,parseProject,type Opening,type Project,type Wall} from "./model";
import {DOOR_FINISHES,DEFAULT_PLINTH,interiorSettings,doorFinish,doorOpen} from "./houseFinishes";
import {STUCCO_COLORS} from "./facadeSettings";
import {createFoundation,foundationContains,foundationPaths} from "./plinthGeometry";
import {createInteriorMaterial} from "./interiorMaterials";
import {advanceDoorAngle,doorLeafCollider,doorLeafPose,doorLocalAngle,doorTarget} from "./doorPhysics";
import {createColliders,isWalkable,movePerson} from "./walkPhysics";
import {createDoorLeaf} from "./doorGeometry";

const wall=(id:string,ax:number,ay:number,bx:number,by:number):Wall=>({id,a:{x:ax,y:ay},b:{x:bx,y:by},thickness:.22,height:2.8});
const house=():Project=>({version:1,name:"Отделка",walls:[wall('a',0,0,6,0),wall('b',6,0,6,4),wall('c',6,4,0,4),wall('d',0,4,0,0)],openings:[]});
const door:Opening={id:"door",kind:"door",wallId:"a",offset:3,width:1,height:2.1,sill:0,open:false};
test("interior, plinth and all door finishes round-trip while legacy projects retain exact data",()=>{
 const old=demoProject();assert.deepEqual(parseProject(JSON.stringify(old)),old);assert.equal(interiorSettings(old).kind,"paint");assert.equal(doorFinish(door),"wood");assert(doorOpen({...door,open:undefined}));
 for(const c of STUCCO_COLORS)for(const kind of ["paint","stucco"] as const){const p={...house(),interior:{kind,color:c.id},plinth:{...DEFAULT_PLINTH,color:c.id}};assert.deepEqual(parseProject(JSON.stringify(p)),p);}
 for(const c of DOOR_FINISHES){const p={...house(),doorFinish:c.id,openings:[{...door,doorFinish:c.id}]};assert.deepEqual(parseProject(JSON.stringify(p)),p);}
 const invalid=[{interior:{kind:"brick",color:"white"}},{interior:{kind:"paint",color:"red"}},{plinth:{...DEFAULT_PLINTH,height:0}},{plinth:{...DEFAULT_PLINTH,recess:-.01}},{plinth:{...DEFAULT_PLINTH,color:"purple"}},{doorFinish:"blue"},{openings:[{...door,open:1}]},{openings:[{...door,doorFinish:"blue"}]},{openings:[{...door,kind:"window",doorFinish:"white"}]}];
 for(const patch of invalid)assert.throws(()=>parseProject(JSON.stringify({...house(),...patch})));
});
test("the floor and recessed plinth form one solid slab under the doorway",()=>{
 const p={...house(),openings:[door]}, paths=foundationPaths(p);
 const [slab] = createFoundation(p,new THREE.MeshStandardMaterial());
 slab.geometry.computeBoundingBox();
 const box = slab.geometry.boundingBox!;
 assert(Math.abs(box.min.z+.07)<.0002);
 assert(Math.abs(box.max.y)<.0002);
 assert(Math.abs(box.min.y+DEFAULT_PLINTH.height+.02)<.0002);
 assert(foundationContains(paths,{x:3,y:-.069}));
 assert(!foundationContains(paths,{x:3,y:-.071}));
});
test("plinth handles rotation, concave footprints and thin walls",()=>{
 const p=house();
 for(const q of [p,{...p,plinth:{...DEFAULT_PLINTH,recess:.15},walls:p.walls.map(w=>({...w,thickness:.05}))},{...p,walls:[wall('a',0,0,6,0),wall('b',6,0,6,2),wall('c',6,2,3,2),wall('d',3,2,3,4),wall('e',3,4,0,4),wall('f',0,4,0,0)]}]){
   const a=.63,rotate=({x,y}:{x:number;y:number})=>({x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)}),rotated={...q,walls:q.walls.map(w=>({...w,a:rotate(w.a),b:rotate(w.b)}))};
   const meshes=createFoundation(rotated,new THREE.MeshStandardMaterial());assert(meshes.length);for(const mesh of meshes)assert([...mesh.geometry.attributes.position.array].every(Number.isFinite));
 }
});
test("paint is smooth and interior stucco keeps its physical grain with a brick exterior",()=>{
 const paint=createInteriorMaterial({kind:"paint",color:"ral7047"},{kind:"brick",color:"red"}),stucco=createInteriorMaterial({kind:"stucco",color:"ral7042"},{kind:"brick",color:"red"});
 assert.equal(paint.map,null);assert.equal(paint.bumpMap,null);assert(stucco.bumpMap&&stucco.bumpScale===.0015);assert(Math.abs(stucco.map!.repeat.x-2.08/.256)<1e-9);assert(Math.abs(stucco.map!.repeat.y-.6/.256)<1e-9);
});
test("closed doors block walking, open doors free the aperture and intermediate angles match the solid leaf",()=>{
 const p={...house(),openings:[door]},w=p.walls[0];
 assert(movePerson({x:3,y:1},{x:0,y:-2},createColliders(p)).y>.23);
 assert(movePerson({x:3,y:1},{x:0,y:-2},createColliders({...p,openings:[{...door,open:true}]})).y<-.9);
 for(const angle of [0,.2,.6,Math.PI/2]){
  const collider=doorLeafCollider(door,w,angle),pose=doorLeafPose(door,w,angle);assert(!isWalkable({x:pose.hinge.x+pose.direction.x*.4,y:pose.hinge.y+pose.direction.y*.4},[collider]));
  const render=createDoorLeaf(door,new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial());render.rotation.y=-angle;const point=render.localToWorld(new THREE.Vector3(pose.length,0,0));assert(Math.abs(point.x-(pose.hinge.x+pose.direction.x*pose.length))<1e-6);assert(Math.abs(point.z-(pose.hinge.y+pose.direction.y*pose.length))<1e-6);
 }
 assert.equal(doorTarget(door),0);assert.equal(doorTarget({...door,open:true}),Math.PI/2);
});
test("door motion stops before a person, can reverse, and colliders use the actual angle during animation",()=>{
 const w=house().walls[0],person={x:3,y:.15};let angle=Math.PI/2,blocked=false;
 for(let i=0;i<120;i++){const step=advanceDoorAngle(angle,0,1/60,next=>isWalkable(person,[doorLeafCollider(door,w,next)]));angle=step.angle;blocked=step.blocked;}
 assert(blocked&&angle>0&&angle<Math.PI/2);assert(isWalkable(person,[doorLeafCollider(door,w,angle)]));
 const reopened=advanceDoorAngle(angle,Math.PI/2,.05);assert(reopened.angle>angle&&!reopened.blocked);
 const p={...house(),openings:[door]},actual=createColliders(p,.025,0,new Map([[door.id,Math.PI/2]]));assert(movePerson({x:3,y:1},{x:0,y:-2},actual).y<-.9);
 for(let i=0;i<240;i++)angle=advanceDoorAngle(angle,0,1/60).angle;assert(angle<1e-5);
});
test("the hinge and opening side can change independently, with matching rendered and solid leaves",()=>{
 const w=house().walls[0],finish=new THREE.MeshStandardMaterial(),metal=new THREE.MeshStandardMaterial();
 for(const doorSwing of [-1,1] as const)for(const doorMirrored of [false,true]){
   const oriented={...door,doorSwing,doorMirrored,open:true},p={...house(),openings:[oriented]};
   assert.deepEqual(parseProject(JSON.stringify(p)),p);
   const target=doorTarget(oriented),pose=doorLeafPose(oriented,w),render=createDoorLeaf(oriented,finish,metal);
   assert.equal(target,doorSwing*Math.PI/2);
   assert.equal(Math.sign(pose.hinge.x-door.offset),doorMirrored?1:-1);
   assert(Math.abs(pose.direction.y-doorSwing)<1e-8);
   for(const angle of [0,target/2,target]){
     render.rotation.y=-doorLocalAngle(oriented,angle);
     const center=render.localToWorld(new THREE.Vector3(pose.length/2,0,0));
     const collider=doorLeafCollider(oriented,w,angle);
     assert(Math.hypot(center.x-collider.center.x,center.z-collider.center.y)<1e-8);
   }
   assert(movePerson({x:3,y:1},{x:0,y:-2},createColliders(p)).y<-.9);
   assert(movePerson({x:3,y:1},{x:0,y:-2},createColliders({...p,openings:[{...oriented,open:false}]})).y>.23);
 }
 for(const patch of [{doorSwing:0},{doorMirrored:"true"},{kind:"window",doorSwing:1}]){
   assert.throws(()=>parseProject(JSON.stringify({...house(),openings:[{...door,...patch}]})));
 }
});
