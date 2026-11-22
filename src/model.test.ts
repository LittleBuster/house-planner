import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canPlaceOpening,
  demoProject,
  findRooms,
  parseProject,
  resizeWall,
  type Project,
  type Wall,
} from "./model";
const wall = (
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Wall => ({
  id,
  a: { x: x1, y: y1 },
  b: { x: x2, y: y2 },
  thickness: 0.2,
  height: 2.8,
});
const rectangle = () => [
  wall("a", 0, 0, 6, 0),
  wall("b", 6, 0, 6, 4),
  wall("c", 6, 4, 0, 4),
  wall("d", 0, 4, 0, 0),
];
test("open wall chains do not create a floor", () =>
  assert.equal(findRooms(rectangle().slice(0, 3)).length, 0));
test("a closed rectangle has its true polygon area", () => {
  const rooms = findRooms(rectangle());
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].area, 24);
  assert.deepEqual(rooms[0].center, { x: 3, y: 2 });
});
test("T-junctions split rooms even when perimeter walls are not split", () => {
  const rooms = findRooms([...rectangle(), wall("split", 3, 0, 3, 4)]);
  assert.equal(rooms.length, 2);
  assert.deepEqual(
    rooms.map((r) => r.area),
    [12, 12],
  );
});
test("crossing partitions produce four bounded faces", () => {
  const rooms = findRooms([
    ...rectangle(),
    wall("split1", 3, 0, 3, 4),
    wall("split2", 0, 2, 6, 2),
  ]);
  assert.equal(rooms.length, 4);
  assert.equal(
    rooms.reduce((s, r) => s + r.area, 0),
    24,
  );
});
test("demo plan is valid and contains four rooms totalling 70 square metres", () => {
  const p = demoProject();
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  const rooms = findRooms(p.walls);
  assert.equal(rooms.length, 4);
  assert.equal(
    rooms.reduce((s, r) => s + r.area, 0),
    70,
  );
});
test("openings may not overlap, extend past an end, or exceed wall height", () => {
  const p = demoProject(),
    o = p.openings[0];
  assert.equal(canPlaceOpening(p, o, o.id), true);
  assert.equal(canPlaceOpening(p, { ...o, id: "new" }), false);
  assert.equal(canPlaceOpening(p, { ...o, offset: 0 }, o.id), false);
  assert.equal(canPlaceOpening(p, { ...o, height: 3 }, o.id), false);
});
test("moving a shared corner moves both incident walls and preserves the closed room", () => {
  const p: Project = {
    version: 1,
    name: "Test",
    walls: rectangle(),
    openings: [],
  };
  const next = resizeWall(p, "a", { b: { x: 7, y: 0 } });
  assert.deepEqual(next.walls[1].a, { x: 7, y: 0 });
  assert.equal(findRooms(next.walls).length, 1);
  assert.equal(findRooms(next.walls)[0].area, 26);
});
test("shrinking a wall removes only invalid openings", () => {
  const p = demoProject(),
    next = resizeWall(p, "w1", { b: { x: 5, y: 0 } });
  assert.equal(
    next.openings.some((o) => o.id === "o2"),
    false,
  );
  assert.equal(
    next.openings.some((o) => o.id === "o1"),
    true,
  );
});
test("import rejects invalid geometry, duplicate IDs, missing walls and non-numeric dimensions", () => {
  for (const mutate of [
    (p: any) => {
      p.walls[0].height = "2.8";
    },
    (p: any) => {
      p.walls[0].b = p.walls[0].a;
    },
    (p: any) => {
      p.walls[1].id = p.walls[0].id;
    },
    (p: any) => {
      p.openings[0].wallId = "missing";
    },
    (p: any) => {
      p.walls[0].a.x = 10000;
    },
    (p: any) => {
      p.openings[0].offset = 0;
    },
  ]) {
    const p = demoProject();
    mutate(p);
    assert.throws(() => parseProject(JSON.stringify(p)));
  }
  assert.throws(() => parseProject("broken json"));
});
