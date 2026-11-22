import { PLANT_VARIANTS } from "./plantManifest";
import { plantHeightLimits } from "./plantSettings";
import { validGroundCover, coverDepth, COVER_MIN_SIZE, COVER_MAX_SIZE, COVER_SITE_LIMIT, type GroundCover } from "./groundSettings";
import {validInterior,validPlinth,validDoorFinish,type InteriorSettings,type PlinthSettings,type DoorFinish} from "./houseFinishes";
import { validWindowSections, type WindowVentState } from "./windowSections";
import { validWindowFrameFinish, windowFrameFinish, type WindowFrameFinish } from "./windowFinishes";
import {constrainWallEndpoint,wallEndAtFirstContact} from "./wallConstraints";
import {wallBody} from "./wallBodies";
import {validRoofSettings,type RoofSettings} from "./roofSettings";
import {validSceneDisplay,type SceneDisplay} from "./sceneDisplay";
import {validSiteGrid,type SiteGridSettings} from "./siteGrid";
import {validFacadeSettings,type FacadeSettings} from "./facadeSettings";
import {validFloorFinish,type FloorFinish,type RoomFloor} from "./floorSettings";
import {FENCE_COLORS,FENCE_TYPES,FENCE_LENGTH,FENCE_LIMIT,FENCE_MIN_LENGTH,type Fence} from "./fenceSettings";
import {GATE_LIMIT,type Gate} from "./gateSettings";
import {gatePlacementError} from "./gatePlacement";
export type Point = { x: number; y: number };
export type Wall = {
  id: string;
  a: Point;
  b: Point;
  thickness: number;
  height: number;
};
export type Opening = {
  id: string;
  wallId: string;
  kind: "door" | "window";
  offset: number;
  width: number;
  height: number;
  sill: number;
  french?: boolean;
  entrySteps?: boolean;
  sectionWidths?: number[];
  ventSections?: WindowVentState[];
  mirroredVents?: number[];
  frameFinish?: WindowFrameFinish;
  doorFinish?: DoorFinish;
  doorSwing?: 1 | -1;
  doorMirrored?: boolean;
  open?: boolean;
};
export type PlantKind = "birch" | "pine" | "fir" | "maple" | "groundcover" | "grass";
export type Plant = {
  id: string;
  kind: PlantKind;
  position: Point;
  height: number;
  rotation: number;
  seed: number;
  variant?: string;
};
export type LawnTile = {
  id: string;
  position: Point;
  size: number;
  depth?: number;
  material?: GroundCover;
};
export type Project = {
  version: 1;
  name: string;
  walls: Wall[];
  openings: Opening[];
  plants?: Plant[];
  lawn?: LawnTile[];
  roof?: RoofSettings;
  display?: SceneDisplay;
  siteGrid?: SiteGridSettings;
  facade?: FacadeSettings;
  interior?: InteriorSettings;
  plinth?: PlinthSettings;
  doorFinish?: DoorFinish;
  floor?: FloorFinish;
  roomFloors?: RoomFloor[];
  fences?: Fence[];
  gates?: Gate[];
};
export type Room = { id: string; points: Point[]; area: number; center: Point };
export const uid = () => crypto.randomUUID();
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export const format = (v: number, digits = 2) =>
  v.toLocaleString("ru-RU", { maximumFractionDigits: digits });
