import * as THREE from "three";
import { facadePixels, createFacadeMaterial } from "./facadeMaterials";
import { STUCCO_COLORS, type FacadeSettings } from "./facadeSettings";
import type { InteriorSettings, PlinthSettings } from "./houseFinishes";

export function createInteriorMaterial(settings:InteriorSettings,exterior:FacadeSettings){
  const material=settings.kind==="stucco"?createFacadeMaterial({kind:"stucco",color:settings.color}):new THREE.MeshStandardMaterial({color:STUCCO_COLORS.find(c=>c.id===settings.color)!.color,roughness:.84});
  if(material.bumpMap){
    const metres=facadePixels(exterior).metres;
    material.map!.repeat.set(metres[0]/.256,metres[1]/.256);material.bumpMap.repeat.copy(material.map!.repeat);material.bumpScale=.0015;
  }
  material.name=`interior-${settings.kind}-${settings.color}`;material.userData.interior={...settings};return material;
}
export function createPlinthMaterial(settings:PlinthSettings,exterior:FacadeSettings){
  const material=createFacadeMaterial({kind:"stucco",color:settings.color}),metres=facadePixels(exterior).metres;
  material.map!.repeat.set(metres[0]/.256,metres[1]/.256);material.bumpMap!.repeat.copy(material.map!.repeat);material.bumpScale=.001;material.name=`plinth-${settings.color}`;return material;
}
