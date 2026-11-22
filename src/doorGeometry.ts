import * as THREE from "three";
import type { Opening } from "./model";
import { DOOR_FRAME, DOOR_LEAF_THICKNESS, doorHingeOffset, doorLeafLength, doorLocalAngle, doorTarget } from "./doorPhysics";
import { applyWindowFrameUV } from "./windowMaterials";

export function createDoorLeaf(door:Opening,finish:THREE.Material,metal:THREE.Material){
  const pivot=new THREE.Group(),length=doorLeafLength(door),height=door.height-DOOR_FRAME-.02;
  pivot.name=`door-leaf-${door.id}`;pivot.userData.hingedLeaf=pivot.name;
  pivot.position.set(doorHingeOffset(door),door.sill+.01,0);pivot.rotation.y=-doorLocalAngle(door,doorTarget(door));
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;applyWindowFrameUV(mesh.geometry,material);pivot.add(mesh);return mesh;
  };
  box(length,height,DOOR_LEAF_THICKNESS,length/2,height/2,0,finish);
  const handleY=Math.min(1.01,height*.55),handleX=length-.10;
  const hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});
  for(const side of [-1,1]){
    box(.045,.14,.012,handleX,handleY,side*.028,metal);
    box(.025,.025,.055,handleX,handleY,side*.048,metal);
    box(.12,.025,.028,handleX-.047,handleY,side*.076,metal);
    const hit=box(.24,.24,.13,handleX-.04,handleY,side*.06,hitMaterial);hit.castShadow=hit.receiveShadow=false;hit.name=`door-handle-${door.id}-${side}`;
  }
  pivot.userData.handlePoints=[-1,1].map(side=>new THREE.Vector3(handleX-.04,handleY,side*.076));
  return pivot;
}
