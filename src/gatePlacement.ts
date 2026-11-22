import { FENCE_POST, fenceAxis, fenceLength, type Fence, type FenceSpan } from "./fenceSettings";
import { GATE_LIMIT, GATE_MAX_WIDTH, GATE_MIN_WIDTH, GATE_POST, WICKET_MAX_WIDTH, WICKET_MIN_WIDTH, gateWidth, type Gate } from "./gateSettings";
import { distance, type Point, type Project } from "./model";
import type { TreeClearance } from "./treeClearances";

const EPS = 1e-6;
const pointAt = (span:FenceSpan,axis:Point,offset:number):Point => ({
  x:span.a.x+axis.x*offset,y:span.a.y+axis.y*offset,
});
const offsetOn = (span:FenceSpan,axis:Point,point:Point) => (point.x-span.a.x)*axis.x+(point.y-span.a.y)*axis.y;
const offAxis = (span:FenceSpan,axis:Point,point:Point) => (point.y-span.a.y)*axis.x-(point.x-span.a.x)*axis.y;

type Interval = [number,number];
function alignedInterval(span:FenceSpan, other:FenceSpan, axis=fenceAxis(span)): Interval | null {
  if (Math.abs(offAxis(span,axis,other.a))>EPS || Math.abs(offAxis(span,axis,other.b))>EPS) return null;
  const a=offsetOn(span,axis,other.a), b=offsetOn(span,axis,other.b);
  return [Math.min(a,b),Math.max(a,b)];
}

function coversInterval(span:FenceSpan, other:FenceSpan) {
  const interval=alignedInterval(span,other);
  return !!interval && Math.min(fenceLength(span),interval[1])-Math.max(0,interval[0])>EPS;
}

export function gateUsesFence(project:Project, fence:FenceSpan) {
  return (project.gates ?? []).some(gate=>coversInterval(gate,fence));
}

export function replacesFencePost(project:Project, point:Point) {
  return (project.gates ?? []).some(gate=>[gate.a,gate.b].some(post=>distance(post,point)<(GATE_POST+FENCE_POST)/2+EPS));
}

function crossingOffset(opening:FenceSpan, other:FenceSpan) {
  const axis=fenceAxis(opening);
  const a=offAxis(opening,axis,other.a), b=offAxis(opening,axis,other.b);
  if (Math.abs(a-b)<=EPS || (a>EPS&&b>EPS) || (a< -EPS&&b< -EPS)) return null;
  const t=a/(a-b);
  return offsetOn(opening,axis,pointAt(other,fenceAxis(other),t*fenceLength(other)));
}

function crossesOpening(opening:FenceSpan, other:FenceSpan) {
  const x=crossingOffset(opening,other);
  return x!==null && x>EPS && x<fenceLength(opening)-EPS;
}

export function fenceBlocksGate(project:Project, span:FenceSpan) {
  return (project.gates ?? []).some(gate=>coversInterval(gate,span)||crossesOpening(gate,span));
}

function supportRun(project:Project, span:FenceSpan, kind?:Fence["kind"]): Interval | undefined {
  const axis=fenceAxis(span), ranges:Interval[]=[];
  for (const fence of project.fences ?? []) {
    if (kind && fence.kind!==kind) continue;
    const interval=alignedInterval(span,fence,axis);
    if (interval) ranges.push(interval);
  }
  const runs:Interval[]=[];
  for (const [start,end] of ranges.sort((a,b)=>a[0]-b[0])) {
    const last=runs[runs.length-1];
    if (last && start<=last[1]+EPS) last[1]=Math.max(last[1],end);
    else runs.push([start,end]);
  }
  return runs.find(([start,end])=>start<=EPS && end>=fenceLength(span)-EPS);
}

export function gatePlacementError(project:Project, gate:Gate): string | null {
  const width=gateWidth(gate);
  const min=gate.wicket ? WICKET_MIN_WIDTH : GATE_MIN_WIDTH, max=gate.wicket ? WICKET_MAX_WIDTH : GATE_MAX_WIDTH;
  if (width<min-EPS || width>max+EPS)
    return gate.wicket ? "Ширина калитки должна быть от 0,8 до 1,5 м." : "Ширина проезда должна быть от 2 до 6 м.";
  const others=(project.gates ?? []).filter(other=>other.id!==gate.id);
  if (others.length>=GATE_LIMIT) return "Достигнут лимит ворот на участке.";
  if (!supportRun(project,gate,gate.kind)) return "Ворота должны помещаться в прямой участок забора этого типа.";
  if (others.some(other=>coversInterval(gate,other)||crossesOpening(gate,other)||crossesOpening(other,gate)))
    return "Проём пересекает другие ворота.";
  if ((project.fences ?? []).some(fence=>crossesOpening(gate,fence)))
    return "В проёме есть стык с другим забором.";
  if (others.some(other=>[gate.a,gate.b].some(post=>[other.a,other.b].some(point=>{
    const gap=distance(post,point);
    return gap>EPS && gap<GATE_POST;
  })))) return "Столбы соседних ворот стоят слишком близко.";
  return null;
}

