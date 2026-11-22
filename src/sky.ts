import * as THREE from "three";

export const SUN_DIRECTION=new THREE.Vector3(-.35,.48,-1).normalize();
const CLOUD_SPAN=2100;
export const CLOUD_SPEED=2.2;
const started=performance.now();
const random=(index:number)=>{const x=Math.sin(index*127.1+31.7)*43758.5453;return x-Math.floor(x);};
export function cloudPosition(index:number,seconds:number){
  const x=((random(index+1)*CLOUD_SPAN+seconds*CLOUD_SPEED)%CLOUD_SPAN+CLOUD_SPAN)%CLOUD_SPAN-CLOUD_SPAN/2;
  return{x,y:115+random(index+101)*125,z:(random(index+201)-.5)*1800};
}
function cloudTexture(seed:number){
  const canvas=document.createElement("canvas");canvas.width=512;canvas.height=256;const ctx=canvas.getContext("2d")!;
  const mask=document.createElement("canvas");mask.width=512;mask.height=256;const shape=mask.getContext("2d")!;
  shape.fillStyle="white";shape.beginPath();shape.ellipse(256,158,188,43,0,0,Math.PI*2);
  for(let i=0;i<17;i++){
    const x=78+random(seed*61+i)*356,y=116+random(seed*73+i+30)*35,r=33+random(seed*87+i+60)*47;
    shape.moveTo(x+r,y);shape.arc(x,y,r,0,Math.PI*2);
  }
  shape.fill();ctx.shadowColor="rgba(241,249,255,.55)";ctx.shadowBlur=5;ctx.drawImage(mask,0,0);ctx.shadowBlur=0;
  ctx.globalCompositeOperation="source-in";
  const shade=ctx.createLinearGradient(0,40,0,215);shade.addColorStop(0,"#ffffff");shade.addColorStop(.55,"#ffffff");shade.addColorStop(1,"#cfddeb");ctx.fillStyle=shade;ctx.fillRect(0,0,512,256);
  ctx.globalCompositeOperation="source-over";
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function sunTexture(){
  const c=document.createElement("canvas");c.width=c.height=256;const ctx=c.getContext("2d")!,g=ctx.createRadialGradient(128,128,0,128,128,128);
  g.addColorStop(0,"rgba(255,255,237,1)");g.addColorStop(.12,"rgba(255,253,220,1)");g.addColorStop(.15,"rgba(255,247,200,.7)");g.addColorStop(.3,"rgba(255,240,183,.22)");g.addColorStop(1,"rgba(255,240,183,0)");ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export class DaySky{
  readonly root=new THREE.Group();
  readonly clouds:THREE.Sprite[]=[];
  private textures:THREE.Texture[]=[];
  private dome:THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;
  private sun:THREE.Sprite;
  constructor(scene:THREE.Scene){
    this.root.name="day-sky";
    this.dome=new THREE.Mesh(new THREE.SphereGeometry(2600,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthTest:false,depthWrite:false,toneMapped:false,fog:false,
      vertexShader:`varying vec3 direction;void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 direction;void main(){float h=normalize(direction).y;vec3 horizon=vec3(.69,.85,.97);vec3 zenith=vec3(.13,.43,.79);vec3 color=mix(horizon,zenith,pow(max(h,0.0),.55));color=mix(vec3(.78,.87,.92),color,smoothstep(-.12,.02,h));gl_FragColor=vec4(color,1.0);}`,
    }));this.dome.renderOrder=-1000;this.dome.frustumCulled=false;this.root.add(this.dome);
    const sunMap=sunTexture();this.textures.push(sunMap);this.sun=new THREE.Sprite(new THREE.SpriteMaterial({map:sunMap,depthWrite:false,depthTest:true,fog:false,toneMapped:false}));this.sun.name="visible-sun";this.sun.scale.set(180,180,1);this.sun.position.copy(SUN_DIRECTION).multiplyScalar(1850);this.sun.renderOrder=-800;this.root.add(this.sun);
    const maps=Array.from({length:4},(_,i)=>cloudTexture(i+1));this.textures.push(...maps);
    for(let i=0;i<30;i++){
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:maps[i%4],depthWrite:false,depthTest:true,fog:false,toneMapped:false,opacity:.88+random(i+401)*.12}));
      const width=110+random(i+301)*145;sprite.scale.set(width,width*.5,1);sprite.name=`cloud-${i}`;sprite.renderOrder=-500;this.clouds.push(sprite);this.root.add(sprite);
    }
    scene.add(this.root);
  }
  update(camera:THREE.Camera,now:number){
    this.root.position.copy(camera.position);const elapsed=(now-started)/1000;
    this.clouds.forEach((cloud,i)=>{const p=cloudPosition(i,elapsed);cloud.position.set(p.x,p.y,p.z);const edge=1-Math.pow(Math.abs(p.x)/(CLOUD_SPAN/2),8);(cloud.material as THREE.SpriteMaterial).opacity=Math.max(0,edge)*.95;});
    return elapsed*CLOUD_SPEED;
  }
  dispose(){this.dome.geometry.dispose();this.dome.material.dispose();this.sun.material.dispose();this.clouds.forEach(c=>c.material.dispose());this.textures.forEach(t=>t.dispose());this.root.removeFromParent();}
}
