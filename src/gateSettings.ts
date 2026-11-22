import { bounds, type Point, type Project } from "./model";
import { fenceAxis, fenceLength, type FenceKind, type FenceSpan, type FenceStyle } from "./fenceSettings";

export const GATE_POST = .12;
export const GATE_BOTTOM = .07;
export const GATE_FRAME = .048;
export const GATE_DEPTH = .085;
export const GATE_MIN_WIDTH = 2;
export const GATE_MAX_WIDTH = 6;
export const GATE_DEFAULT_WIDTH = 3.5;
export const WICKET_MIN_WIDTH = .8;
export const WICKET_MAX_WIDTH = 1.5;
export const WICKET_DEFAULT_WIDTH = 1;
export const GATE_LIMIT = 100;

export type GateSwing = "in" | "out";
export type GateToolKind = FenceKind | "wicket";
export type Gate = FenceSpan & FenceStyle & {id:string; swing:GateSwing; flipped?:boolean; open?:boolean; wicket?:true; mirrored?:boolean};
export type GateAngles = ReadonlyMap<string,number>;
export type GateLeafIndex = 0 | 1;
export const GATE_LEAVES = [0,1] as const;
const WICKET_LEAVES = [0] as const;
export const gateLeafIndices = (gate: Gate) => gate.wicket ? WICKET_LEAVES : GATE_LEAVES;
export const gateWidth = (gate: FenceSpan) => fenceLength(gate)-GATE_POST;
export const gateLeafKey = (id:string, index:GateLeafIndex) => `gate-leaf-${index}-${id}`;

export function fenceInteriorSide(project: Project, span: FenceSpan): 1 | -1 {
  const site=bounds(project.walls), axis=fenceAxis(span);
  const x=(site.minX+site.maxX-span.a.x-span.b.x)/2;
  const y=(site.minY+site.maxY-span.a.y-span.b.y)/2;
  return !project.walls.length || axis.x*y-axis.y*x>=0 ? 1 : -1;
}

export function gateTarget(project: Project, gate: Gate) {
  return gate.open ? Math.PI/2*fenceInteriorSide(project,gate)*(gate.swing==="in"?1:-1) : 0;
}

export function gateLeafDimensions(gate: Gate, index: GateLeafIndex) {
  const sign=(index===0)!==!!gate.mirrored ? 1 : -1;
  const inset=GATE_POST/2+.023;
  const span=fenceLength(gate);
  const length=gate.wicket ? span-2*inset-.014 : span/2-inset-.014;
  return {sign,hingeX:sign===1?inset:span-inset,length};
}

export function gateLeafPose(gate: Gate, index: GateLeafIndex, angle: number) {
  const axis=fenceAxis(gate), {hingeX,length,sign}=gateLeafDimensions(gate,index);
  return {
    hinge:{x:gate.a.x+axis.x*hingeX,y:gate.a.y+axis.y*hingeX},
    direction:{
      x:axis.x*sign*Math.cos(angle)-axis.y*Math.sin(angle),
      y:axis.y*sign*Math.cos(angle)+axis.x*Math.sin(angle),
    },
    length,
  };
}

export function gateLeafCollider(gate: Gate, index: GateLeafIndex, angle: number) {
  const {hinge,direction,length}=gateLeafPose(gate,index,angle);
  return {
    gateId:gate.id, gateLeaf:true,
    center:{x:hinge.x+direction.x*length/2,y:hinge.y+direction.y*length/2},
    axis:direction,halfLength:length/2,halfDepth:GATE_DEPTH/2,
  };
}

export function gatePostColliders(gate: Gate) {
  const axis=fenceAxis(gate);
  return [gate.a,gate.b].map((center:Point)=>({
    center,axis,halfLength:GATE_POST/2,halfDepth:GATE_POST/2,gateId:gate.id,
  }));
}
