import type { Plant, Point, Project } from "./model";
import { plantTrunkRadius } from "./landscape";
import { createColliders, type Collider } from "./walkPhysics";
import {polygonRayInterval} from "./wallBodies";

export const TREE_MARKER_LEVEL = 0.18;
export const TREE_DIRECTIONS = [
  { id: "west", name: "−X", vector: { x: -1, y: 0 } },
  { id: "east", name: "+X", vector: { x: 1, y: 0 } },
  { id: "north", name: "−Y", vector: { x: 0, y: -1 } },
  { id: "south", name: "+Y", vector: { x: 0, y: 1 } },
] as const;
export type TreeClearance = { direction: string; start: Point; end: Point; distance: number | null };

export function treeClearanceObstacles(project: Project, selectedId: string) {
  // Lawn never enters the obstacle list. Omit the measured tree itself and
  // use the wall's real thickness rather than the walking safety allowance.
  return createColliders({ ...project, plants: project.plants?.filter(p => p.id !== selectedId) }, 0);
}
export function rayObstacleDistance(origin: Point, direction: Point, obstacle: Collider): number {
  const dx = origin.x - obstacle.center.x, dy = origin.y - obstacle.center.y;
  if ("radius" in obstacle) {
    const along = dx * direction.x + dy * direction.y;
    const discriminant = along * along - (dx * dx + dy * dy - obstacle.radius * obstacle.radius);
    if (discriminant < -1e-8) return Infinity;
    const half = Math.sqrt(Math.max(0, discriminant));
    return -along + half < 0 ? Infinity : Math.max(0, -along - half);
  }
  if(obstacle.polygon){const interval=polygonRayInterval(origin,direction,obstacle.polygon);return !interval||interval.far<0?Infinity:Math.max(0,interval.near);}
  const axis = obstacle.axis;
  const p = [dx * axis.x + dy * axis.y, -dx * axis.y + dy * axis.x];
  const v = [direction.x * axis.x + direction.y * axis.y, -direction.x * axis.y + direction.y * axis.x];
  let near = 0, far = Infinity;
  for (let i = 0; i < 2; i++) {
    const half = i === 0 ? obstacle.halfLength : obstacle.halfDepth;
    if (Math.abs(v[i]) < 1e-9) {
      if (Math.abs(p[i]) > half + 1e-8) return Infinity;
    } else {
      let a = (-half - p[i]) / v[i], b = (half - p[i]) / v[i];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far + 1e-8) return Infinity;
    }
  }
  return far < 0 ? Infinity : near;
}
export function measureTreeClearances(plant: Plant, obstacles: Collider[]): TreeClearance[] {
  const radius = plantTrunkRadius(plant);
  return TREE_DIRECTIONS.map(({id, vector}) => {
    const start = { x: plant.position.x + vector.x * radius, y: plant.position.y + vector.y * radius };
    let nearest = Infinity;
    for (const obstacle of obstacles) nearest = Math.min(nearest, rayObstacleDistance(start, vector, obstacle));
    const distance = Number.isFinite(nearest) ? nearest : null;
    const length = distance ?? Math.max(5, Math.min(10, plant.height * 1.2));
    return { direction: id, start, end: { x: start.x + vector.x * length, y: start.y + vector.y * length }, distance };
  });
}
