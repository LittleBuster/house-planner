import * as THREE from "three";
import type {Project} from "./model";
import {siteGridLines} from "./siteGrid";
import {TERRAIN_LEVEL} from "./sceneSurfaces";

export class SiteGridScene{
  readonly object=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x557fa4,transparent:true,opacity:.24,depthWrite:false}));
  constructor(scene:THREE.Scene){this.object.name="shared-site-grid";scene.add(this.object);}
  setProject(project:Project){
    const values=siteGridLines(project),positions:number[]=[];
    for(let i=0;i<values.length;i+=2)positions.push(values[i],TERRAIN_LEVEL+.006,values[i+1]);
    this.object.geometry.dispose();this.object.geometry=new THREE.BufferGeometry();this.object.geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  }
  dispose(){this.object.geometry.dispose();this.object.material.dispose();this.object.removeFromParent();}
}
