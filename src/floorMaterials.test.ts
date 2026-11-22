import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { applyFloorUV, floorMaterial } from "./floorMaterials";
import { defaultFloor, type FloorFinish } from "./floorSettings";
import { findRooms, parseProject, type Project, type Wall } from "./model";

const wall=(id:string,ax:number,ay:number,bx:number,by:number):Wall=>
  ({id,a:{x:ax,y:ay},b:{x:bx,y:by},thickness:.2,height:2.8});

test("floor settings round-trip and room overrides follow the same boundary walls",()=>{
  const walls=[wall("north",0,0,8,0),wall("east",8,0,8,4),wall("south",8,4,0,4),
    wall("west",0,4,0,0),wall("division",3,0,3,4)];
  const rooms=findRooms(walls);
  assert.equal(rooms.length,2);
  assert.notEqual(rooms[0].id,rooms[1].id);
  const [left]=[...rooms].sort((a,b)=>a.center.x-b.center.x);
  const project:Project={version:1,name:"Полы",walls,openings:[],floor:defaultFloor("tile60"),
    roomFloors:[{roomId:left.id,finish:{...defaultFloor("tile120"),texture:"concrete",angle:90}}]};
  assert.deepEqual(parseProject(JSON.stringify(project)),project);
  assert.throws(()=>parseProject(JSON.stringify({...project,floor:{...project.floor,texture:"rustic"}})));
  assert.throws(()=>parseProject(JSON.stringify({...project,floor:{...project.floor,angle:180}})));
  const widened=[...walls,wall("stub",0,2,1,2)].map(w=>({...w,a:{x:w.a.x+4,y:w.a.y},b:{x:w.b.x+4,y:w.b.y}}));
  assert.deepEqual(findRooms(widened.reverse()).map(room=>room.id).sort(),rooms.map(room=>room.id).sort());
});

test("tile seams stay at 60 or 120 cm, and direction rotates the long edge",()=>{
  for (const kind of ["tile60","tile120"] as const) {
    const finish:FloorFinish=defaultFloor(kind);
    const material=floorMaterial(finish);
    assert(material.roughness>.9);
    assert.equal(finish.color,"light-gray");
    const {width,height,data}=material.map!.image;
    const value=(x:number,y:number)=>data[(y*width+x)*4];
    assert(value(width/2,height/4)<value(width/4,height/4));
    assert(value(width/4,height/2)<value(width/4,height/4));
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute([0,0,0,.6,0,0,0,0,.6],3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(new Float32Array(6),2));
    const uv=geometry.attributes.uv;
    const near=(value:number,expected:number)=>assert(Math.abs(value-expected)<1e-6);
    const along=kind==="tile120"?.25:.5;
    applyFloorUV(geometry,finish);
    near(uv.getX(1),along);near(uv.getY(2),.5);
    applyFloorUV(geometry,{...finish,angle:90});
    near(uv.getX(2),along);near(uv.getY(1),-.5);
    geometry.dispose();
    material.map!.dispose();
    material.dispose();
  }
});
