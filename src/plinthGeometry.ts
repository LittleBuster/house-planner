import ClipperLib from "clipper-lib";
import * as THREE from "three";
import type {Point,Project,Wall} from "./model";
import {buildingFootprints,contours} from "./roofModel";
import {findRooms} from "./model";
import {wallBodies,type WallBody} from "./wallBodies";
import {houseFloorLevel,plinthSettings} from "./houseFinishes";

const SCALE=10000;
const intPath=(points:Point[])=>points.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}));
const domainCache=new WeakMap<Project["walls"],Map<number,ClipperLib.Paths>>();
function insetDomain(walls:Project["walls"],recess:number){
  let cache=domainCache.get(walls);if(!cache){cache=new Map();domainCache.set(walls,cache);}
  let paths=cache.get(recess);if(paths)return paths;
  const original=buildingFootprints(walls).flatMap(b=>[intPath(b.contour.outer),...b.contour.holes.map(intPath)]);
  paths=[];
  if(original.length){const offset=new ClipperLib.ClipperOffset(2,.1);offset.AddPaths(original,ClipperLib.JoinType.jtMiter,ClipperLib.EndType.etClosedPolygon);offset.Execute(paths,-recess*SCALE);}
  cache.set(recess,paths);return paths;
}
function clipToPlinth(polygon: Point[], domain: ClipperLib.Paths): ClipperLib.Paths {
  const clipper = new ClipperLib.Clipper(), paths: ClipperLib.Paths = [];
  clipper.AddPath(intPath(polygon), ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(domain, ClipperLib.PolyType.ptClip, true);
  clipper.Execute(ClipperLib.ClipType.ctIntersection, paths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return paths;
}

// Use the same lower wall edge for the site surface and the visible plinth.
export function wallFootprintAtGround(wall: Wall, body: WallBody, project: Pick<Project, "walls" | "plinth">): Point[][] {
  if (body.polygon.length < 3) return [];
  const domain = insetDomain(project.walls, Math.min(plinthSettings(project).recess, wall.thickness * .4));
  const pieces = domain.length ? clipToPlinth(body.polygon, domain) : [];
  return pieces.length
    ? pieces.filter(path => ClipperLib.Clipper.Area(path) > 0).map(path => path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE })))
    : [body.polygon];
}

const foundationCache = new WeakMap<Project["walls"], {recess: number; paths: ClipperLib.Paths}>();

export function foundationPaths(project: Pick<Project, "walls" | "plinth">): ClipperLib.Paths {
  const {recess} = plinthSettings(project);
  const cached = foundationCache.get(project.walls);
  if (cached?.recess === recess) return cached.paths;

  const bodies = wallBodies(project.walls);
  const polygons = findRooms(project.walls).map(room => room.points);
  for (const wall of project.walls) polygons.push(...wallFootprintAtGround(wall, bodies.get(wall.id)!, project));
  const subjects = polygons.map(polygon => {
    const path = intPath(polygon);
    return ClipperLib.Clipper.Orientation(path) ? path : path.reverse();
  });
  const paths: ClipperLib.Paths = [];
  if (subjects.length) {
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(subjects, ClipperLib.PolyType.ptSubject, true);
    clipper.Execute(ClipperLib.ClipType.ctUnion, paths, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  }
  foundationCache.set(project.walls, {recess, paths});
  return paths;
}

export function foundationContains(paths: ClipperLib.Paths, point: Point): boolean {
  const sample = {X: Math.round(point.x * SCALE), Y: Math.round(point.y * SCALE)};
  let winding = 0;
  for (const path of paths) {
    if (ClipperLib.Clipper.PointInPolygon(sample, path) !== 0) winding += ClipperLib.Clipper.Area(path) > 0 ? 1 : -1;
  }
  return winding > 0;
}

export function createFoundation(project: Project, plinth: THREE.Material): THREE.Mesh[] {
  const parts = contours(foundationPaths(project));
  if (!parts.length) return [];
  const floor = new THREE.MeshStandardMaterial({color:0xd8c8af, roughness:.92});
  const vectors = (points: Point[]) => points.map(({x,y}) => new THREE.Vector2(x,-y));
  return parts.map(part => {
    const shape = new THREE.Shape(vectors(part.outer));
    shape.holes = part.holes.map(hole => new THREE.Path(vectors(hole)));
    const geometry = new THREE.ExtrudeGeometry(shape, {depth:houseFloorLevel(project)+.02, bevelEnabled:false});
    geometry.rotateX(-Math.PI/2);
    geometry.translate(0,-houseFloorLevel(project)-.02,0);
    const mesh = new THREE.Mesh(geometry,[floor,plinth]);
    mesh.name = "house-floor";
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  });
}