export const wallLength = (w: Wall) => distance(w.a, w.b);
export const OPENING_END_MARGIN = 0.12;
export const OPENING_GAP = 0.1;
export const MIN_OPENING_WIDTH = 0.3;
export const MAX_OPENING_WIDTH = 10;
export const pointOnWall = (w: Wall, offset: number): Point => {
  const t = offset / wallLength(w);
  return { x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t };
};
export function projectToWall(p: Point, w: Wall) {
  const length = wallLength(w);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) /
        (length * length),
    ),
  );
  const point = {
    x: w.a.x + t * (w.b.x - w.a.x),
    y: w.a.y + t * (w.b.y - w.a.y),
  };
  return { point, offset: t * length, distance: distance(point, p) };
}
export function nearestWall(p: Point, walls: Wall[]) {
  return walls
    .map((wall) => ({ wall, ...projectToWall(p, wall) }))
    .sort((a, b) => a.distance - b.distance)[0];
}
export function bounds(walls: Wall[]) {
  if (!walls.length) return { minX: 0, minY: 0, maxX: 10, maxY: 7 };
  const points = walls.flatMap((w) => [w.a, w.b]);
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}
export function canPlaceOpening(
  project: Project,
  item: Opening,
  ignoreId?: string,
) {
  const wall = project.walls.find((w) => w.id === item.wallId);
  if (
    !wall ||
    !validWindowSections(item) ||
    !validWindowFrameFinish(item) ||
    item.width < MIN_OPENING_WIDTH - 1e-8 ||
    item.width > MAX_OPENING_WIDTH + 1e-8 ||
    item.height < 0.3 ||
    item.sill < 0 ||
    item.sill + item.height > wall.height + 0.001
  )
    return false;
  if (
    item.offset - item.width / 2 < OPENING_END_MARGIN - 1e-8 ||
    item.offset + item.width / 2 > wallLength(wall) - OPENING_END_MARGIN + 1e-8
  )
    return false;
  return !project.openings.some(
    (o) =>
      o.wallId === item.wallId &&
      o.id !== ignoreId &&
      Math.abs(o.offset - item.offset) < (o.width + item.width) / 2 + OPENING_GAP - 1e-8,
  );
}
export function resizeWall(
  project: Project,
  id: string,
  updates: Partial<Wall>,
): Project {
  const previous = project.walls.find((w) => w.id === id)!;
  const next = { ...previous, ...updates,
    ...(updates.a?{a:constrainWallEndpoint(project,id,"a",updates.a)}:{}),
    ...(updates.b?{b:constrainWallEndpoint(project,id,"b",updates.b)}:{}),
  };
  const walls = project.walls.map((w) => {
    if (w.id === id) return next;
    let a = w.a,
      b = w.b;
    if (updates.a && distance(a, previous.a) < 0.001) a = next.a;
    if (updates.b && distance(a, previous.b) < 0.001) a = next.b;
    if (updates.a && distance(b, previous.a) < 0.001) b = next.a;
    if (updates.b && distance(b, previous.b) < 0.001) b = next.b;
    return { ...w, a, b };
  });
  // Keep openings in metres along their wall; discard only those invalidated by the edit.
  const result = {
    ...project,
    walls: walls.filter((w) => wallLength(w) >= 0.1),
    openings: [] as Opening[],
  };
  for (const o of project.openings)
    if (canPlaceOpening(result, o)) result.openings.push(o);
  return result;
}
export function resizeWallToBodyLength(project:Project,id:string,length:number):Project {
  return resizeWallToMeasuredLength(project,id,length,false);
}
export function wallMeasuredLength(wall:Wall,walls:Wall[],outside:boolean) {
  const body=wallBody(wall,walls);
  return outside?body.outerEnd-body.outerStart:body.length;
}
export function resizeWallToMeasuredLength(project:Project,id:string,length:number,outside:boolean):Project {
  const original=project.walls.find(w=>w.id===id)!;
  const current=wallMeasuredLength(original,project.walls,outside),axisLength=wallLength(original);
  let best=project,error=Math.abs(length-current);
  if(error<.0001)return project;
  const connected=(p:Point)=>project.walls.some(w=>w.id!==id&&projectToWall(p,w).distance<.001);
  const ends:("a"|"b")[]=outside?(connected(original.b)&&!connected(original.a)?["a","b"]:["b","a"]):["b"];
  for(const end of ends){
    const anchor=end==="b"?original.a:original.b;
    let desired=axisLength+length-current;
    for(let iteration=0;iteration<16;iteration++){
      desired=Math.max(.2,Math.min(102,desired));
      const point={x:anchor.x+(original[end].x-anchor.x)*desired/axisLength,y:anchor.y+(original[end].y-anchor.y)*desired/axisLength};
      if(Math.abs(point.x)>500||Math.abs(point.y)>500)break;
      const candidate=resizeWall(project,id,{[end]:point});
      const wall=candidate.walls.find(w=>w.id===id)!;
      const actual=wallMeasuredLength(wall,candidate.walls,outside),nextError=Math.abs(length-actual);
      if(nextError<error){best=candidate;error=nextError;}
      if(nextError<.0001)return candidate;
      if(Math.abs(wallLength(wall)-desired)>.0001)break;
      desired+=length-actual;
    }
  }
  return best;
}

