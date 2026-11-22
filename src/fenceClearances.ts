import type { Point, Project } from "./model";
import { fenceFootprint, fencePostKey, type Fence } from "./fenceSettings";
import { clipWallPolygon } from "./wallBodies";
import { createColliders, type Collider } from "./walkPhysics";
import { entryTreads } from "./entrySteps";
import { sceneDisplay } from "./sceneDisplay";
import type { TreeClearance } from "./treeClearances";

const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;
const offset=(point:Point,axis:Point,length:number):Point=>({x:point.x+axis.x*length,y:point.y+axis.y*length});
const left=(axis:Point):Point=>({x:-axis.y,y:axis.x});
const flip=(axis:Point):Point=>({x:-axis.x,y:-axis.y});

function detachedFences(project: Project, selected: Fence) {
  const connected=new Set([selected.id]);
  const posts=new Set([fencePostKey(selected.a),fencePostKey(selected.b)]);
  const fences=project.fences ?? [];
  let changed=true;
  while (changed) {
    changed=false;
    for (const fence of fences) {
      if (connected.has(fence.id)) continue;
      const a=fencePostKey(fence.a), b=fencePostKey(fence.b);
      if (!posts.has(a)&&!posts.has(b)) continue;
      connected.add(fence.id);posts.add(a);posts.add(b);changed=true;
    }
  }
  return fences.filter(fence=>!connected.has(fence.id));
}

function nearestInStrip(origin:Point, forward:Point, lateral:Point, halfSpan:number, obstacle:Collider) {
  const toLocal=(p:Point)=>{
    const d={x:p.x-origin.x,y:p.y-origin.y};
    return {x:dot(d,forward),y:dot(d,lateral)};
  };
  if ("radius" in obstacle) {
    const center=toLocal(obstacle.center);
    const y=Math.max(-halfSpan,Math.min(halfSpan,center.y));
    const square=obstacle.radius**2-(y-center.y)**2;
    if (square<0 || center.x+Math.sqrt(square)<0) return;
    return {x:Math.max(0,center.x-Math.sqrt(square)),y};
  }
  const normal=left(obstacle.axis);
  const corners=obstacle.polygon ?? [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>
    offset(offset(obstacle.center,obstacle.axis,u*obstacle.halfLength),normal,v*obstacle.halfDepth));
  let polygon=corners.map(toLocal);
  polygon=clipWallPolygon(polygon,{x:0,y:1},-halfSpan);
  polygon=clipWallPolygon(polygon,{x:0,y:-1},-halfSpan);
  polygon=clipWallPolygon(polygon,{x:1,y:0},0);
  if (!polygon.length) return;
  const x=Math.min(...polygon.map(point=>point.x));
  const edge=polygon.filter(point=>Math.abs(point.x-x)<1e-7).map(point=>point.y);
  return {x,y:Math.max(Math.min(...edge),Math.min(Math.max(...edge),0))};
}

export function measureFenceClearances(project: Project, fence: Fence): TreeClearance[] {
  const obstacles=createColliders({...project,fences:detachedFences(project,fence)},0);
  const display=sceneDisplay(project);
  if (display.house && display.landscape) {
    for (const tread of entryTreads(project))
      obstacles.push({center:tread.center,axis:tread.axis,halfLength:tread.width/2,halfDepth:tread.depth/2});
  }
  const {center,axis,halfLength,halfDepth}=fenceFootprint(fence);
  const normal=left(axis);
  const sides=[
    {direction:"начало",axis:flip(axis),depth:halfLength,span:halfDepth},
    {direction:"конец",axis,depth:halfLength,span:halfDepth},
    {direction:"слева",axis:flip(normal),depth:halfDepth,span:halfLength},
    {direction:"справа",axis:normal,depth:halfDepth,span:halfLength},
  ];
  return sides.map(side=>{
    const face=offset(center,side.axis,side.depth), across=left(side.axis);
    let nearest:Point|undefined;
    for (const obstacle of obstacles) {
      const hit=nearestInStrip(face,side.axis,across,side.span,obstacle);
      if (hit && (!nearest || hit.x<nearest.x)) nearest=hit;
    }
    const start=nearest ? offset(face,across,nearest.y) : face;
    const distance=nearest ? Math.max(0,nearest.x) : null;
    return {direction:side.direction,start,end:offset(start,side.axis,distance??0),distance};
  });
}
