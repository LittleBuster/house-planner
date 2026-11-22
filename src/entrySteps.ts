import { houseFloorLevel, plinthSettings } from "./houseFinishes";
import { pointOnWall, wallLength, type Opening, type Point, type Project, type Wall } from "./model";
import { buildingFootprints, pointInRoofContour } from "./roofModel";

export const MAX_STEP_RISE = .18;

export function entryExteriorSide(project: Project, opening: Opening, wall: Wall): 1 | -1 | null {
  if (opening.kind !== "door" && !opening.french) return null;
  const center = pointOnWall(wall, opening.offset);
  const length = wallLength(wall), distance = wall.thickness / 2 + .015;
  const nx = (wall.a.y - wall.b.y) / length, ny = (wall.b.x - wall.a.x) / length;
  const buildings = buildingFootprints(project.walls);
  const outside = (side: number) => !buildings.some(({contour}) => pointInRoofContour({
    x: center.x + side * nx * distance, y: center.y + side * ny * distance,
  }, contour));
  const positive = outside(1), negative = outside(-1);
  return positive === negative ? null : positive ? 1 : -1;
}

type EntryTread = { center: Point; axis: Point; width: number; depth: number; height: number };
const treadCache = new WeakMap<Project, EntryTread[]>();

export function entryTreads(project: Project): EntryTread[] {
  const cached = treadCache.get(project);
  if (cached) return cached;
  const walls = new Map(project.walls.map(wall => [wall.id, wall]));
  const height = houseFloorLevel(project), count = Math.ceil(height / MAX_STEP_RISE);
  const treads: EntryTread[] = [];
  for (const opening of project.openings) {
    if (!opening.entrySteps) continue;
    const wall = walls.get(opening.wallId);
    if (!wall) continue;
    const side = entryExteriorSide(project, opening, wall);
    if (!side) continue;
    const length = wallLength(wall);
    const axis = {x:(wall.b.x-wall.a.x)/length,y:(wall.b.y-wall.a.y)/length};
    const origin = pointOnWall(wall,opening.offset);
    const width = opening.width + .08;
    let offset = wall.thickness/2 - Math.min(plinthSettings(project).recess,wall.thickness*.4);
    for (let index = 0; index < count; index++) {
      const depth = index === 0 ? .55 : .30;
      const middle = side * (offset + depth/2);
      treads.push({
        center:{x:origin.x-axis.y*middle,y:origin.y+axis.x*middle},
        axis,width,depth,height:height*(count-index)/count,
      });
      offset += depth;
    }
  }
  treadCache.set(project,treads);
  return treads;
}
