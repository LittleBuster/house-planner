import {test} from "node:test";
import assert from "node:assert/strict";
import {parseProject,resizeWallToBodyLength,wallAtOutsideLength,wallMeasuredLength,findRooms,type Point,type Wall,type Project} from "./model";
import {wallDrawingSegment} from "./wallConstraints";
import {wallBody,wallBodies,clipWallPolygon,polygonRayInterval} from "./wallBodies";
import {createWallPieceGeometry} from "./wallGeometry";
import {createColliders,movePerson} from "./walkPhysics";
import {rayObstacleDistance} from "./treeClearances";

const close=(a:number,b:number,tolerance=1e-6)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const wall=(id:string,ax:number,ay:number,bx:number,by:number,thickness=.22):Wall=>({id,a:{x:ax,y:ay},b:{x:bx,y:by},thickness,height:2.8});
const fixture=():Project=>({version:1,name:"Торцы впритык",walls:[wall("top",-.9,4.2,5.4,4.2),wall("bottom",.8,6.4,3.5,6.4,.25),wall("branch",.8,4.2,.8,6.4)],openings:[]});
const area=(p:Point[])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a.x*b.y-a.y*b.x;},0))/2;
function overlap(a:Point[],b:Point[]){for(let i=0;i<b.length;i++){const p=b[i],q=b[(i+1)%b.length],n={x:p.y-q.y,y:q.x-p.x};a=clipWallPolygon(a,n,n.x*p.x+n.y*p.y);}return area(a);}
test("the reported 2.2 m partition is exactly 1.965 m between 22 and 25 cm wall faces without changing saved layout",()=>{
  const p=fixture(),before=JSON.stringify(p),b=wallBody(p.walls[2],p.walls);
  close(b.length,1.965);close(b.a.y,4.31);close(b.b.y,6.275);
  for(const host of p.walls.slice(0,2))close(overlap(b.polygon,wallBody(host,p.walls).polygon),0);
  assert.equal(JSON.stringify(p),before);const loaded=parseProject(before);close(wallBody(loaded.walls[2],loaded.walls).length,1.965);
});
test("shared corners assign their material once and remain closed without overlapping selected wall bodies",()=>{
  const p=fixture(),bodies=wallBodies(p.walls),bottom=bodies.get("bottom")!,branch=bodies.get("branch")!;
  close(overlap(bottom.polygon,branch.polygon),0);close(bottom.a.x,.69);close(branch.b.y,6.275);
  const rectangle=[wall("top",0,0,6,0),wall("right",6,0,6,4),wall("bottom",6,4,0,4),wall("left",0,4,0,0)];
  const shapes=wallBodies(rectangle);for(let i=0;i<rectangle.length;i++)for(let j=0;j<i;j++)close(overlap(shapes.get(rectangle[i].id)!.polygon,shapes.get(rectangle[j].id)!.polygon),0);
  close(findRooms(rectangle)[0].area,24);
  const straight=[wall("first",0,0,4,0),wall("next",4,0,8,.001)],s=wallBodies(straight);
  close(overlap(s.get("first")!.polygon,s.get("next")!.polygon),0);assert(s.get("first")!.length<4.01);assert(s.get("next")!.length<4.01);
});
test("oblique, rotated, reversed and thicker branches end at the host surface rather than entering its material",()=>{
  const original=[wall("host",-5,0,5,0,.2),wall("branch",2,4,0,0,.5)];
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI*.37]){
    const transform=(p:Point)=>({x:3+p.x*Math.cos(angle)-p.y*Math.sin(angle),y:-2+p.x*Math.sin(angle)+p.y*Math.cos(angle)});
    const walls=original.map(w=>({...w,a:transform(w.a),b:transform(w.b)}));
    for(const reverse of [false,true]){
      if(reverse)[walls[1].a,walls[1].b]=[walls[1].b,walls[1].a];
      const host=wallBody(walls[0],walls),branch=wallBody(walls[1],walls);close(overlap(host.polygon,branch.polygon),0);
      const n={x:-Math.sin(angle),y:Math.cos(angle)},origin=transform({x:0,y:0});
      assert(branch.polygon.every(p=>(p.x-origin.x)*n.x+(p.y-origin.y)*n.y>=.1-1e-7));
    }
  }
});
test("free wall ends have no hidden square caps and their measured length equals their material",()=>{
  const w=wall("free",0,0,2.2,0),b=wallBody(w,[w]);close(b.start,0);close(b.end,2.2);close(b.length,2.2);close(area(b.polygon),2.2*.22);
  const interval=polygonRayInterval({x:3,y:0},{x:-1,y:0},b.polygon)!;close(interval.near,.8);
});
test("3D plaster uses the same face cuts as the plan, with matching height, footprint and volume",()=>{
  const p=fixture(),w=p.walls[2],b=wallBody(w,p.walls),g=createWallPieceGeometry(w,b,b.min,b.max,0,w.height)!;
  g.computeBoundingBox();const bounds=g.boundingBox!;close(bounds.min.z,4.31);close(bounds.max.z,6.275);close(bounds.max.y,2.8);close(bounds.min.y,0);
  const v=g.attributes.position;let volume=0;
  for(let i=0;i<v.count;i+=3){
    const ax=v.getX(i),ay=v.getY(i),az=v.getZ(i),bx=v.getX(i+1),by=v.getY(i+1),bz=v.getZ(i+1),cx=v.getX(i+2),cy=v.getY(i+2),cz=v.getZ(i+2);
    volume+=ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx);
  }
  close(Math.abs(volume)/6,1.965*.22*2.8,1e-5);g.dispose();
});
test("older near-contact endpoints formerly covered by square caps now meet the actual face without a new gap",()=>{
  const walls=[wall("host",-4,9.3,6,9.3),wall("branch",3.5,6.4,3.5,9.1,.25)],b=wallBody(walls[1],walls);
  close(b.b.y,9.19);close(overlap(b.polygon,wallBody(walls[0],walls).polygon),0);close(walls[1].b.y,9.1);
});
test("turning from a finished wall cap keeps its physical and exterior lengths, with a flush branch",()=>{
 const top=wall("top",-3.6,0,0,0),vertical=wall("vertical",0,0,0,1.6),walls=[top,vertical];
 const before=wallBody(vertical,walls);
 close(before.length,1.49);
 const branch={...wall("branch",0,1.6,2.1,1.6),...wallDrawingSegment(vertical.b,{x:2.1,y:1.6},walls,.22)};
 const next=[...walls,branch],body=wallBody(branch,next);
 assert.deepEqual(wallBody(vertical,next),before);
 close(body.a.x,.11);close(body.length,1.99);
 close(Math.max(...body.polygon.map(p=>p.y)),1.6);
 close(overlap(body.polygon,before.polygon),0);
 const exact=wallAtOutsideLength(walls,branch,2.2)!;
 close(wallMeasuredLength(exact,[...walls,exact],true),2.2);
 assert.deepEqual(wallBody(vertical,[...walls,exact]),before);
 const loaded=parseProject(JSON.stringify({version:1,name:"Точный торец",walls:next,openings:[]}));
 assert.deepEqual(wallBody(loaded.walls[1],loaded.walls),before);
});
test("a branch started slightly inside the cap does not trim or extend its host",()=>{
 const host=wall("host",0,0,0,1.6,.3),branch=wall("branch",0,1.57,-2,1.57,.4);
 for(const walls of [[host,branch],[branch,host]]){
   const old=wallBody(host,[host]),body=wallBody(branch,walls);
   assert.deepEqual(wallBody(host,walls),old);
   close(body.a.x,-.15);close(overlap(body.polygon,old.polygon),0);
 }
});
test("a chain of flush corners stays orthogonal and closes a room",()=>{
 let walls=[wall("top",0,0,6,0)];
 const targets=[{x:6,y:4},{x:0,y:4},{x:0,y:0}];
 for(const [i,target] of targets.entries()){
   const last=walls[walls.length-1],end={...target};
   if(i===1)end.y=last.b.y;
   if(i===2)end.x=last.b.x;
   const segment=wallDrawingSegment(last.b,end,walls,.22);
   walls=[...walls,{...wall("side"+i,0,0,1,0),...segment}];
 }
 const rooms=findRooms(walls);
 assert.equal(rooms.length,1);
 assert(rooms[0].area>20);
 assert(walls.every(w=>w.a.x===w.b.x||w.a.y===w.b.y));
});
test("typed wall lengths use the face-to-face measurement and respect fixed hosts",()=>{
  const p=fixture();p.walls[1].a.x=-2;
  const next=resizeWallToBodyLength(p,"branch",2.2);close(wallBody(next.walls[2],next.walls).length,1.965);
  const free:Project={version:1,name:"Свободная",walls:[wall("free",0,0,2,0)],openings:[]};
  const resized=resizeWallToBodyLength(free,"free",3.7);close(wallBody(resized.walls[0],resized.walls).length,3.7);close(resized.walls[0].b.x,3.7);
  const corner:Project={...free,walls:[wall("free",0,0,4,0),wall("next",4,0,4,3)]};
  const changed=resizeWallToBodyLength(corner,"free",5);close(wallBody(changed.walls[0],changed.walls).length,5,.0002);
});
test("walk collisions and distance rays follow the trimmed material without invisible protruding end caps",()=>{
  const p:Project={version:1,name:"Физика стыка",walls:[wall("host",-3,0,3,0,.2),wall("branch",0,2,0,0,.5)],openings:[]};
  const end=movePerson({x:-1,y:-.4},{x:2,y:0},createColliders(p));close(end.x,1);close(end.y,-.4);
  const free:Project={...p,walls:[wall("free",0,0,2.2,0)]},colliders=createColliders(free,0);
  close(Math.min(...colliders.map(c=>rayObstacleDistance({x:3,y:0},{x:-1,y:0},c))),.8);
});
