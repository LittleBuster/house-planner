import * as THREE from "three";
import {BRICK_COLORS,STUCCO_COLORS,type FacadeSettings} from "./facadeSettings";

type SurfacePixels={width:number;height:number;metres:[number,number];color:Uint8Array;bump:Uint8Array};
const cache=new Map<string,SurfacePixels>();
const noise=(x:number,y:number,seed=0)=>{
  let h=Math.imul(x+seed*17,374761393)+Math.imul(y+seed*31,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;
};
function smoothNoise(x:number,y:number,seed:number,period:number){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),sample=(a:number,b:number)=>noise(a%period,b%period,seed),a=sample(ix,iy)*(1-u)+sample(ix+1,iy)*u,b=sample(ix,iy+1)*(1-u)+sample(ix+1,iy+1)*u;
  return a*(1-v)+b*v;
}
function grain(x:number,y:number){
  return noise(x%512,y%512)*.35+smoothNoise(x/4,y/4,2,128)*.4+smoothNoise(x/16,y/16,9,32)*.25;
}
export function facadePixels(settings:FacadeSettings):SurfacePixels{
  const key=`${settings.kind}:${settings.color}`,found=cache.get(key);if(found)return found;
  const brick=settings.kind==="brick",width=brick?1024:512,height=512,color=new Uint8Array(width*height*4),bump=new Uint8Array(width*height*4);
  const swatch=(brick?BRICK_COLORS:STUCCO_COLORS).find(c=>c.id===settings.color)!;
  const hex=Number.parseInt(swatch.color.slice(1),16),rgb=[hex>>16,(hex>>8)&255,hex&255];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let shade=1,relief=.5,base=rgb;
    if(brick){
      const row=Math.floor(y/64),u=(x+(row%2)*64)%128,v=y%64;
      const edge=Math.min(u,128-u)*2.08/1024,verticalEdge=Math.min(v,64-v)*.6/512,distance=Math.min(edge,verticalEdge),joint=distance<.005;
      const n=grain(x,y),variation=.86+noise(Math.floor((x+(row%2)*64)/128)%8,row,5)*.25;
      if(joint){base=[181,175,163];shade=.95+n*.08;relief=.12+n*.05;}
      else{shade=variation*(.94+n*.12);relief=.74+n*.17;const bevel=Math.min(1,(distance-.005)/.003);relief=.15+(relief-.15)*bevel;shade*=.90+bevel*.1;}
    }else{
      const n=grain(x,y),pit=noise(Math.floor(x/2),Math.floor(y/2),42);
      // Mild micro-occlusion keeps the grain visible on shaded elevations too.
      shade=.97+(n-.5)*.16+(pit>.84?.02:-.005);relief=Math.max(0,Math.min(1,.28+n*.48+(pit>.84?.16:0)));
    }
    const i=(y*width+x)*4;for(let channel=0;channel<3;channel++){color[i+channel]=Math.max(0,Math.min(255,Math.round(base[channel]*shade)));bump[i+channel]=Math.round(relief*255);}color[i+3]=bump[i+3]=255;
  }
  const data:SurfacePixels={width,height,metres:brick?[2.08,.6]:[.256,.256],color,bump};cache.set(key,data);return data;
}
function texture(pixels:Uint8Array,data:SurfacePixels,name:string,color:boolean){
  const map=new THREE.DataTexture(pixels,data.width,data.height);map.name=name;map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.generateMipmaps=true;map.anisotropy=8;map.needsUpdate=true;return map;
}
export function createFacadeMaterial(settings:FacadeSettings){
  const data=facadePixels(settings),map=texture(data.color,data,`facade-${settings.kind}-${settings.color}`,true),bumpMap=texture(data.bump,data,`facade-${settings.kind}-relief`,false);
  const material=new THREE.MeshStandardMaterial({color:0xffffff,map,bumpMap,bumpScale:settings.kind==="brick"?.006:.002,roughness:settings.kind==="brick"?.9:.97,metalness:0});
  material.name=`facade-${settings.kind}-${settings.color}`;material.userData.facade={...settings};material.userData.ownedTextures=[map,bumpMap];return material;
}
// World-metre UVs keep brick courses level and unchanged when walls are resized.
export function applyFacadeUV(geometry:THREE.BufferGeometry,settings:FacadeSettings){
  const positions=geometry.attributes.position,normals=geometry.attributes.normal,uv=new THREE.Float32BufferAttribute(new Float32Array(positions.count*2),2),metres=facadePixels(settings).metres;
  for(let i=0;i<positions.count;i++){
    const nx=normals.getX(i),ny=normals.getY(i),nz=normals.getZ(i);let tx=nz,tz=-nx;
    if(tx< -1e-6||Math.abs(tx)<1e-6&&tz<0){tx=-tx;tz=-tz;}
    const u=Math.abs(ny)>.5?positions.getX(i):positions.getX(i)*tx+positions.getZ(i)*tz;
    const v=Math.abs(ny)>.5?positions.getZ(i):positions.getY(i);
    uv.setXY(i,u/metres[0],v/metres[1]);
  }
  geometry.setAttribute("uv",uv);
}
export function disposeOwnedMaterialTextures(material:THREE.Material){
  for(const map of material.userData.ownedTextures??[])if(map instanceof THREE.Texture)map.dispose();
}
const previews=new Map<string,string>();
export function facadePreview(settings:FacadeSettings){
  const key=`${settings.kind}:${settings.color}`,found=previews.get(key);if(found)return found;
  const data=facadePixels(settings),canvas=document.createElement("canvas");canvas.width=192;canvas.height=112;
  const ctx=canvas.getContext("2d")!,image=ctx.createImageData(192,112),physicalWidth=settings.kind==="brick"?.52:.064;
  for(let y=0;y<112;y++)for(let x=0;x<192;x++){
    const sx=Math.floor(x/192*physicalWidth/data.metres[0]*data.width)%data.width,sy=Math.floor(y/192*physicalWidth/data.metres[1]*data.height)%data.height;
    const from=(sy*data.width+sx)*4,to=(y*192+x)*4,shade=.91+(data.bump[from]/255)*.13;
    for(let c=0;c<3;c++)image.data[to+c]=Math.min(255,data.color[from+c]*shade);image.data[to+3]=255;
  }
  ctx.putImageData(image,0,0);const result=canvas.toDataURL("image/png");previews.set(key,result);return result;
}
