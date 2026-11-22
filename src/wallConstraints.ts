import type {Point, Project, Wall} from "./model";
import {snapSitePoint} from "./siteGrid";
import {cornerInset,wallBodies} from "./wallBodies";

const EPS=1e-8, JOIN_EPS=.001, MIN_LENGTH=.2;
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y});
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const length=(p:Point)=>Math.hypot(p.x,p.y);
const at=(a:Point,d:Point,t:number):Point=>({x:a.x+d.x*t,y:a.y+d.y*t});
const same=(a:Point,b:Point,tolerance=EPS)=>length(sub(a,b))<tolerance;
function projectToSegment(p:Point,w:Wall):Point {
  const d=sub(w.b,w.a),t=Math.max(0,Math.min(1,dot(sub(p,w.a),d)/dot(d,d)));
  return at(w.a,d,t);
}

// Test the pointer against the actual ends before rounding it to the grid.
// When a direction is locked, only joints on that line can capture the end.
export function snapWallPoint(raw:Point,walls:Wall[],unit:number,snap:boolean,anchor:Point|null=null,orthogonal=false,thickness=0,origin?:Point):Point {
  const delta=anchor?sub(raw,anchor):null;
  const locked=delta&&(orthogonal||Math.min(Math.abs(delta.x),Math.abs(delta.y))<10*unit)
    ? Math.abs(delta.x)<Math.abs(delta.y)?"x":"y" : null;
  const grid=snap?(origin?at(origin,snapSitePoint(sub(raw,origin)),1):snapSitePoint(raw)):{...raw};
  if(locked)grid[locked]=anchor![locked];
  if(snap){
    let best:Point|null=null,bestDistance=Infinity;
    for(const wall of walls){
      const radius=Math.max(14*unit,(thickness+wall.thickness)/2+5*unit);
      for(const end of [wall.a,wall.b]){
        const d=length(sub(end,raw));
        if(d<radius&&d<bestDistance&&(!anchor||!same(end,anchor,JOIN_EPS))&&
          (!locked||Math.abs(end[locked]-anchor![locked])<EPS)){
          best=end;bestDistance=d;
        }
      }
    }
    if(best)return {...best};
    for(const wall of walls){
      const near=projectToSegment(raw,wall),d=length(sub(raw,near));
      if(d>=Math.max(7*unit,wall.thickness/2+unit)||d>=bestDistance)continue;
      let point=projectToSegment(grid,wall);
      if(locked){
        const span=wall.b[locked]-wall.a[locked];
        if(Math.abs(span)<EPS)continue;
        const t=(anchor![locked]-wall.a[locked])/span;
        if(t<0||t>1)continue;
        point=at(wall.a,sub(wall.b,wall.a),t);
        if(length(sub(point,raw))>Math.max(14*unit,wall.thickness/2+5*unit))continue;
      }
      if(anchor&&same(point,anchor,JOIN_EPS))continue;
      best=point;bestDistance=d;
    }
    if(best)return best;
  }
  return {x:Math.max(-500,Math.min(500,grid.x)),y:Math.max(-500,Math.min(500,grid.y))};
}

// Clicking the wall itself sets the position along it. Snap to the host
// axis even with the grid disabled so a new wall can start on either face.
export function wallDrawingStart(raw:Point,walls:Wall[],unit:number,snap:boolean,thickness:number):Point {
  let hit:{wall:Wall;point:Point;distance:number}|null=null;
  const bodies=wallBodies(walls);
  for(const wall of walls){
    const {polygon}=bodies.get(wall.id)!;
    if(polygon.length<3||!polygon.every((p,i)=>cross(sub(polygon[(i+1)%polygon.length],p),sub(raw,p))>=-EPS))continue;
    const point=projectToSegment(raw,wall),distance=length(sub(point,raw));
    if(!hit||distance<hit.distance)hit={wall,point,distance};
  }
  if(!hit)return snapWallPoint(raw,walls,unit,snap,null,false,thickness);
  const {wall,point}=hit;
  if(!snap)return point;
  const ends=[wall.a,wall.b],corner=ends.find(end=>same(end,point,Math.min(4*unit,.05)));
  if(corner)return {...corner};
  const onGrid=projectToSegment(snapSitePoint(raw),wall);
  // Preserve a deliberate inset even if the nearest grid line is at the end.
  return ends.some(end=>same(end,onGrid,JOIN_EPS))?point:onGrid;
}

function interiorBranchContact(a:Point,b:Point,wall:Wall):boolean {
  const r=sub(b,a),s=sub(wall.b,wall.a),q=sub(wall.a,a),den=cross(r,s);
  if(Math.abs(den)<EPS*length(r)*length(s))return false;
  const t=cross(q,s)/den,u=cross(q,r)/den;
  return t>EPS&&t<1-EPS&&(Math.abs(u)<EPS||Math.abs(u-1)<EPS);
}

// Walls meet by their axes, as do the existing length and room measurements.
// Contact at the starting point is allowed; a positive collinear overlap is not.
export function wallEndAtFirstContact(start:Point,end:Point,walls:Wall[],thickness:number):Point {
  const r=sub(end,start),rr=dot(r,r),rLength=Math.sqrt(rr);
  if(rLength<EPS)return {...start};
  let limit=1;
  for(const wall of walls){
    const s=sub(wall.b,wall.a),sLength=length(s),q=sub(wall.a,start),den=cross(r,s);
    if(Math.abs(den)>EPS*rLength*sLength){
      const t=cross(q,s)/den,u=cross(q,r)/den;
      if(t>EPS&&t<=limit+EPS&&u>=-EPS&&u<=1+EPS)limit=Math.max(0,Math.min(limit,t));
    }else{
      // Parallel walls inside the same strip must not hide extra length either.
      const separation=Math.abs(cross(q,r))/rLength;
      if(separation>Math.max(JOIN_EPS,(thickness+wall.thickness)/2-JOIN_EPS))continue;
      const a=dot(q,r)/rr,b=dot(sub(wall.b,start),r)/rr;
      const lo=Math.max(0,Math.min(a,b)),hi=Math.min(limit,Math.max(a,b));
      if(hi-lo>EPS)limit=Math.min(limit,lo);
    }
  }
  return at(start,r,limit);
}

