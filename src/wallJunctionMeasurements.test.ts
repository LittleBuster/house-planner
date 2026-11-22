import { test } from "node:test";
import assert from "node:assert/strict";
import type { Point, Wall } from "./model";
import { wallBody } from "./wallBodies";
import { measureWallJunction } from "./wallJunctionMeasurements";

const wall=(id:string,a:Point,b:Point,thickness=.2):Wall=>({id,a,b,thickness,height:2.8});
const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test("hover and drawing measure on both sides from the partition edges, at either attached end",()=>{
  const top=wall("top",{x:0,y:0},{x:8,y:0},.22);
  const bottom=wall("bottom",{x:8,y:5},{x:0,y:5},.3);
  const partition=wall("preview",{x:3,y:0},{x:3,y:5},.24);
  const walls=[top,bottom],body=wallBody(partition,[...walls,partition]);
  const [hover]=measureWallJunction(walls,partition.a,{x:3,y:.08},partition.thickness);
  const [start]=measureWallJunction(walls,partition.a,partition.b,partition.thickness,body.polygon);
  assert.deepEqual(start.spans,hover.spans);
  close(start.spans[0].from,2.88);close(start.spans[0].to,0);
  close(start.spans[1].from,3.12);close(start.spans[1].to,8);
  const [end]=measureWallJunction(walls,partition.b,partition.a,partition.thickness,body.polygon);
  assert.equal(end.wall.id,"bottom");assert.equal(end.side,1);
  close(end.spans[0].from,4.88);close(end.spans[1].from,5.12);
  assert.deepEqual(measureWallJunction(walls,{x:3,y:.1},{x:3,y:3},.24),[]);
  const inset={...partition,a:{x:3,y:.08}};
  const [faceJoin]=measureWallJunction(walls,inset.a,inset.b,inset.thickness,wallBody(inset,[...walls,inset]).polygon);
  assert.deepEqual(faceJoin.spans,start.spans);
});

test("diagonal preview measures the real face intersection rather than the axis or nominal thickness",()=>{
  for(const angle of [0,-Math.PI/2,Math.PI*.37]){
    const rotate=(x:number,y:number)=>({x:2+x*Math.cos(angle)-y*Math.sin(angle),y:-3+x*Math.sin(angle)+y*Math.cos(angle)});
    const host=wall("host",rotate(0,0),rotate(8,0),.4),branch=wall("preview",rotate(3,0),rotate(5,2));
    const body=wallBody(branch,[host,branch]);
    const [measurement]=measureWallJunction([host],branch.a,branch.b,branch.thickness,body.polygon);
    assert.equal(measurement.side,1);
    close(measurement.spans[0].from,3.2-.1*Math.SQRT2);
    close(measurement.spans[1].from,3.2+.1*Math.SQRT2);
  }
});

test("a flush corner leaves only one visible span and a collinear continuation shows no split",()=>{
  const host=wall("host",{x:0,y:0},{x:6,y:0});
  const branch=wall("preview",{x:.1,y:0},{x:.1,y:3}),body=wallBody(branch,[host,branch]);
  const [measurement]=measureWallJunction([host],branch.a,branch.b,branch.thickness,body.polygon);
  assert.equal(measurement.spans.length,1);assert.equal(measurement.spans[0].side,"end");
  close(measurement.spans[0].from,.2);
  const continuation=wall("next",host.b,{x:8,y:0}),straight=wallBody(continuation,[host,continuation]);
  assert.deepEqual(measureWallJunction([host],host.b,continuation.b,continuation.thickness,straight.polygon),[]);
});

test("partition spans end at the interior faces of both corner walls during hover and drawing", () => {
  const host = wall("host", {x: 0, y: 0}, {x: 8, y: 0}, .22);
  const left = wall("left", {x: .1, y: 0}, {x: .1, y: 5});
  const right = wall("right", host.b, {x: 8, y: 5}, .3);
  const branch = wall("preview", {x: 3, y: 0}, {x: 3, y: 3}, .12);

  for (const walls of [[host, left, right], [right, left, host]]) {
    const body = wallBody(branch, [...walls, branch]);
    const [hover] = measureWallJunction(walls, branch.a, {x: 3, y: .05}, branch.thickness);
    const [drawing] = measureWallJunction(walls, branch.a, branch.b, branch.thickness, body.polygon);
    assert.deepEqual(drawing.spans, hover.spans);
    close(drawing.spans[0].from, 2.94);
    close(drawing.spans[0].to, .2);
    close(drawing.spans[1].from, 3.06);
    close(drawing.spans[1].to, 7.85);
  }
});

test("spans stop at the nearest partition on the measured side only", () => {
  const host = wall("host", {x: 8, y: 0}, {x: 0, y: 0}, .22);
  const inner = wall("inner", {x: 5, y: 0}, {x: 5, y: 4});
  const outer = wall("outer", {x: 4, y: 0}, {x: 4, y: -4});
  const [inside] = measureWallJunction([host, inner, outer], {x: 3, y: 0}, {x: 3, y: .08}, .12);
  const [outside] = measureWallJunction([host, inner, outer], {x: 3, y: 0}, {x: 3, y: -.08}, .12);
  assert.equal(inside.side, -1);
  close(inside.spans[0].to, 3.1);
  close(inside.spans[1].to, 8);
  assert.equal(outside.side, 1);
  close(outside.spans[0].to, 4.1);
});
