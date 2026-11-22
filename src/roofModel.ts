import ClipperLib from "clipper-lib";
import * as THREE from "three";
import {findRooms,type Point,type Project,type Wall} from "./model";
import {wallBodies} from "./wallBodies";
import type {RoofSettings} from "./roofSettings";

const SCALE=10000,EPS=1e-7;
export const ROOF_THICKNESS=.16;
export type RoofContour={outer:Point[];holes:Point[][]};
export type RoofTriangle={points:[Point,Point,Point];lift:[number,number,number]};
export type RoofPart={contour:RoofContour;wallContour:RoofContour;base:number;triangles:RoofTriangle[]};
export type RoofData={parts:RoofPart[];maxHeight:number;area:number;triangleCount:number};
const area=(p:Point[])=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.y-a.y*b.x;},0)/2;
const intPath=(points:Point[])=>points.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}));
const points=(path:ClipperLib.Path)=>path.map(p=>({x:p.X/SCALE,y:p.Y/SCALE}));
function booleanPaths(subject:ClipperLib.Paths,clip:ClipperLib.Paths=[],type=ClipperLib.ClipType.ctUnion):ClipperLib.Paths{
  const c=new ClipperLib.Clipper(),result:ClipperLib.Paths=[];
  c.AddPaths(subject,ClipperLib.PolyType.ptSubject,true);if(clip.length)c.AddPaths(clip,ClipperLib.PolyType.ptClip,true);
  c.Execute(type,result,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);return result;
}
function offset(paths:ClipperLib.Paths,amount:number):ClipperLib.Paths{
  if(amount<1/SCALE)return paths;
  const c=new ClipperLib.ClipperOffset(2,.01*SCALE),result:ClipperLib.Paths=[];
  c.AddPaths(paths,ClipperLib.JoinType.jtMiter,ClipperLib.EndType.etClosedPolygon);c.Execute(result,amount*SCALE);return result;
}
export function pointInRoofContour(p:Point,contour:RoofContour):boolean{
  const point={X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)};
  return ClipperLib.Clipper.PointInPolygon(point,intPath(contour.outer))!==0&&!contour.holes.some(h=>ClipperLib.Clipper.PointInPolygon(point,intPath(h))===1);
}
export function contours(paths:ClipperLib.Paths):RoofContour[]{
  const outer=paths.filter(p=>ClipperLib.Clipper.Area(p)>0).map(p=>({outer:points(p),holes:[] as Point[][]}));
  for(const hole of paths.filter(p=>ClipperLib.Clipper.Area(p)<0)){
    const h=points(hole),parent=outer.filter(o=>pointInRoofContour(h[0],o)).sort((a,b)=>area(a.outer)-area(b.outer))[0];if(parent)parent.holes.push(h);
  }
  return outer;
}
const footprintCache=new WeakMap<Wall[],{contour:RoofContour;base:number}[]>();
export function buildingFootprints(walls:Wall[]):{contour:RoofContour;base:number}[]{
  const cached=footprintCache.get(walls);if(cached)return cached;
  const rooms=findRooms(walls);if(!rooms.length){footprintCache.set(walls,[]);return [];}
  const roomPaths=booleanPaths(rooms.map(r=>intPath(r.points))),subjects=[...roomPaths],expanded=new Map<number,ClipperLib.Paths>(),bodies=wallBodies(walls);
  for(const wall of walls){
    let domain=expanded.get(wall.thickness);if(!domain){domain=offset(roomPaths,wall.thickness/2+.001);expanded.set(wall.thickness,domain);}
    const polygon=bodies.get(wall.id)!.polygon;if(polygon.length>=3)subjects.push(...booleanPaths([intPath(polygon)],domain,ClipperLib.ClipType.ctIntersection));
  }
  const result=contours(booleanPaths(subjects)).map(contour=>{
    const heights=walls.filter(w=>pointInRoofContour({x:(w.a.x+w.b.x)/2,y:(w.a.y+w.b.y)/2},contour)).map(w=>w.height);
    return{contour,base:Math.max(.5,...heights)};
  });
  footprintCache.set(walls,result);return result;
}
function triangulate(contour:RoofContour):[Point,Point,Point][]{
  const loops=[contour.outer,...contour.holes],all=loops.flat(),vectors=loops.map(loop=>loop.map(p=>new THREE.Vector2(p.x,p.y)));
  return THREE.ShapeUtils.triangulateShape(vectors[0],vectors.slice(1)).map(ids=>{
    let [a,b,c]=ids.map(i=>all[i]);if((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<0)[b,c]=[c,b];return[a,b,c];
  });
}
function clip(polygon:Point[],axis:"x"|"y",value:number,keepAbove:boolean):Point[]{
  const result:Point[]=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],d=(a[axis]-value)*(keepAbove?1:-1),e=(b[axis]-value)*(keepAbove?1:-1);
    if(d>=-EPS)result.push(a);if(d>EPS&&e<-EPS||d<-EPS&&e>EPS){const t=d/(d-e);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
  }
  return result;
}
function maxNormSegmentDistance(p:Point,a:Point,b:Point):number{
  const x=a.x-p.x,y=a.y-p.y,dx=b.x-a.x,dy=b.y-a.y,candidates=[0,1];
  for(const [num,den]of [[-x,dx],[-y,dy],[y-x,dx-dy],[-y-x,dx+dy]])if(Math.abs(den)>EPS){const t=num/den;if(t>0&&t<1)candidates.push(t);}
  return Math.min(...candidates.map(t=>Math.max(Math.abs(x+dx*t),Math.abs(y+dy*t))));
}
function clipHalfPlane(polygon:Point[],a:number,b:number,c:number):Point[]{
  const result:Point[]=[];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],d=a*p.x+b*p.y+c,e=a*q.x+b*q.y+c;
    if(d<=EPS)result.push(p);
    if(d>EPS&&e<-EPS||d<-EPS&&e>EPS){const t=d/(d-e);result.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}
  }
  return result;
}
function surfaceTriangles(contour:RoofContour,settings:RoofSettings):RoofTriangle[]{
  let u={x:1,y:0},longest=0;
  for(let i=0;i<contour.outer.length;i++){const a=contour.outer[i],b=contour.outer[(i+1)%contour.outer.length],length=Math.hypot(b.x-a.x,b.y-a.y);if(length>longest){longest=length;u={x:(b.x-a.x)/length,y:(b.y-a.y)/length};}}
  const v={x:-u.y,y:u.x},toLocal=(p:Point):Point=>({x:p.x*u.x+p.y*u.y,y:p.x*v.x+p.y*v.y}),toWorld=(p:Point):Point=>({x:p.x*u.x+p.y*v.x,y:p.x*u.y+p.y*v.y});
  const local:RoofContour={outer:contour.outer.map(toLocal),holes:contour.holes.map(h=>h.map(toLocal))},verts=local.outer;
  const minX=Math.min(...verts.map(p=>p.x)),maxX=Math.max(...verts.map(p=>p.x)),minY=Math.min(...verts.map(p=>p.y)),maxY=Math.max(...verts.map(p=>p.y));
  const faces=triangulate(local),loops=[local.outer,...local.holes];let rawTriangles:[Point,Point,Point][]=[];
  const ridgeAxis=settings.direction==="x"?"y":"x",middle=ridgeAxis==="x"?(minX+maxX)/2:(minY+maxY)/2;
  const rectangle=verts.length===4&&!local.holes.length&&verts.every(p=>(Math.abs(p.x-minX)<EPS||Math.abs(p.x-maxX)<EPS)&&(Math.abs(p.y-minY)<EPS||Math.abs(p.y-maxY)<EPS));
  if(settings.type==="hip"&&rectangle){
    // Split at exact hip lines so each of the four slopes is a single plane.
    const distances=[[1,0,-minX],[-1,0,maxX],[0,1,-minY],[0,-1,maxY]];
    for(const triangle of faces)for(const d of distances){
      let polygon:Point[]=triangle;
      for(const e of distances)polygon=clipHalfPlane(polygon,d[0]-e[0],d[1]-e[1],d[2]-e[2]);
      for(let i=1;i<polygon.length-1;i++)if(Math.abs(area([polygon[0],polygon[i],polygon[i+1]]))>EPS)rawTriangles.push([polygon[0],polygon[i],polygon[i+1]]);
    }
  }else if(settings.type==="hip"){
    const resolution=Math.max(12,Math.min(40,Math.floor(180/Math.sqrt(verts.length))));
    const span=Math.max(maxX-minX,maxY-minY),step=Math.max(.25,span/resolution),nx=Math.max(2,Math.ceil((maxX-minX)/step/2)*2),ny=Math.max(2,Math.ceil((maxY-minY)/step/2)*2),sx=(maxX-minX)/nx,sy=(maxY-minY)/ny;
    for(const triangle of faces){
      const firstX=Math.max(0,Math.floor((Math.min(...triangle.map(p=>p.x))-minX)/sx)),lastX=Math.min(nx-1,Math.floor((Math.max(...triangle.map(p=>p.x))-minX)/sx));
      const firstY=Math.max(0,Math.floor((Math.min(...triangle.map(p=>p.y))-minY)/sy)),lastY=Math.min(ny-1,Math.floor((Math.max(...triangle.map(p=>p.y))-minY)/sy));
      for(let x=firstX;x<=lastX;x++)for(let y=firstY;y<=lastY;y++){
        let p=clip(clip(clip(clip(triangle,"x",minX+x*sx,true),"x",minX+(x+1)*sx,false),"y",minY+y*sy,true),"y",minY+(y+1)*sy,false);
        if(p.length<3||Math.abs(area(p))<EPS)continue;
        const center={x:p.reduce((s,p)=>s+p.x,0)/p.length,y:p.reduce((s,p)=>s+p.y,0)/p.length};
        for(let i=0;i<p.length;i++)if(Math.abs(area([center,p[i],p[(i+1)%p.length]]))>EPS)rawTriangles.push([center,p[i],p[(i+1)%p.length]]);
      }
    }
  }else if(settings.type==="gable"){
    for(const triangle of faces)for(const side of [false,true]){
      const p=clip(triangle,ridgeAxis,middle,side);for(let i=1;i<p.length-1;i++)if(Math.abs(area([p[0],p[i],p[i+1]]))>EPS)rawTriangles.push([p[0],p[i],p[i+1]]);
    }
  }else rawTriangles=faces;
  const lift=(p:Point):number=>settings.type==="flat"?0:settings.type==="gable"?Math.max(0,1-Math.abs(p[ridgeAxis]-middle)/Math.max(EPS,ridgeAxis==="x"?(maxX-minX)/2:(maxY-minY)/2)):
    Math.min(...loops.flatMap(loop=>loop.map((a,i)=>maxNormSegmentDistance(p,a,loop[(i+1)%loop.length]))));
  const maximum=settings.type==="hip"?rawTriangles.reduce((m,t)=>Math.max(m,...t.map(lift)),EPS):1;
  return rawTriangles.map(t=>({points:t.map(toWorld) as [Point,Point,Point],lift:t.map(p=>settings.type==="flat"?0:settings.height*lift(p)/maximum) as [number,number,number]}));
}
const dataCache=new WeakMap<Wall[],Map<string,RoofData>>();
const EMPTY:RoofData={parts:[],maxHeight:0,area:0,triangleCount:0};
export function roofData(project:Pick<Project,"walls"|"roof">):RoofData{
  const settings=project.roof;if(!settings)return EMPTY;
  let cached=dataCache.get(project.walls);if(!cached){cached=new Map();dataCache.set(project.walls,cached);}
  const key=JSON.stringify({type:settings.type,height:settings.height,overhang:settings.overhang,direction:settings.direction}),found=cached.get(key);if(found)return found;
  const parts:RoofPart[]=[];
  for(const building of buildingFootprints(project.walls)){
    const paths=[intPath(building.contour.outer),...building.contour.holes.map(intPath)];
    for(const contour of contours(offset(paths,settings.overhang)))parts.push({contour,wallContour:building.contour,base:building.base,triangles:surfaceTriangles(contour,settings)});
  }
  const result:RoofData={parts,maxHeight:Math.max(0,...parts.map(p=>p.base+ROOF_THICKNESS+(settings.type==="flat"?0:settings.height))),
    area:parts.reduce((sum,p)=>sum+area(p.contour.outer)+p.contour.holes.reduce((s,h)=>s+area(h),0),0),triangleCount:parts.reduce((s,p)=>s+p.triangles.length,0)};
  cached.set(key,result);if(cached.size>12)cached.delete(cached.keys().next().value!);return result;
}
export function roofBottomAt(part:RoofPart,p:Point):number{
  for(const t of part.triangles){
    const[a,b,c]=t.points;if(p.x<Math.min(a.x,b.x,c.x)-EPS||p.x>Math.max(a.x,b.x,c.x)+EPS||p.y<Math.min(a.y,b.y,c.y)-EPS||p.y>Math.max(a.y,b.y,c.y)+EPS)continue;
    const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<EPS)continue;
    const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/det,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/det,w=1-u-v;
    if(u>=-EPS&&v>=-EPS&&w>=-EPS)return part.base+u*t.lift[0]+v*t.lift[1]+w*t.lift[2];
  }
  return Infinity;
}
export function roofLowRegions(project:Pick<Project,"walls"|"roof">,headTop:number):Point[][]{
  const result:Point[][]=[];
  for(const part of roofData(project).parts){
    if(part.base>=headTop)continue;
    for(const triangle of part.triangles){
      const polygon:Point[]=[];
      for(let i=0;i<3;i++){
        const a=triangle.points[i],b=triangle.points[(i+1)%3],ha=part.base+triangle.lift[i]-headTop,hb=part.base+triangle.lift[(i+1)%3]-headTop;
        if(ha<=0)polygon.push(a);if(ha*hb<0){const t=ha/(ha-hb);polygon.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
      }
      if(polygon.length>=3&&Math.abs(area(polygon))>EPS)result.push(polygon);
    }
  }
  return result;
}
