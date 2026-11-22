import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { demoProject, parseProject, type Plant, type Project, type Wall } from "./model";
import { plantTrunkRadius } from "./landscape";
import { WINDOW_FRAME_FINISHES, windowFrameFinish } from "./windowFinishes";
import { createWindowFrameMaterial, applyWindowFrameUV } from "./windowMaterials";
import { measureTreeClearances, treeClearanceObstacles, rayObstacleDistance, TREE_MARKER_LEVEL } from "./treeClearances";

const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const tree=(id="chosen",x=0,y=0):Plant=>({id,kind:"birch",variant:"birch-2",position:{x,y},height:5.5,rotation:0,seed:12});
const empty=():Project=>({version:1,name:"Участок",walls:[],openings:[]});
const wall=(id:string,ax:number,ay:number,bx:number,by:number):Wall=>({id,a:{x:ax,y:ay},b:{x:bx,y:by},thickness:.2,height:2.8});
const measure=(p:Project,t:Plant)=>measureTreeClearances(t,treeClearanceObstacles(p,t.id));
test("frame finishes round-trip with custom sections and legacy windows default to white",()=>{
  const p=demoProject();assert.deepEqual(parseProject(JSON.stringify(p)),p);assert.equal(windowFrameFinish(p.openings[0]),"white");
  for(const finish of WINDOW_FRAME_FINISHES){
    const next=structuredClone(p);next.openings[0]={...next.openings[0],frameFinish:finish.id,sectionWidths:[.5,.7,1]};
    assert.deepEqual(parseProject(JSON.stringify(next)),next);
  }
  for(const invalid of ["blue","7047",0,null,{},["white"]]){
    const next=structuredClone(p);(next.openings[0] as any).frameFinish=invalid;assert.throws(()=>parseProject(JSON.stringify(next)));
  }
  p.openings.find(o=>o.kind==="door")!.frameFinish="wood";assert.throws(()=>parseProject(JSON.stringify(p)));
});
test("older RAL 7047 frames migrate to RAL 7042 without losing window geometry or other finishes",()=>{
  const original=demoProject(),legacy=JSON.parse(JSON.stringify(original));
  const windows=legacy.openings.filter((o:any)=>o.kind==="window");
  windows[0].frameFinish="ral7047";windows[1].frameFinish="wood";windows[2].frameFinish="white";
  const expected=structuredClone(legacy);expected.openings.find((o:any)=>o.id===windows[0].id).frameFinish="ral7042";
  const result=parseProject(JSON.stringify(legacy));assert.deepEqual(result,expected);
  assert.equal(windowFrameFinish({frameFinish:"ral7047"}),"ral7042");
  assert.deepEqual(parseProject(JSON.stringify(result)),result);
  assert.equal(legacy.openings.find((o:any)=>o.id===windows[0].id).frameFinish,"ral7047");
});
test("white and RAL frames have different colours; wood has a shared, offline grain texture",()=>{
  const white=createWindowFrameMaterial("white"),grey=createWindowFrameMaterial("ral7042"),wood=createWindowFrameMaterial("wood"),another=createWindowFrameMaterial("wood");
  assert.notEqual(white.color.getHex(),grey.color.getHex());assert.equal(white.map,null);assert.equal(grey.map,null);
  assert.equal(grey.color.getHex(),0x8c9190);assert.equal(grey.name,"window-frame-ral7042");
  assert(wood.map instanceof THREE.DataTexture);assert.equal(wood.map,another.map);
  const pixels=wood.map.image.data as Uint8Array;assert(pixels.length>10000);assert(new Set(pixels.filter((_,i)=>i%4===0)).size>10);
  const horizontal=new THREE.BoxGeometry(2,.045,.24),vertical=new THREE.BoxGeometry(.045,2,.24);
  applyWindowFrameUV(horizontal,wood);applyWindowFrameUV(vertical,wood);
  for(const g of [horizontal,vertical]){
    const uv=g.attributes.uv;let min=Infinity,max=-Infinity;
    for(let i=0;i<uv.count;i++){min=Math.min(min,uv.getY(i));max=Math.max(max,uv.getY(i));}close(max-min,2/1.2);g.dispose();
  }
  for(const material of [white,grey,wood,another])material.dispose();
});
test("four distances start at the trunk edge and end at actual wall surfaces",()=>{
  const t=tree(),p={...empty(),plants:[t],walls:[wall("w",-4,-10,-4,10),wall("e",5,-10,5,10),wall("n",-10,-6,10,-6),wall("s",-10,7,10,7)]};
  const m=measure(p,t),r=plantTrunkRadius(t);assert.equal(m.length,4);
  for(const [i,d]of [3.9-r,4.9-r,5.9-r,6.9-r].entries())close(m[i].distance!,d);
  close(m[0].end.x,-3.9);close(m[1].end.x,4.9);close(m[2].end.y,-5.9);close(m[3].end.y,6.9);
});
test("the selected tree and all lawn squares are excluded; free directions have no invented distance",()=>{
  const t=tree(),p={...empty(),plants:[t]},original=measure(p,t);
  assert(original.every(m=>m.distance===null));
  const withLawn={...p,lawn:[{id:"grass",position:{x:0,y:0},size:5}]};assert.deepEqual(measure(withLawn,t),original);
  assert.deepEqual(treeClearanceObstacles(withLawn,t.id),[]);
});
test("tree clearance rays stop at trunks, including trees with low branches",()=>{
  const t=tree(),other:Plant={...tree("other",3,0),kind:"pine",variant:"pine-large-1",height:12};
  const offAxis={...other,id:"off",position:{x:1,y:2}};
  const p={...empty(),plants:[t,other,offAxis]},m=measure(p,t);
  close(m[1].distance!,3-plantTrunkRadius(t)-plantTrunkRadius(other));assert.equal(m[0].distance,null);
  const fir:Plant={...other,kind:"fir",variant:"fir-1",height:3};
  close(measure({...p,plants:[t,fir]},t)[1].distance!,3-plantTrunkRadius(t)-plantTrunkRadius(fir));
});
test("rotated walls, tangent circles, parallel rays and overlapping candidates are measured safely",()=>{
  const direction={x:1,y:0};
  close(rayObstacleDistance({x:0,y:0},direction,{center:{x:3,y:0},axis:{x:Math.SQRT1_2,y:Math.SQRT1_2},halfLength:2,halfDepth:.1}),3-.1*Math.SQRT2);
  close(rayObstacleDistance({x:0,y:0},direction,{center:{x:2,y:1},radius:1}),2);
  assert.equal(rayObstacleDistance({x:0,y:0},direction,{center:{x:-2,y:0},radius:1}),Infinity);
  assert.equal(rayObstacleDistance({x:0,y:0},direction,{center:{x:2,y:3},axis:{x:1,y:0},halfLength:1,halfDepth:.1}),Infinity);
  assert.equal(rayObstacleDistance({x:0,y:0},direction,{center:{x:0,y:0},radius:1}),0);
});
test("clearance rays pass through open doors but stop at windows and low doorways",()=>{
  const t=tree("chosen",0,4),p:Project={...empty(),plants:[t],walls:[wall("front",3,0,3,8),wall("back",6,0,6,8)],openings:[{id:"door",wallId:"front",kind:"door",offset:4,width:1.2,height:2.1,sill:0}]};
  close(measure(p,t)[1].distance!,5.9-plantTrunkRadius(t));
  close(measure({...p,openings:[{...p.openings[0],kind:"window"}]},t)[1].distance!,2.9-plantTrunkRadius(t));
  close(measure({...p,openings:[{...p.openings[0],height:1.6}]},t)[1].distance!,2.9-plantTrunkRadius(t));
});
test("selection markers are above the full grass geometry",()=>{
  const b=readFileSync(new URL("../assets/plants/lawn.glb",import.meta.url)),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  const top=Math.max(...j.meshes.map((m:any)=>j.accessors[m.primitives[0].attributes.POSITION].max[1]));
  assert(TREE_MARKER_LEVEL>top+.03);
});
