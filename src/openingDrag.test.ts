import { test } from "node:test";
import assert from "node:assert/strict";
import { canPlaceOpening, parseProject, type Opening, type Project } from "./model";
import { dragOpening, fitsOpeningSlot, offsetAlongWall, openingSlot } from "./openingDrag";
import { measureOpeningClearances } from "./openingClearances";
import { resizeWindow, resizeWindowSection } from "./windowSections";

const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const fixture=():Project=>({version:1,name:"Проёмы",walls:[{id:"wall",a:{x:0,y:0},b:{x:12,y:0},thickness:.2,height:2.8}],openings:[{id:"window",kind:"window",wallId:"wall",offset:5,width:2.4,height:1.4,sill:.9,sectionWidths:[.6,.8,1],frameFinish:"wood"}]});
test("moving a window preserves its wall, sizes, sections, finish and pointer grab offset",()=>{
  const p=fixture(),next=dragOpening(p,"window","move",1.27,false)!;
  close(next.offset,6.27);assert.equal(next.wallId,"wall");assert.equal(next.width,2.4);
  assert.deepEqual(next.sectionWidths,[.6,.8,1]);assert.equal(next.frameFinish,"wood");assert.deepEqual(p,fixture());
  const wall=p.walls[0],press=offsetAlongWall({x:4.2,y:1.3},wall),move=offsetAlongWall({x:5.47,y:-10},wall);
  close(dragOpening(p,"window","move",move-press,false)!.offset,6.27);
});
test("pulling either window edge holds the opposite edge fixed and scales all sections",()=>{
  const p=fixture(),left=dragOpening(p,"window","start",-.6,false)!,right=dragOpening(p,"window","end",.6,false)!;
  close(left.width,3);close(left.offset+left.width/2,6.2);close(left.offset-left.width/2,3.2);
  close(right.width,3);close(right.offset-right.width/2,3.8);close(right.offset+right.width/2,6.8);
  assert.deepEqual(left.sectionWidths,[.75,1,1.25]);assert.deepEqual(right.sectionWidths,[.75,1,1.25]);
  assert.equal(left.frameFinish,"wood");assert.equal(right.height,1.4);assert.equal(right.sill,.9);
});
test("movement and resizing stop at wall ends, minimum width and maximum width",()=>{
  const p=fixture();
  const west=dragOpening(p,"window","move",-100,false)!,east=dragOpening(p,"window","move",100,false)!;
  close(west.offset-west.width/2,.12);close(east.offset+east.width/2,11.88);
  close(dragOpening(p,"window","start",100,false)!.width,.3);
  close(dragOpening(p,"window","end",-100,false)!.width,.3);
  const wide={...p,openings:[{...p.openings[0],offset:6,width:2,sectionWidths:[1,1]}]};
  close(dragOpening(wide,"window","end",100,false)!.offset+dragOpening(wide,"window","end",100,false)!.width/2,11.88);
  const long={...p,walls:[{...p.walls[0],b:{x:30,y:0}}]};close(dragOpening(long,"window","end",100,false)!.width,10);
  for(const mode of ["move","start","end"] as const)for(const delta of [-100,-1.2,0,.37,100])assert(canPlaceOpening(p,dragOpening(p,"window",mode,delta,false)!,"window"));
});
test("a large drag cannot jump across neighbouring doors or windows",()=>{
  const p=fixture();p.openings.push({id:"left",wallId:"wall",kind:"door",offset:2,width:1,height:2.1,sill:0},{id:"right",wallId:"wall",kind:"window",offset:9,width:1.8,height:1.4,sill:.9});
  assert.deepEqual(openingSlot(p,p.openings[0]),{start:2.6,end:8});
  const west=dragOpening(p,"window","move",-100,false)!,east=dragOpening(p,"window","move",100,false)!;
  close(west.offset-west.width/2,2.6);close(east.offset+east.width/2,8);
  close(dragOpening(p,"window","start",-100,false)!.offset-dragOpening(p,"window","start",-100,false)!.width/2,2.6);
  close(dragOpening(p,"window","end",100,false)!.offset+dragOpening(p,"window","end",100,false)!.width/2,8);
});
test("door movement and resizing keep height and sill without acquiring window parameters",()=>{
  const p=fixture(),door:Opening={id:"door",wallId:"wall",kind:"door",offset:4,width:1,height:2.1,sill:0};p.openings=[door];
  for(const mode of ["move","start","end"] as const){
    const next=dragOpening(p,"door",mode,.5,false)!;assert.equal(next.height,2.1);assert.equal(next.sill,0);assert.equal(next.sectionWidths,undefined);assert.equal(next.frameFinish,undefined);
    assert(canPlaceOpening(p,next,"door"));
  }
  close(dragOpening(p,"door","end",.5,false)!.offset-1.5/2,3.5);
});
test("projection follows vertical, diagonal and reversed walls and snap works along their axes",()=>{
  for(const b of [{x:0,y:12},{x:12*Math.SQRT1_2,y:12*Math.SQRT1_2},{x:-12,y:0}]){
    const p=fixture();p.walls[0].b=b;const len=Math.hypot(b.x,b.y);
    const axis={x:b.x/len,y:b.y/len},normal={x:-axis.y,y:axis.x};
    const point={x:axis.x*6.27+normal.x*10,y:axis.y*6.27+normal.y*10};
    close(offsetAlongWall(point,p.walls[0]),6.27);
    close(dragOpening(p,"window","move",offsetAlongWall(point,p.walls[0])-5,true)!.offset,6.27);
    const edge=dragOpening(p,"window","end",.37,true)!;close(edge.offset+edge.width/2,6.57);close(edge.offset-edge.width/2,3.8);
  }
});
test("resizing to a centimetre keeps an off-grid stationary jamb at its exact position",()=>{
  const p=fixture(),o={...p.openings[0],offset:5.005};
  p.openings=[o];
  close(dragOpening(p,o.id,"move",.013,true)!.offset,5.015);
  const right=dragOpening(p,o.id,"end",.028,true)!;
  close(right.width,2.43);
  close(right.offset-right.width/2,o.offset-o.width/2);
  const left=dragOpening(p,o.id,"start",-.034,true)!;
  close(left.width,2.43);
  close(left.offset+left.width/2,o.offset+o.width/2);
});
test("arbitrary valid gestures remain importable and retain all unrelated project objects",()=>{
  const p=fixture();
  for(const mode of ["move","start","end"] as const)for(let i=0;i<100;i++){
    const next=dragOpening(p,"window",mode,(i-50)*.143,i%2===0)!;
    const result={...p,openings:[next]};assert.deepEqual(parseProject(JSON.stringify(result)),result);
  }
  assert.equal(dragOpening(p,"missing","move",1,true),null);assert.equal(dragOpening(p,"window","move",NaN,true),null);
});
test("either window edge stops at the face of a T junction or crossing wall even after a large snapped drag",()=>{
  const p=fixture();p.walls.push(
    {id:"left-junction",a:{x:3,y:0},b:{x:3,y:4},thickness:.3,height:2.8},
    {id:"right-crossing",a:{x:8,y:-3},b:{x:8,y:3},thickness:.4,height:2.8});
  const before=structuredClone(p);
  for(const snap of [false,true]){
    const start=dragOpening(p,"window","start",-100,snap)!,end=dragOpening(p,"window","end",100,snap)!;
    close(start.offset-start.width/2,3.15);close(start.offset+start.width/2,6.2);
    close(end.offset+end.width/2,7.8);close(end.offset-end.width/2,3.8);
    close(measureOpeningClearances(p,start)[0].distance,0);close(measureOpeningClearances(p,end)[1].distance,0);
    assert(start.sectionWidths&&end.sectionWidths);close(start.sectionWidths.reduce((a,b)=>a+b,0),start.width);
    close(end.sectionWidths.reduce((a,b)=>a+b,0),end.width);
    assert.equal(end.frameFinish,"wood");assert(canPlaceOpening(p,end,"window"));
  }
  assert.deepEqual(p,before);
});
test("an oblique wall face limits resizing on rotated and reversed host walls without rounding through the wall",()=>{
  const original=fixture();original.walls.push({id:"oblique",a:{x:1,y:-2},b:{x:5,y:2},thickness:.2,height:2.8});
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI*.75]){
    const transform=(q:{x:number;y:number})=>({x:2+q.x*Math.cos(angle)-q.y*Math.sin(angle),y:-4+q.x*Math.sin(angle)+q.y*Math.cos(angle)});
    const p={...original,walls:original.walls.map(w=>({...w,a:transform(w.a),b:transform(w.b)}))};
    const result=dragOpening(p,"window","start",-100,true)!;close(result.offset-result.width/2,3+.1*Math.SQRT2);
    close(result.offset+result.width/2,6.2);
    const reversed=structuredClone(p);[reversed.walls[0].a,reversed.walls[0].b]=[reversed.walls[0].b,reversed.walls[0].a];reversed.openings[0].offset=7;
    const end=dragOpening(reversed,"window","end",100,true)!;close(end.offset+end.width/2,12-3-.1*Math.SQRT2);
    close(end.offset-end.width/2,5.8);
  }
});
test("nearby doors and windows keep their safety gaps when they are closer than the intersecting wall",()=>{
  const p=fixture();p.walls.push({id:"crossing",a:{x:9,y:-3},b:{x:9,y:3},thickness:.4,height:2.8});
  p.openings.push({id:"door",wallId:"wall",kind:"door",offset:8,width:1,height:2.1,sill:0});
  let next=dragOpening(p,"window","end",100,false)!;close(next.offset+next.width/2,7.4);
  p.walls[1].a.x=p.walls[1].b.x=7;
  next=dragOpening(p,"window","end",100,false)!;close(next.offset+next.width/2,6.8);
});
test("whole openings cannot jump across a wall and still move freely inside the resulting slot",()=>{
  const p=fixture();p.walls.push({id:"crossing",a:{x:8,y:-3},b:{x:8,y:3},thickness:.2,height:2.8});
  for(const kind of ["window","door"] as const){
    p.openings=[{...p.openings[0],kind,...(kind==="door"?{sectionWidths:undefined,frameFinish:undefined}: {})}];
    const stopped=dragOpening(p,"window","move",100,false)!;close(stopped.offset+stopped.width/2,7.9);
    close(dragOpening(p,"window","move",.3,false)!.offset,5.3);
    assert(!fitsOpeningSlot(p,p.openings[0],{...p.openings[0],offset:10}));
  }
});
test("typed total and section widths share the physical limits used by edge drags",()=>{
  const p=fixture();p.walls.push({id:"crossing",a:{x:7,y:-3},b:{x:7,y:3},thickness:.2,height:2.8});
  const opening=p.openings[0];
  assert(fitsOpeningSlot(p,opening,resizeWindow(opening,3.8)));
  assert(!fitsOpeningSlot(p,opening,resizeWindow(opening,3.81)));
  assert(!fitsOpeningSlot(p,opening,resizeWindowSection(opening,2,3)));
  assert(fitsOpeningSlot(p,opening,resizeWindowSection(opening,2,.5)));
});
test("older windows overlapping a wall remain importable and may shrink but cannot expand across it",()=>{
  const p=fixture();p.walls.push({id:"legacy-overlap",a:{x:5,y:-3},b:{x:5,y:3},thickness:.2,height:2.8});
  assert.deepEqual(parseProject(JSON.stringify(p)),p);
  const opening=p.openings[0];assert(fitsOpeningSlot(p,opening,opening));
  assert(fitsOpeningSlot(p,opening,resizeWindow(opening,2)));
  assert(!fitsOpeningSlot(p,opening,resizeWindow(opening,3)));
  for(const mode of ["start","end"] as const){
    const delta=mode==="start"?-100:100;
    assert.deepEqual(dragOpening(p,"window",mode,delta,false),opening);
    assert(dragOpening(p,"window",mode,-delta,false)!.width<opening.width);
  }
});
