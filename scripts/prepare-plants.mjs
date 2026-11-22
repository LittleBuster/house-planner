// Keep the author's full-detail trees, remove display stands, spare LODs and
// billboard textures, and bake each variant at unit height with its root at 0.
import { readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Vector3, Box3 } from 'three';

const definitions = {
  birch: Array.from({ length: 5 }, (_, i) => ({ id: `birch-${i + 1}`, name: `Форма ${i + 1}`, node: i ? `Birch_${i + 1}` : 'Birch' })),
  pine: ['large', 'big', 'medium', 'small', 'sapling'].flatMap((size, j) => Array.from({ length: 3 }, (_, i) => ({
    id: `pine-${size}-${i + 1}`, name: `${['Взрослая', 'Высокая', 'Средняя', 'Молодая', 'Саженец'][j]} ${i + 1}`, node: `Pine_${size}_${i + 1}_LOD0`,
  }))),
  fir: Array.from({ length: 9 }, (_, i) => ({ id: `fir-${i + 1}`, name: `${['Взрослая', 'Молодая', 'Саженец'][Math.floor(i / 3)]} ${i % 3 + 1}`, node: i ? `Christmas tree_${i + 1}_LOD0` : 'Christmas tree_LOD0' })),
  maple: ['large', 'medium', 'small', 'Sapling'].flatMap((size, j) => Array.from({ length: 3 }, (_, i) => ({
    id: `maple-${size.toLowerCase()}-${i + 1}`, name: `${['Взрослый', 'Средний', 'Молодой', 'Саженец'][j]} ${i + 1}`, node: `Acer_${size}_${i + 1}_LOD0`,
  }))),
  groundcover: [
    { id: 'groundcover-leaves', name: 'Широкие листья', nodes: ['Object_3'] },
    { id: 'groundcover-grass', name: 'Луговая трава', nodes: ['Object_5'] },
    { id: 'groundcover-clover', name: 'Клевер', nodes: ['Object_6'] },
    { id: 'groundcover-dandelion', name: 'Одуванчик', nodes: ['Object_7'] },
    { id: 'groundcover-white', name: 'Белые цветы', nodes: ['Object_2'] },
    { id: 'groundcover-patch-1', name: 'Зелёный ковёр 1', nodes: ['Object_8', 'Object_10', 'Object_11', 'Object_12'] },
    { id: 'groundcover-patch-2', name: 'Зелёный ковёр 2', nodes: ['Object_9', 'Object_13', 'Object_14', 'Object_15', 'Object_16'] },
    { id: 'groundcover-flowers-1', name: 'Фиолетовые цветы 1', nodes: ['Object_17'] },
    { id: 'groundcover-flowers-2', name: 'Фиолетовые цветы 2', nodes: ['Object_18'] },
  ],
  grass: [{ id: 'grass-tuft', name: 'Пучок травы', nodes: ['Object_3'] }],
};
const manifest = {};
for (const [kind, definitionsForKind] of Object.entries(definitions)) {
  const bytes = await readFile(`assets/source/${kind}.glb`);
  const jsonLength = bytes.readUInt32LE(12);
  const input = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const inputBin = bytes.subarray(28 + jsonLength);
  const output = { asset: input.asset, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], textures: [], images: [], samplers: [], accessors: [], bufferViews: [], buffers: [] };
  if (input.extensionsUsed) output.extensionsUsed = input.extensionsUsed;
  // Convert the older grass material to metallic/roughness PBR supported by
  // current GLTFLoader. The authored diffuse texture carries its alpha mask.
  for (const material of input.materials ?? []) {
    const specular = material.extensions?.KHR_materials_pbrSpecularGlossiness;
    if (!specular) continue;
    material.pbrMetallicRoughness = { baseColorTexture: specular.diffuseTexture, baseColorFactor: specular.diffuseFactor, metallicFactor: 0, roughnessFactor: 1 };
    delete material.extensions.KHR_materials_pbrSpecularGlossiness;
    if (!Object.keys(material.extensions).length) delete material.extensions;
    delete material.emissiveTexture;
    material.emissiveFactor = [0, 0, 0];
  }
  if (output.extensionsUsed) output.extensionsUsed = output.extensionsUsed.filter(name => name !== 'KHR_materials_pbrSpecularGlossiness');
  const chunks = [], mappings = new Map(); let offset = 0;
  const append = (data, rest = {}) => {
    const padding = (4 - offset % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
    const index = output.bufferViews.length;
    output.bufferViews.push({ ...rest, buffer: 0, byteOffset: offset, byteLength: data.length });
    chunks.push(data); offset += data.length; return index;
  };
  function copy(type, index) {
    const key = `${type}:${index}`;
    if (mappings.has(key)) return mappings.get(key);
    const outIndex = output[type].length, item = structuredClone(input[type][index]);
    mappings.set(key, outIndex); output[type].push(item);
    if (type === 'materials') {
      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const [k, v] of Object.entries(value)) {
          if (k === 'index' && Number.isInteger(v)) value[k] = copy('textures', v);
          else visit(v);
        }
      }; visit(item);
      if (item.alphaMode === 'BLEND') { item.alphaMode = 'MASK'; item.alphaCutoff = 0.35; }
    } else if (type === 'textures') {
      if (item.source !== undefined) item.source = copy('images', item.source);
      if (item.sampler !== undefined) item.sampler = copy('samplers', item.sampler);
    } else if (type === 'images') item.bufferView = copy('bufferViews', item.bufferView);
    else if (type === 'accessors') {
      if (item.sparse) throw new Error('Sparse accessors need explicit handling');
      item.bufferView = copy('bufferViews', item.bufferView);
    } else if (type === 'bufferViews') {
      // Reserve the output index before recursively copying other structures.
      const data = inputBin.subarray(item.byteOffset ?? 0, (item.byteOffset ?? 0) + item.byteLength);
      const padding = (4 - offset % 4) % 4;
      if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
      item.buffer = 0; item.byteOffset = offset;
      chunks.push(data); offset += data.length;
    }
    return outIndex;
  }
  const world = new Map();
  function walk(index, parent) {
    const n = input.nodes[index], local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4();
    if (!n.matrix && (n.translation || n.rotation || n.scale)) throw new Error('Unexpected TRS node');
    const matrix = parent.clone().multiply(local); world.set(index, matrix);
    for (const child of n.children ?? []) walk(child, matrix);
  }
  for (const root of input.scenes[input.scene ?? 0].nodes) walk(root, new Matrix4());
  function positions(accessorIndex, matrix) {
    const a = input.accessors[accessorIndex], view = input.bufferViews[a.bufferView];
    if (a.componentType !== 5126 || a.type !== 'VEC3') throw new Error('Expected float positions');
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = view.byteStride ?? 12;
    return Array.from({ length: a.count }, (_, i) => new Vector3(
      inputBin.readFloatLE(start + i * stride), inputBin.readFloatLE(start + i * stride + 4), inputBin.readFloatLE(start + i * stride + 8),
    ).applyMatrix4(matrix));
  }
  manifest[kind] = [];
  for (const definition of definitionsForKind) {
    const parts = [];
    function collect(index) {
      const node = input.nodes[index];
      if (node.mesh !== undefined) for (const primitive of input.meshes[node.mesh].primitives) {
        if ((primitive.mode ?? 4) !== 4) continue;
        parts.push({ primitive, matrix: world.get(index), points: positions(primitive.attributes.POSITION, world.get(index)), wood: /bark/i.test(input.materials[primitive.material].name) });
      }
      for (const child of node.children ?? []) collect(child);
    }
    for (const name of definition.nodes ?? [definition.node]) {
      const nodeIndex = input.nodes.findIndex(n => n.name === name);
      if (nodeIndex < 0) throw new Error(`Missing ${name}`);
      collect(nodeIndex);
    }
    const box = new Box3().setFromPoints(parts.flatMap(p => p.points));
    const height = box.max.y - box.min.y;
    const wood = parts.filter(p => p.wood).flatMap(p => p.points);
    const woodMin = Math.min(...wood.map(p => p.y));
    const root = wood.length ? new Box3().setFromPoints(wood.filter(p => p.y < woodMin + height * 0.025)) : box.clone();
    const center = root.getCenter(new Vector3());
    const normalize = new Matrix4().makeScale(1 / height, 1 / height, 1 / height).multiply(new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
    const rootNode = output.nodes.length;
    output.nodes.push({ name: definition.id, children: [] }); output.scenes[0].nodes.push(rootNode);
    for (const { primitive: p, matrix, points, wood: isWood } of parts) {
      const transform = normalize.clone().multiply(matrix);
      const normalized = points.map(point => point.clone().applyMatrix4(normalize));
      const packed = Buffer.alloc(normalized.length * 12);
      normalized.forEach((v, i) => { packed.writeFloatLE(v.x, i * 12); packed.writeFloatLE(v.y, i * 12 + 4); packed.writeFloatLE(v.z, i * 12 + 8); });
      const bounds = new Box3().setFromPoints(normalized);
      const position = output.accessors.length;
      output.accessors.push({ bufferView: append(packed, { target: 34962 }), componentType: 5126, count: normalized.length, type: 'VEC3', min: bounds.min.toArray(), max: bounds.max.toArray() });
      const attributes = { POSITION: position };
      for (const [semantic, a] of Object.entries(p.attributes)) if (semantic !== 'POSITION') {
        if (semantic === 'NORMAL' || semantic === 'TANGENT') {
          // These sources have uniform scales. Direction vectors only need the rotation.
          const accessor = input.accessors[a], view = input.bufferViews[accessor.bufferView], size = semantic === 'NORMAL' ? 3 : 4;
          const data = Buffer.alloc(accessor.count * size * 4);
          for (let i = 0; i < accessor.count; i++) {
            const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? size * 4);
            const v = new Vector3(inputBin.readFloatLE(at), inputBin.readFloatLE(at + 4), inputBin.readFloatLE(at + 8)).transformDirection(transform);
            v.toArray().forEach((n, axis) => data.writeFloatLE(n, (i * size + axis) * 4));
            if (size === 4) data.writeFloatLE(inputBin.readFloatLE(at + 12), (i * size + 3) * 4);
          }
          attributes[semantic] = output.accessors.length;
          output.accessors.push({ bufferView: append(data, { target: 34962 }), componentType: 5126, count: accessor.count, type: `VEC${size}` });
        } else attributes[semantic] = copy('accessors', a);
      }
      const mesh = output.meshes.length;
      output.meshes.push({ name: `${definition.id}-${isWood ? 'wood' : 'foliage'}`, primitives: [{ ...p, attributes, indices: copy('accessors', p.indices), material: copy('materials', p.material) }] });
      output.nodes[rootNode].children.push(output.nodes.length);
      output.nodes.push({ mesh, name: output.meshes[mesh].name });
    }
    const crown = parts.filter(p => !p.wood).flatMap(p => p.points.map(v => v.clone().applyMatrix4(normalize)));
    const trunkRatio = wood.length ? Math.max(0.009, Math.min(0.045, Math.max(root.max.x - root.min.x, root.max.z - root.min.z) / height / 2)) : 0;
    const crownRatio = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / height;
    // Quantile avoids the empty borders of transparent needle/leaf cards at the root.
    const ys = crown.map(p => p.y).sort((a,b) => a-b);
    manifest[kind].push({ id: definition.id, name: definition.name, nativeHeight: +height.toFixed(2), crownRatio: +crownRatio.toFixed(4), trunkRatio: +trunkRatio.toFixed(4), crownBottom: +(ys[Math.floor(ys.length * 0.08)] ?? 0.2).toFixed(4) });
  }
  let bin = Buffer.concat(chunks); if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - bin.length % 4)]);
  output.buffers = [{ byteLength: bin.length }];
  let json = Buffer.from(JSON.stringify(output)); if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - json.length % 4, 32)]);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  await writeFile(`assets/plants/${kind}.glb`, Buffer.concat([header, json, binHeader, bin]));
  console.log(`${kind}: ${definitionsForKind.length} shapes, ${(bin.length / 1048576).toFixed(1)} MB`);
}
await writeFile('src/plantManifest.ts', `// Generated by scripts/prepare-plants.mjs from the bundled GLB assets.\nexport const PLANT_VARIANTS = ${JSON.stringify(manifest, null, 2)} as const;\n`);
