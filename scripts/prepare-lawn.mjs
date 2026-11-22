// Bake every source blade into one shared, full-detail mesh.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Matrix4, Quaternion, Vector3, Box3, Matrix3, PlaneGeometry } from 'three';
const inputBytes = await readFile('assets/source/lawn.glb');
const jsonLength = inputBytes.readUInt32LE(12);
const input = JSON.parse(inputBytes.subarray(20, 20 + jsonLength).toString());
const source = inputBytes.subarray(28 + jsonLength);
const parts = [], bounds = new Box3(), soilBounds = new Box3();
function read(index) {
  const a = input.accessors[index], v = input.bufferViews[a.bufferView];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const methods = { 5126: ['readFloatLE', 4], 5125: ['readUInt32LE', 4], 5123: ['readUInt16LE', 2], 5121: ['readUInt8', 1] };
  const [method, bytes] = methods[a.componentType];
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: size }, (_, j) => source[method]((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? bytes * size) + j * bytes)));
}
function walk(index, parent) {
  const n = input.nodes[index];
  const m = parent.clone().multiply(n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(new Vector3().fromArray(n.translation ?? [0,0,0]), new Quaternion().fromArray(n.rotation ?? [0,0,0,1]), new Vector3().fromArray(n.scale ?? [1,1,1])));
  if (n.mesh !== undefined) for (const p of input.meshes[n.mesh].primitives) {
    const points = read(p.attributes.POSITION).map(a => new Vector3().fromArray(a).applyMatrix4(m));
    bounds.union(new Box3().setFromPoints(points));
    if (/soil/i.test(input.materials[p.material].name)) soilBounds.union(new Box3().setFromPoints(points));
    else parts.push({ points, normals: read(p.attributes.NORMAL).map(a => new Vector3().fromArray(a).applyNormalMatrix(new Matrix3().getNormalMatrix(m))), uvs: read(p.attributes.TEXCOORD_0), indices: read(p.indices).flat(), material: p.material });
  }
  for (const child of n.children ?? []) walk(child, m);
}
for (const root of input.scenes[input.scene ?? 0].nodes) walk(root, new Matrix4());
const center = soilBounds.getCenter(new Vector3()), size = soilBounds.getSize(new Vector3());
const sourceTop = Math.max(...parts.map(p => Math.max(...p.points.map(v => v.y))));
const output = { asset: input.asset, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: input.materials, textures: input.textures, samplers: input.samplers, images: [], bufferViews: [], accessors: [], buffers: [] };
const chunks = []; let offset = 0;
function buffer(data) {
  const padding = (4 - offset % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
  const index = output.bufferViews.length; output.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
  chunks.push(data); offset += data.length; return index;
}
function accessor(values, components, index = false) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((v,i) => index ? bytes.writeUInt32LE(v,i*4) : bytes.writeFloatLE(v,i*4));
  const a = { bufferView: buffer(bytes), componentType: index ? 5125 : 5126, count: values.length / components, type: {1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[components] };
  if (!index && components === 3) {
    a.min = [0,1,2].map(axis => { let n=Infinity; for(let i=axis;i<values.length;i+=3)n=Math.min(n,values[i]);return n; });
    a.max = [0,1,2].map(axis => { let n=-Infinity; for(let i=axis;i<values.length;i+=3)n=Math.max(n,values[i]);return n; });
  }
  output.accessors.push(a); return output.accessors.length - 1;
}
function mesh(name, positions, normals, uvs, indices, material) {
  const p = { attributes: { POSITION: accessor(positions,3), NORMAL: accessor(normals,3), TEXCOORD_0: accessor(uvs,2) }, indices: accessor(indices,1,true), material };
  const index = output.meshes.length; output.meshes.push({name,primitives:[p]}); output.scenes[0].nodes.push(output.nodes.length); output.nodes.push({name,mesh:index});
}
const verticalScale = 0.12 / sourceTop;
{
  const p=[], n=[], uv=[], idx=[];
  parts.forEach(part => {
    const base=p.length/3;
    part.points.forEach((v,j) => {
      p.push(Math.max(-.5,Math.min(.5,(v.x-center.x)/size.x)), Math.max(0,v.y*verticalScale)+.002, Math.max(-.5,Math.min(.5,(v.z-center.z)/size.z)));
      const normal=part.normals[j].clone();
      normal.set(normal.x*size.x,normal.y/verticalScale,normal.z*size.z).normalize();
      n.push(...normal.toArray()); uv.push(...part.uvs[j]);
    });
    idx.push(...part.indices.map(index=>index+base));
  });
  mesh('lawn-grass',p,n,uv,idx,parts[0].material);
}
const plane = new PlaneGeometry(1,1).rotateX(-Math.PI/2).translate(0,.002,0);
mesh('lawn-base',Array.from(plane.attributes.position.array),Array.from(plane.attributes.normal.array),Array.from(plane.attributes.uv.array),Array.from(plane.index.array),input.materials.findIndex(m=>/soil/i.test(m.name)));
for (const image of input.images) {
  const view=input.bufferViews[image.bufferView];
  output.images.push({...image,bufferView:buffer(source.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength))});
}
let bin=Buffer.concat(chunks); if(bin.length%4)bin=Buffer.concat([bin,Buffer.alloc(4-bin.length%4)]);
output.buffers=[{byteLength:bin.length}];
let json=Buffer.from(JSON.stringify(output));if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,32)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
await mkdir('assets/plants',{recursive:true});
await writeFile('assets/plants/lawn.glb',Buffer.concat([header,json,binHeader,bin]));
console.log(`Lawn: all ${parts.length} blade objects merged into one full-detail mesh + ground, ${(bin.length/1048576).toFixed(1)} MB, grass height 12 cm.`);
