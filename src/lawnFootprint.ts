import ClipperLib from "clipper-lib";
import type { LawnTile, Point, Project } from "./model";
import { foundationPaths } from "./plinthGeometry";
import { plinthSettings } from "./houseFinishes";
import { insidePolygon } from "./landscape";
import { coverBounds, coverDepth } from "./groundSettings";

const SCALE = 10_000;
export const MIN_COVER_AREA = 1e-6;
export type SiteFootprintProject = Pick<Project, "walls" | "plinth">;
type Rect = { minX: number; minY: number; maxX: number; maxY: number };
type Part = { outer: Point[]; holes: Point[][] };
export type LawnFootprint = { parts: Part[]; area: number; full: boolean };
type Site = { recess: number; obstacles: { path: ClipperLib.Path; bounds: Rect }[]; cells: Map<string, LawnFootprint> };
const sites = new WeakMap<Project["walls"], Site>();
const toPath = (points: Point[]) => points.map(({x,y}) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
const toPoints = (path: ClipperLib.Path) => path.map(({X,Y}) => ({ x: X / SCALE, y: Y / SCALE }));
const corners = (r: Rect) => [{x:r.minX,y:r.minY},{x:r.maxX,y:r.minY},{x:r.maxX,y:r.maxY},{x:r.minX,y:r.maxY}];

function siteFor(project: SiteFootprintProject): Site {
  const recess = plinthSettings(project).recess;
  const cached = sites.get(project.walls);
  if (cached?.recess === recess) return cached;
  const obstacles = foundationPaths(project).map(path => {
    const xs = path.map(p => p.X / SCALE), ys = path.map(p => p.Y / SCALE);
    return {path, bounds: {minX:Math.min(...xs), minY:Math.min(...ys), maxX:Math.max(...xs), maxY:Math.max(...ys)}};
  });
  const site = {recess, obstacles, cells: new Map<string, LawnFootprint>()};
  sites.set(project.walls, site);
  return site;
}

function uncovered(rect: Rect, site: Site): LawnFootprint {
  const fullArea = (rect.maxX-rect.minX)*(rect.maxY-rect.minY);
  const outline = corners(rect);
  const paths = site.obstacles.filter(({bounds:b}) => b.minX < rect.maxX && b.maxX > rect.minX && b.minY < rect.maxY && b.maxY > rect.minY);
  if (!paths.length) return {parts:[{outer:outline,holes:[]}], area:fullArea, full:true};
  const clipper = new ClipperLib.Clipper(), tree = new ClipperLib.PolyTree();
  clipper.AddPath(toPath(outline), ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(paths.map(p => p.path), ClipperLib.PolyType.ptClip, true);
  clipper.Execute(ClipperLib.ClipType.ctDifference, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const parts: Part[] = [];
  let area = 0;
  const visit = (node: ClipperLib.PolyNode) => {
    const path = node.Contour();
    if (path.length) {
      area += ClipperLib.Clipper.Area(path) / SCALE**2;
      if (!node.IsHole()) parts.push({outer:toPoints(path), holes:node.Childs().map(hole => toPoints(hole.Contour()))});
    }
    for (const child of node.Childs()) visit(child);
  };
  visit(tree);
  return {parts, area, full: Math.abs(area - fullArea) < MIN_COVER_AREA};
}

export function lawnFootprint(project: SiteFootprintProject, tile: Pick<LawnTile, "position" | "size" | "depth">): LawnFootprint {
  const site = siteFor(project), key = `${tile.position.x}:${tile.position.y}:${tile.size}:${coverDepth(tile)}`;
  const cached = site.cells.get(key);
  if (cached) return cached;
  const footprint = uncovered(coverBounds(tile), site);
  if (site.cells.size >= 1024) site.cells.delete(site.cells.keys().next().value!);
  site.cells.set(key, footprint);
  return footprint;
}

export function onLawnFootprint(point: Point, footprint: LawnFootprint) {
  return footprint.parts.some(part => insidePolygon(point, part.outer) && !part.holes.some(hole => insidePolygon(point, hole)));
}