export function wallAtOutsideLength(walls:Wall[],wall:Wall,length:number):Wall|null {
  const direction=wallLength(wall);
  if(direction<1e-8||!Number.isFinite(length))return null;
  let desired=length;
  for(let iteration=0;iteration<8;iteration++){
    const b=wallEndAtFirstContact(wall.a,{
      x:wall.a.x+(wall.b.x-wall.a.x)*desired/direction,
      y:wall.a.y+(wall.b.y-wall.a.y)*desired/direction,
    },walls,wall.thickness);
    if(distance(wall.a,b)<.2||Math.abs(b.x)>500||Math.abs(b.y)>500)return null;
    const next={...wall,b},actual=wallMeasuredLength(next,[...walls,next],true);
    if(Math.abs(actual-length)<.0001)return next;
    desired+=length-actual;
    if(desired<.2||desired>102)break;
  }
  return null;
}
export function demoProject(): Project {
  const w = (
    id: string,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    thickness = 0.22,
  ): Wall => ({
    id,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thickness,
    height: 2.8,
  });
  return {
    version: 1,
    name: "Дом у озера",
    walls: [
      w("w1", 0, 0, 10, 0),
      w("w2", 10, 0, 10, 7),
      w("w3", 10, 7, 0, 7),
      w("w4", 0, 7, 0, 0),
      w("w5", 6, 0, 6, 7, 0.16),
      w("w6", 0, 4, 6, 4, 0.16),
      w("w7", 6, 3.5, 10, 3.5, 0.16),
    ],
    openings: [
      {
        id: "o1",
        wallId: "w1",
        kind: "window",
        offset: 2.5,
        width: 2.2,
        height: 1.4,
        sill: 0.9,
      },
      {
        id: "o2",
        wallId: "w1",
        kind: "window",
        offset: 8,
        width: 1.6,
        height: 1.4,
        sill: 0.9,
      },
      {
        id: "o3",
        wallId: "w2",
        kind: "window",
        offset: 5.3,
        width: 1.6,
        height: 1.4,
        sill: 0.9,
      },
      {
        id: "o4",
        wallId: "w3",
        kind: "door",
        offset: 5,
        width: 1,
        height: 2.1,
        sill: 0,
      },
      {
        id: "o5",
        wallId: "w4",
        kind: "window",
        offset: 1.7,
        width: 1.6,
        height: 1.4,
        sill: 0.9,
      },
      {
        id: "o6",
        wallId: "w5",
        kind: "door",
        offset: 2.6,
        width: 0.9,
        height: 2.1,
        sill: 0,
      },
      {
        id: "o7",
        wallId: "w5",
        kind: "door",
        offset: 5.3,
        width: 0.9,
        height: 2.1,
        sill: 0,
      },
      {
        id: "o8",
        wallId: "w6",
        kind: "door",
        offset: 4.8,
        width: 0.9,
        height: 2.1,
        sill: 0,
      },
      {
        id: "o9",
        wallId: "w7",
        kind: "door",
        offset: 1.1,
        width: 0.9,
        height: 2.1,
        sill: 0,
      },
    ],
  };
}

