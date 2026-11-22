import * as THREE from "three";
import type {Wall} from "./model";
import {wallPiecePolygon,type WallBody} from "./wallBodies";

export function createWallPieceGeometry(wall:Wall,body:WallBody,start:number,end:number,bottom:number,top:number):THREE.BufferGeometry|null{
  if(top-bottom<.001)return null;
  const polygon=wallPiecePolygon(wall,body,start,end);if(polygon.length<3)return null;
  const shape=new THREE.Shape(polygon.map(p=>new THREE.Vector2(p.x,-p.y)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:top-bottom,bevelEnabled:false,steps:1});
  geometry.rotateX(-Math.PI/2);geometry.translate(0,bottom,0);return geometry;
}
