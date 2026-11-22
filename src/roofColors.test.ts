import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {demoProject,parseProject} from "./model";
import {DEFAULT_ROOF,ROOF_COLORS,ROOF_TYPES,ROOF_SURFACES,roofColor,roofSurface} from "./roofSettings";
import {roofData} from "./roofModel";
import {buildRoof} from "./roofGeometry";
import {createColliders} from "./walkPhysics";
import {disposeOwnedMaterialTextures} from "./facadeMaterials";

test("roof colours round-trip for every roof shape; legacy roofs retain exact data and malformed colours are rejected",()=>{
 const old={...demoProject(),roof:{...DEFAULT_ROOF}};assert.deepEqual(parseProject(JSON.stringify(old)),old);assert.equal(roofColor(old.roof),'slate');
 for(const type of ROOF_TYPES)for(const color of ROOF_COLORS){const p={...old,roof:{...old.roof,type:type.id,color:color.id},facade:{kind:'stucco' as const,color:'ral7024' as const}};assert.deepEqual(parseProject(JSON.stringify(p)),p);}
 for(const color of [null,42,{},'blue','#474a50'])assert.throws(()=>parseProject(JSON.stringify({...old,roof:{...old.roof,color}})));
});
test("all roof meshes use the selected tint without changing shape, facade finish, dimensions or walking obstacles",()=>{
 for(const type of ROOF_TYPES){
  const p={...demoProject(),roof:{...DEFAULT_ROOF,type:type.id},facade:{kind:'stucco' as const,color:'ral7024' as const}},data=roofData(p),colliders=createColliders(p);
  for(const color of ROOF_COLORS){
   const q={...p,roof:{...p.roof,color:color.id}},group=new THREE.Group();assert.equal(roofData(q),data);buildRoof(q,group);
   const surface=group.getObjectByName('roof-surface') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>,edge=group.getObjectByName('roof-fascia') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
   assert.equal(surface.material.color.getHexString(),color.color.slice(1));assert(edge.material.color.getHSL({h:0,s:0,l:0}).l<surface.material.color.getHSL({h:0,s:0,l:0}).l);
   const gable=group.getObjectByName('roof-gables') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>|undefined;if(gable)assert.deepEqual(gable.material.userData.facade,p.facade);
   assert.deepEqual(createColliders(q),colliders);
   group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();disposeOwnedMaterialTextures(o.material);o.material.dispose();}});
  }
 }
});
test("roof profiles keep tint and geometry and repeat at a fixed scale only on the exterior",()=>{
 const old={...demoProject(),roof:{...DEFAULT_ROOF,color:"ral7024" as const}};
 assert.equal(roofSurface(old.roof),"smooth");
 for(const shape of ROOF_TYPES)for(const profile of ROOF_SURFACES){
   const base={...old,roof:{...old.roof,type:shape.id}},p={...base,roof:{...base.roof,surface:profile.id}};
   assert.deepEqual(parseProject(JSON.stringify(p)),p);
   assert.equal(roofData(p),roofData(base));
   const group=new THREE.Group();buildRoof(p,group);
   const surface=group.getObjectByName("roof-surface") as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial|THREE.MeshStandardMaterial[]>;
   if(profile.id==="smooth"){assert(!Array.isArray(surface.material));assert.equal(surface.material.bumpMap,null);continue;}
   assert(Array.isArray(surface.material));
   const [top,underside]=surface.material;
   assert(top.bumpMap&&top.map);assert.equal(top.bumpMap.wrapS,THREE.RepeatWrapping);
   assert.equal(top.color.getHex(),underside.color.getHex());assert.equal(underside.bumpMap,null);
   const {position,uv}=surface.geometry.attributes;
   const count=surface.geometry.groups[0].count;
   assert.equal(count*2,position.count);
   const width=profile.id==="metal-tile"?.19:.21,length=profile.id==="metal-tile"?.35:1;
   for(let i=0;i<count;i+=3){
     const a=new THREE.Vector3().fromBufferAttribute(position,i),b=new THREE.Vector3().fromBufferAttribute(position,i+1);
     const repeated=Math.hypot((uv.getX(i+1)-uv.getX(i))*width,(uv.getY(i+1)-uv.getY(i))*length);
     assert(Math.abs(a.distanceTo(b)-repeated)<1e-5);
   }
 }
 assert.throws(()=>parseProject(JSON.stringify({...old,roof:{...old.roof,surface:"unknown"}})));
});