// Extract bounded faces from the planar wall graph. Intersections and T-junctions
// are split into graph edges first, so rooms need not be separate wall objects.
export function findRooms(walls: Wall[]): Room[] {
  const cuts = walls.map(() => [0, 1]);
  const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i],
        b = walls[j];
      const r = { x: a.b.x - a.a.x, y: a.b.y - a.a.y },
        s = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
      const q = { x: b.a.x - a.a.x, y: b.a.y - a.a.y },
        den = cross(r, s);
      if (Math.abs(den) < 1e-8) {
        for (const p of [b.a, b.b]) {
          const hit = projectToWall(p, a);
          if (hit.distance < 1e-5) cuts[i].push(hit.offset / wallLength(a));
        }
        for (const p of [a.a, a.b]) {
          const hit = projectToWall(p, b);
          if (hit.distance < 1e-5) cuts[j].push(hit.offset / wallLength(b));
        }
        continue;
      }
      const t = cross(q, s) / den,
        u = cross(q, r) / den;
      if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) {
        cuts[i].push(Math.max(0, Math.min(1, t)));
        cuts[j].push(Math.max(0, Math.min(1, u)));
      }
    }
  const vertices: Point[] = [],
    adj: Map<number,string>[] = [];
  const vertex = (p: Point) => {
    let k = vertices.findIndex((v) => distance(v, p) < 1e-5);
    if (k < 0) {
      k = vertices.length;
      vertices.push(p);
      adj.push(new Map());
    }
    return k;
  };
  walls.forEach((w, i) => {
    const values = [
      ...new Set(cuts[i].map((t) => Math.round(t * 1e7) / 1e7)),
    ].sort((a, b) => a - b);
    for (let j = 1; j < values.length; j++) {
      const a = vertex(pointOnWall(w, values[j - 1] * wallLength(w))),
        b = vertex(pointOnWall(w, values[j] * wallLength(w)));
      if (a !== b && !adj[a].has(b)) {
        adj[a].set(b,"+"+w.id);
        adj[b].set(a,"-"+w.id);
      }
    }
  });
  const sorted = adj.map((set, i) =>
    [...set.keys()].sort(
      (a, b) =>
        Math.atan2(
          vertices[a].y - vertices[i].y,
          vertices[a].x - vertices[i].x,
        ) -
        Math.atan2(
          vertices[b].y - vertices[i].y,
          vertices[b].x - vertices[i].x,
        ),
    ),
  );
  const seen = new Set<string>(),
    rooms: Room[] = [];
  for (let a = 0; a < vertices.length; a++)
    for (const b of sorted[a]) {
      if (seen.has(`${a}:${b}`)) continue;
      const path: number[] = [];
      let u = a,
        v = b;
      let closed = false;
      for (let n = 0; n < vertices.length * 4 + 4; n++) {
        const key = `${u}:${v}`;
        if (seen.has(key)) break;
        seen.add(key);
        path.push(u);
        const neighbours = sorted[v],
          index = neighbours.indexOf(u);
        const next =
          neighbours[(index - 1 + neighbours.length) % neighbours.length];
        u = v;
        v = next;
        if (u === a && v === b) {
          closed = true;
          break;
        }
      }
      if (!closed || path.length < 3) continue;
      const points = path.map((i) => vertices[i]);
      let twice = 0,
        cx = 0,
        cy = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i],
          q = points[(i + 1) % points.length];
        const c = p.x * q.y - q.x * p.y;
        twice += c;
        cx += (p.x + q.x) * c;
        cy += (p.y + q.y) * c;
      }
      if (twice > 0.2) {
        const sides = new Set(path.map((vertex,i) => adj[vertex].get(path[(i+1)%path.length])!));
        // A wall ending inside a room is traversed in both directions.
        const boundary = [...sides].filter(side => !sides.has((side[0] === "+" ? "-" : "+")+side.slice(1)));
        rooms.push({
          id: JSON.stringify(boundary.sort()),
          points,
          area: twice / 2,
          center: { x: cx / (3 * twice), y: cy / (3 * twice) },
        });
      }
    }
  return rooms.sort(
    (a, b) => a.center.y - b.center.y || a.center.x - b.center.x,
  );
}

