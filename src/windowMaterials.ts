import * as THREE from "three";
import { WINDOW_FRAME_FINISHES, type WindowFrameFinish } from "./windowFinishes";

// Shared, deterministic grain needs no external files and survives view changes.
let grain: THREE.DataTexture | null = null;
function woodGrain() {
  if (grain) return grain;
  const width = 128, height = 512, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bend = 1.8 * Math.sin(y / height * Math.PI * 2) + .7 * Math.sin(y / height * Math.PI * 6);
    const fiber = Math.sin((x + bend) / width * Math.PI * 32);
    const fine = Math.sin((x + bend * .7) / width * Math.PI * 96);
    const noise = ((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0) / 4294967295;
    const shade = fiber * 8 + fine * 3 + (noise - .5) * 5;
    const i = (y * width + x) * 4;
    pixels[i] = 157 + shade; pixels[i + 1] = 105 + shade * .8; pixels[i + 2] = 62 + shade * .5; pixels[i + 3] = 255;
  }
  grain = new THREE.DataTexture(pixels, width, height);
  grain.name = "window-wood-grain";
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.magFilter = THREE.LinearFilter;
  grain.minFilter = THREE.LinearMipmapLinearFilter;
  grain.generateMipmaps = true;
  grain.anisotropy = 16;
  grain.needsUpdate = true;
  return grain;
}
export function createWindowFrameMaterial(finish: WindowFrameFinish) {
  const info = WINDOW_FRAME_FINISHES.find(f => f.id === finish)!;
  const material = new THREE.MeshStandardMaterial({
    color: finish === "wood" ? 0xffffff : info.color,
    map: finish === "wood" ? woodGrain() : null,
    roughness: finish === "wood" ? .72 : .52,
    metalness: 0,
  });
  material.name = `window-frame-${finish}`;
  material.userData.windowFinish = finish;
  return material;
}
export function applyWindowFrameUV(geometry: THREE.BoxGeometry, material: THREE.Material) {
  if (material.userData.windowFinish !== "wood") return;
  const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
  const horizontal = geometry.parameters.width > geometry.parameters.height;
  for (let i = 0; i < position.count; i++) {
    const along = horizontal ? position.getX(i) : position.getY(i);
    const across = Math.abs(normal.getZ(i)) > .5
      ? (horizontal ? position.getY(i) : position.getX(i)) : position.getZ(i);
    uv.setXY(i, across / .1 + .5, along / 1.2 + .5);
  }
  uv.needsUpdate = true;
}
