import * as THREE from "three";
import type { RoofSurface } from "./roofSettings";

type Profile = Exclude<RoofSurface,"smooth">;
const profiles = {
  "metal-tile": {width:.19,length:.35,bump:.028},
  profiled: {width:.21,length:1,bump:.022},
};
const textures = new Map<Profile,{map:THREE.DataTexture;bumpMap:THREE.DataTexture}>();

function profileTextures(profile:Profile) {
  const cached = textures.get(profile);
  if (cached) return cached;
  const size = 128;
  const bump = new Uint8Array(size*size*4), shade = new Uint8Array(bump.length);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const u = (x+.5)/size, v = (y+.5)/size, distance = Math.abs(u-.5);
    const rib = 1-THREE.MathUtils.smoothstep(distance,.10,.23);
    const wave = ((1+Math.cos(2*Math.PI*u))/2)**2;
    const course = THREE.MathUtils.smoothstep(v,0,.12)-v;
    const relief = profile==="profiled" ? rib : .59*wave+.39*course;
    const tint = profile==="profiled" ? .82+.18*rib : .88+.12*wave-.14*(1-THREE.MathUtils.smoothstep(v,.015,.13));
    const index = 4*(y*size+x);
    bump.set([255*relief,255*relief,255*relief,255],index);
    shade.set([255*tint,255*tint,255*tint,255],index);
  }
  const makeTexture = (data:Uint8Array,colorSpace:string) => {
    const texture = new THREE.DataTexture(data,size,size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.colorSpace = colorSpace;
    texture.needsUpdate = true;
    return texture;
  };
  const result = {map:makeTexture(shade,THREE.SRGBColorSpace),bumpMap:makeTexture(bump,THREE.NoColorSpace)};
  textures.set(profile,result);
  return result;
}

export function applyRoofProfile(mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial|THREE.MeshStandardMaterial[]>,profile:Profile,topCount:number) {
  const {width,length,bump} = profiles[profile];
  const {geometry} = mesh, positions = geometry.getAttribute("position");
  const uv = new Float32Array(positions.count*2);
  const a = new THREE.Vector3(), b = a.clone(), c = a.clone(), normal = a.clone();
  const across = a.clone(), uphill = a.clone();
  for (let i=0;i<topCount;i+=3) {
    a.fromBufferAttribute(positions,i);
    b.fromBufferAttribute(positions,i+1).sub(a);
    c.fromBufferAttribute(positions,i+2).sub(a);
    normal.crossVectors(b,c).normalize();
    const slope = Math.hypot(normal.x,normal.z);
    if (slope > 1e-6) {
      across.set(normal.z/slope,0,-normal.x/slope);
      uphill.set(-normal.x*normal.y/slope,slope,-normal.z*normal.y/slope);
    } else {
      across.set(1,0,0);
      uphill.set(0,0,1);
    }
    for (let j=i;j<i+3;j++) {
      a.fromBufferAttribute(positions,j);
      uv[2*j] = a.dot(across)/width;
      uv[2*j+1] = a.dot(uphill)/length;
    }
  }
  geometry.setAttribute("uv",new THREE.BufferAttribute(uv,2));
  geometry.addGroup(0,topCount,0);
  geometry.addGroup(topCount,positions.count-topCount,1);
  const underside = mesh.material as THREE.MeshStandardMaterial;
  const top = new THREE.MeshStandardMaterial({
    color:underside.color,side:underside.side,roughness:.68,metalness:.14,
    ...profileTextures(profile),bumpScale:bump,
  });
  mesh.material = [top,underside];
}
