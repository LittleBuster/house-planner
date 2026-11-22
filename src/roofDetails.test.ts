import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {demoProject,parseProject,type Project} from "./model";
import {DEFAULT_ROOF} from "./roofSettings";
import {roofDetailsPlan,pipeClearsOpenings} from "./roofDetailsPlan";
import {roofData,roofBottomAt,pointInRoofContour,ROOF_THICKNESS} from "./roofModel";
import {buildRoof} from "./roofGeometry";
import {createWindowFrameMaterial} from "./windowMaterials";

const project=(type:'gable'|'hip'|'flat'='gable'):Project=>({...demoProject(),roof:{...DEFAULT_ROOF,type}});
test('RAL 7024 frames retain sections, sizes and wall position when saved and use the shared graphite swatch',()=>{
 const p=demoProject();p.openings[0]={...p.openings[0],frameFinish:'ral7024',sectionWidths:[.6,.7,.9]};assert.deepEqual(parseProject(JSON.stringify(p)),p);
 const material=createWindowFrameMaterial('ral7024');assert.equal(material.color.getHexString(),'474a50');assert.equal(material.name,'window-frame-ral7024');assert.equal(material.map,null);material.dispose();
});
test('a gable roof has gutters and snow rails on its two eaves, never on the sloping rake edges',()=>{
 const p=project(),plan=roofDetailsPlan(p),parts=roofData(p).parts;assert.equal(plan.eaves.length,2);assert.equal(plan.pipes.length,4);assert.equal(plan.guards.length,2);
 for(const run of plan.eaves){const part=parts[run.part];assert(Math.abs(roofBottomAt(part,run.a)-roofBottomAt(part,run.b))<1e-6);assert(Math.abs(run.gutterA.y-part.base-.11)<1e-6);}
 for(const guard of plan.guards){const run=plan.eaves[guard.run],part=parts[run.part];assert(guard.supports.length>3);for(const p of guard.feet){assert(pointInRoofContour({x:p.x,y:p.z},part.contour));assert(Math.abs(p.y-roofBottomAt(part,{x:p.x,y:p.z})-ROOF_THICKNESS-.02)<1e-6);}}
});
test('hip roofs have a perimeter water system and snow rails; flat roofs have drainage alone and missing roofs have neither',()=>{
 for(const type of['hip','flat']as const){const p=project(type),plan=roofDetailsPlan(p);assert.equal(plan.eaves.length,4);assert.equal(plan.pipes.length,4);assert.equal(plan.guards.length,type==='hip'?4:0);assert(plan.eaves.every(r=>!r.capA&&!r.capB));}
 const old=demoProject(),before=JSON.stringify(old);assert.deepEqual(roofDetailsPlan(old),{eaves:[],pipes:[],guards:[]});assert.equal(JSON.stringify(old),before);
});
test('hardware follows rotated, reversed and concave house outlines without placing snow rails across the courtyard notch',()=>{
 const p=project('hip'),angle=.43,rotate=(q:{x:number;y:number})=>({x:q.x*Math.cos(angle)-q.y*Math.sin(angle),y:q.x*Math.sin(angle)+q.y*Math.cos(angle)});
 const rotated={...p,walls:p.walls.map(w=>({...w,a:rotate(w.b),b:rotate(w.a)}))};assert.equal(roofDetailsPlan(rotated).eaves.length,4);assert.equal(roofDetailsPlan(rotated).guards.length,4);
 const outline=[[0,0],[8,0],[8,3],[3,3],[3,8],[0,8]],L:Project={version:1,name:'L',roof:{...DEFAULT_ROOF,type:'hip'},openings:[],walls:outline.map((a,i)=>({id:String(i),a:{x:a[0],y:a[1]},b:{x:outline[(i+1)%outline.length][0],y:outline[(i+1)%outline.length][1]},thickness:.22,height:2.8}))};
 const plan=roofDetailsPlan(L),parts=roofData(L).parts;assert.equal(plan.eaves.length,6);assert(plan.guards.length>=4);for(const guard of plan.guards)for(const p of guard.feet)assert(pointInRoofContour({x:p.x,y:p.z},parts[plan.eaves[guard.run].part].contour));
});
test('vertical drain pipes move to free facade strips when windows change, and are omitted beside a fully glazed eave',()=>{
 const p=project(),before=JSON.stringify(p),original=roofDetailsPlan(p),newWindow={...p.openings[0],offset:1.4};
 const moved={...p,openings:p.openings.map(o=>o.id===newWindow.id?newWindow:o)},plan=roofDetailsPlan(moved);assert.notDeepEqual(plan.pipes.map(p=>p.wall),original.pipes.map(p=>p.wall));assert(plan.pipes.every(pipe=>pipeClearsOpenings(moved,pipe.wall)));
 const glazed={...p,openings:[{...p.openings[0],offset:5,width:9.76}]},blocked=roofDetailsPlan(glazed);assert(!blocked.pipes.some(p=>p.wall.y<0));assert(blocked.pipes.every(pipe=>pipeClearsOpenings(glazed,pipe.wall)));assert.equal(JSON.stringify(p),before);
});
test('gutter, pipe and guard meshes stay inside the roof group, have finite geometry, and rebuild at new wall heights and overhangs',()=>{
 const p=project('hip'),before=roofDetailsPlan(p),raised={...p,walls:p.walls.map(w=>({...w,height:w.height+1})),roof:{...p.roof!,overhang:.8}},after=roofDetailsPlan(raised),group=new THREE.Group();buildRoof(raised,group);
 assert(Math.abs(after.eaves[0].height-before.eaves[0].height-1)<1e-6);assert.notDeepEqual(after.eaves[0].gutterA,before.eaves[0].gutterA);
 const accessories=group.getObjectByName('roof-accessories')!;assert.equal(accessories.parent,group);assert.equal(accessories.children.length,3);assert.equal(accessories.userData.downspouts,4);
 group.visible=false;for(const name of['roof-gutters','roof-downspouts','roof-snow-guards']){const mesh=group.getObjectByName(name)as THREE.Mesh;assert(mesh&&mesh.parent===accessories);const p=mesh.geometry.attributes.position;assert(p.count>100);assert([...p.array].every(Number.isFinite));let visible=true;for(let o:THREE.Object3D|null=mesh;o;o=o.parent)visible&&=o.visible;assert(!visible);}
});
