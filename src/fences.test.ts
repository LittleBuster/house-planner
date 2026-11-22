import assert from "node:assert/strict";
import { test } from "node:test";
import { createFencePanel, createFencePost } from "./fenceGeometry";
import { fencePlacement, inwardFenceFlip, joinFence, moveFence, previewFenceEdit, snapFenceStart } from "./fencePlacement";
import { measureFenceClearances } from "./fenceClearances";
import { FENCE_HEIGHT, FENCE_LENGTH, fenceFootprint, fenceLength, fencePostKey, type Fence } from "./fenceSettings";
import { distance, parseProject, type Project } from "./model";
import { createColliders, movePerson } from "./walkPhysics";

const base: Fence = {id:"first",kind:"mesh",color:"green",a:{x:0,y:0},b:{x:2.5,y:0}};
const project: Project = {version:1,name:"Забор",walls:[],openings:[],fences:[base]};
const near = (a:number,b:number) => assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test("straight fence sections and corners share posts and keep the 2.5 m span",()=>{
  const start=snapFenceStart([base],{x:2.75,y:.15});
  assert.equal(start.point,base.b);
  const second=fencePlacement(start,{x:7,y:1},false,[base])!;
  assert.deepEqual(second.b,{x:5,y:0});
  assert("fences" in previewFenceEdit(project,{...base,...second,id:"second"}));
  const corner=fencePlacement(start,{x:2.5,y:3},true,[base])!;
  near(corner.b.x,2.5);near(corner.b.y,2.5);
  const fences=[base,{...second,id:"second",kind:"picket",color:"ral7024"} as const];
  const keys=new Set(fences.flatMap(fence=>[fencePostKey(fence.a),fencePostKey(fence.b)]));
  assert.equal(keys.size,3);
  near(distance(second.a,second.b),FENCE_LENGTH);
  assert("error" in previewFenceEdit(project,{...base,id:"duplicate"}));
  assert.deepEqual(parseProject(JSON.stringify({...project,fences})),{...project,fences});
  assert.throws(()=>parseProject(JSON.stringify({...project,fences:[{...base,b:{x:3,y:0}}]})));
});

test("dragging a fence post onto a panel splits the panel around one shared post",()=>{
  const incoming:Fence={...base,id:"picket",kind:"picket",color:"ral7024",a:{x:1.2,y:-2.68},b:{x:1.2,y:-.18}};
  const before={...project,fences:[{...base,flipped:true},incoming]};
  const {fence,edit}=moveFence(before,incoming,{x:.05,y:.1});
  assert("fences" in edit);
  assert.deepEqual(fence.b,{x:1.25,y:0});
  const result=joinFence(before,fence,()=>"tail");
  assert("fences" in result);
  const [first,tail,moved]=result.fences;
  assert.equal(first.id,base.id);
  assert.equal(tail.id,"tail");
  assert.equal(moved.id,incoming.id);
  assert.equal(first.flipped,true);
  assert.equal(tail.flipped,true);
  near(fenceLength(first),1.25);
  near(fenceLength(tail),1.25);
  near(fenceLength(moved),2.5);
  assert.deepEqual(first.b,tail.a);
  assert.deepEqual(tail.a,moved.b);
  const posts=new Set(result.fences.flatMap(item=>[fencePostKey(item.a),fencePostKey(item.b)]));
  assert.equal(posts.size,4);
  const remaining={...project,fences:result.fences.filter(item=>item.id!==tail.id)};
  assert.deepEqual(parseProject(JSON.stringify(remaining)),remaining);
});

test("a crossing splits both fences and a new branch can start inside a section",()=>{
  const crossing:Fence={...base,id:"crossing",a:{x:1,y:-1},b:{x:1,y:1.5}};
  const result=previewFenceEdit(project,crossing);
  assert("fences" in result);
  assert.equal(result.fences.length,4);
  assert.equal(result.end.b,crossing.b);
  assert.deepEqual(result.joints,[{x:1,y:0}]);
  assert.equal(result.fences.filter(item=>[item.a,item.b].some(p=>fencePostKey(p)==="1000000:0")).length,4);
  const start=snapFenceStart([base],{x:1.2,y:.17});
  const span=fencePlacement(start,{x:1.2,y:2.5},false,[base])!;
  const branch=previewFenceEdit(project,{...base,...span,id:"branch"});
  assert("fences" in branch);
  assert.equal(branch.fences.length,3);
  near(fenceLength(branch.end),2.5);
});

test("flipping a section puts the rails or mesh ribs on the requested side",()=>{
  const house={...project,walls:[{id:"wall",a:{x:0,y:3},b:{x:4,y:3},thickness:.2,height:2.8}]};
  assert.equal(inwardFenceFlip(house,base),false);
  assert.equal(inwardFenceFlip(house,{...base,kind:"picket"}),true);
  assert.equal(inwardFenceFlip(house,{...base,a:base.b,b:base.a}),true);
  assert(fenceFootprint(base).center.y>0);
  assert(fenceFootprint({...base,flipped:true}).center.y<0);
});

test("clearances start at the nearest point of the fence face and ignore the attached run and ground covers",()=>{
  const scenery:Project={...project,
    walls:[{id:"wall",a:{x:-1,y:2},b:{x:4,y:2},thickness:.2,height:2.8}],
    plants:[{id:"tree",kind:"birch",position:{x:.3,y:-2},height:8,seed:8,rotation:0}],
    lawn:[{id:"soil",position:{x:1,y:1},size:2,material:"soil"}],
    fences:[base,{...base,id:"attached",a:base.b,b:{x:5,y:0}}],
  };
  const [start,end,left,right]=measureFenceClearances(scenery,base);
  assert.equal(start.distance,null);assert.equal(end.distance,null);
  near(left.start.x,.3);
  assert(left.distance!==null && left.distance<2 && left.distance>0);
  near(right.distance!,1.845);
  near(right.end.y,1.9);
});

test("both fence models fit the section and fences block walking on visible landscape",()=>{
  for (const geometry of [createFencePost(),createFencePanel("mesh"),createFencePanel("picket")]) {
    geometry.computeBoundingBox();
    assert(geometry.boundingBox!.max.y>FENCE_HEIGHT-.006);
    assert(geometry.boundingBox!.max.y<FENCE_HEIGHT+.001);
    assert(geometry.boundingBox!.max.x<FENCE_LENGTH+.001);
    geometry.dispose();
  }
  for (const geometry of [createFencePanel("mesh",.12),createFencePanel("picket",.12)]) {
    geometry.computeBoundingBox();
    assert(geometry.boundingBox!.min.x>0 && geometry.boundingBox!.max.x<.12);
    geometry.dispose();
  }
  const start={x:1,y:-1}, delta={x:0,y:2};
  assert(movePerson(start,delta,createColliders(project)).y<-.2);
  const hidden={...project,display:{house:true,roof:true,landscape:false}};
  near(movePerson(start,delta,createColliders(hidden)).y,1);
});
