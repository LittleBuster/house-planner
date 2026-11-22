import { projectToWall, type Point, type Wall } from "./model";
import { polygonRayInterval, wallBodies } from "./wallBodies";

export type WallJunctionMeasurement = {
  wall: Wall;
  side: 1 | -1;
  spans: { side: "start" | "end"; from: number; to: number }[];
};

// Measure along the face the partition meets. For a diagonal partition its
// footprint on that face is wider and shifted relative to its axis contact.
export function measureWallJunction(
  walls: Wall[], anchor: Point, towards: Point, thickness: number, footprint?: Point[],
): WallJunctionMeasurement[] {
  const bodies = wallBodies(walls);
  const result: WallJunctionMeasurement[] = [];
  for (const wall of walls) {
    const contact = projectToWall(anchor, wall);
    const reach = footprint ? (wall.thickness + thickness) / 2 + .001 : .001;
    if (contact.distance >= reach) continue;
    const body = bodies.get(wall.id)!, axis = body.axis;
    const cross = axis.x * (towards.y - anchor.y) - axis.y * (towards.x - anchor.x);
    if (footprint && Math.abs(cross) < 1e-8) continue;
    const side = cross < 0 ? -1 : 1;
    const face = {
      x: wall.a.x - axis.y * wall.thickness / 2 * side,
      y: wall.a.y + axis.x * wall.thickness / 2 * side,
    };
    const host = polygonRayInterval(face, axis, body.polygon);
    const join = footprint
      ? polygonRayInterval(face, axis, footprint)
      : { near: contact.offset - thickness / 2, far: contact.offset + thickness / 2 };
    if (!host || !join || join.near > host.far || join.far < host.near) continue;

    let start = host.near, end = host.far;
    for (const other of walls) {
      if (other === wall) continue;
      const boundary = bodies.get(other.id)!.polygon;
      // Only walls that extend onto the measured side can bound this space.
      if (!boundary.some(p => side * (axis.x * (p.y - face.y) - axis.y * (p.x - face.x)) > 1e-8)) continue;
      const obstacle = polygonRayInterval(face, axis, boundary);
      if (!obstacle || obstacle.far - obstacle.near < 1e-8) continue;
      if (obstacle.near < join.near) start = Math.max(start, Math.min(join.near, obstacle.far));
      if (obstacle.far > join.far) end = Math.min(end, Math.max(join.far, obstacle.near));
    }

    const spans: WallJunctionMeasurement["spans"] = [];
    if (join.near - start > .0005) spans.push({ side: "start", from: join.near, to: start });
    if (end - join.far > .0005) spans.push({ side: "end", from: join.far, to: end });
    if (spans.length) result.push({ wall, side, spans });
  }
  return result;
}
