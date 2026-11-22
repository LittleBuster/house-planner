import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demoProject, findRooms, parseProject, type LawnTile, type Project } from "./model";
import { lawnArea, lawnError, resizeCover, resizeLawn, snapCover } from "./lawn";
import { coverBounds } from "./groundSettings";
import { lawnFootprint, onLawnFootprint } from "./lawnFootprint";
import { DEFAULT_PLINTH } from "./houseFinishes";
import { siteBounds } from "./landscape";
import { createColliders, EYE_HEIGHT, movePerson } from "./walkPhysics";
import * as THREE from "three";
import { createRoomFloor, createTerrain, SITE_LEVEL } from "./sceneSurfaces";
import { groundMaterial, GROUND_TEXTURE_METRES } from "./groundMaterials";
import { createGroundTile, disposeLawnModel } from "./lawnModels";
const empty = (): Project => ({version:1,name:"Газон",walls:[],openings:[]});
const tile = (id="lawn",x=-3,y=1,size=2):LawnTile=>({id,position:{x,y},size});
test("free rectangular covers preserve arbitrary coordinates and dimensions on round-trip",()=>{
  const cover = {...tile("free",-3.271,1.083,4.135),depth:.723};
  const p = {...empty(),siteGrid:{lawnSize:3},lawn:[cover]};
  assert.equal(lawnError(empty(),cover),null);
  assert.deepEqual(parseProject(JSON.stringify(p)),p);
  assert(Math.abs(lawnFootprint(p,cover).area-4.135*.723)<1e-8);
});
test("edge resizing anchors the opposite edge and stops exactly at other materials",()=>{
  const grass = {...tile("grass",0,0,2),depth:.7};
  const concrete:LawnTile = {...tile("concrete",3,0,1.5),depth:.5,material:"concrete"};
  const p = {...empty(),lawn:[grass,concrete]};
  const joined = resizeLawn(p,grass,"maxX",7.123);
  const bounds = coverBounds(joined);
  assert.equal(bounds.minX,-1);
  assert.equal(bounds.maxX,coverBounds(concrete).minX);
  assert.equal(joined.depth,.7);
  assert.equal(lawnError(p,joined,grass.id),null);
  const lengthened = resizeLawn(p,joined,"minY",-.372);
  assert(Math.abs(coverBounds(lengthened).maxY-bounds.maxY)<1e-8);
  assert(Math.abs(lengthened.depth!-(.7+.372))<1e-8);
  assert.equal(lengthened.size,joined.size);
  const shortened = resizeLawn(p,grass,"minX",99);
  assert.equal(shortened.size,.1);
  assert(Math.abs(coverBounds(shortened).maxX-1)<1e-8);
});
test("lawn squares may touch edges or corners, but may not overlap",()=>{
  const p={...empty(),lawn:[tile("one",1,1)]};
  assert.equal(lawnError(p,tile("two",3,1)),null);
  assert.equal(lawnError(p,tile("two",3,3)),null);
  assert(lawnError(p,tile("two",1,1)));
  assert(lawnError(p,{...tile("two",1,1),material:"concrete"}));
  assert(lawnError(p,tile("two",2.9,1)));
  assert.equal(lawnError(p,tile("one",1,1),"one"),null);
});
test("moving a cover closes a gap or small overlap without changing its size or position along the seam", () => {
  const grass = {...tile("grass",0,.31,1.8),depth:.7};
  const concrete:LawnTile = {...tile("concrete",2.012,0,2.1),material:"concrete"};
  const p = {...empty(),lawn:[grass,concrete]};
  const edge = coverBounds(concrete).minX;
  for (const gap of [.002,-.045]) {
    const dragged = {...grass,position:{x:edge-grass.size/2-gap,y:grass.position.y}};
    const joined = snapCover(p,dragged,grass.id);
    assert(Math.abs(coverBounds(joined).maxX-edge) < 1e-10);
    assert.equal(joined.position.y,grass.position.y);
    assert.equal(joined.size,grass.size);
    assert.equal(joined.depth,grass.depth);
    assert.equal(lawnError(p,joined,grass.id),null);
  }
  for (const position of [{x:edge-grass.size/2-.12,y:.31},{x:edge-grass.size/2-.002,y:3.2}]) {
    const free = {...grass,position};
    assert.equal(snapCover(p,free,grass.id),free);
  }
});
test("a cover can snap to two perpendicular seams in the same move", () => {
  const grass = tile("grass",0,0);
  const concrete:LawnTile = {...tile("concrete",4,2),material:"concrete"};
  const sand:LawnTile = {...tile("sand",2,4),material:"sand"};
  const p = {...empty(),lawn:[grass,concrete,sand]};
  const dragged = {...grass,position:{x:2.04,y:2.07}};
  const joined = snapCover(p,dragged,grass.id);
  assert.deepEqual(joined.position,{x:2,y:2});
  assert.equal(lawnError(p,joined,grass.id),null);
});
test("a nearer seam that overlaps another cover gives way to a valid seam", () => {
  const grass = tile("grass",-4,0);
  const concrete:LawnTile = {...tile("concrete",2.03,-.5),depth:1,material:"concrete"};
  const soil:LawnTile = {...tile("soil",1.93,.5),depth:1,material:"soil"};
  const p = {...empty(),lawn:[grass,concrete,soil]};
  const joined = snapCover(p,{...grass,position:{x:0,y:0}},grass.id);
  assert.equal(coverBounds(joined).maxX,coverBounds(soil).minX);
  assert.equal(lawnError(p,joined,grass.id),null);
});
test("corner drag anchors the opposite corner and can slide along a neighboring cover",()=>{
  const grass = tile("grass",0,0), concrete = {...tile("concrete",3,3),material:"concrete" as const};
  const p = {...empty(),lawn:[grass,concrete]};
  const grown = resizeCover(p,grass,"maxX-maxY",{x:3,y:2});
  assert.deepEqual(coverBounds(grown),{minX:-1,minY:-1,maxX:4,maxY:2});
  assert.equal(lawnError(p,grown,grass.id),null);
  const opposite = resizeCover(p,grass,"minX-minY",{x:-1.25,y:-.5});
  assert.deepEqual(coverBounds(opposite),{minX:-2.25,minY:-1.5,maxX:1,maxY:1});
  const neighbor = {...concrete,position:{x:3,y:1.75}};
  const narrowed = resizeCover({lawn:[grass,neighbor]},grass,"maxX-maxY",{x:3,y:-.5});
  assert.deepEqual(coverBounds(narrowed),{minX:-1,minY:-1,maxX:4,maxY:.5});
});
test("partly covered cells are accepted and cropped at the recessed plinth, while wholly indoor cells are rejected",()=>{
  const p=demoProject();
  assert(lawnError(p,tile("l",3,3)));
  const edge = tile("l",.5,3), footprint = lawnFootprint(p,edge);
  assert.equal(lawnError(p,edge),null);
  assert(!footprint.full && footprint.area > 0 && footprint.area < 4);
  const exteriorX = -(p.walls[3].thickness/2 - DEFAULT_PLINTH.recess);
  assert(Math.abs(footprint.area - (.5+exteriorX)*2) < 1e-5);
  assert(onLawnFootprint({x:exteriorX-.01,y:3},footprint));
  assert(!onLawnFootprint({x:exteriorX+.01,y:3},footprint));
  assert(lawnFootprint({...p,plinth:{...DEFAULT_PLINTH,recess:0}},edge).area < footprint.area);
  const diagonal={...empty(),walls:[{id:"diagonal",a:{x:-4,y:-4},b:{x:4,y:4},thickness:.2,height:3}]};
  assert.equal(lawnError(diagonal,tile("l",0,0)),null);
  assert.equal(lawnFootprint(diagonal,tile("l",0,0)).parts.length,2);
  assert.equal(lawnError(diagonal,tile("l",-3,1)),null);
});
test("a cell around a small building has a hole in its middle",()=>{
  const corners = [{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}];
  const p = {...empty(),walls:corners.map((a,i)=>({id:`w${i}`,a,b:corners[(i+1)%4],thickness:.22,height:2.8}))};
  const footprint = lawnFootprint(p,tile("l",0,0,5));
  assert.equal(footprint.parts.length,1);
  assert.equal(footprint.parts[0].holes.length,1);
  assert(Math.abs(footprint.area - (25-2.14**2)) < 1e-5);
  assert(!onLawnFootprint({x:0,y:0},footprint));
  assert(onLawnFootprint({x:2,y:0},footprint));
});
test("sizes, boundaries and tile limits are checked; existing tiles can still be edited at the limit",()=>{
  for(const bad of [tile("l",0,0,.04),tile("l",0,0,21),tile("l",500,0),tile("l",Infinity,0),{...tile(),depth:-1}])assert(lawnError(empty(),bad));
  const p={...empty(),lawn:Array.from({length:400},(_,i)=>tile(String(i),-400+i*2,-10))};
  assert(lawnError(p,tile("extra",1,1)));
  assert.equal(lawnError(p,tile("0",-400,-10),"0"),null);
});
test("lawn round-trips alongside trees; old project shape is unchanged and malformed tiles are rejected",()=>{
  const original=demoProject();assert.deepEqual(parseProject(JSON.stringify(original)),original);
  const p={...original,lawn:[tile()]};assert.deepEqual(parseProject(JSON.stringify(p)),p);
  const mixed={...p,lawn:[tile(),{...tile("s",-5,1),material:"soil"},{...tile("sand",-7,1),material:"sand"},{...tile("concrete",-9,1),material:"concrete"}]};
  assert.deepEqual(parseProject(JSON.stringify(mixed)),mixed);
  for(const patch of [{size:0},{size:21},{depth:0},{depth:null},{depth:"2"},{depth:21},{position:{x:NaN,y:0}},{id:"w1"},{size:"2"},{position:{x:499.9,y:0}}])assert.throws(()=>parseProject(JSON.stringify({...p,lawn:[{...tile(),...patch}]})));
  assert.throws(()=>parseProject(JSON.stringify({...p,lawn:[tile(),tile()]})));
  assert.throws(()=>parseProject(JSON.stringify({...p,lawn:[{...tile(),material:"mulch"}]})));
  assert.throws(()=>parseProject(JSON.stringify({...p,lawn:Array.from({length:401},(_,i)=>tile(String(i)))})));
});
test("total area and scene framing follow actual metre dimensions",()=>{
  assert.equal(lawnArea({...empty(),lawn:[tile(),tile("b",1,1,3),tile("c",1,1,.5)]}),13.25);
  const b=siteBounds({...empty(),lawn:[tile("far",-20,20,4)]});
  assert.equal(b.minX,-22);assert.equal(b.maxY,22);
});
test("site covers are walkable and never change eye height or introduce a collider",()=>{
  const p:Project={...empty(),lawn:[tile("one",1,1),{...tile("two",3,1),material:"concrete"},{...tile("three",5,1),material:"sand"},{...tile("four",7,1),material:"soil"}]};
  assert.deepEqual(createColliders(p),createColliders(empty()));
  const end=movePerson({x:-1,y:1},{x:6,y:0},createColliders(p));
  assert(Math.abs(end.x-5)<1e-5);assert.equal(EYE_HEIGHT,1.65);
});
test("gravel and asphalt keep a repeating metre-scale texture and relief when resized",()=>{
  for (const kind of ["gravel","asphalt"] as const) {
    const material=groundMaterial(kind);
    assert(material.map && material.bumpMap);
    assert.equal(material.map.wrapS,THREE.RepeatWrapping);
    assert.equal(material.map.wrapT,THREE.RepeatWrapping);
    assert.notDeepEqual(material.map.image.data,groundMaterial("concrete").map?.image.data);
    for (const size of [2,4]) {
      const patch:LawnTile={...tile(kind,0,0,size),depth:2,material:kind};
      const project={...empty(),lawn:[patch]};
      assert.deepEqual(parseProject(JSON.stringify(project)),project);
      const group=createGroundTile(patch,lawnFootprint(project,patch));
      const mesh=group.getObjectByName("lawn-base") as THREE.Mesh;
      assert.equal(mesh.material,material);
      const uv=mesh.geometry.getAttribute("uv");
      const u=Array.from({length:uv.count},(_,i)=>uv.getX(i));
      assert(Math.abs(Math.max(...u)-Math.min(...u)-size/GROUND_TEXTURE_METRES)<1e-5);
      disposeLawnModel(group);
    }
  }
});
test("prepared lawn preserves all 9436 blades in one full-detail mesh, an exact square footprint, and fixed 12 cm blades",()=>{
  const b=readFileSync(new URL("../assets/plants/lawn.glb",import.meta.url));const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  assert.equal(j.meshes.length,2);assert.equal(j.nodes.length,2);
  const grass=j.meshes.find((m:any)=>m.name==="lawn-grass");
  assert.equal(j.accessors[grass.primitives[0].indices].count/3,9436*8);
  const all=j.meshes.map((m:any)=>j.accessors[m.primitives[0].attributes.POSITION]);
  assert.equal(Math.min(...all.map((a:any)=>a.min[0])),-.5);assert.equal(Math.max(...all.map((a:any)=>a.max[0])),.5);
  assert(Math.abs(Math.max(...all.map((a:any)=>a.max[1]))-.122)<1e-5);
});
test("terrain stays below house floors and lawn, without moving the physical walking level",()=>{
  const terrain=createTerrain();terrain.updateMatrixWorld(true);
  const ground=new THREE.Box3().setFromObject(terrain);
  const p=demoProject();
  const rooms=findRooms(p.walls);assert(rooms.length>0);
  for(const room of rooms) {
    const floor=createRoomFloor(room.points,0xffffff);floor.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(floor);
    assert(Math.abs(box.max.y-SITE_LEVEL)<1e-6);
    assert(box.max.y-ground.max.y>.025);
    floor.geometry.dispose();floor.material.dispose();
  }
  assert.equal(SITE_LEVEL,0);assert.equal(EYE_HEIGHT,1.65);
  assert(SITE_LEVEL+.002-ground.max.y>.03);
  terrain.geometry.dispose();terrain.material.dispose();
});