export function wallCapAnchor(host:Wall,cap:"a"|"b",direction:Point,thickness:number,walls:Wall[]):Point|null {
  if(!same(wallBodies(walls).get(host.id)![cap],host[cap],JOIN_EPS))return null;
  const inward=sub(host[cap==="a"?"b":"a"],host[cap]),hostLength=length(inward);
  const u=at({x:0,y:0},inward,1/hostLength);
  if(Math.abs(cross(u,direction))<1e-6)return null;
  // Position the branch axis so its edge reaches the host's existing cap.
  const inset=Math.min(hostLength/2,Math.max(2*JOIN_EPS,cornerInset(u,direction,host.thickness,thickness)));
  return at(host[cap],u,inset);
}

export function wallDrawingSegment(start:Point,target:Point,walls:Wall[],thickness:number):Pick<Wall,"a"|"b"> {
  let a=start,end=target;
  const delta=sub(target,start),span=length(delta);
  const attached=walls.filter(w=>same(projectToSegment(start,w),start,JOIN_EPS));
  if(span>EPS&&attached.length===1){
    const host=attached[0],cap=same(start,host.a,JOIN_EPS)?"a":same(start,host.b,JOIN_EPS)?"b":null;
    const anchor=cap&&wallCapAnchor(host,cap,at({x:0,y:0},delta,1/span),thickness,walls);
    if(anchor){a=anchor;end=at(a,delta,1);}
  }
  return {a,b:wallEndAtFirstContact(a,end,walls,thickness)};
}

// A shared corner is one moving node. Walls with that node as an endpoint move
// together; a wall containing the node in its middle stays fixed and guides it.
export function constrainWallEndpoint(project:Project,id:string,endpoint:"a"|"b",requested:Point):Point {
  const selected=project.walls.find(w=>w.id===id);
  if(!selected||!Number.isFinite(requested.x)||!Number.isFinite(requested.y))return selected?{...selected[endpoint]}:{...requested};
  const original=selected[endpoint];
  const incident=project.walls.filter(w=>same(w.a,original,JOIN_EPS)||same(w.b,original,JOIN_EPS));
  const movingIds=new Set(incident.map(w=>w.id)),fixed=project.walls.filter(w=>!movingIds.has(w.id));
  const hosts=fixed.filter(w=>same(projectToSegment(original,w),original,JOIN_EPS));
  if(hosts.some((w,i)=>hosts.slice(0,i).some(v=>Math.abs(cross(sub(w.b,w.a),sub(v.b,v.a)))>EPS*length(sub(w.b,w.a))*length(sub(v.b,v.a)))))return {...original};
  const anchors=incident.map(w=>{
    const point=same(w.a,original,JOIN_EPS)?w.b:w.a;
    // A partition already meeting the middle of this wall is not a new end
    // barrier. The endpoint's own swept path still stops at it when shrinking.
    return {wall:w,point,barriers:fixed.filter(other=>!interiorBranchContact(point,original,other))};
  });
  const guide=(p:Point)=>hosts.reduce((q,w)=>projectToSegment(q,w),p);
  let next=guide(requested);
  const pathWalls=fixed.filter(w=>!hosts.includes(w));
  for(let iteration=0;iteration<12;iteration++){
    const before=next;
    for(const {wall,point,barriers}of anchors)next=wallEndAtFirstContact(point,next,barriers,wall.thickness);
    next=guide(wallEndAtFirstContact(original,next,pathWalls,selected.thickness));
    // Do not let a large pointer jump pass through an opposite endpoint and
    // invert a neighbouring wall. Leave at least 20 cm of each incident wall.
    for(const {point}of anchors){
      const delta=sub(next,original),a=dot(delta,delta),offset=sub(original,point),minimum=Math.min(MIN_LENGTH,length(offset));
      if(a<EPS)continue;
      const b=2*dot(offset,delta),c=Math.max(0,dot(offset,offset)-minimum*minimum),discriminant=b*b-4*a*c;
      if(discriminant>=0){
        const t=(-b-Math.sqrt(discriminant))/(2*a);
        if(t>=-EPS&&t<1&&b<0)next=at(original,delta,Math.max(0,t));
      }
    }
    if(same(next,before))break;
  }
  // In dense junctions an incompatible set of constraints keeps the old node.
  for(const {wall,point,barriers}of anchors){
    if(length(sub(next,point))<Math.min(MIN_LENGTH,length(sub(original,point)))-EPS ||
      !same(wallEndAtFirstContact(point,next,barriers,wall.thickness),next,1e-6))return {...original};
  }
  if(hosts.some(w=>!same(projectToSegment(next,w),next,JOIN_EPS)))return {...original};
  for(let i=0;i<anchors.length;i++)for(let j=0;j<i;j++){
    const a=sub(anchors[i].point,next),b=sub(anchors[j].point,next);
    if(Math.abs(cross(a,b))<EPS*length(a)*length(b)&&dot(a,b)>EPS)return {...original};
  }
  return next;
}
