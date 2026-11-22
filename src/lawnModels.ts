import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { LawnTile, Point } from "./model";
import { lawnFootprint, type LawnFootprint } from "./lawnFootprint";
import { coverDepth, groundCover, GRASS_BLOCK_SIZE } from "./groundSettings";
import { groundMaterial, GROUND_TEXTURE_METRES } from "./groundMaterials";
const meshes = new Map<string, THREE.Mesh>();
let loading: Promise<void> | null = null;
let ready = false;
export const lawnLibraryReady = () => ready;
export function loadLawnLibrary(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const { default: bytes } = await import("./lawnAsset");
    const gltf = await new GLTFLoader().parseAsync(bytes.slice().buffer as ArrayBuffer, "");
    for (const name of ["lawn-base", "lawn-grass"]) {
      const mesh = gltf.scene.getObjectByName(name);
      if (!(mesh instanceof THREE.Mesh)) throw new Error(`Не найдена модель ${name}`);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.roughness = .95;
      material.metalness = 0;
      // Three.js clamps this to the device's supported maximum.
      if (material.map) material.map.anisotropy = 16;
      if (name === "lawn-base") {
        // A quiet underlay avoids doubling the blades with a detailed baked
        // image, which shimmered underneath the moving perspective view.
        material.map = null;
        material.color.setHex(0x50762c);
        material.polygonOffset = true;
        material.polygonOffsetFactor = 1;
        material.polygonOffsetUnits = 1;
      }
      meshes.set(name, mesh);
    }
    ready = true;
  })().catch(error => { loading = null; console.error("Lawn library:", error); throw error; });
  return loading;
}
export function disposeLawnModel(group: THREE.Group) {
  group.userData.coverGeometry?.dispose();
  group.userData.coverMask?.dispose();
  for (const material of group.userData.ownedMaterials ?? []) material.dispose();
  group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
  group.clear();
}

function groundGeometry(tile: LawnTile, footprint: LawnFootprint) {
  const local = ({x,y}:Point) => new THREE.Vector2(x-tile.position.x, -(y-tile.position.y));
  const shapes = footprint.parts.map(part => {
    const shape = new THREE.Shape(part.outer.map(local));
    shape.holes = part.holes.map(hole => new THREE.Path(hole.map(local)));
    return shape;
  });
  const geometry = new THREE.ShapeGeometry(shapes).rotateX(-Math.PI/2).translate(0,.002,0);
  const position = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i=0; i<position.count; i++) uv.setXY(i,
    (tile.position.x + position.getX(i))/GROUND_TEXTURE_METRES,
    (tile.position.y + position.getZ(i))/GROUND_TEXTURE_METRES,
  );
  return geometry;
}

let maskCanvas: HTMLCanvasElement | undefined;
function grassMask(tile: LawnTile, footprint: LawnFootprint) {
  const depth = coverDepth(tile);
  const widthPixels = Math.min(1024, Math.max(32, Math.ceil(tile.size*256)));
  const depthPixels = Math.min(1024, Math.max(32, Math.ceil(depth*256)));
  const canvas = maskCanvas ??= document.createElement("canvas");
  if (canvas.width !== widthPixels) canvas.width = widthPixels;
  if (canvas.height !== depthPixels) canvas.height = depthPixels;
  const context = canvas.getContext("2d", {willReadFrequently:true})!;
  context.clearRect(0,0,widthPixels,depthPixels);
  context.beginPath();
  for (const part of footprint.parts) for (const ring of [part.outer, ...part.holes]) {
    ring.forEach(({x,y},i) => {
      const u = ((x-tile.position.x)/tile.size + .5)*widthPixels;
      const v = ((y-tile.position.y)/depth + .5)*depthPixels;
      if (i === 0) context.moveTo(u,v); else context.lineTo(u,v);
    });
    context.closePath();
  }
  context.fill("evenodd");
  const rgba = context.getImageData(0,0,widthPixels,depthPixels).data;
  const alpha = new Uint8Array(widthPixels*depthPixels);
  for (let i=0; i<alpha.length; i++) alpha[i] = rgba[i*4+3];
  const mask = new THREE.DataTexture(alpha,widthPixels,depthPixels,THREE.RedFormat);
  mask.needsUpdate = true;
  return mask;
}

function coverMaterial(source: THREE.MeshStandardMaterial, group: THREE.Group, ghost: boolean, crop = false) {
  if (!ghost && !crop) return source;
  const material = source.clone();
  group.userData.ownedMaterials.push(material);
  if (ghost) { material.transparent = true; material.opacity = .55; material.depthWrite = false; }
  return material;
}

