import * as THREE from "three";
import type {Project,Point} from "./model";
import {roofData,roofBottomAt,ROOF_THICKNESS,type RoofPart} from "./roofModel";
import {facadeSettings} from "./facadeSettings";
import {applyFacadeUV,createFacadeMaterial} from "./facadeMaterials";
import {ROOF_COLORS,roofColor,roofSurface} from "./roofSettings";
import {applyRoofProfile} from "./roofMaterials";
import {buildRoofDetails} from "./roofDetailsGeometry";

function mesh(positions:number[],color:number,name:string){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  const object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.82,metalness:.08,side:THREE.DoubleSide}));object.name=name;object.castShadow=object.receiveShadow=true;return object;
}
const push=(buffer:number[],p:Point,height:number)=>buffer.push(p.x,height,p.y);
function fascia(buffer:number[],a:Point,b:Point,bottomA:number,bottomB:number,topA:number,topB:number){
  for(const[p,h]of [[a,bottomA],[a,topA],[b,topB],[a,bottomA],[b,topB],[b,bottomB]] as [Point,number][])push(buffer,p,h);
}
function edgeHeight(part:RoofPart,p:Point){
  let y=roofBottomAt(part,p);if(!Number.isFinite(y)){
    // Quantized clipping can put an edge a few microns beyond a triangle.
    const center=part.contour.outer.reduce((s,q)=>({x:s.x+q.x/part.contour.outer.length,y:s.y+q.y/part.contour.outer.length}),{x:0,y:0});
    y=roofBottomAt(part,{x:p.x+(center.x-p.x)*1e-5,y:p.y+(center.y-p.y)*1e-5});
  }
  return Number.isFinite(y)?y:part.base;
}
function edgeSamples(part:RoofPart,a:Point,b:Point):Point[]{
  const dx=b.x-a.x,dy=b.y-a.y,values=[0,1];
  for(const triangle of part.triangles)for(let i=0;i<3;i++){
    const p=triangle.points[i],q=triangle.points[(i+1)%3],sx=q.x-p.x,sy=q.y-p.y,den=dx*sy-dy*sx;
    if(Math.abs(den)<1e-10)continue;
    const x=p.x-a.x,y=p.y-a.y,t=(x*sy-y*sx)/den,u=(x*dy-y*dx)/den;
    if(t>1e-8&&t<1-1e-8&&u>=-1e-8&&u<=1+1e-8)values.push(t);
  }
  return [...new Set(values.map(t=>Math.round(t*1e8)/1e8))].sort((a,b)=>a-b).map(t=>({x:a.x+dx*t,y:a.y+dy*t}));
}
export function buildRoof(project:Project,group:THREE.Group){
  const data=roofData(project),surface:number[]=[],underside:number[]=[],edges:number[]=[],gables:number[]=[];
  const profile=roofSurface(project.roof);
  const selectedColor=roofColor(project.roof),color=new THREE.Color(ROOF_COLORS.find(c=>c.id===selectedColor)!.color),edgeColor=selectedColor==="slate"?0x3e4b5b:color.clone().multiplyScalar(.72).getHex();
  for(const part of data.parts){
    for(const triangle of part.triangles){
      const [a,b,c]=triangle.points,[ha,hb,hc]=triangle.lift.map(h=>part.base+h);
      push(surface,a,ha+ROOF_THICKNESS);push(surface,c,hc+ROOF_THICKNESS);push(surface,b,hb+ROOF_THICKNESS);
      push(underside,a,ha);push(underside,b,hb);push(underside,c,hc);
    }
    for(const loop of [part.contour.outer,...part.contour.holes])for(let i=0;i<loop.length;i++){
      const samples=edgeSamples(part,loop[i],loop[(i+1)%loop.length]);
      for(let j=0;j<samples.length-1;j++){
        const p=samples[j],q=samples[j+1];
        const hp=edgeHeight(part,p),hq=edgeHeight(part,q);fascia(edges,p,q,hp,hq,hp+ROOF_THICKNESS,hq+ROOF_THICKNESS);
      }
    }
    if(project.roof?.type!=="flat")for(const loop of [part.wallContour.outer,...part.wallContour.holes])for(let i=0;i<loop.length;i++){
      const samples=edgeSamples(part,loop[i],loop[(i+1)%loop.length]);
      for(let j=0;j<samples.length-1;j++){
        const p=samples[j],q=samples[j+1];
        fascia(gables,p,q,part.base,part.base,edgeHeight(part,p),edgeHeight(part,q));
      }
    }
  }
  if(surface.length){
    const object=mesh(surface.concat(underside),color.getHex(),"roof-surface");
    if(profile!=="smooth")applyRoofProfile(object,profile,surface.length/3);
    group.add(object);
  }
  if(edges.length)group.add(mesh(edges,edgeColor,"roof-fascia"));if(gables.length){
    const object=mesh(gables,0xeeeae2,"roof-gables"),settings=facadeSettings(project);object.material.dispose();object.material=createFacadeMaterial(settings);object.material.side=THREE.DoubleSide;applyFacadeUV(object.geometry,settings);group.add(object);
  }
  group.userData.type=project.roof?.type??"none";group.userData.parts=data.parts.length;group.userData.maxHeight=data.maxHeight;group.userData.triangles=data.triangleCount;
  const details=buildRoofDetails(project,group,color);group.userData.roofDetails=details.userData;
  return data;
}
