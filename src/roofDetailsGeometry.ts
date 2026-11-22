import * as THREE from "three";
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js";
import type {Project} from "./model";
import {roofDetailsPlan,type EaveRun,type Position3} from "./roofDetailsPlan";
const vector=(p:Position3)=>new THREE.Vector3(p.x,p.y,p.z);
function gutter(run:EaveRun){
 const positions:number[]=[],normalAt=(end:boolean,theta:number,radius:number)=>{const p=end?run.gutterB:run.gutterA,n=end?run.crossB:run.crossA;return new THREE.Vector3(p.x+n.x*Math.cos(theta)*radius,p.y+Math.sin(theta)*radius,p.z+n.y*Math.cos(theta)*radius);};
 const triangle=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3)=>positions.push(...a.toArray(),...b.toArray(),...c.toArray());
 const quad=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3)=>{triangle(a,b,c);triangle(a,c,d);};
 for(let i=0;i<16;i++){
  const a=Math.PI+i*Math.PI/16,b=Math.PI+(i+1)*Math.PI/16;
  quad(normalAt(false,a,.075),normalAt(true,a,.075),normalAt(true,b,.075),normalAt(false,b,.075));
  quad(normalAt(false,b,.071),normalAt(true,b,.071),normalAt(true,a,.071),normalAt(false,a,.071));
  for(const end of[false,true])if(end?run.capB:run.capA)triangle(vector(end?run.gutterB:run.gutterA),normalAt(end,a,.075),normalAt(end,b,.075));
 }
 for(const theta of[Math.PI,Math.PI*2])quad(normalAt(false,theta,.075),normalAt(false,theta,.071),normalAt(true,theta,.071),normalAt(true,theta,.075));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();return geometry;
}
function cylinder(a:THREE.Vector3,b:THREE.Vector3,radius:number){const direction=b.clone().sub(a),geometry=new THREE.CylinderGeometry(radius,radius,direction.length(),10);geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));geometry.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);return geometry;}
function curve(points:THREE.Vector3[],round:boolean){
 const result=new THREE.CurvePath<THREE.Vector3>();let last=points[0];
 for(let i=1;i<points.length-1;i++){
  const p=points[i],before=p.clone().sub(points[i-1]),after=points[i+1].clone().sub(p),r=round?Math.min(.075,before.length()*.3,after.length()*.3):0,a=p.clone().addScaledVector(before.normalize(),-r),b=p.clone().addScaledVector(after.normalize(),r);
  if(last.distanceTo(a)>.00001)result.add(new THREE.LineCurve3(last,a));if(r>0)result.add(new THREE.QuadraticBezierCurve3(a,p,b));last=b;
 }
 if(last.distanceTo(points[points.length-1])>.00001)result.add(new THREE.LineCurve3(last,points[points.length-1]));return result;
}
function tube(points:THREE.Vector3[],radius:number,rounded=false){const path=curve(points,rounded);return new THREE.TubeGeometry(path,Math.max(12,Math.min(220,Math.ceil(path.getLength()*10))),radius,10,false);}
function addBatch(group:THREE.Group,geometries:THREE.BufferGeometry[],material:THREE.Material,name:string){
 if(!geometries.length)return;const geometry=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
}
export function buildRoofDetails(project:Project,parent:THREE.Group,color:THREE.Color){
 const plan=roofDetailsPlan(project),group=new THREE.Group();group.name='roof-accessories';group.userData={gutters:plan.eaves.length,downspouts:plan.pipes.length,snowGuards:plan.guards.length,pipePositions:plan.pipes.map(p=>({...p.wall}))};
 if(!plan.eaves.length)return group;
 const metal=new THREE.MeshStandardMaterial({color:color.clone().multiplyScalar(.68),roughness:.48,metalness:.48,side:THREE.DoubleSide}),gutters=plan.eaves.map(gutter),pipes:THREE.BufferGeometry[]=[],guards:THREE.BufferGeometry[]=[];metal.name='roof-accessory-metal';
 for(const pipe of plan.pipes){
  const points=pipe.points.map(vector);pipes.push(tube(points,.045,true));
  const funnel=new THREE.CylinderGeometry(.063,.044,.10,12);funnel.translate(points[0].x,points[0].y-.025,points[0].z);pipes.push(funnel);
  for(const p of pipe.clamps){
   const ring=new THREE.TorusGeometry(.049,.006,6,12);ring.rotateX(Math.PI/2);ring.translate(p.x,p.y,p.z);pipes.push(ring,cylinder(vector(p),new THREE.Vector3(pipe.wall.x,p.y,pipe.wall.y),.009));
  }
 }
 for(const guard of plan.guards){
  for(const h of[.10,.24])guards.push(tube(guard.feet.map(p=>new THREE.Vector3(p.x,p.y+h,p.z)),.016));
  for(const support of guard.supports){
   const p=vector(support.foot);guards.push(cylinder(p,p.clone().add(new THREE.Vector3(0,.255,0)),.011));
   const x=new THREE.Vector3(support.along.x,0,support.along.y),z=new THREE.Vector3(support.inward.x,support.slope,support.inward.y).normalize(),y=z.clone().cross(x).normalize(),basis=new THREE.Matrix4().makeBasis(x,y,z),foot=new THREE.BoxGeometry(.075,.014,.18);foot.applyMatrix4(basis);foot.translate(p.x,p.y+.008,p.z);guards.push(foot);
  }
 }
 addBatch(group,gutters,metal,'roof-gutters');addBatch(group,pipes,metal,'roof-downspouts');addBatch(group,guards,metal,'roof-snow-guards');parent.add(group);return group;
}
