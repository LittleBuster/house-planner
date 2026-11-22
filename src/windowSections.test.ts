import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { canPlaceOpening, demoProject, parseProject, type Opening } from "./model";
import { createColliders, isWalkable, jumpHeadroom } from "./walkPhysics";
import { createWindowSections } from "./windowGeometry";
import { resizeWindow, resizeWindowSection, setWindowSectionCount, setWindowVent, mirrorWindowVent, validWindowSections, windowDividers, windowSectionWidths } from "./windowSections";
import { projectWindowVents, windowInteriorSide, windowVentCollider, windowVentLocalAngle, windowVentPose, windowVentTarget } from "./windowVentPhysics";

const window = (): Opening => ({id:"window",kind:"window",wallId:"w1",offset:3,width:2.4,height:1.4,sill:.9});
const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("legacy windows stay two-section windows without rewriting old project data", () => {
  const p = demoProject(), restored = parseProject(JSON.stringify(p));
  assert.deepEqual(restored, p);
  for (const opening of restored.openings.filter(o => o.kind === "window")) {
    assert.deepEqual(windowSectionWidths(opening), [opening.width / 2, opening.width / 2]);
    assert.equal(opening.sectionWidths, undefined);
  }
});
test("one, two and three sections retain the total width, including millimetre rounding", () => {
  for (const count of [1,2,3] as const) {
    const next = setWindowSectionCount({...window(),width:2.2},count);
    assert.equal(next.sectionWidths!.length, count);
    close(next.sectionWidths!.reduce((a,b)=>a+b,0), 2.2);
    assert(validWindowSections(next));
  }
  assert.deepEqual(setWindowSectionCount({...window(),width:2.2},3).sectionWidths,[.733,.733,.734]);
});
test("overall width scales unequal sections while editing one section preserves the others", () => {
  const original = {...window(), sectionWidths:[.6,.8,1]};
  const scaled = resizeWindow(original,3);
  assert.deepEqual(scaled.sectionWidths,[.75,1,1.25]);
  const edited = resizeWindowSection(original,1,.9);
  assert.deepEqual(edited.sectionWidths,[.6,.9,1]);close(edited.width,2.5);
  assert.deepEqual(original.sectionWidths,[.6,.8,1]);close(original.width,2.4);
});
test("shrinking keeps every section at least 10 cm and the sum matches the total", () => {
  const narrow = {...window(),width:3,sectionWidths:[.1,.1,2.8]};
  assert.deepEqual(resizeWindow(narrow,.3).sectionWidths,[.1,.1,.1]);
  assert.deepEqual(resizeWindow(narrow,.6).sectionWidths,[.1,.1,.4]);
  for(const count of [1,2,3] as const) for(let i=0;i<100;i++) {
    const sectionWidths=Array.from({length:count},(_,j)=>.1+((i*13+j*37)%90)/30);
    const original={...window(),width:sectionWidths.reduce((a,b)=>a+b,0),sectionWidths};
    const width=.3+9.7*i/99,next=resizeWindow(original,width);
    assert(validWindowSections(next));close(next.sectionWidths!.reduce((a,b)=>a+b,0),width);
  }
});
test("custom section sizes round-trip with projects and malformed section data is rejected", () => {
  const p=demoProject();p.openings[0]={...p.openings[0],sectionWidths:[.5,.7,1]};
  assert.deepEqual(parseProject(JSON.stringify(p)),p);
  for(const bad of [[],[1,1,1,1],[.5,.5],[-.1,2.3],[0,2.2],["1.1",1.1],[.5,null,1.7],"three",null]) {
    const broken=structuredClone(p);(broken.openings[0] as any).sectionWidths=bad;
    assert.throws(()=>parseProject(JSON.stringify(broken)));
  }
  const door=p.openings.find(o=>o.kind==="door")!;door.sectionWidths=[door.width];
  assert.throws(()=>parseProject(JSON.stringify(p)));
});
test("section changes cannot extend beyond a wall end or overlap another opening", () => {
  const p=demoProject(), o=p.openings[0];
  const next=resizeWindowSection(setWindowSectionCount(o,2),0,7);
  assert.equal(canPlaceOpening(p,next,o.id),false);
  assert.equal(p.openings[0].width,2.2);
});
test("3D panes and mullions match the selected count and custom widths in metres", () => {
  const frame = new THREE.MeshBasicMaterial(), glass = new THREE.MeshBasicMaterial();
  for(const count of [1,2,3] as const) {
    const o=count===3?{...window(),sectionWidths:[.6,.8,1]}:setWindowSectionCount(window(),count);
    const group=createWindowSections(o,.245,frame,glass);
    const panes=group.children.filter(c=>c.name==="window-pane") as THREE.Mesh<THREE.BoxGeometry>[];
    const mullions=group.children.filter(c=>c.name==="window-mullion") as THREE.Mesh<THREE.BoxGeometry>[];
    assert.equal(panes.length,count);assert.equal(mullions.length,count-1);
    close(group.position.x,1.8);close(group.position.y,.9);
    if(count===3) {
      close(mullions[0].position.x,.6);close(mullions[1].position.x,1.4);
      close(panes[0].geometry.parameters.width,.5325);
      close(panes[1].geometry.parameters.width,.755);
      close(panes[2].geometry.parameters.width,.9325);
    }
    for(const pane of panes) {
      const half=pane.geometry.parameters.width/2;
      assert(pane.position.x-half>=.045-1e-6);
      assert(pane.position.x+half<=o.width-.045+1e-6);
      close(pane.geometry.parameters.height,o.height-.09);
    }
    group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
  }
  frame.dispose();glass.dispose();
});
test("divider ordering follows a rotated wall and windows still block walking", () => {
  const p=demoProject(), o={...p.openings[0],sectionWidths:[.5,.7,1]};
  assert.deepEqual(windowDividers(o),[.5,1.2]);
  const frame=new THREE.MeshBasicMaterial(),glass=new THREE.MeshBasicMaterial();
  const infill=createWindowSections(o,.245,frame,glass), wall=new THREE.Group();
  wall.position.set(2,0,5);wall.rotation.y=-Math.PI/4;wall.add(infill);wall.updateMatrixWorld(true);
  const first=infill.children.find(c=>c.name==="window-mullion")!;
  const position=first.getWorldPosition(new THREE.Vector3()),along=o.offset-o.width/2+.5;
  close(position.x,2+along/Math.sqrt(2));close(position.z,5+along/Math.sqrt(2));
  assert.deepEqual(createColliders({...p,openings:p.openings.map(w=>w.id===o.id?o:w)}),createColliders(p));
  infill.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});frame.dispose();glass.dispose();
});
test("each window section can save a separate vent state and retain it on resize",()=>{
  const p=demoProject();
  let o=setWindowSectionCount(p.openings[0],3);
  o=setWindowVent(setWindowVent(o,0,"open"),2,"closed");
  p.openings[0]=o;
  assert.deepEqual(parseProject(JSON.stringify(p)),p);
  assert.deepEqual(resizeWindow(o,3.2).ventSections,["open",null,"closed"]);
  assert.deepEqual(setWindowSectionCount(o,2).ventSections,["open",null]);
  assert.equal(setWindowVent(setWindowSectionCount(o,1),0,null).ventSections,undefined);
  for(const bad of [["open"],["open",null,true],["fixed",null,"open"],null]){
    assert.throws(()=>parseProject(JSON.stringify({...p,openings:[{...o,ventSections:bad}]})));
  }
  const door=p.openings.find(o=>o.kind==="door")!;
  assert.throws(()=>parseProject(JSON.stringify({...p,openings:[{...door,ventSections:["closed",null]}]})));
});
test("window vents swing towards the room on reversed walls and the rendered leaf matches its collision pose",()=>{
  const p=demoProject(),o=setWindowVent(window(),1,"open");
  const walls=p.walls.slice(0,4);
  const material=new THREE.MeshBasicMaterial();
  for(const reverse of [false,true]){
    const wall=reverse?{...walls[0],a:walls[0].b,b:walls[0].a}:walls[0];
    const q={...p,walls:[wall,...walls.slice(1)],openings:[o]},vent=projectWindowVents(q)[0];
    assert.equal(windowInteriorSide(q.walls,wall,o.offset),reverse?-1:1);
    const model=createWindowSections(o,wall.thickness+.025,material,material,[vent]);
    const local=new THREE.Group();
    local.position.set(wall.a.x,0,wall.a.y);
    local.rotation.y=-Math.atan2(wall.b.y-wall.a.y,wall.b.x-wall.a.x);
    local.add(model);
    const leaf=model.getObjectByName(`window-vent-${vent.id}`)!;
    const pose=windowVentPose(vent),tip=leaf.localToWorld(new THREE.Vector3(vent.length,0,0));
    close(tip.x,pose.hinge.x+pose.direction.x*pose.length);
    close(tip.z,pose.hinge.y+pose.direction.y*pose.length);
    assert(tip.z>0);
    const collider=windowVentCollider(vent);
    assert(!isWalkable(collider.center,[collider]));
    assert(createColliders(q).some(c=>"ventId" in c&&c.ventId===vent.id));
    assert(!createColliders(q,.025,0,undefined,new Map([[vent.id,0]])).some(c=>"ventId" in c));
    assert(!isWalkable({x:5,y:0},createColliders(q)));
    local.traverse(child=>{if(child instanceof THREE.Mesh)child.geometry.dispose();});
  }
  material.dispose();
});
test("a vent above the standing body becomes a head obstacle during a jump",()=>{
  const p=demoProject(),o=setWindowVent({...window(),sill:1.9,height:.65},0,"open");
  const q={...p,openings:[o]},vent=projectWindowVents(q)[0];
  const angle=windowVentTarget(vent),point=windowVentCollider(vent,angle).center;
  assert(!createColliders(q).some(c=>"ventId" in c));
  assert(createColliders(q,.025,.75).some(c=>"ventId" in c));
  close(jumpHeadroom(q,point),.35+vent.bottom-1.75-.01);
});
test("mirroring a vent preserves its opening state and moves its pivot, handle and collision to the opposite edge",()=>{
  const p=demoProject(),o=setWindowVent(setWindowVent(window(),0,"open"),1,"closed");
  const mirrored=mirrorWindowVent(o,0);
  assert.deepEqual(mirrored.mirroredVents,[0]);
  assert.deepEqual(mirrored.ventSections,o.ventSections);
  assert.equal(mirrorWindowVent(mirrored,0).mirroredVents,undefined);
  assert.equal(setWindowVent(mirrored,0,null).mirroredVents,undefined);
  assert.equal(setWindowSectionCount(mirrorWindowVent(o,1),1).mirroredVents,undefined);
  const q={...p,openings:[mirrored]};
  assert.deepEqual(parseProject(JSON.stringify(q)),q);
  for(const bad of [[2],[0,0],[.5],[-1],null]){
    assert.throws(()=>parseProject(JSON.stringify({...q,openings:[{...mirrored,mirroredVents:bad}]})));
  }
  const material=new THREE.MeshBasicMaterial();
  for(const reverse of [false,true]){
    const walls=p.walls.slice(0,4),wall=reverse?{...walls[0],a:walls[0].b,b:walls[0].a}:walls[0];
    const base={...p,walls:[wall,...walls.slice(1)],openings:[o]};
    const standard=projectWindowVents(base)[0],vents=projectWindowVents({...base,openings:[mirrored]}),vent=vents[0];
    close(vent.x-standard.x,vent.length);
    close(windowVentTarget(vent),windowVentTarget(standard));
    assert.equal(vents[1].mirrored,false);
    const group=createWindowSections(mirrored,wall.thickness+.025,material,material,vents);
    const parent=new THREE.Group();
    parent.position.set(wall.a.x,0,wall.a.y);
    parent.rotation.y=-Math.atan2(wall.b.y-wall.a.y,wall.b.x-wall.a.x);
    parent.add(group);
    const leaf=group.getObjectByName(`window-vent-${vent.id}`)!;
    const target=windowVentTarget(vent);
    for(const angle of [0,target/2,target]){
      leaf.rotation.y=-windowVentLocalAngle(vent,angle);
      const center=leaf.localToWorld(new THREE.Vector3(vent.length/2,vent.height/2,0));
      const collider=windowVentCollider(vent,angle);
      close(center.x,collider.center.x);close(center.z,collider.center.y);
      if(angle===target)assert(center.z>wall.thickness/2);
      if(angle===0){
        const aperture=group.children.find(c=>c.userData.ventAperture===leaf.name)!;
        close(center.x,aperture.getWorldPosition(new THREE.Vector3()).x);
        const handle=leaf.getObjectByName("vent-handle")!;
        assert(handle.getWorldPosition(new THREE.Vector3()).z>center.z);
      }
    }
    parent.traverse(child=>{if(child instanceof THREE.Mesh)child.geometry.dispose();});
  }
  material.dispose();
});
