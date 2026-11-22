import {test} from "node:test";
import assert from "node:assert/strict";
import {resizeWall,resizeWallToMeasuredLength,wallAtOutsideLength,wallMeasuredLength,parseProject,wallLength,findRooms,type Wall,type Project,type Point} from "./model";
import {constrainWallEndpoint,snapWallPoint,wallDrawingStart,wallEndAtFirstContact} from "./wallConstraints";
import {wallBody} from "./wallBodies";
import {moveWall} from "./wallMovement";

const wall=(id:string,ax:number,ay:number,bx:number,by:number,thickness=.2):Wall=>({id,a:{x:ax,y:ay},b:{x:bx,y:by},thickness,height:2.8});
const project=(walls:Wall[]):Project=>({version:1,name:"Стыки стен",walls,openings:[]});
const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const point=(p:Point,x:number,y:number)=>{close(p.x,x);close(p.y,y);};
test("new walls stop at the nearest crossing even when a pointer skips past several walls",()=>{
  const walls=[wall("near",3,-2,3,4),wall("far",5,-3,5,4)];
  point(wallEndAtFirstContact({x:0,y:0},{x:8,y:0},walls,.2),3,0);
  point(wallEndAtFirstContact({x:8,y:0},{x:0,y:0},walls,.2),5,0);
  point(wallEndAtFirstContact({x:0,y:0},{x:2,y:0},walls,.2),2,0);
});
test("positive collinear or hidden parallel overlaps are blocked, while continuing away from a joint is allowed",()=>{
  const walls=[wall("host",0,0,6,0)];
  point(wallEndAtFirstContact({x:6,y:0},{x:2,y:0},walls,.2),6,0);
  point(wallEndAtFirstContact({x:-2,y:0},{x:4,y:0},walls,.2),0,0);
  point(wallEndAtFirstContact({x:2,y:.1},{x:5,y:.1},walls,.2),2,.1);
  point(wallEndAtFirstContact({x:6,y:0},{x:9,y:0},walls,.2),9,0);
  point(wallEndAtFirstContact({x:3,y:0},{x:3,y:4},walls,.2),3,4);
  point(wallEndAtFirstContact({x:0,y:1},{x:6,y:1},walls,.2),6,1);
});
test("a free wall endpoint stops at the next wall during dragging or typed length changes",()=>{
  const p=project([wall("branch",0,0,2,0),wall("host",4,-2,4,3)]),before=structuredClone(p);
  const next=resizeWall(p,"branch",{b:{x:9,y:0}});point(next.walls[0].b,4,0);close(wallLength(next.walls[0]),4);
  assert.deepEqual(next.walls[1],p.walls[1]);assert.deepEqual(p,before);assert.deepEqual(parseProject(JSON.stringify(next)),next);
});
test("editing an older overshooting endpoint trims it back to the crossed host instead of extending hidden length",()=>{
  const p=project([wall("branch",0,0,8,0),wall("host",6,-2,6,3)]);
  assert.deepEqual(parseProject(JSON.stringify(p)),p);
  const next=resizeWall(p,"branch",{b:{x:12,y:0}});point(next.walls[0].b,6,0);close(wallLength(next.walls[0]),6);
  point(next.walls[1].a,6,-2);point(next.walls[1].b,6,3);point(p.walls[0].b,8,0);
});
test("T-junction endpoints remain attached, slide along their host, and stop at its ends",()=>{
  const p=project([wall("branch",3,4,3,0),wall("host",0,0,8,0)]);
  for(const y of [-100,-1,1,100])point(constrainWallEndpoint(p,"branch","b",{x:3,y}),3,0);
  point(constrainWallEndpoint(p,"branch","b",{x:5,y:-3}),5,0);
  point(constrainWallEndpoint(p,"branch","b",{x:20,y:-3}),8,0);
  point(constrainWallEndpoint(p,"branch","b",{x:-20,y:3}),0,0);
  const next=resizeWall(p,"branch",{b:{x:3,y:-9}});close(wallLength(next.walls[0]),4);assert.deepEqual(next.walls[1],p.walls[1]);
});
test("the other endpoint can shorten a connected wall without letting its attached end move",()=>{
  const p=project([wall("branch",3,4,3,0),wall("host",0,0,8,0)]);
  const short=resizeWall(p,"branch",{a:{x:3,y:2}});point(short.walls[0].a,3,2);point(short.walls[0].b,3,0);close(wallLength(short.walls[0]),2);
  const inverted=resizeWall(p,"branch",{a:{x:3,y:-10}});close(wallLength(inverted.walls[0]),.2);point(inverted.walls[0].b,3,0);
});
test("shared corners still move together but a joined collinear wall cannot reverse and overlap its neighbour",()=>{
  const p=project([wall("left",0,0,3,0),wall("right",3,0,6,0)]);
  const next=resizeWall(p,"left",{b:{x:10,y:0}});point(next.walls[0].b,5.8,0);point(next.walls[1].a,5.8,0);close(wallLength(next.walls[1]),.2);
  const rectangle=project([wall("top",0,0,6,0),wall("right",6,0,6,4),wall("bottom",6,4,0,4),wall("left",0,4,0,0)]);
  const widened=resizeWall(rectangle,"top",{b:{x:7,y:0}});point(widened.walls[1].a,7,0);close(findRooms(widened.walls)[0].area,26);
});
test("existing interior junctions do not truncate a host wall on extension; shrinking stops at the branch",()=>{
  const p=project([wall("host",0,0,8,0),wall("branch",4,0,4,4)]);
  point(resizeWall(p,"host",{b:{x:10,y:0}}).walls[0].b,10,0);
  point(resizeWall(p,"host",{b:{x:2,y:0}}).walls[0].b,4,0);
  assert.deepEqual(resizeWall(p,"host",{height:3}).walls[0].b,p.walls[0].b);
});
test("constraints follow rotated and reversed walls and keep multiple fixed host intersections pinned",()=>{
  const p=project([wall("branch",3,4,3,0),wall("host",0,0,8,0)]);
  for(const angle of [Math.PI/2,Math.PI,-Math.PI*.37]){
    const transform=(p:Point)=>({x:2+p.x*Math.cos(angle)-p.y*Math.sin(angle),y:-4+p.x*Math.sin(angle)+p.y*Math.cos(angle)});
    const rotated=project(p.walls.map(w=>({...w,a:transform(w.a),b:transform(w.b)})));
    const actual=constrainWallEndpoint(rotated,"branch","b",transform({x:5,y:-8})),expected=transform({x:5,y:0});point(actual,expected.x,expected.y);
    [rotated.walls[0].a,rotated.walls[0].b]=[rotated.walls[0].b,rotated.walls[0].a];point(constrainWallEndpoint(rotated,"branch","a",transform({x:5,y:-8})),expected.x,expected.y);
  }
  p.walls.push(wall("second-host",3,-3,3,3));point(constrainWallEndpoint(p,"branch","b",{x:7,y:7}),3,0);
});
test("ends snap before grid rounding, including an off-grid corner, without skewing the drawing direction",()=>{
 const top=wall("top",.017,2,12.007,2,.22);
 point(snapWallPoint({x:.117,y:2.2},[top],1/65,true,null,false,.22),.017,2);
 point(snapWallPoint({x:12.04,y:1.91},[top],1/90,true,{x:12.007,y:-1},true,.22),12.007,2);
 const host=wall("host",2.3,0,2.3,5);
 point(snapWallPoint({x:2.28,y:2.11},[host],1/95,true,{x:0,y:2.097}),2.3,2.097);
 point(snapWallPoint({x:5.018,y:2.004},[],1/95,true,{x:0,y:2},false,.22,{x:5.005,y:2}),5.015,2);
});
test("drawing from within a host keeps an inset and starts beyond either face with or without the grid",()=>{
 const host=wall("top",0,2,11.99,2,.22),walls=[host];
 point(wallDrawingStart({x:.12,y:2.08},walls,1/95,true,.22),.12,2);
 point(wallDrawingStart({x:.03,y:2.06},walls,1/220,true,.22),.03,2);
 point(wallDrawingStart({x:.01,y:2.08},walls,1/95,true,.22),0,2);
 point(wallDrawingStart({x:.096,y:2.17},walls,1/95,true,.22),0,2);
 for(const y of [1.94,2.08]){
   const start=wallDrawingStart({x:3.14,y},walls,1/95,false,.22);
   point(start,3.14,2);
   const end=wallEndAtFirstContact(start,{x:3.14,y:4.4},walls,.22);
   point(end,3.14,4.4);
   const branch={...wall("branch",3.14,2,3.14,4.4,.22),a:start,b:end};
   const body=wallBody(branch,[host,branch]);
   close(body.a.y,2.11);
   close(body.length,2.29);
 }
 const diagonal=wall("diagonal",0,0,4,4);
 point(wallDrawingStart({x:2.05,y:1.95},[diagonal],1/95,false,.22),2,2);
});
test("repairing an old offset corner and typing exterior dimensions keeps a precise square joint",()=>{
 const p=project([wall("top",0,2,11.99,2,.22),wall("side",.1,2.2,.1,2.8,.22)]);
 const moved=moveWall(p,"side",{x:-.08,y:-.14},1/95,true);
 point(moved.walls[1].a,.11,2);
 close(wallBody(moved.walls[1],moved.walls).length,wallBody(p.walls[1],p.walls).length);
 assert.deepEqual(wallBody(moved.walls[0],moved.walls),wallBody(p.walls[0],p.walls));
 const top=resizeWallToMeasuredLength(moved,"top",11.99,true);
 const sized=resizeWallToMeasuredLength(top,"side",8.645,true);
 point(sized.walls[1].a,.11,2);
 close(wallMeasuredLength(sized.walls[0],sized.walls,true),11.99);
 close(wallMeasuredLength(sized.walls[1],sized.walls,true),8.645);
 close(wallMeasuredLength(sized.walls[1],[...sized.walls].reverse(),true),8.645);
 const reversed=project([sized.walls[0],{...sized.walls[1],a:sized.walls[1].b,b:sized.walls[1].a}]);
 const resized=resizeWallToMeasuredLength(reversed,"side",7.83,true);
 point(resized.walls[1].b,.11,2);
 close(wallMeasuredLength(resized.walls[1],resized.walls,true),7.83);
});
test("drawing a wall by typed exterior length includes the neighboring corner and stops at existing walls",()=>{
 const top=wall("top",0,2,11.99,2,.22),side=wall("side",0,2,0,2.7,.22);
 const exact=wallAtOutsideLength([top],side,8.645)!;
 point(exact.b,0,10.535);
 close(wallMeasuredLength(exact,[top,exact],true),8.645);
 assert.equal(wallAtOutsideLength([top,wall("stop",-3,5,3,5)],side,8.645),null);
});
test("moving a wall keeps its openings, slides attached ends and stops at unrelated walls",()=>{
 const rectangle=project([wall("top",0,0,8,0),wall("right",8,0,8,5),wall("bottom",8,5,0,5),wall("left",0,5,0,0)]);
 const window={id:"window",wallId:"top",kind:"window" as const,offset:2.3,width:1,height:1,sill:.9};
 rectangle.openings.push(window);
 const shifted=moveWall(rectangle,"top",{x:2,y:1.25},.01,false);
 point(shifted.walls[0].a,0,1.25);point(shifted.walls[0].b,8,1.25);
 point(shifted.walls[1].a,8,1.25);point(shifted.walls[3].b,0,1.25);
 close(findRooms(shifted.walls)[0].area,30);
 assert.deepEqual(shifted.openings,[window]);
 const p=project([wall("free",0,0,4,0),wall("obstacle",1,2,3,2)]);
 const blocked=moveWall(p,"free",{x:0,y:5},.01,false);
 point(blocked.walls[0].a,0,1.8);point(blocked.walls[0].b,4,1.8);
 const guides=project([wall("top",0,0,5,0),wall("bottom",1,5,7,5),wall("branch",3,0,3,5)]);
 const end=moveWall(guides,"branch",{x:8,y:1},.01,false);
 point(end.walls[2].a,4.9,0);point(end.walls[2].b,4.9,5);
 const fine=moveWall(project([p.walls[0]]),"free",{x:.016,y:-.014},.01,true);
 point(fine.walls[0].a,.02,-.01);point(fine.walls[0].b,4.02,-.01);
});
test("wall dragging snaps to the host's actual cap with off-grid thickness and keeps the old face joint length",()=>{
 const p=project([wall("top",0,2,11.99,2,.22),wall("bottom",0,10.9,11.99,10.9,.22),wall("side",.2,2.2,.2,10.55,.22)]);
 const window={id:"side-window",wallId:"side",kind:"window" as const,offset:3,width:1.1,height:1,sill:.9};
 p.openings.push(window);
 const old=p.walls[2],original=wallBody(old,p.walls);
 for(const dx of [-.04,-.2,-5]){
   const moved=moveWall(p,"side",{x:dx,y:-.15},1/142,true),side=moved.walls[2],body=wallBody(side,moved.walls);
   point(side.a,.11,2);point(side.b,.11,10.55);
   close(body.length,original.length);
   close(Math.min(...body.polygon.map(p=>p.x)),0);
   assert.deepEqual(wallBody(moved.walls[0],moved.walls),wallBody(p.walls[0],p.walls));
   close(side.a.y+moved.openings[0].offset,old.a.y+window.offset);
   assert.deepEqual(parseProject(JSON.stringify(moved)),moved);
 }
 const attached=project([p.walls[0],wall("side",.35,2,.35,8,.26)]);
 point(moveWall(attached,"side",{x:-.19,y:0},1/100,true).walls[1].a,.13,2);
 point(moveWall(attached,"side",{x:-4,y:0},1/100,false).walls[1].a,.13,2);
 const free=project([p.walls[0],wall("side",.25,2.25,.25,8,.22)]);
 point(moveWall(free,"side",{x:-.13,y:-.1},1/100,true).walls[1].a,.11,2);
});
