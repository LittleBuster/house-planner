import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bounds, findRooms, wallLength, type Project } from "./model";
import { WalkControls, type WalkState } from "./WalkControls";
import { WalkHUD } from "./WalkHUD";
import { Icon } from "./icons";
import { LandscapeScene, type LandscapeOptions } from "./LandscapeScene";
import { GateLayer } from "./GateLayer";
import { siteBounds } from "./landscape";
import { loadPlantLibrary } from "./plantModels";
import { loadLawnLibrary } from "./lawnModels";
import { createRoomFloor, createTerrain, SITE_LEVEL } from "./sceneSurfaces";
import { applyFloorUV, floorMaterial } from "./floorMaterials";
import { createWindowSections } from "./windowGeometry";
import { openingBottom, windowBottomRail, WINDOW_FRAME_WIDTH } from "./windowSections";
import { windowFrameFinish, type WindowFrameFinish } from "./windowFinishes";
import { applyWindowFrameUV, createWindowFrameMaterial } from "./windowMaterials";
import {wallBody} from "./wallBodies";
import {createFacadeWallPieces,facadeContext} from "./facadeGeometry";
import {createFacadeMaterial,disposeOwnedMaterialTextures} from "./facadeMaterials";
import {facadeSettings} from "./facadeSettings";
import {roofColor,roofSurface} from "./roofSettings";
import {buildRoof} from "./roofGeometry";
import {roofData} from "./roofModel";
import {sceneDisplay} from "./sceneDisplay";
import {DaySky,SUN_DIRECTION} from "./sky";
import {SiteGridScene} from "./SiteGridScene";
import {lawnGridSize} from "./siteGrid";
import {houseFloorLevel,interiorSettings,plinthSettings,doorFinish,DOOR_FINISHES,type DoorFinish} from "./houseFinishes";
import {createInteriorMaterial,createPlinthMaterial} from "./interiorMaterials";
import {createFoundation} from "./plinthGeometry";
import {entryExteriorSide,entryTreads} from "./entrySteps";
import {createDoorLeaf} from "./doorGeometry";
import {OpeningController} from "./OpeningController";
import {projectWindowVents,type WindowVent} from "./windowVentPhysics";

