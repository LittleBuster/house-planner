import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {demoProject,parseProject,type Project,type Wall,type Point} from "./model";
import {DEFAULT_ROOF,type RoofType} from "./roofSettings";
import {roofData,buildingFootprints,roofBottomAt,pointInRoofContour,ROOF_THICKNESS} from "./roofModel";
import {buildRoof} from "./roofGeometry";
import {sceneDisplay,DEFAULT_DISPLAY} from "./sceneDisplay";
import {createColliders,movePerson,jumpHeadroom,findWalkSpawn,isWalkable} from "./walkPhysics";

const close=(a:number,b:number,tol=1e-5)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const wall=(id:string,ax:number,ay:number,bx:number,by:number,height=2.8):Wall=>({id,a:{x:ax,y:ay},b:{x:bx,y:by},thickness:.22,height});
const rectangle=(x=0,y=0,height=2.8,prefix="w"):Wall[]=>[wall(prefix+0,x,y,x+10,y,height),wall(prefix+1,x+10,y,x+10,y+7,height),wall(prefix+2,x+10,y+7,x,y+7,height),wall(prefix+3,x,y+7,x,y,height)];
const project=(walls=rectangle(),type:RoofType="gable"):Project=>({version:1,name:"Крыши",walls,openings:[],roof:{...DEFAULT_ROOF,type}});
test("all roof forms and layer visibility round-trip; older files keep their exact data without a roof",()=>{
 const p=demoProject();assert.deepEqual(parseProject(JSON.stringify(p)),p);assert.deepEqual(sceneDisplay(p),DEFAULT_DISPLAY);assert.equal(roofData(p).parts.length,0);
 for(const type of ["flat","gable","hip"] as const){const q={...p,roof:{...DEFAULT_ROOF,type},display:{house:false,roof:true,landscape:false}};assert.deepEqual(parseProject(JSON.stringify(q)),q);}
});
test("roof and display imports reject malformed values without accepting non-finite dimensions",()=>{
 const p=demoProject();
 for(const roof of [null,"gable",{}, {...DEFAULT_ROOF,type:"blue"},{...DEFAULT_ROOF,height:NaN},{...DEFAULT_ROOF,height:0},{...DEFAULT_ROOF,height:9},{...DEFAULT_ROOF,overhang:-.1},{...DEFAULT_ROOF,overhang:2},{...DEFAULT_ROOF,direction:"z"}])assert.throws(()=>parseProject(JSON.stringify({...p,roof})));
 for(const display of [null,{},true,{house:true,roof:false},{house:"yes",roof:true,landscape:true}])assert.throws(()=>parseProject(JSON.stringify({...p,display})));
});
test("interior partitions merge into one external roof footprint with a precise physical overhang",()=>{
 const p={...demoProject(),roof:{...DEFAULT_ROOF}};const data=roofData(p);assert.equal(data.parts.length,1);close(data.area,10.92*7.92,.0001);
 assert.equal(buildingFootprints(p.walls).length,1);assert.equal(data.parts[0].contour.holes.length,0);close(data.maxHeight,4.76);
 const noEaves=roofData({...p,roof:{...p.roof,overhang:0}});close(noEaves.area,10.22*7.22,.0001);
});
test("flat roofs are a closed constant-thickness plate above the walls",()=>{
 const p=project(undefined,"flat"),data=roofData(p),group=new THREE.Group();buildRoof(p,group);
 assert(data.parts[0].triangles.every(t=>t.lift.every(h=>h===0)));close(data.maxHeight,2.8+ROOF_THICKNESS);
 let signed=0;group.traverse(o=>{if(o instanceof THREE.Mesh&&(o.name==='roof-surface'||o.name==='roof-fascia')){const v=o.geometry.attributes.position;for(let i=0;i<v.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(v,i),b=new THREE.Vector3().fromBufferAttribute(v,i+1),c=new THREE.Vector3().fromBufferAttribute(v,i+2);signed+=a.dot(b.cross(c))/6;}}});
 close(Math.abs(signed),data.area*ROOF_THICKNESS,.0001);
});
test("gable roof has two planar slopes meeting at the ridge and can be rotated across the house",()=>{
 const p=project(),along=roofData(p).parts[0];close(roofBottomAt(along,{x:5,y:3.5}),4.6);close(roofBottomAt(along,{x:0,y:3.5}),4.6);
 const across=roofData({...p,roof:{...p.roof!,direction:"y"}}).parts[0];assert(roofBottomAt(across,{x:0,y:3.5})<3.1);close(roofBottomAt(across,{x:5,y:3.5}),4.6);
 const normals=new Set(along.triangles.map(t=>{const[a,b,c]=t.points,[ha,hb,hc]=t.lift;return new THREE.Vector3(b.x-a.x,hb-ha,b.y-a.y).cross(new THREE.Vector3(c.x-a.x,hc-ha,c.y-a.y)).normalize().toArray().map(x=>x.toFixed(3)).join(",");}));assert.equal(normals.size,2);
});
test("multi-slope roofs have hips on every edge, a controlled peak and a bounded mesh",()=>{
 const p=project(undefined,"hip"),data=roofData(p),part=data.parts[0],all=part.triangles.flatMap(t=>t.lift);
 close(Math.max(...all),1.8);assert(Math.min(...all)>=-1e-6);assert(data.triangleCount>=4&&data.triangleCount<12000);
 const normals=new Set(part.triangles.map(t=>{const[a,b,c]=t.points,[ha,hb,hc]=t.lift;return new THREE.Vector3(b.x-a.x,hb-ha,b.y-a.y).cross(new THREE.Vector3(c.x-a.x,hc-ha,c.y-a.y)).normalize().toArray().map(x=>x.toFixed(3).replace('-0.000','0.000')).join(',');}));assert.equal(normals.size,4);
 close(roofBottomAt(part,{x:-.46,y:3.5}),2.8);assert(roofBottomAt(part,{x:0,y:3.5})<3.1);close(roofBottomAt(part,{x:5,y:3.5}),4.6,.015);
});
test("concave L-shaped houses keep their external outline instead of receiving a rectangular roof over the notch",()=>{
 const outline=[{x:0,y:0},{x:6,y:0},{x:6,y:2},{x:2,y:2},{x:2,y:6},{x:0,y:6}],walls=outline.map((a,i)=>{const b=outline[(i+1)%outline.length];return wall(`L${i}`,a.x,a.y,b.x,b.y);}),p=project(walls,"hip"),data=roofData(p);
 assert.equal(data.parts.length,1);assert(!pointInRoofContour({x:5,y:5},data.parts[0].contour));assert(data.area<40);
 for(const t of data.parts[0].triangles){const center={x:t.points.reduce((s,p)=>s+p.x,0)/3,y:t.points.reduce((s,p)=>s+p.y,0)/3};assert(pointInRoofContour(center,data.parts[0].contour));}
 const group=new THREE.Group();buildRoof(p,group);assert(group.children.length>=2);
});
test("separate buildings receive separate roofs at their own wall heights and open chains do not produce roofs",()=>{
 const p=project([...rectangle(),...rectangle(20,0,4,"b")],"flat"),data=roofData(p);assert.equal(data.parts.length,2);assert.deepEqual(data.parts.map(p=>p.base).sort(),[2.8,4]);close(data.maxHeight,4.16);
 const open=project([wall("open",0,0,5,0)]);assert.equal(roofData(open).parts.length,0);assert(open.roof);
});
test("roof footprint and height remain valid after rotating or reversing the wall drawing",()=>{
 const p=project(),angle=Math.PI*.31,rotate=(q:Point)=>({x:8+q.x*Math.cos(angle)-q.y*Math.sin(angle),y:-5+q.x*Math.sin(angle)+q.y*Math.cos(angle)});
 const rotated={...p,walls:p.walls.map(w=>({...w,a:rotate(w.b),b:rotate(w.a)}))},data=roofData(rotated);assert.equal(data.parts.length,1);close(data.maxHeight,4.76);assert(Math.abs(data.area-roofData(p).area)<.01);
});
test("hidden house and landscape are not invisible walking obstacles and remain unchanged in saved data",()=>{
 const p=demoProject(),before=JSON.stringify(p),all=createColliders(p);assert(all.length>0);
 const hidden={...p,display:{house:false,roof:false,landscape:false}};assert.equal(createColliders(hidden).length,0);const moved=movePerson({x:2,y:2},{x:0,y:-8},createColliders(hidden));close(moved.y,-6);assert.equal(JSON.stringify(p),before);
});
test("a low visible roof limits jumping and standing while hiding the roof removes only that collision",()=>{
 const p=project(rectangle(0,0,2),"flat");close(jumpHeadroom(p,{x:5,y:3.5}),.59);assert.equal(jumpHeadroom({...p,display:{house:true,roof:false,landscape:true}},{x:5,y:3.5}),Infinity);
 close(jumpHeadroom({...p,display:{house:false,roof:true,landscape:false}},{x:5,y:3.5}),.59);
 const low=project(rectangle(0,0,1.5),"flat"),colliders=createColliders(low),spawn=findWalkSpawn(low,colliders);assert(!isWalkable({x:5,y:3.5},colliders));assert(isWalkable(spawn.position,colliders));
});
