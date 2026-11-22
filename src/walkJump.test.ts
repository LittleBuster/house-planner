import {test} from "node:test";
import assert from "node:assert/strict";
import {PerspectiveCamera} from "three";
import {parseProject, type Project, type Plant} from "./model";
import {plantTrunkRadius,plantVariant} from "./landscape";
import {WalkControls} from "./WalkControls";
import {houseFloorLevel} from "./houseFinishes";
import {beginJump,stepJump,jumpHeadroom,createColliders,movePerson,isWalkable,JUMP_HEIGHT,JUMP_SPEED,GRAVITY,EYE_HEIGHT,PERSON_HEIGHT,type JumpState} from "./walkPhysics";

const close=(a:number,b:number,tolerance=1e-6)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const empty=():Project=>({version:1,name:"Прыжок",walls:[],openings:[]});
const doorway=():Project=>({...empty(),walls:[{id:"wall",a:{x:0,y:0},b:{x:6,y:0},thickness:.22,height:2.8}],openings:[{id:"door",wallId:"wall",kind:"door",offset:3,width:.9,height:2.1,sill:0}]});
test("a jump follows gravity, rises 45 cm and lands exactly at ground level at different frame rates",()=>{
  for(const fps of [30,60,144]){
    let state=beginJump({height:0,velocity:0}),peak=0,frames=0;
    do{state=stepJump(state,1/fps);peak=Math.max(peak,state.height);frames++;assert(state.height>=0);assert(frames<fps*2);}while(state.height>0||state.velocity!==0);
    close(peak,JUMP_HEIGHT,.002);close(frames/fps,2*JUMP_SPEED/GRAVITY,1/fps+.001);assert.deepEqual(state,{height:0,velocity:0});
    close(EYE_HEIGHT+state.height,1.65);assert.deepEqual(stepJump(state,1/fps),state);
  }
});
test("additional jump requests in the air add no impulse and only landing enables a new jump",()=>{
  let state=beginJump({height:0,velocity:0});assert.equal(beginJump(state),state);
  for(let frame=0;frame<50;frame++){
    state=stepJump(state,1/120);assert.equal(beginJump(state),state);
  }
  while(state.height>0)state=stepJump(state,1/120);
  close(beginJump(state).velocity,JUMP_SPEED);
  for(const dt of [-1,NaN,Infinity,0])assert.equal(stepJump(state,dt),state);
  assert.deepEqual(stepJump(beginJump(state),10),stepJump(beginJump(state),.05));
});
test("a door lintel stops upward motion, while a high airborne person cannot enter the doorway",()=>{
  const p=doorway(),position={x:3,y:0},floor=houseFloorLevel(p),limit=jumpHeadroom(p,position)-floor;close(limit,.295);
  let state=beginJump({height:0,velocity:0}),peak=0;
  for(let frame=0;frame<80;frame++){
    state=stepJump(state,1/120,limit);peak=Math.max(peak,state.height);
    assert(state.height<=limit+1e-8);assert(PERSON_HEIGHT+state.height<2.1-.045);
    assert(isWalkable(position,createColliders(p,.025,floor+state.height)));
  }
  close(peak,limit);assert.deepEqual(state,{height:0,velocity:0});
  const blocked=movePerson({x:3,y:1},{x:0,y:-2},createColliders(p,.025,floor+.45));assert(blocked.y>.33);
  const through=movePerson({x:3,y:1},{x:0,y:-2},createColliders(p,.025,0));close(through.y,-1);
  assert.equal(jumpHeadroom(p,{x:3,y:1}),Infinity);
  const rotated=structuredClone(p);rotated.walls[0].a={x:0,y:0};rotated.walls[0].b={x:0,y:6};close(jumpHeadroom(rotated,{x:0,y:3})-floor,limit);
});
test("walls, windows and trunks stay solid during jumps while branches leave full headroom",()=>{
  const p=doorway();p.openings[0].kind="window";
  for(const height of [0,.15,.45]){
    const end=movePerson({x:3,y:1},{x:0,y:-3},createColliders(p,.025,height));assert(end.y>.33);
  }
  const shape=plantVariant("birch","birch-2"),plant:Plant={id:"tree",kind:"birch",variant:"birch-2",height:2/shape.crownBottom,position:{x:0,y:0},rotation:0,seed:1};
  const garden={...empty(),plants:[plant]},radius=plant.height*shape.crownRatio/2,under={x:radius*.8,y:0};
  assert.equal(jumpHeadroom(garden,under),Infinity);
  for(const height of [0,.2,.45]){
    const colliders=createColliders(garden,.025,height);
    assert.deepEqual(colliders,[{center:plant.position,radius:plantTrunkRadius(plant)}]);
    assert(isWalkable(under,colliders));
    const end=movePerson({x:-radius-1,y:0},{x:(radius+1)*2,y:0},colliders);assert(end.x<0);
  }
});
test("Space input jumps once per press, cannot jump while paused and preserves movement in the air",()=>{
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),originalDocument=Object.getOwnPropertyDescriptor(globalThis,"document");
  const doc=new EventTarget() as EventTarget&{pointerLockElement:null;hidden:boolean};doc.pointerLockElement=null;doc.hidden=false;
  const win=new EventTarget();Object.defineProperty(globalThis,"window",{value:win,configurable:true});Object.defineProperty(globalThis,"document",{value:doc,configurable:true});
  const canvas=Object.assign(new EventTarget(),{dataset:{} as Record<string,string>,tabIndex:0,setAttribute(){},focus(){}});
  const camera=new PerspectiveCamera();let controls:WalkControls|undefined;
  const key=(type:string,code:string,repeat=false)=>{const e=Object.assign(new Event(type,{cancelable:true}),{code,key:code==="Space"?" ":code==="Escape"?"Escape":code,repeat,metaKey:false,ctrlKey:false,altKey:false});doc.dispatchEvent(e);return e;};
  const tick=(frames:number)=>{for(let i=0;i<frames;i++)controls!.update(1/120);};
  try{
    controls=new WalkControls(camera,canvas as unknown as HTMLCanvasElement,empty(),()=>{});
    key("keydown","Space");tick(10);close(camera.position.y,EYE_HEIGHT);
    controls.start(false);assert(key("keydown","Space").defaultPrevented);tick(12);assert(camera.position.y>EYE_HEIGHT+.2);
    key("keydown","Space",true);key("keyup","Space");key("keydown","Space");key("keydown","KeyW");const z=camera.position.z;tick(15);assert(camera.position.z<z);assert(camera.position.y<=EYE_HEIGHT+JUMP_HEIGHT);
    tick(100);close(camera.position.y,EYE_HEIGHT);assert.equal(canvas.dataset.grounded,"true");key("keydown","Space",true);tick(20);close(camera.position.y,EYE_HEIGHT);
    key("keyup","Space");key("keydown","Space");tick(10);assert(camera.position.y>EYE_HEIGHT);key("keydown","Escape");const paused=camera.position.y;tick(60);close(camera.position.y,paused);
    key("keydown","Space");tick(20);close(camera.position.y,paused);controls.start(false);tick(100);close(camera.position.y,EYE_HEIGHT);
    key("keydown","Space");tick(10);controls.reset();close(camera.position.y,EYE_HEIGHT);assert.equal(canvas.dataset.grounded,"true");
    controls.setSuspended(true);key("keydown","Space");tick(10);close(camera.position.y,EYE_HEIGHT);
  }finally{
    controls?.dispose();if(originalWindow)Object.defineProperty(globalThis,"window",originalWindow);else delete (globalThis as any).window;
    if(originalDocument)Object.defineProperty(globalThis,"document",originalDocument);else delete (globalThis as any).document;
  }
});

