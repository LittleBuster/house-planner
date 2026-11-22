import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoProject,
  findRooms,
  projectToWall,
  type Opening,
  type Project,
  type Wall,
} from "./model";
import {
  BODY_RADIUS,
  createColliders,
  findWalkSpawn,
  isWalkable,
  movePerson,
  pointInRoom,
} from "./walkPhysics";
import {doorLeafPose,DOOR_LEAF_THICKNESS} from "./doorPhysics";

const wall = (
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Wall => ({
  id,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  height: 2.8,
  thickness: 0.22,
});
const top = wall("top", 0, 0, 6, 0);
const doorway: Opening = {
  id: "door",
  wallId: "top",
  kind: "door",
  offset: 3,
  width: 0.9,
  height: 2.1,
  sill: 0,
};
const project = (openings: Opening[] = []): Project => ({
  version: 1,
  name: "Collision test",
  walls: [top],
  openings,
});

test("a large displacement cannot tunnel through a solid wall", () => {
  const end = movePerson(
    { x: 2, y: 2 },
    { x: 0, y: -8 },
    createColliders(project()),
  );
  assert(end.y > 0.33 && end.y < 0.35);
  assert.equal(end.x, 2);
});
test("a standing person can pass through an open door in both directions", () => {
  const colliders = createColliders(project([doorway]));
  const outside = movePerson({ x: 3, y: 2 }, { x: 0, y: -4 }, colliders);
  assert(Math.abs(outside.y + 2) < 1e-5);
  const inside = movePerson(outside, { x: 0, y: 4 }, colliders);
  assert(Math.abs(inside.y - 2) < 1e-5);
});
test("windows block the body even when their sill is at floor level", () => {
  for (const sill of [0, 0.9]) {
    const end = movePerson(
      { x: 3, y: 2 },
      { x: 0, y: -4 },
      createColliders(
        project([{ ...doorway, kind: "window", sill, height: 1.4 }]),
      ),
    );
    assert(end.y > 0.33);
  }
});
test("door lintels, thresholds and narrow jambs prevent passage", () => {
  for (const opening of [
    { ...doorway, height: 1.7 },
    { ...doorway, sill: 0.2 },
    { ...doorway, width: 0.45 },
  ]) {
    const end = movePerson(
      { x: 3, y: 2 },
      { x: 0, y: -4 },
      createColliders(project([opening])),
    );
    assert(end.y > 0, JSON.stringify({ opening, end }));
  }
});
test("glancing movement slides along walls instead of stopping on both axes", () => {
  const end = movePerson(
    { x: 1, y: 1 },
    { x: 2, y: -2 },
    createColliders(project()),
  );
  assert(Math.abs(end.x - 3) < 1e-5);
  assert(end.y > 0.33 && end.y < 0.35);
});
test("diagonal walls collide in the wall's own orientation", () => {
  const diagonal = wall("diagonal", 0, 0, 4, 4);
  const p = { ...project(), walls: [diagonal] };
  const end = movePerson({ x: 2, y: 1 }, { x: -2, y: 2 }, createColliders(p));
  assert(end.y < end.x);
  assert(projectToWall(end, diagonal).distance >= BODY_RADIUS + 0.12);
});
test("meeting walls leave no opening at a corner", () => {
  const p = { ...project(), walls: [top, wall("left", 0, 0, 0, 5)] };
  const end = movePerson({ x: 1, y: 1 }, { x: -3, y: -3 }, createColliders(p));
  assert(end.x > 0.33 && end.y > 0.33);
});
test("the open door leaf has physical thickness", () => {
  const colliders = createColliders(project([doorway]));
  const end = movePerson({ x: 2, y: 0.5 }, { x: 1, y: 0 }, colliders);
  const hinge=doorLeafPose(doorway,top).hinge;
  assert(Math.abs(end.x-(hinge.x-BODY_RADIUS-DOOR_LEAF_THICKNESS/2))<.002);
  assert(end.y > 0);
});
test("spawn is inside a room, outside walls and door leaves", () => {
  const p = demoProject(),
    colliders = createColliders(p),
    spawn = findWalkSpawn(p, colliders);
  assert(isWalkable(spawn.position, colliders));
  assert(
    findRooms(p.walls).some((room) => pointInRoom(spawn.position, room.points)),
  );
});
test("a concave room uses an interior spawn when its centroid is outside", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 6 },
    { x: 0, y: 6 },
  ];
  const p = {
    ...project(),
    walls: points.map((point, i) => {
      const b = points[(i + 1) % points.length];
      return wall(String(i), point.x, point.y, b.x, b.y);
    }),
  };
  const spawn = findWalkSpawn(p);
  assert(pointInRoom(spawn.position, points));
  assert(isWalkable(spawn.position, createColliders(p)));
});
test("empty plans and plans with an open contour have a safe start", () => {
  for (const p of [{ ...project(), walls: [] }, project()]) {
    const spawn = findWalkSpawn(p);
    assert(isWalkable(spawn.position, createColliders(p)));
  }
});
