import * as THREE from "three";
import type { Point } from "./model";

// Keep the physical level shared by floors, tree roots, placement and walking.
// The background terrain must not share a depth plane with finished surfaces.
export const SITE_LEVEL = 0;
export const TERRAIN_LEVEL = SITE_LEVEL - 0.03;

export function createTerrain() {
  const terrain = new THREE.Mesh(
    // Smaller triangles avoid depth interpolation errors when the camera is
    // close to a terrain triangle extending kilometres behind the near plane.
    new THREE.PlaneGeometry(4000, 4000, 80, 80),
    new THREE.MeshStandardMaterial({
      color: 0xdce4d5,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 4,
    }),
  );
  terrain.name = "terrain";
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = TERRAIN_LEVEL;
  terrain.receiveShadow = true;
  return terrain;
}

export function createRoomFloor(points: Point[], finish: number | THREE.MeshStandardMaterial) {
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.y)));
  const depth = 0.14;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const material = typeof finish === "number" ? new THREE.MeshStandardMaterial({color:finish,roughness:.92}) : finish;
  const floor = new THREE.Mesh(geometry, material);
  floor.name = "house-floor";
  floor.position.y = SITE_LEVEL - depth;
  floor.receiveShadow = floor.castShadow = true;
  return floor;
}
