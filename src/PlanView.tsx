import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { windowDividers, windowSectionWidths } from "./windowSections";
import { dragOpening, dragWindowDivider, offsetAlongWall, type OpeningDragMode } from "./openingDrag";
import { OpeningHandle } from "./OpeningHandle";
import { readablePlanAngle } from "./planLabels";
import { OpeningClearanceDimensions } from "./OpeningClearanceDimensions";
import { WallJunctionDimensions } from "./WallJunctionDimensions";
import { measureWallJunction } from "./wallJunctionMeasurements";
import {snapWallPoint,wallDrawingStart,wallDrawingSegment} from "./wallConstraints";
import {wallBodies,wallHandlePoint} from "./wallBodies";
import {moveWall} from "./wallMovement";
import {lawnGridSize,snapSiteValue,SITE_SNAP_STEP} from "./siteGrid";
import {doorOpen,doorFinish,DOOR_FINISHES} from "./houseFinishes";
import {doorHingeOffset,doorLeafLength,doorSwingDirection} from "./doorPhysics";
import {projectWindowVents} from "./windowVentPhysics";
import {
  bounds,
  canPlaceOpening,
  distance,
  findRooms,
  format,
  nearestWall,
  pointOnWall,
  resizeWall,
  wallAtOutsideLength,
  wallMeasuredLength,
  uid,
  wallLength,
  type Opening,
  type Point,
  type Project,
  type Wall,
} from "./model";
export type Tool = "select" | "wall" | "door" | "window" | "hand";
export type Selection = { kind: "wall" | "opening" | "room"; id: string } | null;
function openingResizeCursor(dx: number, dy: number) {
  const sector = (Math.round(Math.atan2(dy,dx)*4/Math.PI)+8)%4;
  return ["ew-resize","nwse-resize","ns-resize","nesw-resize"][sector];
}
type Props = {
  project: Project;
  tool: Tool;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onChange: (p: Project) => void;
  grid: boolean;
  snap: boolean;
  dimensions: boolean;
  outsideDimensions: boolean;
  thickness: number;
  height: number;
  fitKey: number;
  notify: (s: string) => void;
};
export function PlanView({
  project,
  tool,
  selection,
  onSelect,
  onChange,
  grid,
  snap,
  dimensions,
  outsideDimensions,
  thickness,
  height,
  fitKey,
  notify,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 }),
    [view, setView] = useState({ cx: 5, cy: 3.5, scale: 64 });
  const [start, setStart] = useState<Point | null>(null),
    [cursor, setCursor] = useState<Point | null>(null),
    [wallHover, setWallHover] = useState<Point | null>(null),
    [lengthEntry, setLengthEntry] = useState<string | null>(null),
    [draft, setDraft] = useState<Project | null>(null),
    [gestureCursor, setGestureCursor] = useState<string | null>(null);
  const pan = useRef<{ x: number; y: number; cx: number; cy: number } | null>(
    null,
  );
  const drag = useRef<{
    wallId: string;
    endpoint?: "a" | "b";
    original: Project;
    pointer: Point;
    started: boolean;
  } | null>(null);
  const openingDrag = useRef<{
    id: string;
    mode: OpeningDragMode;
    divider: number | null;
    original: Project;
    anchor: number;
    pointer: Point;
    started: boolean;
  } | null>(null);
  const capturedPointer = useRef<number | null>(null);
  const draftRef = useRef<Project | null>(null),
    viewRef = useRef(view);
  viewRef.current = view;
  const releasePointer = () => {
    const id = capturedPointer.current;
    capturedPointer.current = null;
    if (id !== null && svg.current?.hasPointerCapture(id)) svg.current.releasePointerCapture(id);
  };
  const cancel = () => {
    pan.current = null;
    drag.current = null;
    openingDrag.current = null;
    draftRef.current = null;
    setDraft(null);
    setGestureCursor(null);
    releasePointer();
  };
  const capturePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    capturedPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const shown = draft || project,
    rooms = useMemo(() => findRooms(shown.walls), [shown.walls]);
  const windowVents=projectWindowVents(shown);
  const bodies=wallBodies(shown.walls);
  const drawingWall=useMemo(()=>{
    if(tool!=="wall"||!start||!cursor||distance(start,cursor)<1e-8)return null;
    const segment=wallDrawingSegment(start,cursor,shown.walls,thickness);
    return {id:"__domplan-wall-preview__",...segment,thickness,height};
  },[tool,start,cursor,shown.walls,thickness,height]);
  const drawingBody=useMemo(()=>drawingWall&&distance(drawingWall.a,drawingWall.b)>=1e-8
    ?wallBodies([...shown.walls,drawingWall]).get(drawingWall.id)!:null,[shown.walls,drawingWall]);
  const drawingLength=drawingBody?(outsideDimensions?drawingBody.outerEnd-drawingBody.outerStart:drawingBody.length):0;
  const cursorPoint=drawingWall?.b??cursor;
  const junctions=useMemo(()=>{
    if(tool!=="wall")return [];
    if(drawingWall&&drawingBody){
      const {a,b,thickness}=drawingWall,footprint=drawingBody.polygon;
      return [
        ...measureWallJunction(shown.walls,a,b,thickness,footprint),
        ...measureWallJunction(shown.walls,b,a,thickness,footprint),
      ];
    }
    return !drawingWall&&cursor&&wallHover?measureWallJunction(shown.walls,cursor,wallHover,thickness):[];
  },[tool,drawingWall,drawingBody,shown.walls,cursor,wallHover,thickness]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const fit = () => {
    const b = bounds(project.walls);
    setView({
      cx: (b.minX + b.maxX) / 2,
      cy: (b.minY + b.maxY) / 2,
      scale: Math.max(
        8,
        Math.min(
          95,
          (size.w - 160) / Math.max(3, b.maxX - b.minX),
          (size.h - 160) / Math.max(3, b.maxY - b.minY),
        ),
      ),
    });
  };
  useEffect(() => {
    fit();
  }, [fitKey, size.w, size.h]);
  useEffect(() => {
    setStart(null);
    setCursor(null);
    setWallHover(null);
    setLengthEntry(null);
    cancel();
  }, [tool]);
  useEffect(() => {
    if (openingDrag.current && openingDrag.current.original !== project || drag.current && drag.current.original !== project) cancel();
  }, [project]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStart(null);
        setCursor(null);
        setWallHover(null);
        setLengthEntry(null);
        cancel();
      }
    };
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", esc); window.removeEventListener("blur", cancel); releasePointer(); };
  }, []);
  const left = view.cx - size.w / (2 * view.scale),
    top = view.cy - size.h / (2 * view.scale),
    unit = 1 / view.scale;
  const world = (e: { clientX: number; clientY: number }): Point => {
    const r = svg.current!.getBoundingClientRect(),
      v = viewRef.current;
    return {
      x: v.cx + (e.clientX - r.left - r.width / 2) / v.scale,
      y: v.cy + (e.clientY - r.top - r.height / 2) / v.scale,
    };
  };
  const snapped = (raw:Point,anchor:Point|null=null,shift=false)=>
    tool==="wall"&&!anchor
      ?wallDrawingStart(raw,project.walls,unit,snap,thickness)
      :snapWallPoint(raw,project.walls,unit,snap,anchor,shift,thickness);
  const zoom = (factor: number) =>
    setView((v) => ({
      ...v,
      scale: Math.max(8, Math.min(220, v.scale * factor)),
    }));
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (openingDrag.current || drag.current) return;
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.012),
          scale = Math.max(8, Math.min(220, v.scale * factor));
        const p = world(e),
          r = element.getBoundingClientRect();
        setView({
          scale,
          cx: p.x - (e.clientX - r.left - r.width / 2) / scale,
          cy: p.y - (e.clientY - r.top - r.height / 2) / scale,
        });
      } else
        setView({
          ...v,
          cx: v.cx + e.deltaX / v.scale,
          cy: v.cy + e.deltaY / v.scale,
        });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const placeOpening = (p: Point) => {
    const hit = nearestWall(p, project.walls);
    if (!hit || hit.distance > 18 * unit) {
      notify("Нажмите на стену, чтобы разместить проём");
      return;
    }
    const o: Opening = {
      id: uid(),
      wallId: hit.wall.id,
      kind: tool === "door" ? "door" : "window",
      offset: snap ? snapSiteValue(hit.offset) : hit.offset,
      width: tool === "door" ? 0.9 : 1.4,
      height:
        tool === "door"
          ? Math.min(2.1, hit.wall.height)
          : Math.min(1.4, hit.wall.height - 0.3),
      sill:
        tool === "door" ? 0 : Math.min(0.9, Math.max(0, hit.wall.height - 1.4)),
      ...(tool==="door"?{open:false}:{}),
    };
    if (!canPlaceOpening(project, o)) {
      notify(
        "Проём не помещается: выберите место подальше от края и других проёмов",
      );
      return;
    }
    onChange({ ...project, openings: [...project.openings, o] });
    onSelect({ kind: "opening", id: o.id });
  };
  const appendWall = (wall:Wall) => {
    if(project.walls.length>=300){notify("В базовой версии можно создать до 300 стен");return false;}
    if(Math.abs(wall.b.x)>500||Math.abs(wall.b.y)>500){notify("Стена выходит за границы участка");return false;}
    if(project.walls.some(w=>(distance(w.a,wall.a)<.01&&distance(w.b,wall.b)<.01)||
      (distance(w.b,wall.a)<.01&&distance(w.a,wall.b)<.01))){
      notify("На этом месте уже есть стена");
      return false;
    }
    onChange({...project,walls:[...project.walls,wall]});
    setStart(wall.b);
    setCursor(wall.b);
    setWallHover(null);
    return true;
  };
  const enterLength = () => {
    if(!drawingBody||drawingBody.length<.15)return;
    setLengthEntry(String(Math.round((drawingBody.outerEnd-drawingBody.outerStart)*1000)/1000).replace(".",","));
  };
  const commitLength = (event:React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if(!drawingWall||lengthEntry===null)return;
    const length=Number(lengthEntry.trim().replace(",","."));
    if(!Number.isFinite(length)||length<.2||length>100){notify("Введите длину от 0,2 до 100 м");return;}
    const wall=wallAtOutsideLength(project.walls,{...drawingWall,id:uid()},length);
    if(!wall){notify("Стена такой длины не помещается в выбранном направлении");return;}
    if(appendWall(wall)){
      setLengthEntry(null);
      svg.current?.focus();
    }
  };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2 || capturedPointer.current !== null) return;
    const p = world(e);
    if (tool === "hand" || e.button === 1 || e.altKey) {
      pan.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
      capturePointer(e);
      return;
    }
    const target = e.target as SVGElement;
    const openingId = target.closest("[data-opening]")?.getAttribute("data-opening");
    if (openingId && tool !== "wall") {
      const opening = project.openings.find(o => o.id === openingId)!;
      const wall = project.walls.find(w => w.id === opening.wallId)!;
      const edge = target.closest("[data-opening-edge]")?.getAttribute("data-opening-edge") as "start" | "end" | undefined;
      const dividerAttribute = target.closest("[data-window-divider-handle]")?.getAttribute("data-window-divider-handle");
      const divider = dividerAttribute === undefined || dividerAttribute === null ? null : Number(dividerAttribute)-1;
      openingDrag.current = { id: openingId, mode: edge ?? "move", divider, original: project, anchor: offsetAlongWall(p, wall), pointer: {x:e.clientX,y:e.clientY}, started:false };
      draftRef.current = null;
      onSelect({kind:"opening",id:openingId});
      setCursor(null);
      setGestureCursor(edge || divider !== null ? openingResizeCursor(wall.b.x-wall.a.x, wall.b.y-wall.a.y) : "grabbing");
      capturePointer(e);
      return;
    }
    if (tool === "wall") {
      if(lengthEntry!==null){setLengthEntry(null);return;}
      svg.current?.focus();
      const desired = snapped(p, start, e.shiftKey);
      if (!start) {
        setStart(desired);
        setCursor(desired);
        setWallHover(p);
        return;
      }
      const segment=wallDrawingSegment(start,desired,project.walls,thickness);
      if (distance(segment.a, segment.b) < 0.2) {
        if(distance(start,desired)>=.2)notify("Стена упирается в существующую стену");
        return;
      }
      appendWall({id:uid(),...segment,thickness,height});
      return;
    }
    if (tool === "door" || tool === "window") {
      placeOpening(p);
      return;
    }
    const endpoint = target.dataset.endpoint as "a" | "b" | undefined,
      wallId = target.dataset.wall;
    if (endpoint && wallId) {
      drag.current = {wallId,endpoint,original:project,pointer:p,started:false};
      capturePointer(e);
      return;
    }
    const id = target.closest("[data-wall]")?.getAttribute("data-wall");
    const roomId = target.closest("[data-room]")?.getAttribute("data-room");
    onSelect(id ? {kind:"wall",id} : roomId ? {kind:"room",id:roomId} : null);
    if(id){
      drag.current={wallId:id,original:project,pointer:p,started:false};
      capturePointer(e);
    }
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pan.current) {
      const p = pan.current;
      setView((v) => ({
        ...v,
        cx: p.cx - (e.clientX - p.x) / v.scale,
        cy: p.cy - (e.clientY - p.y) / v.scale,
      }));
      return;
    }
    const raw = world(e);
    const threshold=snap&&e.pointerType==="mouse"?Math.max(.5,Math.min(3,SITE_SNAP_STEP*.6/unit)):3;
    if (openingDrag.current) {
      const d = openingDrag.current;
      if (!d.started && Math.hypot(e.clientX-d.pointer.x,e.clientY-d.pointer.y)<threshold) return;
      d.started = true;
      const opening = d.original.openings.find(o => o.id === d.id)!;
      const wall = d.original.walls.find(w => w.id === opening.wallId)!;
      const delta = offsetAlongWall(raw,wall)-d.anchor;
      const next = d.divider === null ? dragOpening(d.original,d.id,d.mode,delta,snap) : dragWindowDivider(d.original,d.id,d.divider,delta,snap);
      if (!next) return;
      const oldSections = windowSectionWidths(opening);
      const changed = Math.abs(next.offset-opening.offset)>1e-7 || Math.abs(next.width-opening.width)>1e-7 ||
        d.divider !== null && windowSectionWidths(next).some((width,i) => Math.abs(width-oldSections[i])>1e-7);
      const preview = changed ? {...d.original,openings:d.original.openings.map(o=>o.id===d.id?next:o)} : null;
      draftRef.current = preview;
      setDraft(preview);
      return;
    }
    if (drag.current) {
      const d=drag.current,w=d.original.walls.find(w=>w.id===d.wallId)!;
      if(!d.started&&distance(raw,d.pointer)<threshold*unit)return;
      d.started=true;
      const delta={x:raw.x-d.pointer.x,y:raw.y-d.pointer.y};
      let next:Project;
      if(d.endpoint){
        const node=w[d.endpoint],anchor=w[d.endpoint==="a"?"b":"a"];
        const targets=d.original.walls.filter(w=>distance(w.a,node)>.001&&distance(w.b,node)>.001);
        const point=snapWallPoint({x:node.x+delta.x,y:node.y+delta.y},targets,unit,snap,anchor,e.shiftKey,w.thickness,node);
        next=resizeWall(d.original,d.wallId,{[d.endpoint]:point});
      }else{
        setGestureCursor("grabbing");
        next=moveWall(d.original,d.wallId,delta,unit,snap);
      }
      const actual=next.walls.find(w=>w.id===d.wallId)!;
      const preview=distance(actual.a,w.a)>1e-7||distance(actual.b,w.b)>1e-7?next:null;
      draftRef.current = preview;
      setDraft(preview);
      return;
    }
    if(lengthEntry!==null)return;
    const target = snapped(raw, start, e.shiftKey);
    if(tool==="wall"&&!start)setWallHover(raw);
    setCursor((e.target as SVGElement).closest("[data-opening]") && tool !== "wall" ? null : target);
  };
  const up = () => {
    pan.current = null;
    if (openingDrag.current) {
      if (draftRef.current) onChange(draftRef.current);
      cancel();
      return;
    }
    if (drag.current) {
      if (draftRef.current) {
        if (
          draftRef.current.openings.length <
          drag.current.original.openings.length
        )
          notify("Проёмы, которые перестали помещаться в стенах, удалены");
        onChange(draftRef.current);
      }
    }
    cancel();
  };
  const selectedWall =
    selection?.kind === "wall"
      ? shown.walls.find((w) => w.id === selection.id)
      : null;
  const selectedOpening=selection?.kind==="opening"?shown.openings.find(o=>o.id===selection.id):undefined;
  const lawnStep=lawnGridSize(shown),detailedGrid=view.scale>=50,minorStep=detailedGrid ? .1 : .5;
  return (
    <div className={`plan-view tool-${tool}${gestureCursor ? " opening-gesture" : ""}`} ref={host}>
      <svg
        ref={svg}
        data-testid="plan-svg"
        data-site-grid-size={lawnStep}
        data-site-grid-origin="0,0"
        data-snap-step={SITE_SNAP_STEP}
        aria-label="Редактор плана дома"
        tabIndex={-1}
        style={gestureCursor ? {cursor:gestureCursor} : undefined}
        viewBox={`${left} ${top} ${size.w / view.scale} ${size.h / view.scale}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={()=>{if(!start)setWallHover(null);}}
        onKeyDown={event=>{
          if(event.key==="Enter"&&tool==="wall"&&drawingBody){event.preventDefault();enterLength();}
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onContextMenu={(e) => {
          e.preventDefault();
          setStart(null);
          setWallHover(null);
          setLengthEntry(null);
        }}
      >
        <defs>
          <pattern
            id="minor-grid"
            width={minorStep}
            height={minorStep}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="0" cy="0" r={(detailedGrid ? .55 : .9) * unit} fill="#bfc3c9" />
          </pattern>
          <pattern
            id="major-grid"
            width={lawnStep}
            height={lawnStep}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${lawnStep} 0 L 0 0 0 ${lawnStep}`}
              fill="none"
              stroke="#7798bd"
              strokeWidth={.75 * unit}
              opacity=".48"
            />
          </pattern>
          <pattern
            id="wall-hatch"
            width=".12"
            height=".12"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width=".12" height=".12" fill="#4b5460" />
            <path
              d="M0 0V.12"
              stroke="#9298a0"
              strokeWidth=".015"
              opacity=".45"
            />
          </pattern>
        </defs>
        {grid && (
          <>
            <rect
              x={left}
              y={top}
              width={size.w / view.scale}
              height={size.h / view.scale}
              fill="url(#minor-grid)"
              pointerEvents="none"
            />
            <rect
              x={left}
              y={top}
              width={size.w / view.scale}
              height={size.h / view.scale}
              fill="url(#major-grid)"
              pointerEvents="none"
            />
          </>
        )}
        {rooms.map((room, i) => (
          <g key={room.id} pointerEvents="none">
            <polygon
              data-room={room.id}
              data-testid="plan-room"
              pointerEvents={tool==="select" ? "visiblePainted" : "none"}
              points={room.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={selection?.kind==="room" && selection.id===room.id ? "#bed5ef" : ["#e0eaf6", "#e8eef6", "#dce7f3", "#e8edf4"][i % 4]}
              fillOpacity=".9"
            />
            <text
              x={room.center.x}
              y={room.center.y - 0.05}
              textAnchor="middle"
              className="room-name"
              letterSpacing={1.4 * unit}
              fontSize={11 * unit}
            >
              КОМНАТА {String(i + 1).padStart(2, "0")}
            </text>
            <text
              x={room.center.x}
              y={room.center.y + 0.28}
              textAnchor="middle"
              className="room-area"
              letterSpacing={-0.2 * unit}
              fontSize={18 * unit}
            >
              {format(room.area)}
              <tspan fontSize={11 * unit}> м²</tspan>
            </text>
          </g>
        ))}
        {/* Draw all outer borders before any wall fill, so a later wall's
            border cannot cut a light seam into an already drawn junction. */}
        <g data-wall-outlines="" pointerEvents="none">
          {shown.walls.map(w => <polygon key={w.id}
                points={bodies.get(w.id)!.polygon.map(p=>`${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={selection?.kind === "wall" && selection.id === w.id ? "#a7b8cd" : "#e5e9ee"}
                strokeWidth={.07}
                strokeLinejoin="miter"
              />)}
        </g>
        <path data-wall-materials="" pointerEvents="none" fill="url(#wall-hatch)" fillRule="nonzero"
          d={shown.walls.map(w=>{const p=bodies.get(w.id)!.polygon;return p.length<3?"":`M${p.map(v=>`${v.x},${v.y}`).join("L")}Z`;}).join(" ")}/>
        {shown.walls.map((w) => {
          const active = selection?.kind === "wall" && selection.id === w.id;
          const body=bodies.get(w.id)!;
          return (
            <g key={w.id} data-wall={w.id} data-testid="wall" data-length={body.length}
              data-axis-a={`${w.a.x},${w.a.y}`} data-axis-b={`${w.b.x},${w.b.y}`} data-body-start={body.start} data-body-end={body.end}
              data-outer-length={body.outerEnd-body.outerStart}>
              <polygon data-wall-body=""
                points={body.polygon.map(p=>`${p.x},${p.y}`).join(" ")}
                fill={active ? "#416085" : "transparent"}
                pointerEvents="all"
              />
              <line
                x1={body.a.x}
                y1={body.a.y}
                x2={body.b.x}
                y2={body.b.y}
                stroke="transparent"
                strokeWidth={Math.max(w.thickness, 14 * unit)}
                strokeLinecap="butt"
              />
            </g>
          );
        })}
        {shown.openings.map((o) => {
          const w = shown.walls.find((w) => w.id === o.wallId);
          if (!w) return null;
          const p = pointOnWall(w, o.offset - o.width / 2),
            angle = (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI,
            active = selection?.kind === "opening" && selection.id === o.id;
          const editable = tool !== "wall" && tool !== "hand";
          const sections = o.kind === "window" ? windowSectionWidths(o) : null;
          const dividers = o.kind === "window" ? windowDividers(o) : [];
          const draggingOpening = openingDrag.current?.id === o.id && openingDrag.current.started;
          const sectionGesture = draggingOpening && openingDrag.current?.divider !== null;
          const readoutSections = sectionGesture ? sections : null;
          const readoutWidth = readoutSections ? (readoutSections.length+1)*74+8 : 72;
          const resizeCursor = openingResizeCursor(w.b.x-w.a.x,w.b.y-w.a.y);
          const labelRotation = readablePlanAngle(angle)-angle;
          return (
            <g
              key={o.id}
              data-opening={o.id}
              data-testid={o.kind}
              data-sections={sections?.length}
              data-width={o.width}
              data-offset={o.offset}
              className={editable ? "opening-shape" : undefined}
              transform={`translate(${p.x},${p.y}) rotate(${angle})`}
            >
              <rect
                x="0"
                y={-w.thickness / 2 - 0.02}
                width={o.width}
                height={w.thickness + 0.04}
                fill={active ? "#bfd0e5" : "#eef1f4"}
                stroke={active ? "#405e82" : "none"}
                strokeWidth={2 * unit}
              />
              {o.kind === "window" ? (
                <g stroke="#627c9b" strokeWidth={1.4 * unit}>
                  <rect
                    x=".02"
                    y={-w.thickness / 2}
                    width={o.width - 0.04}
                    height={w.thickness}
                    fill="#dedede"
                  />
                  <path d={`M.02 0H${o.width - 0.02}`} />
                  {dividers.map((x, i) => <line key={i} data-window-divider={i + 1}
                    x1={x} x2={x} y1={-w.thickness / 2} y2={w.thickness / 2} />)}
                  {windowVents.filter(v=>v.openingId===o.id).map(vent=>
                    <g key={vent.id} data-window-vent={vent.section+1} data-open={vent.open} data-mirrored={vent.mirrored}
                      transform={`translate(${vent.x},${vent.z}) scale(${vent.mirrored?-1:1},${vent.side})`} pointerEvents="none"
                      fill="none" stroke="#35689e">
                      {(active||vent.open)&&<path d={`M${vent.length} 0A${vent.length} ${vent.length} 0 0 1 0 ${vent.length}`}
                        strokeDasharray={`${3*unit} ${2*unit}`} />}
                      <path d={`M0 0${vent.open?"V":"H"}${vent.length}`} strokeWidth={2*unit} />
                    </g>
                  )}
                </g>
              ) : (
                <g data-door-swing={o.id} transform={`translate(${doorHingeOffset(o)-o.offset+o.width/2},0) scale(${o.doorMirrored?-1:1},${doorSwingDirection(o)})`}
                  stroke={active?"#405e82":DOOR_FINISHES.find(c=>c.id===doorFinish(o,project))!.color} strokeWidth={1.1 * unit} fill="none">
                  <path
                    d={`M0 0V${doorLeafLength(o)}A${doorLeafLength(o)} ${doorLeafLength(o)} 0 0 0 ${doorLeafLength(o)} 0`}
                    strokeDasharray={`${3 * unit} ${2 * unit}`}
                  />
                  <path d={`M0 0${doorOpen(o)?"V":"H"}${doorLeafLength(o)}`} strokeWidth={2.5 * unit} />
                </g>
              )}
              <rect
                x="0"
                y={-Math.max(w.thickness / 2, 8 * unit)}
                width={o.width}
                height={Math.max(w.thickness, 16 * unit)}
                fill="transparent"
              />
              {editable && sections && dividers.map((x,i) => <OpeningHandle key={`divider-${i}`} x={x} unit={unit}
                thickness={w.thickness} hitWidth={Math.min(12*unit,Math.min(sections[i],sections[i+1])*.7)}
                active={active} cursor={resizeCursor} divider={i} />)}
              {editable && (["start","end"] as const).map(edge => {
                const x = edge === "start" ? 0 : o.width;
                const adjacent = sections?.[edge === "start" ? 0 : sections.length-1] ?? o.width;
                const hitWidth = Math.min(12*unit,o.width/3,adjacent*.7);
                return <OpeningHandle key={edge} x={x} unit={unit} thickness={w.thickness}
                  hitWidth={hitWidth} active={active} cursor={resizeCursor} edge={edge} />;
              })}
              {active && <g pointerEvents="none"
                data-opening-readout={o.id} transform={`translate(${o.width/2},${w.thickness/2+18*unit}) rotate(${labelRotation})`}>
                <rect x={-readoutWidth/2*unit} y={-11*unit} width={readoutWidth*unit} height={22*unit} rx={4*unit} fill="#405e82" />
                <text className="opening-width-label" data-width={o.width}
                  x={-(readoutSections?.length ?? 0)*37*unit*(Math.abs(labelRotation)>90?-1:1)} y="0"
                  textAnchor="middle" dominantBaseline="central" fontSize={11*unit} fill="white">{format(o.width,3)} м</text>
                {readoutSections && <g data-opening-section-readout={o.id}>
                  <line x1={(1-readoutSections.length)*37*unit*(Math.abs(labelRotation)>90?-1:1)}
                    x2={(1-readoutSections.length)*37*unit*(Math.abs(labelRotation)>90?-1:1)} y1={-7*unit} y2={7*unit} stroke="#b2c6dd" strokeWidth={unit}/>
                  {readoutSections.map((width,i) => <text key={i} className="opening-section-width-label" data-section={i+1} data-width={width}
                    x={(i+1-readoutSections.length/2)*74*unit*(Math.abs(labelRotation)>90?-1:1)} y="0"
                    textAnchor="middle" dominantBaseline="central" fontSize={10*unit} fill="white">{i+1}: {format(width,3)} м</text>)}
                </g>}
              </g>}
            </g>
          );
        })}
        {dimensions &&
          shown.walls.map((w) => {
            if(junctions.some(junction=>junction.wall.id===w.id&&junction.side<0))return null;
            const dx = w.b.x - w.a.x,
              dy = w.b.y - w.a.y,
              axisLength = wallLength(w),
              body=bodies.get(w.id)!,len=wallMeasuredLength(w,shown.walls,outsideDimensions),
              nx = dy / axisLength,
              ny = -dx / axisLength;
            const off = w.thickness / 2 + 0.35,
              start=outsideDimensions?pointOnWall(w,body.outerStart):body.a,
              end=outsideDimensions?pointOnWall(w,body.outerEnd):body.b,
              a = { x: start.x + nx * off, y: start.y + ny * off },
              b = { x: end.x + nx * off, y: end.y + ny * off };
            const angle = readablePlanAngle((Math.atan2(dy, dx) * 180) / Math.PI);
            return (
              <g
                key={w.id}
                data-wall-dimension={w.id}
                pointerEvents="none"
                stroke="#9a9fa6"
                strokeWidth={0.8 * unit}
              >
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {[start,end].map((p, i) => (
                  <line
                    key={i}
                    x1={p.x + nx * (off - 0.1)}
                    y1={p.y + ny * (off - 0.1)}
                    x2={p.x + nx * (off + 0.1)}
                    y2={p.y + ny * (off + 0.1)}
                  />
                ))}
                <g
                  transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2}) rotate(${angle})`}
                >
                  <rect
                    x={-25 * unit}
                    y={-8 * unit}
                    width={50 * unit}
                    height={16 * unit}
                    rx={3 * unit}
                    fill="#eef1f4"
                    stroke="none"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#717982"
                    stroke="none"
                    fontSize={10 * unit}
                    fontFamily="inherit"
                  >
                    {format(len,3)} м
                  </text>
                </g>
              </g>
            );
          })}
        {selectedOpening&&tool!=="wall"&&<OpeningClearanceDimensions project={shown} opening={selectedOpening} unit={unit}/>}
        {selectedWall &&
          tool === "select" &&
          (["a", "b"] as const).map((endpoint) => {
            const p=wallHandlePoint(bodies.get(selectedWall.id)!,endpoint,unit);
            return (
            <circle
              key={endpoint}
              data-wall={selectedWall.id}
              data-endpoint={endpoint}
              cx={p.x}
              cy={p.y}
              r={5 * unit}
              fill="#f4f7fb"
              stroke="#325075"
              strokeWidth={2 * unit}
              className="endpoint"
            />
          );})}
        {drawingBody && (
          <g pointerEvents="none" data-testid="wall-preview" data-length={drawingBody.length}>
            <polygon
              points={drawingBody.polygon.map(p=>`${p.x},${p.y}`).join(" ")}
              fill="#507098"
              opacity=".45"
            />
            <line
              x1={drawingBody.a.x}
              y1={drawingBody.a.y}
              x2={drawingBody.b.x}
              y2={drawingBody.b.y}
              stroke="#3e5a7c"
              strokeWidth={1.5 * unit}
              strokeDasharray={`${5 * unit} ${4 * unit}`}
            />
            <circle cx={drawingBody.a.x} cy={drawingBody.a.y} r={4 * unit} fill="#3e5a7c" />
            {drawingLength > 0.15 && (
              <g
                transform={`translate(${(drawingBody.a.x + drawingBody.b.x) / 2},${(drawingBody.a.y + drawingBody.b.y) / 2 - 0.3})`}
              >
                <rect
                  x={-35 * unit}
                  y={-11 * unit}
                  width={70 * unit}
                  height={22 * unit}
                  rx={7 * unit}
                  fill="#2d3e53"
                />
                <text
                  fontSize={11 * unit}
                  fill="white"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {format(drawingLength,3)} м
                </text>
              </g>
            )}
          </g>
        )}
        {junctions.map(junction=><WallJunctionDimensions key={junction.wall.id} junction={junction} unit={unit} />)}
        {tool !== "select" && tool !== "hand" && cursorPoint && (
          <g pointerEvents="none" stroke="#567295" strokeWidth={unit}>
            <path
              d={`M${cursorPoint.x - 9 * unit} ${cursorPoint.y}h${18 * unit}M${cursorPoint.x} ${cursorPoint.y - 9 * unit}v${18 * unit}`}
            />
            <circle cx={cursorPoint.x} cy={cursorPoint.y} r={3 * unit} fill="#eef1f4" />
          </g>
        )}
      </svg>
      {lengthEntry!==null&&<form className="wall-length-entry" onSubmit={commitLength}>
        <label>
          Наружная длина новой стены
          <input autoFocus onFocus={e=>e.currentTarget.select()} inputMode="decimal" value={lengthEntry}
            onChange={e=>setLengthEntry(e.currentTarget.value)}
            onKeyDown={e=>{
              if(e.key==="Escape"){e.stopPropagation();setLengthEntry(null);svg.current?.focus();}
            }} />
        </label>
        <span>м</span>
        <button type="submit">Построить</button>
      </form>}
      <div className="canvas-zoom">
        <button
          title="Уменьшить"
          aria-label="Уменьшить"
          onClick={() => zoom(1 / 1.2)}
        >
          <Icon name="minus" size={16} />
        </button>
        <span>{Math.round((view.scale / 64) * 100)}%</span>
        <button
          title="Увеличить"
          aria-label="Увеличить"
          onClick={() => zoom(1.2)}
        >
          <Icon name="plus" size={16} />
        </button>
        <i />
        <button
          title="Показать весь план"
          aria-label="Показать весь план"
          onClick={fit}
        >
          <Icon name="fit" size={16} />
        </button>
      </div>
      <div className="scale-marker">
        <span style={{ width: view.scale }} />1 м
      </div>
      {!project.walls.length && (
        <div className="empty-plan">
          <Icon name="wall" size={36} />
          <h2>Здесь начнётся ваш дом</h2>
          <p>
            Выберите «Стена» и отметьте две точки на плане.
            <br />
            Замкните контур — внутри появится пол.
          </p>
        </div>
      )}
    </div>
  );
}
