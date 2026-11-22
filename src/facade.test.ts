import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {demoProject,parseProject,type Project,type Wall} from "./model";
import {wallBody} from "./wallBodies";
import {facadeSettings,STUCCO_COLORS,BRICK_COLORS,type FacadeSettings} from "./facadeSettings";
import {createFacadeWallPieces} from "./facadeGeometry";
import {facadePixels,createFacadeMaterial,disposeOwnedMaterialTextures} from "./facadeMaterials";
import {buildRoof} from "./roofGeometry";
import {createColliders} from "./walkPhysics";

const wall=(id:string,ax:number,ay:number,bx:number,by:number):Wall=>({id,a:{x:ax,y:ay},b:{x:bx,y:by},thickness:.22,height:2.8});
const house=():Project=>({version:1,name:"Фасад",walls:[wall('a',0,0,6,0),wall('b',6,0,6,4),wall('c',6,4,0,4),wall('d',0,4,0,0)],openings:[]});
function pieces(p:Project,w=p.walls[0],start?:number,end?:number,bottom=0,top=w.height){const body=wallBody(w,p.walls);return createFacadeWallPieces(w,body,start??body.min,end??body.max,bottom,top,p);}
function triangles(geometry:THREE.BufferGeometry){
 const p=geometry.attributes.position,n=geometry.attributes.normal,index=geometry.index,count=index?index.count:p.count,result=[];
 for(let i=0;i<count;i+=3){const ids=[i,i+1,i+2].map(j=>index?index.getX(j):j);result.push({x:ids.reduce((s,j)=>s+p.getX(j),0)/3,y:ids.reduce((s,j)=>s+p.getY(j),0)/3,z:ids.reduce((s,j)=>s+p.getZ(j),0)/3,nx:n.getX(ids[0]),ny:n.getY(ids[0]),nz:n.getZ(ids[0]),material:geometry.groups.find(g=>g.start<=i&&g.start+g.count>i)?.materialIndex});}
 return result;
}
test("all facade colours round-trip; older projects preserve exact data and invalid kind/colour pairs are rejected",()=>{
 const old=demoProject();assert.deepEqual(parseProject(JSON.stringify(old)),old);assert.deepEqual(facadeSettings(old),{kind:"stucco",color:"white"});
 const settings:FacadeSettings[]=[...STUCCO_COLORS.map(c=>({kind:"stucco" as const,color:c.id})),...BRICK_COLORS.map(c=>({kind:"brick" as const,color:c.id}))];
 for(const facade of settings){const p={...old,facade};assert.deepEqual(parseProject(JSON.stringify(p)),p);}
 for(const facade of [null,{},true,{kind:"stucco",color:"red"},{kind:"brick",color:"ral7047"},{kind:"paint",color:"white"},{kind:"stucco",color:7042}])assert.throws(()=>parseProject(JSON.stringify({...old,facade})));
});
test("only outside wall faces receive the facade; inner faces, partitions and top cuts stay plain",()=>{
 const p=house();p.walls.push(wall('partition',3,0,3,4));
 const rows=pieces(p).flatMap(triangles),outside=rows.filter(t=>t.nz<-.9),inside=rows.filter(t=>t.nz>.9);
 assert(outside.length>0&&outside.every(t=>t.material===1));assert(inside.length>0&&inside.every(t=>t.material===0));
 assert(rows.filter(t=>t.ny>.9).every(t=>t.material===0));assert(pieces(p,p.walls[4]).every(g=>g.userData.facadeTriangles===0));
});
test("one long wall can be external on one side of a T junction and internal beside an attached wing",()=>{
 const p=house();p.walls.push(wall('wing-a',3,0,3,-3),wall('wing-b',3,-3,6,-3),wall('wing-c',6,-3,6,0));
 const faces=pieces(p).flatMap(triangles).filter(t=>t.nz<-.9);
 const exterior=faces.filter(t=>t.x<2.88),interior=faces.filter(t=>t.x>3.12);
 assert(exterior.length>0&&exterior.every(t=>t.material===1));assert(interior.length>0&&interior.every(t=>t.material===0));
});
test("brick UVs remain in metres across openings, different wall lengths, rotations and reversed drawing directions",()=>{
 const p={...house(),facade:{kind:"brick",color:"red"} as FacadeSettings};
 for(const w of [p.walls[0],{...p.walls[0],a:p.walls[0].b,b:p.walls[0].a}])for(const g of pieces({...p,walls:[w,...p.walls.slice(1)]},w,1,2,2.1,2.8)){
  const pos=g.attributes.position,normal=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<pos.count;i++)if(Math.abs(normal.getZ(i))>.9){assert(Math.abs(uv.getY(i)-pos.getY(i)/.6)<1e-5);assert(Math.abs(uv.getX(i)-pos.getX(i)/2.08)<1e-5);}
 }
 const angle=.63,rotate=(q:{x:number;y:number})=>({x:q.x*Math.cos(angle)-q.y*Math.sin(angle),y:q.x*Math.sin(angle)+q.y*Math.cos(angle)}),rotated={...p,walls:p.walls.map(w=>({...w,a:rotate(w.a),b:rotate(w.b)}))};
 assert(pieces(rotated).some(g=>g.userData.facadeTriangles>0));assert.deepEqual(createColliders(p),createColliders(house()));
});
test("window reveals and gable fronts use the same exterior material and course height",()=>{
 const p:Project={...house(),facade:{kind:"brick",color:"brown"},roof:{type:"gable",height:1.8,overhang:.35,direction:"x"}};
 const reveal=pieces(p,p.walls[0],1,2,.9,2.8).flatMap(triangles).filter(t=>t.ny<-.9);assert(reveal.length>0&&reveal.every(t=>t.material===1));
 const group=new THREE.Group();buildRoof(p,group);const gable=group.getObjectByName('roof-gables') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
 assert.deepEqual(gable.material.userData.facade,p.facade);assert(gable.geometry.attributes.uv.count>0);
 const n=gable.geometry.attributes.normal,v=gable.geometry.attributes.position,uv=gable.geometry.attributes.uv;
 for(let i=0;i<v.count;i++)if(Math.abs(n.getY(i))<.5)assert(Math.abs(uv.getY(i)-v.getY(i)/.6)<1e-5);
});
test("brick courses use 250 × 65 mm faces with 10 mm joints and stucco keeps millimetre relief without displacing walls",()=>{
 const data=facadePixels({kind:"brick",color:"red"}),at=(x:number,y:number)=>data.bump[(y*data.width+x)*4];
 assert.deepEqual(data.metres,[2.08,.6]);assert(at(0,32)<at(64,32));assert(at(64,0)<at(64,32));
 const brick=createFacadeMaterial({kind:"brick",color:"red"}),stucco=createFacadeMaterial({kind:"stucco",color:"ral7047"});
 assert(brick.bumpMap&&brick.map&&brick.bumpScale===.006);assert(stucco.bumpMap&&stucco.bumpScale===.002&&stucco.roughness>.9);
 assert.equal(brick.map!.wrapS,THREE.RepeatWrapping);assert.equal(brick.map!.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(brick.displacementMap,null);
 let disposed=0;for(const map of brick.userData.ownedTextures)map.addEventListener('dispose',()=>disposed++);disposeOwnedMaterialTextures(brick);assert.equal(disposed,2);brick.dispose();disposeOwnedMaterialTextures(stucco);stucco.dispose();
});
