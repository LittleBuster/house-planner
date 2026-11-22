import type { Point } from "./model";
import { RAL_GREYS } from "./ralColors";

export const FENCE_LENGTH = 2.5;
export const FENCE_HEIGHT = 1.8;
export const FENCE_POST = .065;
export const FENCE_MIN_LENGTH = .12;
export const FENCE_HALF_DEPTH = .055;
export const FENCE_LIMIT = 400;
export const FENCE_POST_SNAP = .42;
export const FENCE_TYPES = [
  {id:"mesh",name:"Сварная 3D-сетка"},
  {id:"picket",name:"Металлоштакетник"},
] as const;
export const FENCE_COLORS = [
  {id:"green",name:"Зелёный",color:"#286047"},
  {id:"ral7024",name:"RAL 7024",color:RAL_GREYS.ral7024},
  {id:"brown",name:"Коричневый",color:"#654739"},
  {id:"zinc",name:"Оцинкованный",color:"#a9afb0"},
] as const;
export type FenceKind = typeof FENCE_TYPES[number]["id"];
export type FenceColor = typeof FENCE_COLORS[number]["id"];
export type FenceStyle = {kind:FenceKind;color:FenceColor};
export type FenceSpan = {a:Point;b:Point};
export type Fence = FenceSpan & FenceStyle & {id:string;flipped?:boolean};
export const fenceLength = ({a,b}: FenceSpan) => Math.hypot(b.x-a.x,b.y-a.y);
export const fenceAxis = ({a,b}: FenceSpan): Point => {
  const length=fenceLength({a,b});
  return {x:(b.x-a.x)/length,y:(b.y-a.y)/length};
};
export const fencePostKey = (point: Point) => Math.round(point.x*1e6)+":"+Math.round(point.y*1e6);

export function fenceFootprint(fence: Fence) {
  const axis=fenceAxis(fence), back=(FENCE_POST+.004)/2;
  const front=fence.kind==="mesh" ? FENCE_HALF_DEPTH : back;
  const offset=(front-back)/2*(fence.flipped ? -1 : 1);
  return {
    center:{x:(fence.a.x+fence.b.x)/2-axis.y*offset,y:(fence.a.y+fence.b.y)/2+axis.x*offset},
    axis,halfLength:fenceLength(fence)/2+back,halfDepth:(front+back)/2,
  };
}
