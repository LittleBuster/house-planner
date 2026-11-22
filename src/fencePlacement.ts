import { FENCE_LENGTH, FENCE_LIMIT, FENCE_MIN_LENGTH, FENCE_POST_SNAP, fenceAxis, fenceLength, fencePostKey, type Fence, type FenceSpan } from "./fenceSettings";
import { distance, type Point, type Project } from "./model";
import { fenceBlocksGate, gatePlacementError, gateUsesFence, visibleFencePieces } from "./gatePlacement";
import { fenceInteriorSide } from "./gateSettings";
import { foundationContains, foundationPaths } from "./plinthGeometry";
import { polygonRayInterval, wallBodies } from "./wallBodies";

const EPS = 1e-6;
const sub = (a:Point,b:Point): Point => ({x:a.x-b.x,y:a.y-b.y});
const dot = (a:Point,b:Point) => a.x*b.x+a.y*b.y;
const cross = (a:Point,b:Point) => a.x*b.y-a.y*b.x;
const along = (a:Point,delta:Point,t:number): Point => ({x:a.x+delta.x*t,y:a.y+delta.y*t});
export type FenceStart = {point: Point; neighbor?: Fence};

function snapToPost(fences: readonly Fence[], pointer: Point): FenceStart {
  let nearest: FenceStart = {point:pointer}, best=FENCE_POST_SNAP;
  for (const fence of fences) for (const point of [fence.a,fence.b]) {
    const gap=distance(point,pointer);
    if (gap<best) {nearest={point,neighbor:fence};best=gap;}
  }
  return nearest;
}

export function snapFenceStart(fences: readonly Fence[], pointer: Point): FenceStart {
  const post=snapToPost(fences,pointer);
  if (post.neighbor) return post;
  let nearest=pointer, best=FENCE_POST_SNAP;
  for (const fence of fences) {
    const axis=fenceAxis(fence), offset=dot(sub(pointer,fence.a),axis);
    if (offset<FENCE_MIN_LENGTH || fenceLength(fence)-offset<FENCE_MIN_LENGTH) continue;
    const foot=along(fence.a,axis,offset), gap=distance(foot,pointer);
    if (gap<best) {nearest=foot;best=gap;}
  }
  return {point:nearest};
}

export function fencePlacement(start: FenceStart, pointer: Point, turn: boolean, fences: readonly Fence[]): FenceSpan | null {
  const a=start.point, delta=sub(pointer,a);
  const neighbor=start.neighbor;
  let angle=Math.atan2(delta.y,delta.x);
  if (neighbor) {
    const other=distance(neighbor.a,a)<EPS ? neighbor.b : neighbor.a;
    const away=sub(a,other), straight=Math.atan2(away.y,away.x);
    const increment=Math.PI/12;
    angle=turn && Math.hypot(delta.x,delta.y)>.03
      ? straight+Math.round((angle-straight)/increment)*increment
      : straight;
  } else {
    if (Math.hypot(delta.x,delta.y)<.03) return null;
    const cardinal=Math.round(angle/(Math.PI/2))*Math.PI/2;
    if (Math.abs(angle-cardinal)<Math.PI/36) angle=cardinal;
  }
  const b={x:a.x+FENCE_LENGTH*Math.cos(angle),y:a.y+FENCE_LENGTH*Math.sin(angle)};
  // Joining an existing end must preserve the length and a locked straight run.
  const end=snapToPost(fences,b);
  if (end.neighbor && (neighbor && !turn ? distance(b,end.point) : Math.abs(distance(a,end.point)-FENCE_LENGTH))<EPS)
    return {a,b:end.point};
  return {a,b};
}

type Cut = {point:Point; offset:number};

function intersection(span: FenceSpan, other: FenceSpan): {point:Point; t:number; s:number} | "overlap" | null {
  const u=sub(span.b,span.a), v=sub(other.b,other.a), offset=sub(other.a,span.a);
  const den=cross(u,v);
  if (Math.abs(den)<EPS) {
    if (Math.abs(cross(offset,u))>EPS) return null;
    const first=dot(offset,u)/dot(u,u), last=dot(sub(other.b,span.a),u)/dot(u,u);
    return Math.min(1,Math.max(first,last))-Math.max(0,Math.min(first,last))>EPS ? "overlap" : null;
  }
  const t=cross(offset,v)/den, s=cross(offset,u)/den;
  if (t< -EPS||t>1+EPS||s< -EPS||s>1+EPS) return null;
  const end=(ratio:number)=>ratio<EPS?0:ratio>1-EPS?1:ratio;
  const at=end(t), host=end(s);
  const point=host===0?other.a:host===1?other.b:at===0?span.a:at===1?span.b:along(span.a,u,t);
  return {point,t:at,s:host};
}

