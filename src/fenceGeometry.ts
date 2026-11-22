import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FENCE_HEIGHT, FENCE_LENGTH, FENCE_POST, type FenceKind } from "./fenceSettings";
import { GATE_BOTTOM, GATE_FRAME } from "./gateSettings";

function batch(parts: THREE.BufferGeometry[]) {
  const merged=mergeGeometries(parts)!;
  parts.forEach(part=>part.dispose());
  return merged;
}

function rod(a:THREE.Vector3,b:THREE.Vector3,radius:number) {
  const axis=b.clone().sub(a);
  const geometry=new THREE.CylinderGeometry(radius,radius,axis.length(),5,1,true);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize()));
  return geometry.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
}

const left=FENCE_POST/2;

function weldedMesh(length: number) {
  const right=length-left;
  const folds=[.38,.94,1.57];
  const profile=[.06,...folds.flatMap(y=>[y-.045,y-.012,y+.012,y+.045]),FENCE_HEIGHT-.003];
  const offset=(y:number)=>Math.max(0,...folds.map(rib=>.052*Math.min(1,Math.max(0,(.045-Math.abs(y-rib))/.033))));
  const parts:THREE.BufferGeometry[]=[];
  const wire=(ax:number,ay:number,bx:number,by:number)=>{
    parts.push(rod(new THREE.Vector3(ax,ay,offset(ay)),new THREE.Vector3(bx,by,offset(by)),.0026));
  };
  const gaps=Math.max(1,Math.round((right-left)/.05));
  for (let i=0;i<=gaps;i++) {
    const x=left+(right-left)*i/gaps;
    for (let j=1;j<profile.length;j++) wire(x,profile[j-1],x,profile[j]);
  }
  const rows=[.08,.27,.52,.71,1.07,1.26,1.45,1.77,...folds.flatMap(y=>[y-.012,y+.012])];
  for (const y of rows) wire(left,y,right,y);
  const bracketInset=Math.min(.015,(right-left)/4);
  for (const y of [.25,.88,1.51]) for (const x of [left+bracketInset,right-bracketInset])
    parts.push(new THREE.BoxGeometry(Math.min(.05,(right-left)/2),.022,.017).translate(x,y,.002));
  return batch(parts);
}

function metalPickets(length: number) {
  const right=length-left;
  const rails=[.40,1.39];
  const parts:THREE.BufferGeometry[]=rails.map(y=>new THREE.BoxGeometry(right-left,.045,.033).translate(length/2,y,-.015));
  const positions:number[]=[];
  // Each strip is one face of the folded metal profile.
  const profile=[[-1,.007],[-.80,.015],[-.64,.025],[-.40,.025],[-.27,.012],
    [-.12,.023],[.12,.023],[.27,.012],[.40,.025],[.64,.025],[.80,.015],[1,.007]];
  const top=(x:number)=>FENCE_HEIGHT-.055+.055*Math.sqrt(Math.max(0,1-x*x));
  const count=Math.max(1,Math.round((right-left)*17/(FENCE_LENGTH-FENCE_POST)));
  const pitch=(right-left)/count, halfWidth=Math.min(.052,pitch*.42);
  for (let index=0;index<count;index++) {
    const center=left+pitch*(index+.5);
    for (let i=1;i<profile.length;i++) {
      const [x1,z1]=profile[i-1], [x2,z2]=profile[i];
      const a=center+x1*halfWidth,b=center+x2*halfWidth;
      positions.push(a,.07,z1,b,.07,z2,b,top(x2),z2, a,.07,z1,b,top(x2),z2,a,top(x1),z1);
    }
    for (const y of rails) parts.push(rod(new THREE.Vector3(center,y,.021),new THREE.Vector3(center,y,.027),.0043));
  }
  const strips=new THREE.BufferGeometry();
  strips.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  strips.computeVertexNormals();
  // The rails and rods are indexed and carry UVs; the folded strips only need normals.
  const frame=batch(parts);
  const railsAndScrews=frame.toNonIndexed();
  frame.dispose();
  railsAndScrews.deleteAttribute("uv");
  return batch([strips,railsAndScrews]);
}

export const createFencePanel = (kind: FenceKind, length=FENCE_LENGTH) => kind==="mesh" ? weldedMesh(length) : metalPickets(length);

export function createGateFrame(kind: FenceKind, length: number) {
  const height=FENCE_HEIGHT-GATE_BOTTOM, depth=.043;
  const parts=[
    ...[GATE_BOTTOM+GATE_FRAME/2,FENCE_HEIGHT-GATE_FRAME/2].map(y=>
      new THREE.BoxGeometry(length,GATE_FRAME,depth).translate(length/2,y,0)),
    ...[GATE_FRAME/2,length-GATE_FRAME/2].map(x=>
      new THREE.BoxGeometry(GATE_FRAME,height-2*GATE_FRAME,depth).translate(x,GATE_BOTTOM+height/2,0)),
  ];
  if (kind==="mesh") {
    const bottom=new THREE.Vector3(GATE_FRAME,GATE_BOTTOM+GATE_FRAME,-.027);
    const top=new THREE.Vector3(length-GATE_FRAME,FENCE_HEIGHT-GATE_FRAME,-.027);
    const diagonal=top.clone().sub(bottom);
    const angle=Math.atan2(diagonal.y,diagonal.x);
    parts.push(new THREE.BoxGeometry(diagonal.length(),.025,.027).rotateZ(angle)
      .translate((bottom.x+top.x)/2,(bottom.y+top.y)/2,bottom.z));
  }
  return batch(parts);
}

export function createGateInfill(kind: FenceKind, length: number) {
  const height=FENCE_HEIGHT-GATE_BOTTOM-2*GATE_FRAME;
  return createFencePanel(kind,length-.03).scale(1,height/FENCE_HEIGHT,kind==="mesh"?.68:1)
    .translate(.015,GATE_BOTTOM+GATE_FRAME,0);
}

export function createFencePost() {
  return batch([
    new THREE.BoxGeometry(FENCE_POST,FENCE_HEIGHT-.012,FENCE_POST).translate(0,(FENCE_HEIGHT-.012)/2,0),
    new THREE.BoxGeometry(FENCE_POST+.004,.012,FENCE_POST+.004).translate(0,FENCE_HEIGHT-.006,0),
  ]);
}
