import {
  bounds,
  distance,
  findRooms,
  pointOnWall,
  wallLength,
  type Point,
  type Project,
} from "./model";
import { plantTrunkRadius } from "./landscape";
import { isHerb } from "./plantSettings";
import {wallBody,wallPiecePolygon} from "./wallBodies";
import {sceneDisplay} from "./sceneDisplay";
import {roofData,roofBottomAt,roofLowRegions} from "./roofModel";
import {doorLeafCollider,DOOR_FRAME,DOOR_LEAF_THICKNESS,type DoorAngles} from "./doorPhysics";
import {projectWindowVents,windowVentCollider,windowVentTarget,type WindowVentAngles} from "./windowVentPhysics";
import {houseFloorLevel} from "./houseFinishes";
import {openingBottom, WINDOW_FRAME_WIDTH, windowPaneBounds} from "./windowSections";
import {foundationContains, foundationPaths} from "./plinthGeometry";
import {entryExteriorSide,entryTreads} from "./entrySteps";
import { FENCE_HEIGHT, fenceFootprint } from "./fenceSettings";
import { visibleFencePieces } from "./gatePlacement";
import { gateLeafIndices, gateLeafCollider, gateLeafKey, gatePostColliders, gateTarget, type GateAngles } from "./gateSettings";
export {DOOR_FRAME,DOOR_LEAF_THICKNESS} from "./doorPhysics";

// All scene coordinates and movement speeds are expressed in metres / seconds.
export const PERSON_HEIGHT = 1.75;
export const EYE_HEIGHT = 1.65;
export const BODY_RADIUS = 0.22;
export const WALK_SPEED = 1.5;
export const RUN_SPEED = 3.2;
export const JUMP_HEIGHT = 0.45;
export const GRAVITY = 9.81;
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);

export type JumpState = { height: number; velocity: number };
export function beginJump(state: JumpState): JumpState {
  return state.height === 0 && state.velocity === 0 ? { height: 0, velocity: JUMP_SPEED } : state;
}
export function stepJump(state: JumpState, seconds: number, headroom = Infinity): JumpState {
  const dt = Number.isFinite(seconds) ? Math.max(0, Math.min(.05, seconds)) : 0;
  if (dt === 0) return state;
  let height = state.height + state.velocity * dt - GRAVITY * dt * dt / 2;
  let velocity = state.velocity - GRAVITY * dt;
  if (height > headroom) { height = Math.max(0, headroom); velocity = Math.min(0, velocity); }
  return height <= 0 ? {height: 0, velocity: 0} : {height, velocity};
}

export type Collider =
  | {
      center: Point;
      axis: Point;
      halfLength: number;
      halfDepth: number;
      polygon?: Point[];
      padding?: number;
      doorId?: string;
      ventId?: string;
      gateId?: string;
      gateLeaf?: boolean;
      wallId?: string;
    }
  | { center: Point; radius: number };

export function walkingSurface(project: Project, point: Point) {
  const display = sceneDisplay(project);
  if (!display.house) return {height:0,steps:false};
  if (foundationContains(foundationPaths(project),point)) return {height:houseFloorLevel(project),steps:false};
  let height = 0;
  for (const tread of display.landscape ? entryTreads(project) : []) {
    const dx = point.x-tread.center.x, dy = point.y-tread.center.y;
    if (Math.abs(dx*tread.axis.x+dy*tread.axis.y) <= tread.width/2+1e-6 &&
        Math.abs(-dx*tread.axis.y+dy*tread.axis.x) <= tread.depth/2+1e-6)
      height = Math.max(height,tread.height);
  }
  return {height,steps:height>0};
}

