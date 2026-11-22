import type { LawnTile, Point, Project } from "./model";
import { coverBounds, coverDepth, COVER_MIN_SIZE, COVER_MAX_SIZE, COVER_SITE_LIMIT } from "./groundSettings";
import { lawnFootprint, MIN_COVER_AREA } from "./lawnFootprint";

export const LAWN_LIMIT = 400;
const EDGE_TOLERANCE = 1e-6;
const COVER_MAGNET_DISTANCE = .1;
const precise = (n: number) => Math.round(n * 1e6) / 1e6;
export type CoverEdge = "minX" | "maxX" | "minY" | "maxY";
export const COVER_EDGES: readonly CoverEdge[] = ["minX", "maxX", "minY", "maxY"];
export const COVER_CORNERS = {
  "minX-minY": ["minX", "minY"], "minX-maxY": ["minX", "maxY"],
  "maxX-minY": ["maxX", "minY"], "maxX-maxY": ["maxX", "maxY"],
} as const;
export type CoverGrip = CoverEdge | keyof typeof COVER_CORNERS;
export const coverGripEdges = (grip: CoverGrip): readonly CoverEdge[] =>
  grip in COVER_CORNERS ? COVER_CORNERS[grip as keyof typeof COVER_CORNERS] : [grip as CoverEdge];
export const coverAxis = (edge: CoverEdge) => edge === "minX" || edge === "maxX" ? "x" : "y";
export const coverDirection = (edge: CoverEdge) => edge === "minX" || edge === "minY" ? -1 : 1;

export function lawnError(project: Project, tile: LawnTile, ignoreId?: string): string | null {
  if ([tile.size, coverDepth(tile)].some(n => !Number.isFinite(n) || n < COVER_MIN_SIZE - EDGE_TOLERANCE || n > COVER_MAX_SIZE + EDGE_TOLERANCE))
    return "Ширина и длина покрытия должны быть от 0,1 до 20 м.";
  const bounds = coverBounds(tile);
  if (Object.values(bounds).some(n => !Number.isFinite(n) || Math.abs(n) > COVER_SITE_LIMIT + EDGE_TOLERANCE))
    return "Покрытие выходит за границы участка (±500 м).";
  if (lawnFootprint(project, tile).area <= MIN_COVER_AREA)
    return "Этот участок целиком закрыт домом или стенами.";
  if ((project.lawn ?? []).some(other => {
    if (other.id === ignoreId) return false;
    const b = coverBounds(other);
    return overlap(bounds.minX,bounds.maxX,b.minX,b.maxX) && overlap(bounds.minY,bounds.maxY,b.minY,b.maxY);
  })) return "Здесь уже есть покрытие. Участки могут стыковаться краями.";
  if (!ignoreId && (project.lawn?.length ?? 0) >= LAWN_LIMIT)
    return "На участке можно уложить до 400 покрытий.";
  return null;
}

function overlap(min: number, max: number, otherMin: number, otherMax: number) {
  return Math.min(max,otherMax) - Math.max(min,otherMin) > EDGE_TOLERANCE;
}

export function snapCover(project: Project, tile: LawnTile, ignoreId?: string): LawnTile {
  const bounds = coverBounds(tile);
  const matches: {axis: keyof Point; offset: number}[] = [];
  for (const other of project.lawn ?? []) {
    if (other.id === ignoreId) continue;
    const b = coverBounds(other);
    if (overlap(bounds.minY,bounds.maxY,b.minY,b.maxY)) {
      for (const offset of [b.minX-bounds.maxX,b.maxX-bounds.minX])
        if (Math.abs(offset) <= COVER_MAGNET_DISTANCE + EDGE_TOLERANCE) matches.push({axis:"x",offset});
    }
    if (overlap(bounds.minX,bounds.maxX,b.minX,b.maxX)) {
      for (const offset of [b.minY-bounds.maxY,b.maxY-bounds.minY])
        if (Math.abs(offset) <= COVER_MAGNET_DISTANCE + EDGE_TOLERANCE) matches.push({axis:"y",offset});
    }
  }

  matches.sort((a,b) => Math.abs(a.offset)-Math.abs(b.offset));
  const x = matches.find(match => match.axis === "x");
  const y = matches.find(match => match.axis === "y");
  if (x && y) {
    const corner = {...tile,position:{x:tile.position.x+x.offset,y:tile.position.y+y.offset}};
    if (!lawnError(project,corner,ignoreId)) return corner;
  }
  for (const {axis,offset} of matches) {
    const aligned = {...tile,position:{...tile.position,[axis]:tile.position[axis]+offset}};
    if (!lawnError(project,aligned,ignoreId)) return aligned;
  }
  return tile;
}

export function resizeLawn(project: Pick<Project,"lawn">, tile: LawnTile, edge: CoverEdge, delta: number): LawnTile {
  const bounds = coverBounds(tile), axis = coverAxis(edge), direction = coverDirection(edge);
  const min = axis === "x" ? "minX" : "minY", max = axis === "x" ? "maxX" : "maxY";
  const crossMin = axis === "x" ? "minY" : "minX", crossMax = axis === "x" ? "maxY" : "maxX";
  const opposite = bounds[direction === 1 ? min : max];
  const current = bounds[edge];
  let limit = Math.min(COVER_MAX_SIZE, COVER_SITE_LIMIT - direction*opposite);
  for (const other of project.lawn ?? []) {
    if (other.id === tile.id) continue;
    const b = coverBounds(other);
    if (!overlap(bounds[crossMin],bounds[crossMax],b[crossMin],b[crossMax])) continue;
    const near = b[direction === 1 ? min : max];
    if (direction * (near-current) >= -EDGE_TOLERANCE) limit = Math.min(limit, direction*(near-opposite));
  }
  const length = Math.max(COVER_MIN_SIZE, Math.min(limit, direction*(current+delta-opposite)));
  const position: Point = {...tile.position, [axis]:opposite+direction*length/2};
  return {...tile, position, size:axis === "x" ? length : tile.size, depth:axis === "y" ? length : coverDepth(tile)};
}

export function resizeCover(project: Pick<Project,"lawn">, tile: LawnTile, grip: CoverGrip, delta: Point): LawnTile {
  const [first, second] = coverGripEdges(grip);
  const resize = (from: LawnTile, edge: CoverEdge) => resizeLawn(project,from,edge,delta[coverAxis(edge)]);
  const firstPass = resize(tile,first);
  if (!second) return firstPass;

  const xFirst = resize(firstPass,second);
  const yFirst = resize(resize(tile,second),first);
  const original = coverBounds(tile);
  const distance = (candidate: LawnTile) => {
    const bounds = coverBounds(candidate);
    return Math.hypot(bounds[first]-original[first]-delta.x,bounds[second]-original[second]-delta.y);
  };
  // If the corner meets another cover, slide along the closer of its two edges.
  return distance(xFirst) <= distance(yFirst) ? xFirst : yFirst;
}

export const lawnArea = (project: Pick<Project, "walls" | "plinth" | "lawn">) =>
  precise((project.lawn ?? []).reduce((total, tile) => total + lawnFootprint(project, tile).area, 0));
