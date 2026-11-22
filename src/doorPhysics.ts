import { pointOnWall, type Opening, type Wall } from "./model";
import { doorOpen } from "./houseFinishes";
import type { Collider } from "./walkPhysics";

export const DOOR_FRAME=.045, DOOR_LEAF_THICKNESS=.04;
export type DoorAngles=ReadonlyMap<string,number>;
export const doorSwingDirection=(door:Opening)=>door.doorSwing??1;
export const doorTarget=(door:Opening)=>doorOpen(door)?doorSwingDirection(door)*Math.PI/2:0;
export const doorLeafLength=(door:Opening)=>Math.max(.1,door.width-2*DOOR_FRAME-.004);
export const doorHingeOffset=(door:Opening)=>door.offset+(door.doorMirrored?1:-1)*doorLeafLength(door)/2;
export const doorLocalAngle=(door:Opening,angle:number)=>door.doorMirrored?Math.PI-angle:angle;
export function doorLeafPose(door:Opening,wall:Wall,angle=doorTarget(door)){
  const length=doorLeafLength(door),wallAngle=Math.atan2(wall.b.y-wall.a.y,wall.b.x-wall.a.x);
  const rotation=wallAngle+doorLocalAngle(door,angle);
  const direction={x:Math.cos(rotation),y:Math.sin(rotation)},hinge=pointOnWall(wall,doorHingeOffset(door));
  return {hinge,direction,length};
}
export function doorLeafCollider(door:Opening,wall:Wall,angle=doorTarget(door)):Collider{
  const {hinge,direction,length}=doorLeafPose(door,wall,angle);
  return {center:{x:hinge.x+direction.x*length/2,y:hinge.y+direction.y*length/2},axis:direction,halfLength:length/2,halfDepth:DOOR_LEAF_THICKNESS/2,doorId:door.id};
}
// Small angular steps prevent a fast door from sweeping through an obstacle.
export function advanceDoorAngle(angle:number,target:number,seconds:number,canOccupy:(next:number)=>boolean=()=>true){
  const dt=Number.isFinite(seconds)?Math.max(0,Math.min(.05,seconds)):0,distance=target-angle;
  if(!dt||Math.abs(distance)<1e-6)return {angle,blocked:false};
  const travel=Math.sign(distance)*Math.min(Math.abs(distance),Math.max(.22,Math.min(2.6,Math.abs(distance)*7))*dt),steps=Math.max(1,Math.ceil(Math.abs(travel)/(.75*Math.PI/180))),start=angle;
  for(let i=1;i<=steps;i++){
    const next=start+travel*i/steps;if(!canOccupy(next))return {angle,blocked:true};angle=next;
  }
  return {angle,blocked:false};
}
