import assert from "node:assert/strict";
import { test } from "node:test";
import { type Fence, fenceLength } from "./fenceSettings";
import { fenceBlocksGate, gatePlacementError, measureGateEnds, positionGate, replacesFencePost, slideGate, visibleFencePieces } from "./gatePlacement";
import { GATE_LEAVES, GATE_POST, gateLeafIndices, gateLeafKey, gateLeafPose, gateTarget, gateWidth, type Gate } from "./gateSettings";
import { joinFence } from "./fencePlacement";
import { type Project, parseProject } from "./model";
import { createColliders, isWalkable, movePerson } from "./walkPhysics";

const first:Fence={id:"left",kind:"mesh",color:"green",a:{x:0,y:0},b:{x:2.5,y:0}};
const second:Fence={...first,id:"right",a:{x:5,y:0},b:first.b};
const site:Project={version:1,name:"Ворота",walls:[],openings:[],fences:[first,second]};
const style={id:"gate",kind:first.kind,color:first.color,swing:"in"} as const;
const near=(actual:number,expected:number)=>assert(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
function gateAtCenter(width:number):Gate {
  const {gate}=positionGate(site,first,{x:2.5,y:0},width,style);
  assert(gate);
  return gate;
}

test("a gate spans a straight run, trims only its opening and restores the fence when removed",()=>{
  const gate=gateAtCenter(3.5);
  const project={...site,gates:[gate]};
  near(gateWidth(gate),3.5);
  near(fenceLength(gate),3.5+GATE_POST);
  const [left,right]=visibleFencePieces(project);
  assert.deepEqual(left.b,gate.a);
  assert.deepEqual(right.b,gate.b);
  assert(replacesFencePost(project,left.b) && replacesFencePost(project,right.b));
  const {gate:resized}=positionGate(project,gate,{x:2.5,y:0},4,gate);
  assert(resized);
  near(gateWidth(resized),4);
  near((resized.a.x+resized.b.x)/2,2.5);
  const updated={...project,gates:[{...resized,swing:"out" as const,open:true}]};
  assert.deepEqual(parseProject(JSON.stringify(updated)),updated);
  assert.deepEqual(visibleFencePieces({...updated,gates:[]}),site.fences);
  assert.throws(()=>parseProject(JSON.stringify({...updated,fences:[]})));
});

test("gates need continuous matching fence and keep other branches outside the opening",()=>{
  assert(positionGate({...site,fences:[]},first,{x:2.5,y:0},3,style).error);
  assert(positionGate({...site,fences:[first,{...second,kind:"picket"}]},first,{x:2.5,y:0},3,style).error);
  assert(positionGate({...site,fences:[first,{...second,b:{x:2.55,y:0}}]},first,{x:2.5,y:0},3,style).error);
  const {gate:single}=positionGate({...site,fences:[first]},first,{x:1.25,y:0},2.3,style);
  assert(single);
  near(gateWidth(single),2.3);
  const gate=gateAtCenter(3);
  const branch:Fence={...first,id:"branch",a:{x:2.5,y:0},b:{x:2.5,y:2.5}};
  assert(gatePlacementError({...site,fences:[first,second,branch]},gate));
  const project={...site,gates:[gate]};
  assert(fenceBlocksGate(project,branch));
  assert("error" in joinFence(project,{...first,a:{x:0,y:1},b:{x:2.5,y:1}},()=>"split"));
  assert(gatePlacementError(project,{...gate,id:"another"}));
});

test("paired leaves follow the chosen direction and their current pose controls passage",()=>{
  const gate=gateAtCenter(3.5);
  const project={...site,gates:[gate]};
  const start={x:2.5,y:-1}, delta={x:0,y:2};
  assert(movePerson(start,delta,createColliders(project)).y<-.2);

  const opened={...gate,open:true};
  const openProject={...project,gates:[opened]};
  near(gateTarget(openProject,opened),Math.PI/2);
  near(gateTarget(openProject,{...opened,swing:"out"}),-Math.PI/2);
  near(movePerson(start,delta,createColliders(openProject)).y,1);

  for (const index of GATE_LEAVES) {
    const {hinge,direction}=gateLeafPose(opened,index,gateTarget(openProject,opened));
    near(direction.y,1);
    assert(!isWalkable({x:hinge.x,y:hinge.y+.8},createColliders(openProject)));
  }
  const angles=new Map(GATE_LEAVES.map(index=>[gateLeafKey(opened.id,index),0]));
  assert(movePerson(start,delta,createColliders(openProject,.025,0,undefined,undefined,angles)).y<-.2);
});

test("sliding measures both ends of the straight fence and stops at the limit without changing width",()=>{
  const gate=gateAtCenter(3.5);
  const tail:Fence={...first,id:"mixed",kind:"picket",a:second.a,b:{x:7.5,y:0}};
  const project={...site,fences:[first,second,tail],gates:[gate]};
  const [start,end]=measureGateEnds(project,gate);
  near(start.distance!,.69);
  near(end.distance!,3.19);
  const moved=slideGate(project,gate,15);
  near(moved.b.x,5);
  near(gateWidth(moved),3.5);
  near(measureGateEnds(project,moved)[1].distance!,2.5);
  near(slideGate(project,gate,-15).a.x,0);
});

test("a long drag cannot jump past a branch or another opening",()=>{
  const fences=[first,second,...[5,7.5].map(x=>({...first,id:"f"+x,a:{x,y:0},b:{x:x+2.5,y:0}}))];
  const gate=gateAtCenter(2);
  const branch={...first,id:"branch",a:{x:4,y:0},b:{x:4,y:2.5}};
  near(slideGate({...site,fences:[...fences,branch]},gate,8).b.x,4);
  const wicket:Gate={...gate,id:"wicket",wicket:true,a:{x:6,y:0},b:{x:7.12,y:0}};
  const project={...site,fences,gates:[gate,wicket]};
  const moved=slideGate(project,gate,8);
  assert(moved.b.x<=6-GATE_POST && moved.b.x>6-GATE_POST-1e-5);
  assert.equal(gatePlacementError(project,moved),null);
});

test("a wicket saves with one hinged leaf, inherits the fence type and releases passage when open",()=>{
  const fences=site.fences!.map(fence=>({...fence,kind:"picket" as const,color:"ral7024" as const}));
  const project={...site,fences};
  const {gate}=positionGate(project,fences[0],{x:1.25,y:0},1,{...style,kind:"picket",color:"ral7024",wicket:true});
  assert(gate);
  assert.deepEqual(gateLeafIndices(gate),[0]);
  near(gateWidth(gate),1);
  const from={x:1.25,y:1},delta={x:0,y:-2};
  assert(movePerson(from,delta,createColliders({...project,gates:[gate]})).y>.2);
  const open={...project,gates:[{...gate,open:true}]};
  near(movePerson(from,delta,createColliders(open)).y,-1);
  assert.deepEqual(parseProject(JSON.stringify(open)),open);
});

test("mirroring moves a wicket hinge and collider to the other post without reversing the swing side",()=>{
  const {gate}=positionGate(site,first,{x:2.5,y:0},1,{...style,wicket:true,open:true,swing:"out"});
  assert(gate);
  const mirrored={...gate,mirrored:true};
  const angle=gateTarget(site,gate);
  near(gateTarget(site,mirrored),angle);
  const original=gateLeafPose(gate,0,angle), reversed=gateLeafPose(mirrored,0,angle);
  near(original.hinge.x+reversed.hinge.x,gate.a.x+gate.b.x);
  near(original.direction.y,reversed.direction.y);
  const point={x:original.hinge.x,y:-.5};
  assert(!isWalkable(point,createColliders({...site,gates:[gate]})));
  const project={...site,gates:[mirrored]};
  assert(isWalkable(point,createColliders(project)));
  assert(!isWalkable({...point,x:reversed.hinge.x},createColliders(project)));
  assert.deepEqual(parseProject(JSON.stringify(project)),project);
  assert.throws(()=>parseProject(JSON.stringify({...project,gates:[{...mirrored,mirrored:"yes"}]})));
});

test("mirroring a double gate swaps the leaf roles while keeping both physical hinges",()=>{
  const gate=gateAtCenter(3.5), mirrored={...gate,mirrored:true};
  for (const angle of [0,.6,Math.PI/2]) {
    assert.deepEqual(gateLeafPose(mirrored,0,angle),gateLeafPose(gate,1,angle));
    assert.deepEqual(gateLeafPose(mirrored,1,angle),gateLeafPose(gate,0,angle));
  }
});