type Runtime = {
  floors: THREE.Group;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls | null;
  walker: WalkControls | null;
  landscape: LandscapeScene;
  openings:OpeningController;
  model: THREE.Group;
  roof: THREE.Group;
  siteGrid:SiteGridScene;
  stairs:THREE.Group;
  syncDisplay:()=>void;
  fit: () => void;
  viewSite:()=>void;
};
function disposeModel(group: THREE.Group) {
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      (Array.isArray(object.material)
        ? object.material
        : [object.material]
      ).forEach((m) => materials.add(m));
    }
  });
  materials.forEach((m) => {disposeOwnedMaterialTextures(m);m.dispose();});
  group.clear();
}
function buildModel(project: Project, group: THREE.Group) {
  const exterior=createFacadeMaterial(facadeSettings(project)),facade=facadeContext(project);
  let facadeTriangles=0,interiorTriangles=0,plinthTriangles=0;
  const plaster=createInteriorMaterial(interiorSettings(project),facadeSettings(project));
  const plinth=createPlinthMaterial(plinthSettings(project),facadeSettings(project));
  const handleMetal=new THREE.MeshStandardMaterial({color:0x9b9d9e,metalness:.85,roughness:.27});
  const glass = new THREE.MeshStandardMaterial({
    color: 0xb4b4b4,
    transparent: true,
    opacity: 0.38,
    roughness: 0.13,
    metalness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const windowFrames = new Map<WindowFrameFinish, THREE.Material>();
  const doorMaterials=new Map<DoorFinish,THREE.Material>();
  const windowVents=new Map<string,WindowVent[]>();
  for(const vent of projectWindowVents(project)){
    const list=windowVents.get(vent.openingId);
    if(list)list.push(vent);else windowVents.set(vent.openingId,[vent]);
  }
  const box = (
    parent: THREE.Group,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) => {
    if (w < 0.001 || h < 0.001) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    applyWindowFrameUV(mesh.geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  group.position.y = houseFloorLevel(project);
  const foundation = createFoundation(project,plinth);
  for (const mesh of foundation) {
    plinthTriangles += mesh.geometry.groups.find(part => part.materialIndex === 1)!.count/3;
    group.add(mesh);
  }
  const entryHit = new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
  let entryHits = 0;
  project.walls.forEach((wall) => {
    const local = new THREE.Group(),
      length = wallLength(wall);
    const body=wallBody(wall,project.walls);
    local.position.set(wall.a.x, 0, wall.a.y);
    local.rotation.y = -Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
    group.add(local);
    const openings = project.openings
      .filter((o) => o.wallId === wall.id)
      .sort((a, b) => a.offset - b.offset);
    const wallPiece = (
      start: number,
      end: number,
      bottom = 0,
      top = wall.height,
    ) => {
      for(const geometry of createFacadeWallPieces(wall,body,start,end,bottom,top,project,facade)){
        facadeTriangles+=geometry.userData.facadeTriangles;interiorTriangles+=geometry.userData.interiorTriangles;
        const mesh=new THREE.Mesh(geometry,[plaster,exterior]);mesh.userData.wallSurface=true;mesh.userData.wallHeight=wall.height;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
      }
    };
    let start = body.min;
    for (const o of openings) {
      let openingFrame: THREE.Material;
      if (o.kind === "window") {
        const finish = windowFrameFinish(o);
        if (!windowFrames.has(finish)) windowFrames.set(finish, createWindowFrameMaterial(finish));
        openingFrame = windowFrames.get(finish)!;
      }else{
        const finish=doorFinish(o,project);
        if(!doorMaterials.has(finish))doorMaterials.set(finish,finish==="wood"?createWindowFrameMaterial("wood"):new THREE.MeshStandardMaterial({color:DOOR_FINISHES.find(c=>c.id===finish)!.color,roughness:.65,metalness:.08}));
        openingFrame=doorMaterials.get(finish)!;
      }
      const side = entryExteriorSide(project,o,wall);
      const left = o.offset - o.width / 2,
        right = o.offset + o.width / 2,
        top = o.sill + o.height,
        bottom = side && o.kind === "door" ? 0 : openingBottom(o),
        height = top - bottom;
      wallPiece(start, left);
      wallPiece(left, right, 0, bottom);
      wallPiece(left, right, top, wall.height);
      if (side) {
        const target = new THREE.Mesh(new THREE.PlaneGeometry(o.width,height),entryHit);
        target.position.set(o.offset,bottom+height/2,side*(wall.thickness/2+.02));
        target.userData.entryOpening = o.id;
        local.add(target);
        entryHits++;
      }
      const fw = WINDOW_FRAME_WIDTH,
        depth = wall.thickness + 0.025;
      box(
        local,
        fw,
        height,
        depth,
        left + fw / 2,
        bottom + height / 2,
        0,
        openingFrame,
      );
      box(
        local,
        fw,
        height,
        depth,
        right - fw / 2,
        bottom + height / 2,
        0,
        openingFrame,
      );
      box(local, o.width, fw, depth, o.offset, top - fw / 2, 0, openingFrame);
      if (o.kind === "window") {
        const rail = windowBottomRail(o);
        box(local, o.width, rail, depth, o.offset, bottom + rail / 2, 0, openingFrame);
        local.add(createWindowSections(o, depth, openingFrame, glass, windowVents.get(o.id), handleMetal));
        if (!o.french) box(
          local,
          o.width + 0.1,
          0.04,
          depth + 0.1,
          o.offset,
          o.sill - 0.02,
          0,
          openingFrame,
        );
      } else {
        local.add(createDoorLeaf({...o,sill:bottom,height},openingFrame,handleMetal));
      }
      start = right;
    }
    wallPiece(start, body.max);
  });
  if (!entryHits) entryHit.dispose();
  // Thin top outlines make wall intersections legible in the model.
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.wallSurface) {
      const raw=new THREE.EdgesGeometry(o.geometry),points=raw.attributes.position,top:number[]=[];
      for(let i=0;i<points.count;i+=2)if(Math.abs(points.getY(i)-o.userData.wallHeight)<.0001&&Math.abs(points.getY(i+1)-o.userData.wallHeight)<.0001){
        for(const j of[i,i+1])top.push(points.getX(j),points.getY(j),points.getZ(j));
      }
      raw.dispose();if(!top.length)return;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(top,3));
      const edges = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0xbbb8ad,
          transparent: true,
          opacity: 0.3,
        }),
      );
      o.add(edges);
    }
  });
  group.userData.facadeTriangles=facadeTriangles;group.userData.interiorTriangles=interiorTriangles;group.userData.plinthTriangles=plinthTriangles;
  if(!facadeTriangles&&!interiorTriangles)for(const m of [exterior,plaster]){disposeOwnedMaterialTextures(m);m.dispose();}
  if(!foundation.length){disposeOwnedMaterialTextures(plinth);plinth.dispose();}
  if(!windowVents.size&&!project.openings.some(o=>o.kind==="door"))handleMetal.dispose();
  if(!project.openings.some(o=>o.kind==="window"))glass.dispose();
}

