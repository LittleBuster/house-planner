import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseProject, type Plant, type Project } from "./model";
import { PLANT_VARIANTS, plantingError } from "./landscape";
import { createColliders, jumpHeadroom, movePerson } from "./walkPhysics";

const herb: Plant={id:"herb",kind:"groundcover",variant:"groundcover-clover",position:{x:0,y:0},height:0.05,rotation:25,seed:1};
const empty: Project={version:1,name:"Растения",walls:[],openings:[]};
test("herb species and shapes round-trip at centimetre sizes with strict bounds",()=>{
  for(const kind of ["groundcover","grass"] as const){
    for(const variant of PLANT_VARIANTS[kind]){
      const p={...empty,plants:[{...herb,kind,variant:variant.id}]};
      assert.deepEqual(parseProject(JSON.stringify(p)),p);
      assert.equal(plantingError(empty,p.plants[0]),null);
      for(const height of [0.049,2.01]){
        assert.throws(()=>parseProject(JSON.stringify({...p,plants:[{...p.plants[0],height}]})));
        assert(plantingError(empty,{...p.plants[0],height}));
      }
    }
  }
  assert.throws(()=>parseProject(JSON.stringify({...empty,plants:[{...herb,kind:"grass"}]})));
  assert.throws(()=>parseProject(JSON.stringify({...empty,plants:[{...herb,kind:"birch",variant:undefined}]})));
});
test("ten imported herbs are grounded individual triangle models with embedded textures and supported PBR",()=>{
  assert.equal(PLANT_VARIANTS.groundcover.length,9);
  assert.equal(PLANT_VARIANTS.grass.length,1);
  for(const kind of ["groundcover","grass"] as const){
    const bytes=readFileSync(new URL(`../assets/plants/${kind}.glb`,import.meta.url));
    const j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.equal(j.scenes[0].nodes.length,PLANT_VARIANTS[kind].length);
    for(const root of j.scenes[0].nodes){
      const node=j.nodes[root],positions=node.children.flatMap((i:number)=>j.meshes[j.nodes[i].mesh].primitives.map((p:any)=>{
        assert.equal(p.mode??4,4);return j.accessors[p.attributes.POSITION];
      }));
      assert(PLANT_VARIANTS[kind].some(v=>v.id===node.name));
      assert(Math.abs(Math.min(...positions.map((a:any)=>a.min[1])))<1e-5);
      assert(Math.abs(Math.max(...positions.map((a:any)=>a.max[1]))-1)<1e-5);
    }
    assert(j.images.length>0&&j.images.every((im:any)=>im.bufferView!==undefined&&!im.uri));
    assert(j.materials.every((m:any)=>m.pbrMetallicRoughness?.baseColorTexture&&m.alphaMode==="MASK"));
    assert(!j.extensionsUsed?.includes("KHR_materials_pbrSpecularGlossiness"));
  }
});
test("herbs allow overlapping planting and walking without changing tree or wall collisions",()=>{
  const project={...empty,plants:[{...herb,height:2}]};
  assert.equal(plantingError(project,{...herb,id:"second"}),null);
  assert.deepEqual(createColliders(project),[]);
  assert.equal(jumpHeadroom(project,{x:0,y:0}),Infinity);
  const end=movePerson({x:-2,y:0},{x:4,y:0},createColliders(project));
  assert(Math.abs(end.x-2)<1e-9&&end.y===0);
  const wall={id:"wall",a:{x:-2,y:0},b:{x:2,y:0},height:2.8,thickness:.2};
  assert(plantingError({...empty,walls:[wall]},herb));
  const tree:Plant={...herb,id:"tree",kind:"birch",variant:undefined,height:5};
  assert.equal(plantingError(project,tree),null);
  assert(createColliders({...project,plants:[...project.plants,tree]}).length>0);
});
