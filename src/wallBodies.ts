import type {Point,Wall} from "./model";

const EPS=1e-8, JOIN=.001;
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y});
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const norm=(a:Point)=>Math.hypot(a.x,a.y);
const point=(a:Point,d:Point,t:number):Point=>({x:a.x+d.x*t,y:a.y+d.y*t});
type Plane={normal:Point;value:number};
export type WallBody={polygon:Point[];start:number;end:number;length:number;outerStart:number;outerEnd:number;a:Point;b:Point;axis:Point;min:number;max:number};
const cache=new WeakMap<Wall[],Map<string,WallBody>>();

export function cornerInset(hostInward:Point,branchInward:Point,hostThickness:number,branchThickness:number) {
  return (branchThickness-hostThickness*dot(hostInward,branchInward))/(2*Math.abs(cross(hostInward,branchInward)));
}

export function clipWallPolygon(polygon:Point[],normal:Point,value:number):Point[]{
  const out:Point[]=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=dot(normal,a)-value,db=dot(normal,b)-value;
    if(da>=-EPS)out.push(a);
    if(da>EPS&&db<-EPS||da<-EPS&&db>EPS)out.push(point(a,sub(b,a),da/(da-db)));
  }
  return out.filter((p,i)=>i===0||norm(sub(p,out[i-1]))>EPS);
}
export function polygonRayInterval(origin:Point,direction:Point,polygon:Point[]):{near:number;far:number}|null{
  if(polygon.length<3)return null;
  let near=-Infinity,far=Infinity;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],d=sub(polygon[(i+1)%polygon.length],a),normal={x:-d.y,y:d.x};
    const p=dot(normal,sub(origin,a)),v=dot(normal,direction);
    if(Math.abs(v)<EPS){if(p<-EPS)return null;}
    else{const t=-p/v;if(v>0)near=Math.max(near,t);else far=Math.min(far,t);if(near>far+EPS)return null;}
  }
  return {near,far};
}

function computeBodies(walls:Wall[]):Map<string,WallBody>{
  const result=new Map<string,WallBody>();
  for(const [index,wall]of walls.entries()){
    const length=norm(sub(wall.b,wall.a)),axis={x:(wall.b.x-wall.a.x)/length,y:(wall.b.y-wall.a.y)/length},normal={x:-axis.y,y:axis.x};
    let min=0,max=length,outerStart: number|undefined,outerEnd: number|undefined;const cuts:Plane[]=[];
    for(const [otherIndex,other]of walls.entries()){
      if(other===wall)continue;
      const otherLength=norm(sub(other.b,other.a)),u={x:(other.b.x-other.a.x)/otherLength,y:(other.b.y-other.a.y)/otherLength};
      const sin=Math.abs(cross(axis,u));if(sin<1e-6)continue;
      for(const endpoint of ["a","b"] as const){
        const p=wall[endpoint],v=sub(p,other.a),along=dot(v,u),across=cross(u,v);
        // Older drawings also contain endpoints placed inside the former square
        // end cap. If that cap touched a wall, keep a real face-to-face joint.
        if(Math.abs(across)>other.thickness/2+wall.thickness/2*sin+JOIN||along<-JOIN||along>otherLength+JOIN)continue;
        const shared=norm(sub(p,other.a))<JOIN||norm(sub(p,other.b))<JOIN;
        // A branch near a cap must not cut its host back to the branch face.
        if(!shared&&[other.a,other.b].some(end=>{
          const delta=sub(end,wall.a),along=dot(delta,axis);
          return along>JOIN&&along<length-JOIN&&Math.abs(cross(axis,delta))<JOIN;
        }))continue;
        const inward=endpoint==="a"?axis:{x:-axis.x,y:-axis.y};
        const otherInward=along<otherLength/2?u:{x:-u.x,y:-u.y};
        if(shared&&dot(inward,otherInward)<-.95){
          const d=sub(inward,otherInward),size=norm(d),n={x:d.x/size,y:d.y/size};
          const value=dot(n,p),face=(value-dot(n,wall.a))/dot(n,axis),slant=wall.thickness/2*Math.abs(dot(n,normal)/dot(n,axis));
          if(endpoint==="a")min=Math.min(min,face-slant);else max=Math.max(max,face+slant);
          cuts.push({normal:n,value});continue;
        }
        const capLimit=Math.max(.2,wall.thickness*2,other.thickness*2);
        const extension=Math.min(capLimit,other.thickness/(2*sin)+wall.thickness/2*Math.abs(dot(axis,u))/sin);
        const inset=cornerInset(otherInward,inward,other.thickness,wall.thickness);
        const flush=Math.abs(across)<JOIN&&inset>JOIN&&Math.abs(Math.min(along,otherLength-along)-inset)<1e-5;
        if(shared||flush){
          if(endpoint==="a")outerStart=Math.min(outerStart??0,-extension);
          else outerEnd=Math.max(outerEnd??length,length+extension);
        }
        if(shared&&index<otherIndex){
          // An older wall continues through the shared corner. The later wall
          // butts against its face, independently of selection or wall length.
          if(endpoint==="a")min=Math.min(min,-extension);else max=Math.max(max,length+extension);
          continue;
        }
        let n={x:-u.y,y:u.x};
        if(dot(n,inward)<0)n={x:-n.x,y:-n.y};
        const value=dot(n,other.a)+other.thickness/2;
        const face=(value-dot(n,wall.a))/dot(n,axis),slant=wall.thickness/2*Math.abs(dot(n,normal)/dot(n,axis));
        if(endpoint==="a")min=Math.min(min,Math.max(-capLimit,face-slant));else max=Math.max(max,Math.min(length+capLimit,face+slant));
        cuts.push({normal:n,value});
      }
    }
    let polygon=[point(point(wall.a,axis,min),normal,-wall.thickness/2),point(point(wall.a,axis,max),normal,-wall.thickness/2),
      point(point(wall.a,axis,max),normal,wall.thickness/2),point(point(wall.a,axis,min),normal,wall.thickness/2)];
    for(const cut of cuts)polygon=clipWallPolygon(polygon,cut.normal,cut.value);
    const interval=polygonRayInterval(wall.a,axis,polygon);
    const start=interval?Math.max(min,interval.near):0,end=interval?Math.min(max,interval.far):0;
    const offsets=polygon.map(p=>dot(sub(p,wall.a),axis));
    result.set(wall.id,{polygon,start,end,length:Math.max(0,end-start),outerStart:outerStart??start,outerEnd:outerEnd??end,
      a:point(wall.a,axis,start),b:point(wall.a,axis,end),axis,
      min:offsets.length?Math.min(...offsets):0,max:offsets.length?Math.max(...offsets):0});
  }
  return result;
}
export function wallBodies(walls:Wall[]):Map<string,WallBody>{
  let bodies=cache.get(walls);if(!bodies){bodies=computeBodies(walls);cache.set(walls,bodies);}return bodies;
}
export function wallBody(wall:Wall,walls:Wall[]):WallBody{return wallBodies(walls).get(wall.id)!;}
export function wallPiecePolygon(wall:Wall,body:WallBody,start:number,end:number):Point[]{
  if(end-start<EPS)return [];
  const base=dot(body.axis,wall.a);
  return clipWallPolygon(clipWallPolygon(body.polygon,body.axis,base+start),{x:-body.axis.x,y:-body.axis.y},-base-end);
}
export function wallHandlePoint(body:WallBody,endpoint:"a"|"b",unit:number):Point{
  const inset=Math.min(6*unit,body.length/4);
  return point(endpoint==="a"?body.a:body.b,body.axis,endpoint==="a"?inset:-inset);
}