export function createColliders(project: Project, wallPadding = 0.025,
  footHeight = project.walls.length && sceneDisplay(project).house ? houseFloorLevel(project) : 0,
  doorAngles?:DoorAngles, ventAngles?:WindowVentAngles, gateAngles?:GateAngles): Collider[] {
  const colliders: Collider[] = [];
  const visible=sceneDisplay(project);
  const floor = houseFloorLevel(project);
  for (const wall of visible.house?project.walls:[]) {
    const length = wallLength(wall);
    const axis = {
      x: (wall.b.x - wall.a.x) / length,
      y: (wall.b.y - wall.a.y) / length,
    };
    const body=wallBody(wall,project.walls);
    const span = (start: number, end: number) => {
      if (end - start < 1e-6) return;
      const polygon=wallPiecePolygon(wall,body,start,end);if(polygon.length<3)return;
      colliders.push({
        center: pointOnWall(wall, (start + end) / 2),
        axis,
        halfLength: (end - start) / 2,
        halfDepth: (wall.thickness + wallPadding) / 2,
        polygon,padding:wallPadding/2,wallId:wall.id,
      });
    };
    const entries = project.openings
      .filter(
        (o) =>
          o.wallId === wall.id &&
          (o.kind === "door" || o.french) &&
          (openingBottom(o) <= .02 || !!entryExteriorSide(project,o,wall)) &&
          floor + o.sill + o.height - WINDOW_FRAME_WIDTH >= PERSON_HEIGHT + footHeight + .01 - 1e-8,
      )
      .sort((a, b) => a.offset - b.offset);
    let start = body.min;
    const gap = (left: number, right: number) => {
      if (right <= left) return;
      span(start,left);
      start = right;
    };
    for (const entry of entries) {
      const left = entry.offset - entry.width/2;
      if (entry.kind === "door") {
        gap(left+DOOR_FRAME,left+entry.width-DOOR_FRAME);
        colliders.push(doorLeafCollider(entry,wall,doorAngles?.get(entry.id)));
      } else {
        windowPaneBounds(entry).forEach((pane,index) => {
          if (entry.ventSections?.[index]) gap(left+pane.left,left+pane.right);
        });
      }
    }
    span(start, body.max);
  }
  for(const vent of visible.house?projectWindowVents(project):[]){
    const angle=ventAngles?.get(vent.id)??windowVentTarget(vent);
    if((vent.french||Math.abs(angle)>1e-6)&&floor+vent.bottom<PERSON_HEIGHT+footHeight&&floor+vent.bottom+vent.height>footHeight)
      colliders.push(windowVentCollider(vent,angle));
  }
  for (const plant of visible.landscape?project.plants??[]:[]) {
    if (isHerb(plant.kind)) continue;
    colliders.push({ center: { ...plant.position }, radius:plantTrunkRadius(plant) });
  }
  if (visible.landscape && footHeight<FENCE_HEIGHT) {
    for (const fence of visibleFencePieces(project)) colliders.push(fenceFootprint(fence));
    for (const gate of project.gates ?? []) {
      colliders.push(...gatePostColliders(gate));
      for (const index of gateLeafIndices(gate))
        colliders.push(gateLeafCollider(gate,index,gateAngles?.get(gateLeafKey(gate.id,index)) ?? gateTarget(project,gate)));
    }
  }
  if(visible.roof)for(const polygon of roofLowRegions(project,PERSON_HEIGHT+footHeight+.01-floor)){
    const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),minY=Math.min(...polygon.map(p=>p.y)),maxY=Math.max(...polygon.map(p=>p.y));
    colliders.push({center:{x:(minX+maxX)/2,y:(minY+maxY)/2},axis:{x:1,y:0},halfLength:(maxX-minX)/2,halfDepth:(maxY-minY)/2,polygon});
  }
  return colliders;
}

// Limit upward motion below overhead parts of the house.
export function jumpHeadroom(project: Project, position: Point, radius = BODY_RADIUS, ventAngles?:WindowVentAngles): number {
  let limit = Infinity;
  const visible=sceneDisplay(project);
  const floor = houseFloorLevel(project);
  for (const door of visible.house?project.openings:[]) {
    if (door.kind !== "door" && !door.french) continue;
    const wall = project.walls.find(w => w.id === door.wallId);
    if (!wall) continue;
    const length = wallLength(wall),axis = {x:(wall.b.x-wall.a.x)/length,y:(wall.b.y-wall.a.y)/length};
    if (penetration(position, {center:pointOnWall(wall,door.offset),axis,halfLength:door.width/2,halfDepth:(wall.thickness+.025)/2}, radius))
      limit = Math.min(limit, Math.max(0, floor + door.sill + door.height - DOOR_FRAME - PERSON_HEIGHT - .01));
  }
  for(const vent of visible.house?projectWindowVents(project):[]){
    const angle=ventAngles?.get(vent.id)??windowVentTarget(vent);
    if(Math.abs(angle)>1e-6&&penetration(position,windowVentCollider(vent,angle),radius))
      limit=Math.min(limit,Math.max(0,floor+vent.bottom-PERSON_HEIGHT-.01));
  }
  if(visible.roof)for(const part of roofData(project).parts){
    for(let i=-1;i<8;i++){
      const p=i<0?position:{x:position.x+Math.cos(i*Math.PI/4)*radius,y:position.y+Math.sin(i*Math.PI/4)*radius};
      limit=Math.min(limit,Math.max(0,floor+roofBottomAt(part,p)-PERSON_HEIGHT-.01));
    }
  }
  return limit;
}