function siteError(project: Project, span: FenceSpan) {
  if ([span.a,span.b].some(p=>Math.abs(p.x)>500||Math.abs(p.y)>500)) return "Секция выходит за границы участка.";
  const foundations=foundationPaths(project);
  if ([span.a,span.b].some(point=>foundationContains(foundations,point))) return "Выберите место за пределами дома.";
  const axis=fenceAxis(span), length=fenceLength(span);
  for (const body of wallBodies(project.walls).values()) {
    const hit=polygonRayInterval(span.a,axis,body.polygon);
    if (hit && hit.far>=0 && hit.near<=length) return "Секция пересекает стену дома.";
  }
  return null;
}

function splitFence(fence: Fence, cuts: Cut[], nextId: () => string): Fence[] | null {
  if (!cuts.length) return [fence];
  const ordered=cuts.sort((a,b)=>a.offset-b.offset);
  const points=[ordered.find(cut=>cut.offset===0)?.point ?? fence.a];
  for (const cut of ordered) {
    if (cut.offset>0 && cut.offset<1 && distance(points[points.length-1],cut.point)>EPS) points.push(cut.point);
  }
  points.push(ordered.find(cut=>cut.offset===1)?.point ?? fence.b);
  const parts: Fence[]=[];
  for (let i=1;i<points.length;i++) {
    if (distance(points[i-1],points[i])<FENCE_MIN_LENGTH-EPS) return null;
    parts.push({...fence,a:points[i-1],b:points[i],id:i===1 ? fence.id : nextId()});
  }
  return parts;
}

export type FenceEdit = {error:string} | {fences:Fence[]; end:Fence; joints:Point[]};

export function joinFence(project: Project, fence: Fence, nextId: () => string): FenceEdit {
  const original=project.fences?.find(item=>item.id===fence.id);
  if (original && gateUsesFence(project,original)) return {error:"Сначала уберите ворота из этой секции."};
  if (fenceBlocksGate(project,fence)) return {error:"Секция попадает в проём ворот."};
  const error=siteError(project,fence);
  if (error) return {error};
  const existing=project.fences ?? [], updated:Fence[]=[];
  const cuts: Cut[]=[];
  const joints=new Map<string,Point>();
  const nearEnd="Стык слишком близко к столбу. Совместите столбы или сдвиньте секцию дальше.";
  for (const other of existing) {
    if (other.id===fence.id) continue;
    const hit=intersection(fence,other);
    if (hit==="overlap") return {error:"Секции накладываются вдоль одной линии."};
    if (!hit) {
      if ([fence.a,fence.b].some(a=>[other.a,other.b].some(b=>{
        const gap=distance(a,b);
        return gap>EPS && gap<FENCE_MIN_LENGTH;
      }))) return {error:nearEnd};
      updated.push(other);
      continue;
    }
    cuts.push({point:hit.point,offset:hit.t});
    joints.set(fencePostKey(hit.point),hit.point);
    const parts=splitFence(other,[{point:hit.point,offset:hit.s}],nextId);
    if (!parts) return {error:nearEnd};
    updated.push(...parts);
  }
  const incoming=splitFence(fence,cuts,nextId);
  if (!incoming) return {error:nearEnd};
  if (updated.length+incoming.length>FENCE_LIMIT) return {error:"На участке можно установить до "+FENCE_LIMIT+" секций."};
  const fences=[...updated,...incoming];
  for (const gate of project.gates ?? []) {
    const error=gatePlacementError({...project,fences},gate);
    if (error) return {error};
  }
  return {fences,end:incoming[incoming.length-1],joints:[...joints.values()]};
}

export function previewFenceEdit(project: Project, fence: Fence): FenceEdit {
  let id=0;
  return joinFence(project,fence,()=>fence.id+"-preview-"+(++id));
}

export function moveFence(project: Project, original: Fence, delta: Point) {
  const translate=(span: Fence, by: Point): Fence => ({
    ...span,a:along(span.a,by,1),b:along(span.b,by,1),
  });
  const draft=translate(original,delta);
  const others=visibleFencePieces(project).filter(fence=>fence.id!==original.id);
  const snaps=(["a","b"] as const).map(end=>{
    const point=snapFenceStart(others,draft[end]).point;
    return {end,point,gap:distance(point,draft[end])};
  }).filter(snap=>snap.gap>EPS).sort((a,b)=>a.gap-b.gap);
  for (const {end,point} of snaps) {
    const fence={...translate(draft,sub(point,draft[end])),[end]:point};
    const edit=previewFenceEdit(project,fence);
    if (!("error" in edit)) return {fence,edit};
  }
  return {fence:draft,edit:previewFenceEdit(project,draft)};
}

export function inwardFenceFlip(project: Project, fence: Fence): boolean {
  return (fenceInteriorSide(project,fence)===1)!==(fence.kind==="mesh");
}
