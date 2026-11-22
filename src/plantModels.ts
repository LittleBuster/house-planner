import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { PlantKind } from "./model";
import { PLANT_VARIANTS } from "./plantManifest";
import { plantVariant } from "./landscape";
import { isHerb } from "./plantSettings";

const models = new Map<string, THREE.Group>();
let loading: Promise<void> | null = null;
let ready = false;
export const plantLibraryReady = () => ready;
export function loadPlantLibrary(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const { plantAssets } = await import("./plantAssets");
    const loader = new GLTFLoader();
    await Promise.all((Object.keys(plantAssets) as PlantKind[]).map(async kind => {
      const bytes = plantAssets[kind];
      const gltf = await loader.parseAsync(bytes.slice().buffer as ArrayBuffer, "");
      for (const variant of PLANT_VARIANTS[kind]) {
        const object = gltf.scene.getObjectByName(variant.id);
        if (!object) throw new Error(`Не найдена модель ${variant.id}`);
        const group = new THREE.Group();
        group.add(object);
        group.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = object.receiveShadow = true;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              if (material instanceof THREE.MeshStandardMaterial) {
                material.roughness = Math.max(0.8, material.roughness);
                material.metalness = 0;
                if (material.map) material.map.anisotropy = 4;
              }
            }
          }
        });
        models.set(variant.id, group);
      }
    }));
    ready = true;
  })().catch(error => { loading = null; console.error("Plant library:", error); throw error; });
  return loading;
}

export function createPlantModel(kind: PlantKind, _seed = 1, variant?: string): THREE.Group {
  const id = plantVariant(kind, variant).id;
  const source = models.get(id);
  const tree = source ? source.clone(true) : new THREE.Group();
  tree.name = `plant-${kind}`;
  tree.userData.variant = id;
  tree.userData.loaded = !!source;
  // Geometry and textures belong to the permanent library. Instance materials
  // are separate so placement transparency never leaks into planted trees.
  tree.traverse(object => {
    if (object instanceof THREE.Mesh) object.material = Array.isArray(object.material)
      ? object.material.map(m => m.clone()) : object.material.clone();
  });
  return tree;
}
export function disposePlantModel(group: THREE.Group) {
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
  });
  materials.forEach(m => m.dispose());
  group.clear();
}

let thumbnails: Record<string, string> | null = null;
let thumbnailLoading: Promise<Record<string, string>> | null = null;
export function plantThumbnails(): Promise<Record<string, string>> {
  if (thumbnails) return Promise.resolve(thumbnails);
  if (thumbnailLoading) return thumbnailLoading;
  thumbnailLoading = loadPlantLibrary().then(async () => {
    const result: Record<string, string> = {};
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    try {
      renderer.setSize(152, 168);
      renderer.setPixelRatio(1.5);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8c947e, 2.5));
      const light = new THREE.DirectionalLight(0xfff5e5, 3.2);
      light.position.set(-2, 3, 4); scene.add(light);
      const camera = new THREE.PerspectiveCamera(31, 152 / 168, 0.01, 10);
      for (const kind of Object.keys(PLANT_VARIANTS) as PlantKind[]) for (const variant of PLANT_VARIANTS[kind]) {
        const tree = createPlantModel(kind, 1, variant.id);
        const box = new THREE.Box3().setFromObject(tree);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const span = Math.max(1, size.x * 1.15, size.z * 1.15);
        camera.position.set(center.x + span * 0.95, isHerb(kind) ? center.y + span * 0.85 : 0.63, center.z + span * 1.8);
        camera.lookAt(center.x, isHerb(kind) ? center.y : 0.5, center.z);
        scene.add(tree); renderer.render(scene, camera);
        result[variant.id] = renderer.domElement.toDataURL("image/png");
        scene.remove(tree); disposePlantModel(tree);
        // Keep navigation and the house renderer responsive while preparing
        // the larger catalogue, including the scanned ground-cover meshes.
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      thumbnails = result;
      return result;
    } finally { renderer.dispose(); renderer.forceContextLoss(); }
  }).catch(error => { thumbnailLoading = null; throw error; });
  return thumbnailLoading;
}