test("a French window and a door share the raised floor and can be entered by jumping or using steps", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis,"window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis,"document");
  const document = Object.assign(new EventTarget(),{pointerLockElement:null,hidden:false});
  Object.defineProperty(globalThis,"window",{value:new EventTarget(),configurable:true});
  Object.defineProperty(globalThis,"document",{value:document,configurable:true});
  const canvas = Object.assign(new EventTarget(),{dataset:{} as Record<string,string>,tabIndex:0,setAttribute(){},focus(){}});
  const camera = new PerspectiveCamera();
  const key = (type:string, code:string) => document.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{code,key:code}));
  const corners = [{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}];
  const walls = corners.map((a,i) => ({id:"wall"+i,a,b:corners[(i+1)%4],thickness:.22,height:2.8}));
  let controls: WalkControls | undefined;
  const tick = (frames: number) => { for (let i=0; i<frames; i++) controls!.update(1/120); };
  try {
    for (const kind of ["door","window"] as const) {
      for (const steps of [false,true]) {
        const opening = {...doorway().openings[0],wallId:"wall0",kind,
          ...(kind === "window"
            ? {french:true,sill:.9,height:1.4,sectionWidths:[.9],ventSections:["open" as const]}
            : {open:true}),
          entrySteps:steps,
        };
        const project = {...empty(),walls,openings:[opening]};
        assert.deepEqual(parseProject(JSON.stringify(project)),project);
        const closed = {...project,openings:[kind === "window"
          ? {...opening,ventSections:["closed" as const]} : {...opening,open:false}]};
        assert(!isWalkable({x:3,y:0},createColliders(closed)));
        controls = new WalkControls(camera,canvas as unknown as HTMLCanvasElement,project,()=>{});
        close(camera.position.y,2);
        controls.start(false);
        key("keydown","KeyW"); tick(300); key("keyup","KeyW");
        assert(camera.position.z < -.9);
        close(camera.position.y,EYE_HEIGHT);

        key("keydown","KeyS"); tick(250);
        if (!steps) {
          assert(camera.position.z < -.06 && camera.position.z > -.1);
          close(camera.position.y,EYE_HEIGHT);
          key("keydown","Space"); tick(80); key("keyup","Space");
        }
        key("keyup","KeyS");
        assert(camera.position.z > .2, `${kind}, steps=${steps}: z=${camera.position.z}`);
        close(camera.position.y,2);
        controls.dispose();
        controls=undefined;
      }
    }
  } finally {
    controls?.dispose();
    if (originalWindow) Object.defineProperty(globalThis,"window",originalWindow); else delete (globalThis as any).window;
    if (originalDocument) Object.defineProperty(globalThis,"document",originalDocument); else delete (globalThis as any).document;
  }
});