function penetration(
  point: Point,
  collider: Collider,
  radius: number,
): Point | null {
  if ("radius" in collider) {
    const dx = point.x - collider.center.x,
      dy = point.y - collider.center.y,
      length = Math.hypot(dx, dy),
      limit = radius + collider.radius;
    if (length >= limit - 1e-7) return null;
    if (length < 1e-8) return { x: limit + 1e-6, y: 0 };
    const push = (limit - length + 1e-6) / length;
    return { x: dx * push, y: dy * push };
  }
  if(collider.polygon){
    const polygon=collider.polygon,limit=radius+(collider.padding??0);let inside=true,nearest=Infinity,closest:Point=point,normal:Point={x:1,y:0};
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
      if(l2<1e-14)continue;
      if(dx*(point.y-a.y)-dy*(point.x-a.x)<-1e-8)inside=false;
      const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/l2)),q={x:a.x+t*dx,y:a.y+t*dy},d=Math.hypot(point.x-q.x,point.y-q.y);
      if(d<nearest){nearest=d;closest=q;normal={x:dy/Math.sqrt(l2),y:-dx/Math.sqrt(l2)};}
    }
    if(!inside&&nearest>=limit-1e-7)return null;
    if(nearest<1e-8)return{x:normal.x*(limit+1e-6),y:normal.y*(limit+1e-6)};
    const multiplier=inside?(nearest+limit+1e-6)/nearest:(limit-nearest+1e-6)/nearest;
    return inside?{x:(closest.x-point.x)*multiplier,y:(closest.y-point.y)*multiplier}:{x:(point.x-closest.x)*multiplier,y:(point.y-closest.y)*multiplier};
  }
  const { axis, center, halfLength, halfDepth } = collider;
  const dx = point.x - center.x,
    dy = point.y - center.y;
  const x = dx * axis.x + dy * axis.y,
    y = -dx * axis.y + dy * axis.x;
  const qx = Math.max(-halfLength, Math.min(halfLength, x));
  const qy = Math.max(-halfDepth, Math.min(halfDepth, y));
  const vx = x - qx,
    vy = y - qy,
    separation = Math.hypot(vx, vy);
  if (separation >= radius - 1e-7) return null;
  let pushX: number, pushY: number;
  if (separation > 1e-8) {
    const push = (radius - separation + 1e-6) / separation;
    pushX = vx * push;
    pushY = vy * push;
  } else {
    const toX = halfLength - Math.abs(x),
      toY = halfDepth - Math.abs(y);
    if (toX < toY) {
      pushX = (toX + radius + 1e-6) * (x < 0 ? -1 : 1);
      pushY = 0;
    } else {
      pushX = 0;
      pushY = (toY + radius + 1e-6) * (y < 0 ? -1 : 1);
    }
  }
  return {
    x: pushX * axis.x - pushY * axis.y,
    y: pushX * axis.y + pushY * axis.x,
  };
}

export const isWalkable = (
  point: Point,
  colliders: Collider[],
  radius = BODY_RADIUS,
) => colliders.every((collider) => !penetration(point, collider, radius));

export function movePerson(
  position: Point,
  delta: Point,
  colliders: Collider[],
  radius = BODY_RADIUS,
): Point {
  // Small steps prevent tunnelling through thin walls, even at low frame rates.
  const count = Math.max(
    1,
    Math.ceil(Math.hypot(delta.x, delta.y) / (radius * 0.3)),
  );
  let point = { ...position };
  for (let step = 0; step < count; step++) {
    point = { x: point.x + delta.x / count, y: point.y + delta.y / count };
    for (let iteration = 0; iteration < 8; iteration++) {
      let collided = false;
      for (const collider of colliders) {
        const push = penetration(point, collider, radius);
        if (push) {
          point.x += push.x;
          point.y += push.y;
          collided = true;
        }
      }
      if (!collided) break;
    }
  }
  return point;
}

export function pointInRoom(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function findWalkSpawn(
  project: Project,
  colliders = createColliders(project),
): { position: Point; yaw: number } {
  const rooms = findRooms(project.walls).sort((a, b) => b.area - a.area);
  let position: Point | undefined;
  for (const room of rooms) {
    if (
      pointInRoom(room.center, room.points) &&
      isWalkable(room.center, colliders)
    ) {
      position = room.center;
      break;
    }
    const xs = room.points.map((p) => p.x),
      ys = room.points.map((p) => p.y);
    const minX = Math.min(...xs),
      minY = Math.min(...ys),
      width = Math.max(...xs) - minX,
      height = Math.max(...ys) - minY;
    const candidates: Point[] = [];
    for (let x = 1; x < 24; x++)
      for (let y = 1; y < 24; y++)
        candidates.push({
          x: minX + (width * x) / 24,
          y: minY + (height * y) / 24,
        });
    position = candidates
      .sort((a, b) => distance(a, room.center) - distance(b, room.center))
      .find((p) => pointInRoom(p, room.points) && isWalkable(p, colliders));
    if (position) break;
  }
  if (!position) {
    const b = bounds(project.walls),
      center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    position = isWalkable(center, colliders)?center:undefined;
    for(let distance=1;!position&&distance<=10;distance++){
      const p={x:b.minX-distance,y:b.maxY+distance};if(isWalkable(p,colliders))position=p;
    }
    position??={x:b.minX-11,y:b.maxY+11};
  }
  const doors = project.openings
    .filter((o) => o.kind === "door")
    .map((o) => {
      const wall = project.walls.find((w) => w.id === o.wallId)!;
      return pointOnWall(wall, o.offset);
    })
    .sort((a, b) => distance(a, position!) - distance(b, position!));
  const target = doors.find((p) => distance(p, position!) > 0.1);
  return {
    position,
    yaw: target ? Math.atan2(position.x - target.x, position.y - target.y) : 0,
  };
}
