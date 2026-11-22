import type {Point,Project,Opening} from "./model";
import {pointInRoofContour,roofBottomAt,roofData,ROOF_THICKNESS,type RoofPart,type RoofData} from "./roofModel";
import {houseFloorLevel} from "./houseFinishes";

export type Position3={x:number;y:number;z:number};
export type EaveRun={id:number;part:number;a:Point;b:Point;out:Point;inside:Point;length:number;height:number;gutterA:Position3;gutterB:Position3;crossA:Point;crossB:Point;capA:boolean;capB:boolean};
export type Downspout={run:number;points:Position3[];wall:Point;out:Point;clamps:Position3[]};
export type SnowGuard={run:number;feet:Position3[];supports:{foot:Position3;inward:Point;slope:number;along:Point}[]};
export type RoofDetails={eaves:EaveRun[];pipes:Downspout[];guards:SnowGuard[]};
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y;
const mix=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const height=(part:RoofPart,p:Point)=>{const h=roofBottomAt(part,p);return Number.isFinite(h)?h:part.base;};
function cleanLoop(source:Point[]):Point[]{
 const points=[...source];let changed=true;
 while(changed&&points.length>3){
  changed=false;
  for(let i=0;i<points.length;i++){
   const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ac=Math.hypot(c.x-a.x,c.y-a.y);
   // Clipper's integer coordinates can leave sub-millimetre steps along one eave.
   if(ab<.002||bc<.002||ac>.001&&Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/ac<.002&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>0){points.splice(i,1);changed=true;break;}
  }
 }
 return points;
}
function direction(part:RoofPart,a:Point,b:Point){
 const length=Math.hypot(b.x-a.x,b.y-a.y),axis={x:(b.x-a.x)/length,y:(b.y-a.y)/length},inside={x:-axis.y,y:axis.x},mid=mix(a,b,.5);
 if(!pointInRoofContour({x:mid.x+inside.x*.012,y:mid.y+inside.y*.012},part.contour)){inside.x*=-1;inside.y*=-1;}
 return{length,axis,inside,out:{x:-inside.x,y:-inside.y}};
}
function miter(a:Point,b:Point){const denominator=1+dot(a,b);if(denominator<.1)return b;const p={x:(a.x+b.x)/denominator,y:(a.y+b.y)/denominator},length=Math.hypot(p.x,p.y);return length>4?{x:p.x*4/length,y:p.y*4/length}:p;}
function projection(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return mix(a,b,t);}
function wallPoint(part:RoofPart,p:Point,out:Point):Point|null{
 let nearest:Point|null=null,distance=Infinity;
 for(const loop of[part.wallContour.outer,...part.wallContour.holes])for(let i=0;i<loop.length;i++){
  const a=loop[i],b=loop[(i+1)%loop.length],d=direction({...part,contour:part.wallContour},a,b);if(dot(d.out,out)<.8)continue;
  const q=projection(p,a,b),length=Math.hypot(q.x-p.x,q.y-p.y);if(length<distance){distance=length;nearest=q;}
 }
 return distance<3?nearest:null;
}
export function pipeClearsOpenings(project:Pick<Project,"walls"|"openings">,point:Point):boolean{
 for(const wall of project.walls){
  const dx=wall.b.x-wall.a.x,dy=wall.b.y-wall.a.y,length=Math.hypot(dx,dy),s=((point.x-wall.a.x)*dx+(point.y-wall.a.y)*dy)/length,across=Math.abs((point.x-wall.a.x)*dy-(point.y-wall.a.y)*dx)/length;
  if(across>wall.thickness/2+.12||s<-.2||s>length+.2)continue;
  if(project.openings.some(o=>o.wallId===wall.id&&Math.abs(o.offset-s)<o.width/2+.17))return false;
 }
 return true;
}
const cache=new WeakMap<RoofData,WeakMap<Opening[],RoofDetails>>();
export function roofDetailsPlan(project:Pick<Project,"walls"|"openings"|"roof"|"plinth">):RoofDetails{
 const floor=houseFloorLevel(project);
 const data=roofData(project);let variants=cache.get(data);if(!variants){variants=new WeakMap();cache.set(data,variants);}const found=variants.get(project.openings);if(found)return found;
 const result:RoofDetails={eaves:[],pipes:[],guards:[]};
 data.parts.forEach((part,partIndex)=>{
  for(const source of[part.contour.outer,...part.contour.holes]){
   const loop=cleanLoop(source);
   const edges=loop.map((a,i)=>{
    const b=loop[(i+1)%loop.length],d=direction(part,a,b),mid=mix(a,b,.5),h=height(part,mid),inner={x:mid.x+d.inside.x*.08,y:mid.y+d.inside.y*.08};
    const active=d.length>.35&&(project.roof?.type==='flat'||Math.abs(height(part,a)-height(part,b))<.006&&height(part,inner)>h+.002);
    return{a,b,...d,h,active};
   });
   edges.forEach((edge,i)=>{
    if(!edge.active)return;const previous=edges[(i+edges.length-1)%edges.length],next=edges[(i+1)%edges.length],crossA=previous.active?miter(previous.out,edge.out):edge.out,crossB=next.active?miter(edge.out,next.out):edge.out;
    const run:EaveRun={id:result.eaves.length,part:partIndex,a:edge.a,b:edge.b,out:edge.out,inside:edge.inside,length:edge.length,height:edge.h+.11,
     gutterA:{x:edge.a.x+crossA.x*.065,y:edge.h+.11,z:edge.a.y+crossA.y*.065},gutterB:{x:edge.b.x+crossB.x*.065,y:edge.h+.11,z:edge.b.y+crossB.y*.065},crossA,crossB,capA:!previous.active,capB:!next.active};result.eaves.push(run);
   });
  }
 });
 for(const run of result.eaves){
  const part=data.parts[run.part],margin=Math.min(Math.max(.65,(project.roof?.overhang??0)+.3),run.length*.3),count=project.roof?.type==='gable'&&run.length>9.5?2:1;
  for(let side=0;side<count;side++){
   const steps=Math.max(1,Math.min(70,Math.ceil((run.length-margin*2)/.35)));let selected:Downspout|null=null;
   for(let i=0;i<=steps;i++){
    const distance=margin+(run.length-margin*2)*i/steps,t=side===0?distance/run.length:1-distance/run.length,roofPoint=mix(run.a,run.b,t),wall=wallPoint(part,roofPoint,run.out);
    if(!wall||!pipeClearsOpenings(project,wall))continue;
    const x=wall.x+run.out.x*.075,z=wall.y+run.out.y*.075;if(result.pipes.some(p=>Math.hypot(p.wall.x-wall.x,p.wall.y-wall.y)<.55))continue;
    const outlet={x:run.gutterA.x+(run.gutterB.x-run.gutterA.x)*t,y:run.height-.075,z:run.gutterA.z+(run.gutterB.z-run.gutterA.z)*t},knee=Math.max(.40,run.height-.43);
    const points=[outlet,{...outlet,y:run.height-.22},{x,y:knee,z},{x,y:.36-floor,z},{x:x+run.out.x*.24,y:.16-floor,z:z+run.out.y*.24}],clamps:Position3[]=[];
    for(let y=.65;y<knee-.1;y+=1.35)clamps.push({x,y,z});if(knee>1.3&&!clamps.some(c=>Math.abs(c.y-(knee-.18))<.45))clamps.push({x,y:knee-.18,z});
    selected={run:run.id,points,wall,out:run.out,clamps};break;
   }
   if(selected)result.pipes.push(selected);
  }
  if(project.roof?.type==='flat'||run.length<1.5)continue;
  const inset=Math.min(Math.max(.45,(project.roof?.overhang??0)+.2),run.length*.23),endMargin=Math.max(.3,inset+.14),span=run.length-2*endMargin;if(span<.3)continue;
  const pointAt=(distance:number)=>{const q=mix(run.a,run.b,distance/run.length),p={x:q.x+run.inside.x*inset,y:q.y+run.inside.y*inset};const h=roofBottomAt(part,p);return Number.isFinite(h)&&pointInRoofContour(p,part.contour)?{x:p.x,y:h+ROOF_THICKNESS+.02,z:p.y}:null;};
  const samples=Math.max(1,Math.min(200,Math.ceil(span/.3))),feet:Position3[]=[],supports:SnowGuard['supports']=[];let valid=true;
  for(let i=0;i<=samples;i++){const p=pointAt(endMargin+span*i/samples);if(!p){valid=false;break;}feet.push(p);}
  if(!valid)continue;
  const posts=Math.max(1,Math.min(120,Math.ceil(span/.95))),along={x:(run.b.x-run.a.x)/run.length,y:(run.b.y-run.a.y)/run.length};
  for(let i=0;i<=posts;i++){
   const p=pointAt(endMargin+span*i/posts);if(!p)continue;const h=roofBottomAt(part,{x:p.x+run.inside.x*.03,y:p.z+run.inside.y*.03}),slope=Number.isFinite(h)?(h-(p.y-ROOF_THICKNESS-.02))/.03:0;
   supports.push({foot:p,inward:run.inside,slope,along});
  }
  result.guards.push({run:run.id,feet,supports});
 }
 variants.set(project.openings,result);return result;
}
