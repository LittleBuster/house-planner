import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "./icons";
import { PlanView, type Selection, type Tool } from "./PlanView";
import { ThreeView } from "./ThreeView";
import { LandscapePanel } from "./LandscapePanel";
import { PLANT_CATALOGUE, PLANT_VARIANTS, plantingError } from "./landscape";
import { isHerb, plantHeightLimits } from "./plantSettings";
import { PlantVariants } from "./PlantVariants";
import { lawnArea, lawnError } from "./lawn";
import { coverDepth, groundCover, groundCoverName, COVER_MIN_SIZE, COVER_MAX_SIZE, type GroundCover } from "./groundSettings";
import { lawnFootprint } from "./lawnFootprint";
import { entryExteriorSide } from "./entrySteps";
import { WindowSectionPicker } from "./WindowSectionPicker";
import { WINDOW_FRAME_FINISHES, windowFrameFinish } from "./windowFinishes";
import { windowSectionWidths, setWindowSectionCount, setWindowVent, mirrorWindowVent, resizeWindow, resizeWindowSection, MIN_WINDOW_SECTION } from "./windowSections";
import { fitsOpeningSlot } from "./openingDrag";
import {wallBody} from "./wallBodies";
import {sceneDisplay,type SceneDisplay} from "./sceneDisplay";
import {DEFAULT_ROOF,roofColor,roofSurface,type RoofSettings} from "./roofSettings";
import {roofData} from "./roofModel";
import {RoofPicker,RoofColorPicker,RoofSurfacePicker} from "./RoofPicker";
import {SceneLayers} from "./SceneLayers";
import {lawnGridSize} from "./siteGrid";
import {facadeSettings,type FacadeSettings} from "./facadeSettings";
import {FacadePicker} from "./FacadePicker";
import {InteriorPicker,PlinthPicker,DoorFinishPicker,FinishColors} from "./HouseFinishPicker";
import { FENCE_COLORS, FENCE_HEIGHT, FENCE_LENGTH, FENCE_TYPES, fenceLength, type Fence, type FenceColor, type FenceKind, type FenceSpan } from "./fenceSettings";
import { inwardFenceFlip, joinFence } from "./fencePlacement";
import { gatePlacementError, gateUsesFence, positionGate } from "./gatePlacement";
import { GATE_DEFAULT_WIDTH, GATE_MAX_WIDTH, GATE_MIN_WIDTH, WICKET_DEFAULT_WIDTH, WICKET_MIN_WIDTH, WICKET_MAX_WIDTH,
  gateWidth, type Gate, type GateSwing, type GateToolKind } from "./gateSettings";
