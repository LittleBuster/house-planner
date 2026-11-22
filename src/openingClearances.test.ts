import { test } from "node:test";
import assert from "node:assert/strict";
import { type Project, type Wall } from "./model";
import { measureOpeningClearances } from "./openingClearances";
import { dragOpening, dragWindowDivider } from "./openingDrag";

const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const wall=(id:string,ax:number,ay:number,bx:number,by:number,thickness=.2):Wall=>({id,a:{x:ax,y:ay},b:{x:bx,y:by},thickness,height:2.8});
const fixture=():Project=>({version:1,name:"Отступы окна",walls:[wall("host",0,0,12,0)],openings:[{id:"window",wallId:"host",kind:"window",offset:5,width:2,height:1.4,sill:.9}]});
const measure=(p:Project)=>measureOpeningClearances(p,p.openings[0]);
test("a selected window measures from both outer edges to the ends of its own wall",()=>{
  const p=fixture(),m=measure(p);
  assert.equal(m.length,2);assert.deepEqual(m.map(v=>v.side),["start","end"]);
  close(m[0].from,4);close(m[0].to,0);close(m[0].distance,4);
  close(m[1].from,6);close(m[1].to,12);close(m[1].distance,6);
  assert(m.every(v=>v.kind==="wall-end"&&v.obstacleId==="host"&&!v.overlap));
});
test("nearest windows and doors on the same wall use actual opening edges without safety margins",()=>{
  const p=fixture();p.openings.push({id:"left-window",wallId:"host",kind:"window",offset:2,width:1,height:1.4,sill:.9},{id:"right-door",wallId:"host",kind:"door",offset:9,width:1,height:2.1,sill:0});
  const m=measure(p);close(m[0].distance,1.5);close(m[1].distance,2.5);
  assert.equal(m[0].kind,"window");assert.equal(m[0].obstacleId,"left-window");assert.equal(m[1].kind,"door");assert.equal(m[1].obstacleId,"right-door");
  p.walls.push(wall("elsewhere",20,0,20,10));p.openings.push({id:"unrelated",wallId:"elsewhere",kind:"window",offset:5,width:1,height:1.4,sill:.9});assert.deepEqual(measure(p),m);
});
test("T-junctions and crossing walls are measured to their nearest faces and compete with other openings",()=>{
  const p=fixture();p.walls.push(wall("left-junction",3,0,3,5),wall("right-crossing",8,-3,8,3));
  p.openings.push({id:"far-left",wallId:"host",kind:"window",offset:2,width:1,height:1.4,sill:.9},{id:"far-right",wallId:"host",kind:"door",offset:10,width:1,height:2.1,sill:0});
  let m=measure(p);close(m[0].distance,.9);close(m[1].distance,1.9);close(m[0].to,3.1);close(m[1].to,7.9);
  assert.equal(m[0].obstacleId,"left-junction");assert.equal(m[1].obstacleId,"right-crossing");
  p.openings.push({id:"closer-window",wallId:"host",kind:"window",offset:3.6,width:.4,height:1.4,sill:.9});m=measure(p);close(m[0].distance,.2);assert.equal(m[0].obstacleId,"closer-window");
});
test("corners use wall thickness while off-axis walls and collinear continuations do not create false junctions",()=>{
  const p=fixture();p.walls.push(wall("corner-a",0,0,0,5,.4),wall("corner-b",12,-5,12,0,.4));
  const m=measure(p);close(m[0].distance,3.8);close(m[1].distance,5.8);
  const q=fixture();q.walls.push(wall("off-axis",3,2,3,6),wall("parallel",0,1,12,1),wall("continuation",12,0,18,0));assert.deepEqual(measure(q),measure(fixture()));
  q.walls.push(wall("short-gap",3,.05,3,4));close(measure(q)[0].distance,.9);
});
test("oblique intersections and rotated or reversed host walls retain accurate metre distances",()=>{
  const p=fixture();p.walls.push(wall("oblique",1,-2,5,2));
  const expected=1-.1*Math.SQRT2;
  close(measure(p)[0].distance,expected);
  for(const angle of [Math.PI/2,Math.PI,Math.PI*.75,-Math.PI/2]){
    const transform=(v:{x:number;y:number})=>({x:4+v.x*Math.cos(angle)-v.y*Math.sin(angle),y:-7+v.x*Math.sin(angle)+v.y*Math.cos(angle)});
    const rotated={...p,walls:p.walls.map(w=>({...w,a:transform(w.a),b:transform(w.b)}))};const m=measure(rotated);close(m[0].distance,expected);close(m[1].distance,6);
  }
  const reversed=structuredClone(p);[reversed.walls[0].a,reversed.walls[0].b]=[reversed.walls[0].b,reversed.walls[0].a];reversed.openings[0].offset=7;
  const r=measure(reversed);close(r[0].distance,6);close(r[1].distance,expected);
});
test("an intersecting wall inside the window is shown as overlap with zero rather than a negative clearance",()=>{
  const p=fixture();p.walls.push(wall("overlap",5,-2,5,3));
  const before=structuredClone(p),m=measure(p);assert(m.every(v=>v.overlap&&v.distance===0&&v.from===v.to&&v.obstacleId==="overlap"));assert.deepEqual(p,before);
});
test("clearances update with whole-window and edge drags, and stay fixed when only sections change",()=>{
  const p=fixture();p.walls.push(wall("before",3,-2,3,2),wall("after",8,-2,8,2));
  const moved=measureOpeningClearances(p,dragOpening(p,"window","move",.5,false)!);close(moved[0].distance,1.4);close(moved[1].distance,1.4);
  const resized=measureOpeningClearances(p,dragOpening(p,"window","end",.5,false)!);close(resized[0].distance,.9);close(resized[1].distance,1.4);
  assert.deepEqual(measureOpeningClearances(p,dragWindowDivider(p,"window",0,.3,false)!),measure(p));
});
test("small valid end gaps are preserved exactly and an opening without its wall has no dimensions",()=>{
  const p=fixture();p.openings[0].offset=1.12;const m=measure(p);close(m[0].distance,.12);close(m[1].distance,9.88);
  assert.deepEqual(measureOpeningClearances(p,{...p.openings[0],wallId:"missing"}),[]);
});
test("door clearances measure from its jambs to the nearest window, door or wall end",()=>{
  const p=fixture(),door={id:"entry",kind:"door" as const,wallId:"host",offset:8,width:1,height:2.1,sill:0};
  p.openings.push(door);
  let [left,right]=measureOpeningClearances(p,door);
  assert.equal(left.kind,"window");close(left.distance,1.5);
  assert.equal(right.kind,"wall-end");close(right.distance,3.5);
  p.openings.push({...door,id:"next-door",offset:10.5});
  [left,right]=measureOpeningClearances(p,door);
  assert.equal(right.obstacleId,"next-door");assert.equal(right.kind,"door");close(right.distance,1.5);
  const moved=dragOpening(p,door.id,"move",.4,false)!;
  [left,right]=measureOpeningClearances(p,moved);
  close(left.distance,1.9);close(right.distance,1.1);
});
