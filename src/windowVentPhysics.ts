import { bounds, findRooms, pointOnWall, wallLength, type Opening, type Project, type Room, type Wall } from "./model";
import { insidePolygon } from "./landscape";
import { openingBottom, windowBottomRail, WINDOW_FRAME_WIDTH, windowPaneBounds } from "./windowSections";
import type { Collider } from "./walkPhysics";

const GAP=.003;
export const WINDOW_VENT_DEPTH=.026;
export const windowVentKey=(id:string,index:number)=>`${id}:${index}`;
export type WindowVentAngles=ReadonlyMap<string,number>;
export type WindowVent={
  id:string;openingId:string;section:number;wall:Wall;open:boolean;side:1|-1;mirrored:boolean;french:boolean;
  x:number;along:number;z:number;bottom:number;length:number;height:number;
};
const roomsCache=new WeakMap<Wall[],Room[]>();
const ventCache=new WeakMap<Project,WindowVent[]>();

export function windowInteriorSide(walls:Wall[],wall:Wall,offset:number):1|-1 {
  let rooms=roomsCache.get(walls);
  if(!rooms){rooms=findRooms(walls);roomsCache.set(walls,rooms);}
  const middle=pointOnWall(wall,offset),length=wallLength(wall);
  const nx=(wall.a.y-wall.b.y)/length,ny=(wall.b.x-wall.a.x)/length,reach=wall.thickness/2+.015;
  const roomArea=(side:number)=>rooms!.reduce((area,room)=>insidePolygon({
    x:middle.x+side*nx*reach,y:middle.y+side*ny*reach,
  },room.points)?Math.max(area,room.area):area,0);
  const positive=roomArea(1),negative=roomArea(-1);
  if(positive!==negative)return positive>negative?1:-1;
  const b=bounds(walls);
  return ((b.minX+b.maxX)/2-middle.x)*nx+((b.minY+b.maxY)/2-middle.y)*ny<0?-1:1;
}

function openingVents(opening:Opening,wall:Wall,walls:Wall[]):WindowVent[] {
  if(!opening.ventSections?.some(Boolean))return [];
  const panes=windowPaneBounds(opening);
  return opening.ventSections.flatMap((state,section)=>{
    if(!state)return [];
    const {left,right}=panes[section],side=windowInteriorSide(walls,wall,opening.offset-opening.width/2+(left+right)/2);
    const mirrored=opening.mirroredVents?.includes(section)??false;
    const x=mirrored?right-GAP:left+GAP;
    const bottom=openingBottom(opening)+windowBottomRail(opening)+GAP;
    return [{
      id:windowVentKey(opening.id,section),openingId:opening.id,section,wall,side,mirrored,open:state==="open",french:!!opening.french,x,
      along:opening.offset-opening.width/2+x,z:side*((wall.thickness+.025)/2-.007),
      bottom,
      length:right-left-2*GAP,height:opening.sill+opening.height-WINDOW_FRAME_WIDTH-GAP-bottom,
    }];
  });
}

export function projectWindowVents(project:Project):WindowVent[] {
  let vents=ventCache.get(project);
  if(!vents){
    const walls=new Map(project.walls.map(w=>[w.id,w]));
    vents=project.openings.flatMap(opening=>{
      const wall=walls.get(opening.wallId);
      return opening.kind==="window"&&wall?openingVents(opening,wall,project.walls):[];
    });
    ventCache.set(project,vents);
  }
  return vents;
}

export const windowVentTarget=(vent:WindowVent)=>vent.open?vent.side*Math.PI/2:0;
export const windowVentLocalAngle=(vent:WindowVent,angle:number)=>vent.mirrored?Math.PI-angle:angle;

export function windowVentPose(vent:WindowVent,angle=windowVentTarget(vent)) {
  const {wall,along,z,length}=vent,yaw=Math.atan2(wall.b.y-wall.a.y,wall.b.x-wall.a.x);
  const center=pointOnWall(wall,along),hinge={x:center.x-Math.sin(yaw)*z,y:center.y+Math.cos(yaw)*z};
  const rotation=yaw+windowVentLocalAngle(vent,angle);
  return {hinge,direction:{x:Math.cos(rotation),y:Math.sin(rotation)},length};
}

export function windowVentCollider(vent:WindowVent,angle=windowVentTarget(vent)):Collider {
  const {hinge,direction,length}=windowVentPose(vent,angle);
  return {center:{x:hinge.x+direction.x*length/2,y:hinge.y+direction.y*length/2},axis:direction,
    halfLength:length/2,halfDepth:WINDOW_VENT_DEPTH/2,ventId:vent.id};
}
