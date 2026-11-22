import * as THREE from "three";
import { FLOOR_OPTIONS, type FloorFinish } from "./floorSettings";

const layouts = {
  parquet:{width:768,height:384,metresX:2.4,metresY:.96},
  tile60:{width:512,height:512,metresX:1.2,metresY:1.2},
  tile120:{width:1024,height:512,metresX:2.4,metresY:1.2},
  linoleum:{width:256,height:256,metresX:1.2,metresY:1.2},
};
const pixelCache = new Map<string,Uint8Array>();
const previews = new Map<string,string>();

function noise(x: number, y: number) {
  let hash = Math.imul(x+17,374761393)^Math.imul(y+31,668265263);
  hash = Math.imul(hash^(hash>>>13),1274126177);
  return ((hash^(hash>>>16))>>>0)/4294967295;
}

function field(u: number, v: number, columns: number, rows: number) {
  const x=u*columns, y=v*rows, a=Math.floor(x), b=Math.floor(y);
  const fx=x-a, fy=y-b, s=fx*fx*(3-2*fx), t=fy*fy*(3-2*fy);
  const right=(a+1)%columns, bottom=(b+1)%rows;
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(noise(a,b),noise(right,b),s),
    THREE.MathUtils.lerp(noise(a,bottom),noise(right,bottom),s),t,
  )-.5;
}

function floorPixels({kind,texture}: FloorFinish) {
  const key=kind+":"+texture, cached=pixelCache.get(key);
  if (cached) return cached;
  const {width,height,metresX,metresY}=layouts[kind];
  const pixels=new Uint8Array(width*height*4);
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    const u=(x+.5)/width, v=(y+.5)/height;
    const fine=noise(x,y)-.5;
    let shade=.95+fine*.035;
    if (kind === "tile60" || kind === "tile120") {
      const column=Math.floor(u*2), row=Math.floor(v*2);
      const sx=u*2-column, sy=v*2-row;
      const edge=Math.min(Math.min(sx,1-sx)*metresX/2,Math.min(sy,1-sy)*metresY/2);
      const variation=noise(column,row)*.05;
      if (edge<.0018) shade=.57+fine*.06;
      else if (texture==="concrete") shade=.92+variation+field(u,v,19,19)*.21+field(u,v,47,47)*.08;
      else if (texture==="stone") {
        const swirl=field(u,v,4,4)*.7+field(u,v,13,13)*.16;
        const vein=Math.pow(.5+.5*Math.cos(2*Math.PI*(u*2-v*3+swirl)),12);
        shade=.96+variation-vein*.25+fine*.018;
      } else shade=.94+variation+fine*.015;
    } else if (kind==="parquet") {
      const row=Math.floor(v*8), along=(u*2+(row%2)*.5)%2, plank=Math.floor(along);
      const sx=along-plank, sy=v*8-row;
      const edge=Math.min(Math.min(sx,1-sx)*1.2,Math.min(sy,1-sy)*.12);
      const variation=(noise(plank,row)-.5)*.23;
      const grain=field(u,v,7,124), ridge=field(u,v,3,72);
      const knot=Math.hypot((sx-.48)*5,(sy-.45)*1.7);
      const darkKnot=texture==="rustic" ? Math.max(0,1-knot*2.3)**2 : 0;
      const ring=Math.sin((sy+field(u,v,5,16)*.18+darkKnot*.55)*85);
      shade=edge<.0012 ? .5 : .87+variation+grain*.14+ring*.038-darkKnot*.33;
      if (texture==="brushed" && edge>=.0012) shade+=ridge*.25+fine*.055;
    } else if (texture==="speckled") {
      shade=.92+field(u,v,72,72)*.17+(fine>.39?-.15:fine*.09);
    } else if (texture==="woven") {
      const thread=Math.sin(u*2*Math.PI*76)*Math.sin(v*2*Math.PI*44);
      shade=.91+thread*.09+fine*.06;
    } else shade+=field(u,v,12,12)*.045;
    const i=(y*width+x)*4, tone=Math.round(Math.max(0,Math.min(1,shade))*255);
    pixels[i]=pixels[i+1]=pixels[i+2]=tone;
    pixels[i+3]=255;
  }
  pixelCache.set(key,pixels);
  return pixels;
}

export function floorMaterial(finish: FloorFinish) {
  const {width,height}=layouts[finish.kind];
  const map=new THREE.DataTexture(floorPixels(finish),width,height);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.magFilter=THREE.LinearFilter;
  map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;
  map.anisotropy=8;
  map.needsUpdate=true;
  const color=FLOOR_OPTIONS[finish.kind].colors.find(item=>item.id===finish.color)!.color;
  const material=new THREE.MeshStandardMaterial({color,map,bumpMap:map,bumpScale:.0006,roughness:.94});
  material.name="floor-"+finish.kind;
  material.userData.ownedTextures=[map];
  return material;
}

export function applyFloorUV(geometry: THREE.BufferGeometry, finish: FloorFinish) {
  const {metresX,metresY}=layouts[finish.kind];
  const angle=THREE.MathUtils.degToRad(finish.angle), cos=Math.cos(angle), sin=Math.sin(angle);
  const positions=geometry.attributes.position, uv=geometry.attributes.uv;
  for (let i=0;i<positions.count;i++) {
    const x=positions.getX(i), z=positions.getZ(i);
    uv.setXY(i,(x*cos+z*sin)/metresX,(-x*sin+z*cos)/metresY);
  }
  uv.needsUpdate=true;
}

export function floorPreview(finish: FloorFinish) {
  const key=[finish.kind,finish.texture,finish.color].join(":"), cached=previews.get(key);
  if (cached) return cached;
  const {width,height,metresX,metresY}=layouts[finish.kind];
  const source=floorPixels(finish);
  const color=FLOOR_OPTIONS[finish.kind].colors.find(item=>item.id===finish.color)!.color;
  const hex=Number.parseInt(color.slice(1),16), rgb=[hex>>16,hex>>8&255,hex&255];
  const canvas=document.createElement("canvas");
  canvas.width=192;canvas.height=108;
  const ctx=canvas.getContext("2d")!, image=ctx.createImageData(canvas.width,canvas.height);
  const scale=2.4/canvas.width;
  for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) {
    const sx=Math.floor(x*scale/metresX*width)%width, sy=Math.floor(y*scale/metresY*height)%height;
    const tone=Math.sqrt(source[(sy*width+sx)*4]/255), i=(y*canvas.width+x)*4;
    for (let c=0;c<3;c++) image.data[i+c]=rgb[c]*tone;
    image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  const url=canvas.toDataURL("image/png");
  previews.set(key,url);
  return url;
}
