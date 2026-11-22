import * as THREE from "three";
import type {Point,Project,Wall} from "./model";
import {buildingFootprints} from "./roofModel";
import {insidePolygon} from "./landscape";
import {facadeSettings} from "./facadeSettings";
import {applyFacadeUV} from "./facadeMaterials";
import {createWallPieceGeometry} from "./wallGeometry";
import type {WallBody} from "./wallBodies";

export function facadeContext(project:Pick<Project,"walls">){
  const contours=buildingFootprints(project.walls).map(b=>b.contour);
  return{
    outside:(p:Point)=>!contours.some(c=>insidePolygon(p,c.outer)&&!c.holes.some(h=>insidePolygon(p,h))),
    cuts:(wall:Wall,start:number,end:number)=>{
      const length=Math.hypot(wall.b.x-wall.a.x,wall.b.y-wall.a.y),dx=(wall.b.x-wall.a.x)/length,dy=(wall.b.y-wall.a.y)/length,values=[start,end];
      for(const contour of contours)for(const p of [contour.outer,...contour.holes].flat()){
        const x=p.x-wall.a.x,y=p.y-wall.a.y,t=x*dx+y*dy;
        if(Math.abs(x*dy-y*dx)<=wall.thickness/2+.004&&t>start+.0001&&t<end-.0001)values.push(t);
      }
      return [...new Set(values.map(v=>Math.round(v*1e6)/1e6))].sort((a,b)=>a-b);
    },
  };
}
export function createFacadeWallPieces(wall:Wall,body:WallBody,start:number,end:number,bottom:number,top:number,project:Pick<Project,"walls"|"facade">,context=facadeContext(project)){
  if(end-start<.001||top-bottom<.001)return[];
  const cuts=context.cuts(wall,start,end),result:THREE.BufferGeometry[]=[];
  for(let i=0;i<cuts.length-1;i++){
    const geometry=createWallPieceGeometry(wall,body,cuts[i],cuts[i+1],bottom,top);if(!geometry)continue;
    applyWallFacade(geometry,wall,project,context);result.push(geometry);
  }
  return result;
}
export function applyWallFacade(geometry:THREE.BufferGeometry,wall:Wall,project:Pick<Project,"walls"|"facade">,context=facadeContext(project)){
  const p=geometry.attributes.position,n=geometry.attributes.normal,index=geometry.index,length=Math.hypot(wall.b.x-wall.a.x,wall.b.y-wall.a.y),axis={x:(wall.b.x-wall.a.x)/length,y:(wall.b.y-wall.a.y)/length};
  const at=(i:number)=>index?index.getX(i):i,count=index?index.count:p.count;geometry.clearGroups();let exteriorTriangles=0,interiorTriangles=0;
  for(let i=0;i<count;i+=3){
    const ids=[at(i),at(i+1),at(i+2)],x=ids.reduce((s,j)=>s+p.getX(j),0)/3,y=ids.reduce((s,j)=>s+p.getY(j),0)/3,z=ids.reduce((s,j)=>s+p.getZ(j),0)/3,j=ids[0],nx=n.getX(j),ny=n.getY(j),nz=n.getZ(j);
    const vertical=Math.abs(ny)<.5,outward=vertical&&context.outside({x:x+nx*.003,y:z+nz*.003});
    const along=(x-wall.a.x)*axis.x+(z-wall.a.y)*axis.y,center={x:wall.a.x+axis.x*along,y:wall.a.y+axis.y*along},half=wall.thickness/2+.003;
    const outsideWall=context.outside({x:center.x-axis.y*half,y:center.y+axis.x*half})||context.outside({x:center.x+axis.y*half,y:center.y-axis.x*half});
    const reveal=outsideWall&&(vertical&&Math.abs(nx*axis.x+nz*axis.y)>.5||!vertical&&y>.001&&y<wall.height-.001);
    const material=outward||reveal?1:0,last=geometry.groups[geometry.groups.length-1];
    if(last&&last.materialIndex===material)last.count+=3;else geometry.addGroup(i,3,material);
    if(material)exteriorTriangles++;else interiorTriangles++;
  }
  applyFacadeUV(geometry,facadeSettings(project));geometry.userData.facadeTriangles=exteriorTriangles;geometry.userData.interiorTriangles=interiorTriangles;
  return{exteriorTriangles,interiorTriangles};
}