import {FloorPicker} from "./FloorPicker";
import type { FloorFinish } from "./floorSettings";
import {interiorSettings,plinthSettings,doorFinish,doorOpen,type InteriorSettings,type PlinthSettings,type DoorFinish} from "./houseFinishes";
import {doorSwingDirection} from "./doorPhysics";
import {
  canPlaceOpening,
  demoProject,
  findRooms,
  format,
  parseProject,
  resizeWall,
  resizeWallToMeasuredLength,
  wallMeasuredLength,
  uid,
  type Plant,
  type PlantKind,
  type LawnTile,
  type Opening,
  type Project,
  type Wall,
} from "./model";
import "./style.css";

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: { domplan?: { postMessage: (body: unknown) => void } };
    };
    domplanNativeProject?: string;
    domplanOpen?: (text: string) => void;
    domplanNativeAction?: (action: string) => void;
    domplanNotice?: (text: string) => void;
    domplanWalkFullscreen?: (enabled: boolean) => void;
  }
}
const STORAGE = "domplan-project-v1";
function loadInitial() {
  try {
    const raw = window.domplanNativeProject || localStorage.getItem(STORAGE);
    if (raw) return parseProject(raw);
  } catch {}
  return demoProject();
}
function native(body: unknown) {
  const bridge = window.webkit?.messageHandlers?.domplan;
  if (!bridge) return false;
  bridge.postMessage(body);
  return true;
}
const fieldText=(value:number)=>String(Math.round(value*1000)/1000).replace(".",",");
function Field({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = "м",
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(fieldText(value));
  const cancelBlur = useRef(false);
  useLayoutEffect(
    () => setText(fieldText(value)),
    [value, label],
  );
  const commit = () => {
    if (cancelBlur.current) { cancelBlur.current = false; return; }
    const n = Number(text.trim().replace(",", "."));
    if (text.trim() && Number.isFinite(n) && n >= min && n <= max) {
      onCommit(Math.round(n * 1000) / 1000);
      setText(fieldText(value));
    } else setText(fieldText(value));
  };
  return (
    <label className="field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelBlur.current = true;
              setText(fieldText(value));
              e.currentTarget.blur();
            }
          }}
        />
        <span>{unit}</span>
      </div>
      <small>
        {min}–{max} {unit}
      </small>
    </label>
  );
}
function Toggle({
  label,
  detail,
  value,
  onChange,
  icon,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: () => void;
  icon?: string;
}) {
  return (
    <button
      className="toggle-row"
      role="switch"
      aria-checked={value}
      onClick={onChange}
    >
      {icon && <Icon name={icon} size={17} />}
      <span>
        {label}
        {detail && <small>{detail}</small>}
      </span>
      <i className={value ? "on" : ""}>
        <b />
      </i>
    </button>
  );
}
function App() {
  const [history, setHistory] = useState<{ items: Project[]; index: number }>(
    () => ({ items: [loadInitial()], index: 0 }),
  );
  const project = history.items[history.index];
  const projectRef = useRef(project);
  projectRef.current = project;
  const [mode, setMode] = useState<"2d" | "3d" | "walk">("2d"),
    [tool, setTool] = useState<Tool>("select"),
    [selection, setSelection] = useState<Selection>(null);
  const [walkFullscreen, setWalkFullscreen] = useState(false);
  useEffect(() => {
    window.domplanWalkFullscreen = setWalkFullscreen;
    return () => { delete window.domplanWalkFullscreen; };
  }, []);
  useEffect(() => {
    if (walkFullscreen && mode !== "walk") native({type:"walkFullscreen",enabled:false});
  }, [walkFullscreen, mode]);
  const [plantKind, setPlantKind] = useState<PlantKind | null>(null),
    [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [plantHeights, setPlantHeights] = useState<Record<PlantKind, number>>({
    birch: 7.5,
    pine: 8,
    fir: 7,
    maple: 7.5,
    groundcover: 0.35,
    grass: 0.45,
  });
  const [plantVariants, setPlantVariants] = useState<Record<PlantKind, string>>({
    birch: PLANT_VARIANTS.birch[0].id,
    pine: PLANT_VARIANTS.pine[0].id,
    fir: PLANT_VARIANTS.fir[0].id,
    maple: PLANT_VARIANTS.maple[0].id,
    groundcover: PLANT_VARIANTS.groundcover[0].id,
    grass: PLANT_VARIANTS.grass[0].id,
  });
  const plantHeight = plantKind ? plantHeights[plantKind] : 7.5;
  const selectedPlant = project.plants?.find((p) => p.id === selectedPlantId);
  const editingPlantKind=selectedPlant?.kind??plantKind??"birch";
  const editingHerb=isHerb(editingPlantKind),heightLimits=plantHeightLimits(editingPlantKind);
  const [coverTool, setCoverTool] = useState<{ material: GroundCover; copied: boolean } | null>(null),
    [selectedLawnId, setSelectedLawnId] = useState<string | null>(null);
  const [coverSize, setCoverSize] = useState({size:2,depth:2});
  const [placingSteps, setPlacingSteps] = useState(false);
  const [fenceKind,setFenceKind] = useState<FenceKind|null>(null);
  const [fenceColor,setFenceColor] = useState<FenceColor>("green");
  const [selectedFenceId,setSelectedFenceId] = useState<string|null>(null);
  const [gateKind,setGateKind]=useState<GateToolKind|null>(null);
  const [gateDraftWidth,setGateDraftWidth]=useState(GATE_DEFAULT_WIDTH);
  const [wicketDraftWidth,setWicketDraftWidth]=useState(WICKET_DEFAULT_WIDTH);
  const [selectedGateId,setSelectedGateId]=useState<string|null>(null);
  const selectedGate=project.gates?.find(gate=>gate.id===selectedGateId);
  const editingWicket=!!selectedGate?.wicket || gateKind==="wicket";
  const activeGateWidth=editingWicket?wicketDraftWidth:gateDraftWidth;
  const gateName=editingWicket?"калитку":"ворота";
  const selectedFence=project.fences?.find(fence=>fence.id===selectedFenceId);
  const fenceHasGate=!!selectedFence && gateUsesFence(project,selectedFence);
  const fenceFacesInward=selectedFence ? !!selectedFence.flipped===inwardFenceFlip(project,selectedFence) : false;
  const fenceStyle=useMemo(()=>fenceKind ? {kind:fenceKind,color:fenceColor} : null,[fenceKind,fenceColor]);
  const copiedCover = useRef<(typeof coverSize & { material: GroundCover }) | null>(null);
  const lawnTool = coverTool?.material ?? null;
  const gridStep = lawnGridSize(project);
  const lawnActive = lawnTool !== null;
  const selectedLawn = project.lawn?.find(tile => tile.id === selectedLawnId);
  const activeCover = selectedLawn ? groundCover(selectedLawn) : lawnTool ?? "lawn";
  const coverWidth = selectedLawn?.size ?? coverSize.size;
  const coverLength = coverDepth(selectedLawn ?? coverSize);
  const selectedFootprint = selectedLawn ? lawnFootprint(project, selectedLawn) : null;
  const coverArea = useMemo(() => lawnArea(project), [project.walls, project.plinth, project.lawn]);
  useEffect(() => {
    if (mode !== "3d") {
      setPlantKind(null);
      setSelectedPlantId(null);
      setCoverTool(null);
      setSelectedLawnId(null);
      setPlacingSteps(false);
      setFenceKind(null);
      setSelectedFenceId(null);
      setGateKind(null);
      setSelectedGateId(null);
    }
  }, [mode]);
  const [grid, setGrid] = useState(true),
    [snap, setSnap] = useState(true),
    [dimensions, setDimensions] = useState(true),
    [outsideDimensions, setOutsideDimensions] = useState(true);
  const [height, setHeight] = useState(2.8),
    [thickness, setThickness] = useState(0.22),
    [fitKey, setFitKey] = useState(0),
    [reset3d, setReset3d] = useState(0);
  const [siteViewKey,setSiteViewKey]=useState(0);
  const [toast, setToast] = useState(""),
    [saved, setSaved] = useState(true),
    [help, setHelp] = useState(false),
    [newDialog, setNewDialog] = useState(false),
    [newName, setNewName] = useState("Мой дом");
  const fileInput = useRef<HTMLInputElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const change = useCallback((p: Project) => {
    setHistory((h) => ({
      items: [...h.items.slice(Math.max(0, h.index - 79), h.index + 1), p],
      index: Math.min(h.index + 1, 80),
    }));
  }, []);
  const display=sceneDisplay(project);
  const setGridStep=(size:number)=>{
    if(size!==gridStep)change({...project,siteGrid:{lawnSize:size}});
  };
  const clearLandscapeTools=()=>{
    setPlantKind(null);setSelectedPlantId(null);setCoverTool(null);setSelectedLawnId(null);setPlacingSteps(false);
    setFenceKind(null);setSelectedFenceId(null);
    setGateKind(null);setSelectedGateId(null);
  };
  const setLayer=(layer:keyof SceneDisplay,visible:boolean)=>{
    setSelection(null);
    if(layer==="landscape"&&!visible)clearLandscapeTools();
    if(layer==="house"&&!visible)setPlacingSteps(false);
    const install=layer==="roof"&&visible&&!project.roof;
    change({...project,...(install?{roof:{...DEFAULT_ROOF}}:{}),display:{...display,[layer]:visible}});
    if(install&&mode==="3d")setReset3d(k=>k+1);
  };
  const editRoof=(updates:Partial<RoofSettings>)=>{
    const nextRoof={...(project.roof??DEFAULT_ROOF),...updates};
    if(project.roof&&JSON.stringify(nextRoof)===JSON.stringify(project.roof)&&display.roof)return;
    setSelection(null);clearLandscapeTools();
    const install=!project.roof;change({...project,roof:nextRoof,display:{...display,roof:true}});
    if(install&&mode==="3d")setReset3d(k=>k+1);
  };
  const editFacade=(facade:FacadeSettings)=>{
    const current=facadeSettings(project);if(current.kind===facade.kind&&current.color===facade.color)return;
    setSelection(null);clearLandscapeTools();change({...project,facade});
  };
  const editInterior=(interior:InteriorSettings)=>{setSelection(null);clearLandscapeTools();change({...project,interior});};
  const editPlinth=(plinth:PlinthSettings)=>{setSelection(null);clearLandscapeTools();change({...project,plinth});};
  const editDoorFinish=(finish:DoorFinish)=>{
    setSelection(null);clearLandscapeTools();change({...project,doorFinish:finish,openings:project.openings.map(o=>{
      if(o.kind!=="door"||o.doorFinish===undefined)return o;const {doorFinish:removed,...rest}=o;return rest;
    })});
  };
  const toggleOpening=(id:string,section?:number)=>{
    const p=projectRef.current,opening=p.openings.find(o=>o.id===id);
    if(!opening)return;
    const vent=section===undefined?null:opening.ventSections?.[section];
    const next=opening.kind==="door"&&section===undefined ? {...opening,open:!doorOpen(opening)}
      : section!==undefined&&vent ? setWindowVent(opening,section,vent==="open"?"closed":"open") : opening;
    if(next!==opening)change({...p,openings:p.openings.map(o=>o.id===id?next:o)});
  };
  const undo = useCallback(() => {
    setHistory((h) => ({ ...h, index: Math.max(0, h.index - 1) }));
    setSelection(null);
  }, []);
  const redo = useCallback(() => {
    setHistory((h) => ({
      ...h,
      index: Math.min(h.items.length - 1, h.index + 1),
    }));
    setSelection(null);
  }, []);
  const rooms = useMemo(() => findRooms(project.walls), [project.walls]);
  const selectedRoom = selection?.kind === "room" ? rooms.find(room=>room.id===selection.id) : undefined;
  const roomFinish = selectedRoom && project.roomFloors?.find(entry=>entry.roomId===selectedRoom.id)?.finish;
  const editFloor = (finish?: FloorFinish) => {
    const current = selectedRoom ? roomFinish : project.floor;
    if (current?.kind===finish?.kind && current?.texture===finish?.texture &&
        current?.color===finish?.color && current?.angle===finish?.angle) return;
    if (!selectedRoom) {
      change({...project,floor:finish});
      return;
    }
    const roomFloors = (project.roomFloors ?? []).filter(entry=>entry.roomId!==selectedRoom.id);
    if (finish) roomFloors.push({roomId:selectedRoom.id,finish});
    change({...project,roomFloors:roomFloors.length ? roomFloors : undefined});
  };
  const floorPicker = <FloorPicker rooms={rooms} roomId={selectedRoom?.id ?? ""}
    finish={roomFinish ?? project.floor} canReset={!!(selectedRoom ? roomFinish : project.floor)}
    onRoomChange={mode==="3d" ? id=>setSelection(id ? {kind:"room",id} : null) : undefined}
    onChange={editFloor} onReset={()=>editFloor()} />;
  const area = rooms.reduce((sum, r) => sum + r.area, 0);
  const selectedWall =
    selection?.kind === "wall"
      ? project.walls.find((w) => w.id === selection.id)
      : undefined;
  const selectedOpening =
    selection?.kind === "opening"
      ? project.openings.find((o) => o.id === selection.id)
      : undefined;
  const openingWall=selectedOpening?project.walls.find(w=>w.id===selectedOpening.wallId):undefined;
  const openingStart=openingWall?wallBody(openingWall,project.walls).start:0;
  const deleteSelected = useCallback(() => {
    if (mode==="3d" && selectedGateId) {
      const p=projectRef.current;
      if (p.gates?.some(gate=>gate.id===selectedGateId))
        change({...p,gates:p.gates.filter(gate=>gate.id!==selectedGateId)});
      setSelectedGateId(null);
      return;
    }
    if (mode==="3d" && selectedFenceId) {
      const p=projectRef.current;
      const fence=p.fences?.find(item=>item.id===selectedFenceId);
      if (fence && gateUsesFence(p,fence)) {
        notify("Сначала уберите встроенный проём из этой секции.");
        return;
      }
      change({...p,fences:p.fences?.filter(fence=>fence.id!==selectedFenceId)});
      setSelectedFenceId(null);
      return;
    }
    if (mode === "3d" && selectedLawnId) {
      const p = projectRef.current;
      change({ ...p, lawn: (p.lawn ?? []).filter(tile => tile.id !== selectedLawnId) });
      setSelectedLawnId(null);
      return;
    }
    if (mode === "3d" && selectedPlantId) {
      const p = projectRef.current;
      change({
        ...p,
        plants: (p.plants ?? []).filter(
          (plant) => plant.id !== selectedPlantId,
        ),
      });
      setSelectedPlantId(null);
      return;
    }
    if (mode !== "2d") return;
    if (!selection || selection.kind === "room") return;
    const p = projectRef.current;
    change(
      selection.kind === "wall"
        ? {
            ...p,
            walls: p.walls.filter((w) => w.id !== selection.id),
            openings: p.openings.filter((o) => o.wallId !== selection.id),
          }
        : { ...p, openings: p.openings.filter((o) => o.id !== selection.id) },
    );
    setSelection(null);
  }, [selection, change, mode, selectedPlantId, selectedLawnId, selectedFenceId, selectedGateId, notify]);
  const choosePlant = (kind: PlantKind) => {
    if(!display.landscape)change({...project,display:{...display,landscape:true}});
    setCoverTool(null);
    setSelectedLawnId(null);
    setPlacingSteps(false);
    setFenceKind(null);
    setSelectedFenceId(null);
    setGateKind(null);
    setSelectedGateId(null);
    setPlantKind(kind);
    setSelectedPlantId(null);
    setSelection(null);
  };
  const placePlant = (
    kind: PlantKind,
    position: { x: number; y: number },
    keep: boolean,
  ) => {
    const p = projectRef.current;
    const plant: Plant = {
      id: uid(),
      kind,
      position,
      height: plantHeights[kind],
      variant: plantVariants[kind],
      rotation: Math.floor(Math.random() * 360),
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
    };
    const error = plantingError(p, plant);
    if (error) {
      notify(error);
      return;
    }
    change({ ...p, plants: [...(p.plants ?? []), plant] });
    setSelection(null);
    setSelectedPlantId(keep ? null : plant.id);
    if (!keep) setPlantKind(null);
  };
  const editPlant = (updates: Partial<Plant>, id = selectedPlantId) => {
    const p = projectRef.current,
      plant = p.plants?.find((plant) => plant.id === id);
    if (!plant) return;
    const next = { ...plant, ...updates },
      error = plantingError(p, next, plant.id);
    if (error) {
      notify(error);
      return;
    }
    change({
      ...p,
      plants: p.plants!.map((item) => (item.id === id ? next : item)),
    });
  };
  const chooseLawn = useCallback((material: GroundCover, copiedSize?: typeof coverSize) => {
    const p = projectRef.current, display = sceneDisplay(p);
    if (!display.landscape) change({...p,display:{...display,landscape:true}});
    setPlantKind(null); setSelectedPlantId(null); setSelection(null);
    setSelectedLawnId(null);
    setPlacingSteps(false);
    setFenceKind(null);
    setSelectedFenceId(null);
    setGateKind(null);
    setSelectedGateId(null);
    if (copiedSize) setCoverSize({size:copiedSize.size,depth:copiedSize.depth});
    setCoverTool({material,copied:!!copiedSize});
  }, [change]);
  const chooseFence = (kind: FenceKind) => {
    clearLandscapeTools();
    setSelection(null);
    if (!display.landscape) change({...project,display:{...display,landscape:true}});
    setFenceKind(kind);
  };
  const chooseGate = (kind:GateToolKind) => {
    clearLandscapeTools();
    setSelection(null);
    if (!display.landscape) change({...project,display:{...display,landscape:true}});
    setGateKind(kind);
  };
  const selectGate = (id:string) => {
    clearLandscapeTools();
    setSelection(null);
    setSelectedGateId(id);
  };
  const placeGate = (draft:Gate) => {
    const p=projectRef.current, gate={...draft,id:uid()};
    const error=gatePlacementError(p,gate);
    if (error) {notify(error);return;}
    change({...p,gates:[...(p.gates ?? []),gate]});
    selectGate(gate.id);
  };
  const moveSelectedGate = (next:Gate) => {
    const p=projectRef.current;
    if (!p.gates?.some(gate=>gate.id===next.id)) return;
    const error=gatePlacementError(p,next);
    if (error) {notify(error);return;}
    change({...p,gates:p.gates.map(gate=>gate.id===next.id ? next : gate)});
  };
  const resizeSelectedGate = (width:number) => {
    if (!selectedGate) {
      if (editingWicket) setWicketDraftWidth(width);
      else setGateDraftWidth(width);
      return;
    }
    if (Math.abs(gateWidth(selectedGate)-width)<1e-6) return;
    const p=projectRef.current, {a,b,...style}=selectedGate;
    const {gate:next,error}=positionGate(p,selectedGate,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},width,style);
    if (!next) {notify(error);return;}
    moveSelectedGate(next);
  };
  const toggleGate = (id:string) => {
    const p=projectRef.current;
    if (p.gates?.some(gate=>gate.id===id))
      change({...p,gates:p.gates.map(gate=>gate.id===id ? {...gate,open:!gate.open} : gate)});
  };
  const setGateSwing = (swing:GateSwing) => {
    if (!selectedGate || selectedGate.swing===swing) return;
    change({...project,gates:project.gates?.map(gate=>gate.id===selectedGate.id ? {...gate,swing} : gate)});
  };
  const placeFence = (span: FenceSpan) => {
    if (!fenceStyle) return null;
    const p=projectRef.current;
    const fence={...span,...fenceStyle,id:uid()};
    const edit=joinFence(p,fence,uid);
    if ("error" in edit) {notify(edit.error);return null;}
    change({...p,fences:edit.fences});
    return edit.end;
  };
  const moveSelectedFence = (fence: Fence) => {
    const p=projectRef.current;
    if (!p.fences?.some(item=>item.id===fence.id)) return;
    const edit=joinFence(p,fence,uid);
    if ("error" in edit) {notify(edit.error);return;}
    change({...p,fences:edit.fences});
  };
  const editFenceColor = (color: FenceColor) => {
    if (!selectedFence) {setFenceColor(color);return;}
    if (selectedFence.color===color) return;
    change({...project,fences:project.fences?.map(fence=>fence.id===selectedFence.id ? {...fence,color} : fence)});
  };
  const setFenceSide = (inward: boolean) => {
    if (!selectedFence || inward===fenceFacesInward) return;
    const flipped=!selectedFence.flipped;
    change({...project,fences:project.fences?.map(fence=>fence.id===selectedFence.id ? {...fence,flipped} : fence)});
  };
  const chooseEntrySteps = () => {
    clearLandscapeTools();
    setSelection(null);
    if (!display.house || !display.landscape)
      change({...project,display:{...display,house:true,landscape:true}});
    setPlacingSteps(true);
  };
  const toggleEntrySteps = (id: string) => {
    const p = projectRef.current;
    const opening = p.openings.find(item => item.id === id);
    const wall = opening && p.walls.find(item => item.id === opening.wallId);
    if (!opening || !wall || !entryExteriorSide(p,opening,wall)) return;
    change({...p,openings:p.openings.map(item => item.id === id ? {...item,entrySteps:!item.entrySteps || undefined} : item)});
  };
  const placeLawn = (position: { x: number; y: number }) => {
    const p = projectRef.current;
    if (!lawnTool) return;
    const tile: LawnTile = { id: uid(), position, ...coverSize, ...(lawnTool === "lawn" ? {} : {material:lawnTool}) };
    const error = lawnError(p, tile);
    if (error) { notify(error); return; }
    change({ ...p, lawn: [...(p.lawn ?? []), tile] });
  };
  const editLawn = (updates: Partial<LawnTile>, id = selectedLawnId) => {
    const p = projectRef.current, tile = p.lawn?.find(tile => tile.id === id);
    if (!tile) return;
    const next = { ...tile, depth:coverDepth(tile), ...updates };
    if (tile.size === next.size && coverDepth(tile) === coverDepth(next) && tile.position.x === next.position.x && tile.position.y === next.position.y) return;
    const error = lawnError(p, next, tile.id);
    if (error) { notify(error); return; }
    change({ ...p, lawn: p.lawn!.map(tile => tile.id === id ? next : tile) });
  };
  const save = useCallback(() => {
    const p = projectRef.current,
      text = JSON.stringify(p, null, 2),
      filename =
        (p.name.replace(/[\\/:*?"<>|]/g, "_") || "Мой дом") + ".domplan.json";
    if (native({ type: "save", text, filename })) return;
    const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify("Проект сохранён в файл");
  }, [notify]);
  const open = useCallback(() => {
    if (!native({ type: "open" })) fileInput.current?.click();
  }, []);
  const importProject = useCallback(
    (text: string) => {
      try {
        const p = parseProject(text);
        change(p);
        setSelection(null);
        setMode("2d");
        setTool("select");
        setFitKey((k) => k + 1);
        notify("Проект открыт");
      } catch (e) {
        notify((e as Error).message);
      }
    },
    [change, notify],
  );
  useEffect(() => {
    window.domplanOpen = importProject;
    window.domplanNotice = notify;
    window.domplanNativeAction = (action) => {
      if (action === "save") save();
      if (action === "open") open();
      if (action === "new") {
        if (walkFullscreen) native({type:"walkFullscreen",enabled:false});
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        setNewDialog(true);
      }
      if (action === "undo") undo();
      if (action === "redo") redo();
    };
    return () => {
      delete window.domplanOpen;
      delete window.domplanNotice;
      delete window.domplanNativeAction;
    };
  }, [importProject, save, open, notify, undo, redo, walkFullscreen]);
  useEffect(() => {
    setSaved(false);
    clearTimeout(savedTimer.current);
    native({ type: "autosave", text: JSON.stringify(project) });
    savedTimer.current = setTimeout(() => {
      const text = JSON.stringify(project);
      try {
        localStorage.setItem(STORAGE, text);
        if (native({ type: "autosave", text })) {
        }
        setSaved(true);
      } catch {
        if (native({ type: "autosave", text })) setSaved(true);
        else notify("Автосохранение недоступно. Сохраните проект в файл.");
      }
    }, 450);
    const flush = () => {
      const text = JSON.stringify(projectRef.current);
      try {
        localStorage.setItem(STORAGE, text);
      } catch {}
      native({ type: "autosave", text });
    };
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(savedTimer.current);
      window.removeEventListener("pagehide", flush);
    };
  }, [project, notify]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.matches?.("input,textarea,select,[contenteditable]")
      )
        return;
      if (e.metaKey || e.ctrlKey) {
        if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && mode === "3d" && !help && !newDialog) {
          if (e.code === "KeyC" && selectedLawn) {
            e.preventDefault();
            if (!e.repeat) {
              copiedCover.current = {material:groundCover(selectedLawn),size:selectedLawn.size,depth:coverDepth(selectedLawn)};
              notify("Покрытие скопировано. Ctrl+V — разместить копию.");
            }
            return;
          }
          if (e.code === "KeyV" && copiedCover.current) {
            e.preventDefault();
            if (!e.repeat) chooseLawn(copiedCover.current.material,copiedCover.current);
            return;
          }
        }
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          save();
        }
        if (e.key.toLowerCase() === "o") {
          e.preventDefault();
          open();
        }
        return;
      }
      if (e.key === "Escape") {
        if (walkFullscreen && !e.defaultPrevented) native({type:"walkFullscreen",enabled:false});
        setHelp(false);
        setNewDialog(false);
        setSelection(null);
        setPlantKind(null);
        setSelectedPlantId(null);
        setCoverTool(null);
        setSelectedLawnId(null);
        setPlacingSteps(false);
        setFenceKind(null);
        setSelectedFenceId(null);
        setGateKind(null);
        setSelectedGateId(null);
        return;
      }
      if (help || newDialog) return;
      if (e.key === "Tab") {
        e.preventDefault();
        setMode((m) => (m === "2d" ? "3d" : m === "3d" ? "walk" : "2d"));
        return;
      }
      if (mode === "walk") {
        if (e.code === "KeyF") setReset3d((k) => k + 1);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
      const tools: Record<string, Tool> = {
        KeyV: "select",
        KeyW: "wall",
        KeyD: "door",
        KeyO: "window",
        KeyH: "hand",
      };
      if (tools[e.code]) {
        setTool(tools[e.code]);
        setMode("2d");
      }
      if (e.key.toLowerCase() === "f") {
        setFitKey((k) => k + 1);
        setReset3d((k) => k + 1);
      }
      if (e.key === "?") setHelp(true);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [undo, redo, save, open, deleteSelected, help, newDialog, mode, selectedLawn, chooseLawn, notify, walkFullscreen]);
  const editWall = (updates: Partial<Wall>, length?:number, outside=false) => {
    if (!selectedWall) return;
    const next = length===undefined?resizeWall(project, selectedWall.id, updates):resizeWallToMeasuredLength(project,selectedWall.id,length,outside);
    if (next.openings.length < project.openings.length)
      notify("Проёмы, которые перестали помещаться в стенах, удалены");
    else {
      const actual=next.walls.find(w=>w.id===selectedWall.id)!;
      if(length!==undefined&&Math.abs(wallMeasuredLength(actual,next.walls,outside)-length)>.001 ||
        updates.a&&Math.hypot(updates.a.x-actual.a.x,updates.a.y-actual.a.y)>.001 ||
        updates.b&&Math.hypot(updates.b.x-actual.b.x,updates.b.y-actual.b.y)>.001)
        notify("Стена остановлена у примыкания или соседней стены");
    }
    if(JSON.stringify(next)!==JSON.stringify(project))change(next);
  };
  const editOpening = (updates: Partial<Opening>) => {
    if (!selectedOpening) return;
    const next = { ...selectedOpening, ...updates };
    const boundsChanged = Math.abs(next.width-selectedOpening.width)>1e-8 || Math.abs(next.offset-selectedOpening.offset)>1e-8;
    if (!canPlaceOpening(project, next, next.id) || boundsChanged && !fitsOpeningSlot(project, selectedOpening, next)) {
      notify("Проём не помещается в стене или пересекает стену, окно либо дверь");
      return;
    }
    change({
      ...project,
      openings: project.openings.map((o) => (o.id === next.id ? next : o)),
    });
  };
  const tools: { key: Tool; name: string; icon: string; shortcut: string }[] = [
    { key: "select", name: "Выбрать", icon: "cursor", shortcut: "V" },
    { key: "wall", name: "Стена", icon: "wall", shortcut: "W" },
    { key: "door", name: "Дверь", icon: "door", shortcut: "D" },
    { key: "window", name: "Окно", icon: "window", shortcut: "O" },
    { key: "hand", name: "Перемещение", icon: "hand", shortcut: "H" },
  ];
  const toolHint =
    tool === "wall"
      ? "Начало можно поставить внутри стены. Наведите курсор в нужную сторону или нажмите Enter для точной длины."
      : tool === "door" || tool === "window"
        ? "Нажмите на стену для нового проёма. Готовый проём можно двигать вдоль стены и растягивать за края."
        : tool === "hand"
          ? "Перетаскивайте план мышью. Масштаб — кнопками или жестом щипка."
          : selectedWall
            ? "Тяните стену за середину. У угла наружная грань выровняется по торцу соседней стены."
            : selectedOpening
              ? selectedOpening.kind === "window"
                ? "Тяните за стекло, чтобы двигать окно. Края меняют общую ширину, внутренние перемычки — секции."
                : "Перетаскивайте проём вдоль стены. Потяните за край, чтобы изменить ширину."
              : "Выберите стену, проём или комнату, чтобы открыть её свойства.";
  return (
    <div className="app" data-mode={mode} data-walk-fullscreen={mode === "walk" && walkFullscreen ? "true" : undefined}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="logo" size={25} />
          </span>
          <div>
            <strong>
              ДомПлан<span> / </span>
            </strong>
            <small>ОТ ЛИНИИ К ПРОСТРАНСТВУ</small>
          </div>
        </div>
        <div className="project-heading">
          <input
            aria-label="Название проекта"
            key={"name" + history.index}
            defaultValue={project.name}
            maxLength={80}
            onBlur={(e) => {
              const name = e.target.value.trim() || "Мой дом";
              if (name !== project.name) change({ ...project, name });
              else e.target.value = name;
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <span className="save-status">
            <i className={saved ? "saved" : ""} />
            {saved ? "Сохранено на Mac" : "Сохраняем…"}
          </span>
        </div>
        <div className="top-actions">
          <button className="text-button" onClick={open}>
            <Icon name="folder" size={17} />
            <span>Открыть</span>
          </button>
          <button className="button save-button" onClick={save}>
            <Icon name="save" size={17} />
            <span>Сохранить проект</span>
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="left-sidebar">
          {mode === "3d" ? (
            <LandscapePanel
              active={plantKind}
              onChoose={choosePlant}
              onCancel={() => setPlantKind(null)}
              count={project.plants?.length ?? 0}
              variants={plantVariants}
              selectedKind={selectedPlant?.kind ?? null}
              steps={{active:placingSteps,onChoose:chooseEntrySteps,onCancel:()=>setPlacingSteps(false)}}
              fence={{active:fenceKind,selected:!!selectedFence,count:project.fences?.length ?? 0,onChoose:chooseFence,
                onCancel:()=>{setFenceKind(null);setSelectedFenceId(null);setGateKind(null);setSelectedGateId(null);}}}
              gate={{active:gateKind,selected:!!selectedGate,onChoose:chooseGate}}
              lawn={{ active: lawnTool, selected: !!selectedLawn, ...coverSize, count: project.lawn?.length ?? 0, area: coverArea, onChoose: chooseLawn, onCancel: () => { setCoverTool(null); setSelectedLawnId(null); } }}
            />
          ) : (
            <>
              <div className="sidebar-title">ПРОЕКТИРОВАНИЕ</div>
              <nav className="tools" aria-label="Инструменты">
                {tools.map((t) => (
                  <button
                    key={t.key}
                    className={tool === t.key && mode === "2d" ? "active" : ""}
                    onClick={() => {
                      setTool(t.key);
                      setMode("2d");
                    }}
                    title={`${t.name} (${t.shortcut})`}
                  >
                    <Icon name={t.icon} />
                    <span>{t.name}</span>
                    <kbd>{t.shortcut}</kbd>
                  </button>
                ))}
              </nav>
              <div className="sidebar-rule" />
              <div className="sidebar-title">
                ЭТАЖИ <span>01</span>
              </div>
              <div className="floor-card">
                <span className="floor-icon">
                  <Icon name="layers" size={19} />
                </span>
                <div>
                  <strong>Первый этаж</strong>
                  <small>Отметка ±0,000</small>
                </div>
                <i />
              </div>
            </>
          )}
          <div className="sidebar-bottom">
            <div className="mini-house">
              <Icon name="logo" size={29} />
              <span>
                Ваш дом.
                <br />
                <strong>Ваши решения.</strong>
              </span>
            </div>
            <button className="new-project" onClick={() => setNewDialog(true)}>
              <Icon name="plus" size={17} />
              Новый проект
            </button>
            <button className="help-button" onClick={() => setHelp(true)}>
              <Icon name="info" size={16} />
              Как пользоваться<span>?</span>
            </button>
            <div className="version">
              ДОМПЛАН <span>БАЗОВАЯ ВЕРСИЯ · 0.43</span>
            </div>
          </div>
        </aside>
        <main className="main-workspace">
          <div className="workspace-toolbar">
            <div className="view-label">
              <Icon
                name={
                  mode === "2d" ? "plan" : mode === "walk" ? "walk" : "cube"
                }
                size={17}
              />
              {mode === "2d"
                ? "План этажа"
                : mode === "walk"
                  ? "На уровне глаз"
                  : "Объёмная модель"}
            </div>
            <div
              className="mode-switch"
              role="group"
              aria-label="Режим просмотра"
            >
              <button
                className={mode === "2d" ? "selected" : ""}
                onClick={() => setMode("2d")}
                data-testid="mode-2d"
              >
                <Icon name="plan" size={17} />
                2D-план
              </button>
              <button
                className={mode === "3d" ? "selected" : ""}
                onClick={() => setMode("3d")}
                data-testid="mode-3d"
              >
                <Icon name="cube" size={17} />
                3D-вид
              </button>
              <button
                className={mode === "walk" ? "selected" : ""}
                onClick={() => setMode("walk")}
                data-testid="mode-walk"
              >
                <Icon name="walk" size={17} />
                Прогулка
              </button>
            </div>
            <div className="history-buttons">
              <button
                aria-label="Отменить"
                title="Отменить (⌘Z)"
                disabled={history.index === 0}
                onClick={undo}
              >
                <Icon name="undo" size={18} />
              </button>
              <button
                aria-label="Повторить"
                title="Повторить (⇧⌘Z)"
                disabled={history.index === history.items.length - 1}
                onClick={redo}
              >
                <Icon name="redo" size={18} />
              </button>
            </div>
          </div>
          <div className="canvas-wrap">
            <div className="canvas-label">
              <span className="live-dot" />
              {mode === "2d"
                ? "ЧЕРТЁЖ"
                : mode === "walk"
                  ? "ПРОГУЛКА"
                  : "ПЕРСПЕКТИВА"}
              <i />
              ПЕРВЫЙ ЭТАЖ
            </div>
            <div className="north-mark" hidden={mode === "walk"}>
              <span>С</span>
              <svg width="23" height="32" viewBox="0 0 23 32">
                <path
                  d="m11.5 1 8 27-8-5-8 5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                />
                <path d="M11.5 1v22l8 5Z" fill="currentColor" />
              </svg>
            </div>
            {mode === "2d" ? (
              <PlanView
                project={project}
                tool={tool}
                selection={selection}
                onSelect={setSelection}
                onChange={change}
                grid={grid}
                snap={snap}
                dimensions={dimensions}
                outsideDimensions={outsideDimensions}
                thickness={thickness}
                height={height}
                fitKey={fitKey}
                notify={notify}
              />
            ) : (
              <ThreeView
                key={mode}
                project={project}
                resetKey={reset3d}
                gridVisible={grid}
                siteViewKey={siteViewKey}
                variant={mode === "walk" ? "walk" : "orbit"}
                nativeFullscreen={walkFullscreen}
                paused={help || newDialog}
                notify={notify}
                onOpeningToggle={toggleOpening}
                onGateToggle={toggleGate}
                onGateSelect={selectGate}
                onEntryStepsToggle={toggleEntrySteps}
                placingSteps={mode === "3d" && placingSteps}
                landscaping={{
                  placingSteps,
                  gate:{
                    active:gateKind ? {kind:gateKind,width:activeGateWidth} : null,
                    selectedId:selectedGateId,onPlace:placeGate,onMove:moveSelectedGate,onDeselect:()=>setSelectedGateId(null),
                  },
                  fence:{
                    active:fenceStyle,selectedId:selectedFenceId,onPlace:placeFence,onMove:moveSelectedFence,
                    onSelect:id=>{
                      if (id) {clearLandscapeTools();setSelection(null);}
                      setSelectedFenceId(id);
                    },
                  },
                  kind: plantKind,
                  height: plantHeight,
                  variant: plantKind ? plantVariants[plantKind] : undefined,
                  selectedId: selectedPlantId,
                  onSelect: (id) => {
                    setSelectedPlantId(id);
                    setPlantKind(null);
                    setSelection(null);
                    setSelectedLawnId(null);
                    setCoverTool(null);
                    setSelectedFenceId(null);
                    setSelectedGateId(null);
                  },
                  onPlace: placePlant,
                  onMove: (id, position) => editPlant({ position }, id),
                  notify,
                  lawn: {
                    active: lawnTool,
                    copied: coverTool?.copied ?? false,
                    ...coverSize,
                    selectedId: selectedLawnId,
                    onSelect: id => { setSelectedLawnId(id); setCoverTool(null); setPlantKind(null); setSelectedPlantId(null); setSelectedFenceId(null); setSelectedGateId(null); setSelection(null); },
                    onPlace: placeLawn,
                    onEdit: tile => editLawn(tile,tile.id),
                  },
                }}
              />
            )}
            {mode!=="2d"&&<SceneLayers display={display} hasRoof={!!project.roof} onChange={setLayer}/>}
            {mode === "3d" && (
              <>
                <div className="three-caption">
                  <Icon name={lawnActive ? "lawn" : plantKind ? "tree" : "sun"} size={16} />
                  {lawnActive ? `${groundCoverName(activeCover)} · ${format(coverSize.size)} × ${format(coverSize.depth)} м` : plantKind
                    ? `${PLANT_CATALOGUE[plantKind].name} · ${format(plantHeight)} м`
                    : "Дом и участок"}
                  <span>
                    {lawnActive ? (coverTool?.copied ? "Щелчок — поставить копию · Esc — закончить" : "Нажмите на землю · Esc — закончить укладку") : plantKind
                      ? "Нажмите на землю · Esc — закончить"
                      : "Выберите растение или покрытие слева"}
                  </span>
                </div>
                <div className="three-camera-tools"><button className="reset-camera" data-testid="site-view" onClick={()=>setSiteViewKey(k=>k+1)}><Icon name="sun" size={17}/>Вид с участка</button><button
                  className="reset-camera"
                  onClick={() => setReset3d((k) => k + 1)}
                >
                  <Icon name="fit" size={17} />
                  Сбросить ракурс
                </button></div>
              </>
            )}
          </div>
          <div className="workspace-footer">
            <div>
              <Icon
                name={
                  mode === "2d"
                    ? tools.find((t) => t.key === tool)!.icon
                    : mode === "walk"
                      ? "walk"
                      : "cube"
                }
                size={15}
              />
              <span>
                {mode === "2d"
                  ? toolHint
                  : mode === "walk"
                    ? "WASD — движение · Shift — бег · Пробел — прыжок · мышь — взгляд · Esc — пауза"
                    : fenceKind
                      ? "Щелчок — поставить секцию · Shift — повернуть · Esc — закончить"
                    : gateKind
                      ? `Щелчок по забору — встроить ${gateName} · Esc — закончить`
                    : selectedGate
                      ? "Потяните стрелку, чтобы переместить проём · Щелчок — сдвиг на 1 см"
                    : selectedFence
                      ? "Перетащите секцию по участку · Delete — удалить"
                    : placingSteps
                      ? "Нажмите на наружную дверь или французское окно · Esc — закончить"
                    : lawnActive
                      ? "Нажмите на землю — уложить покрытие · Esc — закончить"
                    : selectedLawn
                      ? "Перетащите покрытие за середину или потяните стрелку у края"
                    : plantKind
                      ? "Нажмите на участок · Shift — посадить несколько · Esc — отмена"
                      : selectedPlant
                        ? "Перетащите дерево на участке · высота и поворот — справа · Delete — удалить"
                        : "Мышь — вращение · правая кнопка — перемещение · прокрутка — масштаб"}
              </span>
            </div>
            <kbd>
              {mode === "2d" && tool === "wall"
                ? "ESC — закончить"
                : "TAB — сменить вид"}
            </kbd>
          </div>
        </main>
        <aside className="inspector">
          <div className="inspector-header">
            <span>Свойства</span>
            <span className="inspector-icon">
              <Icon name="layers" size={16} />
            </span>
          </div>
          <div className="inspector-scroll">
            {mode==="3d" && (gateKind || selectedGate) ? (
              <>
                <div className="object-title">
                  <span><Icon name="grid" size={20}/></span>
                  <div><strong>{editingWicket?"Распашная калитка":"Распашные ворота"}</strong>
                    <small>{editingWicket
                      ? selectedGate ? `${selectedGate.kind==="mesh"?"3D-сетка":"Металлоштакетник"} · одна створка` : "Одна створка · заполнение по забору"
                      : `${(selectedGate?.kind ?? gateKind)==="mesh"?"3D-сетка":"Металлоштакетник"} · две створки`} · {format(FENCE_HEIGHT)} м</small></div>
                  <button aria-label={editingWicket?"Завершить работу с калиткой":"Завершить работу с воротами"} onClick={()=>{setGateKind(null);setSelectedGateId(null);}}><Icon name="close" size={15}/></button>
                </div>
                <Field label={editingWicket?"Ширина калитки":"Ширина проезда"} value={selectedGate ? gateWidth(selectedGate) : activeGateWidth}
                  min={editingWicket?WICKET_MIN_WIDTH:GATE_MIN_WIDTH} max={editingWicket?WICKET_MAX_WIDTH:GATE_MAX_WIDTH}
                  step={.01} onCommit={resizeSelectedGate}/>
                {selectedGate ? <>
                  <div className="section-label" id="gate-swing-heading">СТОРОНА ОТКРЫВАНИЯ</div>
                  <div className="door-orientation-options" role="group" aria-labelledby="gate-swing-heading">
                    <button type="button" aria-pressed={selectedGate.swing==="in"} onClick={()=>setGateSwing("in")}>Внутрь</button>
                    <button type="button" aria-pressed={selectedGate.swing==="out"} onClick={()=>setGateSwing("out")}>Наружу</button>
                  </div>
                  <div className="door-orientation-options">
                    <button type="button" aria-pressed={!!selectedGate.mirrored}
                      onClick={()=>moveSelectedGate({...selectedGate,mirrored:!selectedGate.mirrored})}>
                      Зеркалить открывание
                    </button>
                  </div>
                  <button type="button" className="door-state-button" onClick={()=>toggleGate(selectedGate.id)}>
                    {selectedGate.open?"Закрыть":"Открыть"} {gateName}
                  </button>
                  <button className="delete-object" onClick={deleteSelected}><Icon name="trash" size={16}/>Убрать {gateName}</button>
                </> : <p className="property-hint">{editingWicket
                  ? "Выберите ширину и нажмите на прямой участок забора. Калитка примет его цвет и заполнение."
                  : "Выберите ширину между внутренними гранями столбов и нажмите на прямой участок забора того же типа."}</p>}
              </>
            ) : mode==="3d" && (fenceKind || selectedFence) ? (
              <>
                <div className="object-title">
                  <span><Icon name="grid" size={20}/></span>
                  <div><strong>{FENCE_TYPES.find(item=>item.id===(selectedFence?.kind ?? fenceKind))?.name}</strong>
                    <small>{format(selectedFence ? fenceLength(selectedFence) : FENCE_LENGTH)} м между столбами · высота {format(FENCE_HEIGHT)} м</small></div>
                  <button aria-label="Завершить работу с забором" onClick={()=>{setFenceKind(null);setSelectedFenceId(null);}}><Icon name="close" size={15}/></button>
                </div>
                <FinishColors colors={[...FENCE_COLORS]} value={selectedFence?.color ?? fenceColor} prefix="fence-color"
                  label="Цвет забора" onChange={editFenceColor}/>
                {selectedFence ? <>
                  <div className="section-label" id="fence-side-heading">{selectedFence.kind==="mesh" ? "СТОРОНА РЁБЕР СЕТКИ" : "СТОРОНА ОБРЕШЁТКИ"}</div>
                  <div className="roof-directions" role="group" aria-labelledby="fence-side-heading">
                    <button type="button" aria-pressed={fenceFacesInward} onClick={()=>setFenceSide(true)}>Внутрь</button>
                    <button type="button" aria-pressed={!fenceFacesInward} onClick={()=>setFenceSide(false)}>Наружу</button>
                  </div>
                  <p className="property-hint">{fenceHasGate ? "Уберите встроенные ворота или калитку, чтобы переместить или удалить секцию." : "Потяните секцию мышью. Столб примагнитится к соседнему забору, а секции разделятся в месте стыка."}</p>
                  <button className="delete-object" onClick={deleteSelected}><Icon name="trash" size={16}/>Удалить секцию</button>
                </>
                  : <p className="property-hint">Поставьте первый столб на участке. Наведите курсор в нужном направлении и щёлкните для установки секции.</p>}
              </>
            ) : mode === "3d" && (lawnActive || selectedLawn) ? (
              <>
                <div className="object-title">
                  <span><Icon name="lawn" size={20} /></span>
                  <div><strong>{groundCoverName(activeCover)}</strong><small>{selectedLawn ? "Покрытие на участке" : "Размещение покрытия"}</small></div>
                  <button aria-label="Завершить работу с покрытием" onClick={() => { setCoverTool(null); setSelectedLawnId(null); }}><Icon name="close" size={15} /></button>
                </div>
                <div className="field-grid">
                  <Field label="Ширина покрытия" value={coverWidth} min={COVER_MIN_SIZE} max={COVER_MAX_SIZE} step={.01} onCommit={size => selectedLawn ? editLawn({size}) : setCoverSize(s=>({...s,size}))} />
                  <Field label="Длина покрытия" value={coverLength} min={COVER_MIN_SIZE} max={COVER_MAX_SIZE} step={.01} onCommit={depth => selectedLawn ? editLawn({depth}) : setCoverSize(s=>({...s,depth}))} />
                </div>
                <div className="lawn-presets" aria-label="Готовые квадратные размеры">
                  {[.5,1,2,3,5].map(size => <button key={size} className={coverWidth === size && coverLength === size ? "active" : ""} onClick={() => selectedLawn ? editLawn({size,depth:size}) : setCoverSize({size,depth:size})}>{format(size)} м</button>)}
                </div>
                <div className="lawn-area-card"><span>{selectedFootprint ? "Уложенная площадь" : "Площадь покрытия"}</span><strong data-testid="lawn-tile-area">{format(selectedFootprint?.area ?? coverWidth*coverLength)} <small>м²</small></strong></div>
                <p className="property-hint">{activeCover === "lawn" ? "Газон повторяется блоками 2 × 2 м. Высота травы — 12 см." : "Фактура сохраняет масштаб при изменении размеров."} {selectedFootprint && !selectedFootprint.full ? "Площадь указана после подрезки по дому." : "У дома покрытие подрезается по цоколю."}</p>
                {selectedLawn ? <>
                  <div className="field-grid">
                    <Field label="Центр X" value={selectedLawn.position.x} min={-500} max={500} step={.01} onCommit={x=>editLawn({position:{...selectedLawn.position,x}})} />
                    <Field label="Центр Y" value={selectedLawn.position.y} min={-500} max={500} step={.01} onCommit={y=>editLawn({position:{...selectedLawn.position,y}})} />
                  </div>
                  <p className="property-hint">Ctrl+C — скопировать покрытие, Ctrl+V — разместить копию. Удерживайте ⌥ Option для свободного перемещения. Потяните за край или угол, чтобы изменить размеры.</p>
                  <button className="delete-object" onClick={deleteSelected}><Icon name="trash" size={16} />Удалить покрытие</button>
                </> : <div className="plant-placement-note"><Icon name="cursor" size={18} /><p>Нажмите на землю, чтобы уложить покрытие.<small>Положение свободное. Esc — закончить укладку.</small></p></div>}
                <div className="lawn-totals"><span>Площадь покрытий участка</span><strong data-testid="lawn-total-area">{format(coverArea)} м²</strong><small>Участков покрытия: {project.lawn?.length ?? 0}</small></div>
              </>
            ) : mode === "3d" && (selectedPlant || plantKind) ? (
              <>
                <div className="object-title">
                  <span>
                    <Icon name="tree" size={20} />
                  </span>
                  <div>
                    <strong>
                      {PLANT_CATALOGUE[selectedPlant?.kind ?? plantKind!].name}
                    </strong>
                    <small>
                      {selectedPlant
                        ? "Растение на участке"
                        : "Параметры перед посадкой"}
                    </small>
                  </div>
                  <button
                    aria-label="Снять выделение растения"
                    onClick={() => {
                      setSelectedPlantId(null);
                      setPlantKind(null);
                    }}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
                <PlantVariants
                  kind={selectedPlant?.kind ?? plantKind!}
                  value={selectedPlant ? selectedPlant.variant : plantVariants[plantKind!]}
                  onChoose={variant => selectedPlant
                    ? editPlant({ variant })
                    : setPlantVariants(v => ({ ...v, [plantKind!]: variant }))}
                />
                <Field
                  label={editingHerb ? "Высота растения" : "Высота дерева"}
                  value={selectedPlant?.height ?? plantHeight}
                  min={heightLimits.min}
                  max={heightLimits.max}
                  onCommit={(height) =>
                    selectedPlant
                      ? editPlant({ height })
                      : setPlantHeights((h) => ({ ...h, [plantKind!]: height }))
                  }
                />
                <p className="property-hint">
                  {editingHerb ? "Высота в метрах. Растение масштабируется с сохранением пропорций. Трава и цветы проходимы в прогулке." : "Высота в метрах. Крона, ветви и ствол масштабируются вместе, сохраняя пропорции."}
                </p>
                {selectedPlant ? (
                  <>
                    <Field
                      label={editingHerb ? "Поворот растения" : "Поворот дерева"}
                      value={selectedPlant.rotation}
                      min={0}
                      max={360}
                      unit="°"
                      onCommit={(rotation) => editPlant({ rotation })}
                    />
                    <div className="field-grid">
                      <Field
                        label="Положение X"
                        value={selectedPlant.position.x}
                        min={-500}
                        max={500}
                        onCommit={(x) =>
                          editPlant({
                            position: { ...selectedPlant.position, x },
                          })
                        }
                      />
                      <Field
                        label="Положение Y"
                        value={selectedPlant.position.y}
                        min={-500}
                        max={500}
                        onCommit={(y) =>
                          editPlant({
                            position: { ...selectedPlant.position, y },
                          })
                        }
                      />
                    </div>
                    {!editingHerb&&<p className="property-hint">Стрелки показывают расстояния от края ствола по осям участка только в направлениях с препятствиями. Газон и низкие растения не учитываются.</p>}
                    <button className="delete-object" onClick={deleteSelected}>
                      <Icon name="trash" size={16} />
                      {editingHerb ? "Удалить растение" : "Удалить дерево"}
                    </button>
                  </>
                ) : (
                  <div className="plant-placement-note">
                    <Icon name="cursor" size={18} />
                    <p>
                      Нажмите на землю в 3D.
                      <small>
                        Полупрозрачная модель покажет место посадки.
                      </small>
                    </p>
                  </div>
                )}
              </>
            ) : mode === "walk" ? (
              <>
                <div className="object-title">
                  <span>
                    <Icon name="walk" size={20} />
                  </span>
                  <div>
                    <strong>Прогулка по дому</strong>
                    <small>Человеческий масштаб</small>
                  </div>
                </div>
                <div className="walk-person">
                  <Icon name="walk" size={56} />
                  <div>
                    <span>
                      Рост человека<strong>1,75 м</strong>
                    </span>
                    <span>
                      Высота глаз стоя<strong>1,65 м</strong>
                    </span>
                  </div>
                </div>
                <p className="property-hint">
                  Камера остаётся на высоте глаз при ходьбе. Пробел — прыжок
                  до 45 см с возвращением на землю.
                </p>
                <div className="walk-control-list">
                  <span>
                    <kbd>W A S D</kbd>Движение
                  </span>
                  <span>
                    <kbd>SHIFT</kbd>Бег
                  </span>
                  <span>
                    <kbd>ПРОБЕЛ</kbd>Прыжок
                  </span>
                  <span>
                    <kbd>МЫШЬ</kbd>Осмотреться
                  </span>
                  <span>
                    <kbd>ESC</kbd>Пауза и курсор
                  </span>
                  <span>
                    <kbd>F</kbd>Вернуться на старт
                  </span>
                </div>
              </>
            ) : mode === "2d" && selectedRoom ? (
              <>
                <div className="object-title">
                  <span><Icon name="plan" size={20}/></span>
                  <div><strong>Комната {String(rooms.indexOf(selectedRoom)+1).padStart(2,"0")}</strong>
                    <small>{format(selectedRoom.area)} м²</small></div>
                  <button aria-label="Снять выделение" onClick={()=>setSelection(null)}><Icon name="close" size={15}/></button>
                </div>
                {floorPicker}
              </>
            ) : mode === "2d" && selectedWall ? (
              <>
                <div className="object-title">
                  <span>
                    <Icon name="wall" size={20} />
                  </span>
                  <div>
                    <strong>Стена</strong>
                    <small>Размеры и геометрия</small>
                  </div>
                  <button
                    aria-label="Снять выделение"
                    onClick={() => setSelection(null)}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
                {[outsideDimensions,!outsideDimensions].map(outside=><Field
                  key={outside?"outer-length":"inner-length"}
                  label={outside?"Наружная длина":"Длина"}
                  value={wallMeasuredLength(selectedWall,project.walls,outside)}
                  min={0.2}
                  max={100}
                  onCommit={length=>editWall({},length,outside)}
                />)}
                <div className="field-grid">
                  <Field
                    label="Высота"
                    value={selectedWall.height}
                    min={0.5}
                    max={10}
                    onCommit={(height) => editWall({ height })}
                  />
                  <Field
                    label="Толщина"
                    value={selectedWall.thickness}
                    min={0.05}
                    max={1}
                    onCommit={(thickness) => editWall({ thickness })}
                  />
                </div>
                <p className="property-hint">
                  Первый размер соответствует выноске на плане. «Наружная длина» включает наружные углы, «Длина» показывает расстояние между гранями. Чтобы сдвинуть стену, потяните за её середину.
                </p>
                <button className="delete-object" onClick={deleteSelected}>
                  <Icon name="trash" size={16} />
                  Удалить стену
                </button>
              </>
            ) : mode === "2d" && selectedOpening ? (
              <>
                <div className="object-title">
                  <span>
                    <Icon name={selectedOpening.kind} size={20} />
                  </span>
                  <div>
                    <strong>
                      {selectedOpening.kind === "door" ? "Дверь" : "Окно"}
                    </strong>
                    <small>Отступы видны на плане</small>
                  </div>
                  <button
                    aria-label="Снять выделение"
                    onClick={() => setSelection(null)}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
                {selectedOpening.kind === "window" ? <>
                  <Toggle label="Французское окно" detail="Остекление до уровня пола" value={!!selectedOpening.french}
                    onChange={() => editOpening(selectedOpening.french
                      ? {french:undefined,entrySteps:undefined}
                      : {french:true,ventSections:windowSectionWidths(selectedOpening).map((_,i) => selectedOpening.ventSections?.[i] ?? "closed")})} />
                  <div className="window-finish-picker">
                    <span id="window-finish-label">Цвет рамы</span>
                    <div role="group" aria-labelledby="window-finish-label">
                      {WINDOW_FRAME_FINISHES.map(finish => <button key={finish.id} type="button"
                        data-testid={`window-frame-${finish.id}`} aria-pressed={windowFrameFinish(selectedOpening) === finish.id}
                        onClick={() => { if (windowFrameFinish(selectedOpening) !== finish.id) editOpening({frameFinish: finish.id}); }}>
                        <i className={finish.id === "wood" ? "wood-swatch" : ""} style={{backgroundColor: finish.color}} />
                        <span>{finish.name}</span>
                      </button>)}
                    </div>
                  </div>
                  <WindowSectionPicker opening={selectedOpening}
                    onChange={count => editOpening(setWindowSectionCount(selectedOpening, count))}
                    onVentChange={index=>editOpening(setWindowVent(selectedOpening,index,selectedOpening.ventSections?.[index]?null:"closed"))}
                    onVentMirror={index=>editOpening(mirrorWindowVent(selectedOpening,index))} />
                  <Field label="Общая ширина окна" value={selectedOpening.width} min={0.3} max={10} step={0.01}
                    onCommit={width => editOpening(resizeWindow(selectedOpening, width))} />
                  <div className="window-section-fields">
                    {windowSectionWidths(selectedOpening).map((width, i) => <Field key={`${selectedOpening.id}:${i}`}
                      label={`Ширина секции ${i + 1}`} value={width} min={MIN_WINDOW_SECTION}
                      max={Math.round((10 - selectedOpening.width + width) * 1000) / 1000} step={0.01}
                      onCommit={value => editOpening(resizeWindowSection(selectedOpening, i, value))} />)}
                  </div>
                  <p className="property-hint">Ширина окна — сумма секций. Изменение общей ширины масштабирует секции; изменение одной секции меняет общую ширину.</p>
                  {selectedOpening.french ? <Field label="Высота окна от пола"
                    value={selectedOpening.height+selectedOpening.sill} min={selectedOpening.sill+.3} max={10}
                    onCommit={height => editOpening({height:Math.round((height-selectedOpening.sill)*1000)/1000})} />
                  : <div className="field-grid">
                    <Field label="Высота" value={selectedOpening.height} min={0.3} max={10}
                      onCommit={height => editOpening({height})} />
                    <Field label="Высота подоконника" value={selectedOpening.sill} min={0} max={9}
                      onCommit={sill => editOpening({sill})} />
                  </div>}
                </> : <>
                <div className="section-label">ЦВЕТ ДВЕРИ</div>
                <DoorFinishPicker value={doorFinish(selectedOpening,project)} onChange={doorFinish=>editOpening({doorFinish})}/>
                <button className="door-state-button" data-testid="door-state-toggle" onClick={()=>toggleOpening(selectedOpening.id)}>{doorOpen(selectedOpening)?"Закрыть дверь":"Открыть дверь"}</button>
                <div className="section-label">ОТКРЫВАНИЕ</div>
                <div className="door-orientation-options" role="group" aria-label="Открывание двери">
                  <button type="button" data-testid="door-reverse-swing" aria-pressed={doorSwingDirection(selectedOpening)===-1}
                    onClick={()=>editOpening({doorSwing:doorSwingDirection(selectedOpening)===1?-1:1})}>Сменить сторону открывания</button>
                  <button type="button" data-testid="door-mirror" aria-pressed={!!selectedOpening.doorMirrored}
                    onClick={()=>editOpening({doorMirrored:!selectedOpening.doorMirrored})}>Зеркалить петли</button>
                </div>
                <div className="field-grid">
                  <Field
                    label="Ширина"
                    value={selectedOpening.width}
                    min={0.3}
                    max={10}
                    onCommit={(width) => editOpening({ width })}
                  />
                  <Field
                    label="Высота"
                    value={selectedOpening.height}
                    min={0.3}
                    max={10}
                    onCommit={(height) => editOpening({ height })}
                  />
                </div></>}
                <Field
                  label="От начала стены"
                  value={selectedOpening.offset-openingStart}
                  min={0.1}
                  max={500}
                  onCommit={(offset) => editOpening({ offset:offset+openingStart })}
                />
                <button className="delete-object" onClick={deleteSelected}>
                  <Icon name="trash" size={16} />
                  Удалить {selectedOpening.kind === "door" ? "дверь" : "окно"}
                </button>
              </>
            ) : (
              <>
                <div className="object-title">
                  <span>
                    <Icon name={mode === "3d" ? "cube" : "wall"} size={20} />
                  </span>
                  <div>
                    <strong>
                      {mode === "3d" ? "Ваш дом в объёме" : "Новая стена"}
                    </strong>
                    <small>
                      {mode === "3d"
                        ? "Модель из вашего чертежа"
                        : "Параметры для рисования"}
                    </small>
                  </div>
                </div>
                {mode === "2d" ? (
                  <>
                    <Field
                      label="Высота стен"
                      value={height}
                      min={0.5}
                      max={10}
                      onCommit={setHeight}
                    />
                    <Field
                      label="Толщина стен"
                      value={thickness}
                      min={0.05}
                      max={1}
                      onCommit={setThickness}
                    />
                    <p className="property-hint">
                      Чтобы изменить существующую стену, выберите её на плане.
                    </p>
                  </>
                ) : (
                  <p className="property-hint">
                    Стены и проёмы построены по размерам 2D-плана. Вернитесь в
                    2D, чтобы отредактировать дом.
                  </p>
                )}
              </>
            )}
            {mode==="3d"&&rooms.length>0&&floorPicker}
            {mode==="3d"&&<FacadePicker value={facadeSettings(project)} onChange={editFacade}/>}
            {mode==="3d"&&<section className="inspector-section">
              <PlinthPicker value={plinthSettings(project)} onChange={editPlinth}/>
              <Field label="Высота цоколя" value={plinthSettings(project).height} min={.05} max={.8} step={.01} onCommit={height=>editPlinth({...plinthSettings(project),height})}/>
              <Field label="Уступ фасада" value={plinthSettings(project).recess} min={0} max={.15} step={.01} onCommit={recess=>editPlinth({...plinthSettings(project),recess})}/>
              <p className="property-hint">Цоколь утоплен внутрь внешнего контура. Фасад выступает над ним, как на фото. У тонких стен уступ ограничен толщиной стены.</p>
            </section>}
            {mode==="3d"&&<InteriorPicker value={interiorSettings(project)} onChange={editInterior}/>}
            {mode==="3d"&&<section className="inspector-section" data-testid="door-finish-editor">
              <div className="section-label">ЦВЕТ ДВЕРЕЙ</div>
              <DoorFinishPicker prefix="all-doors-color" value={project.doorFinish??"wood"} onChange={editDoorFinish}/>
              <p className="property-hint">Общий цвет полотен и коробок. Цвет и открывание отдельной двери настраиваются в 2D. В 3D и прогулке нажмите на полотно или ручку двери.</p>
            </section>}
            {mode==="3d"&&<section className="inspector-section roof-editor" data-testid="roof-editor">
              <div className="section-label">КРЫША<span>{project.roof?"На доме":"Не установлена"}</span></div>
              <RoofPicker roof={project.roof} onChoose={type=>editRoof({type})}/>
              {!project.roof&&<p className="property-hint">Выберите форму, чтобы установить крышу на дом.</p>}
              {project.roof&&<>
                <RoofSurfacePicker surface={roofSurface(project.roof)} color={roofColor(project.roof)} onChoose={surface=>editRoof({surface})}/>
                <RoofColorPicker color={roofColor(project.roof)} onChoose={color=>editRoof({color})}/>
                {project.roof.type!=="flat"&&<Field label="Высота конька" value={project.roof.height} min={.3} max={8} step={.1} onCommit={height=>editRoof({height})}/>}
                <Field label="Свес крыши" value={project.roof.overhang} min={0} max={1.5} step={.05} onCommit={overhang=>editRoof({overhang})}/>
                {project.roof.type==="gable"&&<div className="roof-directions" role="group" aria-label="Направление конька">
                  <button type="button" aria-pressed={project.roof.direction==="x"} onClick={()=>editRoof({direction:"x"})}>Вдоль дома</button>
                  <button type="button" aria-pressed={project.roof.direction==="y"} onClick={()=>editRoof({direction:"y"})}>Поперёк</button>
                </div>}
                <p className="property-hint">{roofData(project).parts.length?"Крыша следует внешнему контуру и обновляется вместе со стенами. Галочка «Крыша» скрывает её для просмотра комнат.":"Замкните внешний контур стен — крыша появится автоматически."}</p>
                <p className="property-hint">Водосточка{project.roof.type!=="flat"?" и снегозадержатели":""} добавляются автоматически и скрываются вместе с крышей.</p>
              </>}
            </section>}
            <div className="inspector-section">
              <div className="section-label">
                {mode === "2d" ? "НАСТРОЙКИ ЧЕРТЕЖА" : "ПРОСМОТР"}
              </div>
              {mode === "2d" ? (
                <>
                  <Toggle
                    label="Сетка участка"
                    detail={`Шаг ${format(gridStep)} м · общий ноль`}
                    value={grid}
                    onChange={() => setGrid((v) => !v)}
                    icon="grid"
                  />
                  <Field label="Шаг сетки участка" value={gridStep} min={.5} max={5} onCommit={setGridStep}/>
                  <Toggle
                    label="Привязка"
                    detail="Шаг 1 см и точки стен"
                    value={snap}
                    onChange={() => setSnap((v) => !v)}
                    icon="magnet"
                  />
                  <Toggle
                    label="Размеры"
                    value={dimensions}
                    onChange={() => setDimensions((v) => !v)}
                    icon="plan"
                  />
                  <Toggle
                    label="Наружные размеры"
                    detail="По внешним граням углов"
                    value={outsideDimensions}
                    onChange={()=>setOutsideDimensions(v=>!v)}
                    icon="plan"
                  />
                </>
              ) : (
                <>{mode==="3d"&&<Toggle label="Сетка участка" detail={`Шаг ${format(gridStep)} м`} value={grid} onChange={()=>setGrid(v=>!v)} icon="grid"/>}
                <div className="model-note">
                  <span>
                    <Icon name="check" size={15} />
                  </span>
                  <p>
                    {mode === "walk"
                      ? "Проход через открытые двери"
                      : "План и 3D синхронизированы"}
                    <small>
                      {mode === "walk"
                        ? "Стены, окна и дверные полотна останавливают"
                        : "Переключайтесь в любой момент"}
                    </small>
                  </p>
                </div></>
              )}
            </div>
            <div className="inspector-section project-info">
              <div className="section-label">О ПРОЕКТЕ</div>
              <div className="area-card">
                <span>Площадь контуров</span>
                <strong data-testid="total-area">
                  {format(area)}
                  <small>м²</small>
                </strong>
                <div>
                  {rooms.length
                    ? "По осям стен замкнутых комнат"
                    : "Замкните стены, чтобы получить площадь"}
                </div>
              </div>
              <div className="stats-row">
                <span>
                  Стены
                  <strong data-testid="wall-count">
                    {project.walls.length}
                  </strong>
                </span>
                <span>
                  Комнаты<strong>{rooms.length}</strong>
                </span>
                <span>
                  Проёмы<strong>{project.openings.length}</strong>
                </span>
              </div>
              <p className="area-note">
                Эскизная модель. Площадь указана по осям стен, без вычета их
                толщины.
              </p>
            </div>
          </div>
          <div className="inspector-bottom">
            <span className="local-dot" />
            Работает без интернета
          </div>
        </aside>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.domplan.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (f.size > 5_000_000) notify("Максимальный размер файла — 5 МБ");
            else importProject(await f.text());
          }
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Icon name="info" size={17} />
          {toast}
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {(help || newDialog) && (
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              setHelp(false);
              setNewDialog(false);
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button
              className="modal-close"
              aria-label="Закрыть"
              onClick={() => {
                setHelp(false);
                setNewDialog(false);
              }}
            >
              <Icon name="close" />
            </button>
            {help ? (
              <>
                <span className="eyebrow">НЕСКОЛЬКО ПРОСТЫХ ШАГОВ</span>
                <h2 id="dialog-title">
                  Сначала план.
                  <br />
                  Затем пространство.
                </h2>
                <div className="help-steps">
                  <p>
                    <b>01</b>
                    <span>
                      <strong>Нарисуйте стены</strong>Отметьте начало и конец.
                      Для точной наружной длины наведите курсор в нужную сторону
                      и нажмите Enter. Shift фиксирует направление, Escape
                      завершает цепочку. В режиме выбора потяните стену за середину.
                    </span>
                  </p>
                  <p>
                    <b>02</b>
                    <span>
                      <strong>Добавьте двери и окна</strong>Выберите инструмент
                      и нажмите на стену. Размеры проёма меняются в панели
                      справа.
                    </span>
                  </p>
                  <p>
                    <b>03</b>
                    <span>
                      <strong>Посмотрите на дом в 3D</strong>Нажмите «3D-вид» и
                      вращайте модель мышью. «Прогулка» переносит внутрь дома:
                      WASD — движение, Shift — бег, Пробел — прыжок, мышь — взгляд, Escape —
                      пауза. Tab переключает три вида.
                    </span>
                  </p>
                </div>
                <div className="shortcut-note">
                  ⌘Z — отмена · ⇧⌘Z — повтор · ⌘S — сохранить
                  <br />V — выбор · W — стена · D — дверь · O — окно · H —
                  перемещение
                  <br />
                  План: прокрутка — перемещение · щипок — масштаб · F — весь дом
                </div>
                <button
                  className="button primary full"
                  onClick={() => setHelp(false)}
                >
                  Начать проектировать
                  <Icon name="arrow" size={17} />
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">ЧИСТЫЙ ЛИСТ</span>
                <h2 id="dialog-title">
                  Новый дом
                  <br />
                  начинается с идеи.
                </h2>
                <label className="project-name-field">
                  Название проекта
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={80}
                  />
                </label>
                <button
                  className="button primary full"
                  onClick={() => {
                    change({
                      version: 1,
                      name: newName.trim() || "Мой дом",
                      walls: [],
                      openings: [],
                    });
                    setSelection(null);
                    setMode("2d");
                    setTool("wall");
                    setFitKey((k) => k + 1);
                    setNewDialog(false);
                  }}
                >
                  Создать пустой проект
                  <Icon name="plus" size={18} />
                </button>
                <button
                  className="example-button"
                  onClick={() => {
                    change(demoProject());
                    setMode("2d");
                    setTool("select");
                    setSelection(null);
                    setFitKey((k) => k + 1);
                    setNewDialog(false);
                  }}
                >
                  Открыть пример дома 70 м²
                  <Icon name="arrow" size={15} />
                </button>
                <p className="modal-note">
                  Текущий проект заменится. Его можно вернуть через ⌘Z.
                  <br />
                  Чтобы оставить отдельную копию, сохраните проект в файл.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