function clipGrass(material: THREE.MeshStandardMaterial, width: number, depth: number, mask?: THREE.DataTexture) {
  material.onBeforeCompile = shader => {
    shader.uniforms.coverSize = {value:new THREE.Vector2(width,depth)};
    if (mask) shader.uniforms.coverMask = {value:mask};
    shader.vertexShader = `uniform vec2 coverSize;\nvarying vec2 vCoverPoint;\n${shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\nvCoverPoint = (instanceMatrix * vec4(position,1.0)).xz / coverSize + vec2(0.5);")}`;
    const crop = `if (any(lessThan(vCoverPoint, vec2(0.0))) || any(greaterThan(vCoverPoint, vec2(1.0)))) discard;
${mask ? "if (texture2D(coverMask,vCoverPoint).r < 0.5) discard;" : ""}`;
    shader.fragmentShader = `${mask ? "uniform sampler2D coverMask;\n" : ""}varying vec2 vCoverPoint;\n${shader.fragmentShader.replace("#include <alphatest_fragment>",`#include <alphatest_fragment>\n${crop}`)}`;
  };
  material.customProgramCacheKey = () => mask ? "lawn-repeat-footprint" : "lawn-repeat-rectangle";
}

function addGrass(group: THREE.Group, tile: LawnTile, footprint: LawnFootprint, ghost: boolean) {
  const width = tile.size, depth = coverDepth(tile), block = GRASS_BLOCK_SIZE;
  const columns = Math.ceil(width/block-1e-8), rows = Math.ceil(depth/block-1e-8);
  const crop = !footprint.full || columns*block > width+1e-8 || rows*block > depth+1e-8;
  const source = meshes.get("lawn-grass")!;
  const material = coverMaterial(source.material as THREE.MeshStandardMaterial,group,ghost,crop);
  if (crop) {
    const mask = footprint.full ? undefined : grassMask(tile,footprint);
    group.userData.coverMask = mask;
    clipGrass(material,width,depth,mask);
  }
  const grass = new THREE.InstancedMesh(source.geometry,material,columns*rows);
  grass.name = "lawn-grass";
  grass.receiveShadow = true;
  // Every copy uses the original blade geometry at the 2 × 2 m scale.
  const matrix = new THREE.Matrix4().makeScale(block,1,block);
  for (let y=0; y<rows; y++) for (let x=0; x<columns; x++) {
    matrix.setPosition((x+.5)*block-width/2,0,(y+.5)*block-depth/2);
    grass.setMatrixAt(y*columns+x,matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  group.add(grass);
}

export function createGroundTile(tile: LawnTile, footprint: LawnFootprint, ghost = false) {
  const cover = groundCover(tile), group = new THREE.Group();
  group.userData = {loaded:cover !== "lawn" || ready, ownedMaterials:[]};
  if (!group.userData.loaded || !footprint.parts.length) return group;
  const geometry = groundGeometry(tile,footprint);
  group.userData.coverGeometry = geometry;
  const original = cover === "lawn" ? meshes.get("lawn-base")!.material as THREE.MeshStandardMaterial : groundMaterial(cover);
  const surface = new THREE.Mesh(geometry,coverMaterial(original,group,ghost));
  surface.name = "lawn-base";
  surface.receiveShadow = true;
  group.add(surface);
  if (cover === "lawn") addGrass(group,tile,footprint,ghost);
  return group;
}
let thumbnail: Promise<string> | null = null;
export function lawnThumbnail(): Promise<string> {
  if (thumbnail) return thumbnail;
  thumbnail = loadLawnLibrary().then(() => {
    const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
    try {
      renderer.setSize(184,140);renderer.setPixelRatio(1.5);
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
      const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x7e8469,2.5));
      const light=new THREE.DirectionalLight(0xfff5e5,3);light.position.set(-2,3,4);scene.add(light);
      const camera=new THREE.PerspectiveCamera(36,184/140,.01,10);camera.position.set(2.2,1.6,2.4);camera.lookAt(0,.03,0);
      const tile = {id:"preview",size:2,position:{x:0,y:0}};
      const model = createGroundTile(tile,lawnFootprint({walls:[]},tile));
      scene.add(model);renderer.render(scene,camera);
      const image=renderer.domElement.toDataURL("image/png");disposeLawnModel(model);return image;
    }finally{renderer.dispose();renderer.forceContextLoss();}
  }).catch(error=>{thumbnail=null;throw error;});
  return thumbnail;
}
