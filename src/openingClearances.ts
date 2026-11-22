import { wallLength, type Opening, type Project, type Wall } from "./model";

export type OpeningClearance = {
  side: "start" | "end";
  from: number;
  to: number;
  distance: number;
  kind: "window" | "door" | "wall" | "wall-end";
  obstacleId: string;
  overlap: boolean;
};
type Obstacle = {start:number;end:number;kind:OpeningClearance["kind"];id:string};
const EPS=1e-8;

// Intersect the host wall's axis with the other wall's actual rectangular
// footprint, including its end caps. Parallel continuations are not junctions.
function wallInterval(host:Wall, other:Wall): {start:number;end:number} | null {
  const length=wallLength(host),otherLength=wallLength(other);
  const dx=(host.b.x-host.a.x)/length,dy=(host.b.y-host.a.y)/length;
  const ux=(other.b.x-other.a.x)/otherLength,uy=(other.b.y-other.a.y)/otherLength;
  if(Math.abs(dx*uy-dy*ux)<EPS)return null;
  const x=host.a.x-(other.a.x+other.b.x)/2,y=host.a.y-(other.a.y+other.b.y)/2;
  const p=[x*ux+y*uy,-x*uy+y*ux],v=[dx*ux+dy*uy,-dx*uy+dy*ux];
  const halves=[otherLength/2+other.thickness/2,other.thickness/2];
  let start=0,end=length;
  for(let i=0;i<2;i++){
    if(Math.abs(v[i])<EPS){if(Math.abs(p[i])>halves[i]+EPS)return null;}
    else {
      let a=(-halves[i]-p[i])/v[i],b=(halves[i]-p[i])/v[i];
      if(a>b)[a,b]=[b,a];start=Math.max(start,a);end=Math.min(end,b);
      if(start>end+EPS)return null;
    }
  }
  return {start,end};
}

export function measureOpeningClearances(project:Project, opening:Opening): OpeningClearance[] {
  const wall=project.walls.find(w=>w.id===opening.wallId);
  if(!wall)return [];
  const left=opening.offset-opening.width/2,right=opening.offset+opening.width/2,length=wallLength(wall);
  const result:OpeningClearance[]=[
    {side:"start",from:left,to:0,distance:Math.max(0,left),kind:"wall-end",obstacleId:wall.id,overlap:false},
    {side:"end",from:right,to:length,distance:Math.max(0,length-right),kind:"wall-end",obstacleId:wall.id,overlap:false},
  ];
  const obstacles:Obstacle[]=project.openings.filter(o=>o.wallId===wall.id&&o.id!==opening.id).map(o=>({start:o.offset-o.width/2,end:o.offset+o.width/2,kind:o.kind,id:o.id}));
  for(const other of project.walls){
    if(other.id===wall.id)continue;
    const interval=wallInterval(wall,other);
    if(interval)obstacles.push({...interval,kind:"wall",id:other.id});
  }
  for(const obstacle of obstacles){
    const overlap=obstacle.start<right-EPS&&obstacle.end>left+EPS;
    for(const [i,edge]of [left,right].entries()){
      if(!overlap&&(i===0?obstacle.start>edge+EPS:obstacle.end<edge-EPS))continue;
      const to=overlap?edge:i===0?Math.min(edge,obstacle.end):Math.max(edge,obstacle.start);
      const distance=Math.max(0,Math.abs(edge-to));
      if(distance<result[i].distance-EPS || overlap&&!result[i].overlap)
        result[i]={side:i===0?"start":"end",from:edge,to,distance,kind:obstacle.kind,obstacleId:obstacle.id,overlap};
    }
  }
  return result;
}