export function positionGate(project:Project, reference:FenceSpan, pointer:Point, width:number, style:Omit<Gate,"a"|"b">) {
  const run=supportRun(project,reference,style.kind), axis=fenceAxis(reference), half=(width+GATE_POST)/2;
  if (!run || run[1]-run[0]<2*half-EPS) return {error:"Для этой ширины нужен более длинный прямой участок забора того же типа."};
  const at=offsetOn(reference,axis,pointer);
  const center=Math.max(run[0]+half,Math.min(run[1]-half,at));
  const gate={...style,a:pointAt(reference,axis,center-half),b:pointAt(reference,axis,center+half)};
  const error=gatePlacementError(project,gate);
  return error ? {error} : {gate};
}

export function measureGateEnds(project:Project, gate:Gate): TreeClearance[] {
  const run=supportRun(project,gate);
  if (!run) return [];
  const axis=fenceAxis(gate), length=fenceLength(gate);
  return [
    {direction:"до начала",start:gate.a,end:pointAt(gate,axis,run[0]),distance:Math.max(0,-run[0])},
    {direction:"до конца",start:gate.b,end:pointAt(gate,axis,run[1]),distance:Math.max(0,run[1]-length)},
  ];
}

export function slideGate(project:Project, gate:Gate, distanceAlong:number): Gate {
  const run=supportRun(project,gate,gate.kind);
  if (!run || Math.abs(distanceAlong)<EPS) return gate;
  const axis=fenceAxis(gate), length=fenceLength(gate);
  let min=Math.min(0,run[0]), max=Math.max(0,run[1]-length);
  const stopAt=(x:number)=>{
    if (x<=EPS) min=Math.max(min,Math.min(0,x));
    if (x>=length-EPS) max=Math.min(max,Math.max(0,x-length));
  };
  for (const fence of project.fences ?? []) {
    const x=crossingOffset(gate,fence);
    if (x!==null) stopAt(x);
  }
  for (const other of project.gates ?? []) {
    if (other.id===gate.id) continue;
    const interval=alignedInterval(gate,other,axis), crossing=crossingOffset(gate,other);
    if (interval) {stopAt(interval[0]);stopAt(interval[1]);}
    else if (crossing!==null) stopAt(crossing);
    for (const post of [other.a,other.b]) {
      const depth=offAxis(gate,axis,post);
      if (Math.abs(depth)>=GATE_POST) continue;
      const offset=offsetOn(gate,axis,post);
      const gap=Math.sqrt(GATE_POST**2-depth**2)+EPS;
      for (const edge of [0,length]) {
        const relative=offset-edge;
        if (relative<=-gap+EPS) min=Math.max(min,Math.min(0,relative+gap));
        if (relative>=gap-EPS) max=Math.min(max,Math.max(0,relative-gap));
      }
    }
  }
  const shift=Math.max(min,Math.min(max,distanceAlong));
  if (Math.abs(shift)<EPS) return gate;
  const draft={...gate,a:pointAt(gate,axis,shift),b:pointAt(gate,axis,length+shift)};
  return gatePlacementError(project,draft) ? gate : draft;
}

export function visibleFencePieces(project:Project): Fence[] {
  if (!project.gates?.length) return project.fences ?? [];
  return (project.fences ?? []).flatMap(fence=>{
    const axis=fenceAxis(fence), length=fenceLength(fence);
    const cuts=project.gates!.flatMap(gate=>{
      const range=alignedInterval(fence,gate,axis);
      if (!range) return [];
      const start=Math.max(0,range[0]), end=Math.min(length,range[1]);
      return end-start>EPS ? [{start,end}] : [];
    }).sort((a,b)=>a.start-b.start);
    if (!cuts.length) return [fence];
    const pieces:Fence[]=[];
    let start=0;
    for (const cut of cuts) {
      if (cut.start-start>EPS)
        pieces.push({...fence,a:pointAt(fence,axis,start),b:pointAt(fence,axis,cut.start)});
      start=Math.max(start,cut.end);
    }
    if (length-start>EPS) pieces.push({...fence,a:pointAt(fence,axis,start)});
    return pieces;
  });
}
