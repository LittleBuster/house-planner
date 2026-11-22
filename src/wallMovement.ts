import { canPlaceOpening, distance, projectToWall, wallLength, type Point, type Project, type Wall } from "./model";
import { snapSitePoint } from "./siteGrid";
import { snapWallPoint, wallCapAnchor, wallEndAtFirstContact } from "./wallConstraints";
import { wallBody } from "./wallBodies";

const EPS=.000001, JOIN=.001;
const sub=(a:Point,b:Point)=>({x:a.x-b.x,y:a.y-b.y});
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const offset=(p:Point,d:Point,t=1)=>({x:p.x+d.x*t,y:p.y+d.y*t});
const axis=(w:Wall)=>offset({x:0,y:0},sub(w.b,w.a),1/wallLength(w));
const normal=(p:Point)=>({x:-p.y,y:p.x});
const ends=["a","b"] as const;
const inward=(dir:Point,end:"a"|"b")=>end==="a"?dir:{x:-dir.x,y:-dir.y};

// Some older plans have an actual face joint but an axis endpoint short of
// the host. Bring that endpoint onto the host axis along the branch line.
function normalizeFaceJoins(project:Project,wall:Wall):Project {
  const body=wallBody(wall,project.walls),dir=axis(wall),axisLength=wallLength(wall);
  const next={...wall};
  for(const end of ends){
    const terminal=end==="a"?0:axisLength,face=end==="a"?body.start:body.end;
    if(project.walls.some(host=>host!==wall&&projectToWall(wall[end],host).distance<JOIN))continue;
    for(const host of project.walls){
      if(host===wall)continue;
      const u=axis(host),sin=cross(dir,u);
      if(Math.abs(sin)<EPS)continue;
      const t=cross(sub(host.a,wall.a),u)/sin;
      const point=offset(wall.a,dir,t),along=dot(sub(point,host.a),u);
      const side=t+(end==="a"?1:-1)*host.thickness/(2*Math.abs(sin));
      if(along<=JOIN||along>=wallLength(host)-JOIN||Math.abs(side-face)>=JOIN||Math.abs(t-terminal)<JOIN)continue;
      next[end]=point;
      break;
    }
  }
  if(next.a===wall.a&&next.b===wall.b||dot(sub(next.b,next.a),dir)<.1)return project;
  const startShift=dot(sub(next.a,wall.a),dir);
  const walls=project.walls.map(w=>w===wall?next:w);
  const openings=project.openings.map(o=>o.wallId===wall.id&&Math.abs(startShift)>EPS?{...o,offset:o.offset-startShift}:o);
  const normalized={...project,walls,openings};
  return openings.some(o=>o.wallId===wall.id&&!canPlaceOpening(normalized,o,o.id))?project:normalized;
}

function sweepLimit(wall:Wall,delta:Point,other:Wall) {
  const u=axis(wall),v=axis(other),n=normal(u),m=normal(v);
  let enter=-Infinity,exit=Infinity;
  for(const direction of [u,n,v,m]){
    const range=(w:Wall,side:Point)=>{
      const a=dot(w.a,direction),b=dot(w.b,direction),pad=Math.abs(dot(direction,side))*w.thickness/2;
      return [Math.min(a,b)-pad,Math.max(a,b)+pad];
    };
    const [a,b]=range(wall,n),[c,d]=range(other,m),speed=dot(delta,direction);
    if(Math.abs(speed)<EPS){
      if(b<=c+EPS||d<=a+EPS)return 1;
      continue;
    }
    const first=(c-b)/speed,last=(d-a)/speed;
    enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));
  }
  // Previously intersecting walls may move away from the intersection.
  return enter>=-EPS&&enter<exit&&enter<1 ? Math.max(0,enter):1;
}

