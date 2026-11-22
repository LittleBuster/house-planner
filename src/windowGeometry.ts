import * as THREE from "three";
import type { Opening } from "./model";
import { openingBottom, windowBottomRail, windowDividers, windowPaneBounds, WINDOW_FRAME_WIDTH } from "./windowSections";
import { applyWindowFrameUV } from "./windowMaterials";
import { windowVentLocalAngle, windowVentTarget, WINDOW_VENT_DEPTH, type WindowVent } from "./windowVentPhysics";

function createVent(opening:Opening,vent:WindowVent,frame:THREE.Material,glass:THREE.Material,metal:THREE.Material) {
  const pivot=new THREE.Group(),{x,z,length,height,side}=vent;
  pivot.name=`window-vent-${vent.id}`;
  pivot.userData.hingedLeaf=pivot.name;
  pivot.position.set(x,vent.bottom-openingBottom(opening),z);
  pivot.rotation.y=-windowVentLocalAngle(vent,windowVentTarget(vent));
  const rail=Math.min(.032,length*.19,height*.18);
  const box=(width:number,height:number,depth:number,x:number,y:number,z:number,material:THREE.Material,name:string)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
    mesh.name=name;
    mesh.position.set(x,y,z);
    mesh.receiveShadow=true;
    mesh.castShadow=material!==glass;
    applyWindowFrameUV(mesh.geometry,material);
    pivot.add(mesh);
  };
  for(const x of [rail/2,length-rail/2])box(rail,height,WINDOW_VENT_DEPTH,x,height/2,0,frame,"vent-stile");
  for(const y of [rail/2,height-rail/2])box(length-2*rail,rail,WINDOW_VENT_DEPTH,length/2,y,0,frame,"vent-rail");
  box(length-2*rail,height-2*rail,.014,length/2,height/2,0,glass,"window-pane");
  const handleWidth=Math.min(.072,length*.25),handleHeight=Math.min(.022,height*.12);
  box(handleWidth,handleHeight,.026,length-handleWidth*.7,height*.48,side*(vent.mirrored?-1:1)*.02,metal,"vent-handle");
  pivot.userData.handlePoints=[new THREE.Vector3(length/2,height/2,0)];
  return pivot;
}

export function createWindowSections(opening: Opening, depth: number, frame: THREE.Material, glass: THREE.Material, vents:WindowVent[] = [], metal=frame) {
  const group = new THREE.Group();
  group.name = "window-sections";
  group.userData.openingId = opening.id;
  const bottom = openingBottom(opening), rail = windowBottomRail(opening);
  group.position.set(opening.offset - opening.width / 2, bottom, 0);
  const fw = WINDOW_FRAME_WIDTH, dividers = windowDividers(opening);
  const paneHeight = opening.sill + opening.height - bottom - fw - rail;
  const paneCenter = rail + paneHeight/2;
  const hitMaterial=vents.length?new THREE.MeshBasicMaterial({
    side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false,colorWrite:false,
  }):null;
  for (const x of dividers) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(fw, paneHeight, depth), frame);
    applyWindowFrameUV(mullion.geometry, frame);
    mullion.name = "window-mullion";
    mullion.position.set(x, paneCenter, 0);
    mullion.castShadow = mullion.receiveShadow = true;
    group.add(mullion);
  }
  for (const [i,{left,right}] of windowPaneBounds(opening).entries()) {
    const vent=vents.find(v=>v.section===i);
    if(vent){
      const sash=createVent(opening,vent,frame,glass,metal);
      const aperture=new THREE.Mesh(new THREE.PlaneGeometry(vent.length,vent.height),hitMaterial!);
      aperture.position.set(vent.x+(vent.mirrored?-1:1)*vent.length/2,vent.bottom-bottom+vent.height/2,vent.z);
      aperture.userData.ventAperture=sash.name;
      group.add(sash,aperture);
      continue;
    }
    const pane = new THREE.Mesh(new THREE.BoxGeometry(right - left, paneHeight, .014), glass);
    pane.name = "window-pane";
    pane.position.set((left + right) / 2, paneCenter, 0);
    pane.receiveShadow = true;
    group.add(pane);
  }
  return group;
}
