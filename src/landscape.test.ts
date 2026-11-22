import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demoProject, parseProject, type Plant, type PlantKind } from "./model";
import { plantingError, plantTrunkRadius, plantVariant, siteBounds, PLANT_VARIANTS } from "./landscape";
import { BODY_RADIUS, createColliders, movePerson } from "./walkPhysics";
const plant = (kind: PlantKind = "birch"): Plant => ({
  id: "tree",
  kind,
  position: { x: -3, y: 2 },
  height: 5.5,
  rotation: 135,
  seed: 741,
});
test("old projects retain their original shape; plant parameters round-trip", () => {
  const p = demoProject();
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  const next = { ...p, plants: [plant()] };
  assert.deepEqual(parseProject(JSON.stringify(next)), next);
});
test("plant import rejects unsupported species, malformed sizes, coordinates, seeds and duplicate ids", () => {
  for (const patch of [
    { kind: "oak" },
    { height: 0 },
    { height: 21 },
    { position: { x: Infinity, y: 0 } },
    { seed: -1 },
    { seed: 0.5 },
    { id: "w1" },
    { rotation: 361 },
  ]) {
    assert.throws(() =>
      parseProject(
        JSON.stringify({
          ...demoProject(),
          plants: [{ ...plant(), ...patch }],
        }),
      ),
    );
  }
  assert.throws(() =>
    parseProject(
      JSON.stringify({
        ...demoProject(),
        plants: Array.from({ length: 101 }, (_, i) => ({
          ...plant(),
          id: String(i),
        })),
      }),
    ),
  );
});
test("all 41 imported shapes are individual full 3D trees, grounded at exact unit height", () => {
  const kinds = ["birch", "pine", "fir", "maple"] as const;
  assert.equal(kinds.reduce((total,kind)=>total+PLANT_VARIANTS[kind].length,0), 41);
  for (const kind of kinds) {
    const bytes = readFileSync(new URL(`../assets/plants/${kind}.glb`, import.meta.url));
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const roots = json.scenes[0].nodes;
    assert.equal(roots.length, PLANT_VARIANTS[kind].length);
    for (const [i, root] of roots.entries()) {
      const node = json.nodes[root];
      assert.equal(node.name, PLANT_VARIANTS[kind][i].id);
      const positions = node.children.flatMap((child: number) => json.meshes[json.nodes[child].mesh].primitives.map((p: any) => json.accessors[p.attributes.POSITION]));
      const bottom = Math.min(...positions.map((p: any) => p.min[1]));
      const top = Math.max(...positions.map((p: any) => p.max[1]));
      assert(Math.abs(bottom) < 1e-5, `${node.name} root is on ground`);
      assert(Math.abs(top - 1) < 1e-5, `${node.name} height is one metre`);
      assert(node.children.length >= 2, `${node.name} has wood and foliage`);
      assert(PLANT_VARIANTS[kind][i].crownRatio > 0.1);
      assert(PLANT_VARIANTS[kind][i].trunkRatio > 0);
    }
    assert(json.materials.every((m: any) => m.alphaMode !== "BLEND"), "leaf masks write depth without sorting artifacts");
    assert(!json.meshes.some((m: any) => /billboard|checker|ref_plane/i.test(m.name)));
  }
});
test("selected forms round-trip and old cedars migrate to fir without losing their placement", () => {
  const p = { ...demoProject(), plants: [{ ...plant(), variant: "birch-4" }] };
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  const legacy = { ...plant(), kind: "cedar" };
  const migrated = parseProject(JSON.stringify({ ...demoProject(), plants: [legacy] }));
  assert.deepEqual(migrated.plants![0], { ...legacy, kind: "fir" });
  for (const variant of ["pine-large-1", "not-a-tree", 123, null])
    assert.throws(() => parseProject(JSON.stringify({ ...p, plants: [{ ...plant(), variant }] })));
});
test("planting is allowed outside the house and rejected inside rooms, walls and other trunks", () => {
  const p = demoProject(),
    tree = plant();
  assert.equal(plantingError(p, tree), null);
  assert(plantingError(p, { ...tree, position: { x: 3, y: 2 } }));
  assert(plantingError(p, { ...tree, position: { x: 0, y: 2 } }));
  assert(plantingError({ ...p, plants: [tree] }, { ...tree, id: "another" }));
  assert.equal(plantingError({ ...p, plants: [tree] }, tree, tree.id), null);
});
test("site framing includes the crown of a tall tree outside the house", () => {
  const p = {
    ...demoProject(),
    plants: [{ ...plant(), position: { x: -10, y: -10 }, height: 20 }],
  };
  const b = siteBounds(p);
  assert(b.minX < -14);
  assert(b.minY < -14);
  assert(b.maxX >= 10);
});
test("the walking person cannot pass through a planted tree trunk", () => {
  const p = {
    ...demoProject(),
    plants: [{ ...plant("birch"), variant: "birch-2", position: { x: 20, y: 20 } }],
  };
  const end = movePerson({ x: 18, y: 20 }, { x: 4, y: 0 }, createColliders(p));
  assert(end.x < 19.8 && end.x > 19.5);
});
test("movement through low and high branches stops only at the trunk", () => {
  const base = { ...demoProject(), walls: [], openings: [] };
  for (const tree of [plant("fir"),{...plant("pine"),height:10}]) {
    const radius=plantTrunkRadius(tree), offset=radius+BODY_RADIUS+.04;
    assert(offset<tree.height*plantVariant(tree.kind).crownRatio/2);
    const colliders=createColliders({...base,plants:[tree]});
    assert.deepEqual(colliders,[{center:tree.position,radius}]);
    const start={x:tree.position.x-3,y:tree.position.y};
    const stopped=movePerson(start,{x:6,y:0},colliders);
    assert(Math.abs(stopped.x-(tree.position.x-radius-BODY_RADIUS))<1e-5);
    const passed=movePerson({...start,y:start.y+offset},{x:6,y:0},colliders);
    assert(Math.abs(passed.x-(start.x+6))<1e-5);
  }
});