export function parseProject(raw: string): Project {
  if (raw.length > 5_000_000)
    throw new Error("Файл слишком большой. Максимум — 5 МБ.");
  let p: any;
  try {
    p = JSON.parse(raw);
  } catch {
    throw new Error("Не удалось прочитать JSON-файл.");
  }
  const finite = (v: any, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const point = (v: any) =>
    v && finite(v.x, -500, 500) && finite(v.y, -500, 500);
  if (
    p?.version !== 1 ||
    typeof p.name !== "string" ||
    !Array.isArray(p.walls) ||
    !Array.isArray(p.openings) ||
    p.walls.length > 300 ||
    p.openings.length > 1000
  )
    throw new Error("Это не проект ДомПлан версии 1.");
  const ids = new Set<string>();
  const id = (v: any) => {
    if (typeof v !== "string" || !v.length || v.length > 100 || ids.has(v))
      return false;
    ids.add(v);
    return true;
  };
  const walls: Wall[] = p.walls.map((w: any) => {
    if (
      !w ||
      !id(w.id) ||
      !point(w.a) ||
      !point(w.b) ||
      !finite(w.thickness, 0.05, 1) ||
      !finite(w.height, 0.5, 10) ||
      distance(w.a, w.b) < 0.1
    )
      throw new Error("В файле есть стена с некорректными размерами.");
    return {
      id: w.id,
      a: { x: w.a.x, y: w.a.y },
      b: { x: w.b.x, y: w.b.y },
      thickness: w.thickness,
      height: w.height,
    };
  });
  const result: Project = {
    version: 1,
    name: p.name.slice(0, 80),
    walls,
    openings: [],
  };
  for (const o of p.openings) {
    if (
      !o ||
      !id(o.id) ||
      !["door", "window"].includes(o.kind) ||
      typeof o.wallId !== "string" ||
      !finite(o.offset, 0, 1500) ||
      !finite(o.width, 0.3, 10) ||
      !finite(o.height, 0.3, 10) ||
      !finite(o.sill, 0, 10) ||
      (o.doorFinish!==undefined && (o.kind!=="door"||!validDoorFinish(o.doorFinish))) ||
      (o.doorSwing!==undefined && (o.kind!=="door" || o.doorSwing!==1 && o.doorSwing!==-1)) ||
      (o.doorMirrored!==undefined && (o.kind!=="door"||typeof o.doorMirrored!=="boolean")) ||
      (o.open!==undefined && (o.kind!=="door"||typeof o.open!=="boolean")) ||
      (o.french !== undefined && (o.kind !== "window" || typeof o.french !== "boolean")) ||
      (o.entrySteps !== undefined && (typeof o.entrySteps !== "boolean" || o.kind !== "door" && !o.french)) ||
      !canPlaceOpening(result, o)
    )
      throw new Error("В файле есть некорректный или пересекающийся проём.");
    result.openings.push({
      id: o.id,
      wallId: o.wallId,
      kind: o.kind,
      offset: o.offset,
      width: o.width,
      height: o.height,
      sill: o.sill,
      ...(o.french === undefined ? {} : { french: o.french }),
      ...(o.entrySteps === undefined ? {} : { entrySteps: o.entrySteps }),
      ...(o.sectionWidths === undefined ? {} : { sectionWidths: [...o.sectionWidths] }),
      ...(o.ventSections === undefined ? {} : { ventSections: [...o.ventSections] }),
      ...(o.mirroredVents === undefined ? {} : { mirroredVents: [...o.mirroredVents] }),
      ...(o.frameFinish === undefined ? {} : { frameFinish: windowFrameFinish(o) }),
      ...(o.doorFinish===undefined?{}:{doorFinish:o.doorFinish}),
      ...(o.doorSwing===undefined?{}:{doorSwing:o.doorSwing}),
      ...(o.doorMirrored===undefined?{}:{doorMirrored:o.doorMirrored}),
      ...(o.open===undefined?{}:{open:o.open}),
    });
  }
  if(p.facade!==undefined){
    if(!validFacadeSettings(p.facade))throw new Error("В файле некорректные параметры отделки фасада.");
    result.facade={kind:p.facade.kind,color:p.facade.color};
  }
  if(p.interior!==undefined){
    if(!validInterior(p.interior))throw new Error("В файле некорректная отделка внутренних стен.");
    result.interior={kind:p.interior.kind,color:p.interior.color};
  }
  const readFloor = (value: unknown): FloorFinish => {
    if (!validFloorFinish(value)) throw new Error("В файле некорректное покрытие пола.");
    const {kind,texture,color,angle} = value;
    return {kind,texture,color,angle};
  };
  if (p.floor !== undefined) result.floor = readFloor(p.floor);
  if (p.roomFloors !== undefined) {
    if (!Array.isArray(p.roomFloors)) throw new Error("В файле некорректные покрытия комнат.");
    const roomIds = new Set<string>();
    result.roomFloors = p.roomFloors.map((entry: unknown) => {
      const room = entry as RoomFloor;
      if (!room || typeof room.roomId !== "string" || !room.roomId || roomIds.has(room.roomId))
        throw new Error("В файле некорректные покрытия комнат.");
      roomIds.add(room.roomId);
      return {roomId:room.roomId,finish:readFloor(room.finish)};
    });
  }
  if(p.plinth!==undefined){
    if(!validPlinth(p.plinth))throw new Error("В файле некорректные параметры цоколя.");
    result.plinth={color:p.plinth.color,height:p.plinth.height,recess:p.plinth.recess};
  }
  if(p.doorFinish!==undefined){
    if(!validDoorFinish(p.doorFinish))throw new Error("В файле некорректный цвет дверей.");
    result.doorFinish=p.doorFinish;
  }
  if(p.siteGrid!==undefined){
    if(!validSiteGrid(p.siteGrid))throw new Error("В файле некорректный размер сетки участка.");
    result.siteGrid={lawnSize:p.siteGrid.lawnSize};
  }
  if(p.roof!==undefined){
    if(!validRoofSettings(p.roof))throw new Error("В файле некорректные параметры крыши.");
    result.roof={type:p.roof.type,height:p.roof.height,overhang:p.roof.overhang,direction:p.roof.direction,
      ...(p.roof.color===undefined?{}:{color:p.roof.color}),...(p.roof.surface===undefined?{}:{surface:p.roof.surface})};
  }
  if(p.display!==undefined){
    if(!validSceneDisplay(p.display))throw new Error("В файле некорректные настройки видимости.");
    result.display={house:p.display.house,roof:p.display.roof,landscape:p.display.landscape};
  }
  if (p.plants !== undefined) {
    if (!Array.isArray(p.plants) || p.plants.length > 100)
      throw new Error("В проекте может быть не более 100 растений.");
    result.plants = p.plants.map((plant: any): Plant => {
      if (
        !plant ||
        !id(plant.id) ||
        !["birch", "pine", "fir", "maple", "groundcover", "grass", "cedar", "spruce"].includes(plant.kind) ||
        !point(plant.position) ||
        !finite(plant.height, plantHeightLimits(plant.kind).min, plantHeightLimits(plant.kind).max) ||
        !finite(plant.rotation, 0, 360) ||
        !Number.isSafeInteger(plant.seed) ||
        plant.seed < 0 ||
        plant.seed > 0xffffffff
      )
        throw new Error("В файле есть растение с некорректными параметрами.");
      const kind: PlantKind = plant.kind === "cedar" || plant.kind === "spruce" ? "fir" : plant.kind;
      if (plant.variant !== undefined && !PLANT_VARIANTS[kind].some(v => v.id === plant.variant))
        throw new Error("В файле указана неизвестная форма растения.");
      return {
        id: plant.id,
        kind,
        position: { x: plant.position.x, y: plant.position.y },
        height: plant.height,
        rotation: plant.rotation,
        seed: plant.seed,
        ...(plant.variant !== undefined ? { variant: plant.variant } : {}),
      };
    });
  }
  if (p.lawn !== undefined) {
    if (!Array.isArray(p.lawn) || p.lawn.length > 400)
      throw new Error("В проекте может быть не более 400 участков покрытия.");
    result.lawn = p.lawn.map((tile: any): LawnTile => {
      if (!tile || !id(tile.id) || !point(tile.position) || !finite(tile.size, COVER_MIN_SIZE, COVER_MAX_SIZE) ||
        (tile.depth !== undefined && !finite(tile.depth, COVER_MIN_SIZE, COVER_MAX_SIZE)) ||
        Math.abs(tile.position.x) + tile.size / 2 > COVER_SITE_LIMIT+1e-6 || Math.abs(tile.position.y) + coverDepth(tile) / 2 > COVER_SITE_LIMIT+1e-6 ||
        (tile.material !== undefined && !validGroundCover(tile.material)))
        throw new Error("В файле есть участок покрытия с некорректными параметрами.");
      return { id: tile.id, position: { x: tile.position.x, y: tile.position.y }, size: tile.size,
        ...(tile.depth === undefined ? {} : { depth: tile.depth }),
        ...(tile.material === undefined ? {} : { material: tile.material }) };
    });
  }
  if (p.fences !== undefined) {
    if (!Array.isArray(p.fences) || p.fences.length > FENCE_LIMIT)
      throw new Error("В проекте слишком много секций забора.");
    result.fences = p.fences.map((fence: any): Fence => {
      if (!fence || !id(fence.id) || !point(fence.a) || !point(fence.b) ||
          distance(fence.a,fence.b)<FENCE_MIN_LENGTH-1e-6 || distance(fence.a,fence.b)>FENCE_LENGTH+1e-6 ||
          (fence.flipped!==undefined && typeof fence.flipped!=="boolean") ||
          !FENCE_TYPES.some(item=>item.id===fence.kind) || !FENCE_COLORS.some(item=>item.id===fence.color))
        throw new Error("В файле есть некорректная секция забора.");
      return {id:fence.id,kind:fence.kind,color:fence.color,
        ...(fence.flipped===undefined ? {} : {flipped:fence.flipped}),
        a:{x:fence.a.x,y:fence.a.y},b:{x:fence.b.x,y:fence.b.y}};
    });
  }
  if (p.gates !== undefined) {
    if (!Array.isArray(p.gates) || p.gates.length>GATE_LIMIT) throw new Error("В проекте слишком много ворот.");
    const ids=new Set<string>();
    const gates:Gate[]=p.gates.map((gate:any):Gate=>{
      if (!gate || !id(gate.id) || ids.has(gate.id) || !point(gate.a) || !point(gate.b) ||
          !FENCE_TYPES.some(item=>item.id===gate.kind) || !FENCE_COLORS.some(item=>item.id===gate.color) ||
          (gate.swing!=="in" && gate.swing!=="out") ||
          (gate.wicket!==undefined && gate.wicket!==true) ||
          (gate.open!==undefined && typeof gate.open!=="boolean") ||
          (gate.mirrored!==undefined && typeof gate.mirrored!=="boolean") ||
          (gate.flipped!==undefined && typeof gate.flipped!=="boolean"))
        throw new Error("В файле есть ворота с некорректными параметрами.");
      ids.add(gate.id);
      return {id:gate.id,kind:gate.kind,color:gate.color,swing:gate.swing,
        a:{x:gate.a.x,y:gate.a.y},b:{x:gate.b.x,y:gate.b.y},
        ...(gate.wicket ? {wicket:true as const} : {}),
        ...(gate.open===undefined ? {} : {open:gate.open}),
        ...(gate.mirrored===undefined ? {} : {mirrored:gate.mirrored}),
        ...(gate.flipped===undefined ? {} : {flipped:gate.flipped})};
    });
    result.gates=gates;
    for (const gate of gates) {
      const error=gatePlacementError(result,gate);
      if (error) throw new Error(error);
    }
  }
  return result;
}
