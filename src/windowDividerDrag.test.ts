import { test } from "node:test";
import assert from "node:assert/strict";
import { canPlaceOpening, parseProject, type Project } from "./model";
import { dragWindowDivider } from "./openingDrag";
import { windowSectionWidths } from "./windowSections";
import { readablePlanAngle } from "./planLabels";

const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const fixture=():Project=>({version:1,name:"Секции",walls:[{id:"wall",a:{x:0,y:0},b:{x:12,y:0},thickness:.2,height:2.8}],openings:[{id:"window",kind:"window",wallId:"wall",offset:4,width:2.4,height:1.4,sill:.9,sectionWidths:[.6,.8,1],frameFinish:"wood"}]});
test("moving an internal divider redistributes adjacent sections and keeps the entire opening fixed",()=>{
  const p=fixture(),next=dragWindowDivider(p,"window",0,.2,false)!;
  assert.deepEqual(next.sectionWidths,[.8,.6,1]);assert.equal(next.offset,4);assert.equal(next.width,2.4);
  assert.equal(next.height,1.4);assert.equal(next.sill,.9);assert.equal(next.wallId,"wall");assert.equal(next.frameFinish,"wood");
  assert.deepEqual(p,fixture());assert(canPlaceOpening(p,next,"window"));
  const second=dragWindowDivider(p,"window",1,-.3,false)!;assert.deepEqual(second.sectionWidths,[.6,.5,1.3]);
});
test("dividers stop at 10 cm for either adjacent section and never cross each other",()=>{
  const p=fixture();
  assert.deepEqual(dragWindowDivider(p,"window",0,-100,false)!.sectionWidths,[.1,1.3,1]);
  assert.deepEqual(dragWindowDivider(p,"window",0,100,false)!.sectionWidths,[1.3,.1,1]);
  assert.deepEqual(dragWindowDivider(p,"window",1,-100,false)!.sectionWidths,[.6,.1,1.7]);
  assert.deepEqual(dragWindowDivider(p,"window",1,100,false)!.sectionWidths,[.6,1.7,.1]);
  p.openings[0]={...p.openings[0],width:.3,sectionWidths:[.1,.1,.1]};
  for(const index of [0,1])for(const delta of [-10,10])assert.deepEqual(dragWindowDivider(p,"window",index,delta,true)!.sectionWidths,[.1,.1,.1]);
});
test("legacy two-section windows acquire explicit widths when their middle divider is moved",()=>{
  const p=fixture();delete p.openings[0].sectionWidths;
  const next=dragWindowDivider(p,"window",0,.4,false)!;assert.deepEqual(next.sectionWidths,[1.6,.8]);
  assert.deepEqual(windowSectionWidths(p.openings[0]),[1.2,1.2]);assert.equal(next.width,2.4);
});
test("divider snapping sets a centimetre section width even with an off-grid window edge",()=>{
  const p=fixture();p.openings[0].offset=4.05;
  const next=dragWindowDivider(p,"window",0,.17,true)!;
  close(next.offset-next.width/2+next.sectionWidths![0],3.62);
  assert.deepEqual(next.sectionWidths,[.77,.63,1]);
  const precise=dragWindowDivider(p,"window",0,.173456789,false)!;close(precise.sectionWidths![0],.773456789);
});
test("arbitrary divider positions remain importable without changing window bounds or other sections",()=>{
  const p=fixture();
  for(const index of [0,1])for(let i=0;i<200;i++){
    const next=dragWindowDivider(p,"window",index,(i-100)*.037,i%2===0)!;
    const original=p.openings[0];assert.equal(next.offset,original.offset);assert.equal(next.width,original.width);
    close(next.sectionWidths!.reduce((a,b)=>a+b,0),next.width);
    assert.equal(next.sectionWidths![index===0?2:0],original.sectionWidths![index===0?2:0]);
    const result={...p,openings:[next]};assert.deepEqual(parseProject(JSON.stringify(result)),result);
  }
});
test("single-section windows, doors and invalid divider requests do not create a gesture result",()=>{
  const p=fixture();
  for(const index of [-1,2,1.5])assert.equal(dragWindowDivider(p,"window",index,.2,false),null);
  assert.equal(dragWindowDivider(p,"window",0,NaN,false),null);assert.equal(dragWindowDivider(p,"missing",0,.2,false),null);
  p.openings[0].sectionWidths=[2.4];assert.equal(dragWindowDivider(p,"window",0,.2,false),null);
  p.openings[0]={id:"door",kind:"door",wallId:"wall",offset:4,width:1,height:2.1,sill:0};assert.equal(dragWindowDivider(p,"door",0,.2,false),null);
});
test("dimension angles are readable on reversed, lower, vertical and diagonal walls",()=>{
  for(let degrees=-720;degrees<=720;degrees+=.5){
    const readable=readablePlanAngle(degrees);assert(readable>=-90&&readable<=90);
    close(Math.sin((readable-degrees)*Math.PI/180),0);
    assert(Math.cos(readable*Math.PI/180)>=-1e-10);
  }
  assert.equal(readablePlanAngle(180),0);assert.equal(readablePlanAngle(-180),0);
  assert.equal(readablePlanAngle(135),-45);assert.equal(readablePlanAngle(-135),45);
  assert.equal(readablePlanAngle(90),90);assert.equal(readablePlanAngle(-90),-90);
});