export function ThreeView({
  project,
  resetKey,
  variant = "orbit",
  paused = false,
  landscaping,
  gridVisible=true,
  siteViewKey=0,
  onOpeningToggle,
  onGateToggle,
  onGateSelect,
  onEntryStepsToggle,
  placingSteps,
  notify,
  nativeFullscreen,
}: {
  project: Project;
  resetKey: number;
  variant?: "orbit" | "walk";
  paused?: boolean;
  landscaping?: LandscapeOptions;
  gridVisible?:boolean;
  siteViewKey?:number;
  onOpeningToggle:(id:string,section?:number)=>void;
  onGateToggle:(id:string)=>void;
  onGateSelect:(id:string)=>void;
  onEntryStepsToggle:(id:string)=>void;
  placingSteps:boolean;
  notify:(message:string)=>void;
  nativeFullscreen:boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    projectRef = useRef(project);
  const landscapeRef = useRef(landscaping);
  const openingOptions={toggle:onOpeningToggle,toggleGate:onGateToggle,selectGate:onGateSelect,toggleSteps:onEntryStepsToggle,placingSteps,
    disabled:paused||!!landscaping?.kind||!!landscaping?.lawn?.active||!!landscaping?.fence?.active||!!landscaping?.gate?.active};
  const openingOptionsRef=useRef(openingOptions);
  openingOptionsRef.current=openingOptions;
  const gridVisibleRef=useRef(gridVisible);gridVisibleRef.current=gridVisible;
  landscapeRef.current = landscaping;
  const [error, setError] = useState(false);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const fullscreen = nativeFullscreen || browserFullscreen;
  const [plantStatus, setPlantStatus] = useState<"loading" | "ready" | "error">("loading");
  const [lawnStatus, setLawnStatus] = useState<"loading" | "ready" | "error">("loading");
  const [walkState, setWalkState] = useState<WalkState>({
    active: false,
    input: "cursor",
    position: { x: 0, y: 0 },
    yaw: 0,
    blocked: false,
    running: false,
    jumping: false,
  });
  projectRef.current = project;
  useEffect(() => {
    if (!host.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        // Preserve centimetre-scale separation even at the farthest zoom.
        logarithmicDepthBuffer: true,
      });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.setAttribute("aria-label", "Трёхмерная модель дома");
    renderer.domElement.setAttribute("data-testid", "three-canvas");
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb0d9f7);
    scene.fog=new THREE.Fog(0xb0d9f7,1100,2400);
    const sky=new DaySky(scene);
    renderer.domElement.dataset.sky="day";renderer.domElement.dataset.cloudCount=String(sky.clouds.length);
    const camera = new THREE.PerspectiveCamera(
      variant === "walk" ? 60 : 38,
      1,
      variant === "walk" ? 0.04 : 0.1,
      3000,
    );
    const controls =
      variant === "orbit"
        ? new OrbitControls(camera, renderer.domElement)
        : null;
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.minDistance = 1;
      controls.maxDistance = 2000;
    }
    const walker =
      variant === "walk"
        ? new WalkControls(
            camera,
            renderer.domElement,
            projectRef.current,
            setWalkState,
          )
        : null;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd2cbbf, 2.3));
    const sun = new THREE.DirectionalLight(0xfff2dd, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.025;
    scene.add(sun);
    scene.add(sun.target);
    const ground = createTerrain();
    scene.add(ground);
    const siteGrid=new SiteGridScene(scene);
    const model = new THREE.Group();
    scene.add(model);
    const floors = new THREE.Group();
    scene.add(floors);
    const stairs = new THREE.Group();
    scene.add(stairs);
    const roof=new THREE.Group();roof.name="house-roof";scene.add(roof);
    const gates=new GateLayer(scene,renderer.domElement,SITE_LEVEL,projectRef.current);
    const openings=new OpeningController(camera,renderer.domElement,model,roof,gates.root,walker,()=>openingOptionsRef.current);
    const landscape = new LandscapeScene(
      scene,
      camera,
      renderer.domElement,
      controls,
      model,
      gates,
      projectRef.current,
      SITE_LEVEL,
      () =>
        landscapeRef.current ?? {
          kind: null,
          height: 7.5,
          selectedId: null,
          onSelect: () => {},
          onPlace: () => {},
          onMove: () => {},
          notify: () => {},
        },
      variant === "orbit",
    );
    const syncDisplay=()=>{
      const display=sceneDisplay(projectRef.current);model.visible=display.house;roof.visible=display.roof&&!!projectRef.current.roof;
      floors.visible=display.house;
      stairs.visible=display.house&&display.landscape;
      ground.visible=display.landscape;renderer.domElement.dataset.terrainVisible=String(ground.visible);
      siteGrid.object.visible=display.landscape&&variant==="orbit"&&gridVisibleRef.current;renderer.domElement.dataset.siteGridVisible=String(siteGrid.object.visible);
      landscape.setVisible(display.landscape);renderer.domElement.dataset.houseVisible=String(model.visible);renderer.domElement.dataset.roofVisible=String(roof.visible&&roof.children.length>0);
      renderer.domElement.dataset.roofDetailsVisible=String(roof.visible&&!!roof.getObjectByName('roof-accessories'));
      renderer.domElement.dataset.display=JSON.stringify(display);
    };
    let disposed = false;
    setPlantStatus("loading");
    void loadPlantLibrary().then(() => {
      if (disposed) return;
      landscape.setProject(projectRef.current);
      renderer.domElement.dataset.plantLibrary = "ready";
      setPlantStatus("ready");
    }).catch(() => { if (!disposed) setPlantStatus("error"); });
    setLawnStatus("loading");
    void loadLawnLibrary().then(() => {
      if (disposed) return;
      landscape.setProject(projectRef.current);
      renderer.domElement.dataset.lawnLibrary = "ready";
      setLawnStatus("ready");
    }).catch(() => { if (!disposed) setLawnStatus("error"); });
    const fit = (fromSite=false) => {
      const visible=sceneDisplay(projectRef.current);
      const b = visible.landscape?siteBounds(projectRef.current):bounds(projectRef.current.walls),
        cx = (b.minX + b.maxX) / 2,
        cz = (b.minY + b.maxY) / 2;
      const height = Math.max(
          2.8,
          ...(visible.house?projectRef.current.walls.map((w) => w.height+houseFloorLevel(projectRef.current)):[]),
          ...(visible.landscape?(projectRef.current.plants ?? []).map((p) => p.height):[]),
          visible.roof?roofData(projectRef.current).maxHeight+houseFloorLevel(projectRef.current):0,
        ),
        span = Math.max(5, b.maxX - b.minX, b.maxY - b.minY, height * 1.4);
      if (controls) {
        camera.fov=fromSite?60:38;camera.updateProjectionMatrix();
        controls.target.set(cx, height * (fromSite?.65:.25), cz);
        if(fromSite)camera.position.set(cx+span*.95,height*.65+span*.12,cz+span*2.4);
        else camera.position.set(
          cx + span * 0.95,
          height + span * 1.45,
          cz + span * 1.25,
        );
        controls.update();
        controls.saveState();
      } else walker?.reset();
      sun.position.copy(SUN_DIRECTION).multiplyScalar(span*3).add(new THREE.Vector3(cx,0,cz));
      sun.target.position.set(cx, 0, cz);
      Object.assign(sun.shadow.camera, {
        left: -span * 1.5,
        right: span * 1.5,
        top: span * 1.5,
        bottom: -span * 1.5,
        near: 0.1,
        far: span * 8,
      });
      sun.shadow.camera.updateProjectionMatrix();
    };
    const resize = () => {
      if (!host.current) return;
      const { width, height } = host.current.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    fit();
    runtime.current = {
      renderer,
      scene,
      camera,
      controls,
      walker,
      landscape,
      openings,
      model,
      roof,stairs,floors,siteGrid,syncDisplay,
      fit:()=>fit(),viewSite:()=>fit(true),
    };
    walker?.setSuspended(paused);
    syncDisplay();
    let raf = 0,
      frames = 0;
    let previousTime = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      if (controls?.enabled) controls.update();
      openings.update((now-previousTime)/1000);
      walker?.update((now - previousTime) / 1000);
      landscape.update();
      renderer.domElement.dataset.cloudWindOffset=sky.update(camera,now).toFixed(3);
      previousTime = now;
      renderer.render(scene, camera);
      renderer.domElement.dataset.frames = String(++frames);
    };
    animate();
    const lost = (e: Event) => {
      e.preventDefault();
      setError(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls?.dispose();
      walker?.dispose();
      landscape.dispose();
      openings.dispose();
      gates.dispose();
      disposeModel(model);
      disposeModel(floors);
      disposeModel(roof);
      disposeModel(stairs);
      siteGrid.dispose();sky.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, [variant]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    disposeModel(r.model);
    buildModel(project, r.model);
    disposeModel(r.stairs);
    const treads = entryTreads(project);
    if (treads.length) {
      const concrete = new THREE.MeshStandardMaterial({color:0xa8a8a3,roughness:.94});
      for (const tread of treads) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(tread.width,tread.height,tread.depth),concrete);
        mesh.position.set(tread.center.x,tread.height/2,tread.center.y);
        mesh.rotation.y = -Math.atan2(tread.axis.y,tread.axis.x);
        mesh.castShadow = mesh.receiveShadow = true;
        r.stairs.add(mesh);
      }
    }
    r.renderer.domElement.dataset.entryTreads = JSON.stringify(treads);
    r.renderer.domElement.dataset.floorLevel = String(houseFloorLevel(project));
    r.renderer.domElement.dataset.walls = String(project.walls.length);
    r.renderer.domElement.dataset.openings = String(project.openings.length);
    r.renderer.domElement.dataset.facade=JSON.stringify(facadeSettings(project));r.renderer.domElement.dataset.facadeTriangles=String(r.model.userData.facadeTriangles);r.renderer.domElement.dataset.interiorTriangles=String(r.model.userData.interiorTriangles);
    Object.assign(r.renderer.domElement.dataset,{interior:JSON.stringify(interiorSettings(project)),plinth:JSON.stringify(plinthSettings(project)),plinthTriangles:String(r.model.userData.plinthTriangles),doorFinish:project.doorFinish??"wood"});
  }, [project.walls, project.openings,project.facade,project.interior,project.plinth,project.doorFinish]);
  useEffect(()=>{
    const r=runtime.current;
    if (!r) return;
    disposeModel(r.floors);
    r.floors.position.y=houseFloorLevel(project)+.001;
    const palette=[0xd8c8af,0xddd5c5,0xc4d0df,0xcfc4b1];
    const overrides=new Map(project.roomFloors?.map(entry=>[entry.roomId,entry.finish]));
    const materials=new Map<string,THREE.MeshStandardMaterial>();
    const finishes=findRooms(project.walls).map((room,index)=>{
      const finish=overrides.get(room.id) ?? project.floor;
      let material: number | THREE.MeshStandardMaterial=palette[index%palette.length];
      if (finish) {
        const key=[finish.kind,finish.texture,finish.color].join(":");
        let cached=materials.get(key);
        if (!cached) {
          cached=floorMaterial(finish);
          materials.set(key,cached);
        }
        material=cached;
      }
      const floor=createRoomFloor(room.points,material);
      if (finish) applyFloorUV(floor.geometry,finish);
      r.floors.add(floor);
      return {roomId:room.id,finish};
    });
    r.renderer.domElement.dataset.floorFinishes=JSON.stringify(finishes);
  },[project.walls,project.plinth,project.floor,project.roomFloors]);
  useEffect(()=>{
    const r=runtime.current;if(!r)return;disposeModel(r.roof);const data=buildRoof(project,r.roof);
    r.roof.position.y=houseFloorLevel(project);
    Object.assign(r.renderer.domElement.dataset,{roofType:project.roof?.type??"none",roofColor:roofColor(project.roof),roofSurface:roofSurface(project.roof),roofParts:String(data.parts.length),roofHeight:String(data.maxHeight),roofTriangles:String(data.triangleCount),roofArea:String(data.area)});
    const details=r.roof.userData.roofDetails;Object.assign(r.renderer.domElement.dataset,{gutterRuns:String(details.gutters??0),downspouts:String(details.downspouts??0),snowGuardRuns:String(details.snowGuards??0),downspoutPositions:JSON.stringify(details.pipePositions??[])});
    r.syncDisplay();
  },[project.walls,project.openings,project.roof,project.facade,project.plinth]);
  useEffect(()=>{runtime.current?.syncDisplay();},[project.display,gridVisible]);
  useEffect(()=>{
    const r=runtime.current;if(!r)return;r.siteGrid.setProject(project);
    r.renderer.domElement.dataset.siteGridSize=String(lawnGridSize(project));r.renderer.domElement.dataset.siteGridOrigin="0,0";
  },[project.walls,project.lawn,project.siteGrid]);
  useEffect(() => {
    runtime.current?.landscape.setProject(project);
    runtime.current?.openings.bind(project);
    runtime.current?.walker?.setProject(project);
  }, [project]);
  useEffect(() => {
    runtime.current?.fit();
  }, [resetKey]);
  useEffect(()=>{if(siteViewKey>0)runtime.current?.viewSite();},[siteViewKey]);
  useEffect(() => {
    runtime.current?.walker?.setSuspended(paused);
  }, [paused]);
  useEffect(() => {
    runtime.current?.landscape.setOptions();
  }, [landscaping?.kind, landscaping?.variant, landscaping?.height, landscaping?.selectedId,
    landscaping?.lawn?.active, landscaping?.lawn?.copied, landscaping?.lawn?.size, landscaping?.lawn?.depth, landscaping?.lawn?.selectedId,
    landscaping?.fence?.active, landscaping?.fence?.selectedId,
    landscaping?.gate?.active?.kind,landscaping?.gate?.active?.width,landscaping?.gate?.selectedId]);
  useEffect(() => {
    if (variant !== "walk") return;
    const updateFullscreen = () => setBrowserFullscreen(document.fullscreenElement === host.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, [variant]);
  const toggleFullscreen = async () => {
    const view = host.current;
    if (!view) return;
    const bridge = window.webkit?.messageHandlers?.domplan;
    if (bridge) {
      bridge.postMessage({type:"walkFullscreen",enabled:!nativeFullscreen});
      return;
    }
    try {
      if (document.fullscreenElement === view) await document.exitFullscreen();
      else await view.requestFullscreen();
    } catch {
      notify("Не удалось переключить полноэкранный режим прогулки.");
    }
  };
  const fullscreenLabel = fullscreen ? "Выйти из полноэкранного режима" : "Прогулка на весь экран";
  return (
    <div
      ref={host}
      className={`three-view ${variant === "walk" ? "walk-view" : ""}`}
      data-testid={variant === "walk" ? "walk-view" : "three-view"}
    >
      {plantStatus !== "ready" && !!project.plants?.length && <div className="plant-loading-notice" role="status">
        {plantStatus === "loading" ? "Загрузка моделей растений…" : "Не удалось загрузить растения. Перезапустите приложение."}
      </div>}
      {lawnStatus !== "ready" && project.lawn?.some(tile => !tile.material || tile.material === "lawn") && <div className="plant-loading-notice" role="status">
        {lawnStatus === "loading" ? "Загрузка газона…" : "Не удалось загрузить газон. Перезапустите приложение."}
      </div>}
      {variant === "walk" && !error && (
        <>
          <WalkHUD
            project={project}
            state={walkState}
            onStart={(capture) => runtime.current?.walker?.start(capture)}
            onReset={() => runtime.current?.walker?.reset()}
          />
          <button type="button" className="walk-fullscreen" data-testid="walk-fullscreen"
            title={fullscreenLabel} aria-label={fullscreenLabel} aria-pressed={fullscreen} onClick={toggleFullscreen}>
            <Icon name={fullscreen ? "fullscreen-exit" : "fit"} size={17} />
          </button>
        </>
      )}
      {error && (
        <div className="render-error">
          <strong>Не удалось запустить 3D</strong>
          <p>
            Перезапустите приложение или откройте проект в браузере с поддержкой
            WebGL 2.
          </p>
        </div>
      )}
    </div>
  );
}
