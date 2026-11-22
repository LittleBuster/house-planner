import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {demoProject,parseProject,type Project} from "./model";
import {lawnGridSize,snapSitePoint,siteGridLines} from "./siteGrid";
import {SiteGridScene} from "./SiteGridScene";
import {TERRAIN_LEVEL,SITE_LEVEL} from "./sceneSurfaces";
import {cloudPosition,CLOUD_SPEED,SUN_DIRECTION} from "./sky";

test("house snap keeps 1 cm precision independently of the visual site grid",()=>{
 assert.deepEqual(snapSitePoint({x:2.144,y:-3.156}),{x:2.14,y:-3.16});
 assert.deepEqual(snapSitePoint({x:-.133,y:.079}),{x:-.13,y:.08});
});
test("a shared lawn grid size round-trips without moving old walls or tiles and malformed settings are rejected",()=>{
 const old=demoProject();assert.deepEqual(parseProject(JSON.stringify(old)),old);assert.equal(lawnGridSize(old),2);
 const p:Project={...old,siteGrid:{lawnSize:3},lawn:[{id:"tile",position:{x:-1,y:1},size:2}]};
 const loaded=parseProject(JSON.stringify(p));assert.deepEqual(loaded,p);assert.deepEqual(loaded.walls,old.walls);assert.equal(lawnGridSize(loaded),3);
 for(const siteGrid of [null,{},true,{lawnSize:"2"},{lawnSize:0},{lawnSize:6},{lawnSize:NaN}])assert.throws(()=>parseProject(JSON.stringify({...old,siteGrid})));
});
test("3D grid lines follow the site step, remain below floors and stay bounded for a large site",()=>{
 const p:Project={...demoProject(),siteGrid:{lawnSize:3}},values=siteGridLines(p);
 assert(values.length>0&&values.every(v=>Math.abs(v/3-Math.round(v/3))<1e-6));
 const scene=new THREE.Scene(),grid=new SiteGridScene(scene);grid.setProject(p);
 const positions=grid.object.geometry.attributes.position;
 for(let i=0;i<positions.count;i++){assert(Math.abs(positions.getY(i)-(TERRAIN_LEVEL+.006))<1e-6);assert(positions.getY(i)<SITE_LEVEL-.02);}
 const far={...p,lawn:[{id:"far",position:{x:490,y:-490},size:2}]};assert(siteGridLines(far).length<=81*2*4);grid.dispose();assert.equal(scene.children.length,0);
});
test("clouds move continuously at a stable wind speed, wrap to bounded positions and keep altitude",()=>{
 for(let i=0;i<30;i++){
  const a=cloudPosition(i,0),b=cloudPosition(i,.1),late=cloudPosition(i,1e8);
  assert(Math.abs(b.x-a.x-CLOUD_SPEED*.1)<1e-6);assert.equal(a.y,b.y);assert.equal(a.z,b.z);
  assert(Math.abs(late.x)<=1050&&late.y>=115&&late.y<=240);assert.deepEqual(cloudPosition(i,0),a);
 }
 assert(SUN_DIRECTION.y>0&&SUN_DIRECTION.z<0);assert(Math.abs(SUN_DIRECTION.length()-1)<1e-6);
});
