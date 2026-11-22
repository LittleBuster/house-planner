import * as THREE from "three";
import type { GroundCover } from "./groundSettings";

type SolidCover = Exclude<GroundCover, "lawn">;
const SIZE = 256;
export const GROUND_TEXTURE_METRES = .48;
const styles = {
  soil: { rgb:[62,48,36], coarse:.40, fine:.32, bump:.002 },
  sand: { rgb:[197,171,125], coarse:.12, fine:.23, bump:.001 },
  concrete: { rgb:[151,151,146], coarse:.13, fine:.13, bump:.0007 },
  gravel: { rgb:[105,103,99], coarse:.24, fine:.37, bump:.0027 },
  asphalt: { rgb:[65,66,67], coarse:.14, fine:.54, bump:.0009 },
};
type Surface = {material: THREE.MeshStandardMaterial; pixels: Uint8Array; preview?: string};
const cache = new Map<SolidCover, Surface>();

function grain(x: number, y: number, period: number) {
  let hash = Math.imul(x % period + 13, 374761393) ^ Math.imul(y % period + 19, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function smoothGrain(x: number, y: number, period: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx*fx*(3-2*fx), v = fy*fy*(3-2*fy);
  return (grain(ix,iy,period)*(1-u)+grain(ix+1,iy,period)*u)*(1-v) +
    (grain(ix,iy+1,period)*(1-u)+grain(ix+1,iy+1,period)*u)*v;
}

function crushedStone(pixels: Uint8Array, relief: Uint8Array) {
  const maxRadius=.01*SIZE/GROUND_TEXTURE_METRES;
  const blend=(old:number,value:number,alpha:number)=>Math.round(old+(value-old)*alpha);
  const wrap=(pixel:number)=>(pixel+SIZE)%SIZE;
  // Draw the fine aggregate first, then add larger angular chips.
  for (const {cells,min,max} of [
    {cells:54,min:1.1,max:2.25},
    {cells:28,min:2.35,max:maxRadius},
  ]) {
    const step=SIZE/cells;
    for (let row=0;row<cells;row++) for (let column=0;column<cells;column++) {
      const seed=cells*cells+row*cells+column;
      const random=(index:number)=>grain(seed,index,8192);
      const cx=(column+.15+.7*random(0))*step, cy=(row+.15+.7*random(1))*step;
      const radius=min+(max-min)*random(2), corners=4+Math.floor(random(3)*3);
      const rotation=random(4)*Math.PI*2, tone=108+random(5)*77, warmth=random(6)-.38;
      const vertices=Array.from({length:corners},(_,i)=>{
        const angle=rotation+(i+(random(7+i)-.5)*.4)*Math.PI*2/corners;
        const reach=radius*(.72+.28*random(13+i));
        return {x:Math.cos(angle)*reach,y:Math.sin(angle)*reach};
      });
      const edges=vertices.map((a,i)=>{
        const b=vertices[(i+1)%corners], length=Math.hypot(b.x-a.x,b.y-a.y);
        const dx=(b.x-a.x)/length, dy=(b.y-a.y)/length;
        return {a,dx,dy,light:(dx*.68-dy*.73)*40};
      });
      for (let y=Math.floor(cy-radius);y<=Math.ceil(cy+radius);y++)
        for (let x=Math.floor(cx-radius);x<=Math.ceil(cx+radius);x++) {
          const u=x+.5-cx, v=y+.5-cy;
          let margin=Infinity, bevel=0;
          for (const {a,dx,dy,light} of edges) {
            const distance=dx*(v-a.y)-dy*(u-a.x);
            if (distance<margin) {margin=distance;bevel=light;}
          }
          if (margin<=-.35) continue;
          const alpha=Math.min(1,margin+.35), face=Math.min(1,(margin+.35)/1.45);
          const px=wrap(x), py=wrap(y), i=(py*SIZE+px)*4;
          const shade=tone+bevel*(1-face)-(u+v)*1.8+(grain(px,py,SIZE)-.5)*19;
          const height=87+face*(62+radius*9);
          pixels[i]=blend(pixels[i],shade+warmth*12,alpha);
          pixels[i+1]=blend(pixels[i+1],shade+warmth*5,alpha);
          pixels[i+2]=blend(pixels[i+2],shade-warmth*8,alpha);
          relief[i]=relief[i+1]=relief[i+2]=blend(relief[i],height,alpha);
        }
    }
  }
}

function texture(pixels: Uint8Array, color: boolean) {
  const map = new THREE.DataTexture(pixels, SIZE, SIZE);
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

function surface(cover: SolidCover): Surface {
  const found = cache.get(cover);
  if (found) return found;
  const { rgb, coarse, fine, bump } = styles[cover];
  const pixels = new Uint8Array(SIZE*SIZE*4), relief = new Uint8Array(pixels.length);
  for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) {
    const broad = smoothGrain(x/16,y/16,16) - .5;
    const clusters = smoothGrain(x/4,y/4,64) - .5;
    const speck = grain(x,y,SIZE) - .5;
    const shade = 1 + broad*coarse + clusters*coarse*.6 + speck*fine;
    const i = (y*SIZE+x)*4;
    const height = cover==="gravel"
      ? Math.round(62+(clusters*.6+speck)*35)
      : Math.round(128+(broad*.3+clusters*.7+speck)*100);
    for (let c=0; c<3; c++) {
      pixels[i+c] = Math.min(255, Math.round(rgb[c]*shade));
      relief[i+c] = height;
    }
    pixels[i+3] = relief[i+3] = 255;
  }
  if (cover==="gravel") crushedStone(pixels,relief);
  const material = new THREE.MeshStandardMaterial({map:texture(pixels,true), bumpMap:texture(relief,false), bumpScale:bump, roughness:.98});
  material.name = `ground-${cover}`;
  const data = {material,pixels};
  cache.set(cover,data);
  return data;
}

export const groundMaterial = (cover: SolidCover) => surface(cover).material;

export function groundPreview(cover: SolidCover) {
  const data = surface(cover);
  if (data.preview) return data.preview;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(SIZE,SIZE);
  image.data.set(data.pixels);
  context.putImageData(image,0,0);
  data.preview = canvas.toDataURL();
  return data.preview;
}