export function moveWall(project:Project,id:string,requested:Point,unit:number,snap:boolean):Project {
  const original=project.walls.find(w=>w.id===id);
  if(!original||!Number.isFinite(requested.x)||!Number.isFinite(requested.y))return project;
  const before=project;
  project=normalizeFaceJoins(project,original);
  const wall=project.walls.find(w=>w.id===id)!;
  const dir=axis(wall),others=project.walls.filter(w=>w.id!==id);
  const connections=others.map(w=>({wall:w,ends:ends.filter(end=>projectToWall(w[end],wall).distance<JOIN)}));
  const fixed=connections.filter(c=>!c.ends.length).map(c=>c.wall);
  const guides=fixed.flatMap(host=>ends.filter(end=>projectToWall(wall[end],host).distance<JOIN).map(end=>({host,end})));
  const attached=guides.length>0||connections.some(c=>c.ends.length);
  let delta=snap?snapSitePoint(requested):requested;
  if(attached){
    // A connected wall slides sideways. The adjoining wall axes retain their
    // direction at right-angled corners, or guide the motion at T-junctions.
    const guide=guides.length?axis(guides[0].host):normal(dir);
    if(guides.some(({host})=>Math.abs(cross(guide,axis(host)))>EPS))return before;
    let low=-Infinity,high=Infinity;
    const corners:number[]=[];
    for(const {host,end} of guides){
      const limits=ends.map(cap=>{
        const anchor=wallCapAnchor(host,cap,inward(dir,end),wall.thickness,before.walls);
        const travel=dot(sub(anchor??host[cap],wall[end]),guide);
        if(anchor)corners.push(travel);
        return travel;
      });
      low=Math.max(low,Math.min(...limits));
      high=Math.min(high,Math.max(...limits));
    }
    if(low>high)return before;
    const desired=dot(requested,guide);
    const corner=snap?corners.filter(t=>t>=low-EPS&&t<=high+EPS&&Math.abs(t-desired)<10*unit)
      .sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired))[0]:undefined;
    const travel=Math.max(low,Math.min(high,corner??dot(delta,guide)));
    delta=offset({x:0,y:0},guide,travel);
  }else if(snap){
    const targets=fixed.filter(w=>Math.abs(cross(dir,axis(w)))>EPS);
    let best=Infinity;
    for(const end of ends){
      const raw=offset(wall[end],requested);
      let target=snapWallPoint(raw,targets,unit,true,null,false,wall.thickness);
      if(!targets.some(w=>projectToWall(target,w).distance<EPS))continue;
      const host=targets.find(w=>ends.some(cap=>distance(w[cap],target)<EPS));
      const cap=host&&ends.find(cap=>distance(host[cap],target)<EPS);
      if(host&&cap)target=wallCapAnchor(host,cap,inward(dir,end),wall.thickness,before.walls)??target;
      const correction=distance(raw,target);
      if(correction<best){
        delta=sub(target,wall[end]);best=correction;
      }
    }
  }
  if(Math.hypot(delta.x,delta.y)<EPS)return before;

  let limit=1;
  const target={...wall,a:offset(wall.a,delta),b:offset(wall.b,delta)};
  for(const other of fixed){
    if(guides.some(({host})=>host===other))continue;
    const joins=Math.abs(cross(dir,axis(other)))>EPS &&
      (ends.some(end=>projectToWall(target[end],other).distance<EPS)||
        ends.some(end=>projectToWall(other[end],target).distance<EPS));
    if(!joins)limit=Math.min(limit,sweepLimit(wall,delta,other));
  }
  const moved=new Map(connections.filter(c=>c.ends.length).map(c=>[c.wall.id,c]));
  const layout=(t:number):Project|null=>{
    const translate=(p:Point)=>offset(p,delta,t);
    const walls:Wall[]=[];
    for(const original of project.walls){
      const connection=moved.get(original.id);
      const a=id===original.id||connection?.ends.includes("a")?translate(original.a):original.a;
      const b=id===original.id||connection?.ends.includes("b")?translate(original.b):original.b;
      if([a.x,a.y,b.x,b.y].some(v=>Math.abs(v)>500))return null;
      if(connection){
        if(distance(a,b)<Math.min(.2,wallLength(original))-EPS||dot(sub(b,a),sub(original.b,original.a))<=EPS)return null;
        const end=connection.ends[0],from=end==="a"?b:a,to=end==="a"?a:b;
        const obstacles=fixed.filter(w=>distance(wallEndAtFirstContact(from,original[end],[w],original.thickness),original[end])<JOIN);
        if(distance(wallEndAtFirstContact(from,to,obstacles,original.thickness),to)>JOIN)return null;
      }
      walls.push(a===original.a&&b===original.b?original:{...original,a,b});
    }
    const openings=project.openings.map(opening=>{
      const connection=moved.get(opening.wallId);
      if(!connection?.ends.includes("a")||connection.ends.includes("b"))return opening;
      const next=walls.find(w=>w.id===opening.wallId)!;
      return {...opening,offset:opening.offset+wallLength(next)-wallLength(connection.wall)};
    });
    const next={...project,walls,openings};
    return openings.some(o=>moved.has(o.wallId)&&!canPlaceOpening(next,o,o.id))?null:next;
  };
  let best=limit>EPS?layout(limit):before;
  if(best)return best;
  let low=0,high=limit;
  for(let i=0;i<24;i++){
    const middle=(low+high)/2,next=layout(middle);
    if(next){best=next;low=middle;}else high=middle;
  }
  return low>EPS?best??before:before;
}
